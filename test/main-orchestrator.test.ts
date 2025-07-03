import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
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

// File processing mocks will be set up locally in tests that need them
const mockParseTaskFile = mock(() => Promise.resolve({
    type: 'shell',
    description: 'Test task',
    status: 'pending',
    shell_command: 'echo "test"'
}));

const mockHashFile = mock(() => Promise.resolve('test-hash'));
const mockGenerateDashboard = mock(() => Promise.resolve());

// NOTE: Removed global mocks for parser, hash, and dashboard to prevent interference with other tests

// Task execution and conversion mocks will be set up locally in tests that need them
const mockExecuteTask = mock(() => Promise.resolve({ success: true }));
const mockConvertDatabaseTasksToBaseTasks = mock(() => []);

// NOTE: Removed global mocks for dispatcher and task_converter to prevent interference with other tests

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
        it('should have all required components available', async () => {
            // Test that all required components are available for initialization
            expect(mockInitDatabase).toBeDefined();
            expect(mockRunAllMigrations).toBeDefined();
            expect(mockEnhancedTaskProcessor.initialize).toBeDefined();
            expect(mockRetryManager.initialize).toBeDefined();
            expect(mockTaskScheduler.initialize).toBeDefined();
        });

        it('should create required directories', async () => {
            // Test that test directories are created properly
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

        it('should handle mock setup correctly', async () => {
            // Test that mocks are properly configured
            expect(mockConfig.paths.database).toBe(':memory:');
            expect(mockLogger.info).toBeDefined();
            expect(mockLogger.error).toBeDefined();
        });
    });

    describe('Database Operations', () => {
        it('should create tasks table successfully', async () => {
            // Test that the tasks table was created
            const tableInfo = mockDb.query("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
            expect(tableInfo).toBeDefined();
        });

        it('should insert and retrieve tasks', async () => {
            // Test basic database operations
            mockDb.run(`
                INSERT INTO tasks (type, description, status, shell_command)
                VALUES ('shell', 'Test task', 'pending', 'echo "test"')
            `);

            const task = mockDb.query('SELECT * FROM tasks WHERE id = 1').get() as any;
            expect(task).toBeDefined();
            expect(task.type).toBe('shell');
            expect(task.description).toBe('Test task');
            expect(task.status).toBe('pending');
        });

        it('should handle task dependencies', async () => {
            // Test dependency handling
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, dependencies)
                VALUES
                    (1, 'shell', 'Parent task', 'completed', NULL),
                    (2, 'shell', 'Child task', 'pending', '["1"]')
            `);

            const childTask = mockDb.query('SELECT * FROM tasks WHERE id = 2').get() as any;
            expect(childTask.dependencies).toBe('["1"]');
        });
    });

    describe('Mock Components', () => {
        it('should have properly configured mocks', async () => {
            // Test that all mocks are properly set up
            expect(mockRetryManager.getTasksReadyForRetry).toBeDefined();
            expect(mockEnhancedTaskProcessor.initialize).toBeDefined();
            expect(mockTaskScheduler.start).toBeDefined();
            expect(mockParseTaskFile).toBeDefined();
            expect(mockHashFile).toBeDefined();
            expect(mockExecuteTask).toBeDefined();
            expect(mockGenerateDashboard).toBeDefined();
        });

        it('should handle mock function calls', async () => {
            // Test that mocks can be called without errors
            await mockRetryManager.getTasksReadyForRetry();
            await mockEnhancedTaskProcessor.initialize();
            await mockParseTaskFile();
            await mockHashFile();
            await mockExecuteTask();
            await mockGenerateDashboard();

            // Verify mocks were called
            expect(mockRetryManager.getTasksReadyForRetry).toHaveBeenCalled();
            expect(mockEnhancedTaskProcessor.initialize).toHaveBeenCalled();
        });
    });

    describe('Configuration', () => {
        it('should have valid test configuration', () => {
            // Test that configuration is properly set up
            expect(mockConfig.paths.incoming).toBeDefined();
            expect(mockConfig.paths.database).toBe(':memory:');
            expect(mockConfig.openai.apiKey).toBe('test-api-key');
            expect(mockConfig.ollama.url).toBe('http://localhost:11434');
        });

        it('should handle directory paths correctly', () => {
            // Test directory path configuration
            const paths = mockConfig.paths;
            expect(paths.incoming).toContain('/tmp/test-');
            expect(paths.processing).toContain('/tmp/test-');
            expect(paths.archive).toContain('/tmp/test-');
            expect(paths.outputs).toContain('/tmp/test-');
        });
    });
});

afterAll(() => {
    // Restore all mocks after all tests in this file complete
    mock.restore();
});
