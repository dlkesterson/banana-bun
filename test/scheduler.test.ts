import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CronParser } from '../src/scheduler/cron-parser';
import { TaskScheduler } from '../src/scheduler/task-scheduler';
import { Database } from 'bun:sqlite';

describe('Scheduler System', () => {
    describe('CronParser', () => {
        let parser: CronParser;

        beforeEach(() => {
            parser = new CronParser();
        });

        describe('Cron Expression Parsing', () => {
            it('should parse valid cron expressions', () => {
                const validExpressions = [
                    '0 0 * * *',     // Daily at midnight
                    '*/5 * * * *',   // Every 5 minutes
                    '0 9-17 * * 1-5', // Business hours weekdays
                    '0 0 1 * *',     // First day of month
                    '0 0 * * 0'      // Every Sunday
                ];

                validExpressions.forEach(expr => {
                    expect(() => parser.parse(expr)).not.toThrow();
                });
            });

            it('should reject invalid cron expressions', () => {
                const invalidExpressions = [
                    '60 * * * *',    // Invalid minute
                    '* 25 * * *',    // Invalid hour
                    '* * 32 * *',    // Invalid day
                    '* * * 13 *',    // Invalid month
                    '* * * * 8',     // Invalid day of week
                    'invalid'        // Not a cron expression
                ];

                invalidExpressions.forEach(expr => {
                    expect(() => parser.parse(expr)).toThrow();
                });
            });

            it('should calculate next execution time correctly', () => {
                const now = new Date('2024-01-01T10:00:00Z');
                
                // Every hour at minute 0
                const nextHour = parser.getNextExecution('0 * * * *', now);
                expect(nextHour.getHours()).toBe(11);
                expect(nextHour.getMinutes()).toBe(0);

                // Daily at midnight
                const nextMidnight = parser.getNextExecution('0 0 * * *', now);
                expect(nextMidnight.getDate()).toBe(2);
                expect(nextMidnight.getHours()).toBe(0);
                expect(nextMidnight.getMinutes()).toBe(0);
            });

            it('should handle timezone considerations', () => {
                const now = new Date('2024-01-01T10:00:00Z');
                const timezone = 'America/New_York';
                
                const nextExecution = parser.getNextExecution('0 9 * * *', now, timezone);
                expect(nextExecution).toBeInstanceOf(Date);
            });
        });

        describe('Special Cron Expressions', () => {
            it('should handle @yearly, @monthly, @weekly, @daily shortcuts', () => {
                const shortcuts = ['@yearly', '@monthly', '@weekly', '@daily', '@hourly'];
                
                shortcuts.forEach(shortcut => {
                    expect(() => parser.parse(shortcut)).not.toThrow();
                });
            });

            it('should convert shortcuts to standard cron format', () => {
                expect(parser.parse('@daily')).toBe('0 0 * * *');
                expect(parser.parse('@hourly')).toBe('0 * * * *');
                expect(parser.parse('@weekly')).toBe('0 0 * * 0');
            });
        });
    });

    describe('TaskScheduler', () => {
        let scheduler: TaskScheduler;
        let db: Database;

        beforeEach(async () => {
            // Create in-memory database for testing
            db = new Database(':memory:');
            
            // Create required tables
            db.run(`
                CREATE TABLE tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT,
                    description TEXT,
                    status TEXT,
                    shell_command TEXT,
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
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
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

            db.run(`
                CREATE TABLE task_instances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    schedule_id INTEGER,
                    task_id INTEGER,
                    status TEXT DEFAULT 'pending',
                    started_at DATETIME,
                    finished_at DATETIME,
                    result_summary TEXT,
                    error_message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (schedule_id) REFERENCES task_schedules(id),
                    FOREIGN KEY (task_id) REFERENCES tasks(id)
                )
            `);

            scheduler = new TaskScheduler(db);
        });

        afterEach(() => {
            scheduler.stop();
            db.close();
        });

        describe('Schedule Creation', () => {
            it('should create a new schedule for a task', async () => {
                // Insert a test task
                db.run(`
                    INSERT INTO tasks (id, type, description, shell_command, status)
                    VALUES (1, 'shell', 'Test scheduled task', 'echo "scheduled"', 'completed')
                `);

                const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
                const scheduleId = await scheduler.createSchedule(task, '0 9 * * *');

                expect(scheduleId).toBeNumber();
                expect(scheduleId).toBeGreaterThan(0);

                // Verify schedule was created
                const schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId) as any;
                expect(schedule).toBeDefined();
                expect(schedule.task_id).toBe(1);
                expect(schedule.cron_expression).toBe('0 9 * * *');
                expect(schedule.enabled).toBe(1);
            });

            it('should set next execution time when creating schedule', async () => {
                db.run(`
                    INSERT INTO tasks (id, type, description, status)
                    VALUES (1, 'shell', 'Test task', 'completed')
                `);

                const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
                const scheduleId = await scheduler.createSchedule(task, '0 0 * * *');

                const schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId) as any;
                expect(schedule.next_execution).toBeDefined();
                expect(new Date(schedule.next_execution)).toBeInstanceOf(Date);
            });

            it('should handle schedule options', async () => {
                db.run(`
                    INSERT INTO tasks (id, type, description, status)
                    VALUES (1, 'shell', 'Test task', 'completed')
                `);

                const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
                const options = {
                    timezone: 'America/New_York',
                    maxInstances: 3,
                    overlapPolicy: 'queue' as const
                };

                const scheduleId = await scheduler.createSchedule(task, '*/5 * * * *', options);

                const schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId) as any;
                expect(schedule.timezone).toBe('America/New_York');
                expect(schedule.max_instances).toBe(3);
                expect(schedule.overlap_policy).toBe('queue');
            });
        });

        describe('Schedule Management', () => {
            let scheduleId: number;

            beforeEach(async () => {
                db.run(`
                    INSERT INTO tasks (id, type, description, status)
                    VALUES (1, 'shell', 'Test task', 'completed')
                `);

                const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
                scheduleId = await scheduler.createSchedule(task, '0 9 * * *');
            });

            it('should enable and disable schedules', async () => {
                await scheduler.enableSchedule(scheduleId);
                let schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId) as any;
                expect(schedule.enabled).toBe(1);

                await scheduler.disableSchedule(scheduleId);
                schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId) as any;
                expect(schedule.enabled).toBe(0);
            });

            it('should delete schedules', async () => {
                await scheduler.deleteSchedule(scheduleId);

                const schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId);
                expect(schedule).toBeUndefined();
            });

            it('should update schedule cron expression', async () => {
                await scheduler.updateSchedule(scheduleId, '0 10 * * *');

                const schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId) as any;
                expect(schedule.cron_expression).toBe('0 10 * * *');
                expect(schedule.next_execution).toBeDefined();
            });
        });

        describe('Schedule Execution', () => {
            it('should identify due schedules', async () => {
                // Create a schedule that's due now
                db.run(`
                    INSERT INTO tasks (id, type, description, status)
                    VALUES (1, 'shell', 'Due task', 'completed')
                `);

                const pastTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
                db.run(`
                    INSERT INTO task_schedules (task_id, cron_expression, next_execution, enabled)
                    VALUES (1, '* * * * *', ?, 1)
                `, [pastTime]);

                const dueSchedules = scheduler.getDueSchedules();
                expect(dueSchedules.length).toBe(1);
                expect(dueSchedules[0].task_id).toBe(1);
            });

            it('should handle overlap policies', async () => {
                db.run(`
                    INSERT INTO tasks (id, type, description, status)
                    VALUES (1, 'shell', 'Long task', 'completed')
                `);

                const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
                const scheduleId = await scheduler.createSchedule(task, '* * * * *', {
                    maxInstances: 1,
                    overlapPolicy: 'skip'
                });

                // Simulate a running instance
                db.run(`
                    INSERT INTO task_instances (schedule_id, task_id, status)
                    VALUES (?, 1, 'running')
                `, [scheduleId]);

                const canExecute = scheduler.canExecuteSchedule(scheduleId);
                expect(canExecute).toBe(false);
            });
        });

        describe('Scheduler Lifecycle', () => {
            it('should start and stop scheduler', () => {
                expect(() => scheduler.start()).not.toThrow();
                expect(() => scheduler.stop()).not.toThrow();
            });

            it('should handle multiple start/stop calls', () => {
                scheduler.start();
                scheduler.start(); // Should not cause issues
                
                scheduler.stop();
                scheduler.stop(); // Should not cause issues
            });
        });
    });
});
