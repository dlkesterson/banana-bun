import { ChromaClient } from 'chromadb';
import type { Collection } from 'chromadb';
import { config } from '../config';
import { logger } from '../utils/logger';
import { toolRunner } from '../tools/tool_runner';
import type { TaskEmbedding } from '../types';
import { DefaultEmbeddingFunction } from '@chroma-core/default-embed';

export class EmbeddingManager {
    private client: ChromaClient;
    private collection!: Collection;
    private readonly COLLECTION_NAME = 'task_embeddings';
    private readonly EMBEDDING_MODEL = 'qwen3:8b';

    constructor() {
        this.client = new ChromaClient({
            host: config.paths.chroma.host,
            port: config.paths.chroma.port,
            ssl: config.paths.chroma.ssl
        });
    }

    async initialize() {
        try {
            // Create or get collection (v2 API)
            this.collection = await this.client.getOrCreateCollection({
                name: this.COLLECTION_NAME,
                metadata: {
                    description: 'Task embeddings for similarity search'
                },
                embeddingFunction: new DefaultEmbeddingFunction(),
            });

            await logger.info('Embedding manager initialized');
        } catch (error) {
            await logger.error('Failed to initialize embedding manager', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async generateEmbedding(text: string): Promise<number[]> {
        const result = await toolRunner.executeTool('ollama_chat', {
            model: this.EMBEDDING_MODEL,
            prompt: text,
            system: 'You are an embedding model. Convert the input text into a vector representation.'
        });

        // Parse the embedding from the response
        try {
            return JSON.parse(result.response);
        } catch {
            throw new Error('Failed to parse embedding from model response');
        }
    }

    async updateTaskEmbedding(task: TaskEmbedding) {
        try {
            // Generate new embedding
            const text = `${task.description}\n${task.type}\n${task.status}\n${JSON.stringify(task.result || '')}`;
            const embedding = await this.generateEmbedding(text);

            // Update in ChromaDB (v2 API)
            await this.collection.update({
                ids: [task.id],
                embeddings: [embedding],
                metadatas: [{
                    taskId: task.taskId,
                    description: task.description,
                    type: task.type,
                    status: task.status,
                    result: JSON.stringify(task.result || {}),
                    ...task.metadata
                }]
            });

            await logger.info('Updated task embedding', { taskId: task.taskId });
        } catch (error) {
            await logger.error('Failed to update task embedding', {
                taskId: task.taskId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    // Overloaded method to support both signatures
    async addTaskEmbedding(taskOrId: TaskEmbedding | number | string, description?: string, metadata?: Record<string, any>) {
        let task: TaskEmbedding;

        if (typeof taskOrId === 'object') {
            // New signature: addTaskEmbedding(task: TaskEmbedding)
            task = taskOrId;
        } else {
            // Legacy signature: addTaskEmbedding(taskId, description, metadata)
            task = {
                id: `task_${taskOrId}`,
                taskId: taskOrId,
                description: description || '',
                type: metadata?.task_type || 'unknown',
                status: metadata?.success ? 'completed' : 'pending',
                result: metadata,
                metadata: metadata || {}
            };
        }

        try {
            // Generate embedding from task description and result
            const text = `${task.description}\n${task.type}\n${task.status}\n${JSON.stringify(task.result || '')}`;
            const embedding = await this.generateEmbedding(text);

            // Add to ChromaDB (v2 API)
            await this.collection.add({
                ids: [task.id],
                embeddings: [embedding],
                metadatas: [{
                    task_id: task.taskId,
                    taskId: task.taskId,
                    description: task.description,
                    task_type: task.type,
                    type: task.type,
                    status: task.status,
                    success: task.status === 'completed',
                    result: JSON.stringify(task.result || {}),
                    execution_time: task.metadata?.execution_time,
                    ...task.metadata
                }]
            });

            await logger.info('Added task embedding', { taskId: task.taskId });
        } catch (error) {
            await logger.error('Failed to add task embedding', {
                taskId: task.taskId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async findSimilarTasks(query: string, limit: number = 5, taskType?: string): Promise<TaskEmbedding[]> {
        try {
            // Generate embedding for query
            const queryEmbedding = await this.generateEmbedding(query);

            // Build query options
            const queryOptions: any = {
                queryEmbeddings: [queryEmbedding],
                nResults: limit
            };

            // Add task type filter if specified
            if (taskType) {
                queryOptions.where = { task_type: taskType };
            }

            // Search in ChromaDB (v2 API)
            const results = await this.collection.query(queryOptions);

            // Convert results to TaskEmbedding objects with type safety
            return (results.metadatas?.[0] || []).map((metadata: any, i: number) => ({
                id: results.ids?.[0]?.[i] || `task-${i}`,
                task_id: metadata.task_id,
                taskId: metadata.taskId || metadata.task_id,
                description: metadata.description || results.documents?.[0]?.[i] || '',
                type: metadata.type || metadata.task_type || '',
                status: metadata.status || '',
                result: metadata.result ? JSON.parse(metadata.result) : {},
                similarity: results.distances?.[0]?.[i] ? 1 - results.distances[0][i] : 0,
                metadata: metadata
            }));
        } catch (error) {
            await logger.error('Failed to find similar tasks', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async deleteTaskEmbedding(taskId: string | number) {
        try {
            const id = typeof taskId === 'string' ? taskId : `task_${taskId}`;
            await this.collection.delete({
                ids: [id]
            });

            await logger.info('Deleted task embedding', { taskId });
        } catch (error) {
            await logger.error('Failed to delete task embedding', {
                taskId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getCollectionStats() {
        try {
            const count = await this.collection.count();
            return {
                total_embeddings: count,
                collection_name: this.COLLECTION_NAME
            };
        } catch (error) {
            await logger.error('Failed to get collection stats', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async clearAllEmbeddings() {
        try {
            // Delete the collection
            await this.client.deleteCollection({
                name: this.COLLECTION_NAME
            });

            // Recreate the collection
            this.collection = await this.client.createCollection({
                name: this.COLLECTION_NAME,
                embeddingFunction: new DefaultEmbeddingFunction()
            });

            await logger.info('Cleared all embeddings');
        } catch (error) {
            await logger.error('Failed to clear all embeddings', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async shutdown() {
        try {
            // ChromaDB client doesn't need explicit shutdown, but we can log it
            await logger.info('Embedding manager shutdown');
        } catch (error) {
            await logger.error('Failed to shutdown embedding manager', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}

// Export singleton instance
export const embeddingManager = new EmbeddingManager();