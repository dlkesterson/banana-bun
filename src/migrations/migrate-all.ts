#!/usr/bin/env bun

/**
 * Unified Migration Runner
 * 
 * This script runs all database migrations in the correct order.
 * It can be called from the command line or imported and used programmatically.
 * 
 * Usage:
 *   bun run src/migrations/migrate-all.ts [up|down|verify]
 *   
 * Or programmatically:
 *   import { runAllMigrations } from './src/migrations/migrate-all.ts';
 *   await runAllMigrations();
 */

import { Database } from 'bun:sqlite';
import { config } from '../config';
import { logger } from '../utils/logger';
// Import all migrations
import { DependencyNormalizationMigration } from './001-normalize-dependencies.js';
import { RetrySystemMigration } from './002-add-retry-system.js';
import { PeriodicTasksMigration } from './003-add-periodic-tasks.js';
import { ErrorMessageColumnMigration } from './004-add-error-message-column.js';
import { migration005 } from './005-add-search-analytics.js';
import { migration006 } from './006-add-transcription-analytics.js';
import { migration007 } from './007-add-media-intelligence.js';
import { migration008 } from './008-add-phase2-features.js';
import { migration009 } from './009-add-autonomous-learning.js';
import { migration010 } from './010-add-llm-planning.js';

// Define migration list in order
const migrations = [
    {
        version: '001',
        name: 'Normalize Dependencies',
        migration: DependencyNormalizationMigration
    },
    // Create an object that matches the structure of other migrations for migration002
    {
        version: '002',
        name: 'Add Retry System',
        migration: RetrySystemMigration
    },
    // Create an object that matches the structure of other migrations
    {
        version: '003',
        name: 'Add Periodic Tasks',
        migration: PeriodicTasksMigration
    },
    // Add the new migration class
    {
        version: '004',
        name: 'Add Error Message Column',
        migration: ErrorMessageColumnMigration
    },
    {
        version: '005',
        name: 'Add Search Analytics',
        migration: class {
            constructor(private db: Database) { }
            async up() { await migration005(this.db); }
        }
    },
    {
        version: '006',
        name: 'Add Transcription Analytics',
        migration: class {
            constructor(private db: Database) { }
            async up() { await migration006(this.db); }
        }
    },
    {
        version: '007',
        name: 'Add Media Intelligence',
        migration: class {
            constructor(private db: Database) { }
            async up() { await migration007(this.db); }
        }
    },
    {
        version: '008',
        name: 'Add Phase 2 Advanced AI Features',
        migration: class {
            constructor(private db: Database) { }
            async up() { await migration008(this.db); }
        }
    },
    {
        version: '009',
        name: 'Add Autonomous Learning and Optimization',
        migration: class {
            constructor(private db: Database) { }
            async up() { await migration009(this.db); }
        }
    },
    {
        version: '010',
        name: 'Add LLM-Based Planning System',
        migration: class {
            constructor(private db: Database) { }
            async up() { await migration010(this.db); }
        }
    }
];

export class MigrationRunner {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Initialize migration tracking table
     */
    private initMigrationTable(): void {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    /**
     * Check if a migration has been applied
     */
    private isMigrationApplied(version: string): boolean {
        const result = this.db.query('SELECT version FROM migrations WHERE version = ?').get(version);
        return !!result;
    }

    /**
     * Record that a migration has been applied
     */
    private recordMigration(version: string, name: string): void {
        this.db.run(
            'INSERT OR IGNORE INTO migrations (version, name) VALUES (?, ?)',
            [version, name]
        );
    }

    /**
     * Remove migration record (for rollback)
     */
    private removeMigrationRecord(version: string): void {
        this.db.run('DELETE FROM migrations WHERE version = ?', [version]);
    }

    /**
     * Run all pending migrations
     */
    async runAllMigrations(): Promise<void> {
        logger.info('🚀 Starting migration runner...');

        this.initMigrationTable();

        let appliedCount = 0;

        for (const migration of migrations) {
            if (this.isMigrationApplied(migration.version)) {
                logger.info(`✅ Migration ${migration.version} (${migration.name}) already applied`);
                continue;
            }

            logger.info(`🔄 Running migration ${migration.version}: ${migration.name}`);

            try {
                if ('migration' in migration && migration.migration) {
                    const migrationInstance = new migration.migration(this.db);
                    await migrationInstance.up();
                    this.recordMigration(migration.version, migration.name);
                    appliedCount++;

                    logger.info(`✅ Migration ${migration.version} completed successfully`);
                }

            } catch (error) {
                logger.error(`❌ Migration ${migration.version} failed`, { error });
                throw new Error(`Migration ${migration.version} failed: ${error}`);
            }
        }

        if (appliedCount === 0) {
            logger.info('✅ All migrations are up to date');
        } else {
            logger.info(`✅ Applied ${appliedCount} migration(s) successfully`);
        }
    }

    /**
     * Rollback all migrations (in reverse order)
     */
    async rollbackAllMigrations(): Promise<void> {
        logger.info('🔄 Rolling back all migrations...');

        this.initMigrationTable();

        const appliedMigrations = this.db.query(
            'SELECT version, name FROM migrations ORDER BY version DESC'
        ).all() as Array<{ version: string; name: string }>;

        if (appliedMigrations.length === 0) {
            logger.info('✅ No migrations to rollback');
            return;
        }

        for (const applied of appliedMigrations) {
            const migration = migrations.find(m => m.version === applied.version);
            if (!migration) {
                logger.info(`⚠️ Migration ${applied.version} not found in current migrations list`);
                continue;
            }

            logger.info(`🔄 Rolling back migration ${applied.version}: ${applied.name}`);

            try {
                if ('migration' in migration && migration.migration) {
                    const migrationInstance = new migration.migration(this.db);
                    if (migrationInstance.down) {
                        await migrationInstance.down();
                    } else {
                        logger.error(`⚠️ Migration ${applied.version} does not support rollback`);
                    }
                    this.removeMigrationRecord(applied.version);

                    logger.info(`✅ Migration ${applied.version} rolled back successfully`);
                }
            } catch (error) {
                logger.error(`❌ Rollback of migration ${applied.version} failed`, { error });
                throw new Error(`Rollback of migration ${applied.version} failed: ${error}`);
            }
        }

        logger.info('✅ All migrations rolled back successfully');
    }

    /**
     * Verify all applied migrations
     */
    async verifyMigrations(): Promise<boolean> {
        logger.info('🔍 Verifying migrations...');

        this.initMigrationTable();

        const appliedMigrations = this.db.query(
            'SELECT version, name FROM migrations ORDER BY version'
        ).all() as Array<{ version: string; name: string }>;

        let allValid = true;

        for (const applied of appliedMigrations) {
            const migration = migrations.find(m => m.version === applied.version);
            if (!migration) {
                logger.error(`❌ Applied migration ${applied.version} not found in current migrations list`);
                allValid = false;
                continue;
            }

            try {
                if ('migration' in migration && migration.migration) {
                    const migrationInstance = new migration.migration(this.db);
                    if (migrationInstance.verify) {
                        const isValid = await migrationInstance.verify();
                        if (isValid) {
                            logger.info(`✅ Migration ${applied.version} verified successfully`);
                        } else {
                            logger.error(`❌ Migration ${applied.version} verification failed`);
                            allValid = false;
                        }
                    } else {
                        logger.info(`ℹ️ Migration ${applied.version} does not support verification`);
                    }
                }
            } catch (error) {
                logger.error(`❌ Error verifying migration ${applied.version}`, { error });
                allValid = false;
            }
        }

        if (allValid) {
            logger.info('✅ All migrations verified successfully');
        } else {
            logger.error('❌ Some migrations failed verification');
        }

        return allValid;
    }

    /**
     * Get migration status
     */
    getMigrationStatus(): Array<{ version: string; name: string; applied: boolean; appliedAt?: string }> {
        this.initMigrationTable();

        const appliedMigrations = this.db.query(
            'SELECT version, name, applied_at FROM migrations ORDER BY version'
        ).all() as Array<{ version: string; name: string; applied_at: string }>;

        const appliedMap = new Map(appliedMigrations.map(m => [m.version, m]));

        return migrations.map(migration => ({
            version: migration.version,
            name: migration.name,
            applied: appliedMap.has(migration.version),
            appliedAt: appliedMap.get(migration.version)?.applied_at
        }));
    }
}

/**
 * Convenience function to run all migrations
 */
export async function runAllMigrations(database?: Database): Promise<void> {
    const db = database || new Database(config.paths.database);
    const runner = new MigrationRunner(db);
    await runner.runAllMigrations();
}

/**
 * Convenience function to verify all migrations
 */
export async function verifyAllMigrations(database?: Database): Promise<boolean> {
    const db = database || new Database(config.paths.database);
    const runner = new MigrationRunner(db);
    return await runner.verifyMigrations();
}

// CLI execution
if (import.meta.main) {
    const command = process.argv[2] || 'up';

    try {
        const db = new Database(config.paths.database);
        const runner = new MigrationRunner(db);

        switch (command) {
            case 'up':
                await runner.runAllMigrations();
                console.log('✅ All migrations completed successfully');
                break;
            case 'down':
                await runner.rollbackAllMigrations();
                console.log('✅ All migrations rolled back successfully');
                break;
            case 'verify':
                const isValid = await runner.verifyMigrations();
                console.log(isValid ? '✅ All migrations verified' : '❌ Migration verification failed');
                process.exit(isValid ? 0 : 1);
                break;
            case 'status':
                const status = runner.getMigrationStatus();
                console.log('\n📊 Migration Status:');
                console.log('===================');
                for (const migration of status) {
                    const statusIcon = migration.applied ? '✅' : '⏳';
                    const appliedText = migration.applied ? `(applied ${migration.appliedAt})` : '(pending)';
                    console.log(`${statusIcon} ${migration.version}: ${migration.name} ${appliedText}`);
                }
                break;
            default:
                console.log('Usage: bun run src/migrations/migrate-all.ts [up|down|verify|status]');
                console.log('');
                console.log('Commands:');
                console.log('  up      - Run all pending migrations (default)');
                console.log('  down    - Rollback all migrations');
                console.log('  verify  - Verify all applied migrations');
                console.log('  status  - Show migration status');
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}
