import { getDatabase } from '../db';
import type { DatabasePlannerResult } from '../types/planner';

export interface PlannerMetrics {
    total_plans: number;
    average_subtasks: number;
    success_rate_by_context: {
        with_similar_tasks: number;
        without_similar_tasks: number;
    };
    most_common_patterns: string[];
}

class PlannerService {
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
}

// Export a singleton instance
export const plannerService = new PlannerService();
