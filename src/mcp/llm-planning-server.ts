#!/usr/bin/env bun

/**
 * LLM Planning MCP Server
 * 
 * This MCP server provides tools for LLM-based planning and optimization
 * as described in PRD-LLM-BASED-PLANNING.md
 * 
 * Tools provided:
 * - generate_optimized_plan: Generate optimized plans using LLM analysis
 * - analyze_system_logs: Analyze system logs for patterns and bottlenecks
 * - get_optimization_recommendations: Get system optimization recommendations
 * - get_planning_metrics: Get planning performance metrics
 * - analyze_metadata_quality: Analyze and optimize metadata quality
 * - predict_resource_usage: Predict future resource usage patterns
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initDatabase } from '../db';
import { logger } from '../utils/logger';
import { getLlmPlanningService } from '../services/llm-planning-service';
import type { 
    LlmPlanningRequest, 
    LogAnalysisRequest,
    MetadataQualityAnalysis 
} from '../types/llm-planning';

class LlmPlanningMCPServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'llm-planning-server',
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
            console.error('LLM Planning MCP server database initialized');
            this.setupToolHandlers();
        } catch (error) {
            console.error('Failed to initialize LLM Planning MCP server:', error);
        }
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'generate_optimized_plan',
                        description: 'Generate an optimized plan using LLM analysis of system patterns and context',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                goal: { type: 'string', description: 'The goal or objective for the plan' },
                                context: { type: 'string', description: 'Additional context for planning' },
                                constraints: { type: 'array', items: { type: 'string' }, description: 'Constraints to consider' },
                                preferred_approach: { type: 'string', description: 'Preferred approach or strategy' },
                                max_subtasks: { type: 'number', description: 'Maximum number of subtasks', default: 10 },
                                model: { type: 'string', description: 'LLM model to use', default: 'qwen3:8b' },
                                use_advanced_model: { type: 'boolean', description: 'Use advanced model for complex planning', default: false },
                                with_analysis: { type: 'boolean', description: 'Include detailed system analysis', default: true }
                            },
                            required: ['goal']
                        }
                    },
                    {
                        name: 'analyze_system_logs',
                        description: 'Analyze system logs for patterns, bottlenecks, and optimization opportunities',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_hours: { type: 'number', description: 'Time range for analysis in hours', default: 24 },
                                log_level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'], description: 'Minimum log level to analyze' },
                                include_patterns: { type: 'boolean', description: 'Include pattern detection', default: true },
                                generate_recommendations: { type: 'boolean', description: 'Generate optimization recommendations', default: false },
                                model: { type: 'string', description: 'LLM model for analysis', default: 'qwen3:8b' }
                            }
                        }
                    },
                    {
                        name: 'get_optimization_recommendations',
                        description: 'Get system optimization recommendations based on performance analysis',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                category: { type: 'string', enum: ['performance', 'resource', 'metadata', 'all'], description: 'Category of recommendations', default: 'all' },
                                min_impact_score: { type: 'number', description: 'Minimum impact score threshold', default: 0 },
                                implementation_difficulty: { type: 'string', enum: ['low', 'medium', 'high', 'all'], description: 'Filter by implementation difficulty', default: 'all' },
                                limit: { type: 'number', description: 'Maximum number of recommendations', default: 10 }
                            }
                        }
                    },
                    {
                        name: 'get_planning_metrics',
                        description: 'Get comprehensive planning performance metrics and system health indicators',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                include_trends: { type: 'boolean', description: 'Include trend analysis', default: true },
                                include_health_score: { type: 'boolean', description: 'Include system health score', default: true },
                                time_range_hours: { type: 'number', description: 'Time range for metrics', default: 168 }
                            }
                        }
                    },
                    {
                        name: 'analyze_metadata_quality',
                        description: 'Analyze metadata quality and generate improvement recommendations',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                collection: { type: 'string', description: 'Filter by collection/category' },
                                min_completeness: { type: 'number', description: 'Minimum completeness threshold', default: 0 },
                                include_recommendations: { type: 'boolean', description: 'Include improvement recommendations', default: true },
                                detailed_analysis: { type: 'boolean', description: 'Include detailed field-by-field analysis', default: false }
                            }
                        }
                    },
                    {
                        name: 'predict_resource_usage',
                        description: 'Predict future resource usage patterns and generate allocation recommendations',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                resource_type: { type: 'string', enum: ['cpu', 'memory', 'disk', 'network', 'all'], description: 'Type of resource to predict', default: 'all' },
                                prediction_window_hours: { type: 'number', description: 'Prediction window in hours', default: 24 },
                                confidence_threshold: { type: 'number', description: 'Minimum confidence threshold', default: 0.7 },
                                model: { type: 'string', description: 'LLM model for prediction', default: 'qwen3:8b' }
                            }
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'generate_optimized_plan':
                        return await this.generateOptimizedPlan(args);
                    case 'analyze_system_logs':
                        return await this.analyzeSystemLogs(args);
                    case 'get_optimization_recommendations':
                        return await this.getOptimizationRecommendations(args);
                    case 'get_planning_metrics':
                        return await this.getPlanningMetrics(args);
                    case 'analyze_metadata_quality':
                        return await this.analyzeMetadataQuality(args);
                    case 'predict_resource_usage':
                        return await this.predictResourceUsage(args);
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
                    ]
                };
            }
        });
    }

    private async generateOptimizedPlan(args: any) {
        const request: LlmPlanningRequest = {
            goal: args.goal,
            context: args.context,
            constraints: args.constraints,
            preferred_approach: args.preferred_approach,
            max_subtasks: args.max_subtasks,
            model: args.model,
            useAdvancedModel: args.use_advanced_model,
            withAnalysis: args.with_analysis,
            include_similar_tasks: true
        };

        const llmPlanningService = getLlmPlanningService();
        const result = await llmPlanningService.generateOptimizedPlan(request);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: result.success,
                        plan: result.plan,
                        optimization_score: result.optimizationScore,
                        resource_efficiency: result.resourceEfficiency,
                        model_used: result.modelUsed,
                        context_used: result.contextUsed,
                        error: result.error
                    }, null, 2)
                }
            ]
        };
    }

    private async analyzeSystemLogs(args: any) {
        const timeRangeHours = args.time_range_hours || 24;
        const llmPlanningService = getLlmPlanningService();
        const patterns = await llmPlanningService.analyzeSystemLogs(timeRangeHours);

        let recommendations = [];
        if (args.generate_recommendations) {
            recommendations = await llmPlanningService.generateOptimizationRecommendations();
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        time_range_hours: timeRangeHours,
                        patterns_found: patterns.length,
                        patterns: patterns,
                        recommendations: recommendations,
                        analysis_timestamp: new Date().toISOString()
                    }, null, 2)
                }
            ]
        };
    }

    private async getOptimizationRecommendations(args: any) {
        const llmPlanningService = getLlmPlanningService();
        const allRecommendations = await llmPlanningService.generateOptimizationRecommendations();
        
        // Filter recommendations based on criteria
        let filteredRecommendations = allRecommendations;
        
        if (args.category && args.category !== 'all') {
            filteredRecommendations = filteredRecommendations.filter(r => r.recommendation_type === args.category);
        }
        
        if (args.min_impact_score) {
            filteredRecommendations = filteredRecommendations.filter(r => r.impact_score >= args.min_impact_score);
        }
        
        if (args.implementation_difficulty && args.implementation_difficulty !== 'all') {
            filteredRecommendations = filteredRecommendations.filter(r => r.implementation_difficulty === args.implementation_difficulty);
        }
        
        // Sort by impact score and limit results
        filteredRecommendations = filteredRecommendations
            .sort((a, b) => b.impact_score - a.impact_score)
            .slice(0, args.limit || 10);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        total_recommendations: allRecommendations.length,
                        filtered_recommendations: filteredRecommendations.length,
                        recommendations: filteredRecommendations,
                        filters_applied: {
                            category: args.category,
                            min_impact_score: args.min_impact_score,
                            implementation_difficulty: args.implementation_difficulty
                        }
                    }, null, 2)
                }
            ]
        };
    }

    private async getPlanningMetrics(args: any) {
        const llmPlanningService = getLlmPlanningService();
        const metrics = await llmPlanningService.getPlanningMetrics();

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        metrics,
                        generated_at: new Date().toISOString(),
                        time_range_hours: args.time_range_hours || 168
                    }, null, 2)
                }
            ]
        };
    }

    private async analyzeMetadataQuality(args: any) {
        // This would integrate with the metadata analysis functionality
        // For now, return a placeholder response
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Metadata quality analysis functionality available via CLI: bun run optimize-metadata',
                        collection: args.collection,
                        analysis_available: true,
                        cli_command: `bun run optimize-metadata ${args.collection ? `--collection "${args.collection}"` : ''} --analyze-only`
                    }, null, 2)
                }
            ]
        };
    }

    private async predictResourceUsage(args: any) {
        // This would integrate with resource prediction functionality
        // For now, return a placeholder response
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Resource usage prediction functionality is under development',
                        resource_type: args.resource_type,
                        prediction_window_hours: args.prediction_window_hours,
                        confidence_threshold: args.confidence_threshold,
                        status: 'coming_soon'
                    }, null, 2)
                }
            ]
        };
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('LLM Planning MCP server running on stdio');
    }
}

// Run the server
const server = new LlmPlanningMCPServer();
server.run().catch(console.error);
