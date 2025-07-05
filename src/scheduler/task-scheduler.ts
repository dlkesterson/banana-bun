/**
 * Task Scheduler - Manages periodic task execution
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';
import { CronParser } from './cron-parser';
import type {
    SchedulingResult,
    SchedulerMetrics,
    SchedulerConfig,
    DatabaseTaskSchedule
} from '../types/periodic';
import { DEFAULT_SCHEDULER_CONFIG } from '../types/periodic';
import type { BaseTask } from '../types/task';
import type { ITaskScheduler, Schedule, ScheduleConfig } from '../types/service-interfaces';

export class TaskScheduler implements ITaskScheduler {
    private db: Database;
    private config: SchedulerConfig;
    private isRunning: boolean = false;
    private schedulerInterval: NodeJS.Timeout | null = null;

    constructor(db: Database, config: Partial<SchedulerConfig> = {}) {
        this.db = db;
        this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    }

    /**
     * Start the scheduler
     */
    start(): void {
        if (this.isRunning) {
            logger.error('Scheduler is already running');
            return;
        }

        this.isRunning = true;
        this.schedulerInterval = setInterval(() => {
            this.processScheduledTasks().catch(error => {
                logger.error('Error processing scheduled tasks', { error });
            });
        }, this.config.checkInterval);

        logger.info('Task scheduler started', {
            checkInterval: this.config.checkInterval,
            maxConcurrentInstances: this.config.maxConcurrentInstances
        });
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }

        logger.info('Task scheduler stopped');
    }

    /**
     * Create a new schedule for a template task
     */
    async createSchedule(templateTask: BaseTask, cronExpression: string, options: {
        timezone?: string;
        enabled?: boolean;
        maxInstances?: number;
        overlapPolicy?: 'skip' | 'queue' | 'replace';
    } = {}): Promise<number> {
        // Validate cron expression
        const cronValidation = CronParser.parse(cronExpression);
        if (!cronValidation.valid) {
            throw new Error(`Invalid cron expression: ${cronValidation.errors.join(', ')}`);
        }

        // Calculate next run time
        const nextRun = CronParser.getNextExecution(
            cronExpression,
            new Date(),
            options.timezone || this.config.defaultTimezone
        );

        if (!nextRun) {
            throw new Error('Could not calculate next execution time for cron expression');
        }

        // Insert schedule
        const insertStmt = this.db.prepare(`
            INSERT INTO task_schedules 
            (template_task_id, cron_expression, timezone, enabled, next_run_at, 
             max_instances, overlap_policy)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insertStmt.run(
            templateTask.id,
            cronExpression,
            options.timezone || this.config.defaultTimezone,
            options.enabled ?? this.config.enabledByDefault,
            nextRun.toISOString(),
            options.maxInstances || 1,
            options.overlapPolicy || 'skip'
        );

        const scheduleId = result.lastInsertRowid as number;

        // Mark the template task
        this.db.run(`
            UPDATE tasks 
            SET is_template = TRUE, 
                cron_expression = ?, 
                timezone = ?, 
                schedule_enabled = ?,
                next_execution = ?
            WHERE id = ?
        `, [
            cronExpression,
            options.timezone || this.config.defaultTimezone,
            options.enabled ?? this.config.enabledByDefault,
            nextRun.toISOString(),
            templateTask.id
        ]);

        logger.info('Created task schedule', {
            scheduleId,
            templateTaskId: templateTask.id,
            cronExpression,
            nextRun: nextRun.toISOString(),
            enabled: options.enabled ?? this.config.enabledByDefault
        });

        return scheduleId;
    }

    /**
     * Process scheduled tasks that are due for execution
     */
    private async processScheduledTasks(): Promise<void> {
        const now = new Date();
        const currentTime = now.toISOString();

        // Get schedules that are due for execution
        const dueSchedules = this.db.query(`
            SELECT * FROM task_schedules 
            WHERE enabled = TRUE 
            AND next_run_at <= ?
            ORDER BY next_run_at ASC
        `).all(currentTime) as DatabaseTaskSchedule[];

        if (dueSchedules.length === 0) {
            return;
        }

        logger.info('Processing scheduled tasks', {
            count: dueSchedules.length,
            currentTime
        });

        for (const schedule of dueSchedules) {
            try {
                await this.executeSchedule(schedule, now);
            } catch (error) {
                logger.error('Failed to execute schedule', {
                    scheduleId: schedule.id,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    /**
     * Execute a specific schedule
     */
    private async executeSchedule(schedule: DatabaseTaskSchedule, executionTime: Date): Promise<void> {
        const scheduleId = schedule.id;
        const templateTaskId = schedule.template_task_id;

        // Get the template task
        const templateTask = this.db.query('SELECT * FROM tasks WHERE id = ?').get(templateTaskId) as any;
        if (!templateTask) {
            logger.error('Template task not found', { templateTaskId, scheduleId });
            return;
        }

        // Check for running instances if overlap policy requires it
        if (schedule.overlap_policy !== 'replace') {
            const runningInstances = this.db.query(`
                SELECT COUNT(*) as count FROM task_instances 
                WHERE schedule_id = ? AND status IN ('scheduled', 'running')
            `).get(scheduleId) as { count: number };

            if (runningInstances.count >= schedule.max_instances) {
                if (schedule.overlap_policy === 'skip') {
                    logger.info('Skipping scheduled execution due to overlap policy', {
                        scheduleId,
                        runningInstances: runningInstances.count,
                        maxInstances: schedule.max_instances
                    });

                    // Still update next run time
                    await this.updateNextRunTime(schedule);
                    return;
                }
                // For 'queue' policy, we'll create the instance but it won't run until others complete
            }
        }

        // Create task instance
        const instanceResult = await this.createTaskInstance(schedule, executionTime);
        if (!instanceResult.success) {
            logger.error('Failed to create task instance', {
                scheduleId,
                error: instanceResult.error
            });
            return;
        }

        // Create actual task from template
        const newTaskId = await this.createTaskFromTemplate(templateTask, instanceResult.instanceId!);

        // Update instance with task ID
        if (instanceResult.instanceId !== undefined) {
            this.db.run(`
                UPDATE task_instances 
                SET instance_task_id = ?, status = 'scheduled'
                WHERE id = ?
            `, [newTaskId, instanceResult.instanceId]);
        } else {
            logger.error('Failed to update task instance: instanceId is undefined', {
                scheduleId: schedule.id,
                templateTaskId: schedule.template_task_id
            });
        }

        // Update schedule statistics
        await this.updateScheduleStats(schedule);

        logger.info('Scheduled task instance created', {
            scheduleId,
            instanceId: instanceResult.instanceId,
            taskId: newTaskId,
            scheduledFor: executionTime.toISOString()
        });
    }

    /**
     * Create a task instance record
     */
    private async createTaskInstance(schedule: DatabaseTaskSchedule, scheduledFor: Date): Promise<SchedulingResult> {
        try {
            const insertStmt = this.db.prepare(`
                INSERT INTO task_instances 
                (schedule_id, template_task_id, scheduled_for, status)
                VALUES (?, ?, ?, 'scheduled')
            `);

            const result = insertStmt.run(
                schedule.id,
                schedule.template_task_id,
                scheduledFor.toISOString()
            );

            return {
                success: true,
                instanceId: result.lastInsertRowid as number,
                scheduledFor
            };
        } catch (error) {
            return {
                success: false,
                scheduledFor,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Create a new task from a template
     */
    private async createTaskFromTemplate(templateTask: any, instanceId: number): Promise<number> {
        const insertStmt = this.db.prepare(`
            INSERT INTO tasks 
            (type, description, shell_command, dependencies, args, generator, tool,
             status, template_id, is_template, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, FALSE, ?)
        `);

        // Create metadata that includes instance information
        const metadata = {
            ...(templateTask.metadata ? JSON.parse(templateTask.metadata) : {}),
            scheduled_instance_id: instanceId,
            scheduled_at: new Date().toISOString(),
            template_task_id: templateTask.id
        };

        const result = insertStmt.run(
            templateTask.type || '',
            templateTask.description || '',
            templateTask.shell_command || null,
            templateTask.dependencies || null,
            templateTask.args || null,
            templateTask.generator || null,
            templateTask.tool || null,
            templateTask.id,
            JSON.stringify(metadata)
        );

        return result.lastInsertRowid as number;
    }

    /**
     * Update schedule statistics and next run time
     */
    private async updateScheduleStats(schedule: DatabaseTaskSchedule): Promise<void> {
        // Calculate next run time
        const nextRun = CronParser.getNextExecution(
            schedule.cron_expression,
            new Date(),
            schedule.timezone
        );

        if (!nextRun) {
            logger.error('Could not calculate next run time', {
                scheduleId: schedule.id,
                cronExpression: schedule.cron_expression
            });
            return;
        }

        // Update schedule
        this.db.run(`
            UPDATE task_schedules 
            SET next_run_at = ?, 
                last_run_at = CURRENT_TIMESTAMP,
                run_count = run_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [nextRun.toISOString(), schedule.id]);

        // Update template task
        this.db.run(`
            UPDATE tasks 
            SET next_execution = ?,
                last_execution = CURRENT_TIMESTAMP,
                execution_count = execution_count + 1
            WHERE id = ?
        `, [nextRun.toISOString(), schedule.template_task_id]);
    }

    /**
     * Update next run time for a schedule
     */
    private async updateNextRunTime(schedule: DatabaseTaskSchedule): Promise<void> {
        const nextRun = CronParser.getNextExecution(
            schedule.cron_expression,
            new Date(),
            schedule.timezone
        );

        if (nextRun) {
            this.db.run(`
                UPDATE task_schedules 
                SET next_run_at = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [nextRun.toISOString(), schedule.id]);
        }
    }

    /**
     * Get scheduler metrics
     */
    async getMetrics(): Promise<SchedulerMetrics> {
        const totalSchedules = this.db.query('SELECT COUNT(*) as count FROM task_schedules').get() as { count: number };
        const activeSchedules = this.db.query('SELECT COUNT(*) as count FROM task_schedules WHERE enabled = TRUE').get() as { count: number };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString();

        const scheduledInstances = this.db.query('SELECT COUNT(*) as count FROM task_instances WHERE status = "scheduled"').get() as { count: number };
        const runningInstances = this.db.query('SELECT COUNT(*) as count FROM task_instances WHERE status = "running"').get() as { count: number };
        const completedToday = this.db.query('SELECT COUNT(*) as count FROM task_instances WHERE status = "completed" AND completed_at >= ?').get(todayStr) as { count: number };
        const failedToday = this.db.query('SELECT COUNT(*) as count FROM task_instances WHERE status = "failed" AND completed_at >= ?').get(todayStr) as { count: number };

        const upcomingRuns = this.db.query(`
            SELECT id as schedule_id, template_task_id, next_run_at as scheduledFor, cron_expression
            FROM task_schedules
            WHERE enabled = TRUE
            ORDER BY next_run_at ASC
            LIMIT 10
        `).all() as Array<{ schedule_id: number; template_task_id: number; scheduledFor: string; cron_expression: string }>;

        return {
            totalSchedules: totalSchedules.count,
            activeSchedules: activeSchedules.count,
            scheduledInstances: scheduledInstances.count,
            runningInstances: runningInstances.count,
            completedToday: completedToday.count,
            failedToday: failedToday.count,
            averageDelay: 0, // TODO: Calculate from execution data
            upcomingRuns: upcomingRuns.map(run => ({
                scheduleId: run.schedule_id,
                templateTaskId: run.template_task_id,
                scheduledFor: run.scheduledFor,
                cronExpression: run.cron_expression
            }))
        };
    }

    /**
     * Enable or disable a schedule
     */
    async toggleSchedule(scheduleId: number, enabled: boolean): Promise<void> {
        this.db.run(`
            UPDATE task_schedules 
            SET enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [enabled, scheduleId]);

        // Also update the template task
        const schedule = this.db.query('SELECT template_task_id FROM task_schedules WHERE id = ?').get(scheduleId) as { template_task_id: number } | null;
        if (schedule) {
            this.db.run(`
                UPDATE tasks 
                SET schedule_enabled = ?
                WHERE id = ?
            `, [enabled, schedule.template_task_id]);
        }

        logger.info('Schedule toggled', { scheduleId, enabled });
    }

    /**
     * Delete a schedule and its instances
     */
    async deleteSchedule(scheduleId: number): Promise<void> {
        // Get template task ID first
        const schedule = this.db.query('SELECT template_task_id FROM task_schedules WHERE id = ?').get(scheduleId) as { template_task_id: number } | null;

        // Delete schedule (cascade will handle instances)
        this.db.run('DELETE FROM task_schedules WHERE id = ?', [scheduleId]);

        // Update template task
        if (schedule) {
            this.db.run(`
                UPDATE tasks 
                SET is_template = FALSE, 
                    cron_expression = NULL, 
                    schedule_enabled = FALSE,
                    next_execution = NULL
                WHERE id = ?
            `, [schedule.template_task_id]);
        }

        logger.info('Schedule deleted', { scheduleId });
    }

    /**
     * Get all schedules that are due for execution
     */
    async getDueSchedules(): Promise<Schedule[]> {
        const now = new Date().toISOString();

        const schedules = this.db.prepare(`
            SELECT
                id,
                template_task_id,
                cron_expression,
                next_run_at,
                enabled,
                max_instances,
                overlap_policy
            FROM task_schedules
            WHERE enabled = 1
            AND next_run_at <= ?
            ORDER BY next_run_at ASC
        `).all(now) as DatabaseTaskSchedule[];

        return schedules.map(schedule => ({
            id: schedule.id,
            task_id: schedule.template_task_id,
            cron_expression: schedule.cron_expression,
            next_execution: schedule.next_run_at,
            enabled: schedule.enabled,
            max_instances: schedule.max_instances,
            overlap_policy: schedule.overlap_policy as 'skip' | 'queue' | 'replace'
        }));
    }

    /**
     * Check if a schedule can be executed (considering overlap policies)
     */
    canExecuteSchedule(scheduleId: string): boolean {
        const numericScheduleId = parseInt(scheduleId);

        const schedule = this.db.prepare(`
            SELECT * FROM task_schedules WHERE id = ?
        `).get(numericScheduleId) as DatabaseTaskSchedule | undefined;

        if (!schedule || !schedule.enabled) {
            return false;
        }

        // Check for running instances if max_instances is set
        if (schedule.max_instances && schedule.max_instances > 0) {
            const runningCount = this.db.prepare(`
                SELECT COUNT(*) as count
                FROM tasks
                WHERE parent_id = ?
                AND status IN ('pending', 'running')
            `).get(schedule.template_task_id) as { count: number };

            if (runningCount.count >= schedule.max_instances) {
                return schedule.overlap_policy !== 'skip';
            }
        }

        return true;
    }

    /**
     * Schedule a task with the given schedule configuration
     */
    async scheduleTask(task: any, schedule: ScheduleConfig): Promise<string> {
        // This method creates a one-time schedule for immediate or future execution
        const scheduleId = await this.createSchedule(task, '0 0 * * *', schedule);
        return scheduleId.toString();
    }

    /**
     * Cancel a schedule by ID
     */
    async cancelSchedule(scheduleId: string): Promise<void> {
        const numericScheduleId = parseInt(scheduleId);
        await this.deleteSchedule(numericScheduleId);
    }

    /**
     * Enable a schedule
     */
    async enableSchedule(scheduleId: number): Promise<void> {
        await this.toggleSchedule(scheduleId, true);
    }

    /**
     * Disable a schedule
     */
    async disableSchedule(scheduleId: number): Promise<void> {
        await this.toggleSchedule(scheduleId, false);
    }
}
