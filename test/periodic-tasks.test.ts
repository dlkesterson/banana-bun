import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { CronParser } from '../src/scheduler/cron-parser';
import { TaskScheduler } from '../src/scheduler/task-scheduler';
import { PeriodicTasksMigration } from '../src/migrations/003-add-periodic-tasks';

describe('Periodic Tasks System', () => {
    let db: Database;
    let scheduler: TaskScheduler;
    let migration: PeriodicTasksMigration;

    beforeEach(async () => {
        // Create in-memory database for testing
        db = new Database(':memory:');
        
        // Create basic tasks table
        db.run(`
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                status TEXT,
                description TEXT,
                shell_command TEXT,
                dependencies TEXT,
                args TEXT,
                generator TEXT,
                tool TEXT,
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

        // Run periodic tasks migration
        migration = new PeriodicTasksMigration(db);
        await migration.up();

        // Initialize scheduler
        scheduler = new TaskScheduler(db, {
            checkInterval: 1000, // 1 second for testing
            maxConcurrentInstances: 5
        });
    });

    afterEach(() => {
        scheduler.stop();
        db.close();
    });

    describe('CronParser', () => {
        it('should parse valid cron expressions', () => {
            const validExpressions = [
                '* * * * *',           // Every minute
                '0 * * * *',           // Every hour
                '0 0 * * *',           // Daily at midnight
                '*/15 * * * *',        // Every 15 minutes
                '0 9-17 * * 1-5',      // Business hours weekdays
                '0 0 1 * *',           // Monthly
                '0 0 * * 0'            // Weekly on Sunday
            ];

            for (const expr of validExpressions) {
                const result = CronParser.parse(expr);
                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
                expect(result.nextRuns).toBeDefined();
                expect(result.nextRuns!.length).toBeGreaterThan(0);
            }
        });

        it('should reject invalid cron expressions', () => {
            const invalidExpressions = [
                '',                    // Empty
                '* * * *',            // Too few fields
                '* * * * * *',        // Too many fields
                '60 * * * *',         // Invalid minute
                '* 25 * * *',         // Invalid hour
                '* * 32 * *',         // Invalid day
                '* * * 13 *',         // Invalid month
                '* * * * 8'           // Invalid day of week
            ];

            for (const expr of invalidExpressions) {
                const result = CronParser.parse(expr);
                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
            }
        });

        it('should calculate next execution times correctly', () => {
            const now = new Date('2024-01-01T12:00:00Z');
            
            // Every hour at minute 0
            const nextHour = CronParser.getNextExecution('0 * * * *', now);
            expect(nextHour).toBeDefined();
            expect(nextHour!.getMinutes()).toBe(0);
            expect(nextHour!.getHours()).toBe(13); // Next hour

            // Daily at midnight
            const nextMidnight = CronParser.getNextExecution('0 0 * * *', now);
            expect(nextMidnight).toBeDefined();
            expect(nextMidnight!.getHours()).toBe(0);
            expect(nextMidnight!.getMinutes()).toBe(0);
            expect(nextMidnight!.getDate()).toBe(2); // Next day
        });

        it('should handle step values correctly', () => {
            const now = new Date('2024-01-01T12:00:00Z');
            
            // Every 5 minutes
            const every5min = CronParser.getNextExecution('*/5 * * * *', now);
            expect(every5min).toBeDefined();
            expect(every5min!.getMinutes() % 5).toBe(0);

            // Every 2 hours
            const every2hours = CronParser.getNextExecution('0 */2 * * *', now);
            expect(every2hours).toBeDefined();
            expect(every2hours!.getHours() % 2).toBe(0);
            expect(every2hours!.getMinutes()).toBe(0);
        });

        it('should handle named months and days', () => {
            // January 1st
            const result1 = CronParser.parse('0 0 1 jan *');
            expect(result1.valid).toBe(true);

            // Monday at noon
            const result2 = CronParser.parse('0 12 * * mon');
            expect(result2.valid).toBe(true);
        });
    });

    describe('TaskScheduler', () => {
        it('should create a schedule for a task', async () => {
            // Insert a test task
            db.run(`
                INSERT INTO tasks (id, type, description, shell_command, status)
                VALUES (1, 'shell', 'Test task', 'echo "test"', 'completed')
            `);

            const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
            const scheduleId = await scheduler.createSchedule(task, '0 * * * *', {
                timezone: 'UTC',
                enabled: true
            });

            expect(scheduleId).toBeGreaterThan(0);

            // Verify schedule was created
            const schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId) as any;
            expect(schedule).toBeDefined();
            expect(schedule.template_task_id).toBe(1);
            expect(schedule.cron_expression).toBe('0 * * * *');
            expect(schedule.enabled).toBe(true);

            // Verify task was marked as template
            const updatedTask = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
            expect(updatedTask.is_template).toBe(true);
            expect(updatedTask.cron_expression).toBe('0 * * * *');
            expect(updatedTask.schedule_enabled).toBe(true);
        });

        it('should reject invalid cron expressions', async () => {
            db.run(`
                INSERT INTO tasks (id, type, description, shell_command, status)
                VALUES (1, 'shell', 'Test task', 'echo "test"', 'completed')
            `);

            const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;

            await expect(scheduler.createSchedule(task, 'invalid cron', {}))
                .rejects.toThrow('Invalid cron expression');
        });

        it('should toggle schedule enabled state', async () => {
            // Create a schedule
            db.run(`
                INSERT INTO tasks (id, type, description, shell_command, status)
                VALUES (1, 'shell', 'Test task', 'echo "test"', 'completed')
            `);

            const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
            const scheduleId = await scheduler.createSchedule(task, '0 * * * *', { enabled: true });

            // Disable it
            await scheduler.toggleSchedule(scheduleId, false);

            const schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId) as any;
            expect(schedule.enabled).toBe(false);

            // Enable it again
            await scheduler.toggleSchedule(scheduleId, true);

            const enabledSchedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId) as any;
            expect(enabledSchedule.enabled).toBe(true);
        });

        it('should delete a schedule', async () => {
            // Create a schedule
            db.run(`
                INSERT INTO tasks (id, type, description, shell_command, status)
                VALUES (1, 'shell', 'Test task', 'echo "test"', 'completed')
            `);

            const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
            const scheduleId = await scheduler.createSchedule(task, '0 * * * *', { enabled: true });

            // Delete it
            await scheduler.deleteSchedule(scheduleId);

            // Verify schedule is deleted
            const schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId);
            expect(schedule).toBeNull();

            // Verify task is no longer marked as template
            const updatedTask = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
            expect(updatedTask.is_template).toBe(false);
            expect(updatedTask.schedule_enabled).toBe(false);
        });

        it('should get scheduler metrics', async () => {
            // Create some test data
            db.run(`
                INSERT INTO tasks (id, type, description, shell_command, status)
                VALUES (1, 'shell', 'Test task 1', 'echo "test1"', 'completed')
            `);
            db.run(`
                INSERT INTO tasks (id, type, description, shell_command, status)
                VALUES (2, 'shell', 'Test task 2', 'echo "test2"', 'completed')
            `);

            const task1 = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
            const task2 = db.query('SELECT * FROM tasks WHERE id = 2').get() as any;

            await scheduler.createSchedule(task1, '0 * * * *', { enabled: true });
            await scheduler.createSchedule(task2, '0 0 * * *', { enabled: false });

            const metrics = await scheduler.getMetrics();

            expect(metrics.totalSchedules).toBe(2);
            expect(metrics.activeSchedules).toBe(1);
            expect(metrics.upcomingRuns.length).toBeGreaterThan(0);
        });
    });

    describe('Migration', () => {
        it('should verify migration was successful', async () => {
            const verified = await migration.verify();
            expect(verified).toBe(true);
        });

        it('should have created required tables', async () => {
            const tables = ['task_schedules', 'task_instances'];
            
            for (const table of tables) {
                const tableExists = db.query(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name=?
                `).get(table);
                expect(tableExists).toBeDefined();
            }
        });

        it('should have added columns to tasks table', async () => {
            const taskTableInfo = db.query(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
            const columnNames = taskTableInfo.map(col => col.name);
            
            const requiredColumns = [
                'is_template',
                'template_id', 
                'cron_expression',
                'timezone',
                'schedule_enabled',
                'next_execution',
                'last_execution',
                'execution_count'
            ];

            for (const column of requiredColumns) {
                expect(columnNames).toContain(column);
            }
        });
    });

    describe('Schedule Execution Logic', () => {
        it('should handle overlap policies correctly', async () => {
            // This would require more complex setup to test actual execution
            // For now, we'll test the basic structure
            
            db.run(`
                INSERT INTO tasks (id, type, description, shell_command, status)
                VALUES (1, 'shell', 'Long running task', 'sleep 10', 'completed')
            `);

            const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
            const scheduleId = await scheduler.createSchedule(task, '* * * * *', {
                maxInstances: 1,
                overlapPolicy: 'skip'
            });

            const schedule = db.query('SELECT * FROM task_schedules WHERE id = ?').get(scheduleId) as any;
            expect(schedule.max_instances).toBe(1);
            expect(schedule.overlap_policy).toBe('skip');
        });
    });
});
