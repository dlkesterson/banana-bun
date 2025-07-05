// Service Interface Definitions
// Formal TypeScript interfaces for all services to ensure consistency

export interface TaskTrend {
    date: string;
    total_tasks: number;
    successful_tasks: number;
    failed_tasks: number;
    avg_duration_ms: number;
}

export interface TimeRange {
    start: Date;
    end: Date;
}

export interface PerformanceMetrics {
    total_tasks: number;
    success_rate: number;
    average_duration_ms: number;
    bottlenecks: Array<{
        task_type: string;
        avg_duration_ms: number;
        max_duration_ms: number;
        slow_task_count: number;
    }>;
    trends: TaskTrend[];
}

export interface SearchOptions {
    filter?: string;
    limit?: number;
    offset?: number;
    sort?: string[];
}

export interface SearchResult {
    hits: any[];
    totalHits: number;
    processingTimeMs: number;
    query: string;
}

export interface Schedule {
    id: number;
    task_id: number;
    cron_expression: string;
    next_execution: string;
    enabled: boolean;
    max_instances?: number;
    overlap_policy?: 'skip' | 'queue' | 'replace';
}

export interface ScheduleConfig {
    timezone?: string;
    enabled?: boolean;
    maxInstances?: number;
    overlapPolicy?: 'skip' | 'queue' | 'replace';
}

export interface DecomposeGoalResult {
    success: boolean;
    tasks?: Array<{
        type: string;
        description: string;
        dependencies?: string[];
        priority?: number;
    }>;
    error?: string;
    plan_id?: string;
    estimated_duration?: number;
    warnings?: string[];
}

export interface ReviewResult {
    success: boolean;
    score: number;
    passed_criteria: string[];
    failed_criteria: string[];
    error?: string;
    recommendations?: string[];
    quality_metrics?: {
        code_quality?: number;
        output_quality?: number;
        performance_score?: number;
    };
}

// Service Interface Definitions
export interface IAnalyticsLogger {
    getTaskTrends(days: number): Promise<TaskTrend[]>;
    logTaskMetric(taskId: string, metric: string, value: number): Promise<void>;
    getPerformanceMetrics(timeRange: TimeRange): Promise<PerformanceMetrics>;
    logTaskStart(task: any): Promise<void>;
    logTaskCompletion(task: any, status: string, error?: string): Promise<void>;
    getTaskAnalytics(timeRangeHours?: number): Promise<any>;
}

export interface IMeilisearchService {
    indexDocument(index: string, document: any): Promise<void>;
    indexDocuments(index: string, documents: any[]): Promise<void>;
    search(index: string, query: string, options?: SearchOptions): Promise<SearchResult>;
    deleteDocument(index: string, id: string): Promise<void>;
    indexMedia(mediaId: number, metadata: any): Promise<string>;
}

export interface ITaskScheduler {
    getDueSchedules(): Promise<Schedule[]>;
    canExecuteSchedule(scheduleId: string): boolean;
    scheduleTask(task: any, schedule: ScheduleConfig): Promise<string>;
    cancelSchedule(scheduleId: string): Promise<void>;
    createSchedule(templateTask: any, cronExpression: string, options?: ScheduleConfig): Promise<number>;
    enableSchedule(scheduleId: number): Promise<void>;
    disableSchedule(scheduleId: number): Promise<void>;
}

export interface IPlannerService {
    decomposeGoal(goal: string, context?: any): Promise<DecomposeGoalResult>;
    getPlannerResultForTask(taskId: number): any;
    getPlannerMetrics(): any;
}

export interface IReviewService {
    reviewTask(taskId: number, criteria: string[]): Promise<ReviewResult>;
    getTaskReviewSummary(taskId: number): any;
    getReviewMetrics(): any;
}
