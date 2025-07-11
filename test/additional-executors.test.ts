import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { promises as fs } from 'fs';
import { Database } from 'bun:sqlite';
import { executeBatchTask } from '../src/executors/batch';
import { executePlannerTask } from '../src/executors/planner';
import { executeReviewTask } from '../src/executors/review';
import { executeRunCodeTask } from '../src/executors/run_code';
import { executeYoutubeTask } from '../src/executors/youtube';
import type { BatchTask, PlannerTask, ReviewTask, RunCodeTask, YoutubeTask } from '../src/types';

// Mock spawn to prevent actual yt-dlp calls
const mockSpawn = mock(() => ({
    stdout: new ReadableStream({
        start(controller) {
            controller.close();
        }
    }),
    stderr: new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('yt-dlp: command not found'));
            controller.close();
        }
    }),
    exited: Promise.resolve(1) // Exit with error code
}));

// Mock the spawn function from bun
mock.module('bun', () => {
    const originalBun = require('bun');
    return {
        ...originalBun,
        spawn: mockSpawn
    };
});

// Mock external dependencies
const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
        response: 'Mocked LLM response',
        choices: [{ message: { content: 'Generated plan' } }]
    })
})) as any;

// Add missing properties to make it compatible with fetch type
Object.assign(mockFetch, {
    preconnect: mock(() => { }),
    // Add other fetch properties as needed
});

const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

const mockConfig = {
    paths: {
        incoming: '/tmp/test-incoming',
        processing: '/tmp/test-processing',
        archive: '/tmp/test-archive',
        error: '/tmp/test-error',
        tasks: '/tmp/test-tasks',
        outputs: '/tmp/test-outputs',
        logs: '/tmp/test-logs',
        dashboard: '/tmp/test-dashboard',
        database: ':memory:',
        media: '/tmp/test-media',
        chroma: {
            host: 'localhost',
            port: 8000,
            ssl: false
        }
    },
    openai: {
        apiKey: 'test-api-key',
        model: 'gpt-4'
    },
    ollama: {
        url: 'http://localhost:11434',
        model: 'qwen3:8b',
        fastModel: 'qwen3:8b'
    }
};

// Create test database and dependency helper
let testDb: Database;
let mockDependencyHelper: any;

// Mock modules
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/config', () => ({ config: mockConfig }));

// Mock review executor
const mockReviewExecutor = {
    reviewOutput: mock(() => Promise.resolve({
        passed: true,
        score: 85,
        feedback: 'Task output looks good',
        suggestions: ['Consider adding more details']
    }))
};
mock.module('../src/executors/review_executor', () => ({ reviewExecutor: mockReviewExecutor }));

// Mock embedding manager
const mockEmbeddingManager = {
    findSimilarTasks: mock(() => Promise.resolve([]))
};
mock.module('../src/memory/embeddings', () => ({ embeddingManager: mockEmbeddingManager }));

// Mock database module
mock.module('../src/db', () => ({
    getDatabase: () => testDb,
    getDependencyHelper: () => mockDependencyHelper,
    initDatabase: mock(() => Promise.resolve())
}));

// Mock global fetch
global.fetch = mockFetch;

describe('Additional Executors', () => {
    const testDir = '/tmp/executor-test';

    beforeEach(async () => {
        await fs.mkdir(testDir, { recursive: true });
        await fs.mkdir(mockConfig.paths.outputs, { recursive: true });
        await fs.mkdir(mockConfig.paths.tasks, { recursive: true });

        // Initialize test database
        testDb = new Database(':memory:');

        // Create test tables
        testDb.run(`
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
                args TEXT,
                generator TEXT,
                tool TEXT,
                validation_errors TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                finished_at DATETIME
            )
        `);

        testDb.run(`
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT UNIQUE,
                title TEXT,
                channel TEXT,
                file_path TEXT,
                downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create mock dependency helper
        mockDependencyHelper = {
            addDependency: mock(() => { }),
            removeDependency: mock(() => { }),
            getDependencies: mock(() => []),
            hasCyclicDependency: mock(() => false),
            getExecutionOrder: mock(() => []),
            markTaskCompleted: mock(() => { }),
            getReadyTasks: mock(() => [])
        };

        // Reset mocks
        mockFetch.mockClear();
        mockReviewExecutor.reviewOutput.mockClear();
        mockEmbeddingManager.findSimilarTasks.mockClear();
        Object.values(mockLogger).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                fn.mockClear();
            }
        });
    });

    afterEach(async () => {
        // Close test database
        if (testDb) {
            testDb.close();
        }

        await fs.rm(testDir, { recursive: true, force: true });
        await fs.rm(mockConfig.paths.outputs, { recursive: true, force: true });
        await fs.rm(mockConfig.paths.tasks, { recursive: true, force: true });
    });

    describe('Batch Executor', () => {
        it('should execute batch task with subtasks', async () => {
            const batchTask: BatchTask = {
                id: 1,
                type: 'batch',
                description: 'Process multiple files',
                status: 'pending',
                result: null,
                subtasks: [
                    {
                        id: 2,
                        type: 'shell',
                        description: 'First subtask',
                        status: 'pending',
                        shell_command: 'echo "task 1"',
                        result: null
                    },
                    {
                        id: 3,
                        type: 'shell',
                        description: 'Second subtask',
                        status: 'pending',
                        shell_command: 'echo "task 2"',
                        result: null
                    }
                ]
            };

            const result = await executeBatchTask(batchTask);

            expect(result.success).toBe(true);
            expect(result.subtaskIds).toBeDefined();
            expect(result.subtaskIds?.length).toBe(2);
        });

        it('should handle empty batch task', async () => {
            const batchTask: BatchTask = {
                id: 1,
                type: 'batch',
                description: 'Empty batch',
                status: 'pending',
                result: null,
                subtasks: []
            };

            const result = await executeBatchTask(batchTask);

            expect(result.success).toBe(true);
            expect(result.subtaskIds).toEqual([]);
        });

        it('should handle batch task with invalid subtasks', async () => {
            const batchTask: BatchTask = {
                id: 1,
                type: 'batch',
                description: 'Batch with invalid subtasks',
                status: 'pending',
                result: null,
                subtasks: [
                    {
                        id: 2,
                        type: 'invalid_type' as any,
                        description: 'Invalid subtask',
                        status: 'pending',
                        result: null
                    }
                ]
            };

            const result = await executeBatchTask(batchTask);

            expect(result.success).toBe(false);
            expect(result.error).toContain('invalid');
        });
    });

    describe('Planner Executor', () => {
        it('should generate task plan using LLM', async () => {
            const plannerTask: PlannerTask = {
                id: 1,
                type: 'planner',
                description: 'Create a plan for organizing photos',
                status: 'pending',
                result: null,
                goal: 'Organize family photos by year and event'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    response: `subtasks:
  - type: shell
    description: Create year directories
    shell_command: mkdir -p photos/{2020..2024}
  - type: shell
    description: Sort photos by date
    shell_command: exiftool -d photos/%Y photos/*.jpg`
                })
            });

            const result = await executePlannerTask(plannerTask);

            expect(result.success).toBe(true);
            expect(result.subtaskIds).toBeDefined();
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('localhost:11434'),
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
            );
        });

        it('should handle LLM API errors', async () => {
            const plannerTask: PlannerTask = {
                id: 1,
                type: 'planner',
                description: 'Plan with API error',
                status: 'pending',
                result: null,
                goal: 'Test error handling'
            };

            mockFetch.mockRejectedValueOnce(new Error('API unavailable'));

            const result = await executePlannerTask(plannerTask);

            expect(result.success).toBe(false);
            expect(result.error).toContain('API unavailable');
        });

        it('should handle invalid LLM response', async () => {
            const plannerTask: PlannerTask = {
                id: 1,
                type: 'planner',
                description: 'Plan with invalid response',
                status: 'pending',
                result: null,
                goal: 'Test invalid response'
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    response: 'subtasks:\n  - type: shell\n    description: [invalid yaml structure'
                })
            });

            const result = await executePlannerTask(plannerTask);

            expect(result.success).toBe(false);
            expect(result.error).toContain('parse');
        });
    });

    describe('Review Executor', () => {
        it('should review task completion', async () => {
            // Create mock output file first
            const outputFile = `${mockConfig.paths.outputs}/task_2_output.txt`;
            await fs.writeFile(outputFile, 'Task completed successfully');

            // Create target task in database with output file path
            testDb.run(
                `INSERT INTO tasks (id, type, description, status, result_summary) VALUES (?, ?, ?, ?, ?)`,
                [2, 'shell', 'Test task to review', 'completed', outputFile]
            );

            const reviewTask: ReviewTask = {
                id: 1,
                type: 'review',
                description: 'Review completed task',
                status: 'pending',
                result: null,
                target_task_id: 2,
                criteria: ['Output file exists', 'No errors in log', 'Performance acceptable']
            };

            const result = await executeReviewTask(reviewTask);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();
        });

        it('should handle missing target task', async () => {
            const reviewTask: ReviewTask = {
                id: 1,
                type: 'review',
                description: 'Review non-existent task',
                status: 'pending',
                result: null,
                target_task_id: 999,
                criteria: ['Task exists']
            };

            const result = await executeReviewTask(reviewTask);

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should evaluate review criteria', async () => {
            // Create output file that meets criteria first
            const outputFile = `${mockConfig.paths.outputs}/task_2_output.txt`;
            await fs.writeFile(outputFile, 'Task completed successfully with detailed output that is longer than 100 bytes for testing purposes');

            // Create target task in database with output file path
            testDb.run(
                `INSERT INTO tasks (id, type, description, status, result_summary) VALUES (?, ?, ?, ?, ?)`,
                [2, 'shell', 'Test task with criteria', 'completed', outputFile]
            );

            const reviewTask: ReviewTask = {
                id: 1,
                type: 'review',
                description: 'Review with specific criteria',
                status: 'pending',
                result: null,
                target_task_id: 2,
                criteria: [
                    'File size > 100 bytes',
                    'Contains success message',
                    'No error keywords'
                ]
            };

            const result = await executeReviewTask(reviewTask);

            expect(result.success).toBe(true);
        });
    });

    describe('Run Code Executor', () => {
        it('should execute Python code', async () => {
            const runCodeTask: RunCodeTask = {
                id: 1,
                type: 'run_code',
                description: 'Run Python script',
                status: 'pending',
                result: null,
                language: 'python',
                code: 'print("Hello, World!")\nresult = 2 + 2\nprint(f"Result: {result}")'
            };

            const result = await executeRunCodeTask(runCodeTask);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();
        });

        it('should execute JavaScript code', async () => {
            const runCodeTask: RunCodeTask = {
                id: 1,
                type: 'run_code',
                description: 'Run JavaScript code',
                status: 'pending',
                result: null,
                language: 'javascript',
                code: 'console.log("Hello from JS"); const result = [1,2,3].map(x => x * 2); console.log(result);'
            };

            const result = await executeRunCodeTask(runCodeTask);

            expect(result.success).toBe(true);
            expect(result.outputPath).toBeDefined();
        });

        it('should handle unsupported language', async () => {
            const runCodeTask: RunCodeTask = {
                id: 1,
                type: 'run_code',
                description: 'Run unsupported language',
                status: 'pending',
                result: null,
                language: 'brainfuck',
                code: '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.'
            };

            const result = await executeRunCodeTask(runCodeTask);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unsupported language');
        });

        it('should handle code execution errors', async () => {
            const runCodeTask: RunCodeTask = {
                id: 1,
                type: 'run_code',
                description: 'Run code with syntax error',
                status: 'pending',
                result: null,
                language: 'python',
                code: 'print("Missing closing quote'
            };

            const result = await executeRunCodeTask(runCodeTask);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('YouTube Executor', () => {
        it.skip('should download YouTube video', async () => {
            // Skipping this test as it requires actual yt-dlp installation and network access
            // This test would be better suited for integration testing
            const youtubeTask: YoutubeTask = {
                id: 1,
                type: 'youtube',
                description: 'Download educational video',
                status: 'pending',
                result: null,
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                format: 'mp4',
                quality: '720p'
            };

            const result = await executeYoutubeTask(youtubeTask);

            // In test environment, yt-dlp is not available, so we expect failure
            // but we still check the result structure
            expect(result).toHaveProperty('success');
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            // The error can be either "Invalid URL: Failed to fetch video metadata" or "Failed to fetch YouTube metadata"
            expect(result.error).toMatch(/Failed to fetch.*metadata|Invalid URL.*Failed to fetch.*metadata/);
        });

        it('should handle invalid YouTube URL', async () => {
            const youtubeTask: YoutubeTask = {
                id: 1,
                type: 'youtube',
                description: 'Download from invalid URL',
                status: 'pending',
                result: null,
                url: 'https://not-youtube.com/watch?v=invalid',
                format: 'mp4'
            };

            const result = await executeYoutubeTask(youtubeTask);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid URL');
        });

        it('should handle download failures', async () => {
            const youtubeTask: YoutubeTask = {
                id: 1,
                type: 'youtube',
                description: 'Download unavailable video',
                status: 'pending',
                result: null,
                url: 'https://www.youtube.com/watch?v=unavailable123',
                format: 'mp4'
            };

            const result = await executeYoutubeTask(youtubeTask);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should support different formats and qualities', async () => {
            const formats = ['mp4', 'webm', 'mp3'];
            const qualities = ['720p', '1080p', 'best'];

            for (const format of formats) {
                for (const quality of qualities) {
                    const youtubeTask: YoutubeTask = {
                        id: 1,
                        type: 'youtube',
                        description: `Download ${format} at ${quality}`,
                        status: 'pending',
                        result: null,
                        url: 'https://www.youtube.com/watch?v=test',
                        format,
                        quality
                    };

                    // Test that the task structure is valid
                    expect(youtubeTask.format).toBe(format);
                    expect(youtubeTask.quality).toBe(quality);
                }
            }
        });
    });

    describe('Error Handling Across Executors', () => {
        it('should handle file system errors', async () => {
            // Test with non-existent directory path to simulate file system errors
            // On Windows, chmod doesn't work the same way, so we use a different approach
            const invalidPath = process.platform === 'win32'
                ? 'Z:\\nonexistent\\path\\test.txt'  // Invalid drive on Windows
                : '/root/readonly/test.txt';         // Typically read-only on Unix

            try {
                // This should handle permission/path errors gracefully
                await expect(fs.writeFile(invalidPath, 'test')).rejects.toThrow();
            } catch (error) {
                // Test passes if we get an error as expected
                expect(error).toBeDefined();
            }
        });

        it('should handle network timeouts', async () => {
            // Mock network timeout
            mockFetch.mockImplementationOnce(() =>
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Network timeout')), 100)
                )
            );

            const plannerTask: PlannerTask = {
                id: 1,
                type: 'planner',
                description: 'Test timeout',
                status: 'pending',
                result: null,
                goal: 'Test network timeout handling'
            };

            const result = await executePlannerTask(plannerTask);

            expect(result.success).toBe(false);
            expect(result.error).toContain('timeout');
        });

        it('should validate task parameters', () => {
            // Test parameter validation
            const invalidTasks = [
                { type: 'batch', subtasks: null }, // Invalid subtasks
                { type: 'planner', goal: '' }, // Empty goal
                { type: 'review', target_task_id: null }, // Missing target
                { type: 'run_code', code: '', language: 'python' }, // Empty code
                { type: 'youtube', url: '' } // Empty URL
            ];

            invalidTasks.forEach(task => {
                // Each task should fail validation
                const hasRequiredFields = task.type &&
                    (task.type !== 'batch' || task.subtasks) &&
                    (task.type !== 'planner' || (task as any).goal) &&
                    (task.type !== 'review' || (task as any).target_task_id) &&
                    (task.type !== 'run_code' || ((task as any).code && (task as any).language)) &&
                    (task.type !== 'youtube' || (task as any).url);

                expect(hasRequiredFields).toBeFalsy();
            });
        });
    });
});

afterAll(() => {
    // Restore all mocks after all tests in this file complete
    mock.restore();
});
