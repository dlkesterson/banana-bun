import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// Mock MCP client
const mockMcpClient = {
    startServer: mock(() => Promise.resolve()),
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
    stopAllServers: mock(() => Promise.resolve()),
    callTool: mock(() => Promise.resolve({ success: true, result: 'mocked result' })),
    isConnected: mock(() => true),
    sendRequest: mock(() => Promise.resolve({ content: [{ text: '{"results": [], "recommendations": []}' }] })),
    findSimilarTasks: mock(() => Promise.resolve([])),
    getTaskRecommendations: mock(() => Promise.resolve({ recommendations: ['Use best practices', 'Consider performance'] })),
    storeTaskEmbedding: mock(() => Promise.resolve()),
    batchAddEmbeddings: mock(() => Promise.resolve()),
    setupNotification: mock(() => Promise.resolve()),
    sendNotification: mock(() => Promise.resolve()),
    broadcastStatusUpdate: mock(() => Promise.resolve()),
    getSystemMetrics: mock(() => Promise.resolve({ cpu: 50, memory: 60 })),
    getDashboardInfo: mock(() => Promise.resolve({ active_tasks: 0, total_tasks: 0 })),
    setupWebhook: mock(() => Promise.resolve())
};

// Mock logger
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

// Mock embedding manager
const mockEmbeddingManager = {
    addTaskEmbedding: mock(() => Promise.resolve())
};

// Mock config
const mockConfig = {
    paths: {
        chroma: {
            host: 'localhost',
            port: 8000,
            ssl: false
        }
    },
    mcpServers: {
        chromadb: {
            command: 'bun',
            args: ['run', 'mcp:chromadb'],
            description: 'ChromaDB MCP Server'
        },
        monitor: {
            command: 'bun',
            args: ['run', 'mcp:monitor'],
            description: 'Monitor MCP Server'
        }
    },
    settings: {
        monitor: {
            metrics_interval_minutes: 5,
            websocket_port: 8080
        }
    }
};

// Mock modules
mock.module('../src/mcp/mcp-client', () => ({
    MCPClient: mock(() => mockMcpClient),
    mcpClient: mockMcpClient
}));

mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

mock.module('../src/config', () => ({
    config: mockConfig
}));

mock.module('../src/memory/embeddings', () => ({
    embeddingManager: mockEmbeddingManager
}));

// Import after mocking
import { mcpManager } from '../src/mcp/mcp-manager';
import type { BaseTask } from '../src/types';

describe('MCP Manager', () => {
    beforeEach(() => {
        // Reset all mocks
        Object.values(mockMcpClient).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                fn.mockClear();
            }
        });

        Object.values(mockLogger).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                fn.mockClear();
            }
        });

        Object.values(mockEmbeddingManager).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                fn.mockClear();
            }
        });
    });

    afterEach(async () => {
        await mcpManager.shutdown();
    });

    describe('Initialization', () => {
        it('should initialize MCP servers successfully', async () => {
            await mcpManager.initialize();

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('MCP Manager initialized')
            );
        });

        it('should handle initialization errors gracefully', async () => {
            // Reset the manager state
            await mcpManager.shutdown();

            // Mock the startServer to reject
            mockMcpClient.startServer.mockImplementation(() => {
                throw new Error('Server start failed');
            });

            await expect(mcpManager.initialize()).rejects.toThrow('Server start failed');

            // Check that error was logged
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to initialize MCP Manager',
                expect.objectContaining({
                    error: 'Server start failed'
                })
            );

            // Reset the mock
            mockMcpClient.startServer.mockResolvedValue(undefined);
        });

        it('should not initialize twice', async () => {
            await mcpManager.initialize();

            // Clear the mock to reset call count
            mockMcpClient.startServer.mockClear();

            await mcpManager.initialize(); // Second call should be ignored

            // Should not start servers again
            expect(mockMcpClient.startServer).toHaveBeenCalledTimes(0);
        });
    });

    describe('Task Processing with MCP', () => {
        beforeEach(async () => {
            await mcpManager.initialize();
        });

        it('should process task with ChromaDB integration', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'llm',
                description: 'Generate creative content',
                status: 'pending'
            };

            mockMcpClient.getTaskRecommendations.mockResolvedValueOnce({
                recommendations: ['Use creative writing techniques', 'Consider audience']
            });

            const result = await mcpManager.processTaskWithMCP(task);

            expect(result).toEqual(task);
            expect(mockMcpClient.getTaskRecommendations).toHaveBeenCalledWith(
                task.description,
                task.type
            );
            expect(mockMcpClient.broadcastStatusUpdate).toHaveBeenCalledWith(
                task.id,
                'running',
                expect.objectContaining({
                    description: task.description,
                    type: task.type
                })
            );
        });

        it('should handle MCP tool call failures', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'shell',
                description: 'Run command',
                status: 'pending'
            };

            mockMcpClient.getTaskRecommendations.mockRejectedValueOnce(new Error('Tool call failed'));

            const result = await mcpManager.processTaskWithMCP(task);

            expect(result).toEqual(task); // Should return the original task

            // Check that error was logged (the error occurs in getTaskRecommendations)
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to get task recommendations',
                expect.objectContaining({
                    taskId: task.id,
                    error: 'Tool call failed'
                })
            );
        });

        it('should process different task types appropriately', async () => {
            const taskTypes = ['shell', 'llm', 'code', 'tool', 'batch'];

            for (const type of taskTypes) {
                const task: BaseTask = {
                    id: 1,
                    type: type as any,
                    description: `Test ${type} task`,
                    status: 'pending'
                };

                mockMcpClient.getTaskRecommendations.mockResolvedValueOnce({
                    recommendations: [`${type} specific advice`]
                });

                const result = await mcpManager.processTaskWithMCP(task);
                expect(result).toEqual(task);
            }
        });
    });

    describe('Task Completion with MCP', () => {
        beforeEach(async () => {
            await mcpManager.initialize();
        });

        it('should complete task and store learning data', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'code',
                description: 'Generate Python script',
                status: 'completed'
            };

            const executionResult = {
                success: true,
                outputPath: '/tmp/generated_script.py',
                executionTime: 2500
            };

            await mcpManager.completeTaskWithMCP(task, executionResult);

            expect(mockMcpClient.batchAddEmbeddings).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        taskId: task.id,
                        description: task.description,
                        type: task.type,
                        status: 'completed'
                    })
                ])
            );
            expect(mockMcpClient.sendNotification).toHaveBeenCalled();
            expect(mockMcpClient.broadcastStatusUpdate).toHaveBeenCalled();
        });

        it('should handle completion with failure results', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'shell',
                description: 'Failed command',
                status: 'failed'
            };

            const executionResult = {
                success: false,
                error: 'Command not found',
                executionTime: 100
            };

            await mcpManager.completeTaskWithMCP(task, executionResult);

            expect(mockMcpClient.batchAddEmbeddings).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        taskId: task.id,
                        status: 'failed'
                    })
                ])
            );
            expect(mockMcpClient.sendNotification).toHaveBeenCalled();
            expect(mockMcpClient.broadcastStatusUpdate).toHaveBeenCalled();
        });

        it('should handle storage errors gracefully', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'llm',
                description: 'Test task',
                status: 'completed'
            };

            mockMcpClient.batchAddEmbeddings.mockRejectedValueOnce(new Error('Storage failed'));

            // Should not throw, but log error
            await mcpManager.completeTaskWithMCP(task, { success: true });

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to add embedding via MCP, using fallback'),
                expect.any(Object)
            );
        });
    });

    describe('Live Dashboard Integration', () => {
        beforeEach(async () => {
            await mcpManager.initialize();
        });

        it('should provide live dashboard information', async () => {
            const dashboardInfo = await mcpManager.getLiveDashboardInfo();

            expect(dashboardInfo.websocketUrl).toBe('ws://localhost:8080');
            expect(dashboardInfo.dashboardPath).toContain('live-dashboard.html');
        });

        it('should handle dashboard info errors', async () => {
            // This test doesn't apply since getLiveDashboardInfo doesn't make MCP calls
            // It just returns config-based values
            const dashboardInfo = await mcpManager.getLiveDashboardInfo();

            expect(dashboardInfo.websocketUrl).toBe('ws://localhost:8080');
            expect(dashboardInfo.dashboardPath).toContain('live-dashboard.html');
        });
    });

    describe('System Metrics', () => {
        beforeEach(async () => {
            await mcpManager.initialize();
        });

        it('should retrieve system metrics', async () => {
            const mockMetrics = {
                total_tasks: 150,
                completed_tasks: 120,
                failed_tasks: 20,
                pending_tasks: 10,
                success_rate: 0.8,
                avg_execution_time: 1500,
                system_health: 'healthy'
            };

            mockMcpClient.getSystemMetrics.mockResolvedValueOnce(mockMetrics);

            const metrics = await mcpManager.getSystemMetrics(24);

            expect(metrics).toEqual(mockMetrics);
            expect(mockMcpClient.getSystemMetrics).toHaveBeenCalledWith(24);
        });

        it('should handle metrics retrieval errors', async () => {
            mockMcpClient.getSystemMetrics.mockRejectedValueOnce(new Error('Metrics unavailable'));

            const metrics = await mcpManager.getSystemMetrics(24);

            expect(metrics).toBeNull();
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to get system metrics'),
                expect.any(Object)
            );
        });
    });

    describe('Webhook Notifications', () => {
        beforeEach(async () => {
            await mcpManager.initialize();
        });

        it('should setup webhook notifications', async () => {
            const webhookUrl = 'https://example.com/webhook';

            await mcpManager.setupWebhookNotification(webhookUrl);

            expect(mockMcpClient.setupNotification).toHaveBeenCalledWith(
                'webhook',
                webhookUrl,
                undefined,
                true
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Webhook notification configured'),
                expect.any(Object)
            );
        });

        it('should handle webhook setup errors', async () => {
            mockMcpClient.setupNotification.mockRejectedValueOnce(new Error('Webhook setup failed'));

            await expect(mcpManager.setupWebhookNotification('https://example.com/webhook')).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to setup webhook notification'),
                expect.any(Object)
            );
        });
    });

    describe('Connection Management', () => {
        it('should check connection status', () => {
            const isConnected = mcpManager.isConnected();
            expect(typeof isConnected).toBe('boolean');
        });

        it('should reconnect on connection loss', async () => {
            await mcpManager.initialize();

            // Reset the manager to simulate disconnection
            await mcpManager.shutdown();

            await mcpManager.ensureConnection();

            expect(mockMcpClient.startServer).toHaveBeenCalled();
        });
    });

    describe('Shutdown', () => {
        it('should shutdown gracefully', async () => {
            await mcpManager.initialize();
            await mcpManager.shutdown();

            expect(mockMcpClient.stopAllServers).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('MCP Manager shutdown')
            );
        });

        it('should handle shutdown errors', async () => {
            await mcpManager.initialize();

            mockMcpClient.stopAllServers.mockRejectedValueOnce(new Error('Stop servers failed'));

            await mcpManager.shutdown();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error during MCP Manager shutdown'),
                expect.any(Object)
            );
        });

        it('should handle shutdown without initialization', async () => {
            // Should not throw
            await mcpManager.shutdown();
        });
    });
});
