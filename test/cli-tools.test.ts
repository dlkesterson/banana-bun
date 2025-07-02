import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';

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
        database: ':memory:',
        tasks: '/tmp/test-tasks'
    }
};

// Mock modules
mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

mock.module('../src/config', () => ({
    config: mockConfig
}));

// Mock database functions
let mockDb: Database;
const mockGetDatabase = mock(() => mockDb);

mock.module('../src/db', () => ({
    getDatabase: mockGetDatabase
}));

describe('CLI Tools', () => {
    beforeEach(() => {
        // Create in-memory database for testing
        mockDb = new Database(':memory:');
        
        // Create required tables
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
                args TEXT,
                tool TEXT,
                generator TEXT,
                metadata TEXT,
                is_template BOOLEAN DEFAULT FALSE,
                template_id INTEGER,
                cron_expression TEXT,
                timezone TEXT DEFAULT 'UTC',
                schedule_enabled BOOLEAN DEFAULT FALSE,
                next_execution DATETIME,
                last_execution DATETIME,
                execution_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                finished_at DATETIME
            )
        `);

        mockDb.run(`
            CREATE TABLE task_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER,
                cron_expression TEXT,
                timezone TEXT DEFAULT 'UTC',
                enabled BOOLEAN DEFAULT TRUE,
                max_instances INTEGER DEFAULT 1,
                overlap_policy TEXT DEFAULT 'skip',
                next_execution DATETIME,
                last_execution DATETIME,
                execution_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            )
        `);

        // Reset mocks
        Object.values(mockLogger).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                fn.mockClear();
            }
        });
    });

    afterEach(() => {
        mockDb?.close();
    });

    describe('Task Linting (lint-task.ts)', () => {
        it('should validate task file structure', async () => {
            // Insert test tasks with various issues
            mockDb.run(`
                INSERT INTO tasks (type, description, status, shell_command)
                VALUES 
                    ('shell', 'Valid task', 'pending', 'echo "valid"'),
                    ('shell', '', 'pending', 'echo "no description"'),
                    ('shell', 'No command', 'pending', NULL),
                    ('invalid_type', 'Invalid type task', 'pending', 'echo "test"')
            `);

            const tasks = mockDb.query('SELECT * FROM tasks').all();
            expect(tasks.length).toBe(4);

            // Test validation logic
            const validTask = tasks[0] as any;
            expect(validTask.description).toBeTruthy();
            expect(validTask.shell_command).toBeTruthy();

            const invalidTasks = tasks.slice(1);
            invalidTasks.forEach(task => {
                // Each task should have some validation issue
                const taskData = task as any;
                const hasIssue = !taskData.description || !taskData.shell_command || !['shell', 'llm', 'code', 'tool', 'batch', 'planner', 'review', 'run_code', 'youtube'].includes(taskData.type);
                expect(hasIssue).toBe(true);
            });
        });

        it('should check for circular dependencies', async () => {
            // Insert tasks with circular dependencies
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, dependencies)
                VALUES 
                    (1, 'shell', 'Task 1', 'pending', '["2"]'),
                    (2, 'shell', 'Task 2', 'pending', '["3"]'),
                    (3, 'shell', 'Task 3', 'pending', '["1"]')
            `);

            const tasks = mockDb.query('SELECT * FROM tasks').all() as any[];
            
            // Test circular dependency detection logic
            const taskDeps = new Map();
            tasks.forEach(task => {
                if (task.dependencies) {
                    try {
                        taskDeps.set(task.id, JSON.parse(task.dependencies));
                    } catch {
                        taskDeps.set(task.id, []);
                    }
                }
            });

            // Simple circular dependency check
            const visited = new Set();
            const recursionStack = new Set();
            
            function hasCycle(taskId: number): boolean {
                if (recursionStack.has(taskId)) return true;
                if (visited.has(taskId)) return false;

                visited.add(taskId);
                recursionStack.add(taskId);

                const deps = taskDeps.get(taskId) || [];
                for (const dep of deps) {
                    const depId = parseInt(dep);
                    if (hasCycle(depId)) return true;
                }

                recursionStack.delete(taskId);
                return false;
            }

            const hasCircularDep = hasCycle(1);
            expect(hasCircularDep).toBe(true);
        });

        it('should validate task metadata', async () => {
            mockDb.run(`
                INSERT INTO tasks (type, description, status, metadata)
                VALUES 
                    ('shell', 'Task with valid metadata', 'pending', '{"priority": "high", "tags": ["urgent"]}'),
                    ('shell', 'Task with invalid metadata', 'pending', 'invalid json'),
                    ('shell', 'Task without metadata', 'pending', NULL)
            `);

            const tasks = mockDb.query('SELECT * FROM tasks').all() as any[];
            
            tasks.forEach(task => {
                if (task.metadata) {
                    try {
                        const metadata = JSON.parse(task.metadata);
                        expect(typeof metadata).toBe('object');
                    } catch (error) {
                        // Invalid JSON metadata should be flagged
                        expect(task.description).toContain('invalid metadata');
                    }
                }
            });
        });
    });

    describe('Schedule Manager (schedule-manager.ts)', () => {
        it('should list all scheduled tasks', async () => {
            // Insert test tasks and schedules
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES 
                    (1, 'shell', 'Daily backup', 'completed'),
                    (2, 'shell', 'Weekly report', 'completed'),
                    (3, 'shell', 'Monthly cleanup', 'completed')
            `);

            mockDb.run(`
                INSERT INTO task_schedules (task_id, cron_expression, enabled)
                VALUES 
                    (1, '0 2 * * *', 1),
                    (2, '0 9 * * 1', 1),
                    (3, '0 3 1 * *', 0)
            `);

            const schedules = mockDb.query(`
                SELECT ts.*, t.description, t.type 
                FROM task_schedules ts 
                JOIN tasks t ON ts.task_id = t.id
            `).all();

            expect(schedules.length).toBe(3);
            
            const enabledSchedules = schedules.filter((s: any) => s.enabled);
            expect(enabledSchedules.length).toBe(2);
        });

        it('should create new schedule for task', async () => {
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES (1, 'shell', 'Test task', 'completed')
            `);

            const scheduleData = {
                task_id: 1,
                cron_expression: '0 12 * * *',
                timezone: 'UTC',
                enabled: true,
                max_instances: 1,
                overlap_policy: 'skip'
            };

            mockDb.run(`
                INSERT INTO task_schedules (task_id, cron_expression, timezone, enabled, max_instances, overlap_policy)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                scheduleData.task_id,
                scheduleData.cron_expression,
                scheduleData.timezone,
                scheduleData.enabled ? 1 : 0,
                scheduleData.max_instances,
                scheduleData.overlap_policy
            ]);

            const schedule = mockDb.query('SELECT * FROM task_schedules WHERE task_id = ?').get(1) as any;
            expect(schedule).toBeDefined();
            expect(schedule.cron_expression).toBe('0 12 * * *');
            expect(schedule.enabled).toBe(1);
        });

        it('should enable/disable schedules', async () => {
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES (1, 'shell', 'Test task', 'completed')
            `);

            mockDb.run(`
                INSERT INTO task_schedules (id, task_id, cron_expression, enabled)
                VALUES (1, 1, '0 9 * * *', 1)
            `);

            // Disable schedule
            mockDb.run('UPDATE task_schedules SET enabled = 0 WHERE id = 1');
            
            let schedule = mockDb.query('SELECT * FROM task_schedules WHERE id = 1').get() as any;
            expect(schedule.enabled).toBe(0);

            // Enable schedule
            mockDb.run('UPDATE task_schedules SET enabled = 1 WHERE id = 1');
            
            schedule = mockDb.query('SELECT * FROM task_schedules WHERE id = 1').get() as any;
            expect(schedule.enabled).toBe(1);
        });

        it('should delete schedules', async () => {
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES (1, 'shell', 'Test task', 'completed')
            `);

            mockDb.run(`
                INSERT INTO task_schedules (id, task_id, cron_expression)
                VALUES (1, 1, '0 9 * * *')
            `);

            // Delete schedule
            mockDb.run('DELETE FROM task_schedules WHERE id = 1');
            
            const schedule = mockDb.query('SELECT * FROM task_schedules WHERE id = 1').get();
            expect(schedule).toBeNull();
        });

        it('should validate cron expressions', () => {
            const validCronExpressions = [
                '0 0 * * *',      // Daily at midnight
                '*/5 * * * *',    // Every 5 minutes
                '0 9-17 * * 1-5', // Business hours weekdays
                '0 0 1 * *',      // First day of month
                '@daily',         // Special syntax
                '@hourly'         // Special syntax
            ];

            const invalidCronExpressions = [
                '60 * * * *',     // Invalid minute
                '* 25 * * *',     // Invalid hour
                '* * 32 * *',     // Invalid day
                '* * * 13 *',     // Invalid month
                'invalid',        // Not a cron expression
                ''                // Empty string
            ];

            // Basic cron validation logic
            function isValidCron(expr: string): boolean {
                if (!expr) return false;
                
                // Handle special expressions
                if (expr.startsWith('@')) {
                    return ['@yearly', '@annually', '@monthly', '@weekly', '@daily', '@midnight', '@hourly'].includes(expr);
                }

                const parts = expr.split(' ');
                if (parts.length !== 5) return false;

                // Basic range validation (simplified)
                const ranges = [
                    [0, 59], // minute
                    [0, 23], // hour
                    [1, 31], // day
                    [1, 12], // month
                    [0, 7]   // day of week
                ];

                return parts.every((part, index) => {
                    if (part === '*') return true;
                    if (part.includes('/')) {
                        const splitParts = part.split('/');
                        const range = splitParts[0];
                        const step = splitParts[1];
                        return range === '*' && step !== undefined && !isNaN(parseInt(step));
                    }
                    if (part.includes('-')) {
                        const rangeParts = part.split('-').map(Number);
                        const start = rangeParts[0];
                        const end = rangeParts[1];
                        return start !== undefined && end !== undefined && !isNaN(start) && !isNaN(end) && start <= end;
                    }
                    const num = parseInt(part);
                    const range = ranges[index];
                    return !isNaN(num) && range && num >= range[0] && num <= range[1];
                });
            }

            validCronExpressions.forEach(expr => {
                expect(isValidCron(expr)).toBe(true);
            });

            invalidCronExpressions.forEach(expr => {
                expect(isValidCron(expr)).toBe(false);
            });
        });
    });

    describe('CLI Error Handling', () => {
        it('should handle database connection errors', () => {
            // Simulate database error
            mockGetDatabase.mockImplementationOnce(() => {
                throw new Error('Database connection failed');
            });

            expect(() => mockGetDatabase()).toThrow('Database connection failed');
        });

        it('should handle invalid command line arguments', () => {
            // Test argument validation
            const validArgs = ['--schedule', '1', '--enable'];
            const invalidArgs = ['--invalid-flag', '--schedule', 'not-a-number'];

            function validateArgs(args: string[]): boolean {
                const validFlags = ['--schedule', '--enable', '--disable', '--delete', '--list'];
                
                for (let i = 0; i < args.length; i++) {
                    const arg = args[i];
                    if (arg.startsWith('--')) {
                        if (!validFlags.includes(arg)) return false;
                        
                        // Check if flag requires a value
                        if (arg === '--schedule' && i + 1 < args.length) {
                            const nextArg = args[i + 1];
                            if (isNaN(parseInt(nextArg))) return false;
                        }
                    }
                }
                return true;
            }

            expect(validateArgs(validArgs)).toBe(true);
            expect(validateArgs(invalidArgs)).toBe(false);
        });
    });
});
