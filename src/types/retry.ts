/**
 * Type definitions for the retry system
 */

export type BackoffStrategy = 'exponential' | 'linear' | 'fixed';

export interface RetryPolicy {
    id?: number;
    taskType: string;
    maxRetries: number;
    backoffStrategy: BackoffStrategy;
    baseDelayMs: number;
    maxDelayMs: number;
    retryMultiplier: number;
    retryableErrors: string[];
    nonRetryableErrors: string[];
    enabled: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface RetryAttempt {
    id?: number;
    taskId: number;
    attemptNumber: number;
    attemptedAt: string;
    errorMessage?: string;
    errorType?: string;
    delayMs: number;
    success: boolean;
    executionTimeMs?: number;
}

export interface RetryContext {
    taskId: number;
    taskType: string;
    currentAttempt: number;
    maxRetries: number;
    lastError?: string;
    lastErrorType?: string;
    policy: RetryPolicy;
}

export interface RetryDecision {
    shouldRetry: boolean;
    delayMs: number;
    reason: string;
    nextAttempt?: number;
}

export interface RetryStats {
    taskId: number;
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    averageDelayMs: number;
    totalExecutionTimeMs: number;
    lastAttemptAt: string;
    finalSuccess: boolean;
}

// Database row interfaces
export interface DatabaseRetryPolicy {
    id: number;
    task_type: string;
    max_retries: number;
    backoff_strategy: BackoffStrategy;
    base_delay_ms: number;
    max_delay_ms: number;
    retry_multiplier: number;
    retryable_errors: string; // JSON string
    non_retryable_errors: string; // JSON string
    enabled: boolean;
    created_at: string;
    updated_at: string;
}

export interface DatabaseRetryAttempt {
    id: number;
    task_id: number;
    attempt_number: number;
    attempted_at: string;
    error_message: string | null;
    error_type: string | null;
    delay_ms: number;
    success: boolean;
    execution_time_ms: number | null;
}

// Enhanced task interface with retry fields
export interface TaskWithRetry {
    id: number;
    retry_count: number;
    max_retries: number;
    next_retry_at: string | null;
    retry_policy_id: number | null;
    last_retry_error: string | null;
}

// Retry configuration for task types
export interface TaskTypeRetryConfig {
    [taskType: string]: Partial<RetryPolicy>;
}

// Error classification
export interface ErrorClassification {
    type: 'retryable' | 'non_retryable' | 'unknown';
    category: string;
    pattern?: string;
    confidence: number;
}

// Retry metrics
export interface RetryMetrics {
    totalTasks: number;
    tasksWithRetries: number;
    averageRetryCount: number;
    successRateAfterRetry: number;
    mostCommonErrors: Array<{
        error: string;
        count: number;
        retrySuccessRate: number;
    }>;
    retryDelayDistribution: {
        min: number;
        max: number;
        average: number;
        median: number;
    };
}

// Constants
export const DEFAULT_RETRY_POLICY: Omit<RetryPolicy, 'taskType'> = {
    maxRetries: 3,
    backoffStrategy: 'exponential',
    baseDelayMs: 1000,
    maxDelayMs: 300000, // 5 minutes
    retryMultiplier: 2.0,
    retryableErrors: ['timeout', 'network', 'temporary', 'rate_limit'],
    nonRetryableErrors: ['syntax', 'permission', 'not_found', 'invalid'],
    enabled: true
};

export const BACKOFF_STRATEGIES = {
    exponential: 'exponential',
    linear: 'linear',
    fixed: 'fixed'
} as const;

export const RETRY_ERROR_TYPES = {
    TIMEOUT: 'timeout',
    NETWORK: 'network',
    RATE_LIMIT: 'rate_limit',
    SERVER_ERROR: 'server_error',
    TEMPORARY: 'temporary',
    SYNTAX: 'syntax',
    PERMISSION: 'permission',
    NOT_FOUND: 'not_found',
    INVALID_ARGS: 'invalid_args',
    QUOTA_EXCEEDED: 'quota_exceeded',
    UNKNOWN: 'unknown'
} as const;

export type RetryErrorType = typeof RETRY_ERROR_TYPES[keyof typeof RETRY_ERROR_TYPES];
