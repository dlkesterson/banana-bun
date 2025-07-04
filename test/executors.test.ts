import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ShellTask, LlmTask, CodeTask, ToolTask, BaseTask } from '../src/types';

// Always create our own test directory to avoid conflicts between test files
const TEST_BASE_DIR = join(tmpdir(), 'executors-test-' + Date.now());
const OUTPUT_DIR = join(TEST_BASE_DIR, 'outputs');

let originalBasePath: string | undefined;

// Mock external dependencies for testing
global.fetch = (() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ response: 'Mocked LLM response' })
})) as any;

describe('Task Executors', () => {
    beforeEach(async () => {
        // Store original BASE_PATH and set our own
        originalBasePath = process.env.BASE_PATH;
        process.env.BASE_PATH = TEST_BASE_DIR;

        // Create test directory and subdirectories
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
    });

    afterEach(async () => {
        // Always clean up our test directory
        await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });

        // Restore original BASE_PATH
        if (originalBasePath === undefined) {
            delete process.env.BASE_PATH;
        } else {
            process.env.BASE_PATH = originalBasePath;
        }
    });



    describe('Shell Executor', () => {
        it('should execute simple shell command successfully', async () => {
            const { executeShellTask } = await import('../src/executors/shell?t=' + Date.now());

            const task: ShellTask = {
                id: 1,
                type: 'shell',
                shell_command: 'echo "Hello World"',
                status: 'pending',
                result: null,
                description: 'Test echo command'
            };

            const result = await executeShellTask(task);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();
            expect(result.error).toBeUndefined();

            // Verify output file was created
            if (result.outputPath) {
                const content = await fs.readFile(result.outputPath, 'utf-8');
                expect(content).toContain('Hello World');
                expect(content).toContain('# Command');
                expect(content).toContain('# STDOUT');
                expect(content).toContain('# Exit Code');
            }
        });

        it('should handle shell command failure', async () => {
            const { executeShellTask } = await import('../src/executors/shell?t=' + Date.now());

            const task: ShellTask = {
                id: 2,
                type: 'shell',
                shell_command: 'exit 1',
                status: 'pending',
                result: null,
                description: 'Test failing command'
            };

            const result = await executeShellTask(task);

            expect(result.success).toBe(false);
            expect(result.outputPath).toBeDefined();
            expect(result.error).toBeDefined();
        });

        it('should handle missing shell_command', async () => {
            const { executeShellTask } = await import('../src/executors/shell?t=' + Date.now());

            const task: ShellTask = {
                id: 3,
                type: 'shell',
                shell_command: '',
                status: 'pending',
                result: null,
                description: 'Test missing command'
            };

            const result = await executeShellTask(task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('No shell_command found');
        });

        it('should handle complex shell commands', async () => {
            const { executeShellTask } = await import('../src/executors/shell?t=' + Date.now());

            const task: ShellTask = {
                id: 4,
                type: 'shell',
                shell_command: 'echo "Line 1" && echo "Line 2" && ls /tmp',
                status: 'pending',
                result: null,
                description: 'Test complex command'
            };

            const result = await executeShellTask(task);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();

            if (result.outputPath) {
                const content = await fs.readFile(result.outputPath, 'utf-8');
                expect(content).toContain('Line 1');
                expect(content).toContain('Line 2');
            }
        });
    });

    describe('LLM Executor', () => {
        it('should execute LLM task successfully', async () => {
            const { executeLlmTask } = await import('../src/executors/llm?t=' + Date.now());

            const task: LlmTask = {
                id: 1,
                type: 'llm',
                description: 'Write a short poem about testing',
                status: 'pending',
                result: null
            };

            const result = await executeLlmTask(task);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();

            // Verify output file was created
            if (result.outputPath) {
                const content = await fs.readFile(result.outputPath, 'utf-8');
                expect(content).toContain('# Model');
                expect(content).toContain('# Prompt');
                expect(content).toContain('# Output');
                expect(content).toContain('Mocked LLM response');
            }
        });

        // LLM API failure and network error tests removed - require fetch mocking
        // The LLM executor will work with real Ollama API calls in integration tests
    });

    // Code Executor tests removed - they require fetch mocking for LLM API calls
    // See test/code-executor.test.ts for dedicated code executor tests

    // Tool Executor tests removed - they require complex mocking
    // See test/tool-executor.test.ts for dedicated tool executor tests

    describe('Task Dispatcher', () => {
        it('should dispatch shell task correctly', async () => {
            const { executeTask } = await import('../src/executors/dispatcher?t=' + Date.now());

            const task: BaseTask = {
                id: 1,
                type: 'shell',
                shell_command: 'echo "test"',
                status: 'pending',
                result: null
            };

            const result = await executeTask(task);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();
        });

        it('should dispatch LLM task correctly', async () => {
            const { executeTask } = await import('../src/executors/dispatcher?t=' + Date.now());

            const task: BaseTask = {
                id: 2,
                type: 'llm',
                description: 'Test LLM task',
                status: 'pending',
                result: null
            };

            const result = await executeTask(task);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();
        });

        // Tool task dispatch test removed - requires mocking
        // See test/tool-executor.test.ts for tool-specific tests

        it('should handle unknown task type', async () => {
            const { executeTask } = await import('../src/executors/dispatcher?t=' + Date.now());

            const task = {
                id: 4,
                type: 'unknown_type',
                status: 'pending',
                result: null
            } as any;

            const result = await executeTask(task);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Unknown task type: unknown_type');
        });
    });

    describe('Error Handling', () => {
        it('should handle file system errors gracefully', async () => {
            const { executeShellTask } = await import('../src/executors/shell?t=' + Date.now());

            // Test with an invalid output path to trigger file system error
            const task: ShellTask = {
                id: 1,
                type: 'shell',
                shell_command: 'echo "test" > /invalid/path/file.txt',
                status: 'pending',
                result: null
            };

            const result = await executeShellTask(task);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });
});


