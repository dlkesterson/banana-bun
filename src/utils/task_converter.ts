import type {
    BaseTask,
    DatabaseTask,
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
    MediaOrganizeTask,
    TaskStatus
} from '../types';
import type { ToolName } from '../tools/tool_runner';

/**
 * Converts a DatabaseTask to the appropriate discriminated union type
 */
export function convertDatabaseTaskToBaseTask(dbTask: DatabaseTask): BaseTask {
    const baseFields = {
        id: dbTask.id,
        status: dbTask.status as TaskStatus,
        result: null, // Database doesn't store result object
        dependencies: dbTask.dependencies ? dbTask.dependencies.split(',').map(id => id.trim()).filter(Boolean) : undefined,
        dependents: undefined, // Not stored in database
        parent_id: dbTask.parent_id || undefined,
        filename: dbTask.filename || undefined,
        file_hash: dbTask.file_hash || undefined,
        started_at: dbTask.started_at || undefined,
        finished_at: dbTask.finished_at || undefined,
        result_summary: dbTask.result_summary || undefined,
        error_message: dbTask.error_message || undefined,
        error: dbTask.error_message || undefined,
        metadata: undefined // Not stored in database
    };

    // Parse args and generator from JSON strings
    let parsedArgs: Record<string, any> | string = {};
    let parsedGenerator: any = undefined;

    if (dbTask.args) {
        try {
            parsedArgs = JSON.parse(dbTask.args);
        } catch (err) {
            console.error('Failed to parse task args:', err);
            // Keep original string if JSON parsing fails
            parsedArgs = dbTask.args;
        }
    }

    if (dbTask.generator) {
        try {
            parsedGenerator = JSON.parse(dbTask.generator);
        } catch (err) {
            console.error('Failed to parse task generator:', err);
            // Keep original string if JSON parsing fails
            parsedGenerator = dbTask.generator;
        }
    }

    switch (dbTask.type) {
        case 'shell':
            return {
                ...baseFields,
                type: 'shell',
                shell_command: dbTask.shell_command || dbTask.description || '',
                description: dbTask.description
            } as ShellTask;

        case 'llm':
            return {
                ...baseFields,
                type: 'llm',
                description: dbTask.description || ''
            } as LlmTask;

        case 'planner':
            return {
                ...baseFields,
                type: 'planner',
                description: dbTask.description || ''
            } as PlannerTask;

        case 'code':
            return {
                ...baseFields,
                type: 'code',
                description: dbTask.description || ''
            } as CodeTask;

        case 'review':
            return {
                ...baseFields,
                type: 'review',
                dependencies: baseFields.dependencies || [],
                description: dbTask.description
            } as ReviewTask;

        case 'run_code':
            return {
                ...baseFields,
                type: 'run_code',
                dependencies: baseFields.dependencies || [],
                description: dbTask.description
            } as RunCodeTask;

        case 'batch':
            return {
                ...baseFields,
                type: 'batch',
                description: dbTask.description || 'Batch task',
                generator: parsedGenerator,
                subtasks: [], // Initialize empty subtasks array
                tasks: undefined // Legacy support
            } as BatchTask;

        case 'tool':
            // Use tool name from database or default
            const toolName = dbTask.tool || 'read_file';
            return {
                ...baseFields,
                type: 'tool',
                tool: toolName as ToolName,
                args: typeof parsedArgs === 'string' ? parsedArgs : parsedArgs,
                description: dbTask.description
            } as ToolTask;

        case 'youtube':
            return {
                ...baseFields,
                type: 'youtube',
                description: dbTask.description || 'YouTube task',
                url: dbTask.shell_command || undefined,
                shell_command: dbTask.shell_command
            } as YoutubeTask;

        case 'media_ingest':
            return {
                ...baseFields,
                type: 'media_ingest',
                description: dbTask.description || 'Media ingestion task',
                file_path: parsedArgs.file_path || '',
                force: parsedArgs.force || false,
                tool_preference: parsedArgs.tool_preference || 'auto'
            } as MediaIngestTask;

        case 'media_organize':
            return {
                ...baseFields,
                type: 'media_organize',
                description: dbTask.description || 'Media organization task',
                file_path: parsedArgs.file_path,
                file_paths: parsedArgs.file_paths,
                target_collection: parsedArgs.target_collection,
                force: parsedArgs.force || false,
                dry_run: parsedArgs.dry_run || false,
                metadata: parsedArgs.metadata
            } as MediaOrganizeTask;

        default:
            throw new Error(`Unknown task type: ${dbTask.type}`);
    }
}

/**
 * Converts an array of DatabaseTasks to BaseTask discriminated union types
 */
export function convertDatabaseTasksToBaseTasks(dbTasks: DatabaseTask[]): BaseTask[] {
    const results: BaseTask[] = [];

    for (const dbTask of dbTasks) {
        try {
            const baseTask = convertDatabaseTaskToBaseTask(dbTask);
            results.push(baseTask);
        } catch (error) {
            console.warn(`Failed to convert task ${dbTask.id} of type ${dbTask.type}:`, error);
            // Skip invalid tasks instead of failing the entire conversion
        }
    }

    return results;
}
