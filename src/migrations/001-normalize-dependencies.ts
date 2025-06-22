#!/usr/bin/env bun

/**
 * Migration script to normalize task dependencies
 * 
 * This script:
 * 1. Creates a new task_dependencies table with (task_id, depends_on_id) structure
 * 2. Parses existing dependencies field (JSON string) into individual rows
 * 3. Updates all SQL that relies on dependencies to use JOIN on the new table
 * 4. Provides rollback functionality
 */

import { Database } from 'bun:sqlite';
import { config } from '../config';
import { logger } from '../utils/logger';

interface TaskRow {
    id: number;
    dependencies: string | null;
}

interface DependencyRelation {
    task_id: number;
    depends_on_id: string;
}

export class DependencyNormalizationMigration {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Run the migration
     */
    async up(): Promise<void> {
        logger.info('Starting dependency normalization migration...');

        try {
            // Start transaction
            this.db.run('BEGIN TRANSACTION');

            // Step 1: Create task_dependencies table
            await this.createTaskDependenciesTable();

            // Step 2: Migrate existing dependencies
            await this.migrateExistingDependencies();

            // Step 3: Create indexes for performance
            await this.createIndexes();

            // Commit transaction
            this.db.run('COMMIT');

            logger.info('Dependency normalization migration completed successfully');
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
        logger.info('Rolling back dependency normalization migration...');

        try {
            // Start transaction
            this.db.run('BEGIN TRANSACTION');

            // Drop the task_dependencies table
            this.db.run('DROP TABLE IF EXISTS task_dependencies');

            // Commit transaction
            this.db.run('COMMIT');

            logger.info('Dependency normalization migration rolled back successfully');
        } catch (error) {
            // Rollback on error
            this.db.run('ROLLBACK');
            logger.error('Migration rollback failed', { error });
            throw error;
        }
    }

    /**
     * Create the task_dependencies table
     */
    private async createTaskDependenciesTable(): Promise<void> {
        logger.info('Creating task_dependencies table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS task_dependencies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                depends_on_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
                UNIQUE(task_id, depends_on_id)
            )
        `);

        logger.info('task_dependencies table created');
    }

    /**
     * Create indexes for performance
     */
    private async createIndexes(): Promise<void> {
        logger.info('Creating indexes...');

        this.db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_id)');

        logger.info('Indexes created');
    }

    /**
     * Migrate existing dependencies from JSON string to normalized table
     */
    private async migrateExistingDependencies(): Promise<void> {
        logger.info('Migrating existing dependencies...');

        // Get all tasks with dependencies
        const tasksWithDeps = this.db.query(`
            SELECT id, dependencies 
            FROM tasks 
            WHERE dependencies IS NOT NULL 
            AND dependencies != '' 
            AND dependencies != '[]'
        `).all() as TaskRow[];

        logger.info(`Found ${tasksWithDeps.length} tasks with dependencies to migrate`);

        const relations: DependencyRelation[] = [];

        // Parse dependencies for each task
        for (const task of tasksWithDeps) {
            try {
                let dependencies: string[] = [];

                // Handle different dependency formats
                if (task.dependencies) {
                    if (task.dependencies.startsWith('[')) {
                        // JSON array format
                        dependencies = JSON.parse(task.dependencies);
                    } else if (task.dependencies.includes(',')) {
                        // Comma-separated format
                        dependencies = task.dependencies.split(',').map(d => d.trim());
                    } else {
                        // Single dependency
                        dependencies = [task.dependencies.trim()];
                    }
                }

                // Create relations for each dependency
                for (const depId of dependencies) {
                    if (depId && depId.trim()) {
                        relations.push({
                            task_id: task.id,
                            depends_on_id: depId.trim()
                        });
                    }
                }
            } catch (error) {
                logger.error(`Failed to parse dependencies for task ${task.id}`, {
                    taskId: task.id,
                    dependencies: task.dependencies,
                    error
                });
            }
        }

        logger.info(`Parsed ${relations.length} dependency relations`);

        // Insert relations into new table
        const insertStmt = this.db.prepare(`
            INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id)
            VALUES (?, ?)
        `);

        for (const relation of relations) {
            insertStmt.run(relation.task_id, relation.depends_on_id);
        }

        logger.info(`Inserted ${relations.length} dependency relations`);
    }

    /**
     * Verify the migration was successful
     */
    async verify(): Promise<boolean> {
        try {
            // Check if task_dependencies table exists
            const tableExists = this.db.query(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='task_dependencies'
            `).get();

            if (!tableExists) {
                logger.error('Table task_dependencies does not exist');
                return false;
            }

            // Check if indexes were created
            const indexes = [
                'idx_task_dependencies_task_id',
                'idx_task_dependencies_depends_on'
            ];

            for (const index of indexes) {
                const indexExists = this.db.query(`
                    SELECT name FROM sqlite_master 
                    WHERE type='index' AND name=?
                `).get(index);

                if (!indexExists) {
                    logger.error(`Index ${index} does not exist`);
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

/**
 * Helper functions for working with normalized dependencies
 */
export class DependencyHelper {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Get all dependencies for a task
     */
    getTaskDependencies(taskId: number): string[] {
        const deps = this.db.query(`
            SELECT depends_on_id 
            FROM task_dependencies 
            WHERE task_id = ?
        `).all(taskId) as { depends_on_id: string }[];

        return deps.map(d => d.depends_on_id);
    }

    /**
     * Get all tasks that depend on a given task
     */
    getTaskDependents(taskId: string | number): number[] {
        const dependents = this.db.query(`
            SELECT task_id 
            FROM task_dependencies 
            WHERE depends_on_id = ?
        `).all(String(taskId)) as { task_id: number }[];

        return dependents.map(d => d.task_id);
    }

    /**
     * Add a dependency relationship
     */
    addDependency(taskId: number, dependsOnId: string): void {
        this.db.run(`
            INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id)
            VALUES (?, ?)
        `, [taskId, dependsOnId]);
    }

    /**
     * Remove a dependency relationship
     */
    removeDependency(taskId: number, dependsOnId: string): void {
        this.db.run(`
            DELETE FROM task_dependencies 
            WHERE task_id = ? AND depends_on_id = ?
        `, [taskId, dependsOnId]);
    }

    /**
     * Get resolved dependencies with task details
     */
    getResolvedDependencies(taskId: number): Array<{ id: number; type: string; status: string; description: string }> {
        const deps = this.db.query(`
            SELECT t.id, t.type, t.status, t.description
            FROM task_dependencies td
            JOIN tasks t ON CAST(td.depends_on_id AS INTEGER) = t.id
            WHERE td.task_id = ?
        `).all(taskId) as Array<{ id: number; type: string; status: string; description: string }>;

        return deps;
    }

    /**
     * Check if all dependencies are met for a task
     */
    areDependenciesMet(taskId: number): { ready: boolean; error: boolean; failedDepId?: string } {
        const dependencies = this.getResolvedDependencies(taskId);

        if (dependencies.length === 0) {
            return { ready: true, error: false };
        }

        let hasError = false;
        let failedDepId = undefined;

        for (const dep of dependencies) {
            if (dep.status === 'error') {
                hasError = true;
                failedDepId = String(dep.id);
                break;
            }
            if (dep.status !== 'completed') {
                return { ready: false, error: false };
            }
        }

        if (hasError) return { ready: false, error: true, failedDepId };
        return { ready: true, error: false };
    }
}
