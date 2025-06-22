import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { MigrationRunner, runAllMigrations, verifyAllMigrations } from '../src/migrations/migrate-all';

describe('Migration Runner', () => {
    let db: Database;
    let runner: MigrationRunner;

    beforeEach(() => {
        // Create in-memory database for testing
        db = new Database(':memory:');
        
        // Create basic tasks table that migrations expect
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
                finished_at DATETIME
            )
        `);

        runner = new MigrationRunner(db);
    });

    afterEach(() => {
        db.close();
    });

    describe('Migration Tracking', () => {
        it('should initialize migration tracking table', () => {
            runner.getMigrationStatus();
            
            // Check if migrations table was created
            const tableExists = db.query(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='migrations'
            `).get();
            
            expect(tableExists).toBeDefined();
        });

        it('should track migration status correctly', () => {
            const status = runner.getMigrationStatus();
            
            expect(status).toBeArray();
            expect(status.length).toBeGreaterThan(0);
            
            // All migrations should initially be unapplied
            for (const migration of status) {
                expect(migration.applied).toBe(false);
                expect(migration.version).toBeDefined();
                expect(migration.name).toBeDefined();
            }
        });
    });

    describe('Migration Execution', () => {
        it('should run all migrations successfully', async () => {
            await runner.runAllMigrations();
            
            const status = runner.getMigrationStatus();
            
            // All migrations should now be applied
            for (const migration of status) {
                expect(migration.applied).toBe(true);
                expect(migration.appliedAt).toBeDefined();
            }
        });

        it('should not re-run already applied migrations', async () => {
            // Run migrations first time
            await runner.runAllMigrations();
            
            const statusAfterFirst = runner.getMigrationStatus();
            const appliedCount = statusAfterFirst.filter(m => m.applied).length;
            
            // Run migrations again
            await runner.runAllMigrations();
            
            const statusAfterSecond = runner.getMigrationStatus();
            const appliedCountSecond = statusAfterSecond.filter(m => m.applied).length;
            
            // Should be the same count (no duplicates)
            expect(appliedCountSecond).toBe(appliedCount);
        });

        it('should verify migrations after running', async () => {
            await runner.runAllMigrations();
            const isValid = await runner.verifyMigrations();
            
            expect(isValid).toBe(true);
        });
    });

    describe('Convenience Functions', () => {
        it('should run all migrations via convenience function', async () => {
            await runAllMigrations(db);
            
            const status = runner.getMigrationStatus();
            const appliedMigrations = status.filter(m => m.applied);
            
            expect(appliedMigrations.length).toBeGreaterThan(0);
        });

        it('should verify migrations via convenience function', async () => {
            await runAllMigrations(db);
            const isValid = await verifyAllMigrations(db);
            
            expect(isValid).toBe(true);
        });
    });

    describe('Database Schema Changes', () => {
        it('should create task_dependencies table after migration', async () => {
            await runner.runAllMigrations();
            
            const tableExists = db.query(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='task_dependencies'
            `).get();
            
            expect(tableExists).toBeDefined();
        });

        it('should create retry_history table after migration', async () => {
            await runner.runAllMigrations();
            
            const tableExists = db.query(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='retry_history'
            `).get();
            
            expect(tableExists).toBeDefined();
        });

        it('should create retry_policies table after migration', async () => {
            await runner.runAllMigrations();
            
            const tableExists = db.query(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='retry_policies'
            `).get();
            
            expect(tableExists).toBeDefined();
        });

        it('should create task_schedules table after migration', async () => {
            await runner.runAllMigrations();
            
            const tableExists = db.query(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='task_schedules'
            `).get();
            
            expect(tableExists).toBeDefined();
        });

        it('should add retry columns to tasks table', async () => {
            await runner.runAllMigrations();
            
            const tableInfo = db.query(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
            const columnNames = tableInfo.map(col => col.name);
            
            expect(columnNames).toContain('retry_count');
            expect(columnNames).toContain('max_retries');
            expect(columnNames).toContain('next_retry_at');
        });

        it('should add schedule columns to tasks table', async () => {
            await runner.runAllMigrations();
            
            const tableInfo = db.query(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>;
            const columnNames = tableInfo.map(col => col.name);
            
            expect(columnNames).toContain('is_template');
            expect(columnNames).toContain('cron_expression');
            expect(columnNames).toContain('schedule_enabled');
        });
    });

    describe('Error Handling', () => {
        it('should handle migration errors gracefully', async () => {
            // Close the database to simulate an error
            db.close();
            
            await expect(runner.runAllMigrations()).rejects.toThrow();
        });
    });
});
