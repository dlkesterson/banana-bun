import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { RetryManager } from '../src/retry/retry-manager';
import { RetrySystemMigration } from '../src/migrations/002-add-retry-system';
import type { RetryContext } from '../src/types/retry';

describe('Retry System', () => {
    let db: Database;
    let retryManager: RetryManager;
    let migration: RetrySystemMigration;

    beforeEach(async () => {
        // Create in-memory database for testing
        db = new Database(':memory:');
        
        // Create basic tasks table
        db.run(`
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                status TEXT,
                description TEXT,
                retry_count INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 3,
                next_retry_at DATETIME,
                retry_policy_id INTEGER,
                last_retry_error TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Run retry system migration
        migration = new RetrySystemMigration(db);
        await migration.up();

        // Initialize retry manager
        retryManager = new RetryManager(db);
    });

    afterEach(() => {
        db.close();
    });

    describe('RetryManager', () => {
        it('should get retry policy for task type', async () => {
            const policy = await retryManager.getRetryPolicy('shell');
            
            expect(policy.taskType).toBe('shell');
            expect(policy.maxRetries).toBe(3);
            expect(policy.backoffStrategy).toBe('exponential');
            expect(policy.baseDelayMs).toBe(1000);
            expect(policy.retryableErrors).toContain('timeout');
            expect(policy.nonRetryableErrors).toContain('syntax');
        });

        it('should use default policy for unknown task type', async () => {
            const policy = await retryManager.getRetryPolicy('unknown_type');
            
            expect(policy.taskType).toBe('unknown_type');
            expect(policy.maxRetries).toBe(3);
            expect(policy.backoffStrategy).toBe('exponential');
        });

        it('should determine retry for retryable error', async () => {
            const policy = await retryManager.getRetryPolicy('shell');
            const context: RetryContext = {
                taskId: 1,
                taskType: 'shell',
                currentAttempt: 1,
                maxRetries: 3,
                policy
            };

            const error = new Error('Connection timeout occurred');
            const decision = await retryManager.shouldRetry(context, error);

            expect(decision.shouldRetry).toBe(true);
            expect(decision.delayMs).toBeGreaterThan(0);
            expect(decision.reason).toContain('timeout');
        });

        it('should not retry for non-retryable error', async () => {
            const policy = await retryManager.getRetryPolicy('shell');
            const context: RetryContext = {
                taskId: 1,
                taskType: 'shell',
                currentAttempt: 1,
                maxRetries: 3,
                policy
            };

            const error = new Error('Syntax error in command');
            const decision = await retryManager.shouldRetry(context, error);

            expect(decision.shouldRetry).toBe(false);
            expect(decision.reason).toContain('syntax');
        });

        it('should not retry when max retries exceeded', async () => {
            const policy = await retryManager.getRetryPolicy('shell');
            const context: RetryContext = {
                taskId: 1,
                taskType: 'shell',
                currentAttempt: 3,
                maxRetries: 3,
                policy
            };

            const error = new Error('Connection timeout occurred');
            const decision = await retryManager.shouldRetry(context, error);

            expect(decision.shouldRetry).toBe(false);
            expect(decision.reason).toContain('Maximum retries');
        });

        it('should calculate exponential backoff delay', async () => {
            const policy = await retryManager.getRetryPolicy('shell');
            const context1: RetryContext = {
                taskId: 1,
                taskType: 'shell',
                currentAttempt: 1,
                maxRetries: 3,
                policy
            };
            const context2: RetryContext = {
                taskId: 1,
                taskType: 'shell',
                currentAttempt: 2,
                maxRetries: 3,
                policy
            };

            const error = new Error('timeout');
            const decision1 = await retryManager.shouldRetry(context1, error);
            const decision2 = await retryManager.shouldRetry(context2, error);

            expect(decision2.delayMs).toBeGreaterThan(decision1.delayMs);
        });

        it('should record retry attempts', async () => {
            const attemptId = await retryManager.recordRetryAttempt({
                taskId: 1,
                attemptNumber: 1,
                attemptedAt: new Date().toISOString(),
                errorMessage: 'Test error',
                errorType: 'timeout',
                delayMs: 1000,
                success: false,
                executionTimeMs: 500
            });

            expect(attemptId).toBeGreaterThan(0);

            // Verify the attempt was recorded
            const attempt = db.query('SELECT * FROM retry_history WHERE id = ?').get(attemptId);
            expect(attempt).toBeDefined();
            expect((attempt as any).task_id).toBe(1);
            expect((attempt as any).error_message).toBe('Test error');
        });

        it('should update task retry info', async () => {
            // Insert a test task
            db.run('INSERT INTO tasks (id, type, status) VALUES (1, "shell", "pending")');

            const nextRetryAt = new Date(Date.now() + 5000);
            await retryManager.updateTaskRetryInfo(1, 2, nextRetryAt, 'Test error');

            const task = db.query('SELECT * FROM tasks WHERE id = 1').get() as any;
            expect(task.retry_count).toBe(2);
            expect(task.last_retry_error).toBe('Test error');
            expect(task.next_retry_at).toBeDefined();
        });

        it('should get tasks ready for retry', async () => {
            // Insert test tasks
            const pastTime = new Date(Date.now() - 1000).toISOString();
            const futureTime = new Date(Date.now() + 5000).toISOString();

            db.run('INSERT INTO tasks (id, type, status, retry_count, max_retries, next_retry_at) VALUES (1, "shell", "error", 1, 3, ?)', [pastTime]);
            db.run('INSERT INTO tasks (id, type, status, retry_count, max_retries, next_retry_at) VALUES (2, "shell", "error", 1, 3, ?)', [futureTime]);
            db.run('INSERT INTO tasks (id, type, status, retry_count, max_retries) VALUES (3, "shell", "error", 3, 3)'); // Max retries exceeded

            const readyTasks = await retryManager.getTasksReadyForRetry();
            
            expect(readyTasks).toContain(1); // Past time, should be ready
            expect(readyTasks).not.toContain(2); // Future time, not ready yet
            expect(readyTasks).not.toContain(3); // Max retries exceeded
        });

        it('should get retry statistics', async () => {
            // Insert test task and retry attempts
            db.run('INSERT INTO tasks (id, type, status) VALUES (1, "shell", "error")');
            
            await retryManager.recordRetryAttempt({
                taskId: 1,
                attemptNumber: 1,
                attemptedAt: new Date().toISOString(),
                errorMessage: 'First attempt failed',
                errorType: 'timeout',
                delayMs: 1000,
                success: false,
                executionTimeMs: 500
            });

            await retryManager.recordRetryAttempt({
                taskId: 1,
                attemptNumber: 2,
                attemptedAt: new Date().toISOString(),
                delayMs: 2000,
                success: true,
                executionTimeMs: 300
            });

            const stats = await retryManager.getRetryStats(1);
            
            expect(stats).toBeDefined();
            expect(stats!.totalAttempts).toBe(2);
            expect(stats!.successfulAttempts).toBe(1);
            expect(stats!.failedAttempts).toBe(1);
            expect(stats!.finalSuccess).toBe(true);
        });
    });

    describe('Error Classification', () => {
        it('should classify timeout errors as retryable', async () => {
            const policy = await retryManager.getRetryPolicy('shell');
            const context: RetryContext = {
                taskId: 1,
                taskType: 'shell',
                currentAttempt: 1,
                maxRetries: 3,
                policy
            };

            const timeoutErrors = [
                new Error('Connection timeout'),
                new Error('Request timed out'),
                new Error('Operation timeout occurred')
            ];

            for (const error of timeoutErrors) {
                const decision = await retryManager.shouldRetry(context, error);
                expect(decision.shouldRetry).toBe(true);
            }
        });

        it('should classify syntax errors as non-retryable', async () => {
            const policy = await retryManager.getRetryPolicy('shell');
            const context: RetryContext = {
                taskId: 1,
                taskType: 'shell',
                currentAttempt: 1,
                maxRetries: 3,
                policy
            };

            const syntaxErrors = [
                new Error('Syntax error in command'),
                new Error('Parse error occurred'),
                new Error('Invalid syntax detected')
            ];

            for (const error of syntaxErrors) {
                const decision = await retryManager.shouldRetry(context, error);
                expect(decision.shouldRetry).toBe(false);
            }
        });
    });

    describe('Migration', () => {
        it('should verify migration was successful', async () => {
            const verified = await migration.verify();
            expect(verified).toBe(true);
        });

        it('should have created retry policies for all task types', async () => {
            const policies = db.query('SELECT task_type FROM retry_policies').all() as Array<{ task_type: string }>;
            const taskTypes = policies.map(p => p.task_type);
            
            expect(taskTypes).toContain('shell');
            expect(taskTypes).toContain('llm');
            expect(taskTypes).toContain('tool');
            expect(taskTypes).toContain('youtube');
            expect(taskTypes).toContain('batch');
        });
    });
});
