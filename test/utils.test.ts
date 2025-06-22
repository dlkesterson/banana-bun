import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { hashFile } from '../src/utils/hash';
import { parseTaskFile } from '../src/utils/parser';
import { convertDatabaseTasksToBaseTasks } from '../src/utils/task_converter';
import type { DatabaseTask, BaseTask } from '../src/types';

describe('Utility Functions', () => {
    const testDir = '/tmp/folder-watcher-test';

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    describe('Hash Utility', () => {
        it('should generate consistent hash for same file content', async () => {
            const testFile = join(testDir, 'test.txt');
            const content = 'Hello, World!';
            
            await fs.writeFile(testFile, content);
            
            const hash1 = await hashFile(testFile);
            const hash2 = await hashFile(testFile);
            
            expect(hash1).toBe(hash2);
            expect(hash1).toBeString();
            expect(hash1.length).toBeGreaterThan(0);
        });

        it('should generate different hashes for different content', async () => {
            const testFile1 = join(testDir, 'test1.txt');
            const testFile2 = join(testDir, 'test2.txt');
            
            await fs.writeFile(testFile1, 'Content 1');
            await fs.writeFile(testFile2, 'Content 2');
            
            const hash1 = await hashFile(testFile1);
            const hash2 = await hashFile(testFile2);
            
            expect(hash1).not.toBe(hash2);
        });

        it('should handle empty files', async () => {
            const testFile = join(testDir, 'empty.txt');
            await fs.writeFile(testFile, '');
            
            const hash = await hashFile(testFile);
            
            expect(hash).toBeString();
            expect(hash.length).toBeGreaterThan(0);
        });
    });

    describe('Task Parser', () => {
        it('should parse YAML task file', async () => {
            const taskFile = join(testDir, 'task.yaml');
            const taskContent = `---
type: shell
shell_command: echo "Hello World"
description: Test shell task
status: pending
---
# Test Task

This is a test task.`;

            await fs.writeFile(taskFile, taskContent);
            
            const task = await parseTaskFile(taskFile);
            
            expect(task.type).toBe('shell');
            expect(task.shell_command).toBe('echo "Hello World"');
            expect(task.description).toBe('Test shell task');
            expect(task.status).toBe('pending');
        });

        it('should parse JSON task file', async () => {
            const taskFile = join(testDir, 'task.json');
            const taskContent = JSON.stringify({
                type: 'llm',
                description: 'Generate a story',
                status: 'pending'
            }, null, 2);

            await fs.writeFile(taskFile, taskContent);
            
            const task = await parseTaskFile(taskFile);
            
            expect(task.type).toBe('llm');
            expect(task.description).toBe('Generate a story');
            expect(task.status).toBe('pending');
        });

        it('should parse Markdown task file with frontmatter', async () => {
            const taskFile = join(testDir, 'task.md');
            const taskContent = `---
type: code
description: Write a Python script
status: pending
---

# Code Generation Task

Please write a Python script that calculates the factorial of a number.`;

            await fs.writeFile(taskFile, taskContent);
            
            const task = await parseTaskFile(taskFile);
            
            expect(task.type).toBe('code');
            expect(task.description).toBe('Write a Python script');
            expect(task.status).toBe('pending');
        });

        it('should handle tool task with args', async () => {
            const taskFile = join(testDir, 'tool-task.yaml');
            const taskContent = `---
type: tool
tool: read_file
args:
  path: /test/file.txt
description: Read a file
status: pending
---`;

            await fs.writeFile(taskFile, taskContent);
            
            const task = await parseTaskFile(taskFile);
            
            expect(task.type).toBe('tool');
            expect((task as any).tool).toBe('read_file');
            expect((task as any).args).toEqual({ path: '/test/file.txt' });
        });

        it('should handle batch task with generator', async () => {
            const taskFile = join(testDir, 'batch-task.yaml');
            const taskContent = `---
type: batch
generator:
  type: folder_rename
  directory_path: /test/path
  recursive: true
description: Batch rename folders
status: pending
---`;

            await fs.writeFile(taskFile, taskContent);
            
            const task = await parseTaskFile(taskFile);
            
            expect(task.type).toBe('batch');
            expect((task as any).generator).toEqual({
                type: 'folder_rename',
                directory_path: '/test/path',
                recursive: true
            });
        });

        it('should handle task with dependencies', async () => {
            const taskFile = join(testDir, 'dependent-task.yaml');
            const taskContent = `---
type: review
dependencies: ["1", "2", "3"]
description: Review multiple tasks
status: pending
---`;

            await fs.writeFile(taskFile, taskContent);
            
            const task = await parseTaskFile(taskFile);
            
            expect(task.type).toBe('review');
            expect(task.dependencies).toEqual(['1', '2', '3']);
        });
    });

    describe('Task Converter', () => {
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
                    type: 'llm',
                    shell_command: null,
                    status: 'pending',
                    description: 'Test LLM task',
                    dependencies: null,
                    parent_id: null,
                    result_summary: null,
                    error_message: null,
                    filename: 'llm-test.yaml',
                    file_hash: 'def456',
                    created_at: '2024-01-01T00:00:00Z',
                    started_at: null,
                    finished_at: null
                }
            ];

            const baseTasks = convertDatabaseTasksToBaseTasks(dbTasks);

            expect(baseTasks).toHaveLength(2);
            
            const shellTask = baseTasks[0];
            expect(shellTask.type).toBe('shell');
            expect(shellTask.id).toBe(1);
            expect((shellTask as any).shell_command).toBe('echo test');

            const llmTask = baseTasks[1];
            expect(llmTask.type).toBe('llm');
            expect(llmTask.id).toBe(2);
            expect(llmTask.description).toBe('Test LLM task');
        });

        it('should handle tool tasks with JSON args', () => {
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
                    filename: 'tool-test.yaml',
                    file_hash: 'ghi789',
                    created_at: '2024-01-01T00:00:00Z',
                    started_at: null,
                    finished_at: null,
                    args: JSON.stringify({ path: '/test/file.txt' }),
                    tool: 'read_file'
                }
            ];

            const baseTasks = convertDatabaseTasksToBaseTasks(dbTasks);

            expect(baseTasks).toHaveLength(1);
            
            const toolTask = baseTasks[0];
            expect(toolTask.type).toBe('tool');
            expect((toolTask as any).tool).toBe('read_file');
            expect((toolTask as any).args).toEqual({ path: '/test/file.txt' });
        });

        it('should handle batch tasks with generator', () => {
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
                    filename: 'batch-test.yaml',
                    file_hash: 'jkl012',
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

        it('should handle empty database task array', () => {
            const baseTasks = convertDatabaseTasksToBaseTasks([]);
            expect(baseTasks).toHaveLength(0);
        });
    });
});
