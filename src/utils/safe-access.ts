/**
 * Safe access utilities for null/undefined safety
 * Provides type-safe operations for common patterns that can fail
 */

/**
 * Type guard to check if a value is a non-empty string
 */
export function isValidString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard to check if a value is a valid number
 */
export function isValidNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Safe array access that returns undefined instead of throwing
 */
export function safeArrayAccess<T>(arr: T[], index: number): T | undefined {
    return index >= 0 && index < arr.length ? arr[index] : undefined;
}

/**
 * Safe parseInt that validates input and returns undefined for invalid values
 */
export function safeParseInt(value: unknown, radix: number = 10): number | undefined {
    if (!isValidString(value)) {
        return undefined;
    }
    
    const parsed = parseInt(value, radix);
    return isNaN(parsed) ? undefined : parsed;
}

/**
 * Safe parseFloat that validates input and returns undefined for invalid values
 */
export function safeParseFloat(value: unknown): number | undefined {
    if (!isValidString(value)) {
        return undefined;
    }
    
    const parsed = parseFloat(value);
    return isNaN(parsed) ? undefined : parsed;
}

/**
 * Safe string split that handles potential undefined results
 */
export function safeSplit(str: string, separator: string, index: number): string | undefined {
    const parts = str.split(separator);
    return safeArrayAccess(parts, index);
}

/**
 * Type guard to check if an object has a specific property
 */
export function hasProperty<T extends object, K extends string>(
    obj: T,
    key: K
): obj is T & Record<K, unknown> {
    return obj != null && typeof obj === 'object' && key in obj;
}

/**
 * Safe object property access with type checking
 */
export function safeGetProperty<T>(
    obj: unknown,
    key: string
): T | undefined {
    if (!obj || typeof obj !== 'object') {
        return undefined;
    }
    
    const typedObj = obj as Record<string, unknown>;
    return typedObj[key] as T | undefined;
}

/**
 * Type guard for checking if a value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Safe Object.entries that handles unknown types
 */
export function safeObjectEntries(obj: unknown): [string, unknown][] {
    if (!isObject(obj)) {
        return [];
    }
    return Object.entries(obj);
}

/**
 * Safe Object.keys that handles unknown types
 */
export function safeObjectKeys(obj: unknown): string[] {
    if (!isObject(obj)) {
        return [];
    }
    return Object.keys(obj);
}

/**
 * Validates that a database query result is not null/undefined
 */
export function validateQueryResult<T>(
    result: T | null | undefined,
    errorMessage: string = 'Query returned no results'
): T {
    if (result == null) {
        throw new Error(errorMessage);
    }
    return result;
}

/**
 * Validates that an array has elements
 */
export function validateNonEmptyArray<T>(
    arr: T[] | null | undefined,
    errorMessage: string = 'Array is empty or undefined'
): T[] {
    if (!arr || arr.length === 0) {
        throw new Error(errorMessage);
    }
    return arr;
}

/**
 * Safe CLI argument parsing helper
 */
export function parseCliArgument(
    arg: string,
    prefix: string
): string | undefined {
    if (!arg.startsWith(prefix)) {
        return undefined;
    }
    
    return safeSplit(arg, '=', 1);
}

/**
 * Validates required CLI arguments
 */
export function validateRequiredArg(
    value: unknown,
    argName: string
): string {
    if (!isValidString(value)) {
        throw new Error(`${argName} is required and must be a non-empty string`);
    }
    return value;
}

/**
 * Safe JSON parsing that returns undefined on error
 */
export function safeJsonParse<T = unknown>(jsonString: unknown): T | undefined {
    if (!isValidString(jsonString)) {
        return undefined;
    }
    
    try {
        return JSON.parse(jsonString) as T;
    } catch {
        return undefined;
    }
}
