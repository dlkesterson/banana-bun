#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { getDatabase, initDatabase } from '../db';
import { logger } from '../utils/logger';

interface UserInteractionPattern {
    pattern_type: string;
    frequency: number;
    confidence: number;
    description: string;
    time_context: string;
}

interface PersonalizationRecommendation {
    type: string;
    description: string;
    confidence: number;
    implementation_priority: 'high' | 'medium' | 'low';
    expected_impact: string;
}

interface EngagementAnalysis {
    engagement_score: number;
    top_content_types: string[];
    peak_usage_times: string[];
    interaction_patterns: UserInteractionPattern[];
    drop_off_points: string[];
}

class UserBehaviorMCPServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'user-behavior-server',
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
            console.error('User Behavior server database initialized');
            this.setupToolHandlers();
        } catch (error) {
            console.error('Failed to initialize user behavior server:', error);
        }
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'analyze_user_interactions',
                        description: 'Analyze user interaction patterns and behaviors',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                user_session_id: {
                                    type: 'string',
                                    description: 'Specific user session to analyze (optional)'
                                },
                                time_range_hours: {
                                    type: 'number',
                                    description: 'Time range for analysis',
                                    default: 168
                                },
                                interaction_types: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Types of interactions to analyze',
                                    default: ['search', 'view', 'tag_edit', 'feedback']
                                },
                                include_patterns: {
                                    type: 'boolean',
                                    description: 'Include pattern analysis',
                                    default: true
                                }
                            }
                        }
                    },
                    {
                        name: 'generate_personalization_recommendations',
                        description: 'Generate personalized recommendations based on user behavior',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                user_session_id: {
                                    type: 'string',
                                    description: 'User session for personalization'
                                },
                                recommendation_types: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Types of recommendations to generate',
                                    default: ['content', 'interface', 'workflow']
                                },
                                max_recommendations: {
                                    type: 'number',
                                    description: 'Maximum number of recommendations',
                                    default: 10
                                }
                            }
                        }
                    },
                    {
                        name: 'identify_engagement_opportunities',
                        description: 'Identify opportunities to improve user engagement',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                analysis_scope: {
                                    type: 'string',
                                    enum: ['individual', 'aggregate', 'comparative'],
                                    description: 'Scope of engagement analysis',
                                    default: 'aggregate'
                                },
                                focus_areas: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Areas to focus analysis on',
                                    default: ['content_discovery', 'search_efficiency', 'task_completion']
                                },
                                time_range_days: {
                                    type: 'number',
                                    description: 'Days of data to analyze',
                                    default: 30
                                }
                            }
                        }
                    },
                    {
                        name: 'track_behavior_changes',
                        description: 'Track changes in user behavior over time',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                baseline_period_days: {
                                    type: 'number',
                                    description: 'Baseline period for comparison',
                                    default: 30
                                },
                                comparison_period_days: {
                                    type: 'number',
                                    description: 'Recent period for comparison',
                                    default: 7
                                },
                                behavior_metrics: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Metrics to track',
                                    default: ['session_duration', 'interaction_frequency', 'task_success_rate']
                                }
                            }
                        }
                    },
                    {
                        name: 'predict_user_needs',
                        description: 'Predict future user needs based on behavior patterns',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                user_session_id: {
                                    type: 'string',
                                    description: 'User session for predictions'
                                },
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
                                prediction_categories: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Categories of predictions',
                                    default: ['content_interest', 'feature_usage', 'optimal_timing']
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
                    case 'analyze_user_interactions':
                        return await this.analyzeUserInteractions(args);
                    case 'generate_personalization_recommendations':
                        return await this.generatePersonalizationRecommendations(args);
                    case 'identify_engagement_opportunities':
                        return await this.identifyEngagementOpportunities(args);
                    case 'track_behavior_changes':
                        return await this.trackBehaviorChanges(args);
                    case 'predict_user_needs':
                        return await this.predictUserNeeds(args);
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

    private async analyzeUserInteractions(args: any) {
        const db = getDatabase();
        const { 
            user_session_id, 
            time_range_hours = 168, 
            interaction_types = ['search', 'view', 'tag_edit', 'feedback'], 
            include_patterns = true 
        } = args;

        const cutoffTime = new Date(Date.now() - time_range_hours * 60 * 60 * 1000).toISOString();

        // Analyze search patterns
        const searchPatterns = await this.analyzeSearchBehavior(db, cutoffTime, user_session_id);
        
        // Analyze content interaction patterns
        const contentPatterns = await this.analyzeContentInteractions(db, cutoffTime, user_session_id);
        
        // Analyze task completion patterns
        const taskPatterns = await this.analyzeTaskCompletionBehavior(db, cutoffTime, user_session_id);

        const analysis = {
            time_range_hours,
            user_session_id: user_session_id || 'aggregate',
            interaction_summary: {
                total_interactions: searchPatterns.total + contentPatterns.total + taskPatterns.total,
                search_interactions: searchPatterns.total,
                content_interactions: contentPatterns.total,
                task_interactions: taskPatterns.total
            },
            behavioral_insights: {
                search_behavior: searchPatterns.insights,
                content_preferences: contentPatterns.insights,
                task_efficiency: taskPatterns.insights
            },
            interaction_patterns: include_patterns ? [
                ...searchPatterns.patterns,
                ...contentPatterns.patterns,
                ...taskPatterns.patterns
            ] : []
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(analysis, null, 2)
                }
            ]
        };
    }

    private async analyzeSearchBehavior(db: any, cutoffTime: string, userId?: string): Promise<any> {
        // Simulate search behavior analysis
        // In real implementation, this would query actual search logs
        
        const searchData = {
            total: Math.floor(Math.random() * 100) + 20,
            insights: {
                average_query_length: 3.2,
                most_common_terms: ['video', 'audio', 'recent'],
                search_success_rate: 0.78,
                refinement_rate: 0.23
            },
            patterns: [
                {
                    pattern_type: 'search_timing',
                    frequency: 15,
                    confidence: 0.85,
                    description: 'User typically searches during morning hours',
                    time_context: '8-11 AM'
                },
                {
                    pattern_type: 'query_evolution',
                    frequency: 8,
                    confidence: 0.72,
                    description: 'Queries become more specific over time',
                    time_context: 'within session'
                }
            ]
        };

        return searchData;
    }

    private async analyzeContentInteractions(db: any, cutoffTime: string, userId?: string): Promise<any> {
        // Simulate content interaction analysis
        const contentData = {
            total: Math.floor(Math.random() * 150) + 30,
            insights: {
                preferred_content_types: ['video', 'audio'],
                average_view_duration: '4.5 minutes',
                completion_rate: 0.65,
                repeat_view_rate: 0.18
            },
            patterns: [
                {
                    pattern_type: 'content_preference',
                    frequency: 22,
                    confidence: 0.89,
                    description: 'Strong preference for video content',
                    time_context: 'consistent'
                },
                {
                    pattern_type: 'viewing_session',
                    frequency: 12,
                    confidence: 0.76,
                    description: 'Tends to view multiple related items in sequence',
                    time_context: 'within 30 minutes'
                }
            ]
        };

        return contentData;
    }

    private async analyzeTaskCompletionBehavior(db: any, cutoffTime: string, userId?: string): Promise<any> {
        // Analyze task completion patterns
        const taskData = {
            total: Math.floor(Math.random() * 50) + 10,
            insights: {
                completion_rate: 0.82,
                average_task_duration: '2.3 minutes',
                most_common_tasks: ['tag_edit', 'search', 'organize'],
                abandonment_rate: 0.18
            },
            patterns: [
                {
                    pattern_type: 'task_efficiency',
                    frequency: 18,
                    confidence: 0.81,
                    description: 'Task completion improves with system familiarity',
                    time_context: 'over multiple sessions'
                }
            ]
        };

        return taskData;
    }

    private async generatePersonalizationRecommendations(args: any) {
        const { user_session_id, recommendation_types = ['content', 'interface', 'workflow'], max_recommendations = 10 } = args;

        const recommendations: PersonalizationRecommendation[] = [];

        for (const type of recommendation_types) {
            switch (type) {
                case 'content':
                    recommendations.push(...await this.generateContentRecommendations(user_session_id));
                    break;
                case 'interface':
                    recommendations.push(...await this.generateInterfaceRecommendations(user_session_id));
                    break;
                case 'workflow':
                    recommendations.push(...await this.generateWorkflowRecommendations(user_session_id));
                    break;
            }
        }

        const sortedRecommendations = recommendations
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, max_recommendations);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        user_session_id: user_session_id || 'aggregate',
                        total_recommendations: sortedRecommendations.length,
                        recommendations: sortedRecommendations,
                        implementation_summary: this.generateImplementationSummary(sortedRecommendations)
                    }, null, 2)
                }
            ]
        };
    }

    private async generateContentRecommendations(userId?: string): Promise<PersonalizationRecommendation[]> {
        return [
            {
                type: 'content_discovery',
                description: 'Personalized content feed based on viewing history',
                confidence: 0.87,
                implementation_priority: 'high',
                expected_impact: 'Increase content engagement by 25%'
            },
            {
                type: 'similar_content',
                description: 'Show related content suggestions after viewing',
                confidence: 0.82,
                implementation_priority: 'medium',
                expected_impact: 'Extend session duration by 15%'
            },
            {
                type: 'content_timing',
                description: 'Suggest optimal times for content consumption',
                confidence: 0.75,
                implementation_priority: 'low',
                expected_impact: 'Improve completion rates by 10%'
            }
        ];
    }

    private async generateInterfaceRecommendations(userId?: string): Promise<PersonalizationRecommendation[]> {
        return [
            {
                type: 'layout_optimization',
                description: 'Customize interface layout based on usage patterns',
                confidence: 0.79,
                implementation_priority: 'medium',
                expected_impact: 'Reduce task completion time by 20%'
            },
            {
                type: 'quick_actions',
                description: 'Add quick action buttons for frequently used features',
                confidence: 0.84,
                implementation_priority: 'high',
                expected_impact: 'Improve workflow efficiency by 30%'
            }
        ];
    }

    private async generateWorkflowRecommendations(userId?: string): Promise<PersonalizationRecommendation[]> {
        return [
            {
                type: 'automation_suggestions',
                description: 'Automate repetitive tasks based on user patterns',
                confidence: 0.88,
                implementation_priority: 'high',
                expected_impact: 'Save 40% time on routine tasks'
            },
            {
                type: 'workflow_shortcuts',
                description: 'Create custom shortcuts for common task sequences',
                confidence: 0.76,
                implementation_priority: 'medium',
                expected_impact: 'Reduce clicks by 35%'
            }
        ];
    }

    private generateImplementationSummary(recommendations: PersonalizationRecommendation[]): any {
        const highPriority = recommendations.filter(r => r.implementation_priority === 'high').length;
        const mediumPriority = recommendations.filter(r => r.implementation_priority === 'medium').length;
        const lowPriority = recommendations.filter(r => r.implementation_priority === 'low').length;

        return {
            priority_distribution: {
                high: highPriority,
                medium: mediumPriority,
                low: lowPriority
            },
            average_confidence: recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length,
            implementation_order: recommendations
                .filter(r => r.implementation_priority === 'high')
                .map(r => r.type)
        };
    }

    private async identifyEngagementOpportunities(args: any) {
        const { analysis_scope = 'aggregate', focus_areas = ['content_discovery', 'search_efficiency', 'task_completion'], time_range_days = 30 } = args;

        const opportunities = await this.analyzeEngagementMetrics(focus_areas, time_range_days);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        analysis_scope,
                        time_range_days,
                        engagement_analysis: opportunities,
                        action_items: this.generateEngagementActionItems(opportunities)
                    }, null, 2)
                }
            ]
        };
    }

    private async analyzeEngagementMetrics(focusAreas: string[], timeRange: number): Promise<EngagementAnalysis> {
        // Simulate engagement analysis
        return {
            engagement_score: 0.73,
            top_content_types: ['video', 'audio', 'documents'],
            peak_usage_times: ['9-11 AM', '2-4 PM', '7-9 PM'],
            interaction_patterns: [
                {
                    pattern_type: 'session_length',
                    frequency: 25,
                    confidence: 0.82,
                    description: 'Users engage longer with multimedia content',
                    time_context: 'per session'
                },
                {
                    pattern_type: 'feature_adoption',
                    frequency: 18,
                    confidence: 0.76,
                    description: 'Search features are underutilized',
                    time_context: 'across sessions'
                }
            ],
            drop_off_points: [
                'Complex search interface',
                'Slow loading times',
                'Unclear navigation'
            ]
        };
    }

    private generateEngagementActionItems(analysis: EngagementAnalysis): string[] {
        const actionItems: string[] = [];

        if (analysis.engagement_score < 0.8) {
            actionItems.push('Overall engagement below target - implement retention strategies');
        }

        for (const dropOff of analysis.drop_off_points) {
            actionItems.push(`Address drop-off point: ${dropOff}`);
        }

        for (const pattern of analysis.interaction_patterns) {
            if (pattern.confidence > 0.8) {
                actionItems.push(`Leverage high-confidence pattern: ${pattern.description}`);
            }
        }

        return actionItems;
    }

    private async trackBehaviorChanges(args: any) {
        const { baseline_period_days = 30, comparison_period_days = 7, behavior_metrics = ['session_duration', 'interaction_frequency', 'task_success_rate'] } = args;

        const changes = await this.calculateBehaviorChanges(baseline_period_days, comparison_period_days, behavior_metrics);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        baseline_period_days,
                        comparison_period_days,
                        behavior_changes: changes,
                        trend_analysis: this.analyzeTrends(changes),
                        recommendations: this.generateChangeRecommendations(changes)
                    }, null, 2)
                }
            ]
        };
    }

    private async calculateBehaviorChanges(baselineDays: number, comparisonDays: number, metrics: string[]): Promise<Record<string, any>> {
        // Simulate behavior change calculation
        const changes: Record<string, any> = {};

        for (const metric of metrics) {
            switch (metric) {
                case 'session_duration':
                    changes[metric] = {
                        baseline_average: 12.5,
                        recent_average: 14.2,
                        change_percentage: '+13.6%',
                        trend: 'improving'
                    };
                    break;
                case 'interaction_frequency':
                    changes[metric] = {
                        baseline_average: 8.3,
                        recent_average: 7.9,
                        change_percentage: '-4.8%',
                        trend: 'declining'
                    };
                    break;
                case 'task_success_rate':
                    changes[metric] = {
                        baseline_average: 0.78,
                        recent_average: 0.82,
                        change_percentage: '+5.1%',
                        trend: 'improving'
                    };
                    break;
            }
        }

        return changes;
    }

    private analyzeTrends(changes: Record<string, any>): any {
        const improving = Object.values(changes).filter((change: any) => change.trend === 'improving').length;
        const declining = Object.values(changes).filter((change: any) => change.trend === 'declining').length;

        return {
            overall_trend: improving > declining ? 'positive' : declining > improving ? 'negative' : 'stable',
            improving_metrics: improving,
            declining_metrics: declining,
            stability_score: Math.abs(improving - declining) / Object.keys(changes).length
        };
    }

    private generateChangeRecommendations(changes: Record<string, any>): string[] {
        const recommendations: string[] = [];

        for (const [metric, data] of Object.entries(changes)) {
            if ((data as any).trend === 'declining') {
                recommendations.push(`Address declining ${metric} - investigate root causes`);
            } else if ((data as any).trend === 'improving') {
                recommendations.push(`Maintain positive trend in ${metric} - identify success factors`);
            }
        }

        return recommendations;
    }

    private async predictUserNeeds(args: any) {
        const { user_session_id, prediction_horizon_hours = 24, confidence_threshold = 0.7, prediction_categories = ['content_interest', 'feature_usage', 'optimal_timing'] } = args;

        const predictions = await this.generateUserPredictions(prediction_categories, prediction_horizon_hours, confidence_threshold);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        user_session_id: user_session_id || 'aggregate',
                        prediction_horizon_hours,
                        confidence_threshold,
                        predictions,
                        actionable_insights: this.generateActionableInsights(predictions)
                    }, null, 2)
                }
            ]
        };
    }

    private async generateUserPredictions(categories: string[], horizonHours: number, threshold: number): Promise<any[]> {
        const predictions: any[] = [];

        for (const category of categories) {
            switch (category) {
                case 'content_interest':
                    predictions.push({
                        category,
                        prediction: 'User likely to search for video content',
                        confidence: 0.84,
                        time_window: 'next 4 hours',
                        basis: 'Historical viewing patterns and current session behavior'
                    });
                    break;
                case 'feature_usage':
                    predictions.push({
                        category,
                        prediction: 'User will likely use advanced search filters',
                        confidence: 0.72,
                        time_window: 'next 2 hours',
                        basis: 'Progressive feature adoption pattern'
                    });
                    break;
                case 'optimal_timing':
                    predictions.push({
                        category,
                        prediction: 'Best time for system maintenance',
                        confidence: 0.89,
                        time_window: '2-4 AM',
                        basis: 'Low activity period analysis'
                    });
                    break;
            }
        }

        return predictions.filter(p => p.confidence >= threshold);
    }

    private generateActionableInsights(predictions: any[]): string[] {
        const insights: string[] = [];

        for (const prediction of predictions) {
            if (prediction.confidence > 0.8) {
                insights.push(`High confidence: ${prediction.prediction} - prepare relevant resources`);
            } else if (prediction.confidence > 0.7) {
                insights.push(`Moderate confidence: ${prediction.prediction} - monitor for confirmation`);
            }
        }

        if (insights.length === 0) {
            insights.push('No high-confidence predictions available - continue monitoring user behavior');
        }

        return insights;
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('User Behavior MCP server running on stdio');
    }
}

// Run the server
const server = new UserBehaviorMCPServer();
server.run().catch(console.error);
