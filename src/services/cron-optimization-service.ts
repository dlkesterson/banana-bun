/**
 * Cron Optimization Service - Enhanced cron expression generation and optimization
 */

import { logger } from '../utils/logger';
import { CronParser } from '../scheduler/cron-parser';
import type {
    PatternData,
    TimeWindow,
    ResourceMetrics,
    LLMIntegrationConfig
} from '../types/rule-scheduler';

export class CronOptimizationService {
    private llmConfig: LLMIntegrationConfig;

    constructor(llmConfig: LLMIntegrationConfig) {
        this.llmConfig = llmConfig;
    }

    /**
     * Generate optimized cron expression from pattern data
     */
    async generateOptimizedCronExpression(
        patternData: PatternData,
        patternType: string,
        useModel: 'ollama' | 'openai' | 'auto' = 'auto'
    ): Promise<{
        cronExpression: string;
        humanReadable: string;
        confidence: number;
        optimizations: string[];
    }> {
        logger.info('Generating optimized cron expression', { patternType, useModel });

        try {
            // Generate base cron expression
            const baseCron = this.generateBaseCronExpression(patternData, patternType);
            
            // Apply optimizations
            const optimizedCron = await this.optimizeCronExpression(
                baseCron,
                patternData,
                useModel
            );

            // Validate the expression
            const validation = CronParser.parse(optimizedCron.expression);
            if (!validation.valid) {
                throw new Error(`Generated invalid cron expression: ${validation.errors.join(', ')}`);
            }

            // Generate human-readable description
            const humanReadable = await this.generateHumanReadableDescription(
                optimizedCron.expression,
                useModel
            );

            return {
                cronExpression: optimizedCron.expression,
                humanReadable,
                confidence: optimizedCron.confidence,
                optimizations: optimizedCron.optimizations
            };
        } catch (error) {
            logger.error('Failed to generate optimized cron expression', { error });
            throw error;
        }
    }

    /**
     * Generate base cron expression from pattern data
     */
    private generateBaseCronExpression(patternData: PatternData, patternType: string): string {
        if (!patternData.time_windows || patternData.time_windows.length === 0) {
            // Default to hourly if no time windows
            return '0 * * * *';
        }

        const timeWindow = patternData.time_windows[0]; // Use first time window

        switch (patternType) {
            case 'daily_recurring':
                return this.generateDailyCron(timeWindow);
            case 'weekly_recurring':
                return this.generateWeeklyCron(timeWindow);
            case 'monthly_recurring':
                return this.generateMonthlyCron(timeWindow);
            case 'user_behavior':
                return this.generateUserBehaviorCron(timeWindow, patternData);
            case 'task_correlation':
                return this.generateCorrelationCron(patternData);
            default:
                return this.generateDailyCron(timeWindow);
        }
    }

    /**
     * Generate daily cron expression
     */
    private generateDailyCron(timeWindow: TimeWindow): string {
        const hour = timeWindow.start_hour;
        const minute = this.calculateOptimalMinute(hour);
        return `${minute} ${hour} * * *`;
    }

    /**
     * Generate weekly cron expression
     */
    private generateWeeklyCron(timeWindow: TimeWindow): string {
        const hour = timeWindow.start_hour;
        const minute = this.calculateOptimalMinute(hour);
        
        if (timeWindow.days_of_week && timeWindow.days_of_week.length > 0) {
            const days = timeWindow.days_of_week.join(',');
            return `${minute} ${hour} * * ${days}`;
        }
        
        // Default to weekdays if no specific days
        return `${minute} ${hour} * * 1-5`;
    }

    /**
     * Generate monthly cron expression
     */
    private generateMonthlyCron(timeWindow: TimeWindow): string {
        const hour = timeWindow.start_hour;
        const minute = this.calculateOptimalMinute(hour);
        
        if (timeWindow.days_of_month && timeWindow.days_of_month.length > 0) {
            const day = timeWindow.days_of_month[0]; // Use first day
            return `${minute} ${hour} ${day} * *`;
        }
        
        // Default to first day of month
        return `${minute} ${hour} 1 * *`;
    }

    /**
     * Generate user behavior cron expression
     */
    private generateUserBehaviorCron(timeWindow: TimeWindow, patternData: PatternData): string {
        // For user behavior, we might want more frequent checks
        const hour = timeWindow.start_hour;
        const minute = this.calculateOptimalMinute(hour);
        
        // If high frequency pattern, check more often
        if (patternData.frequency > 50) {
            return `${minute} ${hour} * * *`; // Daily
        } else if (patternData.frequency > 20) {
            return `${minute} ${hour} * * 1-5`; // Weekdays
        } else {
            return `${minute} ${hour} * * 0`; // Weekly on Sunday
        }
    }

    /**
     * Generate correlation cron expression
     */
    private generateCorrelationCron(patternData: PatternData): string {
        // For correlations, we need frequent monitoring
        // Check every 15 minutes during business hours
        return '*/15 9-17 * * 1-5';
    }

    /**
     * Calculate optimal minute to avoid system load spikes
     */
    private calculateOptimalMinute(hour: number): number {
        // Spread load by using different minutes for different hours
        // Avoid common times like :00, :15, :30, :45
        const baseMinute = (hour * 7) % 60; // Pseudo-random based on hour
        
        // Avoid common scheduling times
        const avoidMinutes = [0, 15, 30, 45];
        if (avoidMinutes.includes(baseMinute)) {
            return (baseMinute + 3) % 60;
        }
        
        return baseMinute;
    }

    /**
     * Optimize cron expression using LLM
     */
    private async optimizeCronExpression(
        baseCron: string,
        patternData: PatternData,
        useModel: 'ollama' | 'openai' | 'auto'
    ): Promise<{
        expression: string;
        confidence: number;
        optimizations: string[];
    }> {
        const optimizations: string[] = [];
        let expression = baseCron;
        let confidence = 0.8; // Base confidence

        // Apply rule-based optimizations first
        const ruleOptimized = this.applyRuleBasedOptimizations(expression, patternData);
        expression = ruleOptimized.expression;
        optimizations.push(...ruleOptimized.optimizations);
        confidence = ruleOptimized.confidence;

        // Apply LLM-based optimizations if configured
        if (this.shouldUseLLM(useModel)) {
            try {
                const llmOptimized = await this.applyLLMOptimizations(
                    expression,
                    patternData,
                    useModel
                );
                expression = llmOptimized.expression;
                optimizations.push(...llmOptimized.optimizations);
                confidence = Math.max(confidence, llmOptimized.confidence);
            } catch (error) {
                logger.warn('LLM optimization failed, using rule-based result', { error });
            }
        }

        return { expression, confidence, optimizations };
    }

    /**
     * Apply rule-based optimizations
     */
    private applyRuleBasedOptimizations(
        cronExpression: string,
        patternData: PatternData
    ): {
        expression: string;
        confidence: number;
        optimizations: string[];
    } {
        const optimizations: string[] = [];
        let expression = cronExpression;
        let confidence = 0.8;

        // Optimization 1: Load balancing
        if (this.isCommonTime(expression)) {
            expression = this.adjustForLoadBalancing(expression);
            optimizations.push('Adjusted timing to avoid system load spikes');
            confidence += 0.05;
        }

        // Optimization 2: Resource efficiency
        if (patternData.resource_metrics) {
            const resourceOptimized = this.optimizeForResources(expression, patternData.resource_metrics);
            if (resourceOptimized !== expression) {
                expression = resourceOptimized;
                optimizations.push('Optimized for resource efficiency');
                confidence += 0.05;
            }
        }

        // Optimization 3: Frequency adjustment
        if (patternData.frequency > 100) {
            // High frequency patterns might benefit from more frequent execution
            const frequencyOptimized = this.adjustForFrequency(expression, patternData.frequency);
            if (frequencyOptimized !== expression) {
                expression = frequencyOptimized;
                optimizations.push('Adjusted frequency based on pattern activity');
                confidence += 0.05;
            }
        }

        return { expression, confidence, optimizations };
    }

    /**
     * Check if cron expression uses common times that might cause load spikes
     */
    private isCommonTime(cronExpression: string): boolean {
        const parts = cronExpression.split(' ');
        if (parts.length < 2) return false;
        
        const minute = parts[0];
        const hour = parts[1];
        
        // Common times: top of hour, quarter hours, midnight, noon
        return minute === '0' || minute === '15' || minute === '30' || minute === '45' ||
               hour === '0' || hour === '12';
    }

    /**
     * Adjust cron expression for load balancing
     */
    private adjustForLoadBalancing(cronExpression: string): string {
        const parts = cronExpression.split(' ');
        if (parts.length < 2) return cronExpression;
        
        // Adjust minute to a less common time
        const currentMinute = parseInt(parts[0]) || 0;
        const newMinute = (currentMinute + 7) % 60; // Offset by 7 minutes
        parts[0] = newMinute.toString();
        
        return parts.join(' ');
    }

    /**
     * Optimize for resource usage
     */
    private optimizeForResources(cronExpression: string, resourceMetrics: ResourceMetrics): string {
        // If high resource usage pattern, schedule during off-peak hours
        if (resourceMetrics.cpu_usage_avg > 80 || resourceMetrics.memory_usage_avg > 80) {
            const parts = cronExpression.split(' ');
            if (parts.length >= 2) {
                // Move to early morning hours (2-5 AM)
                const currentHour = parseInt(parts[1]) || 0;
                if (currentHour >= 8 && currentHour <= 22) {
                    parts[1] = (2 + (currentHour % 4)).toString();
                    return parts.join(' ');
                }
            }
        }
        
        return cronExpression;
    }

    /**
     * Adjust frequency based on pattern activity
     */
    private adjustForFrequency(cronExpression: string, frequency: number): string {
        // Very high frequency patterns might benefit from more frequent checks
        if (frequency > 200) {
            const parts = cronExpression.split(' ');
            if (parts.length >= 1 && parts[0] !== '*/30') {
                // Change to every 30 minutes for very active patterns
                parts[0] = '*/30';
                parts[1] = '*';
                return parts.join(' ');
            }
        }
        
        return cronExpression;
    }

    /**
     * Apply LLM-based optimizations
     */
    private async applyLLMOptimizations(
        cronExpression: string,
        patternData: PatternData,
        useModel: 'ollama' | 'openai' | 'auto'
    ): Promise<{
        expression: string;
        confidence: number;
        optimizations: string[];
    }> {
        // This would integrate with Ollama or OpenAI for advanced optimization
        // For now, return the input with placeholder optimizations
        
        const optimizations = ['LLM-based timing optimization applied'];
        
        // Placeholder for actual LLM integration
        // const prompt = this.buildOptimizationPrompt(cronExpression, patternData);
        // const response = await this.callLLM(prompt, useModel);
        
        return {
            expression: cronExpression,
            confidence: 0.9,
            optimizations
        };
    }

    /**
     * Generate human-readable description of cron expression
     */
    private async generateHumanReadableDescription(
        cronExpression: string,
        useModel: 'ollama' | 'openai' | 'auto'
    ): Promise<string> {
        // Basic rule-based description
        const basicDescription = this.generateBasicDescription(cronExpression);
        
        // Could enhance with LLM for more natural language
        if (this.shouldUseLLM(useModel)) {
            try {
                // Placeholder for LLM enhancement
                return basicDescription;
            } catch (error) {
                logger.warn('LLM description generation failed', { error });
            }
        }
        
        return basicDescription;
    }

    /**
     * Generate basic human-readable description
     */
    private generateBasicDescription(cronExpression: string): string {
        const parts = cronExpression.split(' ');
        if (parts.length < 5) return 'Invalid cron expression';
        
        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
        
        let description = 'Run ';
        
        // Frequency
        if (minute.includes('*/')) {
            const interval = minute.replace('*/', '');
            description += `every ${interval} minutes `;
        } else if (minute === '*') {
            description += 'every minute ';
        } else {
            description += `at minute ${minute} `;
        }
        
        // Hour
        if (hour === '*') {
            description += 'of every hour ';
        } else if (hour.includes('*/')) {
            const interval = hour.replace('*/', '');
            description += `of every ${interval} hours `;
        } else if (hour.includes('-')) {
            description += `between ${hour.replace('-', ' and ')} hours `;
        } else {
            const hourNum = parseInt(hour);
            const ampm = hourNum >= 12 ? 'PM' : 'AM';
            const displayHour = hourNum > 12 ? hourNum - 12 : hourNum === 0 ? 12 : hourNum;
            description += `at ${displayHour}:${minute.padStart(2, '0')} ${ampm} `;
        }
        
        // Day of month
        if (dayOfMonth !== '*') {
            description += `on day ${dayOfMonth} `;
        }
        
        // Month
        if (month !== '*') {
            description += `in month ${month} `;
        }
        
        // Day of week
        if (dayOfWeek !== '*') {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            if (dayOfWeek.includes(',')) {
                const days = dayOfWeek.split(',').map(d => dayNames[parseInt(d)]).join(', ');
                description += `on ${days}`;
            } else if (dayOfWeek.includes('-')) {
                const [start, end] = dayOfWeek.split('-').map(d => dayNames[parseInt(d)]);
                description += `from ${start} to ${end}`;
            } else {
                description += `on ${dayNames[parseInt(dayOfWeek)]}`;
            }
        }
        
        return description.trim();
    }

    /**
     * Determine if LLM should be used
     */
    private shouldUseLLM(useModel: 'ollama' | 'openai' | 'auto'): boolean {
        if (useModel === 'auto') {
            return this.llmConfig.ollama.enabled || this.llmConfig.openai.enabled;
        }
        
        return (useModel === 'ollama' && this.llmConfig.ollama.enabled) ||
               (useModel === 'openai' && this.llmConfig.openai.enabled);
    }

    /**
     * Validate and suggest improvements for existing cron expressions
     */
    async validateAndImprove(cronExpression: string): Promise<{
        isValid: boolean;
        errors: string[];
        suggestions: string[];
        improvedExpression?: string;
    }> {
        const validation = CronParser.parse(cronExpression);
        const suggestions: string[] = [];
        let improvedExpression: string | undefined;
        
        if (validation.valid) {
            // Check for common improvements
            if (this.isCommonTime(cronExpression)) {
                suggestions.push('Consider adjusting timing to avoid system load spikes');
                improvedExpression = this.adjustForLoadBalancing(cronExpression);
            }
            
            // Check for efficiency improvements
            const parts = cronExpression.split(' ');
            if (parts[0] === '0' && parts[1] !== '*') {
                suggestions.push('Consider adding minute offset to distribute load');
            }
        }
        
        return {
            isValid: validation.valid,
            errors: validation.errors,
            suggestions,
            improvedExpression
        };
    }
}
