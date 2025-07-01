#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ChromaClient } from 'chromadb';
import { config } from '../config';
import { embeddingManager } from '../memory/embeddings.js';
import type { TaskEmbedding } from '../types/index.js';

interface ChromaDBServerConfig {
    host: string;
    port: number;
    ssl: boolean;
}

class ChromaDBMCPServer {
    private server: Server;
    private client: ChromaClient;
    private config: ChromaDBServerConfig;

    constructor() {
        this.config = {
            host: config.paths.chroma.host,
            port: config.paths.chroma.port,
            ssl: config.paths.chroma.ssl
        };

        this.client = new ChromaClient({
            host: this.config.host,
            port: this.config.port,
            ssl: this.config.ssl
        });

        this.server = new Server(
            {
                name: 'chromadb-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupToolHandlers();
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'find_similar_tasks',
                        description: 'Find tasks similar to a given query using vector similarity search',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: 'The query text to find similar tasks for'
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Maximum number of results to return',
                                    default: 5
                                },
                                status_filter: {
                                    type: 'string',
                                    description: 'Filter by task status (completed, failed, etc.)',
                                    enum: ['completed', 'failed', 'pending', 'running', 'blocked', 'skipped', 'retrying']
                                },
                                type_filter: {
                                    type: 'string',
                                    description: 'Filter by task type (tool, batch, etc.)'
                                }
                            },
                            required: ['query']
                        }
                    },
                    {
                        name: 'analyze_task_patterns',
                        description: 'Analyze patterns in completed tasks to provide insights',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                task_type: {
                                    type: 'string',
                                    description: 'Analyze patterns for specific task type'
                                },
                                time_range_days: {
                                    type: 'number',
                                    description: 'Number of days to look back for analysis',
                                    default: 30
                                }
                            }
                        }
                    },
                    {
                        name: 'get_task_recommendations',
                        description: 'Get recommendations for improving task execution based on historical data',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                current_task_description: {
                                    type: 'string',
                                    description: 'Description of the current task to get recommendations for'
                                },
                                task_type: {
                                    type: 'string',
                                    description: 'Type of the current task'
                                }
                            },
                            required: ['current_task_description']
                        }
                    },
                    {
                        name: 'batch_add_embeddings',
                        description: 'Add multiple task embeddings in batch for better performance',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                tasks: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'string' },
                                            taskId: { type: ['string', 'number'] },
                                            description: { type: 'string' },
                                            type: { type: 'string' },
                                            status: { type: 'string' },
                                            result: { type: 'object' },
                                            metadata: { type: 'object' }
                                        },
                                        required: ['id', 'taskId', 'description', 'type', 'status']
                                    }
                                }
                            },
                            required: ['tasks']
                        }
                    },
                    {
                        name: 'search_by_metadata',
                        description: 'Search tasks by metadata fields with optional similarity scoring',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                metadata_filters: {
                                    type: 'object',
                                    description: 'Key-value pairs to filter by metadata'
                                },
                                similarity_query: {
                                    type: 'string',
                                    description: 'Optional text query for similarity search within filtered results'
                                },
                                limit: {
                                    type: 'number',
                                    default: 10
                                }
                            },
                            required: ['metadata_filters']
                        }
                    }
                ] as Tool[]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'find_similar_tasks':
                        return await this.findSimilarTasks(args);
                    case 'analyze_task_patterns':
                        return await this.analyzeTaskPatterns(args);
                    case 'get_task_recommendations':
                        return await this.getTaskRecommendations(args);
                    case 'batch_add_embeddings':
                        return await this.batchAddEmbeddings(args);
                    case 'search_by_metadata':
                        return await this.searchByMetadata(args);
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

    private async findSimilarTasks(args: any) {
        const { query, limit = 5, status_filter, type_filter } = args;

        try {
            // Use the existing embedding manager to find similar tasks
            const similarTasks = await embeddingManager.findSimilarTasks(query, limit);

            // Apply additional filters if provided
            let filteredTasks = similarTasks;
            if (status_filter) {
                filteredTasks = filteredTasks.filter(task => task.status === status_filter);
            }
            if (type_filter) {
                filteredTasks = filteredTasks.filter(task => task.type === type_filter);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            query,
                            results: filteredTasks,
                            total_found: filteredTasks.length,
                            filters_applied: { status_filter, type_filter }
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to find similar tasks: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async analyzeTaskPatterns(args: any) {
        const { task_type, time_range_days = 30 } = args;

        try {
            const collection = await this.client.getCollection({ name: 'task_embeddings' });

            // Get all tasks within time range
            const results = await collection.get({
                limit: 1000, // Reasonable limit for analysis
                include: ['metadatas']
            });

            const tasks = results.metadatas || [];

            // Filter by task type if specified
            const filteredTasks = task_type
                ? tasks.filter((task: any) => task?.type === task_type)
                : tasks;

            // Analyze patterns
            const patterns = this.analyzePatterns(filteredTasks);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            analysis_period_days: time_range_days,
                            task_type_filter: task_type,
                            total_tasks_analyzed: filteredTasks.length,
                            patterns
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to analyze task patterns: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private analyzePatterns(tasks: any[]) {
        const statusCounts: Record<string, number> = {};
        const typeCounts: Record<string, number> = {};
        const commonErrors: Record<string, number> = {};

        tasks.forEach((task: any) => {
            // Count statuses
            const status = task?.status || 'unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;

            // Count types
            const type = task?.type || 'unknown';
            typeCounts[type] = (typeCounts[type] || 0) + 1;

            // Analyze errors
            if (status === 'failed' && task?.result) {
                try {
                    const result = typeof task.result === 'string' ? JSON.parse(task.result) : task.result;
                    if (result?.error) {
                        const errorKey = result.error.substring(0, 100); // First 100 chars
                        commonErrors[errorKey] = (commonErrors[errorKey] || 0) + 1;
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            }
        });

        return {
            status_distribution: statusCounts,
            type_distribution: typeCounts,
            success_rate: tasks.length > 0 ? (statusCounts.completed || 0) / tasks.length : 0,
            common_errors: Object.entries(commonErrors)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([error, count]) => ({ error, count }))
        };
    }

    private async getTaskRecommendations(args: any) {
        const { current_task_description, task_type } = args;

        try {
            // Find similar successful tasks
            const similarTasks = await embeddingManager.findSimilarTasks(current_task_description, 10);
            const successfulTasks = similarTasks.filter(task => task.status === 'completed');

            // Analyze what made them successful
            const recommendations = this.generateRecommendations(successfulTasks, current_task_description, task_type);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            current_task: current_task_description,
                            similar_successful_tasks: successfulTasks.length,
                            recommendations
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get task recommendations: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private generateRecommendations(successfulTasks: TaskEmbedding[], currentDescription: string, taskType?: string) {
        const recommendations: string[] = [];

        if (successfulTasks.length === 0) {
            recommendations.push("No similar successful tasks found. Consider breaking down the task into smaller components.");
            return recommendations;
        }

        // Analyze common patterns in successful tasks
        const commonTools = new Map<string, number>();
        const commonMetadata = new Map<string, number>();

        successfulTasks.forEach(task => {
            if (task.metadata) {
                Object.entries(task.metadata).forEach(([key, value]) => {
                    if (typeof value === 'string' && value.length < 100) {
                        const metaKey = `${key}:${value}`;
                        commonMetadata.set(metaKey, (commonMetadata.get(metaKey) || 0) + 1);
                    }
                });
            }
        });

        // Generate recommendations based on patterns
        if (commonMetadata.size > 0) {
            const topMetadata = Array.from(commonMetadata.entries())
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3);

            recommendations.push(`Common success patterns: ${topMetadata.map(([key]) => key).join(', ')}`);
        }

        recommendations.push(`Based on ${successfulTasks.length} similar successful tasks, consider similar approaches.`);

        return recommendations;
    }

    private async batchAddEmbeddings(args: any) {
        const { tasks } = args;

        try {
            const results = [];
            for (const task of tasks) {
                try {
                    await embeddingManager.addTaskEmbedding(task);
                    results.push({ id: task.id, status: 'success' });
                } catch (error) {
                    results.push({
                        id: task.id,
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            total_tasks: tasks.length,
                            successful: results.filter(r => r.status === 'success').length,
                            failed: results.filter(r => r.status === 'error').length,
                            results
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to batch add embeddings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async searchByMetadata(args: any) {
        const { metadata_filters, similarity_query, limit = 10 } = args;

        try {
            const collection = await this.client.getCollection({ name: 'task_embeddings' });

            // Build where clause for metadata filtering
            const whereClause: Record<string, any> = {};
            Object.entries(metadata_filters).forEach(([key, value]) => {
                whereClause[key] = value;
            });

            let results;
            if (similarity_query) {
                // Use similarity search with metadata filtering
                const queryEmbedding = await embeddingManager.generateEmbedding(similarity_query);
                results = await collection.query({
                    queryEmbeddings: [queryEmbedding],
                    nResults: limit,
                    where: whereClause,
                    include: ['metadatas', 'distances']
                });
            } else {
                // Just metadata filtering
                results = await collection.get({
                    where: whereClause,
                    limit,
                    include: ['metadatas']
                });
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            metadata_filters,
                            similarity_query,
                            results: {
                                ids: results.ids,
                                metadatas: results.metadatas,
                                distances: 'distances' in results ? results.distances : null
                            },
                            total_found: results.ids?.[0]?.length || results.ids?.length || 0
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to search by metadata: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('ChromaDB MCP server running on stdio');
    }
}

// Run the server
const server = new ChromaDBMCPServer();
server.run().catch(console.error);
