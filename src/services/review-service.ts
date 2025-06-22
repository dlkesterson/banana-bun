import { getDatabase } from '../db';
import type { DatabaseReviewResult, ReviewMetrics } from '../types/review';

export interface TaskReviewSummary {
    latest_review: DatabaseReviewResult | null;
    total_reviews: number;
    average_score: number | null;
    passed_count: number;
    failed_count: number;
}

class ReviewService {
    /**
     * Get review summary for a specific task
     */
    getTaskReviewSummary(taskId: number): TaskReviewSummary {
        const db = getDatabase();

        // Get latest review for the task
        const latestReview = db.query(`
            SELECT * FROM review_results 
            WHERE task_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `).get(taskId) as DatabaseReviewResult | null;

        // Get review statistics for the task
        const stats = db.query(`
            SELECT 
                COUNT(*) as total_reviews,
                AVG(score) as average_score,
                SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed_count,
                SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) as failed_count
            FROM review_results 
            WHERE task_id = ?
        `).get(taskId) as any;

        return {
            latest_review: latestReview,
            total_reviews: stats?.total_reviews || 0,
            average_score: stats?.average_score || null,
            passed_count: stats?.passed_count || 0,
            failed_count: stats?.failed_count || 0
        };
    }

    /**
     * Get overall review metrics across all tasks
     */
    getReviewMetrics(): ReviewMetrics {
        const db = getDatabase();

        const stats = db.query(`
            SELECT 
                COUNT(*) as total_reviews,
                SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as passed_reviews,
                SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) as failed_reviews,
                AVG(score) as average_score,
                SUM(CASE WHEN score >= 90 THEN 1 ELSE 0 END) as excellent,
                SUM(CASE WHEN score >= 70 AND score < 90 THEN 1 ELSE 0 END) as good,
                SUM(CASE WHEN score >= 50 AND score < 70 THEN 1 ELSE 0 END) as fair,
                SUM(CASE WHEN score < 50 THEN 1 ELSE 0 END) as poor
            FROM review_results
            WHERE score IS NOT NULL
        `).get() as any;

        return {
            total_reviews: stats?.total_reviews || 0,
            passed_reviews: stats?.passed_reviews || 0,
            failed_reviews: stats?.failed_reviews || 0,
            average_score: stats?.average_score || 0,
            score_distribution: {
                excellent: stats?.excellent || 0,
                good: stats?.good || 0,
                fair: stats?.fair || 0,
                poor: stats?.poor || 0
            }
        };
    }

    /**
     * Generate a pass/fail badge HTML
     */
    getPassFailBadge(passed: boolean): string {
        if (passed) {
            return '<span class="px-2 py-1 text-xs bg-green-500 text-white rounded">✅ PASS</span>';
        } else {
            return '<span class="px-2 py-1 text-xs bg-red-500 text-white rounded">❌ FAIL</span>';
        }
    }

    /**
     * Generate a score badge HTML
     */
    getScoreBadge(score: number | null): string {
        if (score === null || score === undefined) {
            return '<span class="px-2 py-1 text-xs bg-gray-400 text-white rounded">N/A</span>';
        }

        let colorClass = 'bg-gray-400';
        let label = 'N/A';

        if (score >= 90) {
            colorClass = 'bg-green-500';
            label = 'Excellent';
        } else if (score >= 70) {
            colorClass = 'bg-blue-500';
            label = 'Good';
        } else if (score >= 50) {
            colorClass = 'bg-yellow-500';
            label = 'Fair';
        } else {
            colorClass = 'bg-red-500';
            label = 'Poor';
        }

        return `<span class="px-2 py-1 text-xs ${colorClass} text-white rounded">${score} (${label})</span>`;
    }

    /**
     * Get all reviews for a specific task
     */
    getTaskReviews(taskId: number): DatabaseReviewResult[] {
        const db = getDatabase();
        return db.query(`
            SELECT * FROM review_results 
            WHERE task_id = ? 
            ORDER BY created_at DESC
        `).all(taskId) as DatabaseReviewResult[];
    }

    /**
     * Get recent reviews across all tasks
     */
    getRecentReviews(limit: number = 10): DatabaseReviewResult[] {
        const db = getDatabase();
        return db.query(`
            SELECT * FROM review_results 
            ORDER BY created_at DESC 
            LIMIT ?
        `).all(limit) as DatabaseReviewResult[];
    }
}

// Export a singleton instance
export const reviewService = new ReviewService();


