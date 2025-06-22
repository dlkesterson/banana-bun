/**
 * Phase 3: Enhanced Planner System Types
 */

export interface PlannerContext {
    similar_tasks: SimilarTaskContext[];
    embedding_ids: string[];
    total_context_tasks: number;
}

export interface SimilarTaskContext {
    task_id: number;
    description: string;
    type: string;
    status: string;
    result_summary: string | null;
    similarity_score: number;
    completed_at: string | null;
}

export interface DatabasePlannerResult {
    id: number;
    task_id: number;
    model_used: string;
    goal_description: string;
    generated_plan: string; // JSON of the full plan
    similar_tasks_used: string | null; // JSON array of similar task IDs
    context_embeddings: string | null; // JSON of embedding IDs used
    subtask_count: number;
    plan_version: number;
    created_at: string;
}

export interface GeneratedPlan {
    goal: string;
    approach: string;
    subtasks: GeneratedSubtask[];
    estimated_duration?: string;
    dependencies?: string[];
    risks?: string[];
}

export interface GeneratedSubtask {
    type: string;
    description: string;
    args?: any;
    generator?: any;
    estimated_duration?: string;
    dependencies?: string[];
}

export interface PlannerMetrics {
    total_plans: number;
    average_subtasks: number;
    most_common_patterns: string[];
    success_rate_by_context: {
        with_similar_tasks: number;
        without_similar_tasks: number;
    };
}

export interface PlanningRequest {
    goal: string;
    context?: string;
    constraints?: string[];
    preferred_approach?: string;
    max_subtasks?: number;
    include_similar_tasks?: boolean;
}
