import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import type { TaskEmbedding } from '../src/types';
import { standardMockConfig } from './utils/standard-mock-config';

describe('Embeddings Manager', () => {
    let embeddingManager: any;
    let mockCollection: any;
    let mockChromaClient: any;
    let mockLogger: any;
    let mockConfig: any;
    let mockToolRunner: any;

    beforeEach(async () => {
        // Create fresh mocks for each test
        mockCollection = {
            add: mock(() => Promise.resolve()),
            query: mock(() => Promise.resolve({
                ids: [['1', '2']],
                distances: [[0.1, 0.3]],
                metadatas: [[
                    { task_id: 1, task_type: 'shell', success: true, description: 'Test task 1' },
                    { task_id: 2, task_type: 'llm', success: false, description: 'Test task 2' }
                ]],
                documents: [['Test task 1', 'Test task 2']]
            })),
            delete: mock(() => Promise.resolve()),
            count: mock(() => Promise.resolve(5)),
            update: mock(() => Promise.resolve())
        };

        mockChromaClient = {
            createCollection: mock(() => Promise.resolve(mockCollection)),
            getCollection: mock(() => Promise.resolve(mockCollection)),
            getOrCreateCollection: mock(() => Promise.resolve(mockCollection)),
            deleteCollection: mock(() => Promise.resolve()),
            listCollections: mock(() => Promise.resolve([{ name: 'test_collection' }]))
        };

        mockLogger = {
            info: mock(() => Promise.resolve()),
            error: mock(() => Promise.resolve()),
            warn: mock(() => Promise.resolve()),
            debug: mock(() => Promise.resolve())
        };

        mockConfig = standardMockConfig;

        mockToolRunner = {
            executeTool: mock(() => Promise.resolve({
                response: JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5]) // Mock embedding vector
            }))
        };

        // Apply mocks before importing
        mock.module('chromadb', () => ({
            ChromaClient: mock(() => mockChromaClient)
        }));

        mock.module('@chroma-core/default-embed', () => ({
            DefaultEmbeddingFunction: mock(() => ({}))
        }));

        mock.module('../src/utils/logger', () => ({
            logger: mockLogger
        }));

        mock.module('../src/config', () => ({
            config: mockConfig
        }));

        mock.module('../src/tools/tool_runner', () => ({
            toolRunner: mockToolRunner
        }));

        // Import with cache busting to avoid conflicts
        const embeddingModule = await import('../src/memory/embeddings?t=' + Date.now());
        embeddingManager = embeddingModule.embeddingManager;
    });

    afterEach(async () => {
        try {
            if (embeddingManager && typeof embeddingManager.shutdown === 'function') {
                await embeddingManager.shutdown();
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Initialization', () => {
        it('should initialize successfully', async () => {
            await embeddingManager.initialize();

            expect(mockChromaClient.getOrCreateCollection).toHaveBeenCalledWith({
                name: 'task_embeddings',
                metadata: {
                    description: 'Task embeddings for similarity search'
                },
                embeddingFunction: expect.any(Object)
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Embedding manager initialized')
            );
        });

        it('should handle initialization errors', async () => {
            mockChromaClient.getOrCreateCollection.mockRejectedValueOnce(new Error('Connection failed'));

            await expect(embeddingManager.initialize()).rejects.toThrow('Connection failed');
        });
    });

    describe('Adding Task Embeddings', () => {
        beforeEach(async () => {
            await embeddingManager.initialize();
        });

        it('should add task embedding successfully', async () => {
            const taskId = 1;
            const description = 'Test task description';
            const metadata = {
                task_type: 'shell',
                success: true,
                execution_time: 1500
            };

            await embeddingManager.addTaskEmbedding(taskId, description, metadata);

            expect(mockCollection.add).toHaveBeenCalledWith({
                ids: [`task_${taskId}`],
                embeddings: [expect.any(Array)],
                metadatas: [expect.objectContaining({
                    task_id: taskId,
                    task_type: 'shell',
                    success: true,
                    execution_time: 1500
                })]
            });
        });

        it('should handle metadata serialization', async () => {
            const taskId = 2;
            const description = 'Complex task';
            const metadata = {
                task_type: 'code',
                success: false,
                error_details: { code: 'SYNTAX_ERROR', line: 42 },
                tags: ['python', 'script']
            };

            await embeddingManager.addTaskEmbedding(taskId, description, metadata);

            expect(mockCollection.add).toHaveBeenCalledWith({
                ids: [`task_${taskId}`],
                embeddings: [expect.any(Array)],
                metadatas: [expect.objectContaining({
                    task_id: taskId,
                    task_type: 'code',
                    success: false
                })]
            });
        });

        it('should handle embedding errors gracefully', async () => {
            mockCollection.add.mockRejectedValueOnce(new Error('Embedding failed'));

            await expect(embeddingManager.addTaskEmbedding(1, 'test', {})).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to add task embedding'),
                expect.any(Object)
            );
        });
    });

    describe('Finding Similar Tasks', () => {
        beforeEach(async () => {
            await embeddingManager.initialize();
        });

        it('should find similar tasks successfully', async () => {
            const query = 'Find similar shell commands';
            const limit = 5;

            const results = await embeddingManager.findSimilarTasks(query, limit);

            expect(results).toBeArray();
            expect(results.length).toBe(2);

            expect(results[0]).toMatchObject({
                id: '1',
                task_id: 1,
                description: 'Test task 1',
                similarity: expect.any(Number)
            });

            expect(mockCollection.query).toHaveBeenCalledWith({
                queryEmbeddings: [expect.any(Array)],
                nResults: limit
            });
        });

        it('should handle empty results', async () => {
            mockCollection.query.mockResolvedValueOnce({
                ids: [[]],
                distances: [[]],
                metadatas: [[]],
                documents: [[]]
            });

            const results = await embeddingManager.findSimilarTasks('no matches', 5);

            expect(results).toBeArray();
            expect(results.length).toBe(0);
        });

        it('should filter by task type', async () => {
            const query = 'shell command task';
            const limit = 3;
            const taskType = 'shell';

            await embeddingManager.findSimilarTasks(query, limit, taskType);

            expect(mockCollection.query).toHaveBeenCalledWith({
                queryEmbeddings: [expect.any(Array)],
                nResults: limit,
                where: { task_type: taskType }
            });
        });

        it('should calculate similarity scores correctly', async () => {
            const results = await embeddingManager.findSimilarTasks('test query', 5);

            results.forEach(result => {
                expect(result.similarity).toBeNumber();
                expect(result.similarity).toBeGreaterThanOrEqual(0);
                expect(result.similarity).toBeLessThanOrEqual(1);
            });
        });

        it('should handle query errors', async () => {
            mockCollection.query.mockRejectedValueOnce(new Error('Query failed'));

            await expect(embeddingManager.findSimilarTasks('test', 5)).rejects.toThrow();
        });
    });

    describe('Task Embedding Management', () => {
        beforeEach(async () => {
            await embeddingManager.initialize();
        });

        it('should delete task embedding', async () => {
            const taskId = 1;

            await embeddingManager.deleteTaskEmbedding(taskId);

            expect(mockCollection.delete).toHaveBeenCalledWith({
                ids: [`task_${taskId}`]
            });
        });

        it('should get collection statistics', async () => {
            const stats = await embeddingManager.getCollectionStats();

            expect(stats).toMatchObject({
                total_embeddings: expect.any(Number),
                collection_name: 'task_embeddings'
            });

            expect(mockCollection.count).toHaveBeenCalled();
        });

        it('should clear all embeddings', async () => {
            await embeddingManager.clearAllEmbeddings();

            expect(mockChromaClient.deleteCollection).toHaveBeenCalledWith({
                name: 'task_embeddings'
            });
            expect(mockChromaClient.createCollection).toHaveBeenCalledWith({
                name: 'task_embeddings',
                embeddingFunction: expect.any(Object)
            });
        });
    });

    describe('Shutdown', () => {
        it('should shutdown gracefully', async () => {
            await embeddingManager.initialize();
            await embeddingManager.shutdown();

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Embedding manager shutdown')
            );
        });

        it('should handle shutdown without initialization', async () => {
            // Should not throw
            await embeddingManager.shutdown();
        });
    });

    describe('Embedding Generation', () => {
        beforeEach(async () => {
            await embeddingManager.initialize();
        });

        it('should generate embeddings successfully', async () => {
            const text = 'Test embedding text';
            const embedding = await embeddingManager.generateEmbedding(text);

            expect(embedding).toBeArray();
            expect(embedding.length).toBeGreaterThan(0);
            expect(embedding.every(n => typeof n === 'number')).toBe(true);
            expect(mockToolRunner.executeTool).toHaveBeenCalledWith('ollama_chat', {
                model: 'qwen3:8b',
                prompt: text,
                system: 'You are an embedding model. Convert the input text into a vector representation.'
            });
        });

        it('should handle embedding generation errors', async () => {
            mockToolRunner.executeTool.mockRejectedValueOnce(new Error('Model unavailable'));

            await expect(embeddingManager.generateEmbedding('test')).rejects.toThrow('Model unavailable');
        });

        it('should handle invalid embedding responses', async () => {
            mockToolRunner.executeTool.mockResolvedValueOnce({
                response: 'invalid json'
            });

            await expect(embeddingManager.generateEmbedding('test')).rejects.toThrow('Failed to parse embedding');
        });

        it('should handle non-array embedding responses', async () => {
            mockToolRunner.executeTool.mockResolvedValueOnce({
                response: JSON.stringify({ not: 'an array' })
            });

            await expect(embeddingManager.generateEmbedding('test')).rejects.toThrow('Invalid embedding format');
        });
    });

    describe('Error Handling', () => {
        it('should handle network connectivity issues', async () => {
            // Reset the mock to allow initialization
            mockChromaClient.getOrCreateCollection.mockResolvedValueOnce(mockCollection);
            await embeddingManager.initialize();

            mockCollection.query.mockRejectedValueOnce(new Error('Network error'));

            await expect(embeddingManager.findSimilarTasks('test', 5)).rejects.toThrow('Network error');
        });

        it('should handle malformed responses', async () => {
            // Reset the mock to allow initialization
            mockChromaClient.getOrCreateCollection.mockResolvedValueOnce(mockCollection);
            await embeddingManager.initialize();

            mockCollection.query.mockResolvedValueOnce({
                // Malformed response missing required fields
                ids: [['1']],
                distances: [[]], // Missing distance
                metadatas: [[]],
                documents: [[]]
            });

            const results = await embeddingManager.findSimilarTasks('test', 5);
            expect(results).toBeArray();
            expect(results.length).toBe(0);
        });
    });
});

afterAll(() => {
    // Restore all mocks after all tests in this file complete
    mock.restore();
});
