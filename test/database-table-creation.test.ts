import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';

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

// Create mock logger functions that we can spy on
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

// Mock the logger to avoid file system operations
mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

import { initDatabase, getDatabase, getDependencyHelper } from '../src/db';
import { DependencyHelper } from '../src/migrations/001-normalize-dependencies';

describe('Database Table Creation Tests', () => {
    beforeEach(() => {
        // Reset all mocks
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
    });

    afterEach(() => {
        // Clean up any database connections
        try {
            const db = getDatabase();
            if (db) {
                db.close();
            }
        } catch (error) {
            // Database might not be initialized, ignore
        }
    });

    it('should verify initDatabase creates required tables by checking database schema', async () => {
        // Initialize database
        await initDatabase();
        const db = getDatabase();

        // Check if main tables exist by querying sqlite_master
        const tables = db.query(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `).all() as Array<{ name: string }>;

        const tableNames = tables.map(t => t.name);

        // Verify all required tables are created
        expect(tableNames).toContain('tasks');
        expect(tableNames).toContain('media');
        expect(tableNames).toContain('review_results');
        expect(tableNames).toContain('planner_results');
        expect(tableNames).toContain('media_metadata');
        expect(tableNames).toContain('media_transcripts');
        expect(tableNames).toContain('media_tags');
        expect(tableNames).toContain('media_index_status');
        expect(tableNames).toContain('task_logs');
        expect(tableNames).toContain('user_feedback');
        expect(tableNames).toContain('task_dependencies');

        // Verify indexes are created
        const indexes = db.query(`
            SELECT name FROM sqlite_master
            WHERE type='index' AND name NOT LIKE 'sqlite_%'
        `).all() as Array<{ name: string }>;

        const indexNames = indexes.map(i => i.name);
        expect(indexNames).toContain('idx_status');
        expect(indexNames).toContain('idx_parent');
        expect(indexNames).toContain('idx_task_dependencies_task_id');
        expect(indexNames).toContain('idx_task_dependencies_depends_on');

        // Verify logger was called
        expect(mockLogger.info).toHaveBeenCalledWith('Database initialized successfully');

        // Verify DependencyHelper is properly initialized
        const dependencyHelper = getDependencyHelper();
        expect(dependencyHelper).toBeInstanceOf(DependencyHelper);
    });

    it('should handle database initialization errors and log them', async () => {
        // Create a database with an invalid path to force an error
        const originalConfig = mockConfig.paths.database;
        mockConfig.paths.database = '/invalid/path/that/does/not/exist/test.db';

        try {
            await expect(initDatabase()).rejects.toThrow();

            // Verify error was logged
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to initialize database',
                expect.objectContaining({ error: expect.any(Error) })
            );
        } finally {
            // Restore original config
            mockConfig.paths.database = originalConfig;
        }
    });

    it('should verify that getDatabase and getDependencyHelper return same instances after initialization', async () => {
        // Initialize database
        await initDatabase();

        // After initialization, getDatabase() and getDependencyHelper() should return the same instances
        const db1 = getDatabase();
        const db2 = getDatabase();
        const helper1 = getDependencyHelper();
        const helper2 = getDependencyHelper();

        expect(db1).toBe(db2);
        expect(helper1).toBe(helper2);
        expect(helper1).toBeInstanceOf(DependencyHelper);
    });
});
