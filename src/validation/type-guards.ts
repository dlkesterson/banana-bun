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
} from '../types/task';
import {
    TASK_TYPES,
    validateShellTask,
    validateLlmTask,
    validatePlannerTask,
    validateCodeTask,
    validateReviewTask,
    validateRunCodeTask,
    validateBatchTask,
    validateToolTask,
    validateYoutubeTask,
    validateMediaIngestTask,
    isValidTaskType,
    isStringOrNumber,
    isString,
    isArray,
    isObject,
    type ValidationResult
} from './schemas';

/**
 * Runtime type guards for each task type using native TypeScript
 * These provide type-safe runtime validation when loading/parsing tasks
 */

export function isBaseTask(obj: any): obj is BaseTask {
    return obj !== null &&
        obj !== undefined &&
        isObject(obj) &&
        isValidTaskType((obj as any).type) &&
        isStringOrNumber((obj as any).id) &&
        isString((obj as any).status);
}

// Specific type guards for each task type
export function isShellTask(obj: any): obj is ShellTask {
    if (!isBaseTask(obj) || obj.type !== 'shell') return false;
    const validation = validateShellTask(obj, true); // Use strict validation
    return validation.valid;
}

export function isLlmTask(obj: any): obj is LlmTask {
    if (!isBaseTask(obj) || obj.type !== 'llm') return false;
    const validation = validateLlmTask(obj, true); // Use strict validation
    return validation.valid;
}

export function isPlannerTask(obj: any): obj is PlannerTask {
    if (!isBaseTask(obj) || obj.type !== 'planner') return false;
    const validation = validatePlannerTask(obj);
    return validation.valid;
}

export function isCodeTask(obj: any): obj is CodeTask {
    if (!isBaseTask(obj) || obj.type !== 'code') return false;
    const validation = validateCodeTask(obj);
    return validation.valid;
}

export function isReviewTask(obj: any): obj is ReviewTask {
    if (!isBaseTask(obj) || obj.type !== 'review') return false;
    const validation = validateReviewTask(obj);
    return validation.valid;
}

export function isRunCodeTask(obj: any): obj is RunCodeTask {
    if (!isBaseTask(obj) || obj.type !== 'run_code') return false;
    const validation = validateRunCodeTask(obj);
    return validation.valid;
}

export function isBatchTask(obj: any): obj is BatchTask {
    if (!isBaseTask(obj) || obj.type !== 'batch') return false;
    const validation = validateBatchTask(obj);
    return validation.valid;
}

export function isToolTask(obj: any): obj is ToolTask {
    if (!isBaseTask(obj) || obj.type !== 'tool') return false;
    const validation = validateToolTask(obj, true); // Use strict validation
    return validation.valid;
}

export function isYoutubeTask(obj: any): obj is YoutubeTask {
    if (!isBaseTask(obj) || obj.type !== 'youtube') return false;
    const validation = validateYoutubeTask(obj);
    return validation.valid;
}

export function isMediaIngestTask(obj: any): obj is MediaIngestTask {
    if (!isBaseTask(obj) || obj.type !== 'media_ingest') return false;
    const validation = validateMediaIngestTask(obj);
    return validation.valid;
}

/**
 * Validates that a task object has all required fields for its type
 */
export function validateTaskStructure(obj: any): ValidationResult {
    if (!obj || typeof obj !== 'object') {
        return { valid: false, errors: ['Task must be an object'] };
    }

    if (!('type' in obj)) {
        return { valid: false, errors: ['Task must have a type property'] };
    }

    // Now TypeScript knows obj has a 'type' property
    const taskType = obj.type;

    switch (taskType) {
        case 'shell':
            return validateShellTask(obj, true); // Use strict validation
        case 'llm':
            return validateLlmTask(obj, true); // Use strict validation
        case 'planner':
            return validatePlannerTask(obj);
        case 'code':
            return validateCodeTask(obj);
        case 'review':
            return validateReviewTask(obj);
        case 'run_code':
            return validateRunCodeTask(obj);
        case 'batch':
            return validateBatchTask(obj);
        case 'tool':
            return validateToolTask(obj, true); // Use strict validation
        case 'youtube':
            return validateYoutubeTask(obj);
        case 'media_ingest':
            return validateMediaIngestTask(obj);
        default:
            return { valid: false, errors: [`Unknown task type: ${obj.type}`] };
    }
}

/**
 * Safe parsing function that returns either the parsed task or validation errors
 */
export function safeParseTask(obj: any): { success: true; data: BaseTask } | { success: false; errors: string[] } {
    const validation = validateTask(obj);
    if (validation.valid) {
        return { success: true, data: obj as BaseTask };
    } else {
        return { success: false, errors: validation.errors };
    }
}

// Discriminated union type guard
export function isTaskOfType<T extends BaseTask['type']>(
    obj: any,
    type: T
): obj is Extract<BaseTask, { type: T }> {
    if (!isBaseTask(obj) || obj.type !== type) return false;

    switch (type) {
        case 'shell':
            return isShellTask(obj);
        case 'llm':
            return isLlmTask(obj);
        case 'planner':
            return isPlannerTask(obj);
        case 'code':
            return isCodeTask(obj);
        case 'review':
            return isReviewTask(obj);
        case 'run_code':
            return isRunCodeTask(obj);
        case 'batch':
            return isBatchTask(obj);
        case 'tool':
            return isToolTask(obj);
        case 'youtube':
            return isYoutubeTask(obj);
        case 'media_ingest':
            return isMediaIngestTask(obj);
        default:
            return false;
    }
}

/**
 * Gets the task type from an object, or null if invalid
 */
export function getTaskType(obj: any): BaseTask['type'] | null {
    if (!isBaseTask(obj)) return null;
    return obj.type;
}

/**
 * Type assertion function that throws if the object is not of the expected type
 */
export function assertTaskType<T extends BaseTask['type']>(
    obj: any,
    type: T
): asserts obj is Extract<BaseTask, { type: T }> {
    if (!isTaskOfType(obj, type)) {
        throw new Error(`Expected task of type "${type}", but got: ${obj?.type || 'invalid task'}`);
    }
}

// Type guard mapping for programmatic access
export const TaskTypeGuards = {
    shell: isShellTask,
    llm: isLlmTask,
    planner: isPlannerTask,
    code: isCodeTask,
    review: isReviewTask,
    run_code: isRunCodeTask,
    batch: isBatchTask,
    tool: isToolTask,
    youtube: isYoutubeTask,
    media_ingest: isMediaIngestTask,
} as const;

/**
 * Generic type guard that uses the mapping above
 */
export function isTaskOfTypeGeneric(obj: any, type: BaseTask['type']): obj is BaseTask {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    // Check if 'type' exists on the object before using it
    if (!('type' in obj)) {
        return false;
    }

    const guard = TaskTypeGuards[type as keyof typeof TaskTypeGuards];
    return guard ? guard(obj) : false;
}

export function validateTask(obj: any): ValidationResult {
    if (!isObject(obj)) {
        return { valid: false, errors: ['Task must be an object'] };
    }

    // Check if 'type' property exists before accessing it
    if (!('type' in obj)) {
        return { valid: false, errors: ['Task object must have a "type" property'] };
    }

    if (!isValidTaskType(obj.type)) {
        return { valid: false, errors: [`Invalid task type. Must be one of: ${TASK_TYPES.join(', ')}`] };
    }

    switch (obj.type) {
        case 'shell':
            return validateShellTask(obj);
        case 'llm':
            return validateLlmTask(obj);
        case 'planner':
            return validatePlannerTask(obj);
        case 'code':
            return validateCodeTask(obj);
        case 'review':
            return validateReviewTask(obj);
        case 'run_code':
            return validateRunCodeTask(obj);
        case 'batch':
            return validateBatchTask(obj);
        case 'tool':
            return validateToolTask(obj);
        case 'youtube':
            return validateYoutubeTask(obj);
        case 'media_ingest':
            return validateMediaIngestTask(obj);
        default:
            return { valid: false, errors: [`Unknown task type: ${obj.type}`] };
    }
}
