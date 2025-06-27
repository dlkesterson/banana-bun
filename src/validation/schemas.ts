/**
 * Native TypeScript validation schemas using Bun's built-in capabilities
 * No external dependencies required
 */

// Task type constants with as const for literal types
export const TASK_TYPES = [
    'shell',
    'llm',
    'planner',
    'code',
    'review',
    'run_code',
    'batch',
    'tool',
    'youtube'
] as const;

export const TASK_STATUSES = [
    'pending',
    'running',
    'completed',
    'error',
    'cancelled'
] as const;

export type TaskType = typeof TASK_TYPES[number];
export type TaskStatus = typeof TASK_STATUSES[number];

// Validation result interface
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings?: string[];
}

// Phase 3: Assertion validation
export function isValidAssertionType(value: any): boolean {
    const validTypes = ['output_contains', 'output_not_contains', 'file_exists', 'file_not_exists', 'custom_script', 'json_schema', 'regex_match'];
    return isString(value) && validTypes.includes(value);
}

export function isValidAssertionSeverity(value: any): boolean {
    const validSeverities = ['error', 'warning', 'info'];
    return isString(value) && validSeverities.includes(value);
}

export function validateAssertion(obj: any): ValidationResult {
    const errors: string[] = [];

    if (!isValidAssertionType(obj.type)) {
        errors.push('assertion type must be one of: output_contains, output_not_contains, file_exists, file_not_exists, custom_script, json_schema, regex_match');
    }

    if (!isString(obj.description)) {
        errors.push('assertion description must be a string');
    }

    if (obj.condition === undefined) {
        errors.push('assertion condition is required');
    }

    if (!isValidAssertionSeverity(obj.severity)) {
        errors.push('assertion severity must be one of: error, warning, info');
    }

    if (obj.message !== undefined && !isString(obj.message)) {
        errors.push('assertion message must be a string');
    }

    return { valid: errors.length === 0, errors };
}

// Base validation functions
export function isString(value: any): value is string {
    return typeof value === 'string';
}

export function isNumber(value: any): value is number {
    return typeof value === 'number';
}

export function isStringOrNumber(value: any): value is string | number {
    return typeof value === 'string' || typeof value === 'number';
}

export function isArray(value: any): value is any[] {
    return Array.isArray(value);
}

export function isObject(value: any): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidTaskType(value: any): value is TaskType {
    return isString(value) && TASK_TYPES.includes(value as TaskType);
}

export function isValidTaskStatus(value: any): value is TaskStatus {
    return isString(value) && TASK_STATUSES.includes(value as TaskStatus);
}

export function isValidUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

export function isValidYouTubeUrl(value: string): boolean {
    if (!isValidUrl(value)) return false;
    const url = new URL(value);
    return url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com' || url.hostname === 'youtu.be';
}

// Base task validation
export function validateBaseTaskFields(obj: any): ValidationResult {
    const errors: string[] = [];

    if (!isStringOrNumber(obj.id)) {
        errors.push('id must be a string or number');
    }

    if (!isValidTaskStatus(obj.status)) {
        errors.push(`status must be one of: ${TASK_STATUSES.join(', ')}`);
    }

    if (obj.dependencies !== undefined && !isArray(obj.dependencies)) {
        errors.push('dependencies must be an array');
    }

    if (obj.dependents !== undefined && !isArray(obj.dependents)) {
        errors.push('dependents must be an array');
    }

    if (obj.parent_id !== undefined && !isStringOrNumber(obj.parent_id)) {
        errors.push('parent_id must be a string or number');
    }

    if (obj.filename !== undefined && !isString(obj.filename)) {
        errors.push('filename must be a string');
    }

    if (obj.file_hash !== undefined && !isString(obj.file_hash)) {
        errors.push('file_hash must be a string');
    }

    if (obj.metadata !== undefined && !isObject(obj.metadata)) {
        errors.push('metadata must be an object');
    }

    // Phase 3: Validate assertions if present
    if (obj.metadata?.assertions !== undefined) {
        if (!isArray(obj.metadata.assertions)) {
            errors.push('metadata.assertions must be an array');
        } else {
            for (let i = 0; i < obj.metadata.assertions.length; i++) {
                const assertionResult = validateAssertion(obj.metadata.assertions[i]);
                if (!assertionResult.valid) {
                    errors.push(`assertion ${i}: ${assertionResult.errors.join(', ')}`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

// Task-specific validation functions
export function validateShellTask(obj: any): ValidationResult {
    const baseResult = validateBaseTaskFields(obj);
    const errors = [...baseResult.errors];

    if (!isValidTaskType(obj.type) || obj.type !== 'shell') {
        errors.push('type must be "shell"');
    }

    if (!isString(obj.shell_command) || obj.shell_command.trim().length === 0) {
        errors.push('shell_command is required and must be a non-empty string');
    }

    if (obj.description !== undefined && !isString(obj.description)) {
        errors.push('description must be a string');
    }

    return { valid: errors.length === 0, errors };
}

export function validateLlmTask(obj: any): ValidationResult {
    const baseResult = validateBaseTaskFields(obj);
    const errors = [...baseResult.errors];

    if (!isValidTaskType(obj.type) || obj.type !== 'llm') {
        errors.push('type must be "llm"');
    }

    if (!isString(obj.description) || obj.description.trim().length === 0) {
        errors.push('description is required and must be a non-empty string');
    }

    return { valid: errors.length === 0, errors };
}

export function validatePlannerTask(obj: any): ValidationResult {
    const baseResult = validateBaseTaskFields(obj);
    const errors = [...baseResult.errors];

    if (!isValidTaskType(obj.type) || obj.type !== 'planner') {
        errors.push('type must be "planner"');
    }

    if (!isString(obj.description) || obj.description.trim().length === 0) {
        errors.push('description is required and must be a non-empty string');
    }

    return { valid: errors.length === 0, errors };
}

export function validateCodeTask(obj: any): ValidationResult {
    const baseResult = validateBaseTaskFields(obj);
    const errors = [...baseResult.errors];

    if (!isValidTaskType(obj.type) || obj.type !== 'code') {
        errors.push('type must be "code"');
    }

    if (!isString(obj.description) || obj.description.trim().length === 0) {
        errors.push('description is required and must be a non-empty string');
    }

    return { valid: errors.length === 0, errors };
}

export function validateReviewTask(obj: any): ValidationResult {
    const baseResult = validateBaseTaskFields(obj);
    const errors = [...baseResult.errors];

    if (!isValidTaskType(obj.type) || obj.type !== 'review') {
        errors.push('type must be "review"');
    }

    if (!isArray(obj.dependencies) || obj.dependencies.length === 0) {
        errors.push('dependencies is required and must be a non-empty array');
    }

    if (obj.description !== undefined && !isString(obj.description)) {
        errors.push('description must be a string');
    }

    return { valid: errors.length === 0, errors };
}

export function validateRunCodeTask(obj: any): ValidationResult {
    const baseResult = validateBaseTaskFields(obj);
    const errors = [...baseResult.errors];

    if (!isValidTaskType(obj.type) || obj.type !== 'run_code') {
        errors.push('type must be "run_code"');
    }

    if (!isArray(obj.dependencies) || obj.dependencies.length === 0) {
        errors.push('dependencies is required and must be a non-empty array');
    }

    if (obj.description !== undefined && !isString(obj.description)) {
        errors.push('description must be a string');
    }

    return { valid: errors.length === 0, errors };
}

export function validateBatchTask(obj: any): ValidationResult {
    const baseResult = validateBaseTaskFields(obj);
    const errors = [...baseResult.errors];

    if (!isValidTaskType(obj.type) || obj.type !== 'batch') {
        errors.push('type must be "batch"');
    }

    // Batch tasks must have either tasks array or generator, but not necessarily both
    const hasTasks = isArray(obj.tasks) && obj.tasks.length > 0;
    const hasGenerator = isObject(obj.generator);

    if (!hasTasks && !hasGenerator) {
        errors.push('batch task must have either a non-empty tasks array or a generator object');
    }

    if (obj.description !== undefined && !isString(obj.description)) {
        errors.push('description must be a string');
    }

    if (obj.generator !== undefined && !isObject(obj.generator)) {
        errors.push('generator must be an object');
    }

    return { valid: errors.length === 0, errors };
}

export function validateToolTask(obj: any): ValidationResult {
    const baseResult = validateBaseTaskFields(obj);
    const errors = [...baseResult.errors];

    if (!isValidTaskType(obj.type) || obj.type !== 'tool') {
        errors.push('type must be "tool"');
    }

    if (!isString(obj.tool) || obj.tool.trim().length === 0) {
        errors.push('tool is required and must be a non-empty string');
    }

    if (!isObject(obj.args)) {
        errors.push('args is required and must be an object');
    }

    if (obj.description !== undefined && !isString(obj.description)) {
        errors.push('description must be a string');
    }

    return { valid: errors.length === 0, errors };
}

export function validateYoutubeTask(obj: any): ValidationResult {
    const baseResult = validateBaseTaskFields(obj);
    const errors = [...baseResult.errors];

    if (!isValidTaskType(obj.type) || obj.type !== 'youtube') {
        errors.push('type must be "youtube"');
    }

    if (!isString(obj.shell_command) || obj.shell_command.trim().length === 0) {
        errors.push('shell_command is required and must be a non-empty string');
    } else if (!isValidYouTubeUrl(obj.shell_command)) {
        errors.push('shell_command must be a valid YouTube URL');
    }

    if (obj.description !== undefined && !isString(obj.description)) {
        errors.push('description must be a string');
    }

    return { valid: errors.length === 0, errors };
}

export function validateMediaIngestTask(obj: any): ValidationResult {
    const baseResult = validateBaseTaskFields(obj);
    const errors = [...baseResult.errors];

    if (!isValidTaskType(obj.type) || obj.type !== 'media_ingest') {
        errors.push('type must be "media_ingest"');
    }

    if (!isString(obj.description) || obj.description.trim().length === 0) {
        errors.push('description is required and must be a non-empty string');
    }

    if (!isString(obj.file_path) || obj.file_path.trim().length === 0) {
        errors.push('file_path is required and must be a non-empty string');
    }

    if (obj.force !== undefined && typeof obj.force !== 'boolean') {
        errors.push('force must be a boolean');
    }

    if (obj.tool_preference !== undefined &&
        !['ffprobe', 'mediainfo', 'auto'].includes(obj.tool_preference)) {
        errors.push('tool_preference must be one of: ffprobe, mediainfo, auto');
    }

    return { valid: errors.length === 0, errors };
}

// Main validation function that routes to specific validators
export function validateTask(obj: any): ValidationResult {
    if (!isObject(obj)) {
        return { valid: false, errors: ['Task must be an object'] };
    }

    if (!('type' in obj)) {
        return { valid: false, errors: ['Task must have a type property'] };
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

// Schema mapping for easy access
export const TaskValidators = {
    shell: validateShellTask,
    llm: validateLlmTask,
    planner: validatePlannerTask,
    code: validateCodeTask,
    review: validateReviewTask,
    run_code: validateRunCodeTask,
    batch: validateBatchTask,
    tool: validateToolTask,
    youtube: validateYoutubeTask,
    media_ingest: validateMediaIngestTask,
} as const;

// Compatibility functions for tests
export function validateTaskSchema(task: any): void {
    const result = validateTask(task);
    if (!result.valid) {
        throw new Error(`Task validation failed: ${result.errors.join(', ')}`);
    }
}

export function validateTaskFile(content: string, format: 'json' | 'yaml'): void {
    let parsedContent: any;

    try {
        if (format === 'json') {
            parsedContent = JSON.parse(content);
        } else {
            // For YAML, we'd need to import a YAML parser
            // For now, just try to parse as JSON for basic validation
            parsedContent = JSON.parse(content);
        }
    } catch (error) {
        throw new Error(`Failed to parse ${format.toUpperCase()} content: ${error instanceof Error ? error.message : String(error)}`);
    }

    validateTaskSchema(parsedContent);
}
