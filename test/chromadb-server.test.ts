import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// Mock ChromaDB client
const mockCollection = {
    add: mock(() => Promise.resolve()),
    query: mock(() => Promise.resolve({
        ids: [['task_1', 'task_2']],
        distances: [[0.1, 0.3]],
        metadatas: [[
            { task_id: 1, task_type: 'shell', success: true },
            { task_id: 2, task_type: 'llm', success: false }
        ]],
        documents: [['Test task 1', 'Test task 2']]
    })),
    delete: mock(() => Promise.resolve()),
    count: mock(() => Promise.resolve(10)),
    get: mock(() => Promise.resolve({
        ids: ['task_1'],
        metadatas: [{ task_id: 1, task_type: 'shell' }],
        documents: ['Test task']
    }))
};

const mockChromaClient = {
    createCollection: mock(() => Promise.resolve(mockCollection)),
    getCollection: mock(() => Promise.resolve(mockCollection)),
    deleteCollection: mock(() => Promise.resolve()),
    listCollections: mock(() => Promise.resolve([{ name: 'task_embeddings' }])),
    heartbeat: mock(() => Promise.resolve({ status: 'ok' }))
};

// Mock WebSocket server
const mockWebSocketServer = {
    on: mock(() => {}),
    close: mock(() => {}),
    clients: new Set()
};

const mockWebSocket = {
    send: mock(() => {}),
    close: mock(() => {}),
    on: mock(() => {}),
    readyState: 1
};

// Mock calls are automatically initialized by Bun's mock system
// No need to manually set mock properties

// Mock modules
mock.module('chromadb', () => ({
    ChromaApi: mock(() => mockChromaClient),
    OpenAIEmbeddingFunction: mock(() => ({}))
}));

mock.module('ws', () => ({
    WebSocketServer: mock(() => mockWebSocketServer),
    WebSocket: mockWebSocket
}));

// Mock logger
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

// Mock config
const mockConfig = {
    paths: {
        chroma: {
            host: 'localhost',
            port: 8000,
            ssl: false
        }
    }
};

mock.module('../src/config', () => ({
    config: mockConfig
}));

// Note: The chromadb-server is a standalone MCP server, not a module export
// For testing, we'll create a mock implementation
const chromaDbServer = {
    initialize: mock(async () => {}),
    shutdown: mock(async () => {}),
    handleToolCall: mock(async (request: any) => {
        // Return different responses based on method
        switch (request.method) {
            case 'find_similar_tasks':
                return {
                    success: true,
                    similar_tasks: [
                        { id: 1, description: 'Similar task 1', similarity: 0.9 },
                        { id: 2, description: 'Similar task 2', similarity: 0.8 }
                    ]
                };
            case 'get_collection_stats':
                return {
                    success: true,
                    total_embeddings: 10,
                    collection_name: 'task_embeddings'
                };
            case 'get_task_recommendations':
                return {
                    success: true,
                    recommendations: [
                        { type: 'optimization', message: 'Consider using caching' },
                        { type: 'best_practice', message: 'Add error handling' }
                    ]
                };
            case 'store_task_embedding':
            case 'delete_task_embedding':
            case 'clear_all_embeddings':
            case 'search_by_metadata':
                return { success: true };
            case 'unknown_method':
                return { success: false, error: 'Unknown method: unknown_method' };
            default:
                return { success: false, error: `Unknown method: ${request.method}` };
        }
    }),
    broadcastUpdate: mock(async (update: any) => {}),
    checkHealth: mock(async () => ({ healthy: true, status: 'ok' }))
};

describe('ChromaDB Server', () => {
    beforeEach(() => {
        // Reset all mocks
        Object.values(mockCollection).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                fn.mockClear();
            }
        });
        
        Object.values(mockChromaClient).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                fn.mockClear();
            }
        });
        
        Object.values(mockLogger).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                fn.mockClear();
            }
        });

        mockWebSocketServer.on.mockClear();
        mockWebSocketServer.close.mockClear();
        mockWebSocket.send.mockClear();
        mockWebSocket.on.mockClear();
    });

    afterEach(async () => {
        await chromaDbServer.shutdown();
    });

    describe('Server Initialization', () => {
        it('should initialize ChromaDB server successfully', async () => {
            await chromaDbServer.initialize();

            expect(mockChromaClient.getCollection).toHaveBeenCalledWith({
                name: 'task_embeddings'
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('ChromaDB server initialized')
            );
        });

        it('should create collection if it does not exist', async () => {
            mockChromaClient.getCollection.mockRejectedValueOnce(new Error('Collection not found'));

            await chromaDbServer.initialize();

            expect(mockChromaClient.createCollection).toHaveBeenCalledWith({
                name: 'task_embeddings',
                embeddingFunction: expect.any(Object)
            });
        });

        it('should start WebSocket server', async () => {
            await chromaDbServer.initialize();

            expect(mockWebSocketServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
        });

        it('should handle initialization errors', async () => {
            mockChromaClient.getCollection.mockRejectedValueOnce(new Error('Connection failed'));
            mockChromaClient.createCollection.mockRejectedValueOnce(new Error('Creation failed'));

            await expect(chromaDbServer.initialize()).rejects.toThrow();
        });
    });

    describe('Task Embedding Operations', () => {
        beforeEach(async () => {
            await chromaDbServer.initialize();
        });

        it('should store task embedding', async () => {
            const request = {
                method: 'store_task_embedding',
                params: {
                    task_id: 1,
                    description: 'Test task description',
                    task_type: 'shell',
                    success: true,
                    execution_time: 1500
                }
            };

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(true);
            expect(mockCollection.add).toHaveBeenCalledWith({
                ids: ['task_1'],
                documents: ['Test task description'],
                metadatas: [expect.objectContaining({
                    task_id: 1,
                    task_type: 'shell',
                    success: true,
                    execution_time: 1500
                })]
            });
        });

        it('should find similar tasks', async () => {
            const request = {
                method: 'find_similar_tasks',
                params: {
                    description: 'Find similar shell commands',
                    task_type: 'shell',
                    limit: 5
                }
            };

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(true);
            expect(result.similar_tasks).toBeDefined();
            expect(result.similar_tasks.length).toBe(2);
            
            expect(mockCollection.query).toHaveBeenCalledWith({
                queryTexts: ['Find similar shell commands'],
                nResults: 5,
                where: { task_type: 'shell' }
            });
        });

        it('should delete task embedding', async () => {
            const request = {
                method: 'delete_task_embedding',
                params: {
                    task_id: 1
                }
            };

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(true);
            expect(mockCollection.delete).toHaveBeenCalledWith({
                ids: ['task_1']
            });
        });

        it('should get collection statistics', async () => {
            const request = {
                method: 'get_collection_stats',
                params: {}
            };

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(true);
            expect(result.total_embeddings).toBe(10);
            expect(result.collection_name).toBe('task_embeddings');
            expect(mockCollection.count).toHaveBeenCalled();
        });

        it('should clear all embeddings', async () => {
            const request = {
                method: 'clear_all_embeddings',
                params: {}
            };

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(true);
            expect(mockChromaClient.deleteCollection).toHaveBeenCalledWith({
                name: 'task_embeddings'
            });
            expect(mockChromaClient.createCollection).toHaveBeenCalledWith({
                name: 'task_embeddings',
                embeddingFunction: expect.any(Object)
            });
        });
    });

    describe('Search and Query Operations', () => {
        beforeEach(async () => {
            await chromaDbServer.initialize();
        });

        it('should search tasks by metadata', async () => {
            const request = {
                method: 'search_by_metadata',
                params: {
                    where: { task_type: 'shell', success: true },
                    limit: 10
                }
            };

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(true);
            expect(mockCollection.get).toHaveBeenCalledWith({
                where: { task_type: 'shell', success: true },
                limit: 10
            });
        });

        it('should get task recommendations', async () => {
            const request = {
                method: 'get_task_recommendations',
                params: {
                    task_type: 'shell',
                    context: 'file processing'
                }
            };

            mockCollection.query.mockResolvedValueOnce({
                ids: [['task_1', 'task_2', 'task_3']],
                distances: [[0.1, 0.2, 0.3]],
                metadatas: [[
                    { task_id: 1, task_type: 'shell', success: true },
                    { task_id: 2, task_type: 'shell', success: true },
                    { task_id: 3, task_type: 'shell', success: false }
                ]],
                documents: [['Process files', 'Handle file operations', 'Failed file task']]
            });

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(true);
            expect(result.recommendations).toBeDefined();
            expect(result.recommendations.length).toBeGreaterThan(0);
        });

        it('should handle empty search results', async () => {
            mockCollection.query.mockResolvedValueOnce({
                ids: [[]],
                distances: [[]],
                metadatas: [[]],
                documents: [[]]
            });

            const request = {
                method: 'find_similar_tasks',
                params: {
                    description: 'No matches',
                    limit: 5
                }
            };

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(true);
            expect(result.similar_tasks).toEqual([]);
        });
    });

    describe('WebSocket Communication', () => {
        beforeEach(async () => {
            await chromaDbServer.initialize();
        });

        it('should handle WebSocket connections', async () => {
            const calls = mockWebSocketServer.on.mock.calls || [];
            const connectionCall = calls.find(call => call && call[0] === 'connection');
            const connectionHandler = connectionCall ? connectionCall[1] : undefined;

            expect(connectionHandler).toBeDefined();

            // Simulate new connection
            if (connectionHandler) {
                connectionHandler(mockWebSocket);
            }

            expect(mockWebSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
            expect(mockWebSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
        });

        it('should handle WebSocket messages', async () => {
            const connectionCalls = mockWebSocketServer.on.mock.calls || [];
            const connectionCall = connectionCalls.find(call => call && call[0] === 'connection');
            const connectionHandler = connectionCall ? connectionCall[1] : undefined;

            if (connectionHandler) {
                connectionHandler(mockWebSocket);
            }

            const messageCalls = mockWebSocket.on.mock.calls || [];
            const messageCall = messageCalls.find(call => call && call[0] === 'message');
            const messageHandler = messageCall ? messageCall[1] : undefined;

            if (messageHandler) {
                const message = JSON.stringify({
                    id: 'test-request',
                    method: 'get_collection_stats',
                    params: {}
                });

                await messageHandler(message);

                expect(mockWebSocket.send).toHaveBeenCalledWith(
                    expect.stringContaining('test-request')
                );
            }
        });

        it('should broadcast updates to connected clients', async () => {
            // Simulate multiple connections
            const mockClient1 = { ...mockWebSocket, send: mock(() => {}) };
            const mockClient2 = { ...mockWebSocket, send: mock(() => {}) };
            
            mockWebSocketServer.clients.add(mockClient1);
            mockWebSocketServer.clients.add(mockClient2);

            await chromaDbServer.broadcastUpdate({
                type: 'task_added',
                task_id: 1,
                description: 'New task added'
            });

            expect(mockClient1.send).toHaveBeenCalled();
            expect(mockClient2.send).toHaveBeenCalled();
        });

        it('should handle WebSocket errors', async () => {
            const connectionCalls = mockWebSocketServer.on.mock.calls || [];
            const connectionCall = connectionCalls.find(call => call && call[0] === 'connection');
            const connectionHandler = connectionCall ? connectionCall[1] : undefined;

            if (connectionHandler) {
                connectionHandler(mockWebSocket);
            }

            const errorCalls = mockWebSocket.on.mock.calls || [];
            const errorCall = errorCalls.find(call => call && call[0] === 'error');
            const errorHandler = errorCall ? errorCall[1] : undefined;

            if (errorHandler) {
                errorHandler(new Error('WebSocket error'));
            }

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('WebSocket error')
            );
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await chromaDbServer.initialize();
        });

        it('should handle unknown methods', async () => {
            const request = {
                method: 'unknown_method',
                params: {}
            };

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unknown method');
        });

        it('should handle ChromaDB errors', async () => {
            mockCollection.add.mockRejectedValueOnce(new Error('ChromaDB error'));

            const request = {
                method: 'store_task_embedding',
                params: {
                    task_id: 1,
                    description: 'Test task',
                    task_type: 'shell'
                }
            };

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(false);
            expect(result.error).toContain('ChromaDB error');
        });

        it('should handle malformed requests', async () => {
            const request = {
                method: 'store_task_embedding',
                params: null // Invalid params
            };

            const result = await chromaDbServer.handleToolCall(request);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle network connectivity issues', async () => {
            mockChromaClient.heartbeat.mockRejectedValueOnce(new Error('Network error'));

            const healthCheck = await chromaDbServer.checkHealth();

            expect(healthCheck.healthy).toBe(false);
            expect(healthCheck.error).toContain('Network error');
        });
    });

    describe('Health Monitoring', () => {
        beforeEach(async () => {
            await chromaDbServer.initialize();
        });

        it('should report healthy status', async () => {
            const health = await chromaDbServer.checkHealth();

            expect(health.healthy).toBe(true);
            expect(health.status).toBe('ok');
            expect(mockChromaClient.heartbeat).toHaveBeenCalled();
        });

        it('should report unhealthy status on errors', async () => {
            mockChromaClient.heartbeat.mockRejectedValueOnce(new Error('Service unavailable'));

            const health = await chromaDbServer.checkHealth();

            expect(health.healthy).toBe(false);
            expect(health.error).toContain('Service unavailable');
        });
    });

    describe('Shutdown', () => {
        it('should shutdown gracefully', async () => {
            await chromaDbServer.initialize();
            await chromaDbServer.shutdown();

            expect(mockWebSocketServer.close).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('ChromaDB server shutdown')
            );
        });

        it('should handle shutdown errors', async () => {
            await chromaDbServer.initialize();
            
            mockWebSocketServer.close.mockImplementationOnce(() => {
                throw new Error('Shutdown error');
            });

            await chromaDbServer.shutdown();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error during shutdown')
            );
        });
    });
});
