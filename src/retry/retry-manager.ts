/**
 * Retry Manager - Handles retry logic and policy management
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';
import {
    type RetryPolicy,
    type RetryAttempt,
    type RetryContext,
    type RetryDecision,
    type RetryStats,
    type DatabaseRetryPolicy,
    type ErrorClassification,
    DEFAULT_RETRY_POLICY,
} from '../types/retry';
import { RETRY_ERROR_TYPES } from '../types/retry';

export class RetryManager {
    private db: Database;
    private policyCache: Map<string, RetryPolicy> = new Map();
    private lastCacheUpdate: number = 0;
    private readonly CACHE_TTL = 60000; // 1 minute

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Get retry policy for a task type
     */
    async getRetryPolicy(taskType: string): Promise<RetryPolicy> {
        // Check cache first
        const cacheKey = taskType;
        const now = Date.now();

        if (this.policyCache.has(cacheKey) && (now - this.lastCacheUpdate) < this.CACHE_TTL) {
            return this.policyCache.get(cacheKey)!;
        }

        // Fetch from database
        const dbPolicy = this.db.query(`
            SELECT * FROM retry_policies 
            WHERE task_type = ? AND enabled = TRUE
        `).get(taskType) as DatabaseRetryPolicy | null;

        let policy: RetryPolicy;

        if (dbPolicy) {
            policy = this.convertDatabasePolicy(dbPolicy);
        } else {
            // Use default policy
            policy = {
                ...DEFAULT_RETRY_POLICY,
                taskType,
                id: undefined
            };

            logger.info(`No retry policy found for task type ${taskType}, using default`, { policy });
        }

        // Update cache
        this.policyCache.set(cacheKey, policy);
        this.lastCacheUpdate = now;

        return policy;
    }

    /**
     * Determine if a task should be retried
     */
    async shouldRetry(context: RetryContext, error: Error): Promise<RetryDecision> {
        const { taskId, taskType, currentAttempt, maxRetries, policy } = context;

        // Check if we've exceeded max retries
        if (currentAttempt >= maxRetries) {
            return {
                shouldRetry: false,
                delayMs: 0,
                reason: `Maximum retries (${maxRetries}) exceeded`
            };
        }

        // Classify the error
        const errorClassification = this.classifyError(error, policy);

        // Check if error is retryable
        if (errorClassification.type === 'non_retryable') {
            return {
                shouldRetry: false,
                delayMs: 0,
                reason: `Error type '${errorClassification.category}' is not retryable`
            };
        }

        if (errorClassification.type === 'unknown' && errorClassification.confidence < 0.5) {
            logger.error('Unknown error type with low confidence, not retrying', {
                taskId,
                error: error.message,
                classification: errorClassification
            });

            return {
                shouldRetry: false,
                delayMs: 0,
                reason: 'Unknown error type with low confidence'
            };
        }

        // Calculate delay
        const delayMs = this.calculateDelay(currentAttempt + 1, policy);

        return {
            shouldRetry: true,
            delayMs,
            reason: `Error '${errorClassification.category}' is retryable`,
            nextAttempt: currentAttempt + 1
        };
    }

    /**
     * Calculate delay for next retry attempt
     */
    private calculateDelay(attemptNumber: number, policy: RetryPolicy): number {
        const { backoffStrategy, baseDelayMs, maxDelayMs, retryMultiplier } = policy;

        let delayMs: number;

        switch (backoffStrategy) {
            case 'exponential':
                delayMs = baseDelayMs * Math.pow(retryMultiplier, attemptNumber - 1);
                break;
            case 'linear':
                delayMs = baseDelayMs * attemptNumber * retryMultiplier;
                break;
            case 'fixed':
                delayMs = baseDelayMs;
                break;
            default:
                logger.error(`Unknown backoff strategy: ${backoffStrategy}, using exponential`);
                delayMs = baseDelayMs * Math.pow(2, attemptNumber - 1);
        }

        // Apply jitter (±10%) to prevent thundering herd
        const jitter = 0.1;
        const jitterAmount = delayMs * jitter * (Math.random() * 2 - 1);
        delayMs += jitterAmount;

        // Ensure delay is within bounds
        return Math.min(Math.max(delayMs, 0), maxDelayMs);
    }

    /**
     * Classify error to determine if it's retryable
     */
    private classifyError(error: Error, policy: RetryPolicy): ErrorClassification {
        const errorMessage = error.message.toLowerCase();
        const errorName = error.name.toLowerCase();

        // Check non-retryable errors first
        for (const pattern of policy.nonRetryableErrors) {
            if (errorMessage.includes(pattern.toLowerCase()) || errorName.includes(pattern.toLowerCase())) {
                return {
                    type: 'non_retryable',
                    category: pattern,
                    pattern,
                    confidence: 0.9
                };
            }
        }

        // Check retryable errors
        for (const pattern of policy.retryableErrors) {
            if (errorMessage.includes(pattern.toLowerCase()) || errorName.includes(pattern.toLowerCase())) {
                return {
                    type: 'retryable',
                    category: pattern,
                    pattern,
                    confidence: 0.9
                };
            }
        }

        // Heuristic classification for common error patterns
        const heuristics = [
            { patterns: ['timeout', 'timed out'], type: 'retryable', category: RETRY_ERROR_TYPES.TIMEOUT },
            { patterns: ['network', 'connection', 'dns'], type: 'retryable', category: RETRY_ERROR_TYPES.NETWORK },
            { patterns: ['rate limit', 'too many requests'], type: 'retryable', category: RETRY_ERROR_TYPES.RATE_LIMIT },
            { patterns: ['server error', '5xx', 'internal server'], type: 'retryable', category: RETRY_ERROR_TYPES.SERVER_ERROR },
            { patterns: ['syntax', 'parse', 'invalid syntax'], type: 'non_retryable', category: RETRY_ERROR_TYPES.SYNTAX },
            { patterns: ['permission', 'unauthorized', 'forbidden'], type: 'non_retryable', category: RETRY_ERROR_TYPES.PERMISSION },
            { patterns: ['not found', '404'], type: 'non_retryable', category: RETRY_ERROR_TYPES.NOT_FOUND },
        ];

        for (const heuristic of heuristics) {
            for (const pattern of heuristic.patterns) {
                if (errorMessage.includes(pattern) || errorName.includes(pattern)) {
                    return {
                        type: heuristic.type as 'retryable' | 'non_retryable',
                        category: heuristic.category,
                        confidence: 0.7
                    };
                }
            }
        }

        // Unknown error type
        return {
            type: 'unknown',
            category: RETRY_ERROR_TYPES.UNKNOWN,
            confidence: 0.3
        };
    }

    /**
     * Record a retry attempt
     */
    async recordRetryAttempt(attempt: Omit<RetryAttempt, 'id'>): Promise<number> {
        const insertStmt = this.db.prepare(`
            INSERT INTO retry_history 
            (task_id, attempt_number, attempted_at, error_message, error_type, 
             delay_ms, success, execution_time_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insertStmt.run(
            attempt.taskId,
            attempt.attemptNumber,
            attempt.attemptedAt,
            attempt.errorMessage || null,
            attempt.errorType || null,
            attempt.delayMs,
            attempt.success,
            attempt.executionTimeMs || null
        );

        logger.info('Recorded retry attempt', {
            taskId: attempt.taskId,
            attemptNumber: attempt.attemptNumber,
            success: attempt.success,
            delayMs: attempt.delayMs
        });

        return result.lastInsertRowid as number;
    }

    /**
     * Update task retry information
     */
    async updateTaskRetryInfo(taskId: number, retryCount: number, nextRetryAt?: Date, lastError?: string): Promise<void> {
        const updateStmt = this.db.prepare(`
            UPDATE tasks 
            SET retry_count = ?, 
                next_retry_at = ?, 
                last_retry_error = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        updateStmt.run(
            retryCount,
            nextRetryAt ? nextRetryAt.toISOString() : null,
            lastError || null,
            taskId
        );

        logger.info('Updated task retry info', {
            taskId,
            retryCount,
            nextRetryAt: nextRetryAt?.toISOString(),
            hasError: !!lastError
        });
    }

    /**
     * Get retry statistics for a task
     */
    async getRetryStats(taskId: number): Promise<RetryStats | null> {
        const stats = this.db.query(`
            SELECT 
                task_id,
                COUNT(*) as total_attempts,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_attempts,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_attempts,
                AVG(delay_ms) as average_delay_ms,
                SUM(COALESCE(execution_time_ms, 0)) as total_execution_time_ms,
                MAX(attempted_at) as last_attempt_at,
                MAX(CASE WHEN success = 1 THEN 1 ELSE 0 END) as final_success
            FROM retry_history 
            WHERE task_id = ?
            GROUP BY task_id
        `).get(taskId) as any;

        if (!stats) {
            return null;
        }

        return {
            taskId: stats.task_id,
            totalAttempts: stats.total_attempts,
            successfulAttempts: stats.successful_attempts,
            failedAttempts: stats.failed_attempts,
            averageDelayMs: stats.average_delay_ms || 0,
            totalExecutionTimeMs: stats.total_execution_time_ms || 0,
            lastAttemptAt: stats.last_attempt_at,
            finalSuccess: !!stats.final_success
        };
    }

    /**
     * Get tasks ready for retry
     */
    async getTasksReadyForRetry(): Promise<number[]> {
        const now = new Date().toISOString();

        const tasks = this.db.query(`
            SELECT id FROM tasks 
            WHERE status = 'error' 
            AND retry_count < max_retries 
            AND (next_retry_at IS NULL OR next_retry_at <= ?)
            ORDER BY next_retry_at ASC
        `).all(now) as Array<{ id: number }>;

        return tasks.map(task => task.id);
    }

    /**
     * Convert database policy to application policy
     */
    private convertDatabasePolicy(dbPolicy: DatabaseRetryPolicy): RetryPolicy {
        return {
            id: dbPolicy.id,
            taskType: dbPolicy.task_type,
            maxRetries: dbPolicy.max_retries,
            backoffStrategy: dbPolicy.backoff_strategy,
            baseDelayMs: dbPolicy.base_delay_ms,
            maxDelayMs: dbPolicy.max_delay_ms,
            retryMultiplier: dbPolicy.retry_multiplier,
            retryableErrors: JSON.parse(dbPolicy.retryable_errors || '[]'),
            nonRetryableErrors: JSON.parse(dbPolicy.non_retryable_errors || '[]'),
            enabled: dbPolicy.enabled,
            createdAt: dbPolicy.created_at,
            updatedAt: dbPolicy.updated_at
        };
    }

    /**
     * Clear policy cache (useful for testing or when policies are updated)
     */
    clearCache(): void {
        this.policyCache.clear();
        this.lastCacheUpdate = 0;
    }
}
