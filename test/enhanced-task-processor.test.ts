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

            mockEmbeddingManager.findSimilarTasks.mockResolvedValueOnce([
                {
                    id: 'similar-1',
                    task_id: 2,
                    description: 'Similar task',
                    embedding: [0.1, 0.2, 0.3],
                    similarity: 0.8,
                    created_at: new Date().toISOString()
                }
            ]);

            const result = await enhancedTaskProcessor.processTaskWithLearning(task);

            expect(result.success).toBe(true);
            expect(result.similarTasks).toBeDefined();
            expect(result.similarTasks?.length).toBe(1);
            expect(mockEmbeddingManager.findSimilarTasks).toHaveBeenCalledWith(
                task.description,
                expect.any(Number)
            );
        });

        it('should handle tasks without similar matches', async () => {
            const task: BaseTask = {
                id: 1,
                type: 'llm',
                description: 'Unique task with no matches',
                status: 'pending'
            };

            mockEmbeddingManager.findSimilarTasks.mockResolvedValueOnce([]);

            const result = await enhancedTaskProcessor.processTaskWithLearning(task);

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

            const result = await enhancedTaskProcessor.processTaskWithLearning(shellTask);

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

            await enhancedTaskProcessor.completeTaskWithLearning(task, result);

            expect(mockEmbeddingManager.addTaskEmbedding).toHaveBeenCalledWith(
                task.id!,
                task.description,
                expect.objectContaining({
                    task_type: task.type,
                    success: result.success,
                    output_path: result.outputPath
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
            await enhancedTaskProcessor.completeTaskWithLearning(task, result);

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to store task embedding'),
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
            expect(dashboardInfo.websocketUrl).toContain('8080');
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

            expect(metrics).toHaveProperty('total_tasks');
            expect(metrics).toHaveProperty('completed_tasks');
            expect(metrics).toHaveProperty('failed_tasks');
            expect(metrics).toHaveProperty('success_rate');
            expect(metrics).toHaveProperty('system_health');

            expect(metrics.total_tasks).toBe(3);
            expect(metrics.completed_tasks).toBe(1);
            expect(metrics.failed_tasks).toBe(1);
        });

        it('should calculate success rate correctly', async () => {
            const metrics = await enhancedTaskProcessor.getSystemMetrics(24);

            // 1 completed out of 2 finished tasks (excluding pending)
            expect(metrics.success_rate).toBe(0.5);
        });

        it('should determine system health status', async () => {
            const metrics = await enhancedTaskProcessor.getSystemMetrics(24);

            expect(['healthy', 'warning', 'critical']).toContain(metrics.system_health);
        });
    });

    describe('Shutdown', () => {
        it('should shutdown gracefully', async () => {
            await enhancedTaskProcessor.initialize();
            await enhancedTaskProcessor.shutdown();

            expect(mockEmbeddingManager.shutdown).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Enhanced Task Processor shutdown')
            );
        });

        it('should handle shutdown errors', async () => {
            await enhancedTaskProcessor.initialize();
            
            mockEmbeddingManager.shutdown.mockRejectedValueOnce(new Error('Shutdown failed'));

            // Should not throw
            await enhancedTaskProcessor.shutdown();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error during shutdown'),
                expect.any(Object)
            );
        });
    });
});
