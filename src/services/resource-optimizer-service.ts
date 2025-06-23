/**
 * Resource Optimizer Service - Balances task load and optimizes resource usage
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';
import { ChromaClient } from 'chromadb';
import type {
    OptimizationResult,
    OptimizationType,
    ScheduleSnapshot,
    LoadPrediction,
    ImprovementMetrics,
    ResourceMetrics,
    SchedulingRule,
    PredictiveSchedule,
    OptimizationConfig,
    LLMIntegrationConfig
} from '../types/rule-scheduler';

export class ResourceOptimizerService {
    private db: Database;
    private chromaClient: ChromaClient;
    private config: OptimizationConfig;
    private llmConfig: LLMIntegrationConfig;

    constructor(
        db: Database,
        chromaClient: ChromaClient,
        config: OptimizationConfig,
        llmConfig: LLMIntegrationConfig
    ) {
        this.db = db;
        this.chromaClient = chromaClient;
        this.config = config;
        this.llmConfig = llmConfig;
    }

    /**
     * Perform comprehensive resource optimization
     */
    async optimizeResourceSchedule(
        targetDate?: Date,
        optimizationType: OptimizationType = 'load_balancing',
        useModel: 'ollama' | 'openai' | 'auto' = 'auto'
    ): Promise<OptimizationResult> {
        if (!this.config.auto_optimization_enabled) {
            throw new Error('Resource optimization is disabled');
        }

        logger.info('Starting resource optimization', { targetDate, optimizationType, useModel });

        try {
            const target = targetDate || new Date();
            
            // Capture current schedule state
            const originalSchedule = await this.captureScheduleSnapshot(target);
            
            // Analyze current resource utilization
            const currentMetrics = await this.analyzeCurrentResourceUsage(target);
            
            // Generate load predictions
            const loadPredictions = await this.generateLoadPredictions(target, 24); // 24 hours ahead
            
            // Apply optimization strategy
            const optimizedSchedule = await this.applyOptimizationStrategy(
                originalSchedule,
                currentMetrics,
                loadPredictions,
                optimizationType,
                useModel
            );
            
            // Calculate improvement metrics
            const improvements = await this.calculateImprovements(
                originalSchedule,
                optimizedSchedule
            );
            
            // Create optimization result
            const result: OptimizationResult = {
                optimization_type: optimizationType,
                original_schedule: JSON.stringify(originalSchedule),
                optimized_schedule: JSON.stringify(optimizedSchedule),
                improvement_metrics: JSON.stringify(improvements),
                success: improvements.efficiency_gain > 0,
                applied_at: new Date().toISOString()
            };
            
            // Store optimization result
            await this.storeOptimizationResult(result);
            
            // Apply optimizations if beneficial
            if (result.success && improvements.efficiency_gain > 0.05) { // 5% minimum improvement
                await this.applyOptimizations(optimizedSchedule);
                result.applied_at = new Date().toISOString();
            }
            
            logger.info('Resource optimization completed', {
                optimizationType,
                success: result.success,
                efficiencyGain: improvements.efficiency_gain,
                applied: !!result.applied_at
            });
            
            return result;
        } catch (error) {
            logger.error('Resource optimization failed', { error });
            throw error;
        }
    }

    /**
     * Capture current schedule snapshot
     */
    private async captureScheduleSnapshot(targetDate: Date): Promise<ScheduleSnapshot> {
        const timestamp = targetDate.toISOString();
        
        // Get active scheduling rules
        const activeRules = this.db.query(`
            SELECT * FROM scheduling_rules 
            WHERE is_enabled = TRUE
        `).all() as SchedulingRule[];
        
        // Get current resource utilization
        const resourceUtilization = await this.getCurrentResourceMetrics();
        
        // Get predicted load for next 24 hours
        const predictedLoad = await this.getPredictedLoad(targetDate, 24);
        
        return {
            timestamp,
            active_schedules: activeRules,
            resource_utilization: resourceUtilization,
            predicted_load: predictedLoad
        };
    }

    /**
     * Analyze current resource usage patterns
     */
    private async analyzeCurrentResourceUsage(targetDate: Date): Promise<ResourceMetrics> {
        const cutoffTime = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
        
        // Get task execution metrics from last 24 hours
        const taskMetrics = this.db.query(`
            SELECT 
                COUNT(*) as total_tasks,
                AVG(
                    CASE 
                        WHEN finished_at IS NOT NULL AND started_at IS NOT NULL 
                        THEN (julianday(finished_at) - julianday(started_at)) * 24 * 60 
                        ELSE NULL 
                    END
                ) as avg_duration_minutes,
                COUNT(CASE WHEN status = 'running' THEN 1 END) as concurrent_tasks
            FROM tasks 
            WHERE created_at >= ?
        `).get(cutoffTime) as any;
        
        // Estimate resource usage based on task patterns
        // In a real implementation, this would integrate with system monitoring
        return {
            cpu_usage_avg: this.estimateCpuUsage(taskMetrics),
            memory_usage_avg: this.estimateMemoryUsage(taskMetrics),
            disk_io_avg: this.estimateDiskIO(taskMetrics),
            network_io_avg: this.estimateNetworkIO(taskMetrics),
            concurrent_tasks_avg: taskMetrics.concurrent_tasks || 0
        };
    }

    /**
     * Generate load predictions for optimization window
     */
    private async generateLoadPredictions(
        startTime: Date,
        hoursAhead: number
    ): Promise<LoadPrediction[]> {
        const predictions: LoadPrediction[] = [];
        const endTime = new Date(startTime.getTime() + hoursAhead * 60 * 60 * 1000);
        
        // Generate hourly predictions
        const current = new Date(startTime);
        while (current < endTime) {
            const hourStart = new Date(current);
            const hourEnd = new Date(current.getTime() + 60 * 60 * 1000);
            
            // Get scheduled tasks for this hour
            const scheduledTasks = await this.getScheduledTasksForHour(hourStart, hourEnd);
            
            // Get predictive schedules for this hour
            const predictiveTasks = await this.getPredictiveTasksForHour(hourStart, hourEnd);
            
            // Calculate predicted resource usage
            const predictedResourceUsage = await this.calculatePredictedResourceUsage(
                scheduledTasks,
                predictiveTasks
            );
            
            predictions.push({
                time_slot: hourStart.toISOString(),
                predicted_tasks: scheduledTasks.length + predictiveTasks.length,
                predicted_resource_usage: predictedResourceUsage,
                confidence: this.calculatePredictionConfidence(scheduledTasks, predictiveTasks)
            });
            
            current.setHours(current.getHours() + 1);
        }
        
        return predictions;
    }

    /**
     * Apply optimization strategy
     */
    private async applyOptimizationStrategy(
        originalSchedule: ScheduleSnapshot,
        currentMetrics: ResourceMetrics,
        loadPredictions: LoadPrediction[],
        optimizationType: OptimizationType,
        useModel: string
    ): Promise<ScheduleSnapshot> {
        let optimizedSchedule = { ...originalSchedule };
        
        switch (optimizationType) {
            case 'load_balancing':
                optimizedSchedule = await this.applyLoadBalancing(
                    optimizedSchedule,
                    loadPredictions
                );
                break;
                
            case 'resource_optimization':
                optimizedSchedule = await this.applyResourceOptimization(
                    optimizedSchedule,
                    currentMetrics
                );
                break;
                
            case 'conflict_resolution':
                optimizedSchedule = await this.applyConflictResolution(
                    optimizedSchedule
                );
                break;
                
            case 'peak_mitigation':
                optimizedSchedule = await this.applyPeakMitigation(
                    optimizedSchedule,
                    loadPredictions
                );
                break;
                
            case 'efficiency_improvement':
                optimizedSchedule = await this.applyEfficiencyImprovement(
                    optimizedSchedule,
                    currentMetrics
                );
                break;
        }
        
        // Enhance with LLM if available
        if (this.shouldUseLLM(useModel)) {
            optimizedSchedule = await this.enhanceWithLLM(
                optimizedSchedule,
                originalSchedule,
                optimizationType,
                useModel
            );
        }
        
        return optimizedSchedule;
    }

    /**
     * Apply load balancing optimization
     */
    private async applyLoadBalancing(
        schedule: ScheduleSnapshot,
        loadPredictions: LoadPrediction[]
    ): Promise<ScheduleSnapshot> {
        const optimized = { ...schedule };
        
        // Find peak load periods
        const peakThreshold = this.config.load_balancing_threshold;
        const peakPeriods = loadPredictions.filter(p => 
            p.predicted_resource_usage.cpu_usage_avg > peakThreshold * 100
        );
        
        if (peakPeriods.length === 0) {
            return optimized; // No optimization needed
        }
        
        // Redistribute tasks from peak periods to off-peak periods
        const redistributedRules: SchedulingRule[] = [];
        
        for (const rule of optimized.active_schedules) {
            const optimizedRule = await this.redistributeRuleLoad(rule, loadPredictions);
            redistributedRules.push(optimizedRule);
        }
        
        optimized.active_schedules = redistributedRules;
        optimized.timestamp = new Date().toISOString();
        
        return optimized;
    }

    /**
     * Apply resource optimization
     */
    private async applyResourceOptimization(
        schedule: ScheduleSnapshot,
        currentMetrics: ResourceMetrics
    ): Promise<ScheduleSnapshot> {
        const optimized = { ...schedule };
        
        // Identify resource-intensive rules
        const resourceIntensiveRules = optimized.active_schedules.filter(rule => 
            this.isResourceIntensive(rule)
        );
        
        // Optimize resource-intensive rules
        const optimizedRules: SchedulingRule[] = [];
        
        for (const rule of optimized.active_schedules) {
            if (this.isResourceIntensive(rule)) {
                const optimizedRule = await this.optimizeRuleForResources(rule, currentMetrics);
                optimizedRules.push(optimizedRule);
            } else {
                optimizedRules.push(rule);
            }
        }
        
        optimized.active_schedules = optimizedRules;
        optimized.timestamp = new Date().toISOString();
        
        return optimized;
    }

    /**
     * Apply peak mitigation
     */
    private async applyPeakMitigation(
        schedule: ScheduleSnapshot,
        loadPredictions: LoadPrediction[]
    ): Promise<ScheduleSnapshot> {
        const optimized = { ...schedule };
        const peakThreshold = this.config.peak_mitigation_threshold;
        
        // Find predicted peaks
        const peaks = loadPredictions.filter(p => 
            p.predicted_resource_usage.cpu_usage_avg > peakThreshold * 100 ||
            p.predicted_resource_usage.memory_usage_avg > peakThreshold * 100
        );
        
        if (peaks.length === 0) {
            return optimized;
        }
        
        // Stagger tasks during peak periods
        const staggeredRules: SchedulingRule[] = [];
        
        for (const rule of optimized.active_schedules) {
            const staggeredRule = await this.staggerRuleExecution(rule, peaks);
            staggeredRules.push(staggeredRule);
        }
        
        optimized.active_schedules = staggeredRules;
        optimized.timestamp = new Date().toISOString();
        
        return optimized;
    }

    /**
     * Calculate improvement metrics
     */
    private async calculateImprovements(
        original: ScheduleSnapshot,
        optimized: ScheduleSnapshot
    ): Promise<ImprovementMetrics> {
        // Calculate resource utilization improvement
        const originalUtilization = this.calculateAverageUtilization(original.resource_utilization);
        const optimizedUtilization = this.calculateAverageUtilization(optimized.resource_utilization);
        const utilizationImprovement = (originalUtilization - optimizedUtilization) / originalUtilization;
        
        // Calculate peak load reduction
        const originalPeakLoad = this.calculatePeakLoad(original.predicted_load);
        const optimizedPeakLoad = this.calculatePeakLoad(optimized.predicted_load);
        const peakReduction = (originalPeakLoad - optimizedPeakLoad) / originalPeakLoad;
        
        // Calculate conflict reduction
        const originalConflicts = await this.countScheduleConflicts(original.active_schedules);
        const optimizedConflicts = await this.countScheduleConflicts(optimized.active_schedules);
        const conflictReduction = originalConflicts > 0 ? 
            (originalConflicts - optimizedConflicts) / originalConflicts : 0;
        
        // Calculate overall efficiency gain
        const efficiencyGain = (utilizationImprovement + peakReduction + conflictReduction) / 3;
        
        // Estimate time savings
        const timeSavings = this.estimateTimeSavings(original, optimized);
        
        return {
            resource_utilization_improvement: utilizationImprovement,
            peak_load_reduction: peakReduction,
            conflict_reduction: conflictReduction,
            efficiency_gain: efficiencyGain,
            estimated_time_savings_minutes: timeSavings
        };
    }

    /**
     * Helper methods for resource estimation
     */
    private estimateCpuUsage(taskMetrics: any): number {
        // Estimate CPU usage based on task count and types
        const baseCpu = Math.min(80, (taskMetrics.total_tasks || 0) * 5);
        return baseCpu + Math.random() * 10; // Add some variance
    }

    private estimateMemoryUsage(taskMetrics: any): number {
        // Estimate memory usage based on concurrent tasks
        const baseMemory = Math.min(85, (taskMetrics.concurrent_tasks || 0) * 15);
        return baseMemory + Math.random() * 10;
    }

    private estimateDiskIO(taskMetrics: any): number {
        // Estimate disk I/O based on task duration
        const avgDuration = taskMetrics.avg_duration_minutes || 0;
        return Math.min(70, avgDuration * 2) + Math.random() * 15;
    }

    private estimateNetworkIO(taskMetrics: any): number {
        // Estimate network I/O (generally lower for local tasks)
        return Math.random() * 30 + 10;
    }

    private async getCurrentResourceMetrics(): Promise<ResourceMetrics> {
        // In a real implementation, this would query actual system metrics
        return {
            cpu_usage_avg: 45 + Math.random() * 30,
            memory_usage_avg: 60 + Math.random() * 25,
            disk_io_avg: 35 + Math.random() * 40,
            network_io_avg: 20 + Math.random() * 30,
            concurrent_tasks_avg: Math.floor(Math.random() * 5) + 1
        };
    }

    private async getPredictedLoad(startTime: Date, hoursAhead: number): Promise<LoadPrediction[]> {
        // Get predictive schedules for the time window
        const endTime = new Date(startTime.getTime() + hoursAhead * 60 * 60 * 1000);
        
        const predictions = this.db.query(`
            SELECT * FROM predictive_schedules 
            WHERE predicted_execution_time BETWEEN ? AND ?
            ORDER BY predicted_execution_time
        `).all(startTime.toISOString(), endTime.toISOString()) as PredictiveSchedule[];
        
        // Group by hour and calculate load
        const hourlyLoad: { [hour: string]: LoadPrediction } = {};
        
        for (const prediction of predictions) {
            const hour = new Date(prediction.predicted_execution_time).toISOString().substring(0, 13);
            
            if (!hourlyLoad[hour]) {
                hourlyLoad[hour] = {
                    time_slot: hour + ':00:00.000Z',
                    predicted_tasks: 0,
                    predicted_resource_usage: {
                        cpu_usage_avg: 0,
                        memory_usage_avg: 0,
                        disk_io_avg: 0,
                        network_io_avg: 0,
                        concurrent_tasks_avg: 0
                    },
                    confidence: 0
                };
            }
            
            hourlyLoad[hour].predicted_tasks++;
            
            // Add resource requirements
            try {
                const requirements = JSON.parse(prediction.resource_requirements || '{}');
                hourlyLoad[hour].predicted_resource_usage.cpu_usage_avg += requirements.cpu_requirement || 0;
                hourlyLoad[hour].predicted_resource_usage.memory_usage_avg += requirements.memory_requirement || 0;
            } catch (error) {
                // Ignore parsing errors
            }
            
            hourlyLoad[hour].confidence = Math.max(
                hourlyLoad[hour].confidence,
                prediction.confidence_score
            );
        }
        
        return Object.values(hourlyLoad);
    }

    private async getScheduledTasksForHour(startTime: Date, endTime: Date): Promise<any[]> {
        // This would integrate with the existing task scheduler
        // For now, return empty array
        return [];
    }

    private async getPredictiveTasksForHour(startTime: Date, endTime: Date): Promise<PredictiveSchedule[]> {
        return this.db.query(`
            SELECT * FROM predictive_schedules 
            WHERE predicted_execution_time BETWEEN ? AND ?
        `).all(startTime.toISOString(), endTime.toISOString()) as PredictiveSchedule[];
    }

    private async calculatePredictedResourceUsage(
        scheduledTasks: any[],
        predictiveTasks: PredictiveSchedule[]
    ): Promise<ResourceMetrics> {
        let totalCpu = 0;
        let totalMemory = 0;
        let totalDisk = 0;
        let totalNetwork = 0;
        let taskCount = scheduledTasks.length + predictiveTasks.length;
        
        // Add predictive task resource requirements
        for (const task of predictiveTasks) {
            try {
                const requirements = JSON.parse(task.resource_requirements || '{}');
                totalCpu += requirements.cpu_requirement || 0;
                totalMemory += requirements.memory_requirement || 0;
                totalDisk += requirements.disk_space_requirement || 0;
                totalNetwork += requirements.network_bandwidth_requirement || 0;
            } catch (error) {
                // Ignore parsing errors
            }
        }
        
        return {
            cpu_usage_avg: taskCount > 0 ? totalCpu / taskCount : 0,
            memory_usage_avg: taskCount > 0 ? totalMemory / taskCount : 0,
            disk_io_avg: taskCount > 0 ? totalDisk / taskCount : 0,
            network_io_avg: taskCount > 0 ? totalNetwork / taskCount : 0,
            concurrent_tasks_avg: taskCount
        };
    }

    private calculatePredictionConfidence(
        scheduledTasks: any[],
        predictiveTasks: PredictiveSchedule[]
    ): number {
        if (predictiveTasks.length === 0) return 1.0; // High confidence for scheduled tasks
        
        const avgConfidence = predictiveTasks.reduce(
            (sum, task) => sum + task.confidence_score, 0
        ) / predictiveTasks.length;
        
        // Weight by ratio of scheduled vs predictive tasks
        const scheduledRatio = scheduledTasks.length / (scheduledTasks.length + predictiveTasks.length);
        
        return scheduledRatio + (1 - scheduledRatio) * avgConfidence;
    }

    private calculateAverageUtilization(metrics: ResourceMetrics): number {
        return (metrics.cpu_usage_avg + metrics.memory_usage_avg + metrics.disk_io_avg) / 3;
    }

    private calculatePeakLoad(predictions: LoadPrediction[]): number {
        if (predictions.length === 0) return 0;
        
        return Math.max(...predictions.map(p => 
            this.calculateAverageUtilization(p.predicted_resource_usage)
        ));
    }

    private async countScheduleConflicts(rules: SchedulingRule[]): Promise<number> {
        // Simple conflict detection - same cron expression
        const cronExpressions = rules.map(r => r.cron_expression);
        const unique = new Set(cronExpressions);
        return cronExpressions.length - unique.size;
    }

    private estimateTimeSavings(original: ScheduleSnapshot, optimized: ScheduleSnapshot): number {
        // Estimate time savings based on efficiency improvements
        const originalTasks = original.predicted_load.reduce((sum, p) => sum + p.predicted_tasks, 0);
        const avgTaskDuration = 15; // minutes
        const efficiencyImprovement = 0.1; // 10% improvement estimate
        
        return originalTasks * avgTaskDuration * efficiencyImprovement;
    }

    private async redistributeRuleLoad(
        rule: SchedulingRule,
        loadPredictions: LoadPrediction[]
    ): Promise<SchedulingRule> {
        // For now, return the rule unchanged
        // In a full implementation, this would adjust cron expressions
        return rule;
    }

    private isResourceIntensive(rule: SchedulingRule): boolean {
        const intensiveKeywords = ['transcode', 'process', 'analyze', 'backup'];
        const text = (rule.rule_name + ' ' + (rule.description || '')).toLowerCase();
        return intensiveKeywords.some(keyword => text.includes(keyword));
    }

    private async optimizeRuleForResources(
        rule: SchedulingRule,
        currentMetrics: ResourceMetrics
    ): Promise<SchedulingRule> {
        // For now, return the rule unchanged
        // In a full implementation, this would adjust timing for resource efficiency
        return rule;
    }

    private async staggerRuleExecution(
        rule: SchedulingRule,
        peaks: LoadPrediction[]
    ): Promise<SchedulingRule> {
        // For now, return the rule unchanged
        // In a full implementation, this would stagger execution times
        return rule;
    }

    private async applyConflictResolution(schedule: ScheduleSnapshot): Promise<ScheduleSnapshot> {
        // For now, return unchanged
        return schedule;
    }

    private async applyEfficiencyImprovement(
        schedule: ScheduleSnapshot,
        currentMetrics: ResourceMetrics
    ): Promise<ScheduleSnapshot> {
        // For now, return unchanged
        return schedule;
    }

    private shouldUseLLM(useModel: string): boolean {
        if (useModel === 'auto') {
            return this.llmConfig.ollama.enabled || this.llmConfig.openai.enabled;
        }
        return (useModel === 'ollama' && this.llmConfig.ollama.enabled) ||
               (useModel === 'openai' && this.llmConfig.openai.enabled);
    }

    private async enhanceWithLLM(
        optimized: ScheduleSnapshot,
        original: ScheduleSnapshot,
        optimizationType: OptimizationType,
        useModel: string
    ): Promise<ScheduleSnapshot> {
        // Placeholder for LLM enhancement
        return optimized;
    }

    private async storeOptimizationResult(result: OptimizationResult): Promise<void> {
        this.db.run(`
            INSERT INTO optimization_results 
            (optimization_type, original_schedule, optimized_schedule, 
             improvement_metrics, applied_at, success, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            result.optimization_type,
            result.original_schedule,
            result.optimized_schedule,
            result.improvement_metrics,
            result.applied_at,
            result.success,
            result.error_message
        ]);
    }

    private async applyOptimizations(optimizedSchedule: ScheduleSnapshot): Promise<void> {
        // This would apply the optimizations to the actual scheduling system
        logger.info('Applying schedule optimizations', {
            rulesCount: optimizedSchedule.active_schedules.length,
            timestamp: optimizedSchedule.timestamp
        });
    }
}
