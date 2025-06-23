/**
 * Predictive Scheduler Service - Schedules tasks before they're explicitly requested
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';
import { ChromaClient } from 'chromadb';
import { config } from '../config';
import type {
    PredictiveSchedule,
    ResourceRequirements,
    ActivityPattern,
    UserBehaviorProfile,
    SchedulingRule,
    PredictiveSchedulingConfig,
    LLMIntegrationConfig
} from '../types/rule-scheduler';
import type { BaseTask } from '../types/task';

export class PredictiveSchedulerService {
    private db: Database;
    private chromaClient: ChromaClient;
    private config: PredictiveSchedulingConfig;
    private llmConfig: LLMIntegrationConfig;

    constructor(
        db: Database,
        chromaClient: ChromaClient,
        config: PredictiveSchedulingConfig,
        llmConfig: LLMIntegrationConfig
    ) {
        this.db = db;
        this.chromaClient = chromaClient;
        this.config = config;
        this.llmConfig = llmConfig;
    }

    /**
     * Generate predictive schedules based on patterns and user behavior
     */
    async generatePredictiveSchedules(
        lookAheadHours: number = 24,
        useModel: 'ollama' | 'openai' | 'auto' = 'auto'
    ): Promise<PredictiveSchedule[]> {
        if (!this.config.enabled) {
            logger.info('Predictive scheduling is disabled');
            return [];
        }

        logger.info('Generating predictive schedules', { lookAheadHours, useModel });

        try {
            const currentTime = new Date();
            const endTime = new Date(currentTime.getTime() + lookAheadHours * 60 * 60 * 1000);

            // Get active patterns and rules
            const patterns = await this.getActivePatterns();
            const rules = await this.getActiveRules();
            const userBehavior = await this.getUserBehaviorProfile();

            // Generate predictions for each time slot
            const predictions: PredictiveSchedule[] = [];
            const timeSlots = this.generateTimeSlots(currentTime, endTime, 30); // 30-minute slots

            for (const timeSlot of timeSlots) {
                const slotPredictions = await this.predictTasksForTimeSlot(
                    timeSlot,
                    patterns,
                    rules,
                    userBehavior,
                    useModel
                );
                predictions.push(...slotPredictions);
            }

            // Filter by confidence threshold
            const highConfidencePredictions = predictions.filter(
                p => p.confidence_score >= this.config.prediction_confidence_threshold
            );

            // Limit predictions per hour
            const limitedPredictions = this.limitPredictionsPerHour(
                highConfidencePredictions,
                this.config.max_predictions_per_hour
            );

            // Store predictions
            const storedPredictions = await this.storePredictions(limitedPredictions);

            // Schedule high-confidence predictions if enabled
            if (this.config.resource_reservation_enabled) {
                await this.scheduleHighConfidencePredictions(storedPredictions);
            }

            logger.info('Predictive scheduling completed', {
                totalPredictions: predictions.length,
                highConfidence: highConfidencePredictions.length,
                scheduled: storedPredictions.filter(p => p.is_scheduled).length
            });

            return storedPredictions;
        } catch (error) {
            logger.error('Failed to generate predictive schedules', { error });
            throw error;
        }
    }

    /**
     * Predict tasks for a specific time slot
     */
    private async predictTasksForTimeSlot(
        timeSlot: Date,
        patterns: ActivityPattern[],
        rules: SchedulingRule[],
        userBehavior: UserBehaviorProfile | null,
        useModel: string
    ): Promise<PredictiveSchedule[]> {
        const predictions: PredictiveSchedule[] = [];
        const hour = timeSlot.getHours();
        const dayOfWeek = timeSlot.getDay();
        const dayOfMonth = timeSlot.getDate();

        // Pattern-based predictions
        for (const pattern of patterns) {
            const patternPrediction = await this.predictFromPattern(
                pattern,
                timeSlot,
                hour,
                dayOfWeek,
                dayOfMonth
            );
            if (patternPrediction) {
                predictions.push(patternPrediction);
            }
        }

        // Rule-based predictions
        for (const rule of rules) {
            const rulePrediction = await this.predictFromRule(rule, timeSlot);
            if (rulePrediction) {
                predictions.push(rulePrediction);
            }
        }

        // User behavior predictions
        if (userBehavior) {
            const behaviorPredictions = await this.predictFromUserBehavior(
                userBehavior,
                timeSlot,
                hour,
                dayOfWeek
            );
            predictions.push(...behaviorPredictions);
        }

        // LLM-enhanced predictions
        if (this.shouldUseLLM(useModel) && predictions.length > 0) {
            const enhancedPredictions = await this.enhancePredictionsWithLLM(
                predictions,
                timeSlot,
                useModel
            );
            return enhancedPredictions;
        }

        return predictions;
    }

    /**
     * Predict tasks from activity patterns
     */
    private async predictFromPattern(
        pattern: ActivityPattern,
        timeSlot: Date,
        hour: number,
        dayOfWeek: number,
        dayOfMonth: number
    ): Promise<PredictiveSchedule | null> {
        try {
            const patternData = JSON.parse(pattern.pattern_data);
            
            // Check if time slot matches pattern
            const matchesTimeWindow = this.matchesTimeWindow(
                patternData.time_windows,
                hour,
                dayOfWeek,
                dayOfMonth
            );

            if (!matchesTimeWindow) {
                return null;
            }

            // Calculate confidence based on pattern strength and recency
            const baseConfidence = pattern.confidence_score;
            const recencyBoost = this.calculateRecencyBoost(pattern.last_detected_at);
            const frequencyBoost = Math.min(0.1, pattern.detection_count / 100);
            
            const confidence = Math.min(0.95, baseConfidence + recencyBoost + frequencyBoost);

            if (confidence < this.config.prediction_confidence_threshold) {
                return null;
            }

            // Determine most likely task type
            const taskType = patternData.task_types?.[0] || 'unknown';

            // Estimate resource requirements
            const resourceRequirements = await this.estimateResourceRequirements(
                taskType,
                patternData
            );

            return {
                rule_id: 0, // Will be set when associated with a rule
                predicted_task_type: taskType,
                predicted_execution_time: timeSlot.toISOString(),
                confidence_score: confidence,
                resource_requirements: JSON.stringify(resourceRequirements),
                is_scheduled: false
            };
        } catch (error) {
            logger.warn('Failed to predict from pattern', { patternId: pattern.id, error });
            return null;
        }
    }

    /**
     * Predict tasks from scheduling rules
     */
    private async predictFromRule(
        rule: SchedulingRule,
        timeSlot: Date
    ): Promise<PredictiveSchedule | null> {
        // Check if rule would trigger at this time
        const wouldTrigger = await this.wouldRuleTrigger(rule, timeSlot);
        if (!wouldTrigger) {
            return null;
        }

        // Use rule's confidence and success rate
        const confidence = Math.min(0.95, rule.confidence_score * rule.success_rate);

        if (confidence < this.config.prediction_confidence_threshold) {
            return null;
        }

        // Extract task type from rule name or description
        const taskType = this.extractTaskTypeFromRule(rule);

        // Estimate resource requirements based on rule history
        const resourceRequirements = await this.estimateResourceRequirementsFromRule(rule);

        return {
            rule_id: rule.id!,
            predicted_task_type: taskType,
            predicted_execution_time: timeSlot.toISOString(),
            confidence_score: confidence,
            resource_requirements: JSON.stringify(resourceRequirements),
            is_scheduled: false
        };
    }

    /**
     * Predict tasks from user behavior
     */
    private async predictFromUserBehavior(
        userBehavior: UserBehaviorProfile,
        timeSlot: Date,
        hour: number,
        dayOfWeek: number
    ): Promise<PredictiveSchedule[]> {
        const predictions: PredictiveSchedule[] = [];

        for (const activityPattern of userBehavior.activity_patterns) {
            const hourProbability = activityPattern.time_distribution[hour] || 0;
            const dayProbability = activityPattern.day_distribution[dayOfWeek] || 0;
            
            const combinedProbability = (hourProbability + dayProbability) / 2;
            
            if (combinedProbability > 0.3) { // 30% threshold
                // Find correlated tasks
                for (const correlation of activityPattern.correlation_with_tasks) {
                    if (correlation.correlation_strength > 0.4 && correlation.success_rate > 0.7) {
                        const confidence = combinedProbability * correlation.correlation_strength;
                        
                        if (confidence >= this.config.prediction_confidence_threshold) {
                            const resourceRequirements = await this.estimateResourceRequirements(
                                correlation.task_type,
                                {}
                            );

                            predictions.push({
                                rule_id: 0,
                                predicted_task_type: correlation.task_type,
                                predicted_execution_time: timeSlot.toISOString(),
                                confidence_score: confidence,
                                resource_requirements: JSON.stringify(resourceRequirements),
                                is_scheduled: false
                            });
                        }
                    }
                }
            }
        }

        return predictions;
    }

    /**
     * Check if time slot matches pattern time windows
     */
    private matchesTimeWindow(
        timeWindows: any[],
        hour: number,
        dayOfWeek: number,
        dayOfMonth: number
    ): boolean {
        if (!timeWindows || timeWindows.length === 0) return false;

        return timeWindows.some(window => {
            // Check hour range
            if (hour < window.start_hour || hour >= window.end_hour) {
                return false;
            }

            // Check day of week if specified
            if (window.days_of_week && !window.days_of_week.includes(dayOfWeek)) {
                return false;
            }

            // Check day of month if specified
            if (window.days_of_month && !window.days_of_month.includes(dayOfMonth)) {
                return false;
            }

            return true;
        });
    }

    /**
     * Calculate recency boost for patterns
     */
    private calculateRecencyBoost(lastDetectedAt?: string): number {
        if (!lastDetectedAt) return 0;

        const lastDetected = new Date(lastDetectedAt);
        const now = new Date();
        const daysSince = (now.getTime() - lastDetected.getTime()) / (1000 * 60 * 60 * 24);

        // Boost recent patterns, decay older ones
        if (daysSince <= 1) return 0.1;
        if (daysSince <= 7) return 0.05;
        if (daysSince <= 30) return 0.02;
        return 0;
    }

    /**
     * Estimate resource requirements for a task type
     */
    private async estimateResourceRequirements(
        taskType: string,
        patternData: any
    ): Promise<ResourceRequirements> {
        // Get historical resource usage for this task type
        const historicalUsage = this.db.query(`
            SELECT 
                AVG(
                    CASE 
                        WHEN finished_at IS NOT NULL AND started_at IS NOT NULL 
                        THEN (julianday(finished_at) - julianday(started_at)) * 24 * 60 
                        ELSE NULL 
                    END
                ) as avg_duration_minutes
            FROM tasks 
            WHERE type = ? 
                AND finished_at IS NOT NULL 
                AND started_at IS NOT NULL
                AND created_at >= datetime('now', '-30 days')
        `).get(taskType) as any;

        const estimatedDuration = historicalUsage?.avg_duration_minutes || 15; // Default 15 minutes

        // Base resource requirements (these would be enhanced with actual monitoring data)
        return {
            estimated_duration_minutes: Math.ceil(estimatedDuration),
            cpu_requirement: this.getTaskTypeCpuRequirement(taskType),
            memory_requirement: this.getTaskTypeMemoryRequirement(taskType),
            disk_space_requirement: this.getTaskTypeDiskRequirement(taskType),
            network_bandwidth_requirement: this.getTaskTypeNetworkRequirement(taskType),
            dependencies: this.getTaskTypeDependencies(taskType)
        };
    }

    /**
     * Get CPU requirement for task type
     */
    private getTaskTypeCpuRequirement(taskType: string): number {
        const cpuMap: { [key: string]: number } = {
            'media_transcode': 80,
            'video_process': 70,
            'audio_analyze': 50,
            'transcribe': 60,
            'download': 20,
            'organize': 10,
            'backup': 30,
            'default': 25
        };
        return cpuMap[taskType] || cpuMap['default'];
    }

    /**
     * Get memory requirement for task type
     */
    private getTaskTypeMemoryRequirement(taskType: string): number {
        const memoryMap: { [key: string]: number } = {
            'media_transcode': 2048,
            'video_process': 1536,
            'audio_analyze': 512,
            'transcribe': 1024,
            'download': 256,
            'organize': 128,
            'backup': 512,
            'default': 256
        };
        return memoryMap[taskType] || memoryMap['default'];
    }

    /**
     * Get disk space requirement for task type
     */
    private getTaskTypeDiskRequirement(taskType: string): number {
        const diskMap: { [key: string]: number } = {
            'media_transcode': 5120,
            'video_process': 3072,
            'audio_analyze': 512,
            'transcribe': 1024,
            'download': 2048,
            'organize': 0,
            'backup': 1024,
            'default': 512
        };
        return diskMap[taskType] || diskMap['default'];
    }

    /**
     * Get network bandwidth requirement for task type
     */
    private getTaskTypeNetworkRequirement(taskType: string): number {
        const networkMap: { [key: string]: number } = {
            'download': 100,
            'backup': 50,
            'sync': 75,
            'upload': 80,
            'default': 10
        };
        return networkMap[taskType] || networkMap['default'];
    }

    /**
     * Get dependencies for task type
     */
    private getTaskTypeDependencies(taskType: string): string[] {
        const dependencyMap: { [key: string]: string[] } = {
            'media_transcode': ['ffmpeg', 'storage_space'],
            'video_process': ['ffmpeg', 'opencv'],
            'audio_analyze': ['ffmpeg', 'whisper'],
            'transcribe': ['whisper', 'storage_space'],
            'download': ['network', 'storage_space'],
            'organize': ['storage_space'],
            'backup': ['storage_space', 'network'],
            'default': []
        };
        return dependencyMap[taskType] || dependencyMap['default'];
    }

    /**
     * Generate time slots for prediction window
     */
    private generateTimeSlots(startTime: Date, endTime: Date, intervalMinutes: number): Date[] {
        const slots: Date[] = [];
        const current = new Date(startTime);
        
        while (current < endTime) {
            slots.push(new Date(current));
            current.setMinutes(current.getMinutes() + intervalMinutes);
        }
        
        return slots;
    }

    /**
     * Limit predictions per hour to avoid overloading
     */
    private limitPredictionsPerHour(
        predictions: PredictiveSchedule[],
        maxPerHour: number
    ): PredictiveSchedule[] {
        const hourlyGroups: { [hour: string]: PredictiveSchedule[] } = {};
        
        // Group by hour
        for (const prediction of predictions) {
            const hour = new Date(prediction.predicted_execution_time).toISOString().substring(0, 13);
            if (!hourlyGroups[hour]) {
                hourlyGroups[hour] = [];
            }
            hourlyGroups[hour].push(prediction);
        }
        
        // Limit each hour and sort by confidence
        const limited: PredictiveSchedule[] = [];
        for (const [hour, hourPredictions] of Object.entries(hourlyGroups)) {
            const sorted = hourPredictions.sort((a, b) => b.confidence_score - a.confidence_score);
            limited.push(...sorted.slice(0, maxPerHour));
        }
        
        return limited;
    }

    /**
     * Store predictions in database
     */
    private async storePredictions(predictions: PredictiveSchedule[]): Promise<PredictiveSchedule[]> {
        const stored: PredictiveSchedule[] = [];
        
        for (const prediction of predictions) {
            try {
                const result = this.db.run(`
                    INSERT INTO predictive_schedules 
                    (rule_id, predicted_task_type, predicted_execution_time, 
                     confidence_score, resource_requirements, is_scheduled)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    prediction.rule_id,
                    prediction.predicted_task_type,
                    prediction.predicted_execution_time,
                    prediction.confidence_score,
                    prediction.resource_requirements,
                    prediction.is_scheduled
                ]);
                
                stored.push({
                    ...prediction,
                    id: result.lastInsertRowid as number
                });
            } catch (error) {
                logger.error('Failed to store prediction', { prediction, error });
            }
        }
        
        return stored;
    }

    /**
     * Schedule high-confidence predictions
     */
    private async scheduleHighConfidencePredictions(
        predictions: PredictiveSchedule[]
    ): Promise<void> {
        const highConfidence = predictions.filter(p => p.confidence_score >= 0.9);
        
        for (const prediction of highConfidence) {
            try {
                // Create a predictive task (this would integrate with the existing task system)
                await this.createPredictiveTask(prediction);
                
                // Mark as scheduled
                if (prediction.id) {
                    this.db.run(`
                        UPDATE predictive_schedules 
                        SET is_scheduled = TRUE 
                        WHERE id = ?
                    `, [prediction.id]);
                }
                
                logger.info('Scheduled predictive task', {
                    predictionId: prediction.id,
                    taskType: prediction.predicted_task_type,
                    confidence: prediction.confidence_score
                });
            } catch (error) {
                logger.error('Failed to schedule predictive task', { prediction, error });
            }
        }
    }

    /**
     * Create a predictive task (placeholder for integration)
     */
    private async createPredictiveTask(prediction: PredictiveSchedule): Promise<void> {
        // This would integrate with the existing task creation system
        // For now, just log the intent
        logger.info('Would create predictive task', {
            taskType: prediction.predicted_task_type,
            scheduledFor: prediction.predicted_execution_time,
            confidence: prediction.confidence_score
        });
    }

    /**
     * Helper methods for rule and pattern analysis
     */
    private async getActivePatterns(): Promise<ActivityPattern[]> {
        return this.db.query(`
            SELECT * FROM activity_patterns 
            WHERE is_active = TRUE 
                AND confidence_score >= ?
            ORDER BY confidence_score DESC
        `).all(this.config.prediction_confidence_threshold) as ActivityPattern[];
    }

    private async getActiveRules(): Promise<SchedulingRule[]> {
        return this.db.query(`
            SELECT * FROM scheduling_rules 
            WHERE is_enabled = TRUE 
                AND confidence_score >= ?
            ORDER BY priority ASC, confidence_score DESC
        `).all(this.config.prediction_confidence_threshold) as SchedulingRule[];
    }

    private async getUserBehaviorProfile(): Promise<UserBehaviorProfile | null> {
        const profile = this.db.query(`
            SELECT * FROM user_behavior_profiles 
            WHERE user_id = 'default'
            ORDER BY last_updated DESC 
            LIMIT 1
        `).get() as any;

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

    private async wouldRuleTrigger(rule: SchedulingRule, timeSlot: Date): Promise<boolean> {
        // This would use the existing CronParser to check if the rule would trigger
        // For now, simplified logic
        return Math.random() > 0.7; // Placeholder
    }

    private extractTaskTypeFromRule(rule: SchedulingRule): string {
        // Extract task type from rule name or description
        const text = (rule.rule_name + ' ' + (rule.description || '')).toLowerCase();
        
        if (text.includes('backup')) return 'backup';
        if (text.includes('transcode') || text.includes('convert')) return 'media_transcode';
        if (text.includes('download')) return 'download';
        if (text.includes('organize')) return 'organize';
        if (text.includes('transcribe')) return 'transcribe';
        if (text.includes('analyze')) return 'audio_analyze';
        
        return 'unknown';
    }

    private async estimateResourceRequirementsFromRule(rule: SchedulingRule): Promise<ResourceRequirements> {
        const taskType = this.extractTaskTypeFromRule(rule);
        return this.estimateResourceRequirements(taskType, {});
    }

    private shouldUseLLM(useModel: string): boolean {
        if (useModel === 'auto') {
            return this.llmConfig.ollama.enabled || this.llmConfig.openai.enabled;
        }
        return (useModel === 'ollama' && this.llmConfig.ollama.enabled) ||
               (useModel === 'openai' && this.llmConfig.openai.enabled);
    }

    private async enhancePredictionsWithLLM(
        predictions: PredictiveSchedule[],
        timeSlot: Date,
        useModel: string
    ): Promise<PredictiveSchedule[]> {
        // Placeholder for LLM enhancement
        // Would use Ollama/OpenAI to refine predictions
        return predictions;
    }
}
