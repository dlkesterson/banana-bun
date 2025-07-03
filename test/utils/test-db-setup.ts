import { Database } from 'bun:sqlite';
import { mock } from 'bun:test';

/**
 * Shared test database utilities for consistent mocking across test files
 */

export interface TestDbSetup {
    db: Database;
    mockGetDatabase: any;
    mockInitDatabase: any;
    mockGetDependencyHelper: any;
    cleanup: () => void;
}

/**
 * Creates a complete, isolated database setup for testing
 */
export function createTestDbSetup(): TestDbSetup {
    // Create a fresh in-memory database
    const db = new Database(':memory:');
    
    // Create standard mock functions
    const mockGetDatabase = mock(() => db);
    const mockInitDatabase = mock(() => Promise.resolve());
    const mockGetDependencyHelper = mock(() => ({
        addDependency: mock(() => {}),
        removeDependency: mock(() => {}),
        getDependencies: mock(() => []),
        hasCyclicDependency: mock(() => false),
        getExecutionOrder: mock(() => []),
        markTaskCompleted: mock(() => {}),
        getReadyTasks: mock(() => [])
    }));

    // Setup basic tables that most tests expect
    setupBasicTables(db);

    const cleanup = () => {
        try {
            if (!db.closed) {
                db.close();
            }
        } catch (error) {
            // Ignore cleanup errors
        }
        
        // Clear mock call history
        mockGetDatabase.mockClear();
        mockInitDatabase.mockClear();
        mockGetDependencyHelper.mockClear();
    };

    return {
        db,
        mockGetDatabase,
        mockInitDatabase,
        mockGetDependencyHelper,
        cleanup
    };
}

/**
 * Creates the standard database module mock
 */
export function createDbModuleMock(setup: TestDbSetup) {
    return {
        getDatabase: setup.mockGetDatabase,
        initDatabase: setup.mockInitDatabase,
        getDependencyHelper: setup.mockGetDependencyHelper
    };
}

/**
 * Sets up basic tables that most tests expect
 */
function setupBasicTables(db: Database) {
    // Tasks table
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            finished_at DATETIME,
            args TEXT,
            generator TEXT,
            tool TEXT,
            validation_errors TEXT,
            retry_count INTEGER DEFAULT 0,
            retry_policy_id INTEGER,
            last_retry_at DATETIME,
            next_retry_at DATETIME,
            schedule_id INTEGER,
            max_retries INTEGER DEFAULT 3,
            is_template BOOLEAN DEFAULT FALSE,
            cron_expression TEXT
        )
    `);

    // Task dependencies table
    db.run(`
        CREATE TABLE IF NOT EXISTS task_dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            depends_on_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
            UNIQUE(task_id, depends_on_id)
        )
    `);

    // Media metadata table
    db.run(`
        CREATE TABLE IF NOT EXISTS media_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            file_path TEXT NOT NULL,
            file_hash TEXT,
            extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Media transcripts table
    db.run(`
        CREATE TABLE IF NOT EXISTS media_transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            task_id INTEGER,
            transcript_text TEXT NOT NULL,
            language TEXT,
            whisper_model TEXT,
            summary TEXT,
            summary_style TEXT,
            summary_model TEXT,
            summary_tokens_used INTEGER,
            summary_processing_time_ms INTEGER,
            FOREIGN KEY (media_id) REFERENCES media_metadata(id)
        )
    `);

    // Create indexes
    db.run('CREATE INDEX IF NOT EXISTS idx_status ON tasks(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_parent ON tasks(parent_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_id)');
}

/**
 * Utility to setup module mocks with proper cleanup
 */
export function setupModuleMocks(mocks: Record<string, any>) {
    // Store original mock.module function if we need to restore it
    const originalMockModule = mock.module;
    
    // Apply all mocks
    Object.entries(mocks).forEach(([modulePath, mockImplementation]) => {
        mock.module(modulePath, mockImplementation);
    });

    // Return cleanup function
    return () => {
        mock.restore();
    };
}
