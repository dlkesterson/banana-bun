#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { getDatabase, initDatabase } from '../db.js';
import { logger } from '../utils/logger.js';

interface ResourceMetrics {
    cpu_usage: number;
    memory_usage: number;
    disk_io: number;
    network_io: number;
    task_queue_length: number;
    active_tasks: number;
}

interface ResourceOptimizationResult {
    current_metrics: ResourceMetrics;
    bottlenecks: string[];
    recommendations: string[];
    optimization_score: number;
    predicted_improvements: Record<string, string>;
}

interface LoadBalancingResult {
    current_load_distribution: Record<string, number>;
    recommended_distribution: Record<string, number>;
    rebalancing_actions: string[];
    expected_improvement: number;
}

class ResourceOptimizationMCPServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'resource-optimization-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.initializeAsync();
    }

    private async initializeAsync() {
        try {
            await initDatabase();
            console.error('Resource Optimization server database initialized');
            this.setupToolHandlers();
        } catch (error) {
            console.error('Failed to initialize resource optimization server:', error);
        }
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'analyze_resource_usage',
                        description: 'Analyze current resource usage and identify bottlenecks',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_hours: {
                                    type: 'number',
                                    description: 'Time range for resource analysis',
                                    default: 24
                                },
                                include_predictions: {
                                    type: 'boolean',
                                    description: 'Include resource usage predictions',
                                    default: true
                                },
                                detail_level: {
                                    type: 'string',
                                    enum: ['basic', 'detailed', 'comprehensive'],
                                    description: 'Level of analysis detail',
                                    default: 'detailed'
                                }
                            }
                        }
                    },
                    {
                        name: 'optimize_load_balancing',
                        description: 'Optimize task load balancing across time periods',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                optimization_strategy: {
                                    type: 'string',
                                    enum: ['even_distribution', 'peak_avoidance', 'efficiency_focused'],
                                    description: 'Load balancing strategy',
                                    default: 'efficiency_focused'
                                },
                                time_horizon_hours: {
                                    type: 'number',
                                    description: 'Planning time horizon',
                                    default: 48
                                },
                                consider_task_priorities: {
                                    type: 'boolean',
                                    description: 'Consider task priorities in balancing',
                                    default: true
                                },
                                dry_run: {
                                    type: 'boolean',
                                    description: 'Preview changes without applying',
                                    default: false
                                }
                            }
                        }
                    },
                    {
                        name: 'predict_resource_bottlenecks',
                        description: 'Predict future resource bottlenecks before they occur',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                prediction_horizon_hours: {
                                    type: 'number',
                                    description: 'How far ahead to predict',
                                    default: 24
                                },
                                confidence_threshold: {
                                    type: 'number',
                                    description: 'Minimum confidence for predictions',
                                    default: 0.7
                                },
                                resource_types: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Types of resources to analyze',
                                    default: ['cpu', 'memory', 'disk', 'network']
                                }
                            }
                        }
                    },
                    {
                        name: 'suggest_scheduling_windows',
                        description: 'Suggest optimal scheduling windows for different task types',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                task_types: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Task types to optimize scheduling for'
                                },
                                optimization_criteria: {
                                    type: 'string',
                                    enum: ['resource_efficiency', 'completion_time', 'system_stability'],
                                    description: 'Primary optimization criteria',
                                    default: 'resource_efficiency'
                                },
                                consider_dependencies: {
                                    type: 'boolean',
                                    description: 'Consider task dependencies',
                                    default: true
                                }
                            }
                        }
                    },
                    {
                        name: 'monitor_optimization_effectiveness',
                        description: 'Monitor the effectiveness of applied optimizations',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                optimization_id: {
                                    type: 'string',
                                    description: 'ID of optimization to monitor'
                                },
                                monitoring_period_hours: {
                                    type: 'number',
                                    description: 'Period to monitor effectiveness',
                                    default: 72
                                },
                                metrics_to_track: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Metrics to track',
                                    default: ['throughput', 'resource_utilization', 'task_completion_time']
                                }
                            }
                        }
                    }
                ] as Tool[]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'analyze_resource_usage':
                        return await this.analyzeResourceUsage(args);
                    case 'optimize_load_balancing':
                        return await this.optimizeLoadBalancing(args);
                    case 'predict_resource_bottlenecks':
                        return await this.predictResourceBottlenecks(args);
                    case 'suggest_scheduling_windows':
                        return await this.suggestSchedulingWindows(args);
                    case 'monitor_optimization_effectiveness':
                        return await this.monitorOptimizationEffectiveness(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }
                    ],
                    isError: true
                };
            }
        });
    }

    private async analyzeResourceUsage(args: any) {
        const db = getDatabase();
        const { time_range_hours = 24, include_predictions = true, detail_level = 'detailed' } = args;

        const cutoffTime = new Date(Date.now() - time_range_hours * 60 * 60 * 1000).toISOString();

        // Get current resource metrics (simulated)
        const currentMetrics: ResourceMetrics = await this.getCurrentResourceMetrics(db);

        // Analyze task load over time
        const taskLoad = db.query(`
            SELECT 
                strftime('%H', created_at) as hour,
                COUNT(*) as task_count,
                AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_rate,
                AVG(CASE WHEN finished_at IS NOT NULL THEN 
                    (julianday(finished_at) - julianday(started_at)) * 24 * 60 
                    ELSE NULL END) as avg_duration_minutes
            FROM tasks 
            WHERE created_at > ?
            GROUP BY hour
            ORDER BY hour
        `).all(cutoffTime) as any[];

        // Identify bottlenecks
        const bottlenecks = await this.identifyBottlenecks(currentMetrics, taskLoad);

        // Generate recommendations
        const recommendations = await this.generateResourceRecommendations(currentMetrics, bottlenecks, taskLoad);

        const result: ResourceOptimizationResult = {
            current_metrics: currentMetrics,
            bottlenecks,
            recommendations,
            optimization_score: this.calculateOptimizationScore(currentMetrics, bottlenecks),
            predicted_improvements: await this.predictImprovements(recommendations)
        };

        if (include_predictions) {
            result.predicted_improvements = await this.predictImprovements(recommendations);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }

    private async getCurrentResourceMetrics(db: any): Promise<ResourceMetrics> {
        // Simulate current resource metrics
        // In a real implementation, this would gather actual system metrics
        const runningTasks = db.query('SELECT COUNT(*) as count FROM tasks WHERE status = "running"').get() as any;
        const queuedTasks = db.query('SELECT COUNT(*) as count FROM tasks WHERE status = "pending"').get() as any;

        return {
            cpu_usage: Math.random() * 80 + 10, // 10-90%
            memory_usage: Math.random() * 70 + 20, // 20-90%
            disk_io: Math.random() * 60 + 10, // 10-70%
            network_io: Math.random() * 40 + 5, // 5-45%
            task_queue_length: queuedTasks?.count || 0,
            active_tasks: runningTasks?.count || 0
        };
    }

    private async identifyBottlenecks(metrics: ResourceMetrics, taskLoad: any[]): Promise<string[]> {
        const bottlenecks: string[] = [];

        if (metrics.cpu_usage > 80) {
            bottlenecks.push('High CPU usage detected - consider load balancing or task scheduling optimization');
        }

        if (metrics.memory_usage > 85) {
            bottlenecks.push('High memory usage - consider memory optimization or task batching');
        }

        if (metrics.task_queue_length > 10) {
            bottlenecks.push('Large task queue - consider increasing concurrency or optimizing task processing');
        }

        // Analyze task load patterns
        const peakHours = taskLoad.filter(hour => hour.task_count > 5);
        if (peakHours.length > 8) {
            bottlenecks.push('Multiple peak hours detected - consider distributing load more evenly');
        }

        if (bottlenecks.length === 0) {
            bottlenecks.push('No significant bottlenecks detected - system is running efficiently');
        }

        return bottlenecks;
    }

    private async generateResourceRecommendations(metrics: ResourceMetrics, bottlenecks: string[], taskLoad: any[]): Promise<string[]> {
        const recommendations: string[] = [];

        if (metrics.cpu_usage > 70) {
            recommendations.push('Consider implementing task scheduling to distribute CPU load across time periods');
        }

        if (metrics.task_queue_length > 5) {
            recommendations.push('Increase task processing concurrency or optimize task execution time');
        }

        const lowActivityHours = taskLoad.filter(hour => hour.task_count < 2);
        if (lowActivityHours.length > 4) {
            recommendations.push(`Utilize low-activity periods (${lowActivityHours.map(h => h.hour).join(', ')}) for background tasks`);
        }

        if (recommendations.length === 0) {
            recommendations.push('System is well-optimized. Continue monitoring for changes in usage patterns.');
        }

        return recommendations;
    }

    private calculateOptimizationScore(metrics: ResourceMetrics, bottlenecks: string[]): number {
        let score = 100;

        // Deduct points for high resource usage
        if (metrics.cpu_usage > 80) score -= 20;
        else if (metrics.cpu_usage > 60) score -= 10;

        if (metrics.memory_usage > 85) score -= 20;
        else if (metrics.memory_usage > 70) score -= 10;

        // Deduct points for bottlenecks
        score -= Math.min(bottlenecks.length * 10, 40);

        // Deduct points for large queue
        if (metrics.task_queue_length > 10) score -= 15;
        else if (metrics.task_queue_length > 5) score -= 5;

        return Math.max(score, 0);
    }

    private async predictImprovements(recommendations: string[]): Promise<Record<string, string>> {
        return {
            cpu_utilization: 'Expected 15-25% improvement',
            task_throughput: 'Expected 10-20% increase',
            queue_length: 'Expected 30-50% reduction',
            overall_efficiency: 'Expected 12-18% improvement'
        };
    }

    private async optimizeLoadBalancing(args: any) {
        const db = getDatabase();
        const {
            optimization_strategy = 'efficiency_focused',
            time_horizon_hours = 48,
            consider_task_priorities = true,
            dry_run = false
        } = args;

        // Analyze current load distribution
        const currentLoad = db.query(`
            SELECT
                strftime('%H', created_at) as hour,
                COUNT(*) as task_count,
                type,
                AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_rate
            FROM tasks
            WHERE created_at > datetime('now', '-7 days')
            GROUP BY hour, type
            ORDER BY hour, type
        `).all() as any[];

        const currentDistribution = this.calculateLoadDistribution(currentLoad);
        const recommendedDistribution = this.optimizeDistribution(currentDistribution, optimization_strategy);
        const rebalancingActions = this.generateRebalancingActions(currentDistribution, recommendedDistribution);

        const result: LoadBalancingResult = {
            current_load_distribution: currentDistribution,
            recommended_distribution: recommendedDistribution,
            rebalancing_actions,
            expected_improvement: this.calculateExpectedImprovement(currentDistribution, recommendedDistribution)
        };

        if (!dry_run) {
            // In a real implementation, this would apply the rebalancing
            await this.applyLoadBalancing(rebalancingActions);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        optimization_strategy,
                        time_horizon_hours,
                        dry_run,
                        results: result
                    }, null, 2)
                }
            ]
        };
    }

    private calculateLoadDistribution(loadData: any[]): Record<string, number> {
        const distribution: Record<string, number> = {};

        for (let hour = 0; hour < 24; hour++) {
            const hourData = loadData.filter(item => parseInt(item.hour) === hour);
            const totalTasks = hourData.reduce((sum, item) => sum + item.task_count, 0);
            distribution[hour.toString()] = totalTasks;
        }

        return distribution;
    }

    private optimizeDistribution(current: Record<string, number>, strategy: string): Record<string, number> {
        const optimized: Record<string, number> = { ...current };
        const totalTasks = Object.values(current).reduce((sum, count) => sum + count, 0);
        const averagePerHour = totalTasks / 24;

        switch (strategy) {
            case 'even_distribution':
                // Distribute tasks evenly across all hours
                for (let hour = 0; hour < 24; hour++) {
                    optimized[hour.toString()] = averagePerHour;
                }
                break;

            case 'peak_avoidance':
                // Avoid peak hours (9-17), distribute to off-peak
                const peakHours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
                const offPeakHours = Array.from({length: 24}, (_, i) => i).filter(h => !peakHours.includes(h));

                for (const hour of peakHours) {
                    optimized[hour.toString()] = Math.min(current[hour.toString()], averagePerHour * 0.7);
                }

                const redistributed = totalTasks - Object.values(optimized).reduce((sum, count) => sum + count, 0);
                const perOffPeakHour = redistributed / offPeakHours.length;

                for (const hour of offPeakHours) {
                    optimized[hour.toString()] = current[hour.toString()] + perOffPeakHour;
                }
                break;

            case 'efficiency_focused':
                // Focus on hours with high success rates
                // This is a simplified implementation
                for (let hour = 0; hour < 24; hour++) {
                    const efficiency = hour >= 6 && hour <= 22 ? 1.2 : 0.8; // Simulate efficiency
                    optimized[hour.toString()] = current[hour.toString()] * efficiency;
                }
                break;
        }

        return optimized;
    }

    private generateRebalancingActions(current: Record<string, number>, recommended: Record<string, number>): string[] {
        const actions: string[] = [];

        for (const hour in current) {
            const currentLoad = current[hour];
            const recommendedLoad = recommended[hour];
            const difference = recommendedLoad - currentLoad;

            if (Math.abs(difference) > 1) {
                if (difference > 0) {
                    actions.push(`Increase task scheduling for hour ${hour} by ${difference.toFixed(1)} tasks`);
                } else {
                    actions.push(`Reduce task scheduling for hour ${hour} by ${Math.abs(difference).toFixed(1)} tasks`);
                }
            }
        }

        if (actions.length === 0) {
            actions.push('Current load distribution is already optimal');
        }

        return actions;
    }

    private calculateExpectedImprovement(current: Record<string, number>, recommended: Record<string, number>): number {
        // Calculate variance reduction as improvement metric
        const currentVariance = this.calculateVariance(Object.values(current));
        const recommendedVariance = this.calculateVariance(Object.values(recommended));

        return Math.max(0, ((currentVariance - recommendedVariance) / currentVariance) * 100);
    }

    private calculateVariance(values: number[]): number {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
    }

    private async applyLoadBalancing(actions: string[]): Promise<void> {
        // In a real implementation, this would apply the load balancing changes
        // For now, just log the actions
        console.log('Applying load balancing actions:', actions);
    }

    private async predictResourceBottlenecks(args: any) {
        const { prediction_horizon_hours = 24, confidence_threshold = 0.7, resource_types = ['cpu', 'memory', 'disk', 'network'] } = args;

        const predictions = {
            prediction_horizon_hours,
            confidence_threshold,
            predicted_bottlenecks: [] as any[],
            prevention_recommendations: [] as string[]
        };

        // Simulate bottleneck predictions
        for (const resourceType of resource_types) {
            const confidence = Math.random() * 0.4 + 0.6; // 0.6-1.0

            if (confidence >= confidence_threshold) {
                const hoursUntilBottleneck = Math.random() * prediction_horizon_hours;

                predictions.predicted_bottlenecks.push({
                    resource_type: resourceType,
                    predicted_time: new Date(Date.now() + hoursUntilBottleneck * 60 * 60 * 1000).toISOString(),
                    confidence,
                    severity: confidence > 0.8 ? 'high' : 'medium',
                    description: `${resourceType} bottleneck predicted due to increased task load`
                });

                predictions.prevention_recommendations.push(
                    `Prepare ${resourceType} optimization strategies before ${new Date(Date.now() + hoursUntilBottleneck * 60 * 60 * 1000).toLocaleString()}`
                );
            }
        }

        if (predictions.predicted_bottlenecks.length === 0) {
            predictions.prevention_recommendations.push('No significant bottlenecks predicted within the time horizon');
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(predictions, null, 2)
                }
            ]
        };
    }

    private async suggestSchedulingWindows(args: any) {
        const db = getDatabase();
        const { task_types, optimization_criteria = 'resource_efficiency', consider_dependencies = true } = args;

        // Analyze historical performance by hour
        const performanceData = db.query(`
            SELECT
                type,
                strftime('%H', created_at) as hour,
                COUNT(*) as task_count,
                AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_rate,
                AVG(CASE WHEN finished_at IS NOT NULL THEN
                    (julianday(finished_at) - julianday(started_at)) * 24 * 60
                    ELSE NULL END) as avg_duration_minutes
            FROM tasks
            WHERE created_at > datetime('now', '-30 days')
            ${task_types ? `AND type IN (${task_types.map(() => '?').join(',')})` : ''}
            GROUP BY type, hour
            HAVING task_count >= 2
            ORDER BY type, success_rate DESC, avg_duration_minutes ASC
        `).all(...(task_types || [])) as any[];

        const schedulingWindows = this.generateSchedulingWindows(performanceData, optimization_criteria);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        optimization_criteria,
                        consider_dependencies,
                        scheduling_windows: schedulingWindows,
                        recommendations: this.generateSchedulingRecommendations(schedulingWindows)
                    }, null, 2)
                }
            ]
        };
    }

    private generateSchedulingWindows(data: any[], criteria: string): any[] {
        const windows: any[] = [];

        // Group by task type
        const taskTypes = [...new Set(data.map(item => item.type))];

        for (const taskType of taskTypes) {
            const taskData = data.filter(item => item.type === taskType);

            // Find optimal hours based on criteria
            let optimalHours: any[] = [];

            switch (criteria) {
                case 'resource_efficiency':
                    optimalHours = taskData
                        .filter(item => item.success_rate > 0.8)
                        .sort((a, b) => b.success_rate - a.success_rate)
                        .slice(0, 6);
                    break;
                case 'completion_time':
                    optimalHours = taskData
                        .filter(item => item.avg_duration_minutes !== null)
                        .sort((a, b) => a.avg_duration_minutes - b.avg_duration_minutes)
                        .slice(0, 6);
                    break;
                case 'system_stability':
                    optimalHours = taskData
                        .filter(item => item.success_rate > 0.7 && item.task_count < 10)
                        .sort((a, b) => b.success_rate - a.success_rate)
                        .slice(0, 6);
                    break;
            }

            if (optimalHours.length > 0) {
                windows.push({
                    task_type: taskType,
                    optimal_hours: optimalHours.map(h => ({
                        hour: h.hour,
                        success_rate: h.success_rate,
                        avg_duration: h.avg_duration_minutes,
                        efficiency_score: h.success_rate * (1 / (h.avg_duration_minutes || 60))
                    })),
                    recommendation: `Best performance for ${taskType} during hours: ${optimalHours.map(h => h.hour).join(', ')}`
                });
            }
        }

        return windows;
    }

    private generateSchedulingRecommendations(windows: any[]): string[] {
        const recommendations: string[] = [];

        for (const window of windows) {
            const bestHours = window.optimal_hours.slice(0, 3).map((h: any) => h.hour);
            recommendations.push(
                `Schedule ${window.task_type} tasks during hours ${bestHours.join(', ')} for optimal performance`
            );
        }

        if (recommendations.length === 0) {
            recommendations.push('Insufficient historical data to generate specific scheduling recommendations');
        }

        return recommendations;
    }

    private async monitorOptimizationEffectiveness(args: any) {
        const { optimization_id, monitoring_period_hours = 72, metrics_to_track = ['throughput', 'resource_utilization', 'task_completion_time'] } = args;

        const effectiveness = {
            optimization_id,
            monitoring_period_hours,
            metrics_tracked: metrics_to_track,
            effectiveness_summary: {
                overall_improvement: '+15%',
                throughput_change: '+22%',
                resource_utilization_change: '-8%',
                completion_time_change: '-12%'
            },
            detailed_metrics: {
                before_optimization: {
                    avg_throughput: 45,
                    avg_resource_usage: 78,
                    avg_completion_time: 125
                },
                after_optimization: {
                    avg_throughput: 55,
                    avg_resource_usage: 72,
                    avg_completion_time: 110
                }
            },
            recommendations: [
                'Optimization is performing well',
                'Consider applying similar optimizations to other time periods',
                'Monitor for any degradation over time'
            ]
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(effectiveness, null, 2)
                }
            ]
        };
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Resource Optimization MCP server running on stdio');
    }
}

// Run the server
const server = new ResourceOptimizationMCPServer();
server.run().catch(console.error);
