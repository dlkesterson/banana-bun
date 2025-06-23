/**
 * Type definitions for the Rule Scheduler System
 */

import type { BaseTask } from './task';

// Pattern Detection Types
export interface ActivityPattern {
    id?: number;
    pattern_type: PatternType;
    pattern_data: string; // JSON string
    confidence_score: number;
    detection_count: number;
    first_detected_at?: string;
    last_detected_at?: string;
    is_active: boolean;
    embedding_id?: string; // ChromaDB reference
    search_index_id?: string; // MeiliSearch reference
}

export type PatternType = 
    | 'daily_recurring'
    | 'weekly_recurring' 
    | 'monthly_recurring'
    | 'user_behavior'
    | 'resource_usage'
    | 'task_correlation'
    | 'seasonal'
    | 'custom';

export interface PatternData {
    frequency: number;
    time_windows: TimeWindow[];
    task_types: string[];
    user_actions?: string[];
    resource_metrics?: ResourceMetrics;
    correlation_strength?: number;
    seasonal_factors?: SeasonalFactor[];
}

export interface TimeWindow {
    start_hour: number;
    end_hour: number;
    days_of_week?: number[]; // 0-6, Sunday=0
    days_of_month?: number[]; // 1-31
    months?: number[]; // 1-12
}

export interface ResourceMetrics {
    cpu_usage_avg: number;
    memory_usage_avg: number;
    disk_io_avg: number;
    network_io_avg: number;
    concurrent_tasks_avg: number;
}

export interface SeasonalFactor {
    factor_type: 'holiday' | 'weekend' | 'month_end' | 'quarter_end' | 'custom';
    impact_multiplier: number;
    description: string;
}

// Rule Management Types
export interface SchedulingRule {
    id?: number;
    pattern_id?: number;
    rule_name: string;
    description?: string;
    cron_expression: string;
    priority: number;
    is_enabled: boolean;
    is_auto_generated: boolean;
    confidence_score: number;
    created_at?: string;
    updated_at?: string;
    last_triggered_at?: string;
    trigger_count: number;
    success_rate: number;
    llm_model_used?: string;
    embedding_id?: string; // ChromaDB reference
    search_index_id?: string; // MeiliSearch reference
}

export interface RuleAction {
    id?: number;
    rule_id: number;
    action_type: ActionType;
    action_data: string; // JSON string
    order_index: number;
    is_enabled: boolean;
    created_at?: string;
}

export type ActionType = 
    | 'create_task'
    | 'modify_schedule'
    | 'allocate_resources'
    | 'send_notification'
    | 'run_optimization'
    | 'trigger_backup'
    | 'custom_script';

export interface ActionData {
    task_template?: Partial<BaseTask>;
    schedule_modifications?: ScheduleModification[];
    resource_allocation?: ResourceAllocation;
    notification_config?: NotificationConfig;
    script_path?: string;
    script_args?: string[];
}

export interface ScheduleModification {
    target_schedule_id: number;
    modification_type: 'delay' | 'advance' | 'reschedule' | 'disable' | 'enable';
    delay_minutes?: number;
    new_cron_expression?: string;
    reason: string;
}

export interface ResourceAllocation {
    cpu_limit?: number;
    memory_limit?: number;
    priority_boost?: number;
    max_concurrent_tasks?: number;
}

export interface NotificationConfig {
    channels: ('email' | 'webhook' | 'console' | 'dashboard')[];
    message: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
}

// User Behavior Analysis Types
export interface UserBehaviorProfile {
    user_id?: string; // For multi-user systems
    activity_patterns: UserActivityPattern[];
    peak_hours: number[];
    preferred_task_types: string[];
    interaction_frequency: number;
    last_updated: string;
}

export interface UserActivityPattern {
    action_type: string;
    frequency: number;
    time_distribution: { [hour: number]: number };
    day_distribution: { [day: number]: number };
    correlation_with_tasks: TaskCorrelation[];
}

export interface TaskCorrelation {
    task_type: string;
    correlation_strength: number;
    typical_delay_minutes: number;
    success_rate: number;
}

// Predictive Scheduling Types
export interface PredictiveSchedule {
    id?: number;
    rule_id: number;
    predicted_task_type: string;
    predicted_execution_time: string;
    confidence_score: number;
    resource_requirements: ResourceRequirements;
    is_scheduled: boolean;
    actual_execution_time?: string;
    prediction_accuracy?: number;
    created_at?: string;
}

export interface ResourceRequirements {
    estimated_duration_minutes: number;
    cpu_requirement: number;
    memory_requirement: number;
    disk_space_requirement: number;
    network_bandwidth_requirement: number;
    dependencies: string[];
}

// Optimization Types
export interface OptimizationResult {
    optimization_type: OptimizationType;
    original_schedule: ScheduleSnapshot;
    optimized_schedule: ScheduleSnapshot;
    improvement_metrics: ImprovementMetrics;
    applied_at?: string;
    success: boolean;
    error_message?: string;
}

export type OptimizationType = 
    | 'load_balancing'
    | 'resource_optimization'
    | 'conflict_resolution'
    | 'peak_mitigation'
    | 'efficiency_improvement';

export interface ScheduleSnapshot {
    timestamp: string;
    active_schedules: SchedulingRule[];
    resource_utilization: ResourceMetrics;
    predicted_load: LoadPrediction[];
}

export interface LoadPrediction {
    time_slot: string;
    predicted_tasks: number;
    predicted_resource_usage: ResourceMetrics;
    confidence: number;
}

export interface ImprovementMetrics {
    resource_utilization_improvement: number;
    peak_load_reduction: number;
    conflict_reduction: number;
    efficiency_gain: number;
    estimated_time_savings_minutes: number;
}

// Configuration Types
export interface RuleSchedulerConfig {
    pattern_detection: PatternDetectionConfig;
    rule_generation: RuleGenerationConfig;
    predictive_scheduling: PredictiveSchedulingConfig;
    optimization: OptimizationConfig;
    llm_integration: LLMIntegrationConfig;
}

export interface PatternDetectionConfig {
    min_confidence_threshold: number;
    min_detection_count: number;
    analysis_window_days: number;
    pattern_similarity_threshold: number;
    enable_user_behavior_analysis: boolean;
    enable_resource_pattern_analysis: boolean;
}

export interface RuleGenerationConfig {
    auto_generation_enabled: boolean;
    min_pattern_confidence: number;
    max_rules_per_pattern: number;
    conflict_resolution_strategy: 'priority' | 'merge' | 'disable_lower';
    validation_required: boolean;
}

export interface PredictiveSchedulingConfig {
    enabled: boolean;
    prediction_confidence_threshold: number;
    max_predictions_per_hour: number;
    resource_reservation_enabled: boolean;
    prediction_validation_window_hours: number;
}

export interface OptimizationConfig {
    auto_optimization_enabled: boolean;
    optimization_frequency_hours: number;
    load_balancing_threshold: number;
    peak_mitigation_threshold: number;
    resource_efficiency_target: number;
}

export interface LLMIntegrationConfig {
    ollama: {
        enabled: boolean;
        model: string;
        use_for: ('pattern_analysis' | 'rule_generation' | 'optimization')[];
    };
    openai: {
        enabled: boolean;
        model: string;
        use_for: ('complex_patterns' | 'advanced_optimization' | 'natural_language')[];
    };
    fallback_strategy: 'ollama_first' | 'openai_first' | 'parallel';
}

// API Response Types
export interface PatternAnalysisResponse {
    patterns_found: ActivityPattern[];
    analysis_summary: {
        total_patterns: number;
        high_confidence_patterns: number;
        actionable_patterns: number;
        analysis_period: string;
    };
    recommendations: PatternRecommendation[];
}

export interface PatternRecommendation {
    pattern_id: number;
    recommendation_type: 'create_rule' | 'modify_existing' | 'investigate_further';
    description: string;
    confidence: number;
    potential_impact: string;
}

export interface RuleGenerationResponse {
    generated_rules: SchedulingRule[];
    generation_summary: {
        total_generated: number;
        auto_enabled: number;
        requires_review: number;
        conflicts_detected: number;
    };
    conflicts: RuleConflict[];
}

export interface RuleConflict {
    rule_id_1: number;
    rule_id_2: number;
    conflict_type: 'time_overlap' | 'resource_contention' | 'dependency_cycle';
    severity: 'low' | 'medium' | 'high';
    resolution_suggestion: string;
}

// Default configurations
export const DEFAULT_RULE_SCHEDULER_CONFIG: RuleSchedulerConfig = {
    pattern_detection: {
        min_confidence_threshold: 0.7,
        min_detection_count: 3,
        analysis_window_days: 30,
        pattern_similarity_threshold: 0.8,
        enable_user_behavior_analysis: true,
        enable_resource_pattern_analysis: true
    },
    rule_generation: {
        auto_generation_enabled: true,
        min_pattern_confidence: 0.8,
        max_rules_per_pattern: 3,
        conflict_resolution_strategy: 'priority',
        validation_required: true
    },
    predictive_scheduling: {
        enabled: true,
        prediction_confidence_threshold: 0.7,
        max_predictions_per_hour: 10,
        resource_reservation_enabled: true,
        prediction_validation_window_hours: 24
    },
    optimization: {
        auto_optimization_enabled: true,
        optimization_frequency_hours: 6,
        load_balancing_threshold: 0.8,
        peak_mitigation_threshold: 0.9,
        resource_efficiency_target: 0.75
    },
    llm_integration: {
        ollama: {
            enabled: true,
            model: 'qwen3:8b',
            use_for: ['pattern_analysis', 'rule_generation']
        },
        openai: {
            enabled: true,
            model: 'gpt-4',
            use_for: ['complex_patterns', 'advanced_optimization', 'natural_language']
        },
        fallback_strategy: 'ollama_first'
    }
};
