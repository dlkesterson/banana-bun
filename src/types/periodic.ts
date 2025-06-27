/**
 * Type definitions for periodic task scheduling
 */

import type { BaseTask } from './task';

export type OverlapPolicy = 'skip' | 'queue' | 'replace';
export type InstanceStatus = 'scheduled' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskSchedule {
    id?: number;
    templateTaskId: number;
    cronExpression: string;
    timezone: string;
    enabled: boolean;
    nextRunAt: string;
    lastRunAt?: string;
    runCount: number;
    maxInstances: number;
    overlapPolicy: OverlapPolicy;
    createdAt?: string;
    updatedAt?: string;
}

export interface TaskInstance {
    id?: number;
    scheduleId: number;
    templateTaskId: number;
    instanceTaskId?: number;
    scheduledFor: string;
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
    status: InstanceStatus;
    executionTimeMs?: number;
    errorMessage?: string;
}

export interface PeriodicTask {
    id: string | number;
    type: string;
    description: string;
    status: string;
    isTemplate: boolean;
    templateId?: number;
    cronExpression?: string;
    timezone?: string;
    scheduleEnabled?: boolean;
    nextExecution?: string;
    lastExecution?: string;
    executionCount?: number;
}

// Database row interfaces
export interface DatabaseTaskSchedule {
    id: number;
    template_task_id: number;
    cron_expression: string;
    timezone: string;
    enabled: boolean;
    next_run_at: string;
    last_run_at: string | null;
    run_count: number;
    max_instances: number;
    overlap_policy: OverlapPolicy;
    created_at: string;
    updated_at: string;
}

export interface DatabaseTaskInstance {
    id: number;
    schedule_id: number;
    template_task_id: number;
    instance_task_id: number | null;
    scheduled_for: string;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    status: InstanceStatus;
    execution_time_ms: number | null;
    error_message: string | null;
}

// Cron parsing and validation
export interface CronComponents {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
}

export interface CronValidationResult {
    valid: boolean;
    errors: string[];
    nextRuns?: Date[];
}

export interface ScheduleContext {
    scheduleId: number;
    templateTask: BaseTask;
    cronExpression: string;
    timezone: string;
    lastRun?: Date;
    runCount: number;
    maxInstances: number;
    overlapPolicy: OverlapPolicy;
}

export interface SchedulingResult {
    success: boolean;
    instanceId?: number;
    taskId?: number;
    scheduledFor: Date;
    nextRun?: Date;
    error?: string;
    skipped?: boolean;
    reason?: string;
}

// Schedule management
export interface ScheduleStats {
    scheduleId: number;
    templateTaskId: number;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    skippedRuns: number;
    averageExecutionTime: number;
    lastRunAt?: string;
    nextRunAt: string;
    enabled: boolean;
}

export interface SchedulerMetrics {
    totalSchedules: number;
    activeSchedules: number;
    scheduledInstances: number;
    runningInstances: number;
    completedToday: number;
    failedToday: number;
    averageDelay: number; // Difference between scheduled and actual execution time
    upcomingRuns: Array<{
        scheduleId: number;
        templateTaskId: number;
        scheduledFor: string;
        cronExpression: string;
    }>;
}

// Configuration
export interface SchedulerConfig {
    checkInterval: number; // How often to check for due tasks (ms)
    maxConcurrentInstances: number; // Global limit on concurrent scheduled tasks
    defaultTimezone: string;
    enabledByDefault: boolean;
    maxLookAhead: number; // How far ahead to schedule instances (hours)
    cleanupOlderThan: number; // Clean up completed instances older than (days)
}

// Common cron expressions
export const COMMON_CRON_EXPRESSIONS = {
    EVERY_MINUTE: '* * * * *',
    EVERY_5_MINUTES: '*/5 * * * *',
    EVERY_15_MINUTES: '*/15 * * * *',
    EVERY_30_MINUTES: '*/30 * * * *',
    HOURLY: '0 * * * *',
    DAILY_MIDNIGHT: '0 0 * * *',
    DAILY_NOON: '0 12 * * *',
    WEEKLY_SUNDAY: '0 0 * * 0',
    WEEKLY_MONDAY: '0 0 * * 1',
    MONTHLY_FIRST: '0 0 1 * *',
    YEARLY: '0 0 1 1 *'
} as const;

// Timezone constants
export const COMMON_TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney'
] as const;

// Default configuration
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
    checkInterval: 60000, // 1 minute
    maxConcurrentInstances: 10,
    defaultTimezone: 'UTC',
    enabledByDefault: true,
    maxLookAhead: 24, // 24 hours
    cleanupOlderThan: 30 // 30 days
};

// Error types
export const SCHEDULE_ERROR_TYPES = {
    INVALID_CRON: 'invalid_cron',
    INVALID_TIMEZONE: 'invalid_timezone',
    TEMPLATE_NOT_FOUND: 'template_not_found',
    OVERLAP_CONFLICT: 'overlap_conflict',
    MAX_INSTANCES_EXCEEDED: 'max_instances_exceeded',
    EXECUTION_FAILED: 'execution_failed',
    SCHEDULE_DISABLED: 'schedule_disabled'
} as const;

export type ScheduleErrorType = typeof SCHEDULE_ERROR_TYPES[keyof typeof SCHEDULE_ERROR_TYPES];
