import { describe, it, expect } from 'bun:test';
import type {
    BaseTask,
    ShellTask,
    LlmTask,
    PlannerTask,
    CodeTask,
    ReviewTask,
    RunCodeTask,
    BatchTask,
    ToolTask,
    YoutubeTask,
    MediaIngestTask
} from '../src/types';

describe('Task Type System', () => {
    describe('Type Guards and Validation', () => {
        it('should create valid ShellTask', () => {
            const shellTask: ShellTask = {
                id: 1,
                type: 'shell',
                shell_command: 'echo "Hello World"',
                status: 'pending',
                result: null,
                description: 'Test shell command'
            };

            expect(shellTask.type).toBe('shell');
            expect(shellTask.shell_command).toBeDefined();
            expect(shellTask.status).toBe('pending');
        });

        it('should create valid LlmTask', () => {
            const llmTask: LlmTask = {
                id: 2,
                type: 'llm',
                description: 'Generate a poem about TypeScript',
                status: 'pending',
                result: null
            };

            expect(llmTask.type).toBe('llm');
            expect(llmTask.description).toBeDefined();
            expect(llmTask.status).toBe('pending');
        });

        it('should create valid PlannerTask', () => {
            const plannerTask: PlannerTask = {
                id: 3,
                type: 'planner',
                description: 'Plan a project to build a web application',
                status: 'pending',
                result: null,
                goal: 'Build a web application'
            };

            expect(plannerTask.type).toBe('planner');
            expect(plannerTask.description).toBeDefined();
            expect(plannerTask.goal).toBeDefined();
        });

        it('should create valid CodeTask', () => {
            const codeTask: CodeTask = {
                id: 4,
                type: 'code',
                description: 'Write a Python script to calculate fibonacci numbers',
                status: 'pending',
                result: null
            };

            expect(codeTask.type).toBe('code');
            expect(codeTask.description).toBeDefined();
        });

        it('should create valid ReviewTask', () => {
            const reviewTask: ReviewTask = {
                id: 5,
                type: 'review',
                status: 'pending',
                result: null,
                description: 'Review the generated code',
                target_task_id: 4,
                criteria: ['Code quality', 'Performance']
            };

            expect(reviewTask.type).toBe('review');
            expect(reviewTask.target_task_id).toBe(4);
            expect(reviewTask.description).toBeDefined();
        });

        it('should create valid RunCodeTask', () => {
            const runCodeTask: RunCodeTask = {
                id: 6,
                type: 'run_code',
                status: 'pending',
                result: null,
                description: 'Run the generated code',
                language: 'python',
                code: 'print("Hello World")'
            };

            expect(runCodeTask.type).toBe('run_code');
            expect(runCodeTask.language).toBe('python');
            expect(runCodeTask.code).toBeDefined();
        });

        it('should create valid BatchTask with generator', () => {
            const batchTask: BatchTask = {
                id: 7,
                type: 'batch',
                generator: {
                    type: 'folder_rename',
                    directory_path: '/test/path',
                    recursive: false
                },
                status: 'pending',
                result: null,
                description: 'Batch rename folders',
                subtasks: []
            };

            expect(batchTask.type).toBe('batch');
            expect(batchTask.generator).toBeDefined();
            expect(batchTask.generator?.type).toBe('folder_rename');
        });

        it('should create valid ToolTask', () => {
            const toolTask: ToolTask = {
                id: 8,
                type: 'tool',
                tool: 'read_file',
                args: {
                    path: '/test/file.txt'
                },
                status: 'pending',
                result: null,
                description: 'Read a test file'
            };

            expect(toolTask.type).toBe('tool');
            expect(toolTask.tool).toBe('read_file');
            expect(toolTask.args).toBeDefined();
            expect(toolTask.args.path).toBe('/test/file.txt');
        });

        it('should create valid YoutubeTask', () => {
            const youtubeTask: YoutubeTask = {
                id: 9,
                type: 'youtube',
                url: 'https://www.youtube.com/watch?v=test',
                shell_command: 'https://www.youtube.com/watch?v=test',
                status: 'pending',
                result: null,
                description: 'Download a test video'
            };

            expect(youtubeTask.type).toBe('youtube');
            expect(youtubeTask.url).toContain('youtube.com');
        });

        it('should create valid MediaIngestTask', () => {
            const mediaIngestTask: MediaIngestTask = {
                id: 10,
                type: 'media_ingest',
                description: 'Ingest metadata for movie.mp4',
                file_path: '/path/to/movie.mp4',
                status: 'pending',
                result: null,
                force: false,
                tool_preference: 'ffprobe'
            };

            expect(mediaIngestTask.type).toBe('media_ingest');
            expect(mediaIngestTask.file_path).toBe('/path/to/movie.mp4');
            expect(mediaIngestTask.force).toBe(false);
            expect(mediaIngestTask.tool_preference).toBe('ffprobe');
        });
    });

    describe('Discriminated Union Behavior', () => {
        it('should work with discriminated union array', () => {
            const tasks: BaseTask[] = [
                {
                    id: 1,
                    type: 'shell',
                    shell_command: 'echo test',
                    status: 'pending',
                    result: null
                },
                {
                    id: 2,
                    type: 'llm',
                    description: 'Test LLM task',
                    status: 'pending',
                    result: null
                },
                {
                    id: 3,
                    type: 'tool',
                    tool: 'read_file',
                    args: { path: '/test' },
                    status: 'pending',
                    result: null
                }
            ];

            expect(tasks).toHaveLength(3);
            expect(tasks[0].type).toBe('shell');
            expect(tasks[1].type).toBe('llm');
            expect(tasks[2].type).toBe('tool');
        });

        it('should enable type narrowing in switch statements', () => {
            const task: BaseTask = {
                id: 1,
                type: 'shell',
                shell_command: 'echo test',
                status: 'pending',
                result: null
            };

            let result: string;

            switch (task.type) {
                case 'shell':
                    // TypeScript knows this is a ShellTask
                    result = `Shell: ${task.shell_command}`;
                    break;
                case 'llm':
                    // TypeScript knows this is an LlmTask
                    result = `LLM: ${task.description}`;
                    break;
                case 'tool':
                    // TypeScript knows this is a ToolTask
                    result = `Tool: ${task.tool}`;
                    break;
                case 'media_ingest':
                    // TypeScript knows this is a MediaIngestTask
                    result = `Media: ${task.file_path}`;
                    break;
                default:
                    result = 'Unknown task type';
            }

            expect(result).toBe('Shell: echo test');
        });
    });

    describe('Task Status Values', () => {
        it('should accept valid status values', () => {
            const validStatuses = ['pending', 'running', 'completed', 'error'] as const;

            for (const status of validStatuses) {
                const task: BaseTask = {
                    id: 1,
                    type: 'shell',
                    shell_command: 'echo test',
                    status,
                    result: null
                };

                expect(task.status).toBe(status);
            }
        });
    });

    describe('Optional Fields', () => {
        it('should handle optional description field', () => {
            const taskWithDescription: ShellTask = {
                id: 1,
                type: 'shell',
                shell_command: 'echo test',
                status: 'pending',
                result: null,
                description: 'Test task with description'
            };

            const taskWithoutDescription: ShellTask = {
                id: 2,
                type: 'shell',
                shell_command: 'echo test',
                status: 'pending',
                result: null
            };

            expect(taskWithDescription.description).toBeDefined();
            expect(taskWithoutDescription.description).toBeUndefined();
        });

        it('should handle optional criteria field', () => {
            const taskWithCriteria: ReviewTask = {
                id: 1,
                type: 'review',
                description: 'Review with criteria',
                status: 'pending',
                result: null,
                criteria: ['Quality check', 'Performance check']
            };

            const taskWithoutCriteria: ReviewTask = {
                id: 2,
                type: 'review',
                description: 'Review without criteria',
                status: 'pending',
                result: null
            };

            expect(taskWithCriteria.criteria).toHaveLength(2);
            expect(taskWithoutCriteria.criteria).toBeUndefined();
        });
    });

    describe('Complex Task Configurations', () => {
        it('should handle BatchTask with static subtasks', () => {
            const batchTask: BatchTask = {
                id: 1,
                type: 'batch',
                subtasks: [
                    {
                        type: 'shell',
                        shell_command: 'echo "subtask 1"',
                        status: 'pending',
                        result: null
                    },
                    {
                        type: 'shell',
                        shell_command: 'echo "subtask 2"',
                        status: 'pending',
                        result: null
                    }
                ],
                status: 'pending',
                result: null,
                description: 'Batch task with static subtasks'
            };

            expect(batchTask.subtasks).toHaveLength(2);
            expect(batchTask.generator).toBeUndefined();
        });

        it('should handle BatchTask with generator', () => {
            const batchTask: BatchTask = {
                id: 1,
                type: 'batch',
                generator: {
                    type: 'folder_rename',
                    directory_path: '/test',
                    recursive: true
                },
                status: 'pending',
                result: null,
                description: 'Batch task with generator'
            };

            expect(batchTask.generator).toBeDefined();
            expect(batchTask.generator?.recursive).toBe(true);
            expect(batchTask.subtasks).toBeUndefined();
        });
    });
});
