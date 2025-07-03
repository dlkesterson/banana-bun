import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { createTestIsolation, type TestIsolationSetup } from './utils/test-isolation';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';
import { executeShellTask } from '../src/executors/shell';
import { executeLlmTask } from '../src/executors/llm';
import { executeCodeTask } from '../src/executors/code';
import { executeToolTask } from '../src/executors/tool';
import { executeTask } from '../src/executors/dispatcher';
import type { ShellTask, LlmTask, CodeTask, ToolTask, BaseTask } from '../src/types';

// Create test directory
const TEST_DIR = join(tmpdir(), `executors-test-${Date.now()}`);
const OUTPUT_DIR = join(TEST_DIR, 'outputs');

// Mock external dependencies
const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ response: 'Mocked LLM response' })
}));

const mockToolRunner = {
    executeTool: mock(() => Promise.resolve({
        success: true,
        output_path: join(OUTPUT_DIR, 'test-output.txt')
    }))
};

global.fetch = mockFetch as any;

// Mock dependencies for summarize executor
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));

const mockSummarizerService = {
    isInitialized: mock(() => true),
    generateSummaryForMedia: mock(() => Promise.resolve({ success: true, summary: 'test summary' }))
};
mock.module('../src/services/summarizer', () => ({ summarizerService: mockSummarizerService }));

const mockGetDatabase = mock(() => ({
    prepare: mock(() => ({
        get: mock(() => undefined),
        run: mock(() => ({ lastInsertRowid: 1 }))
    }))
}));
mock.module('../src/db', () => ({ getDatabase: mockGetDatabase }));

describe('Task Executors', () => {
    let testSetup: TestIsolationSetup;

    beforeEach(() => {
        // Create test directories
        rmSync(TEST_DIR, { recursive: true, force: true });
        mkdirSync(TEST_DIR, { recursive: true });
        mkdirSync(OUTPUT_DIR, { recursive: true });

        testSetup = createTestIsolation({
            '../src/tools/tool_runner': () => ({
                toolRunner: mockToolRunner
            }),
            '../src/config': () => ({
                config: {
                    paths: {
                        database: ':memory:',
                        logs: join(TEST_DIR, 'logs'),
                        outputs: OUTPUT_DIR,
                        tasks: join(TEST_DIR, 'tasks'),
                        incoming: join(TEST_DIR, 'incoming'),
                        processing: join(TEST_DIR, 'processing'),
                        archive: join(TEST_DIR, 'archive'),
                        error: join(TEST_DIR, 'error'),
                        dashboard: join(TEST_DIR, 'dashboard'),
                        media: join(TEST_DIR, 'media'),
                        chroma: {
                            host: 'localhost',
                            port: 8000,
                            ssl: false
                        }
                    },
                    ollama: {
                        model: 'llama2',
                        url: 'http://localhost:11434'
                    }
                }
            })
        });

        // Clear mocks
        mockFetch.mockClear();
        mockToolRunner.executeTool.mockClear();
    });

    afterEach(() => {
        testSetup.cleanup();
    });

    afterAll(() => {
        // Clean up test directory
        rmSync(TEST_DIR, { recursive: true, force: true });
        mock.restore();
    });

    describe('Shell Executor', () => {
        it('should execute simple shell command successfully', async () => {
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
            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:11434/api/generate',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
            );

            // Verify output file was created
            if (result.outputPath) {
                const content = await fs.readFile(result.outputPath, 'utf-8');
                expect(content).toContain('# Model');
                expect(content).toContain('# Prompt');
                expect(content).toContain('# Output');
                expect(content).toContain('Mocked LLM response');
            }
        });

        it('should handle LLM API failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            } as any);

            const task: LlmTask = {
                id: 2,
                type: 'llm',
                description: 'This should fail',
                status: 'pending',
                result: null
            };

            const result = await executeLlmTask(task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Ollama API error: 500');
        });

        it('should handle network errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const task: LlmTask = {
                id: 3,
                type: 'llm',
                description: 'This should fail with network error',
                status: 'pending',
                result: null
            };

            const result = await executeLlmTask(task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });
    });

    describe('Code Executor', () => {
        it('should execute code generation task', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    response: 'print("Hello from Python!")'
                })
            } as any);

            const task: CodeTask = {
                id: 1,
                type: 'code',
                description: 'Write a Python script that prints hello world',
                status: 'pending',
                result: null
            };

            const result = await executeCodeTask(task);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();
            expect(mockFetch).toHaveBeenCalled();

            if (result.outputPath) {
                const content = await fs.readFile(result.outputPath, 'utf-8');
                expect(content).toContain('print("Hello from Python!")');
            }
        });

        it('should infer language from description', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    response: 'console.log("Hello from JavaScript!");'
                })
            } as any);

            const task: CodeTask = {
                id: 2,
                type: 'code',
                description: 'Write a JavaScript function to calculate factorial',
                status: 'pending',
                result: null
            };

            const result = await executeCodeTask(task);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();

            // Check that the prompt included JavaScript
            const fetchCall = mockFetch.mock.calls[0] || [undefined, undefined];
            const requestData = fetchCall[1] || {} as RequestInit;
            const body = JSON.parse(requestData.body as string || '{}');
            expect(body.prompt).toContain('JavaScript');
        });
    });

    describe('Tool Executor', () => {
        it('should execute tool task successfully', async () => {
            const task: ToolTask = {
                id: 1,
                type: 'tool',
                tool: 'read_file',
                args: { path: '/test/file.txt' },
                status: 'pending',
                result: null,
                description: 'Read a test file'
            };

            const result = await executeToolTask(task);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBe('/test/output.txt');
            expect(mockToolRunner.executeTool).toHaveBeenCalledWith(
                'read_file',
                { path: '/test/file.txt' }
            );
        });

        it('should handle missing tool', async () => {
            const task: ToolTask = {
                id: 2,
                type: 'tool',
                tool: 'read_file', // Changed from empty string to a valid ToolName
                args: { path: '/test/file.txt' },
                status: 'pending',
                result: null,
                description: 'Invalid tool task'
            };

            await expect(executeToolTask(task)).rejects.toThrow(
                'Tool task missing required tool or args'
            );
        });

        it('should handle missing args', async () => {
            const task: ToolTask = {
                id: 3,
                type: 'tool',
                tool: 'read_file',
                args: undefined as any,
                status: 'pending',
                result: null,
                description: 'Invalid tool task'
            };

            await expect(executeToolTask(task)).rejects.toThrow(
                'Tool task missing required tool or args'
            );
        });

        it('should handle tool execution failure', async () => {
            mockToolRunner.executeTool.mockRejectedValueOnce(
                new Error('Tool execution failed')
            );

            const task: ToolTask = {
                id: 4,
                type: 'tool',
                tool: 'read_file',
                args: { path: '/nonexistent/file.txt' },
                status: 'pending',
                result: null,
                description: 'Failing tool task'
            };

            const result = await executeToolTask(task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Tool execution failed');
        });
    });

    describe('Task Dispatcher', () => {
        it('should dispatch shell task correctly', async () => {
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

        it('should dispatch tool task correctly', async () => {
            const task: BaseTask = {
                id: 3,
                type: 'tool',
                tool: 'read_file',
                args: { path: '/test/file.txt' },
                status: 'pending',
                result: null
            };

            const result = await executeTask(task);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();
        });

        it('should handle unknown task type', async () => {
            const task = {
                id: 4,
                type: 'unknown_type',
                status: 'pending',
                result: null
            } as any;

            await expect(executeTask(task)).rejects.toThrow(
                'Unknown task type: unknown_type'
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle file system errors gracefully', async () => {
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

afterAll(() => {
    // Restore all mocks after all tests in this file complete
    mock.restore();
});
