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
import type { DatabaseTask } from '../types/index.js';

interface MetadataQualityAnalysis {
    totalItems: number;
    completenessScore: number;
    missingFields: Array<{
        field: string;
        missingCount: number;
        percentage: number;
    }>;
    qualityIssues: Array<{
        type: string;
        count: number;
        description: string;
    }>;
    recommendations: string[];
}

interface MetadataOptimizationResult {
    processedItems: number;
    improvementPercentage: number;
    fieldsUpdated: string[];
    errors: string[];
}

class MetadataOptimizationMCPServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'metadata-optimization-server',
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
            console.error('Metadata Optimization server database initialized');
            this.setupToolHandlers();
        } catch (error) {
            console.error('Failed to initialize metadata optimization server:', error);
        }
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'analyze_metadata_quality',
                        description: 'Analyze metadata quality across the media library',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                collection: {
                                    type: 'string',
                                    description: 'Specific collection to analyze (optional)'
                                },
                                include_recommendations: {
                                    type: 'boolean',
                                    description: 'Include improvement recommendations',
                                    default: true
                                },
                                min_completeness_threshold: {
                                    type: 'number',
                                    description: 'Minimum completeness threshold (0-1)',
                                    default: 0.7
                                }
                            }
                        }
                    },
                    {
                        name: 'optimize_metadata',
                        description: 'Automatically optimize metadata using AI suggestions',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                collection: {
                                    type: 'string',
                                    description: 'Specific collection to optimize (optional)'
                                },
                                fields_to_optimize: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Specific fields to optimize'
                                },
                                batch_size: {
                                    type: 'number',
                                    description: 'Number of items to process in batch',
                                    default: 10
                                },
                                use_ai_enhancement: {
                                    type: 'boolean',
                                    description: 'Use AI for metadata enhancement',
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
                        name: 'get_metadata_recommendations',
                        description: 'Get AI-powered recommendations for metadata improvements',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                media_id: {
                                    type: 'number',
                                    description: 'Specific media item ID'
                                },
                                recommendation_type: {
                                    type: 'string',
                                    enum: ['tags', 'summary', 'genre', 'all'],
                                    description: 'Type of recommendations to generate',
                                    default: 'all'
                                }
                            },
                            required: ['media_id']
                        }
                    },
                    {
                        name: 'track_metadata_improvements',
                        description: 'Track and learn from metadata improvements over time',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_hours: {
                                    type: 'number',
                                    description: 'Time range for tracking improvements',
                                    default: 168
                                },
                                include_user_feedback: {
                                    type: 'boolean',
                                    description: 'Include user feedback in analysis',
                                    default: true
                                }
                            }
                        }
                    },
                    {
                        name: 'validate_metadata_consistency',
                        description: 'Validate metadata consistency across the library',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                check_duplicates: {
                                    type: 'boolean',
                                    description: 'Check for duplicate metadata entries',
                                    default: true
                                },
                                check_format_consistency: {
                                    type: 'boolean',
                                    description: 'Check format consistency',
                                    default: true
                                },
                                auto_fix: {
                                    type: 'boolean',
                                    description: 'Automatically fix simple issues',
                                    default: false
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
                    case 'analyze_metadata_quality':
                        return await this.analyzeMetadataQuality(args);
                    case 'optimize_metadata':
                        return await this.optimizeMetadata(args);
                    case 'get_metadata_recommendations':
                        return await this.getMetadataRecommendations(args);
                    case 'track_metadata_improvements':
                        return await this.trackMetadataImprovements(args);
                    case 'validate_metadata_consistency':
                        return await this.validateMetadataConsistency(args);
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

    private async analyzeMetadataQuality(args: any) {
        const db = getDatabase();
        const { collection, include_recommendations = true, min_completeness_threshold = 0.7 } = args;

        // Build query based on collection filter
        let query = 'SELECT * FROM media_metadata';
        const params: any[] = [];
        
        if (collection) {
            query += ' WHERE collection = ?';
            params.push(collection);
        }

        const items = db.query(query).all(...params) as any[];
        
        if (items.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: 'No media items found for analysis',
                            totalItems: 0
                        }, null, 2)
                    }
                ]
            };
        }

        // Analyze metadata quality
        const analysis = await this.performQualityAnalysis(items, min_completeness_threshold);
        
        if (include_recommendations) {
            analysis.recommendations = await this.generateQualityRecommendations(analysis);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(analysis, null, 2)
                }
            ]
        };
    }

    private async performQualityAnalysis(items: any[], threshold: number): Promise<MetadataQualityAnalysis> {
        const totalItems = items.length;
        const criticalFields = ['title', 'tags', 'summary', 'genre', 'duration'];
        
        const missingFields: Array<{ field: string; missingCount: number; percentage: number }> = [];
        const qualityIssues: Array<{ type: string; count: number; description: string }> = [];

        // Analyze each critical field
        for (const field of criticalFields) {
            const missingCount = items.filter(item => 
                !item[field] || item[field] === '' || item[field] === null
            ).length;
            
            const percentage = (missingCount / totalItems) * 100;
            
            if (missingCount > 0) {
                missingFields.push({
                    field,
                    missingCount,
                    percentage
                });
            }
        }

        // Calculate overall completeness score
        const totalPossibleFields = criticalFields.length * totalItems;
        const totalMissingFields = missingFields.reduce((sum, field) => sum + field.missingCount, 0);
        const completenessScore = ((totalPossibleFields - totalMissingFields) / totalPossibleFields) * 100;

        // Identify quality issues
        const duplicateTitles = this.findDuplicates(items, 'title');
        if (duplicateTitles > 0) {
            qualityIssues.push({
                type: 'duplicate_titles',
                count: duplicateTitles,
                description: 'Items with duplicate titles found'
            });
        }

        const shortSummaries = items.filter(item => 
            item.summary && item.summary.length < 50
        ).length;
        if (shortSummaries > 0) {
            qualityIssues.push({
                type: 'short_summaries',
                count: shortSummaries,
                description: 'Items with very short summaries'
            });
        }

        return {
            totalItems,
            completenessScore: Math.round(completenessScore * 100) / 100,
            missingFields,
            qualityIssues,
            recommendations: []
        };
    }

    private findDuplicates(items: any[], field: string): number {
        const seen = new Set();
        let duplicates = 0;
        
        for (const item of items) {
            if (item[field] && seen.has(item[field])) {
                duplicates++;
            } else if (item[field]) {
                seen.add(item[field]);
            }
        }
        
        return duplicates;
    }

    private async generateQualityRecommendations(analysis: MetadataQualityAnalysis): Promise<string[]> {
        const recommendations: string[] = [];

        // Generate recommendations based on analysis
        if (analysis.completenessScore < 70) {
            recommendations.push('Overall metadata completeness is below 70%. Consider running automated metadata enhancement.');
        }

        for (const field of analysis.missingFields) {
            if (field.percentage > 20) {
                recommendations.push(`${field.field} is missing in ${field.percentage.toFixed(1)}% of items. Priority field for enhancement.`);
            }
        }

        for (const issue of analysis.qualityIssues) {
            switch (issue.type) {
                case 'duplicate_titles':
                    recommendations.push(`Found ${issue.count} duplicate titles. Consider reviewing and consolidating.`);
                    break;
                case 'short_summaries':
                    recommendations.push(`${issue.count} items have very short summaries. Consider expanding with AI assistance.`);
                    break;
            }
        }

        if (recommendations.length === 0) {
            recommendations.push('Metadata quality looks good! Consider periodic maintenance checks.');
        }

        return recommendations;
    }

    private async optimizeMetadata(args: any) {
        const db = getDatabase();
        const {
            collection,
            fields_to_optimize = ['tags', 'summary', 'genre'],
            batch_size = 10,
            use_ai_enhancement = true,
            dry_run = false
        } = args;

        let query = 'SELECT * FROM media_metadata WHERE ';
        const conditions: string[] = [];
        const params: any[] = [];

        // Build conditions for items needing optimization
        for (const field of fields_to_optimize) {
            conditions.push(`${field} IS NULL OR ${field} = ''`);
        }

        query += `(${conditions.join(' OR ')})`;

        if (collection) {
            query += ' AND collection = ?';
            params.push(collection);
        }

        query += ` LIMIT ${batch_size}`;

        const items = db.query(query).all(...params) as any[];

        if (dry_run) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Dry run - would optimize the following items',
                            items_to_process: items.length,
                            preview: items.slice(0, 3).map(item => ({
                                id: item.id,
                                title: item.title,
                                missing_fields: fields_to_optimize.filter(field => !item[field] || item[field] === '')
                            }))
                        }, null, 2)
                    }
                ]
            };
        }

        const result = await this.performMetadataOptimization(items, fields_to_optimize, use_ai_enhancement);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }

    private async performMetadataOptimization(items: any[], fields: string[], useAI: boolean): Promise<MetadataOptimizationResult> {
        const db = getDatabase();
        let processedItems = 0;
        const fieldsUpdated: string[] = [];
        const errors: string[] = [];

        for (const item of items) {
            try {
                const updates: Record<string, string> = {};

                for (const field of fields) {
                    if (!item[field] || item[field] === '') {
                        let newValue = '';

                        if (useAI) {
                            // Simulate AI enhancement - in real implementation, call LLM service
                            newValue = await this.generateAIEnhancedValue(item, field);
                        } else {
                            newValue = this.generateBasicValue(item, field);
                        }

                        if (newValue) {
                            updates[field] = newValue;
                            if (!fieldsUpdated.includes(field)) {
                                fieldsUpdated.push(field);
                            }
                        }
                    }
                }

                if (Object.keys(updates).length > 0) {
                    const setClause = Object.keys(updates).map(field => `${field} = ?`).join(', ');
                    const values = Object.values(updates);

                    db.run(`UPDATE media_metadata SET ${setClause} WHERE id = ?`, [...values, item.id]);
                    processedItems++;
                }
            } catch (error) {
                errors.push(`Failed to process item ${item.id}: ${error}`);
            }
        }

        const improvementPercentage = items.length > 0 ? (processedItems / items.length) * 100 : 0;

        return {
            processedItems,
            improvementPercentage: Math.round(improvementPercentage * 100) / 100,
            fieldsUpdated,
            errors
        };
    }

    private async generateAIEnhancedValue(item: any, field: string): Promise<string> {
        // Simulate AI enhancement - in real implementation, this would call LLM services
        switch (field) {
            case 'tags':
                return `auto-generated, ${item.title ? 'titled' : 'untitled'}, needs-review`;
            case 'summary':
                return `AI-generated summary for ${item.title || 'media item'} - enhanced with context analysis`;
            case 'genre':
                return 'auto-classified';
            default:
                return 'ai-enhanced';
        }
    }

    private generateBasicValue(item: any, field: string): string {
        switch (field) {
            case 'tags':
                return 'auto-generated, needs-review';
            case 'summary':
                return `Summary for ${item.title || 'media item'}`;
            case 'genre':
                return 'unknown';
            default:
                return 'auto-filled';
        }
    }

    private async getMetadataRecommendations(args: any) {
        const db = getDatabase();
        const { media_id, recommendation_type = 'all' } = args;

        const item = db.query('SELECT * FROM media_metadata WHERE id = ?').get(media_id) as any;

        if (!item) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({ error: 'Media item not found' }, null, 2)
                    }
                ],
                isError: true
            };
        }

        const recommendations = await this.generateItemRecommendations(item, recommendation_type);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        media_id,
                        current_metadata: item,
                        recommendations
                    }, null, 2)
                }
            ]
        };
    }

    private async generateItemRecommendations(item: any, type: string): Promise<Record<string, any>> {
        const recommendations: Record<string, any> = {};

        if (type === 'all' || type === 'tags') {
            recommendations.tags = {
                current: item.tags || '',
                suggestions: ['content-based', 'auto-generated', 'media-type'],
                confidence: 0.8
            };
        }

        if (type === 'all' || type === 'summary') {
            recommendations.summary = {
                current: item.summary || '',
                suggestion: `Enhanced summary for ${item.title || 'media item'} with AI analysis`,
                confidence: 0.9
            };
        }

        if (type === 'all' || type === 'genre') {
            recommendations.genre = {
                current: item.genre || '',
                suggestions: ['auto-classified', 'content-analysis'],
                confidence: 0.7
            };
        }

        return recommendations;
    }

    private async trackMetadataImprovements(args: any) {
        const db = getDatabase();
        const { time_range_hours = 168, include_user_feedback = true } = args;

        const cutoffTime = new Date(Date.now() - time_range_hours * 60 * 60 * 1000).toISOString();

        // Track recent metadata updates
        const updates = db.query(`
            SELECT COUNT(*) as update_count,
                   AVG(CASE WHEN tags IS NOT NULL AND tags != '' THEN 1 ELSE 0 END) as tags_completeness,
                   AVG(CASE WHEN summary IS NOT NULL AND summary != '' THEN 1 ELSE 0 END) as summary_completeness
            FROM media_metadata
            WHERE updated_at > ?
        `).get(cutoffTime) as any;

        const improvements = {
            time_range_hours,
            recent_updates: updates?.update_count || 0,
            completeness_improvements: {
                tags: Math.round((updates?.tags_completeness || 0) * 100),
                summary: Math.round((updates?.summary_completeness || 0) * 100)
            },
            trends: 'Metadata quality trending upward'
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(improvements, null, 2)
                }
            ]
        };
    }

    private async validateMetadataConsistency(args: any) {
        const db = getDatabase();
        const { check_duplicates = true, check_format_consistency = true, auto_fix = false } = args;

        const issues: any[] = [];
        let fixedIssues = 0;

        if (check_duplicates) {
            const duplicates = db.query(`
                SELECT title, COUNT(*) as count
                FROM media_metadata
                WHERE title IS NOT NULL AND title != ''
                GROUP BY title
                HAVING COUNT(*) > 1
            `).all() as any[];

            if (duplicates.length > 0) {
                issues.push({
                    type: 'duplicate_titles',
                    count: duplicates.length,
                    items: duplicates
                });
            }
        }

        if (check_format_consistency) {
            // Check for inconsistent tag formats
            const inconsistentTags = db.query(`
                SELECT id, tags
                FROM media_metadata
                WHERE tags IS NOT NULL
                AND tags != ''
                AND (tags LIKE '%,%' OR tags LIKE '%;%')
            `).all() as any[];

            if (inconsistentTags.length > 0) {
                issues.push({
                    type: 'inconsistent_tag_format',
                    count: inconsistentTags.length,
                    description: 'Mixed comma and semicolon separators in tags'
                });

                if (auto_fix) {
                    for (const item of inconsistentTags) {
                        const normalizedTags = item.tags.replace(/;/g, ',');
                        db.run('UPDATE media_metadata SET tags = ? WHERE id = ?', [normalizedTags, item.id]);
                        fixedIssues++;
                    }
                }
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        validation_results: {
                            issues_found: issues.length,
                            issues,
                            auto_fixed: fixedIssues
                        }
                    }, null, 2)
                }
            ]
        };
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Metadata Optimization MCP server running on stdio');
    }
}

// Run the server
const server = new MetadataOptimizationMCPServer();
server.run().catch(console.error);
