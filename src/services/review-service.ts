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
            task_id: taskId,
            latest_review: latestReview,
            latest_score: latestReview?.score || null, // Also provide as 'latest_score' for compatibility
            total_reviews: stats?.total_reviews || 0,
            average_score: stats?.average_score || null,
            passed_count: stats?.passed_count || 0,
            passed_reviews: stats?.passed_count || 0, // Also provide as 'passed_reviews' for compatibility
            failed_count: stats?.failed_count || 0,
            failed_reviews: stats?.failed_count || 0 // Also provide as 'failed_reviews' for compatibility
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
     * Review multiple tasks in batch
     */
    async reviewBatch(taskIds: number[], criteria: string[]): Promise<any> {
        try {
            const reviews = [];
            let totalScore = 0;
            let passedTasks = 0;
            let failedTasks = 0;

            for (const taskId of taskIds) {
                const review = await this.reviewTask(taskId, criteria);
                reviews.push({
                    task_id: taskId,
                    ...review
                });

                if (review.success) {
                    totalScore += review.score || 0;
                    if (review.score && review.score >= 0.7) {
                        passedTasks++;
                    } else {
                        failedTasks++;
                    }
                } else {
                    failedTasks++;
                }
            }

            const overallScore = taskIds.length > 0 ? totalScore / taskIds.length : 0;

            return {
                success: true,
                reviews,
                results: reviews, // Also provide as 'results' for compatibility
                overall_score: overallScore, // Also provide at top level for compatibility
                summary: {
                    total_tasks: taskIds.length,
                    passed_tasks: passedTasks,
                    failed_tasks: failedTasks,
                    overall_score: overallScore
                }
            };
        } catch (error) {
            await logger.error('Failed to review batch', {
                taskIds,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                reviews: [],
                results: [], // Also provide as 'results' for compatibility
                summary: {
                    total_tasks: taskIds.length,
                    passed_tasks: 0,
                    failed_tasks: taskIds.length,
                    overall_score: 0
                }
            };
        }
    }

    /**
     * Generate a summary report for multiple tasks
     */
    async generateSummaryReport(taskIds: number[]): Promise<any> {
        try {
            const db = getDatabase();
            const tasks = [];
            let completedTasks = 0;
            let failedTasks = 0;

            for (const taskId of taskIds) {
                const task = db.query(`SELECT * FROM tasks WHERE id = ?`).get(taskId) as any;
                if (task) {
                    tasks.push(task);
                    if (task.status === 'completed') {
                        completedTasks++;
                    } else if (task.status === 'error' || task.status === 'failed') {
                        failedTasks++;
                    }
                }
            }

            const summary = {
                total_tasks: taskIds.length,
                completed_tasks: completedTasks,
                failed_tasks: failedTasks,
                pending_tasks: taskIds.length - completedTasks - failedTasks,
                completion_rate: taskIds.length > 0 ? completedTasks / taskIds.length : 0,
                success_rate: taskIds.length > 0 ? completedTasks / taskIds.length : 0 // Also provide as 'success_rate' for compatibility
            };

            return {
                success: true,
                summary,
                tasks,
                task_breakdown: tasks, // Also provide as 'task_breakdown' for compatibility
                recommendations: [] // Add empty recommendations for compatibility
            };
        } catch (error) {
            await logger.error('Failed to generate summary report', {
                taskIds,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Calculate code quality metrics for given code
     */
    async calculateCodeQuality(code: string, language: string): Promise<any> {
        try {
            const linesOfCode = code.split('\n').filter(line => line.trim().length > 0).length;
            const totalLines = code.split('\n').length;

            const metrics: any = {
                lines_of_code: linesOfCode,
                line_count: linesOfCode, // Also provide as 'line_count' for compatibility
                total_lines: totalLines,
                language
            };

            if (language === 'python') {
                const functionMatches = code.match(/def\s+\w+/g) || [];
                metrics.has_functions = functionMatches.length > 0;
                metrics.function_count = functionMatches.length;
                metrics.has_classes = /class\s+\w+/.test(code);
                metrics.has_comments = /#/.test(code);
                metrics.has_docstrings = /"""[\s\S]*?"""|'''[\s\S]*?'''/.test(code);
                metrics.has_imports = /^(import|from)\s+/.test(code);
                metrics.complexity_score = this.calculatePythonComplexity(code);
            } else if (language === 'shell' || language === 'bash') {
                metrics.has_error_handling = /set\s+-e|if\s+\[/.test(code);
                metrics.has_comments = /#/.test(code);
                metrics.uses_variables = /\$\w+|\$\{/.test(code);
                metrics.has_functions = /function\s+\w+|\w+\(\)\s*\{/.test(code);
                metrics.complexity_score = this.calculateShellComplexity(code);
            } else if (language === 'javascript' || language === 'typescript') {
                metrics.has_functions = /function\s+\w+|=>\s*\{|const\s+\w+\s*=/.test(code);
                metrics.has_classes = /class\s+\w+/.test(code);
                metrics.has_comments = /\/\/|\/\*/.test(code);
                metrics.has_imports = /^(import|require)\s+/.test(code);
                metrics.complexity_score = this.calculateJSComplexity(code);
            }

            // Calculate overall quality score
            metrics.quality_score = this.calculateOverallQualityScore(metrics, language);
            metrics.success = true;

            return metrics;
        } catch (error) {
            await logger.error('Failed to calculate code quality', {
                language,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                lines_of_code: 0,
                line_count: 0, // Also provide as 'line_count' for compatibility
                total_lines: 0,
                language,
                quality_score: 0,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Analyze performance of a specific task
     */
    async analyzePerformance(taskId: number): Promise<any> {
        try {
            const db = getDatabase();
            const task = db.query(`SELECT * FROM tasks WHERE id = ?`).get(taskId) as any;

            if (!task) {
                return {
                    success: false,
                    error: `Task with ID ${taskId} not found`
                };
            }

            if (!task.started_at || !task.finished_at) {
                return {
                    success: false,
                    error: 'Task timing information not available'
                };
            }

            const startTime = new Date(task.started_at).getTime();
            const endTime = new Date(task.finished_at).getTime();
            const executionTime = endTime - startTime;
            const executionTimeMinutes = executionTime / (1000 * 60);

            let performanceRating = 'Poor';
            if (executionTime < 1000) performanceRating = 'Excellent';
            else if (executionTime < 5000) performanceRating = 'Good';
            else if (executionTime < 30000) performanceRating = 'Fair';

            const recommendations = [];
            if (executionTime > 30000) {
                recommendations.push('Consider optimizing task execution');
                recommendations.push('Review task complexity and dependencies');
            }
            if (executionTime > 300000) {
                recommendations.push('Task execution time is excessive - investigate bottlenecks');
            }

            return {
                success: true,
                execution_time: executionTime,
                execution_time_minutes: executionTimeMinutes,
                performance_rating: performanceRating,
                recommendations
            };
        } catch (error) {
            await logger.error('Failed to analyze performance', {
                taskId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Compare performance against similar tasks
     */
    async comparePerformance(taskType: string, description: string): Promise<any> {
        try {
            const db = getDatabase();
            const similarTasks = db.query(`
                SELECT * FROM tasks
                WHERE type = ? AND description LIKE ?
                AND started_at IS NOT NULL AND finished_at IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 10
            `).all(taskType, `%${description}%`) as any[];

            if (similarTasks.length === 0) {
                return {
                    success: false,
                    error: 'No similar tasks found for comparison'
                };
            }

            const executionTimes = similarTasks.map(task => {
                const startTime = new Date(task.started_at).getTime();
                const endTime = new Date(task.finished_at).getTime();
                return endTime - startTime;
            });

            const averageTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
            const minTime = Math.min(...executionTimes);
            const maxTime = Math.max(...executionTimes);

            // Calculate percentile rank for the most recent task
            const latestTime = executionTimes[0];
            const fasterTasks = executionTimes.filter(time => time < latestTime).length;
            const percentileRank = (fasterTasks / executionTimes.length) * 100;
            const performanceRatio = averageTime > 0 ? latestTime / averageTime : 1;

            return {
                success: true,
                average_time: averageTime,
                benchmark_average: averageTime, // Also provide as 'benchmark_average' for compatibility
                min_time: minTime,
                max_time: maxTime,
                latest_time: latestTime,
                percentile_rank: percentileRank,
                performance_ratio: performanceRatio,
                sample_size: similarTasks.length,
                current_performance: {
                    execution_time: latestTime,
                    percentile_rank: percentileRank
                }
            };
        } catch (error) {
            await logger.error('Failed to compare performance', {
                taskType,
                description,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
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
            } else if (criterion.includes('file') || criterion.includes('output') ||
                       criterion.toLowerCase().includes('size') ||
                       criterion.toLowerCase().includes('bytes') ||
                       criterion.toLowerCase().includes('function definition') ||
                       criterion.toLowerCase().includes('contains function') ||
                       criterion.toLowerCase().includes('valid python')) {
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
            // Try different possible output file extensions
            const possibleExtensions = ['txt', 'py', 'md', 'js', 'sh'];
            let outputPath = `${config.paths.outputs}/task_${task.id}_output.${this.getFileExtension(task.type)}`;

            // Also try without extension and with .txt
            const possiblePaths = [
                outputPath,
                `${config.paths.outputs}/task_${task.id}_output.txt`,
                `${config.paths.outputs}/task_${task.id}_output`
            ];



            if (criterion.toLowerCase().includes('exists') || criterion.toLowerCase().includes('output file exists')) {
                for (const path of possiblePaths) {
                    try {
                        await fs.access(path);
                        return true;
                    } catch {
                        // Continue to next path
                    }
                }
                return false;
            } else if (criterion.includes('size') || criterion.includes('bytes')) {
                for (const path of possiblePaths) {
                    try {
                        const stats = await fs.stat(path);
                        const sizeMatch = criterion.match(/(\d+)\s*bytes?/);
                        if (sizeMatch) {
                            const requiredSize = parseInt(sizeMatch[1]);
                            return stats.size >= requiredSize;
                        }
                        // If no specific size mentioned, just check if file has content
                        return stats.size > 0;
                    } catch {
                        // Continue to next path
                    }
                }
                return false;
            } else if (criterion.toLowerCase().includes('valid python')) {
                for (const path of possiblePaths) {
                    try {
                        const content = await fs.readFile(path, 'utf-8');
                        // Basic Python syntax check
                        return !content.includes('SyntaxError') && content.trim().length > 0;
                    } catch {
                        // Continue to next path
                    }
                }
                return false;
            } else if (criterion.toLowerCase().includes('function definition') || criterion.toLowerCase().includes('contains function')) {
                for (const path of possiblePaths) {
                    try {
                        const content = await fs.readFile(path, 'utf-8');
                        return /def\s+\w+/.test(content);
                    } catch {
                        // Continue to next path
                    }
                }
                return false;
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
        // Handle JavaScript-style expressions
        if (criterion.includes('===') || criterion.includes('==')) {
            return this.evaluateJavaScriptExpression(task, criterion);
        }

        // Simple string matching against task properties
        const taskString = JSON.stringify(task).toLowerCase();
        const criterionLower = criterion.toLowerCase();

        if (criterionLower.includes('success')) {
            return task.status === 'completed' && !task.error_message;
        } else if (criterionLower.includes('error')) {
            return task.status === 'error' || !!task.error_message;
        } else if (criterionLower.includes('completed')) {
            return task.status === 'completed';
        } else if (criterionLower.includes('no errors reported')) {
            return !task.error_message;
        } else if (criterionLower.includes('task completed successfully')) {
            return task.status === 'completed' && (task.result_summary || '').toLowerCase().includes('success');
        }

        return taskString.includes(criterionLower.replace(/[^\w\s]/g, ''));
    }

    private evaluateJavaScriptExpression(task: any, expression: string): boolean {
        try {
            // Create a safe evaluation context
            const context = {
                status: task.status,
                type: task.type,
                result_summary: task.result_summary || '',
                error_message: task.error_message || '',
                description: task.description || ''
            };

            // Replace property references in the expression
            let safeExpression = expression;
            for (const [key, value] of Object.entries(context)) {
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                if (typeof value === 'string') {
                    safeExpression = safeExpression.replace(regex, `"${value}"`);
                } else {
                    safeExpression = safeExpression.replace(regex, String(value));
                }
            }

            // Evaluate the expression safely
            return Function(`"use strict"; return (${safeExpression})`)();
        } catch (error) {
            // If evaluation fails, fall back to string matching
            return false;
        }
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

    private calculatePythonComplexity(code: string): number {
        let complexity = 1; // Base complexity

        // Count control flow statements
        const ifMatches = (code.match(/\bif\b/g) || []).length;
        const forMatches = (code.match(/\bfor\b/g) || []).length;
        const whileMatches = (code.match(/\bwhile\b/g) || []).length;
        const tryMatches = (code.match(/\btry\b/g) || []).length;

        complexity += ifMatches + forMatches + whileMatches + tryMatches;

        return Math.min(complexity, 10); // Cap at 10
    }

    private calculateShellComplexity(code: string): number {
        let complexity = 1; // Base complexity

        // Count control flow statements
        const ifMatches = (code.match(/\bif\b/g) || []).length;
        const forMatches = (code.match(/\bfor\b/g) || []).length;
        const whileMatches = (code.match(/\bwhile\b/g) || []).length;
        const caseMatches = (code.match(/\bcase\b/g) || []).length;

        complexity += ifMatches + forMatches + whileMatches + caseMatches;

        return Math.min(complexity, 10); // Cap at 10
    }

    private calculateJSComplexity(code: string): number {
        let complexity = 1; // Base complexity

        // Count control flow statements
        const ifMatches = (code.match(/\bif\b/g) || []).length;
        const forMatches = (code.match(/\bfor\b/g) || []).length;
        const whileMatches = (code.match(/\bwhile\b/g) || []).length;
        const switchMatches = (code.match(/\bswitch\b/g) || []).length;
        const tryMatches = (code.match(/\btry\b/g) || []).length;

        complexity += ifMatches + forMatches + whileMatches + switchMatches + tryMatches;

        return Math.min(complexity, 10); // Cap at 10
    }

    private calculateOverallQualityScore(metrics: any, language: string): number {
        let score = 50; // Base score

        // Lines of code factor
        if (metrics.lines_of_code > 5) score += 10;
        if (metrics.lines_of_code > 20) score += 10;

        // Language-specific factors
        if (language === 'python') {
            if (metrics.has_functions) score += 15;
            if (metrics.has_comments) score += 10;
            if (metrics.has_docstrings) score += 15;
            if (metrics.complexity_score <= 5) score += 10;
        } else if (language === 'shell') {
            if (metrics.has_error_handling) score += 20;
            if (metrics.has_comments) score += 10;
            if (metrics.uses_variables) score += 10;
            if (metrics.has_functions) score += 10;
        }

        return Math.min(score, 100);
    }
}

// Export both the class and a singleton instance
export { ReviewService };
export const reviewService = new ReviewService();


