import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { config } from '../config';
import { embeddingManager } from '../memory/embeddings';
import type { 
    PlanTemplate, 
    SystemMetric, 
    OptimizationRecommendation, 
    LogAnalysisPattern,
    ResourceUsagePrediction,
    LlmPlanningRequest,
    LlmPlanningResult
} from '../types/llm-planning';

/**
 * LLM-Based Planning Service
 * 
 * This service implements the core functionality for the LLM-based planning system
 * as described in PRD-LLM-BASED-PLANNING.md
 */
export class LlmPlanningService {
    private db = getDatabase();

    /**
     * Generate an optimized plan using LLM analysis
     */
    async generateOptimizedPlan(request: LlmPlanningRequest): Promise<LlmPlanningResult> {
        await logger.info('Generating optimized plan', { goal: request.goal });

        try {
            // 1. Analyze system logs for patterns
            const logPatterns = await this.analyzeSystemLogs();
            
            // 2. Get similar plan templates
            const similarTemplates = await this.findSimilarPlanTemplates(request.goal);
            
            // 3. Analyze current system metrics
            const systemMetrics = await this.getCurrentSystemMetrics();
            
            // 4. Generate plan using LLM
            const plan = await this.generatePlanWithLlm(request, {
                logPatterns,
                similarTemplates,
                systemMetrics
            });

            // 5. Save plan as template if successful
            if (plan.success) {
                await this.savePlanTemplate(plan);
            }

            return plan;
        } catch (error) {
            await logger.error('Failed to generate optimized plan', { 
                error: error instanceof Error ? error.message : String(error),
                goal: request.goal 
            });
            throw error;
        }
    }

    /**
     * Analyze system logs for patterns and bottlenecks
     */
    async analyzeSystemLogs(timeRangeHours: number = 24): Promise<LogAnalysisPattern[]> {
        await logger.info('Analyzing system logs for patterns', { timeRangeHours });

        try {
            // Get recent log entries from analytics
            const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();
            
            const logEntries = this.db.query(`
                SELECT 
                    level,
                    message,
                    metadata,
                    timestamp
                FROM analytics_logs 
                WHERE timestamp > ? 
                ORDER BY timestamp DESC
                LIMIT 1000
            `).all(cutoffTime) as any[];

            // Analyze patterns using simple heuristics (could be enhanced with LLM)
            const patterns = await this.detectLogPatterns(logEntries);
            
            // Save detected patterns
            for (const pattern of patterns) {
                await this.saveLogPattern(pattern);
            }

            return patterns;
        } catch (error) {
            await logger.error('Failed to analyze system logs', { error });
            return [];
        }
    }

    /**
     * Generate optimization recommendations
     */
    async generateOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
        await logger.info('Generating optimization recommendations');

        try {
            const recommendations: OptimizationRecommendation[] = [];

            // Analyze task performance
            const taskMetrics = await this.analyzeTaskPerformance();
            recommendations.push(...taskMetrics);

            // Analyze resource usage
            const resourceRecommendations = await this.analyzeResourceUsage();
            recommendations.push(...resourceRecommendations);

            // Analyze metadata quality
            const metadataRecommendations = await this.analyzeMetadataQuality();
            recommendations.push(...metadataRecommendations);

            // Save recommendations
            for (const rec of recommendations) {
                await this.saveOptimizationRecommendation(rec);
            }

            return recommendations;
        } catch (error) {
            await logger.error('Failed to generate optimization recommendations', { error });
            return [];
        }
    }

    /**
     * Get planning metrics and analytics
     */
    async getPlanningMetrics(): Promise<{
        totalPlans: number;
        averageOptimizationScore: number;
        topRecommendations: OptimizationRecommendation[];
        recentPatterns: LogAnalysisPattern[];
        systemHealth: {
            score: number;
            issues: string[];
        };
    }> {
        try {
            // Get plan statistics
            const planStats = this.db.query(`
                SELECT 
                    COUNT(*) as total_plans,
                    AVG(optimization_score) as avg_optimization_score
                FROM planner_results 
                WHERE optimization_score IS NOT NULL
            `).get() as any;

            // Get top recommendations
            const topRecommendations = this.db.query(`
                SELECT * FROM optimization_recommendations 
                WHERE implemented = FALSE 
                ORDER BY impact_score DESC 
                LIMIT 5
            `).all() as OptimizationRecommendation[];

            // Get recent patterns
            const recentPatterns = this.db.query(`
                SELECT * FROM log_analysis_patterns 
                WHERE resolved = FALSE 
                ORDER BY last_detected DESC 
                LIMIT 10
            `).all() as LogAnalysisPattern[];

            // Calculate system health score
            const systemHealth = await this.calculateSystemHealthScore();

            return {
                totalPlans: planStats?.total_plans || 0,
                averageOptimizationScore: planStats?.avg_optimization_score || 0,
                topRecommendations,
                recentPatterns,
                systemHealth
            };
        } catch (error) {
            await logger.error('Failed to get planning metrics', { error });
            throw error;
        }
    }

    /**
     * Find similar plan templates using embeddings
     */
    private async findSimilarPlanTemplates(goal: string, limit: number = 5): Promise<PlanTemplate[]> {
        try {
            // Get all plan templates
            const templates = this.db.query(`
                SELECT * FROM plan_templates 
                ORDER BY success_rate DESC, usage_count DESC 
                LIMIT ?
            `).all(limit) as PlanTemplate[];

            // TODO: Enhance with semantic similarity using ChromaDB
            return templates;
        } catch (error) {
            await logger.error('Failed to find similar plan templates', { error });
            return [];
        }
    }

    /**
     * Get current system metrics
     */
    private async getCurrentSystemMetrics(): Promise<SystemMetric[]> {
        try {
            const metrics = this.db.query(`
                SELECT * FROM system_metrics 
                WHERE timestamp > datetime('now', '-1 hour')
                ORDER BY timestamp DESC
            `).all() as SystemMetric[];

            return metrics;
        } catch (error) {
            await logger.error('Failed to get current system metrics', { error });
            return [];
        }
    }

    /**
     * Generate plan using LLM with context
     */
    private async generatePlanWithLlm(
        request: LlmPlanningRequest, 
        context: {
            logPatterns: LogAnalysisPattern[];
            similarTemplates: PlanTemplate[];
            systemMetrics: SystemMetric[];
        }
    ): Promise<LlmPlanningResult> {
        const model = request.model || config.ollama.model;
        
        const prompt = this.buildPlanningPrompt(request, context);

        try {
            // Use Ollama for local planning or OpenAI for complex scenarios
            const useOpenAI = request.useAdvancedModel || model.includes('gpt');
            
            let response;
            if (useOpenAI && config.openai.apiKey) {
                response = await this.callOpenAI(prompt, model);
            } else {
                response = await this.callOllama(prompt, model);
            }

            const plan = this.parsePlanResponse(response);
            
            return {
                success: true,
                plan,
                optimizationScore: this.calculateOptimizationScore(plan, context),
                resourceEfficiency: this.calculateResourceEfficiency(plan),
                modelUsed: model,
                contextUsed: {
                    logPatternsCount: context.logPatterns.length,
                    templatesCount: context.similarTemplates.length,
                    metricsCount: context.systemMetrics.length
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                modelUsed: model
            };
        }
    }

    /**
     * Build comprehensive planning prompt
     */
    private buildPlanningPrompt(
        request: LlmPlanningRequest,
        context: {
            logPatterns: LogAnalysisPattern[];
            similarTemplates: PlanTemplate[];
            systemMetrics: SystemMetric[];
        }
    ): string {
        return `You are an expert system planner. Generate an optimized plan for the following goal:

GOAL: ${request.goal}

CONTEXT:
${request.context || 'No additional context provided'}

CONSTRAINTS:
${request.constraints?.join('\n') || 'No specific constraints'}

SYSTEM ANALYSIS:
Recent Log Patterns (${context.logPatterns.length} found):
${context.logPatterns.slice(0, 3).map(p => `- ${p.pattern_type}: ${p.pattern_description} (${p.severity})`).join('\n')}

Similar Past Plans (${context.similarTemplates.length} found):
${context.similarTemplates.slice(0, 2).map(t => `- ${t.name}: ${t.description} (success rate: ${t.success_rate})`).join('\n')}

Current System Metrics:
${context.systemMetrics.slice(0, 5).map(m => `- ${m.metric_type}: ${m.metric_value}`).join('\n')}

Please generate a detailed, optimized plan that:
1. Addresses any identified bottlenecks or patterns
2. Leverages successful strategies from similar plans
3. Considers current system resource usage
4. Provides specific, actionable steps
5. Includes estimated resource requirements and duration

Format your response as JSON with the following structure:
{
  "approach": "Brief description of the overall approach",
  "subtasks": [
    {
      "type": "task_type",
      "description": "Detailed description",
      "estimated_duration": "time estimate",
      "resource_requirements": "resource needs",
      "dependencies": ["list of dependencies"]
    }
  ],
  "optimization_notes": "Key optimizations applied",
  "risk_assessment": "Potential risks and mitigation strategies"
}`;
    }

    /**
     * Call OpenAI API for complex planning
     */
    private async callOpenAI(prompt: string, model: string): Promise<string> {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.openai.apiKey}`
            },
            body: JSON.stringify({
                model: model.includes('gpt') ? model : 'gpt-4',
                messages: [
                    { role: 'system', content: 'You are an expert system planner and optimizer.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.2
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || '';
    }

    /**
     * Call Ollama API for local planning
     */
    private async callOllama(prompt: string, model: string): Promise<string> {
        const response = await fetch(`${config.ollama.url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.response || '';
    }

    /**
     * Parse LLM response into structured plan
     */
    private parsePlanResponse(response: string): GeneratedPlan {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    approach: parsed.approach || 'Generated plan',
                    subtasks: parsed.subtasks || [],
                    optimization_notes: parsed.optimization_notes,
                    risk_assessment: parsed.risk_assessment,
                    estimated_total_duration: parsed.estimated_total_duration
                };
            }
        } catch (error) {
            await logger.warn('Failed to parse JSON from LLM response, using fallback', { error });
        }

        // Fallback: create basic plan from text
        return {
            approach: 'Text-based plan',
            subtasks: [{
                type: 'manual',
                description: response.slice(0, 500) + (response.length > 500 ? '...' : ''),
                estimated_duration: 'unknown'
            }]
        };
    }

    /**
     * Calculate optimization score for a plan
     */
    private calculateOptimizationScore(plan: GeneratedPlan, context: any): number {
        let score = 0.5; // Base score

        // Bonus for addressing log patterns
        if (plan.optimization_notes?.includes('bottleneck') ||
            plan.optimization_notes?.includes('pattern')) {
            score += 0.2;
        }

        // Bonus for resource efficiency considerations
        if (plan.subtasks.some(t => t.resource_requirements)) {
            score += 0.1;
        }

        // Bonus for risk assessment
        if (plan.risk_assessment) {
            score += 0.1;
        }

        // Bonus for detailed subtasks
        if (plan.subtasks.length > 0 && plan.subtasks.every(t => t.description.length > 20)) {
            score += 0.1;
        }

        return Math.min(1.0, score);
    }

    /**
     * Calculate resource efficiency score
     */
    private calculateResourceEfficiency(plan: GeneratedPlan): number {
        // Simple heuristic based on plan characteristics
        let efficiency = 0.7; // Base efficiency

        // Check for parallel tasks
        const hasParallelTasks = plan.subtasks.some(t =>
            t.dependencies && t.dependencies.length === 0
        );
        if (hasParallelTasks) efficiency += 0.1;

        // Check for resource optimization mentions
        if (plan.optimization_notes?.includes('resource') ||
            plan.optimization_notes?.includes('parallel')) {
            efficiency += 0.1;
        }

        return Math.min(1.0, efficiency);
    }

    /**
     * Detect patterns in log entries
     */
    private async detectLogPatterns(logEntries: any[]): Promise<LogAnalysisPattern[]> {
        const patterns: LogAnalysisPattern[] = [];
        const errorCounts = new Map<string, number>();
        const warningCounts = new Map<string, number>();

        // Count error and warning patterns
        for (const entry of logEntries) {
            if (entry.level === 'error') {
                const key = entry.message.slice(0, 100); // First 100 chars as pattern key
                errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
            } else if (entry.level === 'warn') {
                const key = entry.message.slice(0, 100);
                warningCounts.set(key, (warningCounts.get(key) || 0) + 1);
            }
        }

        // Create patterns for frequent errors
        for (const [message, count] of errorCounts.entries()) {
            if (count >= 3) { // Threshold for pattern detection
                patterns.push({
                    id: 0, // Will be set when saved
                    pattern_type: 'error_pattern',
                    pattern_description: `Recurring error: ${message}`,
                    frequency: count,
                    severity: count >= 10 ? 'critical' : count >= 5 ? 'high' : 'medium',
                    first_detected: new Date().toISOString(),
                    last_detected: new Date().toISOString(),
                    resolved: false
                });
            }
        }

        return patterns;
    }

    /**
     * Save log pattern to database
     */
    private async saveLogPattern(pattern: LogAnalysisPattern): Promise<void> {
        try {
            this.db.run(`
                INSERT OR REPLACE INTO log_analysis_patterns
                (pattern_type, pattern_description, frequency, severity, first_detected, last_detected, resolved)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                pattern.pattern_type,
                pattern.pattern_description,
                pattern.frequency,
                pattern.severity,
                pattern.first_detected,
                pattern.last_detected,
                pattern.resolved
            ]);
        } catch (error) {
            await logger.error('Failed to save log pattern', { error });
        }
    }

    /**
     * Save plan as template for future use
     */
    private async savePlanTemplate(planResult: LlmPlanningResult): Promise<void> {
        if (!planResult.plan) return;

        try {
            const templateData = JSON.stringify(planResult.plan);

            this.db.run(`
                INSERT INTO plan_templates
                (name, description, template_data, success_rate, usage_count)
                VALUES (?, ?, ?, ?, ?)
            `, [
                `Auto-generated: ${planResult.plan.approach}`,
                planResult.plan.optimization_notes || 'Generated plan template',
                templateData,
                planResult.optimizationScore || 0.5,
                1
            ]);
        } catch (error) {
            await logger.error('Failed to save plan template', { error });
        }
    }

    /**
     * Save optimization recommendation
     */
    private async saveOptimizationRecommendation(rec: OptimizationRecommendation): Promise<void> {
        try {
            this.db.run(`
                INSERT INTO optimization_recommendations
                (recommendation_type, description, impact_score, implementation_difficulty, llm_model_used)
                VALUES (?, ?, ?, ?, ?)
            `, [
                rec.recommendation_type,
                rec.description,
                rec.impact_score,
                rec.implementation_difficulty,
                rec.llm_model_used
            ]);
        } catch (error) {
            await logger.error('Failed to save optimization recommendation', { error });
        }
    }

    /**
     * Analyze task performance for recommendations
     */
    private async analyzeTaskPerformance(): Promise<OptimizationRecommendation[]> {
        const recommendations: OptimizationRecommendation[] = [];

        try {
            // Get task performance metrics
            const slowTasks = this.db.query(`
                SELECT task_type, AVG(duration_ms) as avg_duration, COUNT(*) as count
                FROM task_performance_metrics
                WHERE date > date('now', '-7 days')
                GROUP BY task_type
                HAVING avg_duration > 30000  -- Tasks taking more than 30 seconds
                ORDER BY avg_duration DESC
                LIMIT 5
            `).all() as any[];

            for (const task of slowTasks) {
                recommendations.push({
                    id: 0,
                    recommendation_type: 'performance',
                    description: `Optimize ${task.task_type} tasks - currently averaging ${Math.round(task.avg_duration / 1000)}s`,
                    impact_score: Math.min(10, task.avg_duration / 10000), // Higher score for slower tasks
                    implementation_difficulty: 'medium',
                    created_at: new Date().toISOString(),
                    implemented: false,
                    llm_model_used: 'heuristic'
                });
            }
        } catch (error) {
            await logger.error('Failed to analyze task performance', { error });
        }

        return recommendations;
    }

    /**
     * Analyze resource usage patterns
     */
    private async analyzeResourceUsage(): Promise<OptimizationRecommendation[]> {
        const recommendations: OptimizationRecommendation[] = [];

        try {
            // Simple heuristic-based resource analysis
            // In a real implementation, this would analyze actual resource metrics
            recommendations.push({
                id: 0,
                recommendation_type: 'resource',
                description: 'Consider implementing task batching to reduce resource overhead',
                impact_score: 6.5,
                implementation_difficulty: 'medium',
                created_at: new Date().toISOString(),
                implemented: false,
                llm_model_used: 'heuristic'
            });
        } catch (error) {
            await logger.error('Failed to analyze resource usage', { error });
        }

        return recommendations;
    }

    /**
     * Analyze metadata quality
     */
    private async analyzeMetadataQuality(): Promise<OptimizationRecommendation[]> {
        const recommendations: OptimizationRecommendation[] = [];

        try {
            // Check for missing metadata
            const missingMetadata = this.db.query(`
                SELECT COUNT(*) as count
                FROM media_metadata
                WHERE tags IS NULL OR tags = '' OR summary IS NULL OR summary = ''
            `).get() as any;

            if (missingMetadata?.count > 0) {
                recommendations.push({
                    id: 0,
                    recommendation_type: 'metadata',
                    description: `${missingMetadata.count} media items have incomplete metadata - consider batch processing`,
                    impact_score: Math.min(10, missingMetadata.count / 10),
                    implementation_difficulty: 'low',
                    created_at: new Date().toISOString(),
                    implemented: false,
                    llm_model_used: 'heuristic'
                });
            }
        } catch (error) {
            await logger.error('Failed to analyze metadata quality', { error });
        }

        return recommendations;
    }

    /**
     * Calculate system health score
     */
    private async calculateSystemHealthScore(): Promise<{ score: number; issues: string[] }> {
        let score = 100;
        const issues: string[] = [];

        try {
            // Check for recent errors
            const recentErrors = this.db.query(`
                SELECT COUNT(*) as count
                FROM analytics_logs
                WHERE level = 'error' AND timestamp > datetime('now', '-24 hours')
            `).get() as any;

            if (recentErrors?.count > 10) {
                score -= 20;
                issues.push(`High error rate: ${recentErrors.count} errors in last 24 hours`);
            }

            // Check for unresolved patterns
            const unresolvedPatterns = this.db.query(`
                SELECT COUNT(*) as count
                FROM log_analysis_patterns
                WHERE resolved = FALSE AND severity IN ('high', 'critical')
            `).get() as any;

            if (unresolvedPatterns?.count > 0) {
                score -= 15;
                issues.push(`${unresolvedPatterns.count} unresolved critical/high severity patterns`);
            }

            // Check for failed tasks
            const failedTasks = this.db.query(`
                SELECT COUNT(*) as count
                FROM tasks
                WHERE status = 'failed' AND created_at > datetime('now', '-24 hours')
            `).get() as any;

            if (failedTasks?.count > 5) {
                score -= 10;
                issues.push(`${failedTasks.count} failed tasks in last 24 hours`);
            }

        } catch (error) {
            await logger.error('Failed to calculate system health score', { error });
            score = 50; // Default to moderate health if calculation fails
            issues.push('Unable to calculate complete health metrics');
        }

        return {
            score: Math.max(0, score),
            issues
        };
    }
}

// Export singleton instance
export const llmPlanningService = new LlmPlanningService();
