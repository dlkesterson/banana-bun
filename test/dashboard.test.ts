import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';
import { generateDashboard } from '../src/dashboard';
import type { DatabaseTask } from '../src/types';

// Mock the config module
const mockConfig = {
    paths: {
        dashboard: '/tmp/test-dashboard'
    }
};

// Mock the config import
mock.module('../src/config', () => ({
    config: mockConfig
}));

// Mock logger
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

describe('Dashboard Generation', () => {
    let db: Database;
    let dashboardDir: string;

    beforeEach(async () => {
        // Create in-memory database for testing
        db = new Database(':memory:');
        
        // Create tasks table
        db.run(`
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                finished_at DATETIME
            )
        `);

        // Setup test dashboard directory
        dashboardDir = '/tmp/test-dashboard';
        await fs.mkdir(dashboardDir, { recursive: true });

        // Reset mocks
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
    });

    afterEach(async () => {
        db.close();
        await fs.rm(dashboardDir, { recursive: true, force: true });
    });

    describe('Dashboard HTML Generation', () => {
        it('should generate dashboard HTML file', async () => {
            // Insert test data
            db.run(`
                INSERT INTO tasks (type, description, status, created_at)
                VALUES 
                    ('shell', 'Test task 1', 'completed', '2024-01-01 10:00:00'),
                    ('llm', 'Test task 2', 'pending', '2024-01-01 11:00:00'),
                    ('code', 'Test task 3', 'failed', '2024-01-01 12:00:00')
            `);

            await generateDashboard();

            // Check if dashboard file was created
            const dashboardPath = `${dashboardDir}/index.html`;
            const dashboardExists = await fs.access(dashboardPath).then(() => true).catch(() => false);
            expect(dashboardExists).toBe(true);

            // Check dashboard content
            const dashboardContent = await fs.readFile(dashboardPath, 'utf-8');
            expect(dashboardContent).toContain('<!DOCTYPE html>');
            expect(dashboardContent).toContain('Task Dashboard');
            expect(dashboardContent).toContain('Test task 1');
            expect(dashboardContent).toContain('Test task 2');
            expect(dashboardContent).toContain('Test task 3');
        });

        it('should include task statistics in dashboard', async () => {
            // Insert test data with various statuses
            db.run(`
                INSERT INTO tasks (type, description, status)
                VALUES 
                    ('shell', 'Completed task 1', 'completed'),
                    ('shell', 'Completed task 2', 'completed'),
                    ('llm', 'Pending task', 'pending'),
                    ('code', 'Failed task', 'failed'),
                    ('tool', 'Running task', 'running')
            `);

            await generateDashboard();

            const dashboardPath = `${dashboardDir}/index.html`;
            const dashboardContent = await fs.readFile(dashboardPath, 'utf-8');

            // Should contain statistics
            expect(dashboardContent).toContain('completed');
            expect(dashboardContent).toContain('pending');
            expect(dashboardContent).toContain('failed');
            expect(dashboardContent).toContain('running');
        });

        it('should handle empty task list', async () => {
            await generateDashboard();

            const dashboardPath = `${dashboardDir}/index.html`;
            const dashboardExists = await fs.access(dashboardPath).then(() => true).catch(() => false);
            expect(dashboardExists).toBe(true);

            const dashboardContent = await fs.readFile(dashboardPath, 'utf-8');
            expect(dashboardContent).toContain('<!DOCTYPE html>');
            expect(dashboardContent).toContain('Task Dashboard');
        });

        it('should include task type breakdown', async () => {
            // Insert tasks of different types
            db.run(`
                INSERT INTO tasks (type, description, status)
                VALUES 
                    ('shell', 'Shell task 1', 'completed'),
                    ('shell', 'Shell task 2', 'pending'),
                    ('llm', 'LLM task', 'completed'),
                    ('code', 'Code task', 'failed'),
                    ('tool', 'Tool task', 'running'),
                    ('batch', 'Batch task', 'completed')
            `);

            await generateDashboard();

            const dashboardPath = `${dashboardDir}/index.html`;
            const dashboardContent = await fs.readFile(dashboardPath, 'utf-8');

            // Should contain different task types
            expect(dashboardContent).toContain('shell');
            expect(dashboardContent).toContain('llm');
            expect(dashboardContent).toContain('code');
            expect(dashboardContent).toContain('tool');
            expect(dashboardContent).toContain('batch');
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors gracefully', async () => {
            // Close database to simulate error
            db.close();

            await expect(generateDashboard()).rejects.toThrow();
        });

        it('should handle file system errors gracefully', async () => {
            // Mock fs.writeFile to throw an error
            const originalWriteFile = fs.writeFile;
            (fs as any).writeFile = mock(() => Promise.reject(new Error('File system error')));

            try {
                await expect(generateDashboard()).rejects.toThrow();
            } finally {
                // Restore original function
                (fs as any).writeFile = originalWriteFile;
            }
        });
    });

    describe('Dashboard Content Validation', () => {
        it('should generate valid HTML structure', async () => {
            db.run(`
                INSERT INTO tasks (type, description, status, created_at)
                VALUES ('shell', 'Test task', 'completed', '2024-01-01 10:00:00')
            `);

            await generateDashboard();

            const dashboardPath = `${dashboardDir}/index.html`;
            const dashboardContent = await fs.readFile(dashboardPath, 'utf-8');

            // Basic HTML structure validation
            expect(dashboardContent).toContain('<!DOCTYPE html>');
            expect(dashboardContent).toContain('<html');
            expect(dashboardContent).toContain('<head>');
            expect(dashboardContent).toContain('<body>');
            expect(dashboardContent).toContain('</html>');
        });

        it('should escape HTML in task descriptions', async () => {
            db.run(`
                INSERT INTO tasks (type, description, status)
                VALUES ('shell', '<script>alert("xss")</script>', 'completed')
            `);

            await generateDashboard();

            const dashboardPath = `${dashboardDir}/index.html`;
            const dashboardContent = await fs.readFile(dashboardPath, 'utf-8');

            // Should not contain unescaped script tags
            expect(dashboardContent).not.toContain('<script>alert("xss")</script>');
            // Should contain escaped version or safe representation
            expect(dashboardContent).toContain('alert');
        });
    });
});
