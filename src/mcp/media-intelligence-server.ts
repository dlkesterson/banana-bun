#!/usr/bin/env bun

/**
 * Media Intelligence MCP Server
 * 
 * Combines MeiliSearch and Whisper MCP servers with AI-powered insights:
 * - Content discovery patterns and learning
 * - Cross-modal correlations between search, transcription, and tagging
 * - User behavior analytics and personalization
 * - AI-powered content recommendations
 * - Tagging optimization based on search effectiveness
 * - Semantic enhancement using combined usage patterns
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ChromaClient } from 'chromadb';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getDatabase, initDatabase } from '../db';

interface MediaIntelligenceConfig {
    crossModalLearningEnabled: boolean;
    contentDiscoveryThreshold: number;
    taggingOptimizationEnabled: boolean;
    semanticEnhancementEnabled: boolean;
    patternAnalysisWindowHours: number;
    recommendationCacheSize: number;
    aiInsightsEnabled: boolean;
    userBehaviorTracking: boolean;
    contentCorrelationThreshold: number;
    learningRate: number;
}

interface ContentDiscoveryPattern {
    id: string;
    user_session_id?: string;
    search_query: string;
    search_results_count: number;
    clicked_results?: string[];
    transcription_triggered: boolean;
    tags_viewed?: string[];
    discovery_path?: any;
    content_types_discovered?: string[];
    satisfaction_score?: number;
    timestamp: number;
    session_duration_ms?: number;
    follow_up_searches?: string[];
}

interface CrossModalCorrelation {
    id: string;
    media_id: number;
    search_queries?: string[];
    transcript_keywords?: string[];
    ai_generated_tags?: string[];
    user_applied_tags?: string[];
    search_effectiveness_score: number;
    transcription_quality_score: number;
    tagging_accuracy_score: number;
    cross_modal_score: number;
    correlation_strength: number;
    last_updated: number;
    update_count: number;
}

interface UserBehaviorAnalytics {
    id: string;
    user_session_id?: string;
    behavior_type: string;
    content_type?: string;
    action_details?: any;
    media_id?: number;
    search_query?: string;
    transcription_id?: string;
    time_spent_seconds?: number;
    interaction_quality?: number;
    context_data?: any;
    timestamp: number;
}

interface ContentRecommendation {
    id: string;
    user_session_id?: string;
    recommendation_type: string;
    source_media_id?: number;
    recommended_media_ids: number[];
    recommendation_score: number;
    reasoning: string;
    algorithm_used: string;
    user_feedback?: number;
    click_through_rate?: number;
    conversion_rate?: number;
    generated_at: number;
    expires_at?: number;
}

interface AIInsight {
    insight_type: string;
    confidence_score: number;
    data: any;
    reasoning: string;
    recommendations: string[];
}

class MediaIntelligenceMCPServer {
    private server: Server;
    private chromaClient: ChromaClient;
    private config: MediaIntelligenceConfig;
    private discoveryPatterns: ContentDiscoveryPattern[] = [];
    private correlations: Map<number, CrossModalCorrelation> = new Map();
    private behaviorAnalytics: UserBehaviorAnalytics[] = [];

    constructor() {
        this.config = {
            crossModalLearningEnabled: true,
            contentDiscoveryThreshold: 0.7,
            taggingOptimizationEnabled: true,
            semanticEnhancementEnabled: true,
            patternAnalysisWindowHours: 168, // 1 week
            recommendationCacheSize: 1000,
            aiInsightsEnabled: true,
            userBehaviorTracking: true,
            contentCorrelationThreshold: 0.6,
            learningRate: 0.1
        };

        this.chromaClient = new ChromaClient({
            host: config.paths.chroma.host,
            port: config.paths.chroma.port,
            ssl: config.paths.chroma.ssl
        });

        this.server = new Server(
            {
                name: 'media-intelligence-server',
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
            console.error('Media Intelligence MCP server database initialized');
            this.setupToolHandlers();
        } catch (error) {
            console.error('Failed to initialize Media Intelligence MCP server:', error);
        }
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'analyze_content_discovery',
                        description: 'Analyze content discovery patterns and user behavior',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_hours: { type: 'number', description: 'Time range for analysis in hours', default: 24 },
                                user_session_id: { type: 'string', description: 'Specific user session to analyze' },
                                include_recommendations: { type: 'boolean', description: 'Include content recommendations', default: true },
                                discovery_threshold: { type: 'number', description: 'Minimum discovery score threshold', default: 0.7 }
                            }
                        }
                    },
                    {
                        name: 'generate_cross_modal_insights',
                        description: 'Generate insights from cross-modal correlations between search, transcription, and tagging',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                media_id: { type: 'number', description: 'Specific media ID to analyze' },
                                correlation_threshold: { type: 'number', description: 'Minimum correlation strength', default: 0.6 },
                                include_optimization_suggestions: { type: 'boolean', description: 'Include optimization suggestions', default: true },
                                analysis_depth: { type: 'string', enum: ['basic', 'detailed', 'comprehensive'], default: 'detailed' }
                            }
                        }
                    },
                    {
                        name: 'optimize_content_tagging',
                        description: 'Optimize content tagging based on search effectiveness and user behavior',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                media_id: { type: 'number', description: 'Media ID to optimize tagging for' },
                                optimization_strategy: { type: 'string', enum: ['search_driven', 'user_behavior', 'ai_enhanced', 'hybrid'], default: 'hybrid' },
                                test_mode: { type: 'boolean', description: 'Run in A/B test mode', default: false },
                                confidence_threshold: { type: 'number', description: 'Minimum confidence for tag changes', default: 0.8 }
                            }
                        }
                    },
                    {
                        name: 'generate_content_recommendations',
                        description: 'Generate AI-powered content recommendations based on user patterns',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                user_session_id: { type: 'string', description: 'User session for personalized recommendations' },
                                source_media_id: { type: 'number', description: 'Source media for similar content recommendations' },
                                recommendation_type: { type: 'string', enum: ['similar_content', 'trending', 'personalized', 'cross_modal'], default: 'personalized' },
                                max_recommendations: { type: 'number', description: 'Maximum number of recommendations', default: 10 },
                                include_reasoning: { type: 'boolean', description: 'Include AI reasoning for recommendations', default: true }
                            }
                        }
                    },
                    {
                        name: 'enhance_semantic_search',
                        description: 'Enhance search queries and content using semantic analysis and user patterns',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: { type: 'string', description: 'Search query to enhance' },
                                content_text: { type: 'string', description: 'Content text to enhance' },
                                enhancement_type: { type: 'string', enum: ['query_expansion', 'keyword_extraction', 'concept_mapping', 'semantic_enrichment'], default: 'semantic_enrichment' },
                                use_user_patterns: { type: 'boolean', description: 'Use user behavior patterns for enhancement', default: true },
                                cache_result: { type: 'boolean', description: 'Cache enhancement result', default: true }
                            }
                        }
                    },
                    {
                        name: 'track_user_behavior',
                        description: 'Track and analyze user behavior for learning and optimization',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                user_session_id: { type: 'string', description: 'User session identifier' },
                                behavior_type: { type: 'string', enum: ['search', 'transcribe', 'tag', 'view', 'feedback'], description: 'Type of behavior to track' },
                                action_details: { type: 'object', description: 'Detailed action data' },
                                media_id: { type: 'number', description: 'Related media ID' },
                                interaction_quality: { type: 'number', minimum: 0, maximum: 1, description: 'Quality/satisfaction score' },
                                context_data: { type: 'object', description: 'Additional context information' }
                            },
                            required: ['behavior_type']
                        }
                    },
                    {
                        name: 'get_intelligence_dashboard',
                        description: 'Get comprehensive media intelligence dashboard with insights and metrics',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_hours: { type: 'number', description: 'Time range for dashboard data', default: 168 },
                                include_trends: { type: 'boolean', description: 'Include trend analysis', default: true },
                                include_predictions: { type: 'boolean', description: 'Include AI predictions', default: true },
                                include_optimization_opportunities: { type: 'boolean', description: 'Include optimization suggestions', default: true },
                                detail_level: { type: 'string', enum: ['summary', 'detailed', 'comprehensive'], default: 'detailed' }
                            }
                        }
                    },
                    {
                        name: 'correlate_search_transcription',
                        description: 'Analyze correlations between search patterns and transcription quality',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                search_query: { type: 'string', description: 'Search query to analyze' },
                                transcription_id: { type: 'string', description: 'Transcription ID to correlate' },
                                media_id: { type: 'number', description: 'Media ID for correlation analysis' },
                                update_correlations: { type: 'boolean', description: 'Update correlation database', default: true },
                                generate_insights: { type: 'boolean', description: 'Generate AI insights from correlation', default: true }
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
                    case 'analyze_content_discovery':
                        return await this.analyzeContentDiscovery(args);
                    case 'generate_cross_modal_insights':
                        return await this.generateCrossModalInsights(args);
                    case 'optimize_content_tagging':
                        return await this.optimizeContentTagging(args);
                    case 'generate_content_recommendations':
                        return await this.generateContentRecommendations(args);
                    case 'enhance_semantic_search':
                        return await this.enhanceSemanticSearch(args);
                    case 'track_user_behavior':
                        return await this.trackUserBehavior(args);
                    case 'get_intelligence_dashboard':
                        return await this.getIntelligenceDashboard(args);
                    case 'correlate_search_transcription':
                        return await this.correlateSearchTranscription(args);
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

    private async analyzeContentDiscovery(args: any) {
        const { time_range_hours = 24, user_session_id, include_recommendations = true, discovery_threshold = 0.7 } = args;

        try {
            const cutoffTime = Date.now() - (time_range_hours * 60 * 60 * 1000);

            // Get discovery patterns from database
            const patterns = await this.getDiscoveryPatterns(cutoffTime, user_session_id);

            // Analyze patterns
            const analysis = await this.analyzeDiscoveryPatterns(patterns, discovery_threshold);

            // Generate recommendations if requested
            let recommendations = [];
            if (include_recommendations) {
                recommendations = await this.generateDiscoveryRecommendations(analysis);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            discovery_analysis: analysis,
                            recommendations,
                            pattern_count: patterns.length,
                            time_range_hours,
                            analysis_timestamp: Date.now()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Content discovery analysis failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getDiscoveryPatterns(cutoffTime: number, userSessionId?: string): Promise<ContentDiscoveryPattern[]> {
        try {
            const db = getDatabase();
            let query = `
                SELECT * FROM content_discovery_patterns
                WHERE timestamp >= ?
            `;
            const params: any[] = [cutoffTime];

            if (userSessionId) {
                query += ` AND user_session_id = ?`;
                params.push(userSessionId);
            }

            query += ` ORDER BY timestamp DESC`;

            const rows = db.query(query).all(...params);
            return rows.map((row: any) => ({
                id: row.id,
                user_session_id: row.user_session_id,
                search_query: row.search_query,
                search_results_count: row.search_results_count,
                clicked_results: row.clicked_results ? JSON.parse(row.clicked_results) : undefined,
                transcription_triggered: Boolean(row.transcription_triggered),
                tags_viewed: row.tags_viewed ? JSON.parse(row.tags_viewed) : undefined,
                discovery_path: row.discovery_path ? JSON.parse(row.discovery_path) : undefined,
                content_types_discovered: row.content_types_discovered ? JSON.parse(row.content_types_discovered) : undefined,
                satisfaction_score: row.satisfaction_score,
                timestamp: row.timestamp,
                session_duration_ms: row.session_duration_ms,
                follow_up_searches: row.follow_up_searches ? JSON.parse(row.follow_up_searches) : undefined
            }));
        } catch (error) {
            console.error('Failed to get discovery patterns:', error);
            return [];
        }
    }

    private async analyzeDiscoveryPatterns(patterns: ContentDiscoveryPattern[], threshold: number) {
        const analysis = {
            total_patterns: patterns.length,
            high_satisfaction_patterns: patterns.filter(p => (p.satisfaction_score || 0) >= threshold).length,
            common_search_terms: this.extractCommonTerms(patterns.map(p => p.search_query)),
            content_type_preferences: this.analyzeContentTypePreferences(patterns),
            discovery_paths: this.analyzeDiscoveryPaths(patterns),
            transcription_correlation: this.analyzeTranscriptionCorrelation(patterns),
            session_insights: this.analyzeSessionInsights(patterns),
            trend_analysis: this.analyzeTrends(patterns)
        };

        return analysis;
    }

    private extractCommonTerms(queries: string[]): Array<{ term: string, frequency: number, contexts: string[] }> {
        const termFreq: Map<string, { count: number, contexts: Set<string> }> = new Map();

        queries.forEach(query => {
            const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
            words.forEach(word => {
                if (!termFreq.has(word)) {
                    termFreq.set(word, { count: 0, contexts: new Set() });
                }
                termFreq.get(word)!.count++;
                termFreq.get(word)!.contexts.add(query);
            });
        });

        return Array.from(termFreq.entries())
            .sort(([, a], [, b]) => b.count - a.count)
            .slice(0, 20)
            .map(([term, data]) => ({
                term,
                frequency: data.count,
                contexts: Array.from(data.contexts).slice(0, 5)
            }));
    }

    private analyzeContentTypePreferences(patterns: ContentDiscoveryPattern[]) {
        const typeStats: Map<string, { count: number, satisfaction: number[] }> = new Map();

        patterns.forEach(pattern => {
            if (pattern.content_types_discovered) {
                pattern.content_types_discovered.forEach(type => {
                    if (!typeStats.has(type)) {
                        typeStats.set(type, { count: 0, satisfaction: [] });
                    }
                    typeStats.get(type)!.count++;
                    if (pattern.satisfaction_score !== undefined) {
                        typeStats.get(type)!.satisfaction.push(pattern.satisfaction_score);
                    }
                });
            }
        });

        return Array.from(typeStats.entries()).map(([type, stats]) => ({
            content_type: type,
            discovery_count: stats.count,
            avg_satisfaction: stats.satisfaction.length > 0
                ? stats.satisfaction.reduce((sum, s) => sum + s, 0) / stats.satisfaction.length
                : 0,
            preference_score: stats.count * (stats.satisfaction.length > 0
                ? stats.satisfaction.reduce((sum, s) => sum + s, 0) / stats.satisfaction.length
                : 0.5)
        })).sort((a, b) => b.preference_score - a.preference_score);
    }

    private analyzeDiscoveryPaths(patterns: ContentDiscoveryPattern[]) {
        const pathAnalysis = {
            direct_search: patterns.filter(p => !p.follow_up_searches || p.follow_up_searches.length === 0).length,
            iterative_search: patterns.filter(p => p.follow_up_searches && p.follow_up_searches.length > 0).length,
            transcription_triggered: patterns.filter(p => p.transcription_triggered).length,
            tag_exploration: patterns.filter(p => p.tags_viewed && p.tags_viewed.length > 0).length,
            avg_session_duration: patterns
                .filter(p => p.session_duration_ms)
                .reduce((sum, p) => sum + (p.session_duration_ms || 0), 0) /
                patterns.filter(p => p.session_duration_ms).length || 0
        };

        return pathAnalysis;
    }

    private analyzeTranscriptionCorrelation(patterns: ContentDiscoveryPattern[]) {
        const withTranscription = patterns.filter(p => p.transcription_triggered);
        const withoutTranscription = patterns.filter(p => !p.transcription_triggered);

        return {
            transcription_rate: patterns.length > 0 ? withTranscription.length / patterns.length : 0,
            avg_satisfaction_with_transcription: withTranscription.length > 0
                ? withTranscription.reduce((sum, p) => sum + (p.satisfaction_score || 0), 0) / withTranscription.length
                : 0,
            avg_satisfaction_without_transcription: withoutTranscription.length > 0
                ? withoutTranscription.reduce((sum, p) => sum + (p.satisfaction_score || 0), 0) / withoutTranscription.length
                : 0,
            transcription_impact: withTranscription.length > 0 && withoutTranscription.length > 0
                ? (withTranscription.reduce((sum, p) => sum + (p.satisfaction_score || 0), 0) / withTranscription.length) -
                (withoutTranscription.reduce((sum, p) => sum + (p.satisfaction_score || 0), 0) / withoutTranscription.length)
                : 0
        };
    }

    private analyzeSessionInsights(patterns: ContentDiscoveryPattern[]) {
        const sessionGroups: Map<string, ContentDiscoveryPattern[]> = new Map();

        patterns.forEach(pattern => {
            if (pattern.user_session_id) {
                if (!sessionGroups.has(pattern.user_session_id)) {
                    sessionGroups.set(pattern.user_session_id, []);
                }
                sessionGroups.get(pattern.user_session_id)!.push(pattern);
            }
        });

        const sessionAnalysis = Array.from(sessionGroups.entries()).map(([sessionId, sessionPatterns]) => {
            const sortedPatterns = sessionPatterns.sort((a, b) => a.timestamp - b.timestamp);
            return {
                session_id: sessionId,
                pattern_count: sessionPatterns.length,
                duration_ms: sortedPatterns.length > 1
                    ? sortedPatterns[sortedPatterns.length - 1].timestamp - sortedPatterns[0].timestamp
                    : 0,
                avg_satisfaction: sessionPatterns.reduce((sum, p) => sum + (p.satisfaction_score || 0), 0) / sessionPatterns.length,
                content_types: [...new Set(sessionPatterns.flatMap(p => p.content_types_discovered || []))],
                search_evolution: sortedPatterns.map(p => p.search_query)
            };
        });

        return {
            total_sessions: sessionGroups.size,
            avg_patterns_per_session: sessionAnalysis.reduce((sum, s) => sum + s.pattern_count, 0) / sessionAnalysis.length || 0,
            avg_session_duration: sessionAnalysis.reduce((sum, s) => sum + s.duration_ms, 0) / sessionAnalysis.length || 0,
            most_productive_sessions: sessionAnalysis
                .sort((a, b) => b.avg_satisfaction - a.avg_satisfaction)
                .slice(0, 5)
        };
    }

    private analyzeTrends(patterns: ContentDiscoveryPattern[]) {
        // Sort patterns by timestamp
        const sortedPatterns = patterns.sort((a, b) => a.timestamp - b.timestamp);

        if (sortedPatterns.length < 2) {
            return { trend: 'insufficient_data', patterns_over_time: [] };
        }

        // Group by time periods (hours)
        const hourlyGroups: Map<number, ContentDiscoveryPattern[]> = new Map();

        sortedPatterns.forEach(pattern => {
            const hour = Math.floor(pattern.timestamp / (1000 * 60 * 60));
            if (!hourlyGroups.has(hour)) {
                hourlyGroups.set(hour, []);
            }
            hourlyGroups.get(hour)!.push(pattern);
        });

        const hourlyData = Array.from(hourlyGroups.entries())
            .sort(([a], [b]) => a - b)
            .map(([hour, hourPatterns]) => ({
                hour,
                pattern_count: hourPatterns.length,
                avg_satisfaction: hourPatterns.reduce((sum, p) => sum + (p.satisfaction_score || 0), 0) / hourPatterns.length,
                transcription_rate: hourPatterns.filter(p => p.transcription_triggered).length / hourPatterns.length
            }));

        // Calculate trend
        const recentHalf = hourlyData.slice(Math.floor(hourlyData.length / 2));
        const earlierHalf = hourlyData.slice(0, Math.floor(hourlyData.length / 2));

        const recentAvgSatisfaction = recentHalf.reduce((sum, h) => sum + h.avg_satisfaction, 0) / recentHalf.length;
        const earlierAvgSatisfaction = earlierHalf.reduce((sum, h) => sum + h.avg_satisfaction, 0) / earlierHalf.length;

        const trend = recentAvgSatisfaction > earlierAvgSatisfaction ? 'improving' :
            recentAvgSatisfaction < earlierAvgSatisfaction ? 'declining' : 'stable';

        return {
            trend,
            satisfaction_change: recentAvgSatisfaction - earlierAvgSatisfaction,
            patterns_over_time: hourlyData,
            peak_hours: hourlyData
                .sort((a, b) => b.pattern_count - a.pattern_count)
                .slice(0, 3)
                .map(h => ({ hour: h.hour, count: h.pattern_count }))
        };
    }

    private async generateDiscoveryRecommendations(analysis: any): Promise<string[]> {
        const recommendations = [];

        // Content type recommendations
        if (analysis.content_type_preferences.length > 0) {
            const topType = analysis.content_type_preferences[0];
            recommendations.push(`Focus on ${topType.content_type} content - highest user preference (${topType.preference_score.toFixed(2)} score)`);
        }

        // Search term recommendations
        if (analysis.common_search_terms.length > 0) {
            const topTerms = analysis.common_search_terms.slice(0, 3).map(t => t.term);
            recommendations.push(`Optimize content for popular search terms: ${topTerms.join(', ')}`);
        }

        // Transcription recommendations
        if (analysis.transcription_correlation.transcription_impact > 0.1) {
            recommendations.push(`Transcription significantly improves satisfaction (+${(analysis.transcription_correlation.transcription_impact * 100).toFixed(1)}%) - prioritize transcription for new content`);
        }

        // Session optimization
        if (analysis.session_insights.avg_session_duration > 300000) { // > 5 minutes
            recommendations.push('Users spend significant time exploring - consider improving content discovery and navigation');
        }

        // Trend-based recommendations
        if (analysis.trend_analysis.trend === 'declining') {
            recommendations.push('User satisfaction is declining - review recent content quality and search effectiveness');
        } else if (analysis.trend_analysis.trend === 'improving') {
            recommendations.push('User satisfaction is improving - continue current content and optimization strategies');
        }

        return recommendations;
    }

    private async generateCrossModalInsights(args: any) {
        const { media_id, correlation_threshold = 0.6, include_optimization_suggestions = true, analysis_depth = 'detailed' } = args;

        try {
            // Get cross-modal correlation data
            const correlation = await this.getCrossModalCorrelation(media_id);

            if (!correlation) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: 'No correlation data found for media ID',
                                media_id,
                                suggestion: 'Media may need to be processed through search and transcription first'
                            }, null, 2)
                        }
                    ]
                };
            }

            // Generate insights based on correlation data
            const insights = await this.analyzeCorrelationInsights(correlation, correlation_threshold, analysis_depth);

            // Generate optimization suggestions if requested
            let optimizations = [];
            if (include_optimization_suggestions) {
                optimizations = await this.generateOptimizationSuggestions(correlation, insights);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            media_id,
                            correlation_data: correlation,
                            insights,
                            optimization_suggestions: optimizations,
                            analysis_depth,
                            analysis_timestamp: Date.now()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Cross-modal insights generation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getCrossModalCorrelation(mediaId?: number): Promise<CrossModalCorrelation | null> {
        if (!mediaId) return null;

        try {
            const db = getDatabase();
            const row = db.query(`
                SELECT * FROM cross_modal_correlations
                WHERE media_id = ?
                ORDER BY last_updated DESC
                LIMIT 1
            `).get(mediaId);

            if (!row) return null;

            return {
                id: row.id,
                media_id: row.media_id,
                search_queries: row.search_queries ? JSON.parse(row.search_queries) : undefined,
                transcript_keywords: row.transcript_keywords ? JSON.parse(row.transcript_keywords) : undefined,
                ai_generated_tags: row.ai_generated_tags ? JSON.parse(row.ai_generated_tags) : undefined,
                user_applied_tags: row.user_applied_tags ? JSON.parse(row.user_applied_tags) : undefined,
                search_effectiveness_score: row.search_effectiveness_score,
                transcription_quality_score: row.transcription_quality_score,
                tagging_accuracy_score: row.tagging_accuracy_score,
                cross_modal_score: row.cross_modal_score,
                correlation_strength: row.correlation_strength,
                last_updated: row.last_updated,
                update_count: row.update_count
            };
        } catch (error) {
            console.error('Failed to get cross-modal correlation:', error);
            return null;
        }
    }

    private async analyzeCorrelationInsights(correlation: CrossModalCorrelation, threshold: number, depth: string) {
        const insights = {
            overall_effectiveness: correlation.cross_modal_score,
            correlation_strength: correlation.correlation_strength,
            component_analysis: {
                search_effectiveness: correlation.search_effectiveness_score,
                transcription_quality: correlation.transcription_quality_score,
                tagging_accuracy: correlation.tagging_accuracy_score
            },
            cross_modal_alignment: this.calculateCrossModalAlignment(correlation),
            improvement_potential: this.calculateImprovementPotential(correlation),
            bottlenecks: this.identifyBottlenecks(correlation, threshold)
        };

        if (depth === 'comprehensive') {
            insights['detailed_analysis'] = {
                keyword_overlap: this.analyzeKeywordOverlap(correlation),
                tag_effectiveness: this.analyzeTagEffectiveness(correlation),
                search_query_optimization: this.analyzeSearchQueryOptimization(correlation)
            };
        }

        return insights;
    }

    private calculateCrossModalAlignment(correlation: CrossModalCorrelation): number {
        // Calculate how well search, transcription, and tagging align
        const scores = [
            correlation.search_effectiveness_score,
            correlation.transcription_quality_score,
            correlation.tagging_accuracy_score
        ];

        const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;

        // Lower variance = better alignment
        return Math.max(0, 1 - Math.sqrt(variance));
    }

    private calculateImprovementPotential(correlation: CrossModalCorrelation): any {
        const maxPossibleScore = 1.0;
        const currentScore = correlation.cross_modal_score;

        return {
            overall_potential: maxPossibleScore - currentScore,
            component_potentials: {
                search: maxPossibleScore - correlation.search_effectiveness_score,
                transcription: maxPossibleScore - correlation.transcription_quality_score,
                tagging: maxPossibleScore - correlation.tagging_accuracy_score
            },
            priority_order: [
                { component: 'search', potential: maxPossibleScore - correlation.search_effectiveness_score },
                { component: 'transcription', potential: maxPossibleScore - correlation.transcription_quality_score },
                { component: 'tagging', potential: maxPossibleScore - correlation.tagging_accuracy_score }
            ].sort((a, b) => b.potential - a.potential)
        };
    }

    private identifyBottlenecks(correlation: CrossModalCorrelation, threshold: number): string[] {
        const bottlenecks = [];

        if (correlation.search_effectiveness_score < threshold) {
            bottlenecks.push('search_effectiveness');
        }
        if (correlation.transcription_quality_score < threshold) {
            bottlenecks.push('transcription_quality');
        }
        if (correlation.tagging_accuracy_score < threshold) {
            bottlenecks.push('tagging_accuracy');
        }
        if (correlation.correlation_strength < threshold) {
            bottlenecks.push('cross_modal_correlation');
        }

        return bottlenecks;
    }

    private analyzeKeywordOverlap(correlation: CrossModalCorrelation): any {
        const searchKeywords = correlation.search_queries?.flatMap(q => q.toLowerCase().split(/\s+/)) || [];
        const transcriptKeywords = correlation.transcript_keywords?.map(k => k.toLowerCase()) || [];
        const tagKeywords = correlation.ai_generated_tags?.map(t => t.toLowerCase()) || [];

        const allKeywords = new Set([...searchKeywords, ...transcriptKeywords, ...tagKeywords]);
        const searchSet = new Set(searchKeywords);
        const transcriptSet = new Set(transcriptKeywords);
        const tagSet = new Set(tagKeywords);

        return {
            total_unique_keywords: allKeywords.size,
            search_transcript_overlap: this.calculateSetOverlap(searchSet, transcriptSet),
            search_tag_overlap: this.calculateSetOverlap(searchSet, tagSet),
            transcript_tag_overlap: this.calculateSetOverlap(transcriptSet, tagSet),
            three_way_overlap: this.calculateThreeWayOverlap(searchSet, transcriptSet, tagSet)
        };
    }

    private calculateSetOverlap(set1: Set<string>, set2: Set<string>): number {
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return union.size > 0 ? intersection.size / union.size : 0;
    }

    private calculateThreeWayOverlap(set1: Set<string>, set2: Set<string>, set3: Set<string>): number {
        const intersection = new Set([...set1].filter(x => set2.has(x) && set3.has(x)));
        const union = new Set([...set1, ...set2, ...set3]);
        return union.size > 0 ? intersection.size / union.size : 0;
    }

    private analyzeTagEffectiveness(correlation: CrossModalCorrelation): any {
        const aiTags = correlation.ai_generated_tags || [];
        const userTags = correlation.user_applied_tags || [];

        return {
            ai_tag_count: aiTags.length,
            user_tag_count: userTags.length,
            tag_overlap: this.calculateSetOverlap(new Set(aiTags), new Set(userTags)),
            user_validation_rate: userTags.length > 0 ? this.calculateSetOverlap(new Set(aiTags), new Set(userTags)) : 0,
            tag_diversity: new Set([...aiTags, ...userTags]).size / Math.max(1, aiTags.length + userTags.length)
        };
    }

    private analyzeSearchQueryOptimization(correlation: CrossModalCorrelation): any {
        const queries = correlation.search_queries || [];

        return {
            query_count: queries.length,
            avg_query_length: queries.reduce((sum, q) => sum + q.length, 0) / Math.max(1, queries.length),
            query_complexity: queries.reduce((sum, q) => sum + q.split(/\s+/).length, 0) / Math.max(1, queries.length),
            unique_terms: new Set(queries.flatMap(q => q.toLowerCase().split(/\s+/))).size
        };
    }

    private async generateOptimizationSuggestions(correlation: CrossModalCorrelation, insights: any): Promise<string[]> {
        const suggestions = [];

        // Search optimization suggestions
        if (correlation.search_effectiveness_score < 0.7) {
            suggestions.push('Improve search effectiveness by optimizing tags and descriptions');
            suggestions.push('Consider adding more specific keywords to content metadata');
        }

        // Transcription optimization suggestions
        if (correlation.transcription_quality_score < 0.7) {
            suggestions.push('Improve transcription quality by using higher-quality audio or better models');
            suggestions.push('Consider manual review and correction of transcripts');
        }

        // Tagging optimization suggestions
        if (correlation.tagging_accuracy_score < 0.7) {
            suggestions.push('Enhance AI tagging by incorporating user feedback and corrections');
            suggestions.push('Consider hybrid tagging approach combining AI and manual tags');
        }

        // Cross-modal correlation suggestions
        if (insights.cross_modal_alignment < 0.6) {
            suggestions.push('Improve alignment between search terms, transcript content, and tags');
            suggestions.push('Ensure consistent terminology across all content modalities');
        }

        // Bottleneck-specific suggestions
        insights.bottlenecks.forEach((bottleneck: string) => {
            switch (bottleneck) {
                case 'search_effectiveness':
                    suggestions.push('Focus on improving search discoverability through better metadata');
                    break;
                case 'transcription_quality':
                    suggestions.push('Prioritize transcription quality improvements for this content');
                    break;
                case 'tagging_accuracy':
                    suggestions.push('Review and improve tag accuracy for this content');
                    break;
                case 'cross_modal_correlation':
                    suggestions.push('Work on better integration between search, transcription, and tagging');
                    break;
            }
        });

        return [...new Set(suggestions)]; // Remove duplicates
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Media Intelligence MCP server running on stdio');
    }
}

// Run the server
const server = new MediaIntelligenceMCPServer();
server.run().catch(console.error);
