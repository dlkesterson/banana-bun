/**
 * User Behavior Analysis Service - Analyzes user interaction patterns to predict future needs
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';
import { ChromaClient } from 'chromadb';
import type {
    UserBehaviorProfile,
    UserActivityPattern,
    TaskCorrelation,
    ActivityPattern,
    PatternDetectionConfig
} from '../types/rule-scheduler';

export class UserBehaviorService {
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
     * Analyze user behavior patterns and create/update user profile
     */
    async analyzeUserBehavior(
        userId: string = 'default',
        analysisWindowDays: number = this.config.analysis_window_days
    ): Promise<UserBehaviorProfile> {
        logger.info('Analyzing user behavior patterns', { userId, analysisWindowDays });

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - analysisWindowDays);
            const cutoffTime = cutoffDate.toISOString();

            // Analyze different aspects of user behavior
            const activityPatterns = await this.analyzeActivityPatterns(cutoffTime);
            const peakHours = await this.identifyPeakHours(cutoffTime);
            const preferredTaskTypes = await this.identifyPreferredTaskTypes(cutoffTime);
            const interactionFrequency = await this.calculateInteractionFrequency(cutoffTime);

            // Create or update user behavior profile
            const profile: UserBehaviorProfile = {
                user_id: userId,
                activity_patterns: activityPatterns,
                peak_hours: peakHours,
                preferred_task_types: preferredTaskTypes,
                interaction_frequency: interactionFrequency,
                last_updated: new Date().toISOString()
            };

            // Store profile in database
            await this.storeUserProfile(profile);

            logger.info('User behavior analysis completed', {
                userId,
                activityPatterns: activityPatterns.length,
                peakHours: peakHours.length,
                preferredTaskTypes: preferredTaskTypes.length
            });

            return profile;
        } catch (error) {
            logger.error('Failed to analyze user behavior', { userId, error });
            throw error;
        }
    }

    /**
     * Analyze user activity patterns
     */
    private async analyzeActivityPatterns(cutoffTime: string): Promise<UserActivityPattern[]> {
        const patterns: UserActivityPattern[] = [];

        // Get user actions from task logs and analytics
        const userActions = this.db.query(`
            SELECT 
                'task_creation' as action_type,
                strftime('%H', created_at) as hour,
                strftime('%w', created_at) as day_of_week,
                type as related_task_type,
                COUNT(*) as frequency
            FROM tasks 
            WHERE created_at >= ?
            GROUP BY action_type, hour, day_of_week, type
            
            UNION ALL
            
            SELECT 
                'task_completion' as action_type,
                strftime('%H', finished_at) as hour,
                strftime('%w', finished_at) as day_of_week,
                type as related_task_type,
                COUNT(*) as frequency
            FROM tasks 
            WHERE finished_at >= ? AND finished_at IS NOT NULL
            GROUP BY action_type, hour, day_of_week, type
        `).all(cutoffTime, cutoffTime) as any[];

        // Group by action type
        const actionGroups = this.groupBy(userActions, 'action_type');

        for (const [actionType, actions] of Object.entries(actionGroups)) {
            // Calculate time distribution (by hour)
            const timeDistribution: { [hour: number]: number } = {};
            const dayDistribution: { [day: number]: number } = {};
            const taskCorrelations: TaskCorrelation[] = [];

            let totalFrequency = 0;

            for (const action of actions) {
                const hour = parseInt(action.hour);
                const day = parseInt(action.day_of_week);
                const frequency = action.frequency;

                timeDistribution[hour] = (timeDistribution[hour] || 0) + frequency;
                dayDistribution[day] = (dayDistribution[day] || 0) + frequency;
                totalFrequency += frequency;

                // Track task correlations
                const existingCorrelation = taskCorrelations.find(
                    tc => tc.task_type === action.related_task_type
                );

                if (existingCorrelation) {
                    existingCorrelation.correlation_strength += frequency;
                } else {
                    taskCorrelations.push({
                        task_type: action.related_task_type,
                        correlation_strength: frequency,
                        typical_delay_minutes: 0, // Will be calculated separately
                        success_rate: 1.0 // Will be calculated separately
                    });
                }
            }

            // Normalize distributions
            for (const hour in timeDistribution) {
                timeDistribution[hour] = timeDistribution[hour] / totalFrequency;
            }
            for (const day in dayDistribution) {
                dayDistribution[day] = dayDistribution[day] / totalFrequency;
            }

            // Normalize correlation strengths
            for (const correlation of taskCorrelations) {
                correlation.correlation_strength = correlation.correlation_strength / totalFrequency;
            }

            // Calculate success rates and delays for task correlations
            await this.enhanceTaskCorrelations(taskCorrelations, cutoffTime);

            patterns.push({
                action_type: actionType,
                frequency: totalFrequency,
                time_distribution: timeDistribution,
                day_distribution: dayDistribution,
                correlation_with_tasks: taskCorrelations
            });
        }

        return patterns;
    }

    /**
     * Identify peak activity hours
     */
    private async identifyPeakHours(cutoffTime: string): Promise<number[]> {
        const hourlyActivity = this.db.query(`
            SELECT 
                strftime('%H', created_at) as hour,
                COUNT(*) as activity_count
            FROM tasks 
            WHERE created_at >= ?
            GROUP BY hour
            ORDER BY activity_count DESC
        `).all(cutoffTime) as any[];

        if (hourlyActivity.length === 0) return [];

        // Calculate average activity
        const totalActivity = hourlyActivity.reduce((sum, h) => sum + h.activity_count, 0);
        const avgActivity = totalActivity / hourlyActivity.length;

        // Identify hours with above-average activity (top 25%)
        const threshold = avgActivity * 1.5;
        const peakHours = hourlyActivity
            .filter(h => h.activity_count >= threshold)
            .map(h => parseInt(h.hour))
            .slice(0, 6); // Limit to top 6 hours

        return peakHours;
    }

    /**
     * Identify preferred task types
     */
    private async identifyPreferredTaskTypes(cutoffTime: string): Promise<string[]> {
        const taskTypeStats = this.db.query(`
            SELECT 
                type,
                COUNT(*) as count,
                AVG(
                    CASE 
                        WHEN status = 'completed' THEN 1.0 
                        ELSE 0.0 
                    END
                ) as success_rate
            FROM tasks 
            WHERE created_at >= ?
            GROUP BY type
            ORDER BY count DESC, success_rate DESC
        `).all(cutoffTime) as any[];

        // Prefer task types with high frequency and success rate
        return taskTypeStats
            .filter(t => t.success_rate >= 0.7) // At least 70% success rate
            .map(t => t.type)
            .slice(0, 10); // Top 10 preferred types
    }

    /**
     * Calculate interaction frequency
     */
    private async calculateInteractionFrequency(cutoffTime: string): Promise<number> {
        const daysSinceStart = Math.ceil(
            (Date.now() - new Date(cutoffTime).getTime()) / (1000 * 60 * 60 * 24)
        );

        const totalInteractions = this.db.query(`
            SELECT COUNT(*) as count
            FROM tasks 
            WHERE created_at >= ?
        `).get(cutoffTime) as any;

        return totalInteractions.count / daysSinceStart;
    }

    /**
     * Enhance task correlations with success rates and delays
     */
    private async enhanceTaskCorrelations(
        correlations: TaskCorrelation[],
        cutoffTime: string
    ): Promise<void> {
        for (const correlation of correlations) {
            // Calculate success rate for this task type
            const successStats = this.db.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful
                FROM tasks 
                WHERE type = ? AND created_at >= ?
            `).get(correlation.task_type, cutoffTime) as any;

            correlation.success_rate = successStats.total > 0 
                ? successStats.successful / successStats.total 
                : 0;

            // Calculate typical delay (time from creation to start)
            const delayStats = this.db.query(`
                SELECT 
                    AVG(
                        CASE 
                            WHEN started_at IS NOT NULL 
                            THEN (julianday(started_at) - julianday(created_at)) * 24 * 60 
                            ELSE NULL 
                        END
                    ) as avg_delay_minutes
                FROM tasks 
                WHERE type = ? AND created_at >= ? AND started_at IS NOT NULL
            `).get(correlation.task_type, cutoffTime) as any;

            correlation.typical_delay_minutes = delayStats.avg_delay_minutes || 0;
        }
    }

    /**
     * Store user behavior profile in database
     */
    private async storeUserProfile(profile: UserBehaviorProfile): Promise<void> {
        const existingProfile = this.db.query(`
            SELECT id FROM user_behavior_profiles WHERE user_id = ?
        `).get(profile.user_id) as any;

        if (existingProfile) {
            // Update existing profile
            this.db.run(`
                UPDATE user_behavior_profiles 
                SET activity_patterns = ?,
                    peak_hours = ?,
                    preferred_task_types = ?,
                    interaction_frequency = ?,
                    last_updated = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `, [
                JSON.stringify(profile.activity_patterns),
                JSON.stringify(profile.peak_hours),
                JSON.stringify(profile.preferred_task_types),
                profile.interaction_frequency,
                profile.user_id
            ]);
        } else {
            // Insert new profile
            this.db.run(`
                INSERT INTO user_behavior_profiles 
                (user_id, activity_patterns, peak_hours, preferred_task_types, interaction_frequency)
                VALUES (?, ?, ?, ?, ?)
            `, [
                profile.user_id,
                JSON.stringify(profile.activity_patterns),
                JSON.stringify(profile.peak_hours),
                JSON.stringify(profile.preferred_task_types),
                profile.interaction_frequency
            ]);
        }
    }

    /**
     * Get user behavior profile
     */
    async getUserProfile(userId: string = 'default'): Promise<UserBehaviorProfile | null> {
        const profile = this.db.query(`
            SELECT * FROM user_behavior_profiles WHERE user_id = ?
        `).get(userId) as any;

        if (!profile) return null;

        return {
            user_id: profile.user_id,
            activity_patterns: JSON.parse(profile.activity_patterns),
            peak_hours: JSON.parse(profile.peak_hours),
            preferred_task_types: JSON.parse(profile.preferred_task_types),
            interaction_frequency: profile.interaction_frequency,
            last_updated: profile.last_updated
        };
    }

    /**
     * Predict user behavior based on current time and context
     */
    async predictUserBehavior(
        userId: string = 'default',
        currentTime: Date = new Date()
    ): Promise<{
        likely_actions: string[];
        confidence: number;
        recommended_tasks: string[];
    }> {
        const profile = await this.getUserProfile(userId);
        if (!profile) {
            return {
                likely_actions: [],
                confidence: 0,
                recommended_tasks: []
            };
        }

        const currentHour = currentTime.getHours();
        const currentDay = currentTime.getDay();

        const likelyActions: string[] = [];
        const recommendedTasks: string[] = [];
        let totalConfidence = 0;

        // Analyze activity patterns for current time
        for (const pattern of profile.activity_patterns) {
            const hourProbability = pattern.time_distribution[currentHour] || 0;
            const dayProbability = pattern.day_distribution[currentDay] || 0;
            
            const combinedProbability = (hourProbability + dayProbability) / 2;
            
            if (combinedProbability > 0.1) { // 10% threshold
                likelyActions.push(pattern.action_type);
                totalConfidence += combinedProbability;

                // Add correlated tasks
                for (const correlation of pattern.correlation_with_tasks) {
                    if (correlation.correlation_strength > 0.3 && correlation.success_rate > 0.7) {
                        recommendedTasks.push(correlation.task_type);
                    }
                }
            }
        }

        // Check if current hour is a peak hour
        const isPeakHour = profile.peak_hours.includes(currentHour);
        if (isPeakHour) {
            totalConfidence *= 1.5; // Boost confidence during peak hours
            recommendedTasks.push(...profile.preferred_task_types.slice(0, 3));
        }

        return {
            likely_actions: [...new Set(likelyActions)],
            confidence: Math.min(0.95, totalConfidence),
            recommended_tasks: [...new Set(recommendedTasks)]
        };
    }

    /**
     * Generate user behavior patterns for rule creation
     */
    async generateBehaviorPatterns(userId: string = 'default'): Promise<ActivityPattern[]> {
        const profile = await this.getUserProfile(userId);
        if (!profile) return [];

        const patterns: ActivityPattern[] = [];

        // Convert user behavior patterns to activity patterns
        for (const activityPattern of profile.activity_patterns) {
            // Find peak time windows for this activity
            const peakHours = Object.entries(activityPattern.time_distribution)
                .filter(([_, probability]) => probability > 0.2)
                .map(([hour, _]) => parseInt(hour))
                .sort((a, b) => a - b);

            if (peakHours.length > 0) {
                const patternData = {
                    frequency: activityPattern.frequency,
                    time_windows: peakHours.map(hour => ({
                        start_hour: hour,
                        end_hour: hour + 1
                    })),
                    task_types: activityPattern.correlation_with_tasks
                        .filter(tc => tc.correlation_strength > 0.3)
                        .map(tc => tc.task_type),
                    user_actions: [activityPattern.action_type]
                };

                // Calculate confidence based on consistency and frequency
                const maxProbability = Math.max(...Object.values(activityPattern.time_distribution));
                const confidence = Math.min(0.9, maxProbability * activityPattern.frequency / 10);

                if (confidence >= this.config.min_confidence_threshold) {
                    patterns.push({
                        pattern_type: 'user_behavior',
                        pattern_data: JSON.stringify(patternData),
                        confidence_score: confidence,
                        detection_count: Math.floor(activityPattern.frequency),
                        is_active: true
                    });
                }
            }
        }

        return patterns;
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
