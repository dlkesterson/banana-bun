import { toolRunner } from '../tools/tool_runner';
import { logger } from '../utils/logger';
import { parseMarkdownTask } from '../utils/parser';
import type { ToolTask, BatchTask, TaskStatus } from '../types';
import { embeddingManager } from '../memory/embeddings';
import type { TaskEmbedding } from '../types';
import { enhancedTaskProcessor } from '../mcp/enhanced-task-processor.js';

// Task processor only handles tool and batch tasks
export type Task = ToolTask | BatchTask;

export class TaskProcessor {
    private taskMap: Map<string | number, Task> = new Map();
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY_MS = 5000;

    constructor() {
        // Initialize embedding manager
        embeddingManager.initialize().catch(error => {
            logger.error('Failed to initialize embedding manager', { error });
        });
    }

    private async checkDependencies(task: Task): Promise<boolean> {
        if (!task.dependencies?.length) return true;

        for (const depId of task.dependencies) {
            const depTask = this.taskMap.get(depId);
            if (!depTask) {
                await logger.error(`Dependency not found: ${depId}`, { taskId: String(task.id) });
                return false;
            }

            if (depTask.status === 'error' || depTask.status === 'cancelled') {
                await logger.info(`Task blocked by failed dependency: ${depId}`, { taskId: String(task.id) });
                return false;
            }

            if (depTask.status !== 'completed') {
                await logger.info(`Task blocked by incomplete dependency: ${depId}`, { taskId: String(task.id) });
                return false;
            }
        }

        return true;
    }

    private async propagateError(task: Task, error: Error) {
        if (!task.dependents?.length) return;

        for (const depId of task.dependents) {
            const depTask = this.taskMap.get(depId);
            if (!depTask) continue;

            depTask.status = 'cancelled';
            depTask.error = `Cancelled due to dependency failure: ${task.id} - ${error.message}`;
            await logger.info(`Propagating error to dependent task`, {
                fromTask: String(task.id),
                toTask: String(depId),
                error: error.message
            });

            // Recursively propagate to dependent tasks
            await this.propagateError(depTask, error);
        }
    }

    private async retryTask(task: Task): Promise<Task> {
        const retryCount = (task.metadata?.retry_count || 0) + 1;
        const maxRetries = task.metadata?.max_retries || this.MAX_RETRIES;

        if (retryCount > maxRetries) {
            task.status = 'error';
            task.error = `Failed after ${retryCount} retries`;
            return task;
        }

        task.status = 'pending';
        task.metadata = {
            ...task.metadata,
            retry_count: retryCount
        };

        await logger.info(`Retrying task`, {
            taskId: String(task.id),
            retryCount,
            maxRetries
        });

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));

        return this.processTask(task);
    }

    private async processBatchTask(task: BatchTask): Promise<BatchTask> {
        // Handle static batch tasks (with predefined subtasks)
        if (task.tasks?.length) {
            return this.processStaticBatchTask(task);
        }

        // Handle dynamic batch tasks (with generators)
        if (task.generator) {
            return this.processDynamicBatchTask(task);
        }

        throw new Error('Batch task must contain either subtasks or generator');
    }

    private async processStaticBatchTask(task: BatchTask): Promise<BatchTask> {
        if (!task.tasks?.length) {
            throw new Error('Static batch task must contain subtasks');
        }

        const results = [];
        const errors = [];

        for (const subtask of task.tasks) {
            try {
                // Only process tool and batch tasks in the task processor
                if (subtask.type === 'tool' || subtask.type === 'batch') {
                    const result = await this.processTask(subtask as Task);
                    results.push(result);
                    if (result.status === 'error') {
                        errors.push(result.error);
                    }
                } else {
                    // Skip non-tool/batch tasks - they should be handled by the main orchestrator
                    results.push({ ...subtask, status: 'skipped', result: 'Skipped - not a tool or batch task' });
                }
            } catch (error) {
                errors.push(error instanceof Error ? error.message : String(error));
            }
        }

        task.status = errors.length > 0 ? 'error' : 'completed';
        task.result = { results, errors };
        return task;
    }

    private async processDynamicBatchTask(task: BatchTask): Promise<BatchTask> {
        // Dynamic batch tasks are handled by the main orchestrator
        // This is just a placeholder - they shouldn't be processed here
        throw new Error('Dynamic batch tasks should be handled by the main orchestrator, not the task processor');
    }

    async processTask(task: Task): Promise<Task> {
        try {
            // Add task to map for dependency tracking
            this.taskMap.set(task.id, task);

            // Handle batch tasks
            if (task.type === 'batch') {
                return this.processBatchTask(task as BatchTask);
            }

            // Check dependencies
            const canExecute = await this.checkDependencies(task);
            if (!canExecute) {
                task.status = 'pending';
                return task;
            }

            // 🧠 Get MCP enhancements before processing (if available)
            try {
                const enhancements = await enhancedTaskProcessor.processTaskWithEnhancements({
                    id: task.id,
                    description: task.description,
                    type: task.type
                });

                if (enhancements.recommendations && enhancements.recommendations.length > 0) {
                    await logger.info('💡 MCP Recommendations received', {
                        taskId: task.id,
                        recommendations: enhancements.recommendations
                    });
                }
            } catch (mcpError) {
                // Don't fail the task if MCP enhancement fails
                await logger.error('MCP enhancement failed, continuing with task', {
                    taskId: task.id,
                    error: mcpError instanceof Error ? mcpError.message : String(mcpError)
                });
            }

            // For tool tasks, execute the tool
            if (task.type === 'tool') {
                const toolTask = task as ToolTask;

                // Log task start with markdown content if available
                await logger.taskStart(String(task.id), toolTask.tool, {
                    markdown_content: task.metadata?.markdown_content
                });

                // Update task status to running
                task.status = 'running';

                // Execute the tool
                const result = await toolRunner.executeTool(toolTask.tool, toolTask.args);

                // Update task with result
                task.status = 'completed';
                task.result = result;
            } else {
                throw new Error('Non-batch tasks should be tool tasks in the task processor');
            }

            // Log task completion
            await logger.taskComplete(String(task.id), task.result);

            // 🎯 Complete task with MCP enhancements (learning & notifications)
            // This handles both embedding storage and real-time notifications
            try {
                await enhancedTaskProcessor.completeTaskWithEnhancements({
                    id: task.id,
                    description: task.description,
                    type: task.type,
                    metadata: task.metadata
                }, { success: true, result: task.result });
            } catch (mcpError) {
                // Don't fail the task if MCP completion fails
                await logger.error('MCP completion failed', {
                    taskId: task.id,
                    error: mcpError instanceof Error ? mcpError.message : String(mcpError)
                });

                // Fallback: create embedding manually if MCP fails
                try {
                    const embedding: TaskEmbedding = {
                        id: `task-${task.id}`,
                        taskId: task.id,
                        description: task.description ?? '',
                        type: task.type,
                        status: task.status,
                        result: task.result,
                        metadata: task.metadata
                    };
                    await embeddingManager.addTaskEmbedding(embedding);
                    await logger.info('Fallback embedding created after MCP failure', { taskId: task.id });
                } catch (fallbackError) {
                    await logger.error('Both MCP and fallback embedding failed', {
                        taskId: task.id,
                        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
                    });
                }
            }

            return task;
        } catch (error: any) {
            // Check if we should retry
            if (error.retryable !== false) {
                return this.retryTask(task);
            }

            // Update task with error
            task.status = 'error';
            task.error = error.message;

            // Log task error
            await logger.taskError(String(task.id), error);

            // 🚨 Complete failed task with MCP enhancements (learning from failures)
            try {
                await enhancedTaskProcessor.completeTaskWithEnhancements({
                    id: task.id,
                    description: task.description,
                    type: task.type,
                    metadata: task.metadata
                }, { success: false, error: error.message });
            } catch (mcpError) {
                // Don't fail further if MCP completion fails
                await logger.error('MCP completion failed for error task', {
                    taskId: task.id,
                    error: mcpError instanceof Error ? mcpError.message : String(mcpError)
                });
            }

            // Propagate error to dependent tasks
            await this.propagateError(task, error);

            return task;
        }
    }

    async processTaskFile(filePath: string): Promise<Task> {
        const file = Bun.file(filePath);
        const content = await file.text();

        let parsedTask: any;
        if (filePath.endsWith('.md')) {
            parsedTask = await parseMarkdownTask(content);
        } else {
            parsedTask = await file.json();
        }

        // Use the ID as provided (string or number)
        const taskId = parsedTask.id;
        if (!taskId) {
            throw new Error('Invalid task format: missing id field');
        }

        // Determine task type
        const taskType = parsedTask.type || (parsedTask.tasks ? 'batch' : 'tool');

        let task: Task;
        if (taskType === 'batch') {
            task = {
                ...parsedTask,
                id: taskId,
                type: 'batch',
                status: 'pending' as TaskStatus,
                result: null,
                description: parsedTask.description,
                tasks: parsedTask.tasks,
                generator: parsedTask.generator,
                metadata: parsedTask.metadata
            } as BatchTask;
        } else {
            task = {
                ...parsedTask,
                id: taskId,
                type: 'tool',
                tool: parsedTask.tool,
                args: parsedTask.args || {},
                status: 'pending' as TaskStatus,
                result: null,
                description: parsedTask.description,
                metadata: parsedTask.metadata
            } as ToolTask;
        }

        // Validate task
        if (!task.id) {
            throw new Error('Invalid task format: missing required id field');
        }

        if (task.type === 'tool') {
            const toolTask = task as ToolTask;
            if (!toolTask.tool || !toolTask.args) {
                throw new Error('Invalid task format: tool tasks must have tool and args fields');
            }
        }

        if (task.type === 'batch') {
            const batchTask = task as BatchTask;
            if (!batchTask.tasks?.length && !batchTask.generator) {
                throw new Error('Invalid task format: batch tasks must have either tasks array or generator');
            }
        }

        return this.processTask(task);
    }
}

// Export a singleton instance
export const taskProcessor = new TaskProcessor(); 