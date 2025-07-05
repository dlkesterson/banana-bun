/**
 * Global test setup configuration for Bun
 * Addresses PRD 4: Test Infrastructure Modernization
 */

import { beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

// Global test database instance
let globalTestDb: Database | null = null;
let mockDependencyHelper: any = null;

// Create comprehensive test database schema
function createTestTables(db: Database): void {
    // Create main tasks table
    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
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
            generator TEXT,
            tool TEXT,
            validation_errors TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            finished_at DATETIME
        )
    `);

    // Create media table
    db.run(`
        CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT UNIQUE,
            title TEXT,
            channel TEXT,
            file_path TEXT,
            downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create media_transcripts table for summarization tests
    db.run(`
        CREATE TABLE IF NOT EXISTS media_transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            transcript_text TEXT NOT NULL,
            summary TEXT,
            summary_style TEXT,
            summary_model TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (media_id) REFERENCES media(id)
        )
    `);

    // Create task_dependencies table
    db.run(`
        CREATE TABLE IF NOT EXISTS task_dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            depends_on_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id),
            FOREIGN KEY (depends_on_id) REFERENCES tasks(id)
        )
    `);

    // Create retry tables
    db.run(`
        CREATE TABLE IF NOT EXISTS retry_policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_type TEXT NOT NULL,
            max_retries INTEGER NOT NULL DEFAULT 3,
            backoff_strategy TEXT NOT NULL DEFAULT 'exponential',
            base_delay_ms INTEGER NOT NULL DEFAULT 1000,
            max_delay_ms INTEGER NOT NULL DEFAULT 30000,
            retry_multiplier REAL NOT NULL DEFAULT 2.0,
            retryable_errors TEXT,
            non_retryable_errors TEXT,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS retry_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            attempt_number INTEGER NOT NULL,
            attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            error_message TEXT,
            error_type TEXT,
            delay_ms INTEGER,
            success BOOLEAN NOT NULL DEFAULT 0,
            execution_time_ms INTEGER,
            FOREIGN KEY (task_id) REFERENCES tasks(id)
        )
    `);

    // Create scheduling tables
    db.run(`
        CREATE TABLE IF NOT EXISTS task_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_task_id INTEGER NOT NULL,
            cron_expression TEXT NOT NULL,
            timezone TEXT NOT NULL DEFAULT 'UTC',
            enabled BOOLEAN NOT NULL DEFAULT 1,
            next_run_at DATETIME NOT NULL,
            last_run_at DATETIME,
            run_count INTEGER NOT NULL DEFAULT 0,
            max_instances INTEGER NOT NULL DEFAULT 1,
            overlap_policy TEXT NOT NULL DEFAULT 'skip',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (template_task_id) REFERENCES tasks(id)
        )
    `);

    // Create media metadata table
    db.run(`
        CREATE TABLE IF NOT EXISTS media_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            tool_used TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id)
        )
    `);

    // Create user interactions table for MCP servers
    db.run(`
        CREATE TABLE IF NOT EXISTS user_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            session_id TEXT,
            interaction_type TEXT NOT NULL,
            content_type TEXT,
            query_text TEXT,
            results_count INTEGER,
            interaction_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create feedback tables for learning services
    db.run(`
        CREATE TABLE IF NOT EXISTS user_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            feedback_type TEXT NOT NULL,
            rating INTEGER,
            comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS learning_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_type TEXT NOT NULL,
            condition_pattern TEXT NOT NULL,
            action_recommendation TEXT NOT NULL,
            confidence_score REAL NOT NULL DEFAULT 0.0,
            usage_count INTEGER NOT NULL DEFAULT 0,
            success_rate REAL NOT NULL DEFAULT 0.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create indexes
    db.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type)');
    db.run('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_id)');
}

// Setup global mocks before all tests
beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';

    // Set BASE_PATH for consistent test environment
    if (!process.env.BASE_PATH) {
        const { mkdtempSync } = await import('fs');
        const { tmpdir } = await import('os');
        const { join } = await import('path');
        const testBasePath = mkdtempSync(join(tmpdir(), 'banana-bun-test-setup-'));
        process.env.BASE_PATH = testBasePath;
        console.log(`🧪 Test setup BASE_PATH: ${testBasePath}`);
    }

    // Initialize global test database
    globalTestDb = new Database(':memory:');
    createTestTables(globalTestDb);

    // Create mock dependency helper
    mockDependencyHelper = {
        addDependency: mock(() => { }),
        removeDependency: mock(() => { }),
        getDependencies: mock(() => []),
        hasCyclicDependency: mock(() => false),
        getExecutionOrder: mock(() => []),
        markTaskCompleted: mock(() => { }),
        getReadyTasks: mock(() => [])
    };

    // Mock the database module globally
    mock.module('../src/db', () => ({
        getDatabase: () => globalTestDb,
        getDependencyHelper: () => mockDependencyHelper,
        initDatabase: mock(() => Promise.resolve())
    }));

    console.log('🧪 Test infrastructure initialized with global database mock');
});

// Cleanup after all tests
afterAll(async () => {
    if (globalTestDb) {
        globalTestDb.close();
        globalTestDb = null;
    }
    console.log('🧹 Test cleanup completed');
});

// Reset mocks before each test
beforeEach(async () => {
    // Reset any global state
    process.env.NODE_ENV = 'test';

    // Ensure BASE_PATH is maintained
    if (!process.env.BASE_PATH) {
        const { mkdtempSync } = await import('fs');
        const { tmpdir } = await import('os');
        const { join } = await import('path');
        const testBasePath = mkdtempSync(join(tmpdir(), 'banana-bun-test-each-'));
        process.env.BASE_PATH = testBasePath;
    }

    // Clear all tables but keep schema
    if (globalTestDb) {
        const tables = ['tasks', 'media', 'media_transcripts', 'task_dependencies', 'retry_policies', 'retry_history', 'task_schedules', 'media_metadata', 'user_interactions', 'user_feedback', 'learning_rules'];
        for (const table of tables) {
            try {
                globalTestDb.run(`DELETE FROM ${table}`);
            } catch (error) {
                // Table might not exist, ignore
            }
        }
    }
});

// Cleanup after each test
afterEach(async () => {
    // Wait for any pending async operations
    await new Promise(resolve => setTimeout(resolve, 10));
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Helper functions for test validation
export function isValidTaskResult(received: any): boolean {
    return received &&
        typeof received.success === 'boolean' &&
        (received.success || typeof received.error === 'string');
}

// Export global test database getter
export function getGlobalTestDb(): Database | null {
    return globalTestDb;
}

export function isValidMCPResponse(received: any): boolean {
    return received &&
        (received.content || received.error) &&
        (!received.content || Array.isArray(received.content)) &&
        (!received.error || (typeof received.error.code === 'number' && typeof received.error.message === 'string'));
}
