/**
 * Phase 3: Enhanced Review System Types
 */

export interface ReviewResult {
    passed: boolean;
    score?: number;
    feedback: string;
    suggestions?: string[];
}

export interface DatabaseReviewResult {
    id: number;
    task_id: number;
    reviewer_type: 'llm' | 'human' | 'automated';
    model_used: string | null;
    passed: boolean;
    score: number | null;
    feedback: string;
    suggestions: string | null; // JSON array
    review_criteria: string | null;
    reviewed_output: string | null;
    created_at: string;
}

export interface ReviewMetrics {
    total_reviews: number;
    passed_reviews: number;
    failed_reviews: number;
    average_score: number;
    score_distribution: {
        excellent: number; // 90-100
        good: number;      // 70-89
        fair: number;      // 50-69
        poor: number;      // 0-49
    };
}

export interface TaskReviewSummary {
    task_id: number;
    latest_review: DatabaseReviewResult | null;
    review_count: number;
    average_score: number | null;
    passed_percentage: number;
}
