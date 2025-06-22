#!/usr/bin/env bun

/**
 * Media Intelligence CLI Tool
 * 
 * Advanced analytics and insights for your Atlas media collection:
 * - Content discovery pattern analysis
 * - Cross-modal correlation insights
 * - AI-powered tagging optimization
 * - Semantic search enhancement
 * - Comprehensive intelligence dashboard
 * 
 * Usage:
 *   bun run src/cli/media-intelligence.ts --dashboard
 *   bun run src/cli/media-intelligence.ts --discovery-analysis
 *   bun run src/cli/media-intelligence.ts --cross-modal --media-id 123
 *   bun run src/cli/media-intelligence.ts --optimize-tags --media-id 123
 *   bun run src/cli/media-intelligence.ts --enhance-search "cooking tutorial"
 */

import { parseArgs } from 'util';
import { initDatabase } from '../db';
import { mcpClient } from '../mcp/mcp-client';
import { logger } from '../utils/logger';

interface CliOptions {
    dashboard?: boolean;
    discoveryAnalysis?: boolean;
    crossModal?: boolean;
    optimizeTags?: boolean;
    enhanceSearch?: string;
    mediaId?: number;
    timeRange?: number;
    sessionId?: string;
    strategy?: string;
    help?: boolean;
}

function printUsage() {
    console.log(`
Media Intelligence Analytics

Usage:
  bun run src/cli/media-intelligence.ts [options]

Options:
  --dashboard                  Show comprehensive intelligence dashboard
  --discovery-analysis         Analyze content discovery patterns
  --cross-modal               Generate cross-modal correlation insights
  --optimize-tags             Optimize content tagging
  --enhance-search <query>    Enhance search query with semantic analysis
  --media-id <id>             Specific media ID for analysis
  --time-range <hours>        Time range for analysis (default: 168 hours)
  --session-id <id>           Specific user session to analyze
  --strategy <type>           Optimization strategy (search_driven, user_behavior, ai_enhanced, hybrid)
  --help                      Show this help message

Examples:
  # Show intelligence dashboard
  bun run src/cli/media-intelligence.ts --dashboard
  
  # Analyze discovery patterns for last 24 hours
  bun run src/cli/media-intelligence.ts --discovery-analysis --time-range 24
  
  # Get cross-modal insights for specific media
  bun run src/cli/media-intelligence.ts --cross-modal --media-id 123
  
  # Optimize tagging for media
  bun run src/cli/media-intelligence.ts --optimize-tags --media-id 123 --strategy hybrid
  
  # Enhance search query
  bun run src/cli/media-intelligence.ts --enhance-search "cooking tutorial"
  
  # Analyze specific user session
  bun run src/cli/media-intelligence.ts --discovery-analysis --session-id "user_123"
`);
}

async function main() {
    try {
        const { values } = parseArgs({
            args: Bun.argv.slice(2),
            options: {
                dashboard: { type: 'boolean' },
                'discovery-analysis': { type: 'boolean' },
                'cross-modal': { type: 'boolean' },
                'optimize-tags': { type: 'boolean' },
                'enhance-search': { type: 'string' },
                'media-id': { type: 'string' },
                'time-range': { type: 'string' },
                'session-id': { type: 'string' },
                strategy: { type: 'string' },
                help: { type: 'boolean' }
            }
        });

        const options: CliOptions = {
            dashboard: values.dashboard,
            discoveryAnalysis: values['discovery-analysis'],
            crossModal: values['cross-modal'],
            optimizeTags: values['optimize-tags'],
            enhanceSearch: values['enhance-search'],
            mediaId: values['media-id'] ? parseInt(values['media-id']) : undefined,
            timeRange: values['time-range'] ? parseInt(values['time-range']) : undefined,
            sessionId: values['session-id'],
            strategy: values.strategy,
            help: values.help
        };

        if (options.help) {
            printUsage();
            return;
        }

        // Initialize database
        await initDatabase();
        console.log('🧠 Initializing Media Intelligence...\n');

        if (options.dashboard) {
            await showIntelligenceDashboard(options);
        } else if (options.discoveryAnalysis) {
            await analyzeContentDiscovery(options);
        } else if (options.crossModal) {
            await generateCrossModalInsights(options);
        } else if (options.optimizeTags) {
            await optimizeContentTagging(options);
        } else if (options.enhanceSearch) {
            await enhanceSemanticSearch(options.enhanceSearch);
        } else {
            console.error('Error: Must specify an action');
            printUsage();
            process.exit(1);
        }

    } catch (error) {
        console.error('Media Intelligence analysis failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

async function showIntelligenceDashboard(options: CliOptions): Promise<void> {
    try {
        console.log('📊 Media Intelligence Dashboard\n');

        const result = await mcpClient.getIntelligenceDashboard({
            timeRangeHours: options.timeRange || 168,
            includeTrends: true,
            includePredictions: true,
            includeOptimizationOpportunities: true,
            detailLevel: 'comprehensive'
        });

        if (!result) {
            console.error('❌ Failed to get dashboard - MCP server may not be running');
            console.log('Start the Media Intelligence MCP server: bun run mcp:intelligence');
            return;
        }

        console.log(`🎯 Analysis Period: ${result.time_range_hours} hours`);
        console.log(`📈 Data Points: ${result.total_patterns} discovery patterns, ${result.total_correlations} correlations\n`);

        console.log('📊 Key Performance Metrics:');
        console.log(`   User Satisfaction: ${(result.metrics.avg_satisfaction * 100).toFixed(1)}%`);
        console.log(`   Search Effectiveness: ${(result.metrics.avg_search_effectiveness * 100).toFixed(1)}%`);
        console.log(`   Transcription Quality: ${(result.metrics.avg_transcription_quality * 100).toFixed(1)}%`);
        console.log(`   Tagging Accuracy: ${(result.metrics.avg_tagging_accuracy * 100).toFixed(1)}%\n`);

        if (result.insights && result.insights.length > 0) {
            console.log('🔥 Top AI Insights:');
            result.insights.slice(0, 5).forEach((insight: any, i: number) => {
                console.log(`   ${i + 1}. ${insight.type.replace('_', ' ').toUpperCase()}: ${insight.description}`);
                console.log(`      Confidence: ${(insight.confidence * 100).toFixed(1)}%`);
            });
            console.log('');
        }

        if (result.optimization_opportunities && result.optimization_opportunities.length > 0) {
            console.log('🚀 Optimization Opportunities:');
            result.optimization_opportunities.slice(0, 5).forEach((opp: any, i: number) => {
                console.log(`   ${i + 1}. ${opp.area.replace('_', ' ').toUpperCase()}: ${opp.description}`);
                console.log(`      Potential Impact: ${(opp.impact_score * 100).toFixed(1)}%`);
            });
            console.log('');
        }

        if (result.trends) {
            console.log('📈 Trend Analysis:');
            console.log(`   Overall Trend: ${result.trends.overall_direction || 'Stable'}`);
            console.log(`   Quality Improvement: ${result.trends.quality_change ? (result.trends.quality_change * 100).toFixed(1) + '%' : 'N/A'}`);
            console.log(`   User Engagement: ${result.trends.engagement_change ? (result.trends.engagement_change * 100).toFixed(1) + '%' : 'N/A'}`);
        }

    } catch (error) {
        console.error('Failed to show dashboard:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function analyzeContentDiscovery(options: CliOptions): Promise<void> {
    try {
        console.log('🔍 Content Discovery Pattern Analysis\n');

        const result = await mcpClient.analyzeContentDiscovery({
            timeRangeHours: options.timeRange || 24,
            userSessionId: options.sessionId,
            includeRecommendations: true,
            discoveryThreshold: 0.7
        });

        if (!result) {
            console.error('❌ Failed to analyze discovery patterns - MCP server may not be running');
            return;
        }

        const analysis = result.discovery_analysis;

        console.log(`📊 Discovery Analysis (${options.timeRange || 24} hours):`);
        console.log(`   Total Patterns: ${analysis.total_patterns}`);
        console.log(`   High Satisfaction: ${analysis.high_satisfaction_patterns} (${((analysis.high_satisfaction_patterns / analysis.total_patterns) * 100).toFixed(1)}%)`);
        console.log(`   Transcription Impact: ${(analysis.transcription_correlation.transcription_impact * 100).toFixed(1)}%\n`);

        if (analysis.common_search_terms && analysis.common_search_terms.length > 0) {
            console.log('🔤 Most Popular Search Terms:');
            analysis.common_search_terms.slice(0, 10).forEach((term: any, i: number) => {
                console.log(`   ${i + 1}. "${term.term}" (${term.frequency} searches)`);
            });
            console.log('');
        }

        if (analysis.content_type_preferences && analysis.content_type_preferences.length > 0) {
            console.log('📱 Content Type Preferences:');
            analysis.content_type_preferences.slice(0, 5).forEach((type: any, i: number) => {
                console.log(`   ${i + 1}. ${type.content_type}: ${type.discovery_count} discoveries, ${(type.avg_satisfaction * 100).toFixed(1)}% satisfaction`);
            });
            console.log('');
        }

        if (analysis.discovery_paths) {
            console.log('🛤️  Discovery Behavior:');
            console.log(`   Direct Search: ${analysis.discovery_paths.direct_search} patterns`);
            console.log(`   Iterative Search: ${analysis.discovery_paths.iterative_search} patterns`);
            console.log(`   Transcription Triggered: ${analysis.discovery_paths.transcription_triggered} times`);
            console.log(`   Tag Exploration: ${analysis.discovery_paths.tag_exploration} sessions`);
            console.log(`   Avg Session Duration: ${(analysis.discovery_paths.avg_session_duration / 1000 / 60).toFixed(1)} minutes\n`);
        }

        if (result.recommendations && result.recommendations.length > 0) {
            console.log('💡 AI Recommendations:');
            result.recommendations.forEach((rec: string, i: number) => {
                console.log(`   ${i + 1}. ${rec}`);
            });
            console.log('');
        }

    } catch (error) {
        console.error('Failed to analyze content discovery:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function generateCrossModalInsights(options: CliOptions): Promise<void> {
    try {
        if (!options.mediaId) {
            console.error('Error: --media-id is required for cross-modal analysis');
            return;
        }

        console.log(`🔗 Cross-Modal Insights for Media ID ${options.mediaId}\n`);

        const result = await mcpClient.generateCrossModalInsights({
            mediaId: options.mediaId,
            correlationThreshold: 0.6,
            includeOptimizationSuggestions: true,
            analysisDepth: 'comprehensive'
        });

        if (!result) {
            console.error('❌ Failed to generate insights - MCP server may not be running or no data found');
            return;
        }

        if (result.error) {
            console.error(`❌ ${result.error}`);
            console.log(`💡 ${result.suggestion}`);
            return;
        }

        const insights = result.insights;
        const correlation = result.correlation_data;

        console.log('📊 Overall Performance:');
        console.log(`   Cross-Modal Effectiveness: ${(insights.overall_effectiveness * 100).toFixed(1)}%`);
        console.log(`   Correlation Strength: ${(insights.correlation_strength * 100).toFixed(1)}%`);
        console.log(`   Cross-Modal Alignment: ${(insights.cross_modal_alignment * 100).toFixed(1)}%\n`);

        console.log('🎯 Component Analysis:');
        console.log(`   Search Effectiveness: ${(insights.component_analysis.search_effectiveness * 100).toFixed(1)}%`);
        console.log(`   Transcription Quality: ${(insights.component_analysis.transcription_quality * 100).toFixed(1)}%`);
        console.log(`   Tagging Accuracy: ${(insights.component_analysis.tagging_accuracy * 100).toFixed(1)}%\n`);

        console.log('🚀 Improvement Potential:');
        insights.improvement_potential.priority_order.forEach((item: any, i: number) => {
            console.log(`   ${i + 1}. ${item.component.toUpperCase()}: ${(item.potential * 100).toFixed(1)}% potential improvement`);
        });
        console.log('');

        if (insights.bottlenecks && insights.bottlenecks.length > 0) {
            console.log('⚠️  Identified Bottlenecks:');
            insights.bottlenecks.forEach((bottleneck: string, i: number) => {
                console.log(`   ${i + 1}. ${bottleneck.replace('_', ' ').toUpperCase()}`);
            });
            console.log('');
        }

        if (result.optimization_suggestions && result.optimization_suggestions.length > 0) {
            console.log('💡 Optimization Suggestions:');
            result.optimization_suggestions.forEach((suggestion: string, i: number) => {
                console.log(`   ${i + 1}. ${suggestion}`);
            });
            console.log('');
        }

        if (insights.detailed_analysis) {
            console.log('🔍 Detailed Analysis:');
            const detailed = insights.detailed_analysis;
            
            if (detailed.keyword_overlap) {
                console.log(`   Keyword Overlap - Search/Transcript: ${(detailed.keyword_overlap.search_transcript_overlap * 100).toFixed(1)}%`);
                console.log(`   Keyword Overlap - Search/Tags: ${(detailed.keyword_overlap.search_tag_overlap * 100).toFixed(1)}%`);
                console.log(`   Three-way Overlap: ${(detailed.keyword_overlap.three_way_overlap * 100).toFixed(1)}%`);
            }
        }

    } catch (error) {
        console.error('Failed to generate cross-modal insights:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function optimizeContentTagging(options: CliOptions): Promise<void> {
    try {
        if (!options.mediaId) {
            console.error('Error: --media-id is required for tag optimization');
            return;
        }

        console.log(`🏷️  Optimizing Content Tagging for Media ID ${options.mediaId}\n`);

        const result = await mcpClient.optimizeContentTagging(options.mediaId, {
            optimizationStrategy: options.strategy as any || 'hybrid',
            testMode: false,
            confidenceThreshold: 0.8
        });

        if (!result) {
            console.error('❌ Failed to optimize tagging - MCP server may not be running');
            return;
        }

        console.log(`🎯 Optimization Strategy: ${result.strategy || options.strategy || 'hybrid'}`);
        console.log(`📊 Confidence Score: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`🔗 Current Tag Overlap: ${(result.tag_overlap * 100).toFixed(1)}%\n`);

        if (result.current_tags) {
            console.log('🏷️  Current Tags:');
            console.log(`   AI Generated: ${result.current_tags.ai_tags?.join(', ') || 'None'}`);
            console.log(`   User Applied: ${result.current_tags.user_tags?.join(', ') || 'None'}\n`);
        }

        if (result.optimized_tags) {
            console.log('✨ Optimized Tags:');
            console.log(`   Recommended: ${result.optimized_tags.join(', ')}\n`);
        }

        if (result.optimization_reasoning) {
            console.log('💭 Optimization Reasoning:');
            result.optimization_reasoning.forEach((reason: string, i: number) => {
                console.log(`   ${i + 1}. ${reason}`);
            });
            console.log('');
        }

        if (result.performance_prediction) {
            console.log('📈 Performance Prediction:');
            console.log(`   Expected Search Improvement: ${(result.performance_prediction.search_improvement * 100).toFixed(1)}%`);
            console.log(`   Expected User Engagement: ${(result.performance_prediction.engagement_improvement * 100).toFixed(1)}%`);
        }

    } catch (error) {
        console.error('Failed to optimize tagging:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function enhanceSemanticSearch(query: string): Promise<void> {
    try {
        console.log(`🧠 Enhancing Search Query: "${query}"\n`);

        const result = await mcpClient.enhanceSemanticSearch({
            query,
            enhancementType: 'semantic_enrichment',
            useUserPatterns: true,
            cacheResult: true
        });

        if (!result) {
            console.error('❌ Failed to enhance search - MCP server may not be running');
            return;
        }

        console.log('✨ Enhanced Search Results:');
        console.log(`   Original Query: "${query}"`);
        console.log(`   Enhanced Query: "${result.enhanced_query || query}"`);
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%\n`);

        if (result.related_concepts && result.related_concepts.length > 0) {
            console.log('🔗 Related Concepts:');
            result.related_concepts.forEach((concept: string, i: number) => {
                console.log(`   ${i + 1}. ${concept}`);
            });
            console.log('');
        }

        if (result.semantic_expansion) {
            console.log('📈 Semantic Expansion:');
            result.semantic_expansion.forEach((expansion: string, i: number) => {
                console.log(`   ${i + 1}. ${expansion}`);
            });
            console.log('');
        }

        if (result.user_pattern_insights) {
            console.log('👤 User Pattern Insights:');
            result.user_pattern_insights.forEach((insight: string, i: number) => {
                console.log(`   ${i + 1}. ${insight}`);
            });
            console.log('');
        }

        if (result.optimization_suggestions) {
            console.log('💡 Search Optimization Suggestions:');
            result.optimization_suggestions.forEach((suggestion: string, i: number) => {
                console.log(`   ${i + 1}. ${suggestion}`);
            });
        }

    } catch (error) {
        console.error('Failed to enhance search:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

main().catch(console.error);
