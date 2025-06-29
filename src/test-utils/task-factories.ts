/**
 * Test utilities for creating valid task objects
 * These factories ensure test data matches the type requirements
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
    TaskStatus,
    TaskType
} from '../types/task';

// Base task factory with sensible defaults
export function createBaseTask(overrides: Partial<BaseTask> = {}): BaseTask {
    const defaults = {
        id: 1,
        status: 'pending' as TaskStatus,
        result: undefined, // Optional for pending tasks
        dependencies: [],
        created_at: new Date().toISOString(),
        ...overrides
    };

    // Ensure we have a valid task type
    const type = overrides.type || 'shell';
    
    switch (type) {
        case 'shell':
            return createShellTask(overrides as Partial<ShellTask>);
        case 'llm':
            return createLlmTask(overrides as Partial<LlmTask>);
        case 'planner':
            return createPlannerTask(overrides as Partial<PlannerTask>);
        case 'code':
            return createCodeTask(overrides as Partial<CodeTask>);
        case 'review':
            return createReviewTask(overrides as Partial<ReviewTask>);
        case 'run_code':
            return createRunCodeTask(overrides as Partial<RunCodeTask>);
        case 'batch':
            return createBatchTask(overrides as Partial<BatchTask>);
        case 'tool':
            return createToolTask(overrides as Partial<ToolTask>);
        case 'youtube':
            return createYoutubeTask(overrides as Partial<YoutubeTask>);
        case 'media_ingest':
            return createMediaIngestTask(overrides as Partial<MediaIngestTask>);
        default:
            throw new Error(`Unknown task type: ${type}`);
    }
}

// Specific task factories
export function createShellTask(overrides: Partial<ShellTask> = {}): ShellTask {
    return {
        id: 1,
        type: 'shell',
        status: 'pending',
        result: undefined,
        shell_command: 'echo "test"',
        description: 'Test shell task',
        ...overrides
    };
}

export function createLlmTask(overrides: Partial<LlmTask> = {}): LlmTask {
    return {
        id: 1,
        type: 'llm',
        status: 'pending',
        result: undefined,
        description: 'Test LLM task',
        context: 'Test context',
        model: 'llama3.2',
        ...overrides
    };
}

export function createPlannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
    return {
        id: 1,
        type: 'planner',
        status: 'pending',
        result: undefined,
        description: 'Test planner task',
        goal: 'Test goal',
        ...overrides
    } as PlannerTask;
}

export function createCodeTask(overrides: Partial<CodeTask> = {}): CodeTask {
    return {
        id: 1,
        type: 'code',
        status: 'pending',
        result: undefined,
        description: 'Test code task',
        language: 'typescript',
        requirements: ['Create a function'],
        ...overrides
    } as CodeTask;
}

export function createReviewTask(overrides: Partial<ReviewTask> = {}): ReviewTask {
    return {
        id: 1,
        type: 'review',
        status: 'pending',
        result: undefined,
        description: 'Test review task',
        target_task_id: 1,
        criteria: ['Check functionality'],
        ...overrides
    };
}

export function createRunCodeTask(overrides: Partial<RunCodeTask> = {}): RunCodeTask {
    return {
        id: 1,
        type: 'run_code',
        status: 'pending',
        result: undefined,
        description: 'Test run code task',
        language: 'typescript',
        code: 'console.log("test");',
        ...overrides
    };
}

export function createBatchTask(overrides: Partial<BatchTask> = {}): BatchTask {
    return {
        id: 1,
        type: 'batch',
        status: 'pending',
        result: undefined,
        description: 'Test batch task',
        subtasks: [],
        ...overrides
    };
}

export function createToolTask(overrides: Partial<ToolTask> = {}): ToolTask {
    return {
        id: 1,
        type: 'tool',
        status: 'pending',
        result: undefined,
        tool: 'read_file',
        args: { path: '/test' },
        description: 'Test tool task',
        ...overrides
    };
}

export function createYoutubeTask(overrides: Partial<YoutubeTask> = {}): YoutubeTask {
    return {
        id: 1,
        type: 'youtube',
        status: 'pending',
        result: undefined,
        description: 'Test YouTube task',
        url: 'https://youtube.com/watch?v=test',
        format: 'mp4',
        quality: '720p',
        ...overrides
    };
}

export function createMediaIngestTask(overrides: Partial<MediaIngestTask> = {}): MediaIngestTask {
    return {
        id: 1,
        type: 'media_ingest',
        status: 'pending',
        result: undefined,
        description: 'Test media ingest task',
        file_path: '/test/media.mp4',
        force: false,
        ...overrides
    };
}

// Task state factories
export function createPendingTask(type: TaskType = 'shell'): BaseTask {
    return createBaseTask({ type, status: 'pending' });
}

export function createRunningTask(type: TaskType = 'shell'): BaseTask {
    return createBaseTask({ 
        type, 
        status: 'running', 
        started_at: new Date().toISOString() 
    });
}

export function createCompletedTask(type: TaskType = 'shell'): BaseTask {
    return createBaseTask({ 
        type, 
        status: 'completed', 
        result: { success: true, output: 'Task completed' },
        started_at: new Date(Date.now() - 5000).toISOString(),
        finished_at: new Date().toISOString()
    });
}

export function createErrorTask(type: TaskType = 'shell'): BaseTask {
    return createBaseTask({ 
        type, 
        status: 'error', 
        result: { success: false, error: 'Task failed' },
        error_message: 'Task execution failed',
        started_at: new Date(Date.now() - 5000).toISOString(),
        finished_at: new Date().toISOString()
    });
}

// Minimal task creation for testing validation
export function createMinimalTask(type: TaskType): Partial<BaseTask> {
    return {
        type,
        status: 'pending'
    };
}

// Task with all optional fields for comprehensive testing
export function createFullTask(type: TaskType = 'shell'): BaseTask {
    const base = createBaseTask({ type });
    return {
        ...base,
        dependencies: ['dep1', 'dep2'],
        dependents: ['dep3', 'dep4'],
        parent_id: 100,
        filename: 'test.json',
        file_hash: 'abc123',
        started_at: new Date(Date.now() - 10000).toISOString(),
        finished_at: new Date().toISOString(),
        result_summary: 'Task completed successfully',
        error_message: undefined,
        metadata: {
            created_by: 'test-user',
            priority: 1,
            tags: ['test', 'automation'],
            source_file: 'test.json'
        }
    };
}
