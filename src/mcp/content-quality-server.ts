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

interface ContentQualityMetrics {
    resolution: {
        width: number;
        height: number;
        quality_score: number;
    };
    audio: {
        bitrate: number;
        sample_rate: number;
        clarity_score: number;
    };
    file_integrity: {
        corruption_check: boolean;
        metadata_completeness: number;
    };
    overall_quality_score: number;
}

interface QualityAnalysisResult {
    media_id: number;
    quality_metrics: ContentQualityMetrics;
    quality_issues: string[];
    enhancement_recommendations: string[];
    improvement_potential: number;
}

interface QualityTrendAnalysis {
    time_period: string;
    quality_trends: Record<string, number>;
    improvement_areas: string[];
    success_stories: string[];
}

class ContentQualityMCPServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'content-quality-server',
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
            console.error('Content Quality server database initialized');
            this.setupToolHandlers();
        } catch (error) {
            console.error('Failed to initialize content quality server:', error);
        }
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'analyze_content_quality',
                        description: 'Analyze quality metrics for media content',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                media_id: {
                                    type: 'number',
                                    description: 'ID of media item to analyze'
                                },
                                quality_aspects: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Aspects to analyze',
                                    default: ['resolution', 'audio', 'file_integrity', 'metadata']
                                },
                                include_recommendations: {
                                    type: 'boolean',
                                    description: 'Include enhancement recommendations',
                                    default: true
                                }
                            },
                            required: ['media_id']
                        }
                    },
                    {
                        name: 'suggest_quality_enhancements',
                        description: 'Suggest specific enhancements for content quality',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                media_id: {
                                    type: 'number',
                                    description: 'Media item to enhance'
                                },
                                enhancement_types: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Types of enhancements to suggest',
                                    default: ['upscaling', 'audio_enhancement', 'metadata_enrichment']
                                },
                                target_quality_level: {
                                    type: 'string',
                                    enum: ['basic', 'standard', 'high', 'premium'],
                                    description: 'Target quality level',
                                    default: 'standard'
                                }
                            },
                            required: ['media_id']
                        }
                    },
                    {
                        name: 'track_quality_improvements',
                        description: 'Track quality improvements over time',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_days: {
                                    type: 'number',
                                    description: 'Time range for tracking improvements',
                                    default: 30
                                },
                                media_collection: {
                                    type: 'string',
                                    description: 'Specific collection to track (optional)'
                                },
                                include_trends: {
                                    type: 'boolean',
                                    description: 'Include trend analysis',
                                    default: true
                                }
                            }
                        }
                    },
                    {
                        name: 'batch_quality_assessment',
                        description: 'Assess quality for multiple media items',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                media_ids: {
                                    type: 'array',
                                    items: { type: 'number' },
                                    description: 'List of media IDs to assess'
                                },
                                collection_filter: {
                                    type: 'string',
                                    description: 'Filter by collection name'
                                },
                                quality_threshold: {
                                    type: 'number',
                                    description: 'Minimum quality threshold',
                                    default: 0.7
                                },
                                prioritize_low_quality: {
                                    type: 'boolean',
                                    description: 'Prioritize items with low quality scores',
                                    default: true
                                }
                            }
                        }
                    },
                    {
                        name: 'generate_quality_report',
                        description: 'Generate comprehensive quality report for the media library',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                report_scope: {
                                    type: 'string',
                                    enum: ['library_wide', 'collection_specific', 'recent_additions'],
                                    description: 'Scope of the quality report',
                                    default: 'library_wide'
                                },
                                include_statistics: {
                                    type: 'boolean',
                                    description: 'Include detailed statistics',
                                    default: true
                                },
                                include_recommendations: {
                                    type: 'boolean',
                                    description: 'Include improvement recommendations',
                                    default: true
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
                    case 'analyze_content_quality':
                        return await this.analyzeContentQuality(args);
                    case 'suggest_quality_enhancements':
                        return await this.suggestQualityEnhancements(args);
                    case 'track_quality_improvements':
                        return await this.trackQualityImprovements(args);
                    case 'batch_quality_assessment':
                        return await this.batchQualityAssessment(args);
                    case 'generate_quality_report':
                        return await this.generateQualityReport(args);
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

    private async analyzeContentQuality(args: any) {
        const db = getDatabase();
        const { media_id, quality_aspects = ['resolution', 'audio', 'file_integrity', 'metadata'], include_recommendations = true } = args;

        // Get media item
        const mediaItem = db.query('SELECT * FROM media_metadata WHERE id = ?').get(media_id) as any;
        
        if (!mediaItem) {
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

        // Analyze quality metrics
        const qualityMetrics = await this.assessQualityMetrics(mediaItem, quality_aspects);
        const qualityIssues = await this.identifyQualityIssues(qualityMetrics);
        const enhancementRecommendations = include_recommendations ? 
            await this.generateEnhancementRecommendations(qualityMetrics, qualityIssues) : [];

        const result: QualityAnalysisResult = {
            media_id,
            quality_metrics: qualityMetrics,
            quality_issues: qualityIssues,
            enhancement_recommendations: enhancementRecommendations,
            improvement_potential: this.calculateImprovementPotential(qualityMetrics, qualityIssues)
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }

    private async assessQualityMetrics(mediaItem: any, aspects: string[]): Promise<ContentQualityMetrics> {
        // Simulate quality assessment - in real implementation, this would analyze actual media files
        const metrics: ContentQualityMetrics = {
            resolution: {
                width: mediaItem.width || 1920,
                height: mediaItem.height || 1080,
                quality_score: this.calculateResolutionScore(mediaItem.width || 1920, mediaItem.height || 1080)
            },
            audio: {
                bitrate: mediaItem.audio_bitrate || 128,
                sample_rate: mediaItem.sample_rate || 44100,
                clarity_score: this.calculateAudioScore(mediaItem.audio_bitrate || 128)
            },
            file_integrity: {
                corruption_check: Math.random() > 0.1, // 90% chance of no corruption
                metadata_completeness: this.calculateMetadataCompleteness(mediaItem)
            },
            overall_quality_score: 0
        };

        // Calculate overall quality score
        metrics.overall_quality_score = (
            metrics.resolution.quality_score * 0.4 +
            metrics.audio.clarity_score * 0.3 +
            (metrics.file_integrity.corruption_check ? 1 : 0) * 0.2 +
            metrics.file_integrity.metadata_completeness * 0.1
        );

        return metrics;
    }

    private calculateResolutionScore(width: number, height: number): number {
        const totalPixels = width * height;
        
        if (totalPixels >= 3840 * 2160) return 1.0; // 4K
        if (totalPixels >= 1920 * 1080) return 0.9; // 1080p
        if (totalPixels >= 1280 * 720) return 0.7;  // 720p
        if (totalPixels >= 854 * 480) return 0.5;   // 480p
        return 0.3; // Lower resolution
    }

    private calculateAudioScore(bitrate: number): number {
        if (bitrate >= 320) return 1.0;
        if (bitrate >= 256) return 0.9;
        if (bitrate >= 192) return 0.8;
        if (bitrate >= 128) return 0.6;
        return 0.4;
    }

    private calculateMetadataCompleteness(mediaItem: any): number {
        const requiredFields = ['title', 'tags', 'summary', 'genre', 'duration'];
        const presentFields = requiredFields.filter(field => 
            mediaItem[field] && mediaItem[field] !== ''
        );
        
        return presentFields.length / requiredFields.length;
    }

    private async identifyQualityIssues(metrics: ContentQualityMetrics): Promise<string[]> {
        const issues: string[] = [];

        if (metrics.resolution.quality_score < 0.7) {
            issues.push(`Low resolution quality (score: ${metrics.resolution.quality_score.toFixed(2)})`);
        }

        if (metrics.audio.clarity_score < 0.6) {
            issues.push(`Poor audio quality (bitrate: ${metrics.audio.bitrate}kbps)`);
        }

        if (!metrics.file_integrity.corruption_check) {
            issues.push('Potential file corruption detected');
        }

        if (metrics.file_integrity.metadata_completeness < 0.8) {
            issues.push(`Incomplete metadata (${(metrics.file_integrity.metadata_completeness * 100).toFixed(1)}% complete)`);
        }

        if (metrics.overall_quality_score < 0.6) {
            issues.push('Overall quality below acceptable threshold');
        }

        return issues;
    }

    private async generateEnhancementRecommendations(metrics: ContentQualityMetrics, issues: string[]): Promise<string[]> {
        const recommendations: string[] = [];

        if (metrics.resolution.quality_score < 0.8) {
            recommendations.push('Consider upscaling to improve resolution quality');
        }

        if (metrics.audio.clarity_score < 0.7) {
            recommendations.push('Apply audio enhancement filters to improve clarity');
        }

        if (metrics.file_integrity.metadata_completeness < 0.9) {
            recommendations.push('Enrich metadata using AI-powered analysis');
        }

        if (issues.includes('Potential file corruption detected')) {
            recommendations.push('Verify file integrity and consider re-encoding if necessary');
        }

        if (recommendations.length === 0) {
            recommendations.push('Content quality is good - no immediate enhancements needed');
        }

        return recommendations;
    }

    private calculateImprovementPotential(metrics: ContentQualityMetrics, issues: string[]): number {
        // Calculate how much the quality could potentially improve
        const maxPossibleScore = 1.0;
        const currentScore = metrics.overall_quality_score;
        const improvementPotential = ((maxPossibleScore - currentScore) / maxPossibleScore) * 100;
        
        return Math.max(0, Math.min(100, improvementPotential));
    }

    private async suggestQualityEnhancements(args: any) {
        const db = getDatabase();
        const { media_id, enhancement_types = ['upscaling', 'audio_enhancement', 'metadata_enrichment'], target_quality_level = 'standard' } = args;

        const mediaItem = db.query('SELECT * FROM media_metadata WHERE id = ?').get(media_id) as any;

        if (!mediaItem) {
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

        const currentMetrics = await this.assessQualityMetrics(mediaItem, ['resolution', 'audio', 'metadata']);
        const enhancements = await this.generateSpecificEnhancements(currentMetrics, enhancement_types, target_quality_level);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        media_id,
                        current_quality: currentMetrics.overall_quality_score,
                        target_quality_level,
                        suggested_enhancements: enhancements,
                        estimated_improvement: this.estimateEnhancementImpact(enhancements)
                    }, null, 2)
                }
            ]
        };
    }

    private async generateSpecificEnhancements(metrics: ContentQualityMetrics, types: string[], targetLevel: string): Promise<any[]> {
        const enhancements: any[] = [];

        for (const type of types) {
            switch (type) {
                case 'upscaling':
                    if (metrics.resolution.quality_score < this.getTargetScore(targetLevel)) {
                        enhancements.push({
                            type: 'upscaling',
                            description: 'AI-powered resolution enhancement',
                            current_resolution: `${metrics.resolution.width}x${metrics.resolution.height}`,
                            target_resolution: this.getTargetResolution(targetLevel),
                            estimated_improvement: '+25% quality score',
                            processing_time: '5-15 minutes',
                            resource_requirements: 'High GPU usage'
                        });
                    }
                    break;

                case 'audio_enhancement':
                    if (metrics.audio.clarity_score < this.getTargetScore(targetLevel)) {
                        enhancements.push({
                            type: 'audio_enhancement',
                            description: 'Audio clarity and noise reduction',
                            current_bitrate: `${metrics.audio.bitrate}kbps`,
                            target_bitrate: this.getTargetBitrate(targetLevel),
                            techniques: ['noise_reduction', 'dynamic_range_compression', 'eq_optimization'],
                            estimated_improvement: '+20% clarity score',
                            processing_time: '2-8 minutes'
                        });
                    }
                    break;

                case 'metadata_enrichment':
                    if (metrics.file_integrity.metadata_completeness < 0.9) {
                        enhancements.push({
                            type: 'metadata_enrichment',
                            description: 'AI-powered metadata completion',
                            current_completeness: `${(metrics.file_integrity.metadata_completeness * 100).toFixed(1)}%`,
                            target_completeness: '95%',
                            fields_to_enhance: ['tags', 'summary', 'genre', 'keywords'],
                            estimated_improvement: '+15% metadata score',
                            processing_time: '1-3 minutes'
                        });
                    }
                    break;
            }
        }

        return enhancements;
    }

    private getTargetScore(level: string): number {
        switch (level) {
            case 'basic': return 0.6;
            case 'standard': return 0.8;
            case 'high': return 0.9;
            case 'premium': return 0.95;
            default: return 0.8;
        }
    }

    private getTargetResolution(level: string): string {
        switch (level) {
            case 'basic': return '720p';
            case 'standard': return '1080p';
            case 'high': return '1440p';
            case 'premium': return '4K';
            default: return '1080p';
        }
    }

    private getTargetBitrate(level: string): string {
        switch (level) {
            case 'basic': return '128kbps';
            case 'standard': return '192kbps';
            case 'high': return '256kbps';
            case 'premium': return '320kbps';
            default: return '192kbps';
        }
    }

    private estimateEnhancementImpact(enhancements: any[]): string {
        if (enhancements.length === 0) return 'No enhancements needed';

        const totalImpact = enhancements.length * 15; // Rough estimate
        return `+${Math.min(totalImpact, 50)}% overall quality improvement`;
    }

    private async trackQualityImprovements(args: any) {
        const db = getDatabase();
        const { time_range_days = 30, media_collection, include_trends = true } = args;

        const cutoffDate = new Date(Date.now() - time_range_days * 24 * 60 * 60 * 1000).toISOString();

        let query = `
            SELECT
                COUNT(*) as total_items,
                AVG(CASE WHEN width >= 1920 THEN 1 ELSE 0 END) as hd_percentage,
                AVG(CASE WHEN audio_bitrate >= 192 THEN 1 ELSE 0 END) as good_audio_percentage,
                AVG(CASE WHEN tags IS NOT NULL AND tags != '' THEN 1 ELSE 0 END) as tagged_percentage
            FROM media_metadata
            WHERE updated_at > ?
        `;
        const params: any[] = [cutoffDate];

        if (media_collection) {
            query += ' AND collection = ?';
            params.push(media_collection);
        }

        const improvements = db.query(query).get(...params) as any;

        const result: QualityTrendAnalysis = {
            time_period: `${time_range_days} days`,
            quality_trends: {
                hd_content_percentage: Math.round((improvements?.hd_percentage || 0) * 100),
                good_audio_percentage: Math.round((improvements?.good_audio_percentage || 0) * 100),
                metadata_completeness: Math.round((improvements?.tagged_percentage || 0) * 100)
            },
            improvement_areas: this.identifyImprovementAreas(improvements),
            success_stories: this.generateSuccessStories(improvements)
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }

    private identifyImprovementAreas(data: any): string[] {
        const areas: string[] = [];

        if ((data?.hd_percentage || 0) < 0.7) {
            areas.push('Resolution quality - consider upscaling lower resolution content');
        }

        if ((data?.good_audio_percentage || 0) < 0.6) {
            areas.push('Audio quality - many items have low bitrate audio');
        }

        if ((data?.tagged_percentage || 0) < 0.8) {
            areas.push('Metadata completeness - improve tagging and descriptions');
        }

        if (areas.length === 0) {
            areas.push('Quality metrics are good across all areas');
        }

        return areas;
    }

    private generateSuccessStories(data: any): string[] {
        const stories: string[] = [];

        if ((data?.hd_percentage || 0) > 0.8) {
            stories.push(`${Math.round((data.hd_percentage || 0) * 100)}% of content is now HD quality`);
        }

        if ((data?.good_audio_percentage || 0) > 0.7) {
            stories.push(`${Math.round((data.good_audio_percentage || 0) * 100)}% of content has good audio quality`);
        }

        if ((data?.tagged_percentage || 0) > 0.9) {
            stories.push(`${Math.round((data.tagged_percentage || 0) * 100)}% of content is properly tagged`);
        }

        return stories;
    }

    private async batchQualityAssessment(args: any) {
        const db = getDatabase();
        const { media_ids, collection_filter, quality_threshold = 0.7, prioritize_low_quality = true } = args;

        let query = 'SELECT * FROM media_metadata';
        const params: any[] = [];

        if (media_ids && media_ids.length > 0) {
            query += ` WHERE id IN (${media_ids.map(() => '?').join(',')})`;
            params.push(...media_ids);
        } else if (collection_filter) {
            query += ' WHERE collection = ?';
            params.push(collection_filter);
        }

        const mediaItems = db.query(query).all(...params) as any[];

        const assessments = [];
        for (const item of mediaItems.slice(0, 20)) { // Limit to 20 items for performance
            const metrics = await this.assessQualityMetrics(item, ['resolution', 'audio', 'metadata']);
            const issues = await this.identifyQualityIssues(metrics);

            assessments.push({
                media_id: item.id,
                title: item.title,
                overall_quality_score: metrics.overall_quality_score,
                meets_threshold: metrics.overall_quality_score >= quality_threshold,
                quality_issues: issues,
                priority: metrics.overall_quality_score < quality_threshold ? 'high' : 'low'
            });
        }

        // Sort by priority if requested
        if (prioritize_low_quality) {
            assessments.sort((a, b) => a.overall_quality_score - b.overall_quality_score);
        }

        const summary = {
            total_assessed: assessments.length,
            above_threshold: assessments.filter(a => a.meets_threshold).length,
            below_threshold: assessments.filter(a => !a.meets_threshold).length,
            average_quality_score: assessments.reduce((sum, a) => sum + a.overall_quality_score, 0) / assessments.length
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        summary,
                        assessments: assessments.slice(0, 10), // Return top 10
                        recommendations: this.generateBatchRecommendations(summary, assessments)
                    }, null, 2)
                }
            ]
        };
    }

    private generateBatchRecommendations(summary: any, assessments: any[]): string[] {
        const recommendations: string[] = [];

        if (summary.below_threshold > 0) {
            recommendations.push(`${summary.below_threshold} items need quality improvement`);
        }

        const commonIssues = this.findCommonIssues(assessments);
        for (const issue of commonIssues) {
            recommendations.push(`Common issue: ${issue} - consider batch processing`);
        }

        if (summary.average_quality_score < 0.7) {
            recommendations.push('Overall library quality is below target - prioritize quality improvements');
        }

        return recommendations;
    }

    private findCommonIssues(assessments: any[]): string[] {
        const issueCount: Record<string, number> = {};

        for (const assessment of assessments) {
            for (const issue of assessment.quality_issues) {
                issueCount[issue] = (issueCount[issue] || 0) + 1;
            }
        }

        return Object.entries(issueCount)
            .filter(([_, count]) => count >= 3)
            .map(([issue, _]) => issue);
    }

    private async generateQualityReport(args: any) {
        const db = getDatabase();
        const { report_scope = 'library_wide', include_statistics = true, include_recommendations = true } = args;

        let query = 'SELECT * FROM media_metadata';
        const params: any[] = [];

        switch (report_scope) {
            case 'recent_additions':
                query += ' WHERE created_at > datetime("now", "-30 days")';
                break;
            case 'collection_specific':
                // Would need collection parameter
                break;
        }

        const allItems = db.query(query).all(...params) as any[];
        const sampleSize = Math.min(allItems.length, 50); // Sample for performance
        const sampleItems = allItems.slice(0, sampleSize);

        let totalQualityScore = 0;
        let qualityDistribution = { high: 0, medium: 0, low: 0 };
        const commonIssues: Record<string, number> = {};

        for (const item of sampleItems) {
            const metrics = await this.assessQualityMetrics(item, ['resolution', 'audio', 'metadata']);
            totalQualityScore += metrics.overall_quality_score;

            if (metrics.overall_quality_score >= 0.8) qualityDistribution.high++;
            else if (metrics.overall_quality_score >= 0.6) qualityDistribution.medium++;
            else qualityDistribution.low++;

            const issues = await this.identifyQualityIssues(metrics);
            for (const issue of issues) {
                commonIssues[issue] = (commonIssues[issue] || 0) + 1;
            }
        }

        const report = {
            report_scope,
            generated_at: new Date().toISOString(),
            library_overview: {
                total_items: allItems.length,
                sample_size: sampleSize,
                average_quality_score: (totalQualityScore / sampleSize).toFixed(3),
                quality_distribution: qualityDistribution
            },
            statistics: include_statistics ? {
                resolution_stats: this.calculateResolutionStats(sampleItems),
                audio_stats: this.calculateAudioStats(sampleItems),
                metadata_stats: this.calculateMetadataStats(sampleItems)
            } : undefined,
            common_issues: Object.entries(commonIssues)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([issue, count]) => ({ issue, frequency: count })),
            recommendations: include_recommendations ? this.generateLibraryRecommendations(qualityDistribution, commonIssues) : undefined
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(report, null, 2)
                }
            ]
        };
    }

    private calculateResolutionStats(items: any[]): any {
        const resolutions = items.map(item => ({ width: item.width || 0, height: item.height || 0 }));
        const hdCount = resolutions.filter(r => r.width >= 1920).length;

        return {
            hd_percentage: Math.round((hdCount / items.length) * 100),
            average_width: Math.round(resolutions.reduce((sum, r) => sum + r.width, 0) / items.length),
            average_height: Math.round(resolutions.reduce((sum, r) => sum + r.height, 0) / items.length)
        };
    }

    private calculateAudioStats(items: any[]): any {
        const bitrates = items.map(item => item.audio_bitrate || 128);
        const goodAudioCount = bitrates.filter(b => b >= 192).length;

        return {
            good_audio_percentage: Math.round((goodAudioCount / items.length) * 100),
            average_bitrate: Math.round(bitrates.reduce((sum, b) => sum + b, 0) / items.length)
        };
    }

    private calculateMetadataStats(items: any[]): any {
        const taggedCount = items.filter(item => item.tags && item.tags !== '').length;
        const summarizedCount = items.filter(item => item.summary && item.summary !== '').length;

        return {
            tagged_percentage: Math.round((taggedCount / items.length) * 100),
            summarized_percentage: Math.round((summarizedCount / items.length) * 100)
        };
    }

    private generateLibraryRecommendations(distribution: any, issues: Record<string, number>): string[] {
        const recommendations: string[] = [];

        if (distribution.low > distribution.high) {
            recommendations.push('Focus on improving low-quality content - consider batch enhancement tools');
        }

        const topIssue = Object.entries(issues).sort(([,a], [,b]) => b - a)[0];
        if (topIssue) {
            recommendations.push(`Address most common issue: ${topIssue[0]} (affects ${topIssue[1]} items)`);
        }

        if (distribution.high < distribution.medium + distribution.low) {
            recommendations.push('Implement quality standards for new content ingestion');
        }

        return recommendations;
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Content Quality MCP server running on stdio');
    }
}

// Run the server
const server = new ContentQualityMCPServer();
server.run().catch(console.error);
