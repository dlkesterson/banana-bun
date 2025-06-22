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

    async addTaskEmbedding(task: TaskEmbedding) {
        try {
            // Generate embedding from task description and result
            const text = `${task.description}\n${task.type}\n${task.status}\n${JSON.stringify(task.result || '')}`;
            const embedding = await this.generateEmbedding(text);

            // Add to ChromaDB (v2 API)
            await this.collection.add({
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

            await logger.info('Added task embedding', { taskId: task.taskId });
        } catch (error) {
            await logger.error('Failed to add task embedding', {
                taskId: task.taskId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async findSimilarTasks(query: string, limit: number = 5): Promise<TaskEmbedding[]> {
        try {
            // Generate embedding for query
            const queryEmbedding = await this.generateEmbedding(query);

            // Search in ChromaDB (v2 API)
            const results = await this.collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: limit
            });

            // Convert results to TaskEmbedding objects with type safety
            return (results.metadatas?.[0] || []).map((metadata: any, i: number) => ({
                id: results.ids?.[0]?.[i] || `task-${i}`,
                taskId: metadata.taskId,
                description: metadata.description || '',
                type: metadata.type || '',
                status: metadata.status || '',
                result: metadata.result ? JSON.parse(metadata.result) : {},
                metadata: metadata
            }));
        } catch (error) {
            await logger.error('Failed to find similar tasks', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
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

    async deleteTaskEmbedding(taskId: string) {
        try {
            await this.collection.delete({
                ids: [taskId]
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
}

// Export singleton instance
export const embeddingManager = new EmbeddingManager(); 