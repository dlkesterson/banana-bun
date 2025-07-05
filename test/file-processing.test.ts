import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { parseTaskFile } from '../src/utils/parser';
import { hashFile } from '../src/utils/hash';
import { convertDatabaseTasksToBaseTasks } from '../src/utils/task_converter';
import { checkAndCompleteParentTask } from '../src/utils/parent_task_utils';
import { Database } from 'bun:sqlite';
import type { DatabaseTask, BaseTask } from '../src/types';

// Mock logger to avoid console output during tests
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

describe('File Processing Workflow', () => {
    const testDir = '/tmp/folder-watcher-file-test';
    let db: Database;

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });

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

        // Reset mocks
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        db.close();
    });

    describe('Task File Parsing', () => {
        it('should parse YAML task file with frontmatter', async () => {
            const taskFile = join(testDir, 'test-task.yaml');
            const content = `---
type: shell
shell_command: echo "Hello World"
description: Test shell task
status: pending
dependencies: ["1", "2"]
---
# Test Task

This is a test task for the file processing workflow.`;

            await fs.writeFile(taskFile, content);

            const task = await parseTaskFile(taskFile);

            expect(task.type).toBe('shell');
            expect(task.shell_command).toBe('echo "Hello World"');
            expect(task.description).toBe('Test shell task');
            expect(task.status).toBe('pending');
            expect(task.dependencies).toEqual(['1', '2']);
        });

        it('should parse JSON task file', async () => {
            const taskFile = join(testDir, 'test-task.json');
            const content = JSON.stringify({
                type: 'llm',
                description: 'Generate a creative story',
                status: 'pending'
            }, null, 2);

            await fs.writeFile(taskFile, content);

            const task = await parseTaskFile(taskFile);

            expect(task.type).toBe('llm');
            expect(task.description).toBe('Generate a creative story');
            expect(task.status).toBe('pending');
        });

        it('should parse Markdown file with YAML frontmatter', async () => {
            const taskFile = join(testDir, 'test-task.md');
            const content = `---
type: code
description: Write a Python script
status: pending
---

# Code Generation Task

Please write a Python script that:
1. Reads a CSV file
2. Processes the data
3. Outputs a summary report`;

            await fs.writeFile(taskFile, content);

            const task = await parseTaskFile(taskFile);

            expect(task.type).toBe('code');
            expect(task.description).toBe('Write a Python script');
            expect(task.status).toBe('pending');
        });

        it('should handle complex tool task with nested args', async () => {
            const taskFile = join(testDir, 'tool-task.yaml');
            const content = `---
type: tool
tool: s3_sync
args:
  source: /local/path
  destination: s3://bucket/path
  options:
    recursive: true
    delete: false
    exclude:
      - "*.tmp"
      - "*.log"
description: Sync files to S3
status: pending
---`;

            await fs.writeFile(taskFile, content);

            const task = await parseTaskFile(taskFile);

            expect(task.type).toBe('tool');
            expect((task as any).tool).toBe('s3_sync');
            expect((task as any).args.source).toBe('/local/path');
            expect((task as any).args.destination).toBe('s3://bucket/path');
            expect((task as any).args.options.recursive).toBe(true);
            expect((task as any).args.options.exclude).toEqual(['*.tmp', '*.log']);
        });

        it('should handle batch task with generator', async () => {
            const taskFile = join(testDir, 'batch-task.yaml');
            const content = `---
type: batch
generator:
  type: folder_rename
  directory_path: /test/path
  recursive: true
description: Batch rename folders
status: pending
---`;

            await fs.writeFile(taskFile, content);

            const task = await parseTaskFile(taskFile);

            expect(task.type).toBe('batch');
            expect((task as any).generator.type).toBe('folder_rename');
            expect((task as any).generator.directory_path).toBe('/test/path');
            expect((task as any).generator.recursive).toBe(true);
        });

        it('should handle invalid YAML gracefully', async () => {
            const taskFile = join(testDir, 'invalid-task.yaml');
            const content = `---
type: shell
shell_command: echo "test"
invalid_yaml: [unclosed array
---`;

            await fs.writeFile(taskFile, content);

            await expect(parseTaskFile(taskFile)).rejects.toThrow();
        });

        it('should handle missing required fields', async () => {
            const taskFile = join(testDir, 'incomplete-task.yaml');
            const content = `---
description: Task without type
status: pending
---`;

            await fs.writeFile(taskFile, content);

            const task = await parseTaskFile(taskFile);

            // Should still parse but may be invalid for execution
            expect(task.description).toBe('Task without type');
            expect(task.status).toBe('pending');
            expect((task as any).type).toBeUndefined();
        });
    });

    describe('File Hashing', () => {
        it('should generate consistent hashes for same content', async () => {
            const file1 = join(testDir, 'file1.txt');
            const file2 = join(testDir, 'file2.txt');
            const content = 'This is test content for hashing';

            await fs.writeFile(file1, content);
            await fs.writeFile(file2, content);

            const hash1 = await hashFile(file1);
            const hash2 = await hashFile(file2);

            expect(hash1).toBe(hash2);
            expect(hash1).toBeString();
            expect(hash1.length).toBeGreaterThan(0);
        });

        it('should generate different hashes for different content', async () => {
            const file1 = join(testDir, 'file1.txt');
            const file2 = join(testDir, 'file2.txt');

            await fs.writeFile(file1, 'Content A');
            await fs.writeFile(file2, 'Content B');

            const hash1 = await hashFile(file1);
            const hash2 = await hashFile(file2);

            expect(hash1).not.toBe(hash2);
        });

        it('should handle binary files', async () => {
            const binaryFile = join(testDir, 'binary.dat');
            const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);

            await fs.writeFile(binaryFile, binaryData);

            const hash = await hashFile(binaryFile);

            expect(hash).toBeString();
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should handle empty files', async () => {
            const emptyFile = join(testDir, 'empty.txt');
            await fs.writeFile(emptyFile, '');

            const hash = await hashFile(emptyFile);

            expect(hash).toBeString();
            expect(hash.length).toBeGreaterThan(0);
        });
    });

    describe('Task Conversion', () => {
        it('should convert database tasks to base tasks', () => {
            const dbTasks: DatabaseTask[] = [
                {
                    id: 1,
                    type: 'shell',
                    shell_command: 'echo test',
                    status: 'pending',
                    description: 'Test shell task',
                    dependencies: null,
                    parent_id: null,
                    result_summary: null,
                    error_message: null,
                    filename: 'test.yaml',
                    file_hash: 'abc123',
                    created_at: '2024-01-01T00:00:00Z',
                    started_at: null,
                    finished_at: null
                },
                {
                    id: 2,
                    type: 'tool',
                    shell_command: null,
                    status: 'pending',
                    description: 'Test tool task',
                    dependencies: null,
                    parent_id: null,
                    result_summary: null,
                    error_message: null,
                    filename: 'tool.yaml',
                    file_hash: 'def456',
                    created_at: '2024-01-01T00:00:00Z',
                    started_at: null,
                    finished_at: null,
                    args: JSON.stringify({ path: '/test/file.txt' }),
                    tool: 'read_file'
                }
            ];

            const baseTasks = convertDatabaseTasksToBaseTasks(dbTasks);

            expect(baseTasks).toHaveLength(2);

            const shellTask = baseTasks[0];
            expect(shellTask.type).toBe('shell');
            expect(shellTask.id).toBe(1);
            expect((shellTask as any).shell_command).toBe('echo test');

            const toolTask = baseTasks[1];
            expect(toolTask.type).toBe('tool');
            expect(toolTask.id).toBe(2);
            expect((toolTask as any).tool).toBe('read_file');
            expect((toolTask as any).args).toEqual({ path: '/test/file.txt' });
        });

        it('should handle tasks with JSON fields', () => {
            const dbTasks: DatabaseTask[] = [
                {
                    id: 1,
                    type: 'batch',
                    shell_command: null,
                    status: 'pending',
                    description: 'Test batch task',
                    dependencies: null,
                    parent_id: null,
                    result_summary: null,
                    error_message: null,
                    filename: 'batch.yaml',
                    file_hash: 'ghi789',
                    created_at: '2024-01-01T00:00:00Z',
                    started_at: null,
                    finished_at: null,
                    generator: JSON.stringify({
                        type: 'folder_rename',
                        directory_path: '/test',
                        recursive: true
                    })
                }
            ];

            const baseTasks = convertDatabaseTasksToBaseTasks(dbTasks);

            expect(baseTasks).toHaveLength(1);

            const batchTask = baseTasks[0];
            expect(batchTask.type).toBe('batch');
            expect((batchTask as any).generator).toEqual({
                type: 'folder_rename',
                directory_path: '/test',
                recursive: true
            });
        });

        it('should handle malformed JSON gracefully', () => {
            const dbTasks: DatabaseTask[] = [
                {
                    id: 1,
                    type: 'tool',
                    shell_command: null,
                    status: 'pending',
                    description: 'Test tool task',
                    dependencies: null,
                    parent_id: null,
                    result_summary: null,
                    error_message: null,
                    filename: 'tool.yaml',
                    file_hash: 'jkl012',
                    created_at: '2024-01-01T00:00:00Z',
                    started_at: null,
                    finished_at: null,
                    args: 'invalid json {',
                    tool: 'read_file'
                }
            ];

            const baseTasks = convertDatabaseTasksToBaseTasks(dbTasks);

            expect(baseTasks).toHaveLength(1);

            const toolTask = baseTasks[0];
            expect(toolTask.type).toBe('tool');
            expect((toolTask as any).args).toBe('invalid json {'); // Should keep original string
        });
    });

    describe('Parent Task Completion', () => {
        beforeEach(() => {
            // Mock getDatabase function
            const mockGetDatabase = mock(() => db);
            mock.module('../src/db', () => ({
                getDatabase: mockGetDatabase
            }));
        });

        it('should complete parent task when all children are completed', async () => {
            // Insert parent task
            db.run(`
                INSERT INTO tasks (id, type, status, description)
                VALUES (1, 'batch', 'running', 'Parent batch task')
            `);

            // Insert child tasks (all completed)
            db.run(`
                INSERT INTO tasks (id, type, status, parent_id)
                VALUES (2, 'shell', 'completed', 1)
            `);
            db.run(`
                INSERT INTO tasks (id, type, status, parent_id)
                VALUES (3, 'shell', 'completed', 1)
            `);

            await checkAndCompleteParentTask(2);

            // Check if parent task was completed
            const parentTask = db.query('SELECT * FROM tasks WHERE id = 1').get() as DatabaseTask;
            expect(parentTask.status).toBe('completed');
            expect(parentTask.finished_at).toBeDefined();
        });

        it('should not complete parent task when some children are pending', async () => {
            // Insert parent task
            db.run(`
                INSERT INTO tasks (id, type, status, description)
                VALUES (1, 'batch', 'running', 'Parent batch task')
            `);

            // Insert child tasks (one pending)
            db.run(`
                INSERT INTO tasks (id, type, status, parent_id)
                VALUES (2, 'shell', 'completed', 1)
            `);
            db.run(`
                INSERT INTO tasks (id, type, status, parent_id)
                VALUES (3, 'shell', 'pending', 1)
            `);

            await checkAndCompleteParentTask(2);

            // Check that parent task is still running
            const parentTask = db.query('SELECT * FROM tasks WHERE id = 1').get() as DatabaseTask;
            expect(parentTask.status).toBe('running');
            expect(parentTask.finished_at).toBeNull();
        });

        it('should mark parent as error when any child fails', async () => {
            // Insert parent task
            db.run(`
                INSERT INTO tasks (id, type, status, description)
                VALUES (1, 'batch', 'running', 'Parent batch task')
            `);

            // Insert child tasks (one failed)
            db.run(`
                INSERT INTO tasks (id, type, status, parent_id)
                VALUES (2, 'shell', 'completed', 1)
            `);
            db.run(`
                INSERT INTO tasks (id, type, status, parent_id, error_message)
                VALUES (3, 'shell', 'error', 1, 'Command failed')
            `);

            await checkAndCompleteParentTask(3);

            // Check that parent task is marked as error
            const parentTask = db.query('SELECT * FROM tasks WHERE id = 1').get() as DatabaseTask;
            expect(parentTask.status).toBe('error');
            expect(parentTask.finished_at).toBeDefined();
            expect(parentTask.error_message).toContain('child task failed');
        });

        it('should handle tasks without parent', async () => {
            // Insert task without parent
            db.run(`
                INSERT INTO tasks (id, type, status, description)
                VALUES (1, 'shell', 'completed', 'Standalone task')
            `);

            // Should not throw error
            await expect(async () => {
                await checkAndCompleteParentTask(1);
            }).not.toThrow();
        });
    });

    describe('File Processing Integration', () => {
        it('should process complete workflow from file to database', async () => {
            const taskFile = join(testDir, 'integration-test.yaml');
            const content = `---
type: shell
shell_command: echo "Integration test"
description: End-to-end test task
status: pending
---
# Integration Test

This task tests the complete file processing workflow.`;

            await fs.writeFile(taskFile, content);

            // Parse task file
            const task = await parseTaskFile(taskFile);
            expect(task.type).toBe('shell');

            // Generate file hash
            const fileHash = await hashFile(taskFile);
            expect(fileHash).toBeString();

            // Insert into database (simulating the full workflow)
            db.run(`
                INSERT INTO tasks (type, description, status, shell_command, filename, file_hash)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                task.type,
                task.description,
                task.status,
                task.shell_command,
                'integration-test.yaml',
                fileHash
            ]);

            // Retrieve from database
            const dbTask = db.query('SELECT * FROM tasks WHERE filename = ?')
                .get('integration-test.yaml') as DatabaseTask;

            expect(dbTask).toBeDefined();
            expect(dbTask.type).toBe('shell');
            expect(dbTask.file_hash).toBe(fileHash);

            // Convert back to base task
            const baseTasks = convertDatabaseTasksToBaseTasks([dbTask]);
            expect(baseTasks).toHaveLength(1);
            expect(baseTasks[0].type).toBe('shell');
        });
    });
});

afterAll(() => {
    // Restore all mocks after all tests in this file complete
    mock.restore();
});
