#!/usr/bin/env bun

/**
 * Smart Media Search CLI with MCP Integration
 * 
 * Enhanced search tool that uses the MeiliSearch MCP server for:
 * - Intelligent query optimization
 * - Search analytics and learning
 * - Query suggestions
 * - Performance monitoring
 * 
 * Usage:
 *   bun run src/cli/smart-media-search.ts "funny cat videos"
 *   bun run src/cli/smart-media-search.ts --suggestions "funny"
 *   bun run src/cli/smart-media-search.ts --analytics
 *   bun run src/cli/smart-media-search.ts --optimize-index
 */

import { parseArgs } from 'util';
import { initDatabase } from '../db';
import { mcpClient } from '../mcp/mcp-client';
import { logger } from '../utils/logger';

interface CliOptions {
    query?: string;
    filter?: string;
    limit?: number;
    suggestions?: string;
    analytics?: boolean;
    patterns?: boolean;
    optimizeIndex?: boolean;
    feedback?: string;
    rating?: number;
    sessionId?: string;
    help?: boolean;
}

function printUsage() {
    console.log(`
Smart Media Search with MCP Integration

Usage:
  bun run src/cli/smart-media-search.ts [options] [query]

Options:
  --filter <filter>        MeiliSearch filter expression
  --limit <number>         Maximum results to return (default: 10)
  --suggestions <partial>  Get search suggestions for partial query
  --analytics             Show search analytics and metrics
  --patterns              Analyze search patterns
  --optimize-index        Optimize search index based on usage
  --feedback <search_id>  Provide feedback for a search
  --rating <1-5>          Satisfaction rating (use with --feedback)
  --session-id <id>       Session ID for analytics tracking
  --help                  Show this help message

Examples:
  # Smart search with optimization
  bun run src/cli/smart-media-search.ts "funny cat videos"
  
  # Get search suggestions
  bun run src/cli/smart-media-search.ts --suggestions "funny"
  
  # View search analytics
  bun run src/cli/smart-media-search.ts --analytics
  
  # Analyze search patterns
  bun run src/cli/smart-media-search.ts --patterns
  
  # Optimize search index
  bun run src/cli/smart-media-search.ts --optimize-index
  
  # Provide feedback on a search
  bun run src/cli/smart-media-search.ts --feedback "search_123" --rating 4
`);
}

async function main() {
    try {
        const { values, positionals } = parseArgs({
            args: Bun.argv.slice(2),
            options: {
                filter: { type: 'string' },
                limit: { type: 'string' },
                suggestions: { type: 'string' },
                analytics: { type: 'boolean' },
                patterns: { type: 'boolean' },
                'optimize-index': { type: 'boolean' },
                feedback: { type: 'string' },
                rating: { type: 'string' },
                'session-id': { type: 'string' },
                help: { type: 'boolean' }
            },
            allowPositionals: true
        });

        const options: CliOptions = {
            query: positionals[0],
            filter: values.filter,
            limit: values.limit ? parseInt(values.limit) : 10,
            suggestions: values.suggestions,
            analytics: values.analytics,
            patterns: values.patterns,
            optimizeIndex: values['optimize-index'],
            feedback: values.feedback,
            rating: values.rating ? parseInt(values.rating) : undefined,
            sessionId: values['session-id'],
            help: values.help
        };

        if (options.help) {
            printUsage();
            return;
        }

        // Initialize database
        await initDatabase();
        console.log('🚀 Initializing MCP services...\n');

        if (options.suggestions) {
            await showSearchSuggestions(options.suggestions, options.limit!);
        } else if (options.analytics) {
            await showSearchAnalytics();
        } else if (options.patterns) {
            await showSearchPatterns();
        } else if (options.optimizeIndex) {
            await optimizeSearchIndex();
        } else if (options.feedback) {
            await provideFeedback(options.feedback, options.rating);
        } else if (options.query) {
            await performSmartSearch(options.query, options);
        } else {
            console.error('Error: Must provide a query or specify an action');
            printUsage();
            process.exit(1);
        }

    } catch (error) {
        console.error('Smart search failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

async function performSmartSearch(query: string, options: CliOptions): Promise<void> {
    try {
        console.log(`🧠 Smart search for: "${query}"`);
        if (options.filter) {
            console.log(`🔍 Filter: ${options.filter}`);
        }
        console.log('');

        const result = await mcpClient.smartSearch(query, {
            filters: options.filter,
            limit: options.limit,
            sessionId: options.sessionId
        });

        if (!result) {
            console.error('❌ MCP search failed - server may not be running');
            console.log('Start the MeiliSearch MCP server: bun run mcp:meilisearch');
            return;
        }

        console.log(`📊 Search Results (${result.results.total_hits} total, showing ${result.results.hits.length})`);
        console.log(`⏱️  Processing time: ${result.results.processing_time_ms}ms (Total: ${result.results.total_time_ms}ms)`);
        
        if (result.optimization_applied) {
            console.log(`🔧 Query optimized: "${result.original_query}" → "${result.final_query}"`);
            console.log(`   Type: ${result.optimization_applied.optimization_type}, Confidence: ${result.optimization_applied.confidence}`);
        }
        
        if (result.search_id) {
            console.log(`🆔 Search ID: ${result.search_id} (use for feedback)`);
        }
        
        console.log('');

        if (result.results.hits.length === 0) {
            console.log('No results found.');
            return;
        }

        for (let i = 0; i < result.results.hits.length; i++) {
            const hit = result.results.hits[i];
            console.log(`${i + 1}. ${hit.title || hit.filename}`);
            console.log(`   📁 ${hit.file_path}`);
            console.log(`   ⏱️  ${formatDuration(hit.duration)} | 📦 ${hit.format} | 🎭 ${hit.guessed_type || 'unknown'}`);
            
            if (hit.tags && hit.tags.length > 0) {
                console.log(`   🏷️  ${hit.tags.slice(0, 5).join(', ')}${hit.tags.length > 5 ? '...' : ''}`);
            }
            
            if (hit.transcript_snippet) {
                console.log(`   💬 ${hit.transcript_snippet}`);
            }
            
            console.log('');
        }

        if (result.pagination.has_more) {
            console.log(`📄 More results available (use --limit to see more)`);
        }

    } catch (error) {
        console.error('Smart search failed:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function showSearchSuggestions(partialQuery: string, limit: number): Promise<void> {
    try {
        console.log(`💡 Search suggestions for: "${partialQuery}"\n`);

        const result = await mcpClient.getSearchSuggestions(partialQuery, { limit });

        if (!result) {
            console.error('❌ Failed to get suggestions - MCP server may not be running');
            return;
        }

        if (result.query_suggestions.length > 0) {
            console.log('🔍 Query Suggestions:');
            result.query_suggestions.forEach((suggestion: any, i: number) => {
                console.log(`  ${i + 1}. "${suggestion.query}" (used ${suggestion.frequency}x, avg ${suggestion.avg_results} results)`);
            });
            console.log('');
        }

        if (result.filter_suggestions.length > 0) {
            console.log('🎛️  Filter Suggestions:');
            result.filter_suggestions.forEach((suggestion: any, i: number) => {
                console.log(`  ${i + 1}. ${suggestion.filter}`);
                console.log(`     ${suggestion.description} (~${suggestion.estimated_results} results)`);
            });
        }

        if (result.total_suggestions === 0) {
            console.log('No suggestions found. Try a different partial query.');
        }

    } catch (error) {
        console.error('Failed to get suggestions:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function showSearchAnalytics(): Promise<void> {
    try {
        console.log('📊 Search Analytics (Last 24 hours)\n');

        const result = await mcpClient.getSearchAnalytics();

        if (!result) {
            console.error('❌ Failed to get analytics - MCP server may not be running');
            return;
        }

        const summary = result.summary;
        console.log('📈 Summary:');
        console.log(`   Total searches: ${summary.total_searches}`);
        console.log(`   Successful: ${summary.successful_searches} (${((summary.successful_searches / summary.total_searches) * 100).toFixed(1)}%)`);
        console.log(`   Failed: ${summary.failed_searches}`);
        console.log(`   Avg processing time: ${summary.avg_processing_time.toFixed(1)}ms`);
        console.log(`   Avg results per search: ${summary.avg_results_per_search.toFixed(1)}`);
        console.log('');

        if (result.top_queries.length > 0) {
            console.log('🔥 Top Queries:');
            result.top_queries.forEach((query: any, i: number) => {
                console.log(`  ${i + 1}. "${query.query}" (${query.frequency}x, ${query.avg_processing_time.toFixed(1)}ms avg)`);
            });
            console.log('');
        }

        const perf = result.performance_metrics;
        console.log('⚡ Performance Metrics:');
        console.log(`   Min: ${perf.min_processing_time}ms | Max: ${perf.max_processing_time}ms`);
        console.log(`   Median: ${perf.median_processing_time}ms | 95th percentile: ${perf.p95_processing_time}ms`);
        console.log(`   Slow queries (>1s): ${perf.slow_queries}`);

    } catch (error) {
        console.error('Failed to get analytics:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function showSearchPatterns(): Promise<void> {
    try {
        console.log('🔍 Search Pattern Analysis (Last 24 hours)\n');

        const result = await mcpClient.analyzeSearchPatterns();

        if (!result) {
            console.error('❌ Failed to analyze patterns - MCP server may not be running');
            return;
        }

        console.log(`📊 Analysis Summary:`);
        console.log(`   Total searches: ${result.total_searches}`);
        console.log(`   Unique queries: ${result.unique_queries}`);
        console.log('');

        if (result.by_query_type) {
            console.log('📂 Search Types:');
            result.by_query_type.forEach((type: any) => {
                console.log(`   ${type.type}: ${type.count} searches (${type.percentage.toFixed(1)}%, avg ${type.avg_results.toFixed(1)} results)`);
            });
            console.log('');
        }

        if (result.performance_metrics) {
            const perf = result.performance_metrics;
            console.log('⚡ Performance:');
            console.log(`   Avg processing time: ${perf.avg_processing_time.toFixed(1)}ms`);
            console.log(`   Avg results count: ${perf.avg_results_count.toFixed(1)}`);
            console.log(`   Zero-result queries: ${perf.zero_result_queries}`);
        }

    } catch (error) {
        console.error('Failed to analyze patterns:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function optimizeSearchIndex(): Promise<void> {
    try {
        console.log('🔧 Optimizing Search Index...\n');

        const result = await mcpClient.optimizeSearchIndex({ analyzeOnly: false });

        if (!result) {
            console.error('❌ Failed to optimize index - MCP server may not be running');
            return;
        }

        console.log('📊 Current Index Stats:');
        console.log(`   Documents: ${result.index_stats.numberOfDocuments}`);
        console.log(`   Index size: ${(result.index_stats.databaseSize / 1024 / 1024).toFixed(2)} MB`);
        console.log('');

        if (result.optimization_recommendations.length > 0) {
            console.log('💡 Optimization Recommendations:');
            result.optimization_recommendations.forEach((rec: any, i: number) => {
                console.log(`   ${i + 1}. ${rec.type}:`);
                console.log(`      ${rec.reasoning}`);
                if (rec.current !== rec.recommended) {
                    console.log(`      Current: ${JSON.stringify(rec.current)}`);
                    console.log(`      Recommended: ${JSON.stringify(rec.recommended)}`);
                }
            });
            console.log('');
        }

        if (result.optimizations_applied) {
            console.log('✅ Optimizations applied successfully!');
        } else {
            console.log('ℹ️  Run with --analyze-only to see recommendations without applying changes');
        }

    } catch (error) {
        console.error('Failed to optimize index:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function provideFeedback(searchId: string, rating?: number): Promise<void> {
    try {
        console.log(`📝 Providing feedback for search: ${searchId}\n`);

        const result = await mcpClient.recordSearchFeedback(searchId, {
            satisfactionRating: rating
        });

        if (!result) {
            console.error('❌ Failed to record feedback - MCP server may not be running');
            return;
        }

        if (result.success) {
            console.log('✅ Feedback recorded successfully!');
            if (rating) {
                console.log(`   Rating: ${rating}/5`);
            }
        } else {
            console.log('❌ Failed to record feedback');
        }

    } catch (error) {
        console.error('Failed to provide feedback:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

main().catch(console.error);
