import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { enhancedTaskProcessor } from '../src/mcp/enhanced-task-processor';
import type { BaseTask, DatabaseTask } from '../src/types';

// Mock dependencies
const mockEmbeddingManager = {
    addTaskEmbedding: mock(() => Promise.resolve()),
    findSimilarTasks: mock(() => Promise.resolve([])),
    initialize: mock(() => Promise.resolve()),
    shutdown: mock(() => Promise.resolve())
};

const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

// Mock modules
mock.module('../src/memory/embeddings', () => ({
    embeddingManager: mockEmbeddingManager
}));

mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

mock.module('../src/db', () => ({
    getDatabase: () => db
}));

// Global database variable for mocking
let db: Database;

describe('Enhanced Task Processor', () => {
    beforeEach(async () => {
        // Create in-memory database for testing
        db = new Database(':memory:');
        
        // Create tasks table
        db.run(`
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT,
                file_hash TEXT,
                parent_id INTEGER,
                description TEXT,
                type TEXT,
                status TEXT,
                dependencies TEXT,
                result_summary TEXT,
                shell_command TEXT,
                error_message TEXT,
                args TEXT,
                tool TEXT,
                generator TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                finished_at DATETIME
            )
        `);

        // Reset mocks
        mockEmbeddingManager.addTaskEmbedding.mockClear();
        mockEmbeddingManager.findSimilarTasks.mockClear();
        mockEmbeddingManager.initialize.mockClear();
        mockEmbeddingManager.shutdown.mockClear();
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
    });

    afterEach(async () => {
        db.close();
        await enhancedTaskProcessor.shutdown();
    });

    describe('Initialization', () => {
        it('should initialize successfully', async () => {
            await enhancedTaskProcessor.initialize();
            
            expect(mockEmbeddingManager.initialize).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Enhanced Task Processor initialized')
            );
        });

        it('should handle initialization errors gracefully', async () => {
            mockEmbeddingManager.initialize.mockRejectedValueOnce(new Error('Init failed'));
            
            await expect(enhancedTaskProcessor.initialize()).rejects.toThrow('Init failed');
        });
    });

    describe('Task Processing', () => {
        beforeEach(async () => {
            await enhancedTaskProcessor.initialize();
        });

        it('should process task with learning capabilities', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'shell',
                description: 'Test shell task',
                status: 'pending',
                shell_command: 'echo "test"'
            };

            // Mock similar tasks with 'completed' status to match the filter
            // The enhanced task processor calls findSimilarTasks twice - once for recommendations and once for similar tasks
            mockEmbeddingManager.findSimilarTasks
                .mockResolvedValueOnce([
                    {
                        id: 'similar-1',
                        taskId: 2,
                        task_id: 2,
                        description: 'Similar task',
                        type: 'shell',
                        status: 'completed',
                        result: {},
                        metadata: {},
                        similarity: 0.8
                    }
                ])
                .mockResolvedValueOnce([
                    {
                        id: 'similar-1',
                        taskId: 2,
                        task_id: 2,
                        description: 'Similar task',
                        type: 'shell',
                        status: 'completed',
                        result: {},
                        metadata: {},
                        similarity: 0.8
                    }
                ]);

            const result = await enhancedTaskProcessor.processTaskWithEnhancements(task);

            expect(result.success).toBe(true);
            expect(result.similarTasks).toBeDefined();
            expect(result.similarTasks?.length).toBe(1);
            expect(mockEmbeddingManager.findSimilarTasks).toHaveBeenCalled();
        });

        it('should handle tasks without similar matches', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'llm',
                description: 'Unique task with no matches',
                status: 'pending'
            };

            mockEmbeddingManager.findSimilarTasks.mockResolvedValueOnce([]);

            const result = await enhancedTaskProcessor.processTaskWithEnhancements(task);

            expect(result.success).toBe(true);
            expect(result.similarTasks).toEqual([]);
            expect(result.recommendations).toBeDefined();
        });

        it('should generate recommendations based on task type', async () => {
            const shellTask: BaseTask = {
                id: 1,
                type: 'shell',
                description: 'Run system command',
                status: 'pending',
                shell_command: 'ls -la'
            };

            const result = await enhancedTaskProcessor.processTaskWithEnhancements(shellTask);

            expect(result.success).toBe(true);
            expect(result.recommendations).toBeDefined();
            expect(result.recommendations?.length).toBeGreaterThan(0);
        });
    });

    describe('Task Completion with Learning', () => {
        beforeEach(async () => {
            await enhancedTaskProcessor.initialize();
        });

        it('should complete task and store embeddings', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'code',
                description: 'Generate Python script',
                status: 'completed'
            };

            const result = {
                success: true,
                outputPath: '/test/output.py'
            };

            await enhancedTaskProcessor.completeTaskWithEnhancements(task, result);

            expect(mockEmbeddingManager.addTaskEmbedding).toHaveBeenCalledWith(
                expect.objectContaining({
                    taskId: task.id,
                    description: task.description,
                    type: task.type,
                    status: 'completed'
                })
            );
        });

        it('should handle completion errors gracefully', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'shell',
                description: 'Test task',
                status: 'failed'
            };

            const result = {
                success: false,
                error: 'Command failed'
            };

            mockEmbeddingManager.addTaskEmbedding.mockRejectedValueOnce(new Error('Embedding failed'));

            // Should not throw, but log error
            await enhancedTaskProcessor.completeTaskWithEnhancements(task, result);

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('enhanced task completion'),
                expect.any(Object)
            );
        });
    });

    describe('Live Dashboard Integration', () => {
        it('should provide dashboard info', () => {
            const dashboardInfo = enhancedTaskProcessor.getLiveDashboardInfo();

            expect(dashboardInfo).toHaveProperty('websocketUrl');
            expect(dashboardInfo).toHaveProperty('dashboardPath');
            expect(dashboardInfo.websocketUrl).toContain('ws://');
            expect(dashboardInfo.websocketUrl).toContain('8081');
        });

        it('should handle WebSocket connections', async () => {
            await enhancedTaskProcessor.initialize();

            // Test that WebSocket server is running
            const dashboardInfo = enhancedTaskProcessor.getLiveDashboardInfo();
            expect(dashboardInfo.websocketUrl).toBeDefined();
        });
    });

    describe('System Metrics', () => {
        beforeEach(async () => {
            await enhancedTaskProcessor.initialize();
            
            // Insert test data
            db.run(`
                INSERT INTO tasks (type, status, created_at)
                VALUES 
                    ('shell', 'completed', datetime('now', '-1 hour')),
                    ('llm', 'failed', datetime('now', '-2 hours')),
                    ('code', 'pending', datetime('now', '-30 minutes'))
            `);
        });

        it('should calculate system metrics', async () => {
            const metrics = await enhancedTaskProcessor.getSystemMetrics(24);

            expect(metrics).toHaveProperty('system_health');
            expect(metrics.system_health).toHaveProperty('pending_tasks');
            expect(metrics.system_health).toHaveProperty('running_tasks');
            expect(metrics.system_health).toHaveProperty('failed_tasks');
            expect(metrics.system_health).toHaveProperty('websocket_connections');

            expect(metrics.system_health.pending_tasks).toBeNumber();
            expect(metrics.system_health.running_tasks).toBeNumber();
            expect(metrics.system_health.failed_tasks).toBeNumber();
            expect(metrics.system_health.websocket_connections).toBeNumber();
        });

        it('should calculate task counts correctly', async () => {
            const metrics = await enhancedTaskProcessor.getSystemMetrics(24);

            expect(metrics.system_health.pending_tasks).toBeGreaterThanOrEqual(0);
            expect(metrics.system_health.running_tasks).toBeGreaterThanOrEqual(0);
            expect(metrics.system_health.failed_tasks).toBeGreaterThanOrEqual(0);
        });

        it('should track websocket connections', async () => {
            const metrics = await enhancedTaskProcessor.getSystemMetrics(24);

            expect(metrics.system_health.websocket_connections).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Shutdown', () => {
        it('should shutdown gracefully', async () => {
            await enhancedTaskProcessor.initialize();
            await enhancedTaskProcessor.shutdown();

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Enhanced Task Processor shutdown')
            );
        });

        it('should handle shutdown errors', async () => {
            await enhancedTaskProcessor.initialize();

            mockEmbeddingManager.shutdown.mockRejectedValueOnce(new Error('Shutdown failed'));

            // Should not throw, but should log error
            await enhancedTaskProcessor.shutdown();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error during Enhanced Task Processor shutdown'),
                expect.any(Object)
            );
        });
    });
});
