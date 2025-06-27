#!/usr/bin/env bun

/**
 * Migration script to add periodic task support
 * 
 * This script:
 * 1. Adds schedule-related columns to the tasks table
 * 2. Creates task_schedules table for cron-based scheduling
 * 3. Creates task_instances table for tracking recurring task executions
 * 4. Provides rollback functionality
 */

import { Database } from 'bun:sqlite';
import { config } from '../config';
import { logger } from '../utils/logger';

export class PeriodicTasksMigration {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Run the migration
     */
    async up(): Promise<void> {
        logger.info('Starting periodic tasks migration...');

        try {
            // Start transaction
            this.db.run('BEGIN TRANSACTION');

            // Step 1: Add schedule columns to tasks table
            await this.addScheduleColumnsToTasks();

            // Step 2: Create task_schedules table
            await this.createTaskSchedulesTable();

            // Step 3: Create task_instances table
            await this.createTaskInstancesTable();

            // Step 4: Create indexes for performance
            await this.createIndexes();

            // Commit transaction
            this.db.run('COMMIT');

            logger.info('Periodic tasks migration completed successfully');
        } catch (error) {
            // Rollback on error
            this.db.run('ROLLBACK');
            logger.error('Migration failed, rolling back', { error });
            throw error;
        }
    }

    /**
     * Rollback the migration
     */
    async down(): Promise<void> {
        logger.info('Rolling back periodic tasks migration...');

        try {
            // Start transaction
            this.db.run('BEGIN TRANSACTION');

            // Drop tables in reverse order
            this.db.run('DROP TABLE IF EXISTS task_instances');
            this.db.run('DROP TABLE IF EXISTS task_schedules');
            
            // Note: SQLite doesn't support DROP COLUMN, so we'd need to recreate the table
            logger.warn('SQLite does not support DROP COLUMN. Schedule columns will remain but be unused.');

            // Drop indexes
            this.db.run('DROP INDEX IF EXISTS idx_task_schedules_next_run');
            this.db.run('DROP INDEX IF EXISTS idx_task_schedules_enabled');
            this.db.run('DROP INDEX IF EXISTS idx_task_instances_template_id');
            this.db.run('DROP INDEX IF EXISTS idx_task_instances_scheduled_for');
            this.db.run('DROP INDEX IF EXISTS idx_tasks_is_template');
            this.db.run('DROP INDEX IF EXISTS idx_tasks_template_id');

            // Commit transaction
            this.db.run('COMMIT');

            logger.info('Periodic tasks migration rolled back successfully');
        } catch (error) {
            // Rollback on error
            this.db.run('ROLLBACK');
            logger.error('Migration rollback failed', { error });
            throw error;
        }
    }

    /**
     * Add schedule-related columns to tasks table
     */
    private async addScheduleColumnsToTasks(): Promise<void> {
        logger.info('Adding schedule columns to tasks table...');

        const columns = [
            'is_template BOOLEAN DEFAULT FALSE',
            'template_id INTEGER',
            'cron_expression TEXT',
            'timezone TEXT DEFAULT "UTC"',
            'schedule_enabled BOOLEAN DEFAULT FALSE',
            'next_execution DATETIME',
            'last_execution DATETIME',
            'execution_count INTEGER DEFAULT 0'
        ];

        for (const column of columns) {
            try {
                this.db.run(`ALTER TABLE tasks ADD COLUMN ${column}`);
            } catch (error) {
                // Column might already exist, log and continue
                logger.debug(`Column might already exist: ${column}`, { error });
            }
        }

        logger.info('Schedule columns added to tasks table');
    }

    /**
     * Create task_schedules table for managing cron schedules
     */
    private async createTaskSchedulesTable(): Promise<void> {
        logger.info('Creating task_schedules table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS task_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_task_id INTEGER NOT NULL,
                cron_expression TEXT NOT NULL,
                timezone TEXT DEFAULT 'UTC',
                enabled BOOLEAN DEFAULT TRUE,
                next_run_at DATETIME NOT NULL,
                last_run_at DATETIME,
                run_count INTEGER DEFAULT 0,
                max_instances INTEGER DEFAULT 1,
                overlap_policy TEXT DEFAULT 'skip', -- skip, queue, replace
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (template_task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        logger.info('task_schedules table created');
    }

    /**
     * Create task_instances table for tracking individual executions
     */
    private async createTaskInstancesTable(): Promise<void> {
        logger.info('Creating task_instances table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS task_instances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_id INTEGER NOT NULL,
                template_task_id INTEGER NOT NULL,
                instance_task_id INTEGER,
                scheduled_for DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                completed_at DATETIME,
                status TEXT DEFAULT 'scheduled', -- scheduled, running, completed, failed, skipped
                execution_time_ms INTEGER,
                error_message TEXT,
                FOREIGN KEY (schedule_id) REFERENCES task_schedules (id) ON DELETE CASCADE,
                FOREIGN KEY (template_task_id) REFERENCES tasks (id) ON DELETE CASCADE,
                FOREIGN KEY (instance_task_id) REFERENCES tasks (id) ON DELETE SET NULL
            )
        `);

        logger.info('task_instances table created');
    }

    /**
     * Create indexes for performance
     */
    private async createIndexes(): Promise<void> {
        logger.info('Creating indexes...');

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_task_schedules_next_run ON task_schedules(next_run_at)',
            'CREATE INDEX IF NOT EXISTS idx_task_schedules_enabled ON task_schedules(enabled)',
            'CREATE INDEX IF NOT EXISTS idx_task_schedules_template ON task_schedules(template_task_id)',
            'CREATE INDEX IF NOT EXISTS idx_task_instances_template_id ON task_instances(template_task_id)',
            'CREATE INDEX IF NOT EXISTS idx_task_instances_scheduled_for ON task_instances(scheduled_for)',
            'CREATE INDEX IF NOT EXISTS idx_task_instances_status ON task_instances(status)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_is_template ON tasks(is_template)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_template_id ON tasks(template_id)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_next_execution ON tasks(next_execution)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_schedule_enabled ON tasks(schedule_enabled)'
        ];

        for (const indexSql of indexes) {
            this.db.run(indexSql);
        }

        logger.info('Indexes created');
    }

    /**
     * Verify the migration was successful
     */
    async verify(): Promise<boolean> {
        try {
            // Check if tables exist
            const tables = ['task_schedules', 'task_instances'];
            for (const table of tables) {
                const tableExists = this.db.query(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name=?
                `).get(table);

                if (!tableExists) {
                    logger.error(`Table ${table} does not exist`);
                    return false;
                }
            }

            // Check if columns were added to tasks table
            const taskTableInfo = this.db.query(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
            const columnNames = taskTableInfo.map(col => col.name);
            
            const requiredColumns = ['is_template', 'cron_expression', 'timezone', 'schedule_enabled'];
            for (const column of requiredColumns) {
                if (!columnNames.includes(column)) {
                    logger.error(`Column ${column} not found in tasks table`);
                    return false;
                }
            }

            logger.info('Migration verification successful');
            return true;
        } catch (error) {
            logger.error('Migration verification failed', { error });
            return false;
        }
    }
}

// CLI execution
if (import.meta.main) {
    const command = process.argv[2];
    
    try {
        const db = new Database(config.paths.database);
        const migration = new PeriodicTasksMigration(db);

        switch (command) {
            case 'up':
                await migration.up();
                const verified = await migration.verify();
                if (verified) {
                    console.log('✅ Periodic tasks migration completed and verified successfully');
                } else {
                    console.log('❌ Migration completed but verification failed');
                    process.exit(1);
                }
                break;
            case 'down':
                await migration.down();
                console.log('✅ Periodic tasks migration rolled back successfully');
                break;
            case 'verify':
                const isValid = await migration.verify();
                console.log(isValid ? '✅ Migration verified' : '❌ Migration verification failed');
                process.exit(isValid ? 0 : 1);
                break;
            default:
                console.log('Usage: bun run src/migrations/003-add-periodic-tasks.ts [up|down|verify]');
                process.exit(1);
        }
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}
