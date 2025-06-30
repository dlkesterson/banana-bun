import { getDatabase } from '../db';
import type { DatabaseReviewResult, ReviewMetrics } from '../types/review';
import type { IReviewService, ReviewResult } from '../types/service-interfaces';
import { logger } from '../utils/logger';
import { config } from '../config';
import { promises as fs } from 'fs';

export interface TaskReviewSummary {
    latest_review: DatabaseReviewResult | null;
    total_reviews: number;
    average_score: number | null;
    passed_count: number;
    failed_count: number;
}

class ReviewService implements IReviewService {
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

    /**
     * Review a task against specified criteria
     */
    async reviewTask(taskId: number, criteria: string[]): Promise<ReviewResult> {
        try {
            const db = getDatabase();

            // Get the task details
            const task = db.query(`
                SELECT * FROM tasks WHERE id = ?
            `).get(taskId) as any;

            if (!task) {
                return {
                    success: false,
                    score: 0,
                    passed_criteria: [],
                    failed_criteria: criteria,
                    error: `Task with ID ${taskId} not found`
                };
            }

            const passedCriteria: string[] = [];
            const failedCriteria: string[] = [];
            const recommendations: string[] = [];

            // Evaluate each criterion
            for (const criterion of criteria) {
                try {
                    const passed = await this.evaluateCriterion(task, criterion);
                    if (passed) {
                        passedCriteria.push(criterion);
                    } else {
                        failedCriteria.push(criterion);
                    }
                } catch (error) {
                    failedCriteria.push(criterion);
                    await logger.warn('Failed to evaluate criterion', {
                        taskId,
                        criterion,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            // Calculate score
            const score = criteria.length > 0 ? passedCriteria.length / criteria.length : 0;

            // Generate quality metrics
            const qualityMetrics = await this.calculateQualityMetrics(task);

            // Generate recommendations based on failed criteria
            if (failedCriteria.length > 0) {
                recommendations.push(...await this.generateRecommendations(task, failedCriteria));
            }

            // Store review result
            const reviewResult = {
                task_id: taskId,
                criteria_json: JSON.stringify(criteria),
                passed_criteria_json: JSON.stringify(passedCriteria),
                failed_criteria_json: JSON.stringify(failedCriteria),
                score: Math.round(score * 100),
                recommendations_json: JSON.stringify(recommendations),
                quality_metrics_json: JSON.stringify(qualityMetrics),
                passed: score >= 0.7, // 70% threshold for passing
                created_at: new Date().toISOString()
            };

            db.run(`
                INSERT INTO review_results (
                    task_id, criteria_json, passed_criteria_json, failed_criteria_json,
                    score, recommendations_json, quality_metrics_json, passed, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                reviewResult.task_id,
                reviewResult.criteria_json,
                reviewResult.passed_criteria_json,
                reviewResult.failed_criteria_json,
                reviewResult.score,
                reviewResult.recommendations_json,
                reviewResult.quality_metrics_json,
                reviewResult.passed ? 1 : 0,
                reviewResult.created_at
            ]);

            await logger.info('Task reviewed successfully', {
                taskId,
                score: reviewResult.score,
                passedCount: passedCriteria.length,
                failedCount: failedCriteria.length
            });

            return {
                success: true,
                score,
                passed_criteria: passedCriteria,
                failed_criteria: failedCriteria,
                recommendations,
                quality_metrics: qualityMetrics
            };
        } catch (error) {
            await logger.error('Failed to review task', {
                taskId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                score: 0,
                passed_criteria: [],
                failed_criteria: criteria,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Evaluate a single criterion against a task
     */
    private async evaluateCriterion(task: any, criterion: string): Promise<boolean> {
        try {
            // Handle different types of criteria
            if (criterion.includes('status')) {
                return this.evaluateStatusCriterion(task, criterion);
            } else if (criterion.includes('file') || criterion.includes('output')) {
                return await this.evaluateFileCriterion(task, criterion);
            } else if (criterion.includes('duration') || criterion.includes('time')) {
                return this.evaluateTimeCriterion(task, criterion);
            } else {
                // Generic evaluation using simple string matching
                return this.evaluateGenericCriterion(task, criterion);
            }
        } catch (error) {
            await logger.warn('Criterion evaluation failed', {
                taskId: task.id,
                criterion,
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    private evaluateStatusCriterion(task: any, criterion: string): boolean {
        if (criterion.includes('completed')) {
            return task.status === 'completed';
        } else if (criterion.includes('error')) {
            return task.status === 'error';
        } else if (criterion.includes('pending')) {
            return task.status === 'pending';
        }
        return false;
    }

    private async evaluateFileCriterion(task: any, criterion: string): Promise<boolean> {
        try {
            const outputPath = `${config.paths.outputs}/task_${task.id}_output.${this.getFileExtension(task.type)}`;

            if (criterion.includes('exists')) {
                try {
                    await fs.access(outputPath);
                    return true;
                } catch {
                    return false;
                }
            } else if (criterion.includes('size')) {
                try {
                    const stats = await fs.stat(outputPath);
                    const sizeMatch = criterion.match(/(\d+)\s*bytes?/);
                    if (sizeMatch) {
                        const requiredSize = parseInt(sizeMatch[1]);
                        return stats.size >= requiredSize;
                    }
                } catch {
                    return false;
                }
            }
        } catch {
            return false;
        }
        return false;
    }

    private evaluateTimeCriterion(task: any, criterion: string): boolean {
        if (!task.started_at || !task.finished_at) {
            return false;
        }

        const duration = new Date(task.finished_at).getTime() - new Date(task.started_at).getTime();

        if (criterion.includes('under') || criterion.includes('<')) {
            const timeMatch = criterion.match(/(\d+)\s*(ms|seconds?|minutes?)/);
            if (timeMatch) {
                const value = parseInt(timeMatch[1]);
                const unit = timeMatch[2];
                let maxDuration = value;

                if (unit.startsWith('second')) maxDuration *= 1000;
                else if (unit.startsWith('minute')) maxDuration *= 60000;

                return duration < maxDuration;
            }
        }

        return false;
    }

    private evaluateGenericCriterion(task: any, criterion: string): boolean {
        // Simple string matching against task properties
        const taskString = JSON.stringify(task).toLowerCase();
        const criterionLower = criterion.toLowerCase();

        if (criterionLower.includes('success')) {
            return task.status === 'completed' && !task.error_message;
        } else if (criterionLower.includes('error')) {
            return task.status === 'error' || !!task.error_message;
        }

        return taskString.includes(criterionLower.replace(/[^\w\s]/g, ''));
    }

    private async calculateQualityMetrics(task: any): Promise<any> {
        const metrics: any = {};

        // Code quality for code tasks
        if (task.type === 'code') {
            metrics.code_quality = await this.assessCodeQuality(task);
        }

        // Output quality assessment
        metrics.output_quality = await this.assessOutputQuality(task);

        // Performance score
        metrics.performance_score = this.calculatePerformanceScore(task);

        return metrics;
    }

    private async assessCodeQuality(task: any): Promise<number> {
        // Simplified code quality assessment
        try {
            const outputPath = `${config.paths.outputs}/task_${task.id}_output.py`;
            const content = await fs.readFile(outputPath, 'utf-8');

            let score = 50; // Base score

            // Check for basic quality indicators
            if (content.includes('def ')) score += 10; // Has functions
            if (content.includes('class ')) score += 10; // Has classes
            if (content.includes('"""') || content.includes("'''")) score += 10; // Has docstrings
            if (content.includes('if __name__')) score += 10; // Has main guard
            if (content.split('\n').length > 10) score += 10; // Reasonable length

            return Math.min(score, 100);
        } catch {
            return 50; // Default score if assessment fails
        }
    }

    private async assessOutputQuality(task: any): Promise<number> {
        // Generic output quality assessment
        if (task.status === 'completed' && !task.error_message) {
            return 80;
        } else if (task.status === 'completed' && task.error_message) {
            return 60;
        } else if (task.status === 'error') {
            return 20;
        }
        return 40;
    }

    private calculatePerformanceScore(task: any): number {
        if (!task.started_at || !task.finished_at) {
            return 50;
        }

        const duration = new Date(task.finished_at).getTime() - new Date(task.started_at).getTime();

        // Score based on execution time (lower is better)
        if (duration < 1000) return 100; // Under 1 second
        if (duration < 5000) return 90;  // Under 5 seconds
        if (duration < 30000) return 80; // Under 30 seconds
        if (duration < 60000) return 70; // Under 1 minute
        if (duration < 300000) return 60; // Under 5 minutes
        return 40; // Over 5 minutes
    }

    private async generateRecommendations(task: any, failedCriteria: string[]): Promise<string[]> {
        const recommendations: string[] = [];

        for (const criterion of failedCriteria) {
            if (criterion.includes('status')) {
                recommendations.push('Check task execution logs for errors');
            } else if (criterion.includes('file') || criterion.includes('output')) {
                recommendations.push('Verify output file generation and permissions');
            } else if (criterion.includes('time') || criterion.includes('duration')) {
                recommendations.push('Optimize task execution for better performance');
            } else {
                recommendations.push(`Review and address: ${criterion}`);
            }
        }

        return recommendations;
    }

    private getFileExtension(taskType: string): string {
        switch (taskType) {
            case 'code': return 'py';
            case 'shell': return 'txt';
            case 'llm': return 'md';
            default: return 'txt';
        }
    }
}

// Export a singleton instance
export const reviewService = new ReviewService();


