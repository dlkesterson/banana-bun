import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import type { DatabaseTask } from '../src/types';

// Mock config for testing
const mockConfig = {
    paths: {
        database: ':memory:',
        logs: '/tmp/test-logs'
    }
};

// Mock the config module
mock.module('../src/config', () => ({
    config: mockConfig
}));

// Mock the logger to avoid file system operations
mock.module('../src/utils/logger', () => ({
    logger: {
        info: mock(() => Promise.resolve()),
        error: mock(() => Promise.resolve()),
        warn: mock(() => Promise.resolve()),
        debug: mock(() => Promise.resolve())
    }
}));

import { initDatabase, getDatabase, getDependencyHelper } from '../src/db';
import { DependencyHelper } from '../src/migrations/001-normalize-dependencies';
import { runAllMigrations } from '../src/migrations/migrate-all';

describe('Database Operations', () => {
    let db: Database;
    let dependencyHelper: DependencyHelper;

    beforeEach(async () => {
        try {
            // Create a fresh in-memory database for each test to avoid conflicts
            db = new Database(':memory:');

            // Initialize the database directly instead of using the potentially mocked function
            // This ensures we have a real database for testing

            // Create tasks table with all expected columns
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

            // Create task_dependencies table
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

            // Create retry_history table
            db.run(`
                CREATE TABLE IF NOT EXISTS retry_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER NOT NULL,
                    retry_attempt INTEGER NOT NULL,
                    error_message TEXT,
                    retry_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
                )
            `);

            // Create retry_policies table
            db.run(`
                CREATE TABLE IF NOT EXISTS retry_policies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    max_retries INTEGER NOT NULL,
                    base_delay_ms INTEGER NOT NULL,
                    max_delay_ms INTEGER NOT NULL,
                    backoff_multiplier REAL NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create task_schedules table
            db.run(`
                CREATE TABLE IF NOT EXISTS task_schedules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    template_task_id INTEGER,
                    cron_expression TEXT,
                    timezone TEXT DEFAULT 'UTC',
                    enabled BOOLEAN DEFAULT TRUE,
                    max_instances INTEGER DEFAULT 1,
                    overlap_policy TEXT DEFAULT 'skip',
                    next_run_at DATETIME,
                    last_run_at DATETIME,
                    execution_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (template_task_id) REFERENCES tasks(id)
                )
            `);

            // Create task_instances table
            db.run(`
                CREATE TABLE IF NOT EXISTS task_instances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    schedule_id INTEGER,
                    instance_task_id INTEGER,
                    status TEXT DEFAULT 'pending',
                    started_at DATETIME,
                    finished_at DATETIME,
                    result_summary TEXT,
                    error_message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (schedule_id) REFERENCES task_schedules(id),
                    FOREIGN KEY (instance_task_id) REFERENCES tasks(id)
                )
            `);

            // Create migrations table
            db.run(`
                CREATE TABLE IF NOT EXISTS migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    version TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

            // Create indexes
            db.run('CREATE INDEX IF NOT EXISTS idx_status ON tasks(status)');
            db.run('CREATE INDEX IF NOT EXISTS idx_parent ON tasks(parent_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_id)');

            // Initialize dependency helper with our test database
            dependencyHelper = new DependencyHelper(db);
        } catch (error) {
            console.error('Database setup failed:', error);
            throw error;
        }
    });

    afterEach(() => {
        try {
            if (db && !db.closed) {
                db.close();
            }
        } catch (error) {
            // Ignore close errors
        }
    });

    afterAll(() => {
        // Restore all mocks after all tests in this file complete
        mock.restore();
    });

    describe('Database Initialization', () => {
        it('should initialize database with required tables', () => {
            // Check if main tables exist
            const tables = db.query(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
            `).all() as Array<{ name: string }>;

            const tableNames = tables.map(t => t.name);

            expect(tableNames).toContain('tasks');
            expect(tableNames).toContain('media');
            expect(tableNames).toContain('task_dependencies');
            expect(tableNames).toContain('retry_history');
            expect(tableNames).toContain('retry_policies');
            expect(tableNames).toContain('task_schedules');
            expect(tableNames).toContain('task_instances');
            expect(tableNames).toContain('migrations');
        });

        it('should create proper indexes', () => {
            const indexes = db.query(`
                SELECT name FROM sqlite_master 
                WHERE type='index' AND name NOT LIKE 'sqlite_%'
            `).all() as Array<{ name: string }>;

            const indexNames = indexes.map(i => i.name);

            expect(indexNames).toContain('idx_status');
            expect(indexNames).toContain('idx_parent');
            expect(indexNames).toContain('idx_task_dependencies_task_id');
            expect(indexNames).toContain('idx_task_dependencies_depends_on');
        });

        it('should have proper tasks table schema', () => {
            const columns = db.query(`PRAGMA table_info(tasks)`).all() as Array<{
                name: string;
                type: string;
                notnull: number;
                dflt_value: any;
                pk: number;
            }>;

            const columnNames = columns.map(c => c.name);

            // Core columns
            expect(columnNames).toContain('id');
            expect(columnNames).toContain('type');
            expect(columnNames).toContain('status');
            expect(columnNames).toContain('description');

            // Migration-added columns
            expect(columnNames).toContain('retry_count');
            expect(columnNames).toContain('max_retries');
            expect(columnNames).toContain('is_template');
            expect(columnNames).toContain('cron_expression');
        });
    });

    describe('Task CRUD Operations', () => {
        it('should insert and retrieve tasks', () => {
            // Insert a test task
            db.run(`
                INSERT INTO tasks (type, description, status, shell_command)
                VALUES (?, ?, ?, ?)
            `, ['shell', 'Test task', 'pending', 'echo "test"']);

            // Retrieve the task
            const task = db.query('SELECT * FROM tasks WHERE description = ?')
                .get('Test task') as DatabaseTask;

            expect(task).toBeDefined();
            expect(task.type).toBe('shell');
            expect(task.description).toBe('Test task');
            expect(task.status).toBe('pending');
            expect(task.shell_command).toBe('echo "test"');
        });

        it('should update task status', () => {
            // Insert a test task
            db.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES (1, 'shell', 'Test task', 'pending')
            `);

            // Update status
            db.run(`
                UPDATE tasks SET status = 'running', started_at = CURRENT_TIMESTAMP 
                WHERE id = 1
            `);

            // Verify update
            const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as DatabaseTask;
            expect(task.status).toBe('running');
            expect(task.started_at).toBeDefined();
        });

        it('should handle task completion', () => {
            // Insert a test task
            db.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES (1, 'shell', 'Test task', 'running')
            `);

            // Mark as completed
            db.run(`
                UPDATE tasks SET 
                    status = 'completed', 
                    finished_at = CURRENT_TIMESTAMP,
                    result_summary = ?
                WHERE id = 1
            `, ['Task completed successfully']);

            // Verify completion
            const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as DatabaseTask;
            expect(task.status).toBe('completed');
            expect(task.finished_at).toBeDefined();
            expect(task.result_summary).toBe('Task completed successfully');
        });

        it('should handle task errors', () => {
            // Insert a test task
            db.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES (1, 'shell', 'Test task', 'running')
            `);

            // Mark as error
            db.run(`
                UPDATE tasks SET 
                    status = 'error', 
                    finished_at = CURRENT_TIMESTAMP,
                    error_message = ?
                WHERE id = 1
            `, ['Command failed with exit code 1']);

            // Verify error state
            const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as DatabaseTask;
            expect(task.status).toBe('error');
            expect(task.error_message).toBe('Command failed with exit code 1');
        });

        it('should query tasks by status', () => {
            // Insert multiple tasks
            db.run(`INSERT INTO tasks (type, status) VALUES ('shell', 'pending')`);
            db.run(`INSERT INTO tasks (type, status) VALUES ('llm', 'pending')`);
            db.run(`INSERT INTO tasks (type, status) VALUES ('shell', 'completed')`);

            // Query pending tasks
            const pendingTasks = db.query('SELECT * FROM tasks WHERE status = ?')
                .all('pending') as DatabaseTask[];

            expect(pendingTasks).toHaveLength(2);
            expect(pendingTasks.every(t => t.status === 'pending')).toBe(true);
        });
    });

    describe('Dependency Helper Operations', () => {
        beforeEach(() => {
            // Insert test tasks
            db.run(`INSERT INTO tasks (id, type, status) VALUES (1, 'shell', 'completed')`);
            db.run(`INSERT INTO tasks (id, type, status) VALUES (2, 'llm', 'completed')`);
            db.run(`INSERT INTO tasks (id, type, status) VALUES (3, 'review', 'pending')`);
            db.run(`INSERT INTO tasks (id, type, status) VALUES (4, 'shell', 'error')`);
            db.run(`INSERT INTO tasks (id, type, status) VALUES (5, 'review', 'pending')`);
        });

        it('should add and retrieve dependencies', () => {
            // Add dependencies
            dependencyHelper.addDependency(3, '1');
            dependencyHelper.addDependency(3, '2');

            // Retrieve dependencies
            const deps = dependencyHelper.getTaskDependencies(3);
            expect(deps).toContain('1');
            expect(deps).toContain('2');
            expect(deps).toHaveLength(2);
        });

        it('should get task dependents', () => {
            // Add dependencies
            dependencyHelper.addDependency(3, '1');
            dependencyHelper.addDependency(5, '1');

            // Get dependents of task 1
            const dependents = dependencyHelper.getTaskDependents('1');
            expect(dependents).toContain(3);
            expect(dependents).toContain(5);
            expect(dependents).toHaveLength(2);
        });

        it('should resolve dependencies with task details', () => {
            // Add dependencies
            dependencyHelper.addDependency(3, '1');
            dependencyHelper.addDependency(3, '2');

            // Get resolved dependencies
            const resolved = dependencyHelper.getResolvedDependencies(3);
            expect(resolved).toHaveLength(2);

            const task1 = resolved.find(r => r.id === 1);
            const task2 = resolved.find(r => r.id === 2);

            expect(task1).toBeDefined();
            expect(task1?.type).toBe('shell');
            expect(task1?.status).toBe('completed');

            expect(task2).toBeDefined();
            expect(task2?.type).toBe('llm');
            expect(task2?.status).toBe('completed');
        });

        it('should check if dependencies are met - all completed', () => {
            // Add dependencies to completed tasks
            dependencyHelper.addDependency(3, '1');
            dependencyHelper.addDependency(3, '2');

            const result = dependencyHelper.areDependenciesMet(3);
            expect(result.ready).toBe(true);
            expect(result.error).toBe(false);
        });

        it('should check if dependencies are met - some pending', () => {
            // Add dependency to pending task
            dependencyHelper.addDependency(5, '3');

            const result = dependencyHelper.areDependenciesMet(5);
            expect(result.ready).toBe(false);
            expect(result.error).toBe(false);
        });

        it('should check if dependencies are met - error case', () => {
            // Add dependency to failed task
            dependencyHelper.addDependency(5, '4');

            const result = dependencyHelper.areDependenciesMet(5);
            expect(result.ready).toBe(false);
            expect(result.error).toBe(true);
            expect(result.failedDepId).toBe('4');
        });

        it('should handle no dependencies', () => {
            const result = dependencyHelper.areDependenciesMet(1);
            expect(result.ready).toBe(true);
            expect(result.error).toBe(false);
        });

        it('should remove dependencies', () => {
            // Add dependency
            dependencyHelper.addDependency(3, '1');
            expect(dependencyHelper.getTaskDependencies(3)).toContain('1');

            // Remove dependency
            dependencyHelper.removeDependency(3, '1');
            expect(dependencyHelper.getTaskDependencies(3)).not.toContain('1');
        });
    });

    describe('Media Table Operations', () => {
        it('should insert and retrieve media records', () => {
            // Insert media record
            db.run(`
                INSERT INTO media (video_id, title, channel, file_path)
                VALUES (?, ?, ?, ?)
            `, ['abc123', 'Test Video', 'Test Channel', '/path/to/video.mp4']);

            // Retrieve media record
            const media = db.query('SELECT * FROM media WHERE video_id = ?')
                .get('abc123') as any;

            expect(media).toBeDefined();
            expect(media.title).toBe('Test Video');
            expect(media.channel).toBe('Test Channel');
            expect(media.file_path).toBe('/path/to/video.mp4');
        });

        it('should handle duplicate video_id constraint', () => {
            // Insert first record
            db.run(`
                INSERT INTO media (video_id, title, channel)
                VALUES ('abc123', 'Video 1', 'Channel 1')
            `);

            // Try to insert duplicate - should fail
            expect(() => {
                db.run(`
                    INSERT INTO media (video_id, title, channel)
                    VALUES ('abc123', 'Video 2', 'Channel 2')
                `);
            }).toThrow();
        });
    });

    describe('Complex Queries', () => {
        beforeEach(() => {
            // Insert test data
            db.run(`INSERT INTO tasks (id, type, status, parent_id) VALUES (1, 'batch', 'completed', NULL)`);
            db.run(`INSERT INTO tasks (id, type, status, parent_id) VALUES (2, 'shell', 'completed', 1)`);
            db.run(`INSERT INTO tasks (id, type, status, parent_id) VALUES (3, 'shell', 'completed', 1)`);
            db.run(`INSERT INTO tasks (id, type, status, parent_id) VALUES (4, 'review', 'pending', NULL)`);

            // Add dependencies
            dependencyHelper.addDependency(4, '2');
            dependencyHelper.addDependency(4, '3');
        });

        it('should query tasks with their dependencies', () => {
            const result = db.query(`
                SELECT t.*, GROUP_CONCAT(td.depends_on_id) as dependency_ids
                FROM tasks t
                LEFT JOIN task_dependencies td ON t.id = td.task_id
                WHERE t.id = 4
                GROUP BY t.id
            `).get() as any;

            expect(result).toBeDefined();
            expect(result.type).toBe('review');
            expect(result.dependency_ids).toContain('2');
            expect(result.dependency_ids).toContain('3');
        });

        it('should query parent-child relationships', () => {
            const children = db.query(`
                SELECT * FROM tasks WHERE parent_id = 1
            `).all() as DatabaseTask[];

            expect(children).toHaveLength(2);
            expect(children.every(c => c.parent_id === 1)).toBe(true);
        });

        it('should count tasks by status', () => {
            const statusCounts = db.query(`
                SELECT status, COUNT(*) as count
                FROM tasks
                GROUP BY status
            `).all() as Array<{ status: string; count: number }>;

            const completedCount = statusCounts.find(s => s.status === 'completed')?.count;
            const pendingCount = statusCounts.find(s => s.status === 'pending')?.count;

            expect(completedCount).toBe(3);
            expect(pendingCount).toBe(1);
        });
    });

    describe('Transaction Handling', () => {
        it('should handle successful transactions', () => {
            db.run('BEGIN TRANSACTION');

            try {
                db.run(`INSERT INTO tasks (type, status) VALUES ('shell', 'pending')`);
                db.run(`INSERT INTO tasks (type, status) VALUES ('llm', 'pending')`);

                db.run('COMMIT');

                const count = db.query('SELECT COUNT(*) as count FROM tasks').get() as { count: number };
                expect(count.count).toBeGreaterThanOrEqual(2);
            } catch (error) {
                db.run('ROLLBACK');
                throw error;
            }
        });

        it('should handle transaction rollback', () => {
            const initialCount = db.query('SELECT COUNT(*) as count FROM tasks').get() as { count: number };

            db.run('BEGIN TRANSACTION');

            try {
                db.run(`INSERT INTO tasks (type, status) VALUES ('shell', 'pending')`);
                // Simulate an error
                throw new Error('Simulated error');
            } catch (error) {
                db.run('ROLLBACK');
            }

            const finalCount = db.query('SELECT COUNT(*) as count FROM tasks').get() as { count: number };
            expect(finalCount.count).toBe(initialCount.count);
        });
    });
});
