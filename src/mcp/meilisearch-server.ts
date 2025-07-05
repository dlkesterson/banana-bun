#!/usr/bin/env bun

/**
 * MeiliSearch MCP Server
 * 
 * Provides intelligent search capabilities with learning and optimization:
 * - Smart search with query optimization
 * - Search analytics and pattern learning
 * - Query suggestions and auto-completion
 * - Performance monitoring and optimization
 * - Search result ranking improvements
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MeiliSearch } from 'meilisearch';
import { ChromaClient } from 'chromadb';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getDatabase, initDatabase } from '../db';
import type { MeiliMediaDocument } from '../services/meilisearch-service';

interface MeiliSearchServerConfig {
    url: string;
    masterKey?: string;
    indexName: string;
}

interface SearchAnalytics {
    id: string;
    query: string;
    filters?: string;
    results_count: number;
    processing_time_ms: number;
    clicked_results?: string[];
    user_satisfaction?: number; // 1-5 rating
    timestamp: number;
    session_id?: string;
}

interface QueryOptimization {
    original_query: string;
    optimized_query: string;
    optimization_type: 'synonym' | 'expansion' | 'correction' | 'filter_suggestion';
    confidence: number;
    performance_improvement?: number;
}

class MeiliSearchMCPServer {
    private server: Server;
    private meiliClient: MeiliSearch;
    private chromaClient: ChromaClient;
    private config: MeiliSearchServerConfig;
    private searchHistory: SearchAnalytics[] = [];
    private queryOptimizations: QueryOptimization[] = [];

    constructor() {
        this.config = {
            url: config.meilisearch.url,
            masterKey: config.meilisearch.masterKey,
            indexName: config.meilisearch.indexName
        };

        this.meiliClient = new MeiliSearch({
            host: this.config.url,
            apiKey: this.config.masterKey
        });

        this.chromaClient = new ChromaClient({
            host: config.paths.chroma.host,
            port: config.paths.chroma.port,
            ssl: config.paths.chroma.ssl
        });

        this.server = new Server(
            {
                name: 'meilisearch-server',
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
            initDatabase();
            console.error('MeiliSearch MCP server database initialized');
            this.setupToolHandlers();
        } catch (error) {
            console.error('Failed to initialize MeiliSearch MCP server:', error);
        }
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'smart_search',
                        description: 'Perform intelligent search with query optimization and learning',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: { type: 'string', description: 'Search query' },
                                filters: { type: 'string', description: 'MeiliSearch filter expression' },
                                limit: { type: 'number', description: 'Maximum results to return', default: 20 },
                                offset: { type: 'number', description: 'Results offset for pagination', default: 0 },
                                optimize_query: { type: 'boolean', description: 'Apply query optimization', default: true },
                                learn_from_search: { type: 'boolean', description: 'Store search for learning', default: true },
                                session_id: { type: 'string', description: 'Session ID for analytics' }
                            },
                            required: ['query']
                        }
                    },
                    {
                        name: 'get_search_suggestions',
                        description: 'Get query suggestions based on search history and patterns',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                partial_query: { type: 'string', description: 'Partial query for suggestions' },
                                limit: { type: 'number', description: 'Maximum suggestions to return', default: 5 },
                                include_filters: { type: 'boolean', description: 'Include filter suggestions', default: true }
                            },
                            required: ['partial_query']
                        }
                    },
                    {
                        name: 'analyze_search_patterns',
                        description: 'Analyze search patterns and provide insights',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_hours: { type: 'number', description: 'Time range for analysis in hours', default: 24 },
                                include_performance: { type: 'boolean', description: 'Include performance metrics', default: true },
                                group_by: { type: 'string', enum: ['query_type', 'time_period', 'user_session'], default: 'query_type' }
                            }
                        }
                    },
                    {
                        name: 'optimize_index',
                        description: 'Optimize MeiliSearch index based on usage patterns',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                analyze_only: { type: 'boolean', description: 'Only analyze, do not apply changes', default: false },
                                focus_area: { type: 'string', enum: ['searchable_attributes', 'filterable_attributes', 'ranking_rules'], description: 'Specific area to optimize' }
                            }
                        }
                    },
                    {
                        name: 'get_search_analytics',
                        description: 'Get detailed search analytics and metrics',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_hours: { type: 'number', description: 'Time range for analytics in hours', default: 24 },
                                include_failed_searches: { type: 'boolean', description: 'Include searches with no results', default: true },
                                group_by_time: { type: 'string', enum: ['hour', 'day', 'week'], default: 'hour' }
                            }
                        }
                    },
                    {
                        name: 'record_search_feedback',
                        description: 'Record user feedback on search results for learning',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                search_id: { type: 'string', description: 'ID of the search to provide feedback for' },
                                clicked_results: { type: 'array', items: { type: 'string' }, description: 'IDs of clicked results' },
                                satisfaction_rating: { type: 'number', minimum: 1, maximum: 5, description: 'User satisfaction rating (1-5)' },
                                feedback_notes: { type: 'string', description: 'Additional feedback notes' }
                            },
                            required: ['search_id']
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'smart_search':
                        return await this.smartSearch(args);
                    case 'get_search_suggestions':
                        return await this.getSearchSuggestions(args);
                    case 'analyze_search_patterns':
                        return await this.analyzeSearchPatterns(args);
                    case 'optimize_index':
                        return await this.optimizeIndex(args);
                    case 'get_search_analytics':
                        return await this.getSearchAnalytics(args);
                    case 'record_search_feedback':
                        return await this.recordSearchFeedback(args);
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

    private async smartSearch(args: any) {
        const {
            query,
            filters,
            limit = 20,
            offset = 0,
            optimize_query = true,
            learn_from_search = true,
            session_id
        } = args;

        try {
            let finalQuery = query;
            let optimizationApplied = null;

            // Apply query optimization if enabled
            if (optimize_query) {
                const optimization = await this.optimizeQuery(query);
                if (optimization) {
                    finalQuery = optimization.optimized_query;
                    optimizationApplied = optimization;
                }
            }

            // Perform the search
            const index = this.meiliClient.index(this.config.indexName);
            const searchOptions: any = {
                limit,
                offset,
                attributesToHighlight: ['title', 'description', 'transcript_snippet', 'tags'],
                highlightPreTag: '<mark>',
                highlightPostTag: '</mark>'
            };

            if (filters) {
                searchOptions.filter = filters;
            }

            const startTime = Date.now();
            const result = await index.search(finalQuery, searchOptions);
            const processingTime = Date.now() - startTime;

            // Store search analytics if enabled
            if (learn_from_search) {
                const searchAnalytics: SearchAnalytics = {
                    id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    query: finalQuery,
                    filters,
                    results_count: result.hits.length,
                    processing_time_ms: processingTime,
                    timestamp: Date.now(),
                    session_id
                };

                this.searchHistory.push(searchAnalytics);
                await this.storeSearchAnalytics(searchAnalytics);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            search_id: learn_from_search ? this.searchHistory[this.searchHistory.length - 1]?.id : null,
                            original_query: query,
                            final_query: finalQuery,
                            optimization_applied: optimizationApplied,
                            results: {
                                hits: result.hits,
                                total_hits: result.estimatedTotalHits || result.hits.length,
                                processing_time_ms: result.processingTimeMs,
                                total_time_ms: processingTime
                            },
                            pagination: {
                                limit,
                                offset,
                                has_more: (result.estimatedTotalHits || result.hits.length) > (offset + limit)
                            }
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Smart search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async optimizeQuery(query: string): Promise<QueryOptimization | null> {
        // Simple query optimization logic - can be enhanced with ML
        try {
            // Check for common typos and corrections
            const corrections = await this.getQueryCorrections(query);
            if (corrections.length > 0) {
                return {
                    original_query: query,
                    optimized_query: corrections[0].corrected,
                    optimization_type: 'correction',
                    confidence: corrections[0].confidence
                };
            }

            // Check for synonym expansion
            const synonyms = await this.getQuerySynonyms(query);
            if (synonyms.length > 0) {
                const expandedQuery = `${query} OR ${synonyms.join(' OR ')}`;
                return {
                    original_query: query,
                    optimized_query: expandedQuery,
                    optimization_type: 'expansion',
                    confidence: 0.7
                };
            }

            return null;
        } catch (error) {
            console.error('Query optimization failed:', error);
            return null;
        }
    }

    private async getQueryCorrections(query: string): Promise<Array<{ corrected: string, confidence: number }>> {
        // Simple spell checking - in production, use a proper spell checker
        const commonCorrections: Record<string, string> = {
            'vidoe': 'video',
            'moive': 'movie',
            'documentry': 'documentary',
            'comdy': 'comedy',
            'horor': 'horror'
        };

        const words = query.toLowerCase().split(' ');
        const corrections = [];

        for (const word of words) {
            if (commonCorrections[word]) {
                const correctedQuery = query.replace(new RegExp(word, 'gi'), commonCorrections[word]);
                corrections.push({
                    corrected: correctedQuery,
                    confidence: 0.9
                });
            }
        }

        return corrections;
    }

    private async getQuerySynonyms(query: string): Promise<string[]> {
        // Simple synonym mapping - in production, use a proper thesaurus
        const synonymMap: Record<string, string[]> = {
            'funny': ['comedy', 'humorous', 'amusing'],
            'scary': ['horror', 'frightening', 'terrifying'],
            'music': ['song', 'audio', 'track'],
            'movie': ['film', 'cinema', 'video']
        };

        const words = query.toLowerCase().split(' ');
        const synonyms = [];

        for (const word of words) {
            if (synonymMap[word]) {
                synonyms.push(...synonymMap[word]);
            }
        }

        return synonyms;
    }

    private async storeSearchAnalytics(analytics: SearchAnalytics): Promise<void> {
        try {
            const db = getDatabase();
            db.run(`
                INSERT OR REPLACE INTO search_analytics 
                (id, query, filters, results_count, processing_time_ms, clicked_results, user_satisfaction, timestamp, session_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                analytics.id,
                analytics.query,
                analytics.filters || null,
                analytics.results_count,
                analytics.processing_time_ms,
                JSON.stringify(analytics.clicked_results || []),
                analytics.user_satisfaction || null,
                analytics.timestamp,
                analytics.session_id || null
            ]);
        } catch (error) {
            console.error('Failed to store search analytics:', error);
        }
    }

    private async getSearchSuggestions(args: any) {
        const { partial_query, limit = 5, include_filters = true } = args;

        try {
            // Get suggestions from search history
            const historySuggestions = this.searchHistory
                .filter(search => search.query.toLowerCase().includes(partial_query.toLowerCase()))
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, limit)
                .map(search => ({
                    query: search.query,
                    frequency: this.searchHistory.filter(s => s.query === search.query).length,
                    avg_results: search.results_count,
                    last_used: search.timestamp
                }));

            // Get filter suggestions if enabled
            let filterSuggestions = [];
            if (include_filters) {
                filterSuggestions = await this.getFilterSuggestions(partial_query);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            query_suggestions: historySuggestions,
                            filter_suggestions: filterSuggestions,
                            total_suggestions: historySuggestions.length + filterSuggestions.length
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get search suggestions: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getFilterSuggestions(query: string): Promise<Array<{ filter: string, description: string, estimated_results: number }>> {
        try {
            const index = this.meiliClient.index(this.config.indexName);
            const stats = await index.getStats();

            // Suggest common filters based on query content
            const suggestions = [];

            if (query.toLowerCase().includes('music') || query.toLowerCase().includes('song')) {
                suggestions.push({
                    filter: 'guessed_type = "music"',
                    description: 'Filter to music content only',
                    estimated_results: Math.floor(stats.numberOfDocuments * 0.3)
                });
            }

            if (query.toLowerCase().includes('movie') || query.toLowerCase().includes('film')) {
                suggestions.push({
                    filter: 'guessed_type = "movie"',
                    description: 'Filter to movie content only',
                    estimated_results: Math.floor(stats.numberOfDocuments * 0.4)
                });
            }

            // Add duration-based suggestions
            suggestions.push({
                filter: 'duration > 3600',
                description: 'Long content (over 1 hour)',
                estimated_results: Math.floor(stats.numberOfDocuments * 0.2)
            });

            return suggestions;
        } catch (error) {
            console.error('Failed to get filter suggestions:', error);
            return [];
        }
    }

    private async analyzeSearchPatterns(args: any) {
        const { time_range_hours = 24, include_performance = true, group_by = 'query_type' } = args;

        try {
            const cutoffTime = Date.now() - (time_range_hours * 60 * 60 * 1000);
            const recentSearches = this.searchHistory.filter(search => search.timestamp >= cutoffTime);

            let analysis: any = {
                total_searches: recentSearches.length,
                unique_queries: new Set(recentSearches.map(s => s.query)).size,
                time_range_hours,
                analysis_timestamp: Date.now()
            };

            if (group_by === 'query_type') {
                analysis.by_query_type = this.analyzeByQueryType(recentSearches);
            } else if (group_by === 'time_period') {
                analysis.by_time_period = this.analyzeByTimePeriod(recentSearches);
            }

            if (include_performance) {
                analysis.performance_metrics = {
                    avg_processing_time: recentSearches.reduce((sum, s) => sum + s.processing_time_ms, 0) / recentSearches.length,
                    avg_results_count: recentSearches.reduce((sum, s) => sum + s.results_count, 0) / recentSearches.length,
                    zero_result_queries: recentSearches.filter(s => s.results_count === 0).length
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(analysis, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to analyze search patterns: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private analyzeByQueryType(searches: SearchAnalytics[]) {
        const types = {
            media_search: searches.filter(s => /video|movie|film|music|audio/.test(s.query.toLowerCase())),
            content_search: searches.filter(s => /transcript|subtitle|dialogue/.test(s.query.toLowerCase())),
            metadata_search: searches.filter(s => /tag|genre|year|artist/.test(s.query.toLowerCase())),
            other: []
        };

        // Classify remaining searches
        types.other = searches.filter(s =>
            !types.media_search.includes(s) &&
            !types.content_search.includes(s) &&
            !types.metadata_search.includes(s)
        );

        return Object.entries(types).map(([type, typeSearches]) => ({
            type,
            count: typeSearches.length,
            percentage: (typeSearches.length / searches.length) * 100,
            avg_results: typeSearches.reduce((sum, s) => sum + s.results_count, 0) / typeSearches.length || 0
        }));
    }

    private analyzeByTimePeriod(searches: SearchAnalytics[]) {
        const hourlyData: Record<number, SearchAnalytics[]> = {};

        searches.forEach(search => {
            const hour = new Date(search.timestamp).getHours();
            if (!hourlyData[hour]) hourlyData[hour] = [];
            hourlyData[hour].push(search);
        });

        return Object.entries(hourlyData).map(([hour, hourSearches]) => ({
            hour: parseInt(hour),
            count: hourSearches.length,
            avg_processing_time: hourSearches.reduce((sum, s) => sum + s.processing_time_ms, 0) / hourSearches.length
        })).sort((a, b) => a.hour - b.hour);
    }

    private async optimizeIndex(args: any) {
        const { analyze_only = false, focus_area } = args;

        try {
            const index = this.meiliClient.index(this.config.indexName);
            const currentSettings = await index.getSettings();
            const stats = await index.getStats();

            const analysis = {
                current_settings: currentSettings,
                index_stats: stats,
                optimization_recommendations: []
            };

            // Analyze search patterns for optimization
            const searchPatterns = this.analyzeSearchPatternsForOptimization();

            if (!focus_area || focus_area === 'searchable_attributes') {
                const searchableOptimization = this.optimizeSearchableAttributes(searchPatterns);
                analysis.optimization_recommendations.push(searchableOptimization);
            }

            if (!focus_area || focus_area === 'ranking_rules') {
                const rankingOptimization = this.optimizeRankingRules(searchPatterns);
                analysis.optimization_recommendations.push(rankingOptimization);
            }

            if (!analyze_only) {
                // Apply optimizations
                await this.applyOptimizations(index, analysis.optimization_recommendations);
                analysis.optimizations_applied = true;
            } else {
                analysis.optimizations_applied = false;
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(analysis, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Index optimization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private analyzeSearchPatternsForOptimization() {
        const patterns = {
            most_searched_fields: {} as Record<string, number>,
            common_filters: {} as Record<string, number>,
            performance_issues: []
        };

        this.searchHistory.forEach(search => {
            // Analyze which fields are commonly searched
            if (search.query.includes('title:') || /movie|film/.test(search.query)) {
                patterns.most_searched_fields.title = (patterns.most_searched_fields.title || 0) + 1;
            }
            if (search.query.includes('transcript') || /dialogue|subtitle/.test(search.query)) {
                patterns.most_searched_fields.transcript = (patterns.most_searched_fields.transcript || 0) + 1;
            }

            // Track performance issues
            if (search.processing_time_ms > 1000) {
                patterns.performance_issues.push({
                    query: search.query,
                    processing_time: search.processing_time_ms,
                    results_count: search.results_count
                });
            }
        });

        return patterns;
    }

    private optimizeSearchableAttributes(patterns: any) {
        const currentOrder = ['title', 'description', 'transcript', 'summary', 'tags', 'filename', 'artist', 'album', 'genre'];
        const usage = patterns.most_searched_fields;

        // Reorder based on usage frequency
        const optimizedOrder = currentOrder.sort((a, b) => (usage[b] || 0) - (usage[a] || 0));

        return {
            type: 'searchable_attributes',
            current: currentOrder,
            recommended: optimizedOrder,
            reasoning: 'Reordered based on search frequency patterns'
        };
    }

    private optimizeRankingRules(patterns: any) {
        const currentRules = ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'];

        // If many performance issues, suggest adding custom ranking
        if (patterns.performance_issues.length > 10) {
            const optimizedRules = ['words', 'typo', 'proximity', 'attribute', 'created_at:desc', 'sort', 'exactness'];
            return {
                type: 'ranking_rules',
                current: currentRules,
                recommended: optimizedRules,
                reasoning: 'Added recency ranking to improve performance for recent content searches'
            };
        }

        return {
            type: 'ranking_rules',
            current: currentRules,
            recommended: currentRules,
            reasoning: 'Current ranking rules are optimal for current usage patterns'
        };
    }

    private async applyOptimizations(index: any, recommendations: any[]) {
        for (const rec of recommendations) {
            try {
                if (rec.type === 'searchable_attributes') {
                    await index.updateSearchableAttributes(rec.recommended);
                } else if (rec.type === 'ranking_rules') {
                    await index.updateRankingRules(rec.recommended);
                }
            } catch (error) {
                console.error(`Failed to apply ${rec.type} optimization:`, error);
            }
        }
    }

    private async getSearchAnalytics(args: any) {
        const { time_range_hours = 24, include_failed_searches = true, group_by_time = 'hour' } = args;

        try {
            const cutoffTime = Date.now() - (time_range_hours * 60 * 60 * 1000);
            let searches = this.searchHistory.filter(search => search.timestamp >= cutoffTime);

            if (!include_failed_searches) {
                searches = searches.filter(search => search.results_count > 0);
            }

            const analytics = {
                summary: {
                    total_searches: searches.length,
                    successful_searches: searches.filter(s => s.results_count > 0).length,
                    failed_searches: searches.filter(s => s.results_count === 0).length,
                    avg_processing_time: searches.reduce((sum, s) => sum + s.processing_time_ms, 0) / searches.length || 0,
                    avg_results_per_search: searches.reduce((sum, s) => sum + s.results_count, 0) / searches.length || 0
                },
                time_series: this.groupSearchesByTime(searches, group_by_time),
                top_queries: this.getTopQueries(searches),
                performance_metrics: this.getPerformanceMetrics(searches)
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(analytics, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get search analytics: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private groupSearchesByTime(searches: SearchAnalytics[], groupBy: string) {
        const groups: Record<string, SearchAnalytics[]> = {};

        searches.forEach(search => {
            const date = new Date(search.timestamp);
            let key: string;

            if (groupBy === 'hour') {
                key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}`;
            } else if (groupBy === 'day') {
                key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
            } else {
                // week
                const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
                key = `${weekStart.getFullYear()}-${weekStart.getMonth() + 1}-${weekStart.getDate()}`;
            }

            if (!groups[key]) groups[key] = [];
            groups[key].push(search);
        });

        return Object.entries(groups).map(([period, periodSearches]) => ({
            period,
            count: periodSearches.length,
            avg_processing_time: periodSearches.reduce((sum, s) => sum + s.processing_time_ms, 0) / periodSearches.length,
            success_rate: (periodSearches.filter(s => s.results_count > 0).length / periodSearches.length) * 100
        }));
    }

    private getTopQueries(searches: SearchAnalytics[]) {
        const queryCount: Record<string, number> = {};
        const queryMetrics: Record<string, { total_time: number, total_results: number, count: number }> = {};

        searches.forEach(search => {
            queryCount[search.query] = (queryCount[search.query] || 0) + 1;

            if (!queryMetrics[search.query]) {
                queryMetrics[search.query] = { total_time: 0, total_results: 0, count: 0 };
            }
            queryMetrics[search.query].total_time += search.processing_time_ms;
            queryMetrics[search.query].total_results += search.results_count;
            queryMetrics[search.query].count += 1;
        });

        return Object.entries(queryCount)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([query, count]) => ({
                query,
                frequency: count,
                avg_processing_time: queryMetrics[query].total_time / queryMetrics[query].count,
                avg_results: queryMetrics[query].total_results / queryMetrics[query].count
            }));
    }

    private getPerformanceMetrics(searches: SearchAnalytics[]) {
        const processingTimes = searches.map(s => s.processing_time_ms).sort((a, b) => a - b);

        return {
            min_processing_time: Math.min(...processingTimes),
            max_processing_time: Math.max(...processingTimes),
            median_processing_time: processingTimes[Math.floor(processingTimes.length / 2)],
            p95_processing_time: processingTimes[Math.floor(processingTimes.length * 0.95)],
            slow_queries: searches.filter(s => s.processing_time_ms > 1000).length
        };
    }

    private async recordSearchFeedback(args: any) {
        const { search_id, clicked_results, satisfaction_rating, feedback_notes } = args;

        try {
            // Find the search in history
            const searchIndex = this.searchHistory.findIndex(s => s.id === search_id);
            if (searchIndex === -1) {
                throw new Error(`Search with ID ${search_id} not found`);
            }

            // Update the search with feedback
            this.searchHistory[searchIndex].clicked_results = clicked_results;
            this.searchHistory[searchIndex].user_satisfaction = satisfaction_rating;

            // Store feedback in database
            await this.storeSearchAnalytics(this.searchHistory[searchIndex]);

            // Store additional feedback notes if provided
            if (feedback_notes) {
                const db = getDatabase();
                db.run(`
                    INSERT INTO search_feedback (search_id, feedback_notes, timestamp)
                    VALUES (?, ?, ?)
                `, [search_id, feedback_notes, Date.now()]);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            search_id,
                            feedback_recorded: true,
                            clicked_results_count: clicked_results?.length || 0,
                            satisfaction_rating,
                            has_notes: !!feedback_notes
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to record search feedback: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('MeiliSearch MCP server running on stdio');
    }
}

// Run the server
const server = new MeiliSearchMCPServer();
server.run().catch(console.error);
