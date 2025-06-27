/**
 * Types for LLM-Based Planning System
 * 
 * These types support the LLM-based planning functionality
 * as described in PRD-LLM-BASED-PLANNING.md
 */

export interface PlanTemplate {
    id: number;
    name: string;
    description?: string;
    template_data: string; // JSON string
    created_at: string;
    updated_at: string;
    success_rate: number;
    usage_count: number;
    embedding_id?: string;
    search_index_id?: string;
}

export interface SystemMetric {
    id: number;
    metric_type: string;
    metric_value: number;
    timestamp: string;
    context?: string;
    search_index_id?: string;
}

export interface OptimizationRecommendation {
    id: number;
    recommendation_type: string;
    description: string;
    impact_score: number;
    implementation_difficulty: 'low' | 'medium' | 'high';
    created_at: string;
    implemented: boolean;
    implemented_at?: string;
    llm_model_used?: string;
    embedding_id?: string;
    search_index_id?: string;
}

export interface LogAnalysisPattern {
    id: number;
    pattern_type: string;
    pattern_description: string;
    frequency: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    first_detected: string;
    last_detected: string;
    resolved: boolean;
    resolved_at?: string;
    embedding_id?: string;
    search_index_id?: string;
}

export interface ResourceUsagePrediction {
    id: number;
    resource_type: string;
    predicted_usage: number;
    prediction_window_hours: number;
    confidence_score: number;
    created_at: string;
    actual_usage?: number;
    accuracy_score?: number;
    llm_model_used?: string;
    embedding_id?: string;
}

export interface LlmPlanningRequest {
    goal: string;
    context?: string;
    constraints?: string[];
    preferred_approach?: string;
    max_subtasks?: number;
    include_similar_tasks?: boolean;
    model?: string;
    useAdvancedModel?: boolean;
    withAnalysis?: boolean;
}

export interface LlmPlanningResult {
    success: boolean;
    plan?: GeneratedPlan;
    optimizationScore?: number;
    resourceEfficiency?: number;
    modelUsed: string;
    contextUsed?: {
        logPatternsCount: number;
        templatesCount: number;
        metricsCount: number;
    };
    error?: string;
}

export interface GeneratedPlan {
    approach: string;
    subtasks: GeneratedSubtask[];
    optimization_notes?: string;
    risk_assessment?: string;
    estimated_total_duration?: string;
    resource_requirements?: ResourceRequirement[];
}

export interface GeneratedSubtask {
    type: string;
    description: string;
    estimated_duration?: string;
    resource_requirements?: string;
    dependencies?: string[];
    priority?: number;
}

export interface ResourceRequirement {
    type: 'cpu' | 'memory' | 'disk' | 'network';
    amount: number;
    unit: string;
    duration?: string;
}

export interface PlanningMetrics {
    totalPlans: number;
    averageOptimizationScore: number;
    successRate: number;
    averageExecutionTime: number;
    resourceEfficiencyTrend: number[];
    topBottlenecks: LogAnalysisPattern[];
    implementedRecommendations: number;
    pendingRecommendations: number;
}

export interface LogAnalysisRequest {
    timeRangeHours?: number;
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
    includePatterns?: boolean;
    generateRecommendations?: boolean;
    model?: string;
}

export interface LogAnalysisResult {
    patterns: LogAnalysisPattern[];
    recommendations: OptimizationRecommendation[];
    summary: {
        totalLogs: number;
        errorRate: number;
        warningRate: number;
        topIssues: string[];
    };
    bottlenecks: {
        type: string;
        description: string;
        severity: string;
        frequency: number;
    }[];
}

export interface MetadataQualityAnalysis {
    completenessScore: number;
    qualityIssues: {
        type: string;
        count: number;
        examples: string[];
    }[];
    recommendations: {
        action: string;
        priority: 'low' | 'medium' | 'high';
        estimatedImpact: string;
    }[];
    missingFields: {
        field: string;
        missingCount: number;
        percentage: number;
    }[];
}

export interface TaskSchedulingOptimization {
    currentSchedule: {
        taskType: string;
        averageWaitTime: number;
        throughput: number;
    }[];
    optimizedSchedule: {
        taskType: string;
        recommendedBatchSize: number;
        optimalTimeWindow: string;
        expectedImprovement: string;
    }[];
    recommendations: {
        type: 'batching' | 'parallelization' | 'scheduling' | 'resource_allocation';
        description: string;
        expectedBenefit: string;
    }[];
}

export interface ResourceAllocationPlan {
    predictions: ResourceUsagePrediction[];
    recommendations: {
        resource: string;
        currentAllocation: number;
        recommendedAllocation: number;
        reasoning: string;
    }[];
    scalingStrategy: {
        triggers: string[];
        actions: string[];
        timeline: string;
    };
}

export interface PlanExecutionContext {
    planId: number;
    executionId: string;
    startTime: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress: {
        completedSubtasks: number;
        totalSubtasks: number;
        currentSubtask?: string;
    };
    metrics: {
        actualDuration?: number;
        resourceUsage?: ResourceRequirement[];
        optimizationScore?: number;
    };
    fallbackPlan?: GeneratedPlan;
}

export interface PlanValidationResult {
    isValid: boolean;
    issues: {
        type: 'error' | 'warning' | 'info';
        message: string;
        subtaskIndex?: number;
    }[];
    suggestions: string[];
    estimatedSuccessRate: number;
}

export interface SystemHealthScore {
    score: number; // 0-100
    issues: {
        category: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        recommendation?: string;
    }[];
    trends: {
        metric: string;
        direction: 'improving' | 'stable' | 'degrading';
        changePercent: number;
    }[];
}
