import { getDatabase } from '../db';
import type { DatabasePlannerResult } from '../types/planner';
import type { IPlannerService, DecomposeGoalResult } from '../types/service-interfaces';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface PlannerMetrics {
    total_plans: number;
    average_subtasks: number;
    success_rate_by_context: {
        with_similar_tasks: number;
        without_similar_tasks: number;
    };
    most_common_patterns: string[];
}

class PlannerService implements IPlannerService {
    /**
     * Get planner result for a specific task
     */
    getPlannerResultForTask(taskId: number): DatabasePlannerResult | null {
        const db = getDatabase();
        
        const result = db.query(`
            SELECT * FROM planner_results 
            WHERE task_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `).get(taskId) as DatabasePlannerResult | null;

        return result;
    }

    /**
     * Get overall planner metrics
     */
    getPlannerMetrics(): PlannerMetrics {
        const db = getDatabase();
        
        // Get basic stats
        const basicStats = db.query(`
            SELECT 
                COUNT(*) as total_plans,
                AVG(subtask_count) as average_subtasks
            FROM planner_results
        `).get() as any;

        // Get success rates by context usage
        const contextStats = db.query(`
            SELECT 
                pr.similar_tasks_used,
                t.status,
                COUNT(*) as count
            FROM planner_results pr
            JOIN tasks t ON pr.task_id = t.id
            WHERE t.status IN ('completed', 'failed')
            GROUP BY 
                CASE WHEN pr.similar_tasks_used IS NOT NULL AND pr.similar_tasks_used != '[]' THEN 'with_context' ELSE 'without_context' END,
                t.status
        `).all() as any[];

        // Calculate success rates
        let withContextTotal = 0;
        let withContextSuccess = 0;
        let withoutContextTotal = 0;
        let withoutContextSuccess = 0;

        for (const stat of contextStats) {
            const hasContext = stat.similar_tasks_used && stat.similar_tasks_used !== '[]';
            
            if (hasContext) {
                withContextTotal += stat.count;
                if (stat.status === 'completed') {
                    withContextSuccess += stat.count;
                }
            } else {
                withoutContextTotal += stat.count;
                if (stat.status === 'completed') {
                    withoutContextSuccess += stat.count;
                }
            }
        }

        const withContextRate = withContextTotal > 0 ? Math.round((withContextSuccess / withContextTotal) * 100) : 0;
        const withoutContextRate = withoutContextTotal > 0 ? Math.round((withoutContextSuccess / withoutContextTotal) * 100) : 0;

        // Get most common patterns (simplified - could be enhanced)
        const patterns = this.getMostCommonPatterns();

        return {
            total_plans: basicStats?.total_plans || 0,
            average_subtasks: basicStats?.average_subtasks || 0,
            success_rate_by_context: {
                with_similar_tasks: withContextRate,
                without_similar_tasks: withoutContextRate
            },
            most_common_patterns: patterns
        };
    }

    /**
     * Generate a context usage badge HTML
     */
    getContextUsageBadge(similarTasksUsed: string | null): string {
        if (!similarTasksUsed || similarTasksUsed === '[]') {
            return '<span class="px-2 py-1 text-xs bg-gray-400 text-white rounded">No Context</span>';
        }

        try {
            const tasks = JSON.parse(similarTasksUsed);
            const count = Array.isArray(tasks) ? tasks.length : 0;
            
            if (count === 0) {
                return '<span class="px-2 py-1 text-xs bg-gray-400 text-white rounded">No Context</span>';
            } else if (count <= 2) {
                return `<span class="px-2 py-1 text-xs bg-blue-500 text-white rounded">${count} Similar</span>`;
            } else {
                return `<span class="px-2 py-1 text-xs bg-green-500 text-white rounded">${count} Similar</span>`;
            }
        } catch {
            return '<span class="px-2 py-1 text-xs bg-gray-400 text-white rounded">Invalid</span>';
        }
    }

    /**
     * Generate a subtask count badge HTML
     */
    getSubtaskCountBadge(subtaskCount: number): string {
        let colorClass = 'bg-gray-400';
        
        if (subtaskCount === 0) {
            colorClass = 'bg-gray-400';
        } else if (subtaskCount <= 3) {
            colorClass = 'bg-green-500';
        } else if (subtaskCount <= 6) {
            colorClass = 'bg-blue-500';
        } else {
            colorClass = 'bg-orange-500';
        }

        return `<span class="px-2 py-1 text-xs ${colorClass} text-white rounded">${subtaskCount} tasks</span>`;
    }

    /**
     * Get all planner results for a specific task (including versions)
     */
    getTaskPlannerHistory(taskId: number): DatabasePlannerResult[] {
        const db = getDatabase();
        return db.query(`
            SELECT * FROM planner_results 
            WHERE task_id = ? 
            ORDER BY created_at DESC
        `).all(taskId) as DatabasePlannerResult[];
    }

    /**
     * Get recent planner results across all tasks
     */
    getRecentPlannerResults(limit: number = 10): DatabasePlannerResult[] {
        const db = getDatabase();
        return db.query(`
            SELECT * FROM planner_results 
            ORDER BY created_at DESC 
            LIMIT ?
        `).all(limit) as DatabasePlannerResult[];
    }

    /**
     * Get most common planning patterns (simplified implementation)
     */
    private getMostCommonPatterns(): string[] {
        const db = getDatabase();
        
        // This is a simplified implementation - could be enhanced to analyze actual patterns
        const results = db.query(`
            SELECT 
                model_used,
                COUNT(*) as usage_count
            FROM planner_results 
            GROUP BY model_used 
            ORDER BY usage_count DESC 
            LIMIT 5
        `).all() as any[];

        return results.map(r => `${r.model_used} (${r.usage_count})`);
    }

    /**
     * Decompose a goal into actionable tasks using LLM planning
     */
    async decomposeGoal(goal: string, context?: any): Promise<DecomposeGoalResult> {
        try {
            // Validate input
            if (!goal || goal.trim() === '') {
                return {
                    success: false,
                    error: 'Goal cannot be empty',
                    tasks: []
                };
            }

            const db = getDatabase();

            // Prepare the planning prompt
            const prompt = `
You are a task planning assistant. Break down the following goal into specific, actionable tasks.

Goal: ${goal}

Context: ${context ? JSON.stringify(context, null, 2) : 'No additional context provided'}

Please provide a structured plan with the following format:
- Each task should be specific and actionable
- Include task type (shell, llm, code, tool, etc.)
- Specify dependencies between tasks if any
- Estimate priority (1-5, where 5 is highest)

Return your response as a JSON object with this structure:
{
  "success": true,
  "tasks": [
    {
      "type": "task_type",
      "description": "specific task description",
      "dependencies": ["task_1", "task_2"],
      "priority": 3
    }
  ],
  "plan_id": "unique_plan_identifier",
  "estimated_duration": 1800
}
`;

            // Call LLM for planning
            const response = await fetch(`${config.ollama.url}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: config.ollama.model,
                    prompt: prompt,
                    stream: false,
                    format: 'json'
                }),
            });

            if (!response.ok) {
                throw new Error(`LLM request failed: ${response.statusText}`);
            }

            const data = await response.json();
            let planResult: DecomposeGoalResult;

            try {
                const rawResult = JSON.parse(data.response);

                // Validate and filter tasks
                const validatedResult = this.validateTasks(rawResult);
                planResult = validatedResult;
            } catch (parseError) {
                // Fallback if JSON parsing fails
                planResult = {
                    success: false,
                    error: 'Failed to parse LLM response as JSON',
                    tasks: []
                };
            }

            // Store the planning result in database
            if (planResult.success && planResult.tasks) {
                const planId = planResult.plan_id || `plan_${Date.now()}`;

                db.run(`
                    INSERT INTO planner_results (
                        plan_id, goal, context, tasks_json, model_used,
                        estimated_duration, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                `, [
                    planId,
                    goal,
                    JSON.stringify(context || {}),
                    JSON.stringify(planResult.tasks),
                    config.ollama.model,
                    planResult.estimated_duration || 0
                ]);

                await logger.info('Goal decomposed successfully', {
                    goal,
                    planId,
                    tasksCount: planResult.tasks.length
                });
            }

            return planResult;
        } catch (error) {
            await logger.error('Failed to decompose goal', {
                goal,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                tasks: []
            };
        }
    }

    /**
     * Get metrics (async version for tests)
     */
    async getMetrics(): Promise<PlannerMetrics> {
        return this.getPlannerMetrics();
    }

    /**
     * Generate planning efficiency badge
     */
    generatePlanningEfficiencyBadge(efficiency: number): string {
        let color = 'red';
        if (efficiency >= 80) {
            color = 'brightgreen';
        } else if (efficiency >= 60) {
            color = 'yellow';
        }

        return `<span class="badge planning-efficiency ${color}">Planning Efficiency: ${efficiency}%</span>`;
    }

    /**
     * Optimize task sequence for dependencies
     */
    async optimizeTaskSequence(tasks: any[]): Promise<any> {
        // Simple topological sort implementation
        const result = [];
        const visited = new Set();
        const visiting = new Set();

        const visit = (task: any) => {
            if (visiting.has(task.id)) {
                // Circular dependency detected - return error instead of throwing
                return {
                    success: false,
                    error: 'circular dependency detected',
                    circular_tasks: Array.from(visiting)
                };
            }
            if (visited.has(task.id)) {
                return null;
            }

            visiting.add(task.id);

            // Visit dependencies first
            if (task.dependencies) {
                for (const depId of task.dependencies) {
                    const depTask = tasks.find(t => t.id.toString() === depId);
                    if (depTask) {
                        const depResult = visit(depTask);
                        if (depResult && !depResult.success) {
                            return depResult; // Propagate circular dependency error
                        }
                    }
                }
            }

            visiting.delete(task.id);
            visited.add(task.id);
            result.push(task);
            return null;
        };

        for (const task of tasks) {
            if (!visited.has(task.id)) {
                const visitResult = visit(task);
                if (visitResult && !visitResult.success) {
                    return visitResult; // Return circular dependency error
                }
            }
        }

        return {
            success: true,
            sequence: result,
            optimized_tasks: result,
            parallel_opportunities: this.findParallelOpportunities(result),
            parallelGroups: this.findParallelGroups(result)
        };
    }

    /**
     * Find parallel execution opportunities
     */
    private findParallelOpportunities(tasks: any[]): string[] {
        const opportunities = [];
        const taskMap = new Map(tasks.map(t => [t.id, t]));

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const parallelTasks = [];

            for (let j = i + 1; j < tasks.length; j++) {
                const otherTask = tasks[j];

                // Check if tasks can run in parallel (no dependencies between them)
                const hasDirectDep = task.dependencies?.includes(otherTask.id.toString()) ||
                                   otherTask.dependencies?.includes(task.id.toString());

                if (!hasDirectDep) {
                    parallelTasks.push(otherTask.id);
                }
            }

            if (parallelTasks.length > 0) {
                opportunities.push(`Task ${task.id} can run parallel with: ${parallelTasks.join(', ')}`);
            }
        }

        return opportunities;
    }

    /**
     * Find parallel execution groups
     */
    private findParallelGroups(tasks: any[]): any[] {
        const groups = [];
        const processed = new Set();

        for (let i = 0; i < tasks.length; i++) {
            if (processed.has(tasks[i].id)) continue;

            const group = [tasks[i]];
            processed.add(tasks[i].id);

            // Find tasks that can run in parallel with this one
            for (let j = i + 1; j < tasks.length; j++) {
                if (processed.has(tasks[j].id)) continue;

                const canRunParallel = !this.hasDependencyRelation(tasks[i], tasks[j], tasks);
                if (canRunParallel) {
                    group.push(tasks[j]);
                    processed.add(tasks[j].id);
                }
            }

            groups.push(group);
        }

        return groups;
    }

    /**
     * Check if two tasks have a dependency relation
     */
    private hasDependencyRelation(task1: any, task2: any, allTasks: any[]): boolean {
        // Direct dependency
        if (task1.dependencies?.includes(task2.id.toString()) ||
            task2.dependencies?.includes(task1.id.toString())) {
            return true;
        }

        // Indirect dependency (simplified check)
        return false;
    }

    /**
     * Validate tasks and filter out invalid ones
     */
    private validateTasks(rawResult: any): DecomposeGoalResult {
        if (!rawResult.tasks || !Array.isArray(rawResult.tasks)) {
            return {
                success: false,
                error: 'Invalid task structure',
                tasks: []
            };
        }

        const validTaskTypes = ['shell', 'llm', 'code', 'tool', 'transcribe', 'batch'];
        const validTasks = [];
        const warnings = [];

        for (const task of rawResult.tasks) {
            if (!task.type || !validTaskTypes.includes(task.type)) {
                warnings.push('Invalid task type');
                continue;
            }

            if (!task.description) {
                warnings.push('Task missing description');
                continue;
            }

            validTasks.push(task);
        }

        return {
            success: true,
            tasks: validTasks,
            plan_id: rawResult.plan_id,
            estimated_duration: rawResult.estimated_duration,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * Save plan to database
     */
    async savePlan(plan: any): Promise<any> {
        try {
            const db = getDatabase();

            const result = db.run(`
                INSERT INTO tasks (type, description, generator, metadata, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `, [
                'batch',
                plan.goal || 'Generated plan',
                'planner-service',
                JSON.stringify(plan)
            ]);

            return {
                success: true,
                task_id: result.lastInsertRowid,
                planId: result.lastInsertRowid
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Load plan from database
     */
    async loadPlan(taskId: number): Promise<any> {
        try {
            const db = getDatabase();

            const task = db.query(`
                SELECT * FROM tasks WHERE id = ? AND generator = 'planner-service'
            `).get(taskId);

            if (!task) {
                return {
                    success: false,
                    error: 'Plan not found'
                };
            }

            return {
                success: true,
                plan: JSON.parse(task.metadata || '{}'),
                task_id: taskId
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

// Export lazy singleton instance
let _plannerService: PlannerService | null = null;

export function getPlannerService(): PlannerService {
    if (!_plannerService) {
        _plannerService = new PlannerService();
    }
    return _plannerService;
}

// For backward compatibility - use a getter to make it lazy
export const plannerService = new Proxy({} as PlannerService, {
    get(target, prop) {
        return getPlannerService()[prop as keyof PlannerService];
    }
});
