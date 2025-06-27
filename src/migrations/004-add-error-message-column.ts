#!/usr/bin/env bun

import { Database } from 'bun:sqlite';

export class ErrorMessageColumnMigration {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    async up(): Promise<void> {
        // Check if error_message column already exists
        const tableInfo = this.db.query('PRAGMA table_info(tasks)').all();
        const columnExists = tableInfo.some((column: any) => column.name === 'error_message');

        if (!columnExists) {
            // Add error_message column to tasks table
            this.db.run(`
                ALTER TABLE tasks
                ADD COLUMN error_message TEXT;
            `);
            console.log('✅ Added error_message column to tasks table');
        } else {
            console.log('ℹ️ error_message column already exists, skipping');
        }
    }

    async down(): Promise<void> {
        // SQLite doesn't support dropping columns directly
        console.log('⚠️ SQLite does not support dropping columns directly');
        console.log('⚠️ Migration down not implemented for this migration');
    }

    async verify(): Promise<boolean> {
        const tableInfo = this.db.query('PRAGMA table_info(tasks)').all();
        return tableInfo.some((column: any) => column.name === 'error_message');
    }
}

// For backward compatibility and direct execution
const migration = {
    version: '004',
    name: 'Add Error Message Column',
    up: async (db: Database) => {
        const migration = new ErrorMessageColumnMigration(db);
        await migration.up();
    },
    down: async (db: Database) => {
        const migration = new ErrorMessageColumnMigration(db);
        await migration.down();
    },
    verify: async (db: Database) => {
        const migration = new ErrorMessageColumnMigration(db);
        return await migration.verify();
    }
};

// Allow running directly from command line
if (import.meta.main) {
    const command = process.argv[2] || 'up';

    try {
        const db = new Database(process.env.DB_PATH || ':memory:');

        switch (command) {
            case 'up':
                await migration.up(db);
                const verified = await migration.verify(db);
                if (verified) {
                    console.log('✅ Error message column migration completed and verified successfully');
                } else {
                    console.log('❌ Migration completed but verification failed');
                    process.exit(1);
                }
                break;
            case 'down':
                await migration.down(db);
                console.log('⚠️ Error message column migration rollback not fully supported');
                break;
            case 'verify':
                const isValid = await migration.verify(db);
                console.log(isValid ? '✅ Migration verified' : '❌ Migration verification failed');
                process.exit(isValid ? 0 : 1);
                break;
            default:
                console.log('Usage: bun run src/migrations/004-add-error-message-column.ts [up|down|verify]');
                process.exit(1);
        }
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

export default { ErrorMessageColumnMigration };

