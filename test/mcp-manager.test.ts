import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// Mock MCP client
const mockMcpClient = {
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
    callTool: mock(() => Promise.resolve({ success: true, result: 'mocked result' })),
    isConnected: mock(() => true)
};

// Mock logger
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

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
            mockMcpClient.connect.mockRejectedValueOnce(new Error('Connection failed'));

            await expect(mcpManager.initialize()).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to initialize MCP Manager'),
                expect.any(Object)
            );
        });

        it('should not initialize twice', async () => {
            await mcpManager.initialize();
            await mcpManager.initialize(); // Second call should be ignored

            // Should only connect once
            expect(mockMcpClient.connect).toHaveBeenCalledTimes(1);
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

            mockMcpClient.callTool.mockResolvedValueOnce({
                success: true,
                result: {
                    similar_tasks: [
                        { id: 'task_2', similarity: 0.85, description: 'Similar creative task' }
                    ],
                    recommendations: ['Use creative writing techniques', 'Consider audience']
                }
            });

            const result = await mcpManager.processTaskWithMCP(task);

            expect(result.success).toBe(true);
            expect(result.similar_tasks).toBeDefined();
            expect(result.recommendations).toBeDefined();

            expect(mockMcpClient.callTool).toHaveBeenCalledWith(
                'find_similar_tasks',
                expect.objectContaining({
                    description: task.description,
                    task_type: task.type
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

            mockMcpClient.callTool.mockRejectedValueOnce(new Error('Tool call failed'));

            const result = await mcpManager.processTaskWithMCP(task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Tool call failed');

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('MCP task processing failed'),
                expect.any(Object)
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

                mockMcpClient.callTool.mockResolvedValueOnce({
                    success: true,
                    result: { recommendations: [`${type} specific advice`] }
                });

                const result = await mcpManager.processTaskWithMCP(task);
                expect(result.success).toBe(true);
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

            expect(mockMcpClient.callTool).toHaveBeenCalledWith(
                'store_task_embedding',
                expect.objectContaining({
                    task_id: task.id,
                    description: task.description,
                    task_type: task.type,
                    success: executionResult.success,
                    output_path: executionResult.outputPath,
                    execution_time: executionResult.executionTime
                })
            );
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

            expect(mockMcpClient.callTool).toHaveBeenCalledWith(
                'store_task_embedding',
                expect.objectContaining({
                    task_id: task.id,
                    success: false,
                    error: 'Command not found'
                })
            );
        });

        it('should handle storage errors gracefully', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'llm',
                description: 'Test task',
                status: 'completed'
            };

            mockMcpClient.callTool.mockRejectedValueOnce(new Error('Storage failed'));

            // Should not throw, but log error
            await mcpManager.completeTaskWithMCP(task, { success: true });

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to complete task with MCP'),
                expect.any(Object)
            );
        });
    });

    describe('Live Dashboard Integration', () => {
        beforeEach(async () => {
            await mcpManager.initialize();
        });

        it('should provide live dashboard information', async () => {
            mockMcpClient.callTool.mockResolvedValueOnce({
                success: true,
                result: {
                    websocket_url: 'ws://localhost:8080',
                    dashboard_path: '/tmp/dashboard/live.html'
                }
            });

            const dashboardInfo = await mcpManager.getLiveDashboardInfo();

            expect(dashboardInfo.websocketUrl).toBe('ws://localhost:8080');
            expect(dashboardInfo.dashboardPath).toBe('/tmp/dashboard/live.html');
        });

        it('should handle dashboard info errors', async () => {
            mockMcpClient.callTool.mockRejectedValueOnce(new Error('Dashboard unavailable'));

            const dashboardInfo = await mcpManager.getLiveDashboardInfo();

            expect(dashboardInfo.websocketUrl).toBeNull();
            expect(dashboardInfo.error).toContain('Dashboard unavailable');
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

            mockMcpClient.callTool.mockResolvedValueOnce({
                success: true,
                result: mockMetrics
            });

            const metrics = await mcpManager.getSystemMetrics(24);

            expect(metrics).toEqual(mockMetrics);
            expect(mockMcpClient.callTool).toHaveBeenCalledWith(
                'get_system_metrics',
                { hours: 24 }
            );
        });

        it('should handle metrics retrieval errors', async () => {
            mockMcpClient.callTool.mockRejectedValueOnce(new Error('Metrics unavailable'));

            const metrics = await mcpManager.getSystemMetrics(24);

            expect(metrics.error).toContain('Metrics unavailable');
            expect(metrics.total_tasks).toBe(0);
        });
    });

    describe('Webhook Notifications', () => {
        beforeEach(async () => {
            await mcpManager.initialize();
        });

        it('should setup webhook notifications', async () => {
            const webhookUrl = 'https://example.com/webhook';

            mockMcpClient.callTool.mockResolvedValueOnce({
                success: true,
                result: { webhook_id: 'webhook_123' }
            });

            const result = await mcpManager.setupWebhookNotification(webhookUrl);

            expect(result.success).toBe(true);
            expect(result.webhook_id).toBe('webhook_123');

            expect(mockMcpClient.callTool).toHaveBeenCalledWith(
                'setup_webhook',
                { url: webhookUrl }
            );
        });

        it('should handle webhook setup errors', async () => {
            mockMcpClient.callTool.mockRejectedValueOnce(new Error('Webhook setup failed'));

            const result = await mcpManager.setupWebhookNotification('https://example.com/webhook');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Webhook setup failed');
        });
    });

    describe('Connection Management', () => {
        it('should check connection status', () => {
            const isConnected = mcpManager.isConnected();
            expect(typeof isConnected).toBe('boolean');
        });

        it('should reconnect on connection loss', async () => {
            await mcpManager.initialize();

            mockMcpClient.isConnected.mockReturnValueOnce(false);
            mockMcpClient.connect.mockResolvedValueOnce(undefined);

            await mcpManager.ensureConnection();

            expect(mockMcpClient.connect).toHaveBeenCalled();
        });
    });

    describe('Shutdown', () => {
        it('should shutdown gracefully', async () => {
            await mcpManager.initialize();
            await mcpManager.shutdown();

            expect(mockMcpClient.disconnect).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('MCP Manager shutdown')
            );
        });

        it('should handle shutdown errors', async () => {
            await mcpManager.initialize();

            mockMcpClient.disconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

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
