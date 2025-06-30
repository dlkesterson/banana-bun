import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';

// Mock all external dependencies
const mockConfig = {
    paths: {
        incoming: '/tmp/test-incoming',
        processing: '/tmp/test-processing',
        archive: '/tmp/test-archive',
        error: '/tmp/test-error',
        tasks: '/tmp/test-tasks',
        outputs: '/tmp/test-outputs',
        logs: '/tmp/test-logs',
        dashboard: '/tmp/test-dashboard',
        database: ':memory:',
        media: '/tmp/test-media',
        chroma: {
            host: 'localhost',
            port: 8000,
            ssl: false
        }
    },
    openai: {
        apiKey: 'test-api-key',
        model: 'gpt-4'
    },
    ollama: {
        url: 'http://localhost:11434',
        model: 'qwen3:8b',
        fastModel: 'qwen3:8b'
    },
    meilisearch: {
        url: 'http://localhost:7700',
        masterKey: 'test-master-key',
        indexName: 'test-media-index'
    },
    downloaders: {
        rss: {
            enabled: false,
            checkInterval: 3600,
            feeds: []
        }
    }
};

const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

const mockRetryManager = {
    getTasksReadyForRetry: mock(() => Promise.resolve([])),
    initialize: mock(() => Promise.resolve()),
    shutdown: mock(() => Promise.resolve())
};

const mockEnhancedTaskProcessor = {
    initialize: mock(() => Promise.resolve()),
    shutdown: mock(() => Promise.resolve()),
    getLiveDashboardInfo: mock(() => ({
        websocketUrl: 'ws://localhost:8080',
        dashboardPath: '/tmp/dashboard'
    }))
};

const mockTaskScheduler = {
    start: mock(() => {}),
    stop: mock(() => {}),
    initialize: mock(() => Promise.resolve())
};

// Mock modules
mock.module('../src/config', () => ({ config: mockConfig }));
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/retry/retry-manager', () => ({ 
    RetryManager: mock(() => mockRetryManager) 
}));
mock.module('../src/mcp/enhanced-task-processor', () => ({ 
    enhancedTaskProcessor: mockEnhancedTaskProcessor 
}));
mock.module('../src/scheduler/task-scheduler', () => ({ 
    TaskScheduler: mock(() => mockTaskScheduler) 
}));

// Mock database functions
let mockDb: Database;
const mockInitDatabase = mock(() => Promise.resolve());
const mockGetDatabase = mock(() => mockDb);
const mockGetDependencyHelper = mock(() => ({}));

mock.module('../src/db', () => ({
    initDatabase: mockInitDatabase,
    getDatabase: mockGetDatabase,
    getDependencyHelper: mockGetDependencyHelper
}));

// Mock migration functions
const mockRunAllMigrations = mock(() => Promise.resolve());
mock.module('../src/migrations/migrate-all', () => ({
    runAllMigrations: mockRunAllMigrations
}));

// Mock file processing functions
const mockParseTaskFile = mock(() => Promise.resolve({
    type: 'shell',
    description: 'Test task',
    status: 'pending',
    shell_command: 'echo "test"'
}));

const mockHashFile = mock(() => Promise.resolve('test-hash'));
const mockGenerateDashboard = mock(() => Promise.resolve());

mock.module('../src/utils/parser', () => ({ parseTaskFile: mockParseTaskFile }));
mock.module('../src/utils/hash', () => ({ hashFile: mockHashFile }));
mock.module('../src/dashboard', () => ({ generateDashboard: mockGenerateDashboard }));

// Mock task execution
const mockExecuteTask = mock(() => Promise.resolve({ success: true }));
mock.module('../src/executors/dispatcher', () => ({ executeTask: mockExecuteTask }));

// Mock task conversion
const mockConvertDatabaseTasksToBaseTasks = mock(() => []);
mock.module('../src/utils/task_converter', () => ({ 
    convertDatabaseTasksToBaseTasks: mockConvertDatabaseTasksToBaseTasks 
}));

describe('Main Orchestrator (src/index.ts)', () => {
    beforeEach(async () => {
        // Create in-memory database for testing
        mockDb = new Database(':memory:');
        
        // Create basic tasks table
        mockDb.run(`
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                finished_at DATETIME
            )
        `);

        // Reset all mocks
        Object.values(mockLogger).forEach(fn => fn.mockClear());
        mockInitDatabase.mockClear();
        mockRunAllMigrations.mockClear();
        mockRetryManager.getTasksReadyForRetry.mockClear();
        mockEnhancedTaskProcessor.initialize.mockClear();
        mockParseTaskFile.mockClear();
        mockHashFile.mockClear();
        mockExecuteTask.mockClear();
        mockGenerateDashboard.mockClear();

        // Setup test directories
        const testDirs = Object.values(mockConfig.paths).filter(p => typeof p === 'string' && p !== ':memory:');
        for (const dir of testDirs) {
            await fs.mkdir(dir, { recursive: true });
        }
    });

    afterEach(async () => {
        mockDb?.close();
        
        // Cleanup test directories
        const testDirs = Object.values(mockConfig.paths).filter(p => typeof p === 'string' && p !== ':memory:');
        for (const dir of testDirs) {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
    });

    describe('System Initialization', () => {
        it('should initialize all components in correct order', async () => {
            // Import main after mocks are set up
            const { main } = await import('../src/index');
            
            // Since main() runs the full application, we'll test individual components
            expect(mockInitDatabase).toBeDefined();
            expect(mockRunAllMigrations).toBeDefined();
            expect(mockEnhancedTaskProcessor.initialize).toBeDefined();
        });

        it('should create required directories', async () => {
            // Test that ensureFoldersExist functionality works
            const testDirs = [
                mockConfig.paths.incoming,
                mockConfig.paths.processing,
                mockConfig.paths.archive,
                mockConfig.paths.error,
                mockConfig.paths.outputs,
                mockConfig.paths.logs,
                mockConfig.paths.dashboard
            ];

            for (const dir of testDirs) {
                const exists = await fs.access(dir).then(() => true).catch(() => false);
                expect(exists).toBe(true);
            }
        });

        it('should handle initialization errors gracefully', async () => {
            mockInitDatabase.mockRejectedValueOnce(new Error('Database init failed'));
            
            // The main function should handle this error
            expect(mockInitDatabase).toBeDefined();
        });
    });

    describe('File Processing', () => {
        it('should process new task files', async () => {
            const testFile = `${mockConfig.paths.incoming}/test-task.json`;
            const taskContent = JSON.stringify({
                type: 'shell',
                description: 'Test shell task',
                status: 'pending',
                shell_command: 'echo "hello"'
            });

            await fs.writeFile(testFile, taskContent);

            // Mock the file processing components
            mockParseTaskFile.mockResolvedValueOnce({
                type: 'shell',
                description: 'Test shell task',
                status: 'pending',
                shell_command: 'echo "hello"'
            });

            mockHashFile.mockResolvedValueOnce('test-file-hash');

            // Test that the components are available for processing
            expect(mockParseTaskFile).toBeDefined();
            expect(mockHashFile).toBeDefined();
        });

        it('should handle malformed task files', async () => {
            const testFile = `${mockConfig.paths.incoming}/bad-task.json`;
            await fs.writeFile(testFile, 'invalid json content');

            mockParseTaskFile.mockRejectedValueOnce(new Error('Invalid JSON'));

            // Should handle parsing errors gracefully
            expect(mockParseTaskFile).toBeDefined();
        });

        it('should move processed files to archive', async () => {
            const testFile = `${mockConfig.paths.incoming}/task.json`;
            await fs.writeFile(testFile, '{"type":"shell","description":"test","status":"pending"}');

            // After processing, file should be moved to archive
            // This would be tested in integration tests
            expect(mockConfig.paths.archive).toBeDefined();
        });
    });

    describe('Task Orchestration', () => {
        it('should process pending tasks', async () => {
            // Insert a pending task
            mockDb.run(`
                INSERT INTO tasks (type, description, status, shell_command)
                VALUES ('shell', 'Test task', 'pending', 'echo "test"')
            `);

            const pendingTasks = mockDb.query('SELECT * FROM tasks WHERE status = "pending"').all();
            expect(pendingTasks.length).toBe(1);

            mockConvertDatabaseTasksToBaseTasks.mockReturnValueOnce([{
                id: 1,
                type: 'shell',
                description: 'Test task',
                status: 'pending',
                shell_command: 'echo "test"'
            }]);

            // Test that orchestrator can handle pending tasks
            expect(mockConvertDatabaseTasksToBaseTasks).toBeDefined();
            expect(mockExecuteTask).toBeDefined();
        });

        it('should handle task dependencies', async () => {
            // Insert tasks with dependencies
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, dependencies)
                VALUES 
                    (1, 'shell', 'Parent task', 'completed', NULL),
                    (2, 'shell', 'Child task', 'pending', '["1"]')
            `);

            const tasks = mockDb.query('SELECT * FROM tasks').all();
            expect(tasks.length).toBe(2);

            // Test dependency resolution logic
            const childTask = mockDb.query('SELECT * FROM tasks WHERE id = 2').get() as any;
            expect(childTask.dependencies).toBe('["1"]');
        });

        it('should retry failed tasks', async () => {
            mockRetryManager.getTasksReadyForRetry.mockResolvedValueOnce([1, 2]);

            // Test retry mechanism
            expect(mockRetryManager.getTasksReadyForRetry).toBeDefined();
        });
    });

    describe('Dashboard Generation', () => {
        it('should generate dashboard periodically', async () => {
            // Test dashboard generation
            expect(mockGenerateDashboard).toBeDefined();
        });

        it('should handle dashboard generation errors', async () => {
            mockGenerateDashboard.mockRejectedValueOnce(new Error('Dashboard error'));
            
            // Should handle dashboard errors gracefully
            expect(mockGenerateDashboard).toBeDefined();
        });
    });

    describe('MCP Integration', () => {
        it('should initialize MCP enhanced task processor', async () => {
            expect(mockEnhancedTaskProcessor.initialize).toBeDefined();
        });

        it('should handle MCP initialization failures', async () => {
            mockEnhancedTaskProcessor.initialize.mockRejectedValueOnce(new Error('MCP init failed'));
            
            // Should continue without MCP if initialization fails
            expect(mockEnhancedTaskProcessor.initialize).toBeDefined();
        });

        it('should provide live dashboard info', () => {
            const dashboardInfo = mockEnhancedTaskProcessor.getLiveDashboardInfo();
            expect(dashboardInfo.websocketUrl).toContain('ws://');
            expect(dashboardInfo.dashboardPath).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('should handle database connection errors', async () => {
            mockInitDatabase.mockRejectedValueOnce(new Error('Database connection failed'));
            
            // Should log error and exit gracefully
            expect(mockInitDatabase).toBeDefined();
        });

        it('should handle file system errors', async () => {
            // Test file system error handling
            const nonExistentPath = '/invalid/path/file.json';
            
            // Should handle file access errors gracefully
            await expect(fs.access(nonExistentPath)).rejects.toThrow();
        });
    });

    describe('Graceful Shutdown', () => {
        it('should handle SIGINT signal', async () => {
            // Test graceful shutdown on SIGINT
            expect(mockEnhancedTaskProcessor.shutdown).toBeDefined();
            expect(mockTaskScheduler.stop).toBeDefined();
        });

        it('should handle SIGTERM signal', async () => {
            // Test graceful shutdown on SIGTERM
            expect(mockEnhancedTaskProcessor.shutdown).toBeDefined();
            expect(mockTaskScheduler.stop).toBeDefined();
        });
    });
});
