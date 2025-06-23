/**
 * Rule Generation Service - Creates and manages scheduling rules based on detected patterns
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';
import { ChromaClient } from 'chromadb';
import { config } from '../config';
import type {
    ActivityPattern,
    SchedulingRule,
    RuleAction,
    ActionData,
    RuleGenerationConfig,
    RuleGenerationResponse,
    RuleConflict,
    PatternData,
    TimeWindow
} from '../types/rule-scheduler';

export class RuleGenerationService {
    private db: Database;
    private chromaClient: ChromaClient;
    private config: RuleGenerationConfig;

    constructor(
        db: Database,
        chromaClient: ChromaClient,
        config: RuleGenerationConfig
    ) {
        this.db = db;
        this.chromaClient = chromaClient;
        this.config = config;
    }

    /**
     * Generate scheduling rules from detected patterns
     */
    async generateRulesFromPatterns(
        patternIds?: number[],
        useModel: 'ollama' | 'openai' | 'both' = 'ollama'
    ): Promise<RuleGenerationResponse> {
        logger.info('Generating scheduling rules from patterns', { patternIds, useModel });

        try {
            // Get patterns to process
            const patterns = await this.getPatterns(patternIds);
            
            if (patterns.length === 0) {
                return {
                    generated_rules: [],
                    generation_summary: {
                        total_generated: 0,
                        auto_enabled: 0,
                        requires_review: 0,
                        conflicts_detected: 0
                    },
                    conflicts: []
                };
            }

            const generatedRules: SchedulingRule[] = [];
            const conflicts: RuleConflict[] = [];

            // Generate rules for each pattern
            for (const pattern of patterns) {
                try {
                    const rules = await this.generateRulesForPattern(pattern, useModel);
                    generatedRules.push(...rules);
                } catch (error) {
                    logger.error('Failed to generate rules for pattern', { 
                        patternId: pattern.id, 
                        error 
                    });
                }
            }

            // Detect conflicts between generated rules
            const detectedConflicts = await this.detectRuleConflicts(generatedRules);
            conflicts.push(...detectedConflicts);

            // Resolve conflicts if strategy is configured
            const resolvedRules = await this.resolveConflicts(generatedRules, conflicts);

            // Store rules in database
            const storedRules = await this.storeRules(resolvedRules);

            // Generate summary
            const autoEnabled = storedRules.filter(r => r.is_enabled).length;
            const requiresReview = storedRules.filter(r => !r.is_enabled).length;

            const response: RuleGenerationResponse = {
                generated_rules: storedRules,
                generation_summary: {
                    total_generated: storedRules.length,
                    auto_enabled: autoEnabled,
                    requires_review: requiresReview,
                    conflicts_detected: conflicts.length
                },
                conflicts
            };

            logger.info('Rule generation completed', {
                totalGenerated: storedRules.length,
                autoEnabled,
                conflicts: conflicts.length
            });

            return response;
        } catch (error) {
            logger.error('Failed to generate rules from patterns', { error });
            throw error;
        }
    }

    /**
     * Get patterns for rule generation
     */
    private async getPatterns(patternIds?: number[]): Promise<ActivityPattern[]> {
        let query = `
            SELECT * FROM activity_patterns 
            WHERE is_active = TRUE 
                AND confidence_score >= ?
        `;
        const params: any[] = [this.config.min_pattern_confidence];

        if (patternIds && patternIds.length > 0) {
            query += ` AND id IN (${patternIds.map(() => '?').join(',')})`;
            params.push(...patternIds);
        }

        query += ' ORDER BY confidence_score DESC';

        return this.db.query(query).all(...params) as ActivityPattern[];
    }

    /**
     * Generate rules for a specific pattern
     */
    private async generateRulesForPattern(
        pattern: ActivityPattern,
        useModel: 'ollama' | 'openai' | 'both'
    ): Promise<SchedulingRule[]> {
        const rules: SchedulingRule[] = [];
        const patternData: PatternData = JSON.parse(pattern.pattern_data);

        // Generate different types of rules based on pattern type
        switch (pattern.pattern_type) {
            case 'daily_recurring':
                rules.push(...await this.generateDailyRules(pattern, patternData, useModel));
                break;
            case 'weekly_recurring':
                rules.push(...await this.generateWeeklyRules(pattern, patternData, useModel));
                break;
            case 'monthly_recurring':
                rules.push(...await this.generateMonthlyRules(pattern, patternData, useModel));
                break;
            case 'user_behavior':
                rules.push(...await this.generateUserBehaviorRules(pattern, patternData, useModel));
                break;
            case 'task_correlation':
                rules.push(...await this.generateCorrelationRules(pattern, patternData, useModel));
                break;
            default:
                logger.warn('Unknown pattern type for rule generation', { 
                    patternType: pattern.pattern_type 
                });
        }

        // Limit rules per pattern
        return rules.slice(0, this.config.max_rules_per_pattern);
    }

    /**
     * Generate daily recurring rules
     */
    private async generateDailyRules(
        pattern: ActivityPattern,
        patternData: PatternData,
        useModel: string
    ): Promise<SchedulingRule[]> {
        const rules: SchedulingRule[] = [];

        for (const timeWindow of patternData.time_windows) {
            // Generate cron expression for daily execution
            const cronExpression = `0 ${timeWindow.start_hour} * * *`;
            
            const rule: SchedulingRule = {
                pattern_id: pattern.id,
                rule_name: `Daily ${patternData.task_types?.[0] || 'Task'} at ${timeWindow.start_hour}:00`,
                description: `Automatically schedule ${patternData.task_types?.join(', ') || 'tasks'} daily at ${timeWindow.start_hour}:00 based on detected pattern`,
                cron_expression: cronExpression,
                priority: this.calculatePriority(pattern.confidence_score, patternData.frequency),
                is_enabled: this.shouldAutoEnable(pattern.confidence_score),
                is_auto_generated: true,
                confidence_score: pattern.confidence_score,
                trigger_count: 0,
                success_rate: 0.0,
                llm_model_used: useModel
            };

            rules.push(rule);
        }

        return rules;
    }

    /**
     * Generate weekly recurring rules
     */
    private async generateWeeklyRules(
        pattern: ActivityPattern,
        patternData: PatternData,
        useModel: string
    ): Promise<SchedulingRule[]> {
        const rules: SchedulingRule[] = [];

        for (const timeWindow of patternData.time_windows) {
            if (timeWindow.days_of_week && timeWindow.days_of_week.length > 0) {
                // Generate cron expression for weekly execution
                const daysOfWeek = timeWindow.days_of_week.join(',');
                const cronExpression = `0 ${timeWindow.start_hour} * * ${daysOfWeek}`;
                
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const dayNamesStr = timeWindow.days_of_week
                    .map(d => dayNames[d])
                    .join(', ');

                const rule: SchedulingRule = {
                    pattern_id: pattern.id,
                    rule_name: `Weekly ${patternData.task_types?.[0] || 'Task'} on ${dayNamesStr}`,
                    description: `Automatically schedule ${patternData.task_types?.join(', ') || 'tasks'} on ${dayNamesStr} at ${timeWindow.start_hour}:00`,
                    cron_expression: cronExpression,
                    priority: this.calculatePriority(pattern.confidence_score, patternData.frequency),
                    is_enabled: this.shouldAutoEnable(pattern.confidence_score),
                    is_auto_generated: true,
                    confidence_score: pattern.confidence_score,
                    trigger_count: 0,
                    success_rate: 0.0,
                    llm_model_used: useModel
                };

                rules.push(rule);
            }
        }

        return rules;
    }

    /**
     * Generate monthly recurring rules
     */
    private async generateMonthlyRules(
        pattern: ActivityPattern,
        patternData: PatternData,
        useModel: string
    ): Promise<SchedulingRule[]> {
        const rules: SchedulingRule[] = [];

        for (const timeWindow of patternData.time_windows) {
            if (timeWindow.days_of_month && timeWindow.days_of_month.length > 0) {
                for (const dayOfMonth of timeWindow.days_of_month) {
                    // Generate cron expression for monthly execution
                    const cronExpression = `0 ${timeWindow.start_hour} ${dayOfMonth} * *`;
                    
                    const rule: SchedulingRule = {
                        pattern_id: pattern.id,
                        rule_name: `Monthly ${patternData.task_types?.[0] || 'Task'} on day ${dayOfMonth}`,
                        description: `Automatically schedule ${patternData.task_types?.join(', ') || 'tasks'} on day ${dayOfMonth} of each month at ${timeWindow.start_hour}:00`,
                        cron_expression: cronExpression,
                        priority: this.calculatePriority(pattern.confidence_score, patternData.frequency),
                        is_enabled: this.shouldAutoEnable(pattern.confidence_score),
                        is_auto_generated: true,
                        confidence_score: pattern.confidence_score,
                        trigger_count: 0,
                        success_rate: 0.0,
                        llm_model_used: useModel
                    };

                    rules.push(rule);
                }
            }
        }

        return rules;
    }

    /**
     * Generate user behavior rules
     */
    private async generateUserBehaviorRules(
        pattern: ActivityPattern,
        patternData: PatternData,
        useModel: string
    ): Promise<SchedulingRule[]> {
        const rules: SchedulingRule[] = [];

        // Generate predictive rules based on user behavior
        for (const timeWindow of patternData.time_windows) {
            const cronExpression = `0 ${timeWindow.start_hour} * * *`;
            
            const rule: SchedulingRule = {
                pattern_id: pattern.id,
                rule_name: `User Behavior: ${patternData.user_actions?.[0] || 'Action'} at ${timeWindow.start_hour}:00`,
                description: `Predictively schedule based on user behavior pattern: ${patternData.user_actions?.join(', ') || 'actions'}`,
                cron_expression: cronExpression,
                priority: this.calculatePriority(pattern.confidence_score, patternData.frequency),
                is_enabled: this.shouldAutoEnable(pattern.confidence_score),
                is_auto_generated: true,
                confidence_score: pattern.confidence_score,
                trigger_count: 0,
                success_rate: 0.0,
                llm_model_used: useModel
            };

            rules.push(rule);
        }

        return rules;
    }

    /**
     * Generate correlation rules
     */
    private async generateCorrelationRules(
        pattern: ActivityPattern,
        patternData: PatternData,
        useModel: string
    ): Promise<SchedulingRule[]> {
        const rules: SchedulingRule[] = [];

        if (patternData.task_types && patternData.task_types.length >= 2) {
            // Create rule for task sequence
            const rule: SchedulingRule = {
                pattern_id: pattern.id,
                rule_name: `Task Correlation: ${patternData.task_types.join(' → ')}`,
                description: `Automatically schedule ${patternData.task_types[1]} after ${patternData.task_types[0]} based on correlation pattern`,
                cron_expression: '*/15 * * * *', // Check every 15 minutes for correlation triggers
                priority: this.calculatePriority(pattern.confidence_score, patternData.frequency),
                is_enabled: this.shouldAutoEnable(pattern.confidence_score),
                is_auto_generated: true,
                confidence_score: pattern.confidence_score,
                trigger_count: 0,
                success_rate: 0.0,
                llm_model_used: useModel
            };

            rules.push(rule);
        }

        return rules;
    }

    /**
     * Calculate rule priority based on confidence and frequency
     */
    private calculatePriority(confidence: number, frequency: number): number {
        // Higher confidence and frequency = higher priority (lower number)
        const basePriority = 100;
        const confidenceBoost = (1 - confidence) * 50; // 0-50 reduction
        const frequencyBoost = Math.min(frequency / 10, 30); // 0-30 reduction
        
        return Math.max(1, Math.round(basePriority - confidenceBoost - frequencyBoost));
    }

    /**
     * Determine if rule should be auto-enabled
     */
    private shouldAutoEnable(confidence: number): boolean {
        return this.config.auto_generation_enabled && confidence >= 0.8;
    }

    /**
     * Detect conflicts between rules
     */
    private async detectRuleConflicts(rules: SchedulingRule[]): Promise<RuleConflict[]> {
        const conflicts: RuleConflict[] = [];

        // Check for time overlap conflicts
        for (let i = 0; i < rules.length; i++) {
            for (let j = i + 1; j < rules.length; j++) {
                const rule1 = rules[i];
                const rule2 = rules[j];

                // Simple conflict detection - same cron expression
                if (rule1.cron_expression === rule2.cron_expression) {
                    conflicts.push({
                        rule_id_1: i, // Using array index for now
                        rule_id_2: j,
                        conflict_type: 'time_overlap',
                        severity: 'medium',
                        resolution_suggestion: 'Merge rules or adjust timing'
                    });
                }

                // Priority conflicts
                if (Math.abs(rule1.priority - rule2.priority) <= 5 && 
                    rule1.cron_expression === rule2.cron_expression) {
                    conflicts.push({
                        rule_id_1: i,
                        rule_id_2: j,
                        conflict_type: 'resource_contention',
                        severity: 'low',
                        resolution_suggestion: 'Adjust priorities or stagger execution'
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Resolve conflicts between rules
     */
    private async resolveConflicts(
        rules: SchedulingRule[],
        conflicts: RuleConflict[]
    ): Promise<SchedulingRule[]> {
        const resolvedRules = [...rules];

        for (const conflict of conflicts) {
            switch (this.config.conflict_resolution_strategy) {
                case 'priority':
                    // Keep higher priority rule, disable lower priority
                    const rule1 = resolvedRules[conflict.rule_id_1];
                    const rule2 = resolvedRules[conflict.rule_id_2];
                    
                    if (rule1.priority > rule2.priority) {
                        rule1.is_enabled = false;
                        rule1.description += ' (Disabled due to conflict)';
                    } else {
                        rule2.is_enabled = false;
                        rule2.description += ' (Disabled due to conflict)';
                    }
                    break;

                case 'disable_lower':
                    // Disable the rule with lower confidence
                    const r1 = resolvedRules[conflict.rule_id_1];
                    const r2 = resolvedRules[conflict.rule_id_2];
                    
                    if (r1.confidence_score < r2.confidence_score) {
                        r1.is_enabled = false;
                    } else {
                        r2.is_enabled = false;
                    }
                    break;

                case 'merge':
                    // For now, just disable one - merging would require more complex logic
                    resolvedRules[conflict.rule_id_2].is_enabled = false;
                    break;
            }
        }

        return resolvedRules;
    }

    /**
     * Store rules in database
     */
    private async storeRules(rules: SchedulingRule[]): Promise<SchedulingRule[]> {
        const storedRules: SchedulingRule[] = [];

        for (const rule of rules) {
            try {
                const result = this.db.run(`
                    INSERT INTO scheduling_rules 
                    (pattern_id, rule_name, description, cron_expression, priority, 
                     is_enabled, is_auto_generated, confidence_score, llm_model_used)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    rule.pattern_id,
                    rule.rule_name,
                    rule.description,
                    rule.cron_expression,
                    rule.priority,
                    rule.is_enabled,
                    rule.is_auto_generated,
                    rule.confidence_score,
                    rule.llm_model_used
                ]);

                const ruleId = result.lastInsertRowid as number;
                
                // TODO: Store embedding in ChromaDB
                // TODO: Index in MeiliSearch
                
                storedRules.push({
                    ...rule,
                    id: ruleId
                });

                logger.info('Rule stored successfully', { ruleId, ruleName: rule.rule_name });
            } catch (error) {
                logger.error('Failed to store rule', { rule, error });
            }
        }

        return storedRules;
    }

    /**
     * Get existing rules
     */
    async getRules(filters?: {
        enabled?: boolean;
        patternId?: number;
        minConfidence?: number;
    }): Promise<SchedulingRule[]> {
        let query = 'SELECT * FROM scheduling_rules WHERE 1=1';
        const params: any[] = [];

        if (filters?.enabled !== undefined) {
            query += ' AND is_enabled = ?';
            params.push(filters.enabled);
        }

        if (filters?.patternId) {
            query += ' AND pattern_id = ?';
            params.push(filters.patternId);
        }

        if (filters?.minConfidence) {
            query += ' AND confidence_score >= ?';
            params.push(filters.minConfidence);
        }

        query += ' ORDER BY priority ASC, confidence_score DESC';

        return this.db.query(query).all(...params) as SchedulingRule[];
    }

    /**
     * Update rule
     */
    async updateRule(ruleId: number, updates: Partial<SchedulingRule>): Promise<void> {
        const setClause = Object.keys(updates)
            .map(key => `${key} = ?`)
            .join(', ');
        
        const values = Object.values(updates);
        values.push(ruleId);

        this.db.run(`
            UPDATE scheduling_rules 
            SET ${setClause}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, values);

        logger.info('Rule updated', { ruleId, updates });
    }

    /**
     * Delete rule
     */
    async deleteRule(ruleId: number): Promise<void> {
        this.db.run('DELETE FROM scheduling_rules WHERE id = ?', [ruleId]);
        logger.info('Rule deleted', { ruleId });
    }
}
