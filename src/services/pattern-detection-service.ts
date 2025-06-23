/**
 * Pattern Detection Service - Analyzes temporal patterns in content and system behavior
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';
import { ChromaClient } from 'chromadb';
import { config } from '../config';
import type {
    ActivityPattern,
    PatternType,
    PatternData,
    TimeWindow,
    ResourceMetrics,
    PatternDetectionConfig,
    PatternAnalysisResponse,
    PatternRecommendation
} from '../types/rule-scheduler';

export class PatternDetectionService {
    private db: Database;
    private chromaClient: ChromaClient;
    private config: PatternDetectionConfig;

    constructor(
        db: Database, 
        chromaClient: ChromaClient,
        config: PatternDetectionConfig
    ) {
        this.db = db;
        this.chromaClient = chromaClient;
        this.config = config;
    }

    /**
     * Analyze activity patterns over a specified time window
     */
    async analyzeActivityPatterns(
        analysisWindowDays: number = this.config.analysis_window_days
    ): Promise<PatternAnalysisResponse> {
        logger.info('Starting activity pattern analysis', { analysisWindowDays });

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - analysisWindowDays);
            const cutoffTime = cutoffDate.toISOString();

            // Detect different types of patterns
            const dailyPatterns = await this.detectDailyPatterns(cutoffTime);
            const weeklyPatterns = await this.detectWeeklyPatterns(cutoffTime);
            const monthlyPatterns = await this.detectMonthlyPatterns(cutoffTime);
            const taskCorrelationPatterns = await this.detectTaskCorrelationPatterns(cutoffTime);
            
            let resourcePatterns: ActivityPattern[] = [];
            if (this.config.enable_resource_pattern_analysis) {
                resourcePatterns = await this.detectResourcePatterns(cutoffTime);
            }

            // Combine all patterns
            const allPatterns = [
                ...dailyPatterns,
                ...weeklyPatterns,
                ...monthlyPatterns,
                ...taskCorrelationPatterns,
                ...resourcePatterns
            ];

            // Filter by confidence threshold
            const highConfidencePatterns = allPatterns.filter(
                pattern => pattern.confidence_score >= this.config.min_confidence_threshold
            );

            // Store patterns in database and ChromaDB
            const storedPatterns = await this.storePatterns(highConfidencePatterns);

            // Generate recommendations
            const recommendations = await this.generateRecommendations(storedPatterns);

            const response: PatternAnalysisResponse = {
                patterns_found: storedPatterns,
                analysis_summary: {
                    total_patterns: allPatterns.length,
                    high_confidence_patterns: highConfidencePatterns.length,
                    actionable_patterns: recommendations.filter(r => r.confidence >= 0.8).length,
                    analysis_period: `${analysisWindowDays} days`
                },
                recommendations
            };

            logger.info('Pattern analysis completed', {
                totalPatterns: allPatterns.length,
                highConfidencePatterns: highConfidencePatterns.length,
                recommendations: recommendations.length
            });

            return response;
        } catch (error) {
            logger.error('Failed to analyze activity patterns', { error });
            throw error;
        }
    }

    /**
     * Detect daily recurring patterns
     */
    private async detectDailyPatterns(cutoffTime: string): Promise<ActivityPattern[]> {
        const patterns: ActivityPattern[] = [];

        // Query task execution times grouped by hour
        const hourlyStats = this.db.query(`
            SELECT 
                strftime('%H', started_at) as hour,
                type as task_type,
                COUNT(*) as count,
                AVG(
                    CASE 
                        WHEN finished_at IS NOT NULL AND started_at IS NOT NULL 
                        THEN (julianday(finished_at) - julianday(started_at)) * 24 * 60 
                        ELSE NULL 
                    END
                ) as avg_duration_minutes
            FROM tasks 
            WHERE started_at >= ? 
                AND started_at IS NOT NULL
            GROUP BY hour, type
            HAVING count >= ?
            ORDER BY hour, count DESC
        `).all(cutoffTime, this.config.min_detection_count) as any[];

        // Group by hour and analyze patterns
        const hourlyGroups = this.groupBy(hourlyStats, 'hour');
        
        for (const [hour, stats] of Object.entries(hourlyGroups)) {
            const totalTasks = stats.reduce((sum: number, stat: any) => sum + stat.count, 0);
            
            if (totalTasks >= this.config.min_detection_count) {
                const patternData: PatternData = {
                    frequency: totalTasks,
                    time_windows: [{
                        start_hour: parseInt(hour),
                        end_hour: parseInt(hour) + 1
                    }],
                    task_types: stats.map((stat: any) => stat.task_type)
                };

                // Calculate confidence based on consistency
                const confidence = this.calculateTemporalConfidence(stats, 'daily');

                if (confidence >= this.config.min_confidence_threshold) {
                    patterns.push({
                        pattern_type: 'daily_recurring',
                        pattern_data: JSON.stringify(patternData),
                        confidence_score: confidence,
                        detection_count: totalTasks,
                        is_active: true
                    });
                }
            }
        }

        return patterns;
    }

    /**
     * Detect weekly recurring patterns
     */
    private async detectWeeklyPatterns(cutoffTime: string): Promise<ActivityPattern[]> {
        const patterns: ActivityPattern[] = [];

        // Query task execution times grouped by day of week and hour
        const weeklyStats = this.db.query(`
            SELECT 
                strftime('%w', started_at) as day_of_week,
                strftime('%H', started_at) as hour,
                type as task_type,
                COUNT(*) as count
            FROM tasks 
            WHERE started_at >= ? 
                AND started_at IS NOT NULL
            GROUP BY day_of_week, hour, type
            HAVING count >= ?
            ORDER BY day_of_week, hour, count DESC
        `).all(cutoffTime, this.config.min_detection_count) as any[];

        // Group by day of week and hour
        const weeklyGroups = this.groupBy(weeklyStats, 'day_of_week');
        
        for (const [dayOfWeek, dayStats] of Object.entries(weeklyGroups)) {
            const hourlyGroups = this.groupBy(dayStats, 'hour');
            
            for (const [hour, hourStats] of Object.entries(hourlyGroups)) {
                const totalTasks = hourStats.reduce((sum: number, stat: any) => sum + stat.count, 0);
                
                if (totalTasks >= this.config.min_detection_count) {
                    const patternData: PatternData = {
                        frequency: totalTasks,
                        time_windows: [{
                            start_hour: parseInt(hour),
                            end_hour: parseInt(hour) + 1,
                            days_of_week: [parseInt(dayOfWeek)]
                        }],
                        task_types: hourStats.map((stat: any) => stat.task_type)
                    };

                    const confidence = this.calculateTemporalConfidence(hourStats, 'weekly');

                    if (confidence >= this.config.min_confidence_threshold) {
                        patterns.push({
                            pattern_type: 'weekly_recurring',
                            pattern_data: JSON.stringify(patternData),
                            confidence_score: confidence,
                            detection_count: totalTasks,
                            is_active: true
                        });
                    }
                }
            }
        }

        return patterns;
    }

    /**
     * Detect monthly recurring patterns
     */
    private async detectMonthlyPatterns(cutoffTime: string): Promise<ActivityPattern[]> {
        const patterns: ActivityPattern[] = [];

        // Query task execution times grouped by day of month
        const monthlyStats = this.db.query(`
            SELECT 
                strftime('%d', started_at) as day_of_month,
                type as task_type,
                COUNT(*) as count
            FROM tasks 
            WHERE started_at >= ? 
                AND started_at IS NOT NULL
            GROUP BY day_of_month, type
            HAVING count >= ?
            ORDER BY day_of_month, count DESC
        `).all(cutoffTime, this.config.min_detection_count) as any[];

        // Group by day of month
        const monthlyGroups = this.groupBy(monthlyStats, 'day_of_month');
        
        for (const [dayOfMonth, stats] of Object.entries(monthlyGroups)) {
            const totalTasks = stats.reduce((sum: number, stat: any) => sum + stat.count, 0);
            
            if (totalTasks >= this.config.min_detection_count) {
                const patternData: PatternData = {
                    frequency: totalTasks,
                    time_windows: [{
                        start_hour: 0,
                        end_hour: 23,
                        days_of_month: [parseInt(dayOfMonth)]
                    }],
                    task_types: stats.map((stat: any) => stat.task_type)
                };

                const confidence = this.calculateTemporalConfidence(stats, 'monthly');

                if (confidence >= this.config.min_confidence_threshold) {
                    patterns.push({
                        pattern_type: 'monthly_recurring',
                        pattern_data: JSON.stringify(patternData),
                        confidence_score: confidence,
                        detection_count: totalTasks,
                        is_active: true
                    });
                }
            }
        }

        return patterns;
    }

    /**
     * Detect task correlation patterns
     */
    private async detectTaskCorrelationPatterns(cutoffTime: string): Promise<ActivityPattern[]> {
        const patterns: ActivityPattern[] = [];

        // Find tasks that frequently occur together within time windows
        const correlationStats = this.db.query(`
            SELECT 
                t1.type as task_type_1,
                t2.type as task_type_2,
                COUNT(*) as correlation_count,
                AVG(
                    ABS(julianday(t2.started_at) - julianday(t1.started_at)) * 24 * 60
                ) as avg_time_diff_minutes
            FROM tasks t1
            JOIN tasks t2 ON t1.id != t2.id
            WHERE t1.started_at >= ? 
                AND t2.started_at >= ?
                AND t1.started_at IS NOT NULL 
                AND t2.started_at IS NOT NULL
                AND ABS(julianday(t2.started_at) - julianday(t1.started_at)) * 24 * 60 <= 60 -- Within 1 hour
            GROUP BY t1.type, t2.type
            HAVING correlation_count >= ?
            ORDER BY correlation_count DESC
        `).all(cutoffTime, cutoffTime, this.config.min_detection_count) as any[];

        for (const stat of correlationStats) {
            const patternData: PatternData = {
                frequency: stat.correlation_count,
                time_windows: [], // Will be filled based on actual occurrences
                task_types: [stat.task_type_1, stat.task_type_2],
                correlation_strength: stat.correlation_count / 100 // Normalize
            };

            const confidence = Math.min(0.95, stat.correlation_count / 50); // Scale confidence

            if (confidence >= this.config.min_confidence_threshold) {
                patterns.push({
                    pattern_type: 'task_correlation',
                    pattern_data: JSON.stringify(patternData),
                    confidence_score: confidence,
                    detection_count: stat.correlation_count,
                    is_active: true
                });
            }
        }

        return patterns;
    }

    /**
     * Detect resource usage patterns
     */
    private async detectResourcePatterns(cutoffTime: string): Promise<ActivityPattern[]> {
        // This would integrate with system monitoring data
        // For now, return empty array as placeholder
        return [];
    }

    /**
     * Calculate confidence score for temporal patterns
     */
    private calculateTemporalConfidence(stats: any[], patternType: string): number {
        if (stats.length === 0) return 0;

        const totalCount = stats.reduce((sum, stat) => sum + stat.count, 0);
        const avgCount = totalCount / stats.length;
        
        // Calculate variance to measure consistency
        const variance = stats.reduce((sum, stat) => {
            return sum + Math.pow(stat.count - avgCount, 2);
        }, 0) / stats.length;
        
        const standardDeviation = Math.sqrt(variance);
        const coefficientOfVariation = standardDeviation / avgCount;
        
        // Lower coefficient of variation = higher confidence
        let confidence = Math.max(0, 1 - coefficientOfVariation);
        
        // Boost confidence for higher frequency patterns
        if (totalCount > 20) confidence = Math.min(0.95, confidence + 0.1);
        if (totalCount > 50) confidence = Math.min(0.98, confidence + 0.1);
        
        return Math.round(confidence * 100) / 100;
    }

    /**
     * Store patterns in database and ChromaDB
     */
    private async storePatterns(patterns: ActivityPattern[]): Promise<ActivityPattern[]> {
        const storedPatterns: ActivityPattern[] = [];

        for (const pattern of patterns) {
            try {
                // Check if similar pattern already exists
                const existingPattern = await this.findSimilarPattern(pattern);
                
                if (existingPattern) {
                    // Update existing pattern
                    await this.updateExistingPattern(existingPattern, pattern);
                    storedPatterns.push(existingPattern);
                } else {
                    // Store new pattern
                    const storedPattern = await this.storeNewPattern(pattern);
                    storedPatterns.push(storedPattern);
                }
            } catch (error) {
                logger.error('Failed to store pattern', { pattern, error });
            }
        }

        return storedPatterns;
    }

    /**
     * Find similar existing pattern
     */
    private async findSimilarPattern(pattern: ActivityPattern): Promise<ActivityPattern | null> {
        // Query database for similar patterns
        const similarPatterns = this.db.query(`
            SELECT * FROM activity_patterns 
            WHERE pattern_type = ? 
                AND confidence_score >= ?
                AND is_active = TRUE
        `).all(pattern.pattern_type, this.config.pattern_similarity_threshold) as ActivityPattern[];

        // TODO: Use ChromaDB for semantic similarity search
        // For now, use simple type matching
        return similarPatterns.length > 0 ? similarPatterns[0] : null;
    }

    /**
     * Update existing pattern with new detection
     */
    private async updateExistingPattern(
        existingPattern: ActivityPattern, 
        newPattern: ActivityPattern
    ): Promise<void> {
        this.db.run(`
            UPDATE activity_patterns 
            SET detection_count = detection_count + ?,
                last_detected_at = CURRENT_TIMESTAMP,
                confidence_score = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            newPattern.detection_count,
            Math.max(existingPattern.confidence_score, newPattern.confidence_score),
            existingPattern.id
        ]);
    }

    /**
     * Store new pattern
     */
    private async storeNewPattern(pattern: ActivityPattern): Promise<ActivityPattern> {
        const result = this.db.run(`
            INSERT INTO activity_patterns 
            (pattern_type, pattern_data, confidence_score, detection_count, is_active)
            VALUES (?, ?, ?, ?, ?)
        `, [
            pattern.pattern_type,
            pattern.pattern_data,
            pattern.confidence_score,
            pattern.detection_count,
            pattern.is_active
        ]);

        const patternId = result.lastInsertRowid as number;
        
        // TODO: Store embedding in ChromaDB
        // TODO: Index in MeiliSearch
        
        return {
            ...pattern,
            id: patternId
        };
    }

    /**
     * Generate recommendations based on detected patterns
     */
    private async generateRecommendations(patterns: ActivityPattern[]): Promise<PatternRecommendation[]> {
        const recommendations: PatternRecommendation[] = [];

        for (const pattern of patterns) {
            if (pattern.confidence_score >= 0.8 && pattern.detection_count >= 5) {
                recommendations.push({
                    pattern_id: pattern.id!,
                    recommendation_type: 'create_rule',
                    description: `Create scheduling rule for ${pattern.pattern_type} pattern`,
                    confidence: pattern.confidence_score,
                    potential_impact: 'High - Automate recurring tasks'
                });
            } else if (pattern.confidence_score >= 0.6) {
                recommendations.push({
                    pattern_id: pattern.id!,
                    recommendation_type: 'investigate_further',
                    description: `Monitor ${pattern.pattern_type} pattern for more data`,
                    confidence: pattern.confidence_score,
                    potential_impact: 'Medium - Potential automation opportunity'
                });
            }
        }

        return recommendations;
    }

    /**
     * Utility function to group array by key
     */
    private groupBy<T>(array: T[], key: keyof T): { [key: string]: T[] } {
        return array.reduce((groups, item) => {
            const groupKey = String(item[key]);
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(item);
            return groups;
        }, {} as { [key: string]: T[] });
    }
}
