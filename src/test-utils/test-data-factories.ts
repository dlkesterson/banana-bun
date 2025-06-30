/**
 * Test data factories for creating valid test data
 * Addresses PRD 4: Test Infrastructure Modernization - Phase 2
 */

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
    MediaIngestTask,
    DatabaseTask,
    TaskStatus,
    TaskType
} from '../types/task';

import type {
    DatabaseRetryPolicy,
    DatabaseRetryAttempt,
    RetryPolicy,
    BackoffStrategy
} from '../types/retry';

import type {
    DatabaseTaskSchedule,
    DatabaseTaskInstance,
    TaskSchedule,
    OverlapPolicy,
    InstanceStatus
} from '../types/periodic';

import type {
    DatabaseMediaMetadata,
    MediaMetadata,
    AudioFeatures,
    VideoFeatures
} from '../types/media';

// Task Test Data Factory
export class TaskTestFactory {
    static createShellTask(overrides: Partial<ShellTask> = {}): ShellTask {
        return {
            id: 1,
            type: 'shell',
            description: 'Test shell task',
            status: 'pending',
            shell_command: 'echo "test"',
            dependencies: [],
            created_at: new Date().toISOString(),
            ...overrides
        };
    }

    static createLlmTask(overrides: Partial<LlmTask> = {}): LlmTask {
        return {
            id: 2,
            type: 'llm',
            description: 'Test LLM task',
            status: 'pending',
            prompt: 'Test prompt',
            model: 'gpt-4',
            dependencies: [],
            created_at: new Date().toISOString(),
            ...overrides
        };
    }

    static createPlannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
        return {
            id: 3,
            type: 'planner',
            description: 'Test planner task',
            status: 'pending',
            goal: 'Test goal',
            dependencies: [],
            created_at: new Date().toISOString(),
            ...overrides
        };
    }

    static createCodeTask(overrides: Partial<CodeTask> = {}): CodeTask {
        return {
            id: 4,
            type: 'code',
            description: 'Test code task',
            status: 'pending',
            language: 'typescript',
            code: 'console.log("test");',
            dependencies: [],
            created_at: new Date().toISOString(),
            ...overrides
        };
    }

    static createReviewTask(overrides: Partial<ReviewTask> = {}): ReviewTask {
        return {
            id: 5,
            type: 'review',
            description: 'Test review task',
            status: 'pending',
            target_task_id: 1,
            review_criteria: 'Test criteria',
            dependencies: [],
            created_at: new Date().toISOString(),
            ...overrides
        };
    }

    static createBatchTask(overrides: Partial<BatchTask> = {}): BatchTask {
        return {
            id: 6,
            type: 'batch',
            description: 'Test batch task',
            status: 'pending',
            subtasks: [
                this.createShellTask({ id: 7 }),
                this.createLlmTask({ id: 8 })
            ],
            dependencies: [],
            created_at: new Date().toISOString(),
            ...overrides
        };
    }

    static createToolTask(overrides: Partial<ToolTask> = {}): ToolTask {
        return {
            id: 9,
            type: 'tool',
            description: 'Test tool task',
            status: 'pending',
            tool: 'test-tool',
            args: { param1: 'value1' },
            dependencies: [],
            created_at: new Date().toISOString(),
            ...overrides
        };
    }

    static createMediaIngestTask(overrides: Partial<MediaIngestTask> = {}): MediaIngestTask {
        return {
            id: 10,
            type: 'media-ingest',
            description: 'Test media ingest task',
            status: 'pending',
            media_path: '/test/media.mp4',
            dependencies: [],
            created_at: new Date().toISOString(),
            ...overrides
        };
    }

    static createDatabaseTask(overrides: Partial<DatabaseTask> = {}): DatabaseTask {
        return {
            id: 1,
            filename: 'test.json',
            file_hash: 'abc123',
            parent_id: null,
            description: 'Test database task',
            type: 'shell',
            status: 'pending',
            dependencies: null,
            result_summary: null,
            shell_command: 'echo "test"',
            error_message: null,
            args: null,
            generator: null,
            tool: null,
            validation_errors: null,
            created_at: new Date().toISOString(),
            started_at: null,
            finished_at: null,
            ...overrides
        };
    }

    static createCompletedTask(type: TaskType = 'shell'): BaseTask {
        const base = this.createBaseTask(type);
        return {
            ...base,
            status: 'completed',
            result: { success: true, output: 'Task completed successfully' },
            started_at: new Date(Date.now() - 5000).toISOString(),
            finished_at: new Date().toISOString()
        };
    }

    static createErrorTask(type: TaskType = 'shell'): BaseTask {
        const base = this.createBaseTask(type);
        return {
            ...base,
            status: 'error',
            result: { success: false, error: 'Task execution failed' },
            error_message: 'Task execution failed',
            started_at: new Date(Date.now() - 5000).toISOString(),
            finished_at: new Date().toISOString()
        };
    }

    private static createBaseTask(type: TaskType): BaseTask {
        const baseProps = {
            id: 1,
            type,
            description: `Test ${type} task`,
            status: 'pending' as TaskStatus,
            dependencies: [],
            created_at: new Date().toISOString()
        };

        switch (type) {
            case 'shell':
                return { ...baseProps, shell_command: 'echo "test"' } as ShellTask;
            case 'llm':
                return { ...baseProps, prompt: 'Test prompt', model: 'gpt-4' } as LlmTask;
            case 'planner':
                return { ...baseProps, goal: 'Test goal' } as PlannerTask;
            case 'code':
                return { ...baseProps, language: 'typescript', code: 'console.log("test");' } as CodeTask;
            case 'review':
                return { ...baseProps, target_task_id: 1, review_criteria: 'Test criteria' } as ReviewTask;
            case 'batch':
                return { ...baseProps, subtasks: [] } as BatchTask;
            case 'tool':
                return { ...baseProps, tool: 'test-tool', args: {} } as ToolTask;
            case 'media-ingest':
                return { ...baseProps, media_path: '/test/media.mp4' } as MediaIngestTask;
            default:
                return baseProps as BaseTask;
        }
    }
}

// Database Test Data Factory
export class DatabaseTestFactory {
    static createRetryPolicy(overrides: Partial<DatabaseRetryPolicy> = {}): DatabaseRetryPolicy {
        return {
            id: 1,
            task_type: 'shell',
            max_retries: 3,
            backoff_strategy: 'exponential',
            base_delay_ms: 1000,
            max_delay_ms: 30000,
            retry_multiplier: 2.0,
            retryable_errors: JSON.stringify(['ECONNRESET', 'ETIMEDOUT']),
            non_retryable_errors: JSON.stringify(['EACCES', 'ENOENT']),
            enabled: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...overrides
        };
    }

    static createRetryAttempt(overrides: Partial<DatabaseRetryAttempt> = {}): DatabaseRetryAttempt {
        return {
            id: 1,
            task_id: 1,
            attempt_number: 1,
            attempted_at: new Date().toISOString(),
            error_message: 'Connection timeout',
            error_type: 'ETIMEDOUT',
            delay_ms: 1000,
            success: false,
            execution_time_ms: 5000,
            ...overrides
        };
    }

    static createTaskSchedule(overrides: Partial<DatabaseTaskSchedule> = {}): DatabaseTaskSchedule {
        return {
            id: 1,
            template_task_id: 1,
            cron_expression: '0 0 * * *',
            timezone: 'UTC',
            enabled: true,
            next_run_at: new Date(Date.now() + 86400000).toISOString(),
            last_run_at: null,
            run_count: 0,
            max_instances: 1,
            overlap_policy: 'skip',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...overrides
        };
    }

    static createTaskInstance(overrides: Partial<DatabaseTaskInstance> = {}): DatabaseTaskInstance {
        return {
            id: 1,
            schedule_id: 1,
            template_task_id: 1,
            instance_task_id: null,
            scheduled_for: new Date().toISOString(),
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            status: 'pending',
            execution_time_ms: null,
            error_message: null,
            ...overrides
        };
    }

    static createMediaMetadata(overrides: Partial<DatabaseMediaMetadata> = {}): DatabaseMediaMetadata {
        const metadata: MediaMetadata = {
            title: 'Test Video',
            duration: 120,
            format: 'mp4',
            resolution: '1920x1080',
            fileSize: 1024000,
            createdAt: new Date().toISOString()
        };

        return {
            id: 1,
            task_id: 1,
            file_path: '/test/media.mp4',
            file_hash: 'abc123def456',
            metadata_json: JSON.stringify(metadata),
            extracted_at: new Date().toISOString(),
            tool_used: 'ffprobe',
            ...overrides
        };
    }
}

// User Interaction Test Data Factory
export class UserInteractionTestFactory {
    static createUserInteraction(overrides: any = {}) {
        return {
            id: 1,
            user_id: 'test-user',
            session_id: 'test-session',
            interaction_type: 'search',
            content_type: 'media',
            query_text: 'test query',
            results_count: 5,
            interaction_timestamp: new Date().toISOString(),
            ...overrides
        };
    }

    static createSearchAnalytics(overrides: any = {}) {
        return {
            query: 'test search',
            processing_time: 150,
            results_count: 10,
            timestamp: new Date().toISOString(),
            ...overrides
        };
    }
}

// MCP Response Test Data Factory
export class MCPResponseTestFactory {
    static createToolResponse(content: any = {}) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(content)
                }
            ]
        };
    }

    static createErrorResponse(error: string = 'Test error') {
        return {
            error: {
                code: -1,
                message: error
            }
        };
    }

    static createListToolsResponse(tools: any[] = []) {
        return {
            tools: tools.length > 0 ? tools : [
                {
                    name: 'test_tool',
                    description: 'Test tool for testing',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: { type: 'string' }
                        }
                    }
                }
            ]
        };
    }
}
