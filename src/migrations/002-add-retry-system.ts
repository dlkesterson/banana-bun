#!/usr/bin/env bun

/**
 * Migration script to add retry system support
 * 
 * This script:
 * 1. Adds retry-related columns to the tasks table
 * 2. Creates retry_history table for tracking retry attempts
 * 3. Creates retry_policies table for configurable retry policies
 * 4. Provides rollback functionality
 */

import { Database } from 'bun:sqlite';
import { config } from '../config';
import { logger } from '../utils/logger';

export class RetrySystemMigration {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Run the migration
     */
    async up(): Promise<void> {
        logger.info('Starting retry system migration...');

        try {
            // Start transaction
            this.db.run('BEGIN TRANSACTION');

            // Step 1: Add retry columns to tasks table
            await this.addRetryColumnsToTasks();

            // Step 2: Create retry_history table
            await this.createRetryHistoryTable();

            // Step 3: Create retry_policies table
            await this.createRetryPoliciesTable();

            // Step 4: Insert default retry policies
            await this.insertDefaultRetryPolicies();

            // Step 5: Create indexes for performance
            await this.createIndexes();

            // Commit transaction
            this.db.run('COMMIT');

            logger.info('Retry system migration completed successfully');
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
        logger.info('Rolling back retry system migration...');

        try {
            // Start transaction
            this.db.run('BEGIN TRANSACTION');

            // Drop tables and columns in reverse order
            this.db.run('DROP TABLE IF EXISTS retry_policies');
            this.db.run('DROP TABLE IF EXISTS retry_history');
            
            // Note: SQLite doesn't support DROP COLUMN, so we'd need to recreate the table
            // For now, we'll just mark the columns as unused
            logger.warn('SQLite does not support DROP COLUMN. Retry columns will remain but be unused.');

            // Drop indexes
            this.db.run('DROP INDEX IF EXISTS idx_retry_history_task_id');
            this.db.run('DROP INDEX IF EXISTS idx_retry_history_attempt_time');
            this.db.run('DROP INDEX IF EXISTS idx_retry_policies_task_type');

            // Commit transaction
            this.db.run('COMMIT');

            logger.info('Retry system migration rolled back successfully');
        } catch (error) {
            // Rollback on error
            this.db.run('ROLLBACK');
            logger.error('Migration rollback failed', { error });
            throw error;
        }
    }

    /**
     * Add retry-related columns to tasks table
     */
    private async addRetryColumnsToTasks(): Promise<void> {
        logger.info('Adding retry columns to tasks table...');

        const columns = [
            'retry_count INTEGER DEFAULT 0',
            'max_retries INTEGER DEFAULT 3',
            'next_retry_at DATETIME',
            'retry_policy_id INTEGER',
            'last_retry_error TEXT'
        ];

        for (const column of columns) {
            try {
                this.db.run(`ALTER TABLE tasks ADD COLUMN ${column}`);
            } catch (error) {
                // Column might already exist, log and continue
                logger.debug(`Column might already exist: ${column}`, { error });
            }
        }

        logger.info('Retry columns added to tasks table');
    }

    /**
     * Create retry_history table
     */
    private async createRetryHistoryTable(): Promise<void> {
        logger.info('Creating retry_history table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS retry_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                attempt_number INTEGER NOT NULL,
                attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                error_message TEXT,
                error_type TEXT,
                delay_ms INTEGER,
                success BOOLEAN DEFAULT FALSE,
                execution_time_ms INTEGER,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        logger.info('retry_history table created');
    }

    /**
     * Create retry_policies table
     */
    private async createRetryPoliciesTable(): Promise<void> {
        logger.info('Creating retry_policies table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS retry_policies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_type TEXT NOT NULL UNIQUE,
                max_retries INTEGER NOT NULL DEFAULT 3,
                backoff_strategy TEXT NOT NULL DEFAULT 'exponential',
                base_delay_ms INTEGER NOT NULL DEFAULT 1000,
                max_delay_ms INTEGER NOT NULL DEFAULT 300000,
                retry_multiplier REAL DEFAULT 2.0,
                retryable_errors TEXT, -- JSON array of error patterns
                non_retryable_errors TEXT, -- JSON array of error patterns
                enabled BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        logger.info('retry_policies table created');
    }

    /**
     * Insert default retry policies for each task type
     */
    private async insertDefaultRetryPolicies(): Promise<void> {
        logger.info('Inserting default retry policies...');

        const defaultPolicies = [
            {
                task_type: 'shell',
                max_retries: 3,
                backoff_strategy: 'exponential',
                base_delay_ms: 1000,
                max_delay_ms: 60000,
                retry_multiplier: 2.0,
                retryable_errors: JSON.stringify(['timeout', 'network', 'temporary']),
                non_retryable_errors: JSON.stringify(['syntax', 'permission', 'not_found'])
            },
            {
                task_type: 'llm',
                max_retries: 5,
                backoff_strategy: 'exponential',
                base_delay_ms: 2000,
                max_delay_ms: 120000,
                retry_multiplier: 2.0,
                retryable_errors: JSON.stringify(['rate_limit', 'timeout', 'server_error']),
                non_retryable_errors: JSON.stringify(['invalid_prompt', 'quota_exceeded'])
            },
            {
                task_type: 'tool',
                max_retries: 2,
                backoff_strategy: 'linear',
                base_delay_ms: 500,
                max_delay_ms: 30000,
                retry_multiplier: 1.5,
                retryable_errors: JSON.stringify(['timeout', 'io_error']),
                non_retryable_errors: JSON.stringify(['invalid_args', 'permission_denied'])
            },
            {
                task_type: 'youtube',
                max_retries: 4,
                backoff_strategy: 'exponential',
                base_delay_ms: 5000,
                max_delay_ms: 300000,
                retry_multiplier: 2.5,
                retryable_errors: JSON.stringify(['network', 'rate_limit', 'server_error']),
                non_retryable_errors: JSON.stringify(['invalid_url', 'video_unavailable'])
            },
            {
                task_type: 'batch',
                max_retries: 1,
                backoff_strategy: 'fixed',
                base_delay_ms: 10000,
                max_delay_ms: 10000,
                retry_multiplier: 1.0,
                retryable_errors: JSON.stringify(['partial_failure']),
                non_retryable_errors: JSON.stringify(['invalid_config', 'all_subtasks_failed'])
            }
        ];

        const insertStmt = this.db.prepare(`
            INSERT OR REPLACE INTO retry_policies 
            (task_type, max_retries, backoff_strategy, base_delay_ms, max_delay_ms, 
             retry_multiplier, retryable_errors, non_retryable_errors)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const policy of defaultPolicies) {
            insertStmt.run(
                policy.task_type,
                policy.max_retries,
                policy.backoff_strategy,
                policy.base_delay_ms,
                policy.max_delay_ms,
                policy.retry_multiplier,
                policy.retryable_errors,
                policy.non_retryable_errors
            );
        }

        logger.info(`Inserted ${defaultPolicies.length} default retry policies`);
    }

    /**
     * Create indexes for performance
     */
    private async createIndexes(): Promise<void> {
        logger.info('Creating indexes...');

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_retry_history_task_id ON retry_history(task_id)',
            'CREATE INDEX IF NOT EXISTS idx_retry_history_attempt_time ON retry_history(attempted_at)',
            'CREATE INDEX IF NOT EXISTS idx_retry_policies_task_type ON retry_policies(task_type)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_retry_count ON tasks(retry_count)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_next_retry ON tasks(next_retry_at)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_retry_policy ON tasks(retry_policy_id)'
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
            const tables = ['retry_history', 'retry_policies'];
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

            // Check if retry policies were inserted
            const policyCount = this.db.query('SELECT COUNT(*) as count FROM retry_policies').get() as { count: number };
            if (policyCount.count === 0) {
                logger.error('No retry policies found');
                return false;
            }

            logger.info('Migration verification successful', {
                policyCount: policyCount.count
            });

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
        const migration = new RetrySystemMigration(db);

        switch (command) {
            case 'up':
                await migration.up();
                const verified = await migration.verify();
                if (verified) {
                    console.log('✅ Retry system migration completed and verified successfully');
                } else {
                    console.log('❌ Migration completed but verification failed');
                    process.exit(1);
                }
                break;
            case 'down':
                await migration.down();
                console.log('✅ Retry system migration rolled back successfully');
                break;
            case 'verify':
                const isValid = await migration.verify();
                console.log(isValid ? '✅ Migration verified' : '❌ Migration verification failed');
                process.exit(isValid ? 0 : 1);
                break;
            default:
                console.log('Usage: bun run src/migrations/002-add-retry-system.ts [up|down|verify]');
                process.exit(1);
        }
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}
