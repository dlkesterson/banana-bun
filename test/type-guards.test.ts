import { describe, it, expect } from 'bun:test';
import {
    isBaseTask,
    isShellTask,
    isLlmTask,
    isPlannerTask,
    isCodeTask,
    isReviewTask,
    isRunCodeTask,
    isBatchTask,
    isToolTask,
    isYoutubeTask,
    isTaskOfType,
    getTaskType,
    assertTaskType,
    TaskTypeGuards,
    isTaskOfTypeGeneric,
    validateTaskStructure,
    safeParseTask
} from '../src/validation/type-guards';
import type { BaseTask, ShellTask, LlmTask, ToolTask } from '../src/types/task';
import { createShellTask } from '../src/test-utils/task-factories';

describe('Type Guards', () => {
    describe('isBaseTask', () => {
        it('should return true for valid base task', () => {
            const task = {
                id: 1,
                type: 'shell',
                status: 'pending',
                shell_command: 'echo test'
            };
            expect(isBaseTask(task)).toBe(true);
        });

        it('should return false for invalid objects', () => {
            expect(isBaseTask(null)).toBe(false);
            expect(isBaseTask(undefined)).toBe(false);
            expect(isBaseTask({})).toBe(false);
            expect(isBaseTask({ id: 1 })).toBe(false);
            expect(isBaseTask({ id: 1, type: 'invalid' })).toBe(false);
        });
    });

    describe('Specific Type Guards', () => {
        it('should validate ShellTask correctly', () => {
            const validShellTask: ShellTask = {
                id: 1,
                type: 'shell',
                status: 'pending',
                result: null,
                shell_command: 'echo "Hello World"',
                description: 'Test shell command'
            };

            const invalidShellTask = {
                id: 1,
                type: 'shell',
                status: 'pending',
                // missing shell_command
            };

            expect(isShellTask(validShellTask)).toBe(true);
            expect(isShellTask(invalidShellTask)).toBe(false);
        });

        it('should validate LlmTask correctly', () => {
            const validLlmTask: LlmTask = {
                id: 2,
                type: 'llm',
                status: 'pending',
                result: null,
                description: 'Generate a poem about TypeScript'
            };

            const invalidLlmTask = {
                id: 2,
                type: 'llm',
                status: 'pending',
                // missing description
            };

            expect(isLlmTask(validLlmTask)).toBe(true);
            expect(isLlmTask(invalidLlmTask)).toBe(false);
        });

        it('should validate ToolTask correctly', () => {
            const validToolTask: ToolTask = {
                id: 3,
                type: 'tool',
                status: 'pending',
                result: null,
                tool: 'read_file',
                args: { path: '/test/file.txt' }
            };

            const invalidToolTask = {
                id: 3,
                type: 'tool',
                status: 'pending',
                // missing tool and args
            };

            expect(isToolTask(validToolTask)).toBe(true);
            expect(isToolTask(invalidToolTask)).toBe(false);
        });
    });

    describe('isTaskOfType', () => {
        it('should correctly identify task types', () => {
            const shellTask: ShellTask = {
                id: 1,
                type: 'shell',
                status: 'pending',
                result: null,
                shell_command: 'echo test'
            };

            const llmTask: LlmTask = {
                id: 2,
                type: 'llm',
                status: 'pending',
                result: null,
                description: 'Test prompt'
            };

            expect(isTaskOfType(shellTask, 'shell')).toBe(true);
            expect(isTaskOfType(shellTask, 'llm')).toBe(false);
            expect(isTaskOfType(llmTask, 'llm')).toBe(true);
            expect(isTaskOfType(llmTask, 'shell')).toBe(false);
        });
    });

    describe('getTaskType', () => {
        it('should return correct task type', () => {
            const task = {
                id: 1,
                type: 'shell',
                status: 'pending',
                shell_command: 'echo test'
            };

            expect(getTaskType(task)).toBe('shell');
            expect(getTaskType({})).toBe(null);
            expect(getTaskType(null)).toBe(null);
        });
    });

    describe('assertTaskType', () => {
        it('should not throw for correct type', () => {
            const shellTask: ShellTask = {
                id: 1,
                type: 'shell',
                status: 'pending',
                result: null,
                shell_command: 'echo test'
            };

            expect(() => assertTaskType(shellTask, 'shell')).not.toThrow();
        });

        it('should throw for incorrect type', () => {
            const invalidTask = {
                id: 1,
                type: 'shell',
                status: 'pending'
                // missing shell_command
            };

            expect(() => assertTaskType(invalidTask, 'shell')).toThrow();
        });
    });

    describe('TaskTypeGuards mapping', () => {
        it('should have guards for all task types', () => {
            expect(TaskTypeGuards.shell).toBe(isShellTask);
            expect(TaskTypeGuards.llm).toBe(isLlmTask);
            expect(TaskTypeGuards.planner).toBe(isPlannerTask);
            expect(TaskTypeGuards.code).toBe(isCodeTask);
            expect(TaskTypeGuards.review).toBe(isReviewTask);
            expect(TaskTypeGuards.run_code).toBe(isRunCodeTask);
            expect(TaskTypeGuards.batch).toBe(isBatchTask);
            expect(TaskTypeGuards.tool).toBe(isToolTask);
            expect(TaskTypeGuards.youtube).toBe(isYoutubeTask);
        });
    });

    describe('isTaskOfTypeGeneric', () => {
        it('should work with the mapping', () => {
            const shellTask: ShellTask = {
                id: 1,
                type: 'shell',
                status: 'pending',
                result: null,
                shell_command: 'echo test'
            };

            expect(isTaskOfTypeGeneric(shellTask, 'shell')).toBe(true);
            expect(isTaskOfTypeGeneric(shellTask, 'llm')).toBe(false);
        });
    });

    describe('validateTaskStructure', () => {
        it('should return validation results', () => {
            const validTask = {
                id: 1,
                type: 'shell',
                status: 'pending',
                shell_command: 'echo test'
            };

            const invalidTask = {
                id: 1,
                type: 'shell',
                status: 'pending'
                // missing shell_command
            };

            const validResult = validateTaskStructure(validTask);
            const invalidResult = validateTaskStructure(invalidTask);

            expect(validResult.valid).toBe(true);
            expect(validResult.errors).toHaveLength(0);

            expect(invalidResult.valid).toBe(false);
            expect(invalidResult.errors.length).toBeGreaterThan(0);
        });
    });

    describe('safeParseTask', () => {
        it('should return success for valid task', () => {
            const validTask = createShellTask({
                id: 1,
                status: 'pending',
                shell_command: 'echo test'
            });

            const result = safeParseTask(validTask);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.type).toBe('shell');
                expect(result.data.id).toBe(1);
            }
        });

        it('should return errors for invalid task', () => {
            const invalidTask = {
                id: 1,
                type: 'invalid_type', // Invalid task type
                status: 'pending'
            };

            const result = safeParseTask(invalidTask);
            expect(result.success).toBe(false);
            expect('errors' in result).toBe(true);
            if ('errors' in result) {
                expect(result.errors.length).toBeGreaterThan(0);
            }
        });
    });
});
