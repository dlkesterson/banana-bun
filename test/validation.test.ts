import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { validateTaskSchema, validateTaskFile } from '../src/validation/schemas';
import type { BaseTask, ShellTask, LlmTask, CodeTask } from '../src/types';
import {
    createShellTask,
    createLlmTask,
    createCodeTask,
    createMinimalTask,
    createBaseTask
} from '../src/test-utils/task-factories';

describe('Validation System', () => {
    describe('Task Schema Validation', () => {
        describe('Base Task Validation', () => {
            it('should validate valid base task', () => {
                const validTask = createShellTask({
                    id: 1,
                    description: 'Test shell task',
                    status: 'pending'
                });

                expect(() => validateTaskSchema(validTask)).not.toThrow();
            });

            it('should reject task without required fields', () => {
                const invalidTasks = [
                    { id: 1, description: 'Missing type', status: 'pending' },
                    { id: 1, type: 'shell', status: 'pending' }, // Valid - description is optional
                    { id: 1, type: 'shell', description: 'Missing status' },
                    {} // Empty object
                ];

                // Only test truly invalid tasks
                const reallyInvalidTasks = [invalidTasks[0], invalidTasks[2], invalidTasks[3]];
                reallyInvalidTasks.forEach(task => {
                    expect(() => validateTaskSchema(task as any)).toThrow();
                });

                // Test that the valid task doesn't throw
                expect(() => validateTaskSchema(invalidTasks[1] as any)).not.toThrow();
            });

            it('should validate task status values', () => {
                const validStatuses = ['pending', 'running', 'completed', 'error', 'cancelled'];
                const invalidStatuses = ['unknown', 'processing', 'done', 'failed', ''];

                validStatuses.forEach(status => {
                    const task = createShellTask({
                        id: 1,
                        description: 'Test task',
                        status: status as any
                    });
                    expect(() => validateTaskSchema(task)).not.toThrow();
                });

                invalidStatuses.forEach(status => {
                    const task = createShellTask({
                        id: 1,
                        description: 'Test task',
                        status: status as any
                    });
                    expect(() => validateTaskSchema(task)).toThrow();
                });
            });

            it('should validate task types', () => {
                const validTypes = ['shell', 'llm', 'code', 'tool', 'batch', 'planner', 'review', 'run_code', 'youtube'];
                const invalidTypes = ['unknown', 'custom', 'invalid'];

                validTypes.forEach(type => {
                    const task = createBaseTask({
                        id: 1,
                        type: type as any,
                        description: 'Test task',
                        status: 'pending'
                    });
                    expect(() => validateTaskSchema(task)).not.toThrow();
                });

                invalidTypes.forEach(type => {
                    const task = createBaseTask({
                        id: 1,
                        type: type as any,
                        description: 'Test task',
                        status: 'pending'
                    });
                    expect(() => validateTaskSchema(task)).toThrow();
                });
            });
        });

        describe('Shell Task Validation', () => {
            it('should validate valid shell task', () => {
                const shellTask = createShellTask({
                    id: 1,
                    description: 'Run shell command',
                    status: 'pending',
                    shell_command: 'echo "hello world"'
                });

                expect(() => validateTaskSchema(shellTask)).not.toThrow();
            });

            it('should allow shell tasks without shell_command for creation', () => {
                const shellTaskWithoutCommand = createShellTask({
                    id: 1,
                    status: 'pending'
                    // shell_command is optional for creation
                });

                expect(() => validateTaskSchema(shellTaskWithoutCommand)).not.toThrow();
            });

            it('should reject empty shell commands when provided', () => {
                const invalidShellTask = createShellTask({
                    id: 1,
                    description: 'Shell task with empty command',
                    status: 'pending',
                    shell_command: ''
                });

                expect(() => validateTaskSchema(invalidShellTask)).toThrow();
            });
        });

        describe('LLM Task Validation', () => {
            it('should validate valid LLM task', () => {
                const llmTask = createLlmTask({
                    id: 1,
                    description: 'Generate text',
                    status: 'pending'
                });

                expect(() => validateTaskSchema(llmTask)).not.toThrow();
            });

            it('should validate LLM task with optional fields', () => {
                const llmTask: LlmTask = {
                    id: 1,
                    type: 'llm',
                    description: 'Generate text with context',
                    status: 'pending',
                    context: 'Additional context for generation',
                    model: 'gpt-4',
                    temperature: 0.7,
                    max_tokens: 1000
                };

                expect(() => validateTaskSchema(llmTask)).not.toThrow();
            });

            it('should validate temperature range', () => {
                const validTemperatures = [0, 0.5, 1.0, 2.0];
                const invalidTemperatures = [-0.1, 2.1, NaN, Infinity];

                validTemperatures.forEach(temp => {
                    const task: LlmTask = {
                        id: 1,
                        type: 'llm',
                        description: 'Test task',
                        status: 'pending',
                        temperature: temp
                    };
                    expect(() => validateTaskSchema(task)).not.toThrow();
                });

                invalidTemperatures.forEach(temp => {
                    const task: LlmTask = {
                        id: 1,
                        type: 'llm',
                        description: 'Test task',
                        status: 'pending',
                        temperature: temp
                    };
                    expect(() => validateTaskSchema(task)).toThrow();
                });
            });
        });

        describe('Code Task Validation', () => {
            it('should validate valid code task', () => {
                const codeTask: CodeTask = {
                    id: 1,
                    type: 'code',
                    description: 'Generate Python script',
                    status: 'pending'
                };

                expect(() => validateTaskSchema(codeTask)).not.toThrow();
            });

            it('should validate code task with language specification', () => {
                const codeTask: CodeTask = {
                    id: 1,
                    type: 'code',
                    description: 'Generate JavaScript function',
                    status: 'pending',
                    language: 'javascript',
                    requirements: ['Use ES6 syntax', 'Include error handling']
                };

                expect(() => validateTaskSchema(codeTask)).not.toThrow();
            });

            it('should validate supported programming languages', () => {
                const supportedLanguages = ['python', 'javascript', 'typescript', 'java', 'cpp', 'rust', 'go'];
                
                supportedLanguages.forEach(lang => {
                    const task: CodeTask = {
                        id: 1,
                        type: 'code',
                        description: `Generate ${lang} code`,
                        status: 'pending',
                        language: lang
                    };
                    expect(() => validateTaskSchema(task)).not.toThrow();
                });
            });
        });

        describe('Dependencies Validation', () => {
            it('should validate task dependencies format', () => {
                const taskWithDeps: BaseTask = {
                    id: 1,
                    type: 'shell',
                    description: 'Task with dependencies',
                    status: 'pending',
                    dependencies: ['1', '2', '3']
                };

                expect(() => validateTaskSchema(taskWithDeps)).not.toThrow();
            });

            it('should reject invalid dependency formats', () => {
                const invalidDependencies = [
                    [1, 2, 3], // Numbers instead of strings
                    [''], // Empty string
                    'not-an-array', // String instead of array
                    [null, undefined] // Invalid values
                ];

                invalidDependencies.forEach(deps => {
                    const task: BaseTask = {
                        id: 1,
                        type: 'shell',
                        description: 'Task with invalid deps',
                        status: 'pending',
                        dependencies: deps as any
                    };
                    expect(() => validateTaskSchema(task)).toThrow();
                });
            });
        });
    });

    describe('Task File Validation', () => {
        it('should validate JSON task file content', () => {
            const validJsonContent = JSON.stringify({
                type: 'shell',
                description: 'Test shell task',
                status: 'pending',
                shell_command: 'echo "test"'
            });

            expect(() => validateTaskFile(validJsonContent, 'json')).not.toThrow();
        });

        it('should validate YAML task file content', () => {
            const validYamlContent = `
type: llm
description: Generate a story
status: pending
context: Write a short story about AI
`;

            expect(() => validateTaskFile(validYamlContent, 'yaml')).not.toThrow();
        });

        it('should reject malformed JSON', () => {
            const invalidJsonContent = '{ "type": "shell", "description": }'; // Malformed JSON

            expect(() => validateTaskFile(invalidJsonContent, 'json')).toThrow();
        });

        it('should reject malformed YAML', () => {
            const invalidYamlContent = `
type: shell
description: [unclosed array
status: pending
`;

            expect(() => validateTaskFile(invalidYamlContent, 'yaml')).toThrow();
        });

        it('should validate task content after parsing', () => {
            const invalidTaskContent = JSON.stringify({
                // Missing required fields
                description: 'Task without type',
                status: 'pending'
            });

            expect(() => validateTaskFile(invalidTaskContent, 'json')).toThrow();
        });
    });

    describe('Batch Validation', () => {
        it('should validate multiple tasks at once', () => {
            const tasks: BaseTask[] = [
                {
                    id: 1,
                    type: 'shell',
                    description: 'First task',
                    status: 'pending',
                    shell_command: 'echo "1"'
                },
                {
                    id: 2,
                    type: 'llm',
                    description: 'Second task',
                    status: 'pending'
                }
            ];

            tasks.forEach(task => {
                expect(() => validateTaskSchema(task)).not.toThrow();
            });
        });

        it('should identify invalid tasks in batch', () => {
            const tasks = [
                {
                    id: 1,
                    type: 'shell',
                    description: 'Valid task',
                    status: 'pending',
                    shell_command: 'echo "valid"'
                },
                {
                    id: 2,
                    // Missing type
                    description: 'Invalid task',
                    status: 'pending'
                }
            ];

            expect(() => validateTaskSchema(tasks[0] as BaseTask)).not.toThrow();
            expect(() => validateTaskSchema(tasks[1] as any)).toThrow();
        });
    });

    describe('Custom Validation Rules', () => {
        it('should validate task description length', () => {
            const shortDescription = 'a'; // Too short
            const longDescription = 'a'.repeat(1001); // Too long
            const validDescription = 'This is a valid task description';

            const taskWithShortDesc: BaseTask = {
                id: 1,
                type: 'shell',
                description: shortDescription,
                status: 'pending'
            };

            const taskWithLongDesc: BaseTask = {
                id: 1,
                type: 'shell',
                description: longDescription,
                status: 'pending'
            };

            const taskWithValidDesc: BaseTask = {
                id: 1,
                type: 'shell',
                description: validDescription,
                status: 'pending'
            };

            expect(() => validateTaskSchema(taskWithShortDesc)).toThrow();
            expect(() => validateTaskSchema(taskWithLongDesc)).toThrow();
            expect(() => validateTaskSchema(taskWithValidDesc)).not.toThrow();
        });

        it('should validate task ID format', () => {
            const validIds = [1, 42, 999999];
            const invalidIds = [0, -1, 1.5, NaN, Infinity, '1', null, undefined];

            validIds.forEach(id => {
                const task: BaseTask = {
                    id,
                    type: 'shell',
                    description: 'Test task',
                    status: 'pending'
                };
                expect(() => validateTaskSchema(task)).not.toThrow();
            });

            invalidIds.forEach(id => {
                const task: BaseTask = {
                    id: id as any,
                    type: 'shell',
                    description: 'Test task',
                    status: 'pending'
                };
                expect(() => validateTaskSchema(task)).toThrow();
            });
        });
    });
});
