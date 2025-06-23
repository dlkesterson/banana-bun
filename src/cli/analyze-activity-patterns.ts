#!/usr/bin/env bun

/**
 * CLI Command: Analyze Activity Patterns
 * 
 * Analyzes system activity to identify temporal patterns for rule generation.
 * 
 * Usage:
 * bun run analyze-activity-patterns --days 30 --min-confidence 0.7 --use-model "ollama"
 */

import { Database } from 'bun:sqlite';
import { ChromaClient } from 'chromadb';
import { parseArgs } from 'util';
import { logger } from '../utils/logger';
import { config } from '../config';
import { getDatabase } from '../db';
import { PatternDetectionService } from '../services/pattern-detection-service';
import { UserBehaviorService } from '../services/user-behavior-service';
import { DEFAULT_RULE_SCHEDULER_CONFIG } from '../types/rule-scheduler';
import type { PatternDetectionConfig } from '../types/rule-scheduler';

interface AnalyzeOptions {
    days: number;
    'min-confidence': number;
    'use-model': string;
    'include-user-behavior': boolean;
    'output-format': 'json' | 'table' | 'summary';
    'save-patterns': boolean;
    verbose: boolean;
}

async function main() {
    try {
        // Parse command line arguments
        const { values } = parseArgs({
            args: Bun.argv.slice(2),
            options: {
                days: {
                    type: 'string',
                    default: '30'
                },
                'min-confidence': {
                    type: 'string',
                    default: '0.7'
                },
                'use-model': {
                    type: 'string',
                    default: 'ollama'
                },
                'include-user-behavior': {
                    type: 'boolean',
                    default: true
                },
                'output-format': {
                    type: 'string',
                    default: 'summary'
                },
                'save-patterns': {
                    type: 'boolean',
                    default: true
                },
                verbose: {
                    type: 'boolean',
                    default: false
                },
                help: {
                    type: 'boolean',
                    default: false
                }
            },
            allowPositionals: true
        });

        if (values.help) {
            showHelp();
            process.exit(0);
        }

        const options: AnalyzeOptions = {
            days: parseInt(values.days as string) || 30,
            'min-confidence': parseFloat(values['min-confidence'] as string) || 0.7,
            'use-model': values['use-model'] as string || 'ollama',
            'include-user-behavior': values['include-user-behavior'] as boolean,
            'output-format': (values['output-format'] as 'json' | 'table' | 'summary') || 'summary',
            'save-patterns': values['save-patterns'] as boolean,
            verbose: values.verbose as boolean
        };

        // Validate options
        if (options.days <= 0 || options.days > 365) {
            console.error('❌ Days must be between 1 and 365');
            process.exit(1);
        }

        if (options['min-confidence'] < 0 || options['min-confidence'] > 1) {
            console.error('❌ Min confidence must be between 0 and 1');
            process.exit(1);
        }

        if (!['ollama', 'openai', 'both'].includes(options['use-model'])) {
            console.error('❌ Use model must be one of: ollama, openai, both');
            process.exit(1);
        }

        console.log('🔍 Starting activity pattern analysis...');
        console.log(`📅 Analysis window: ${options.days} days`);
        console.log(`🎯 Min confidence: ${options['min-confidence']}`);
        console.log(`🤖 Model: ${options['use-model']}`);
        console.log(`👤 Include user behavior: ${options['include-user-behavior']}`);

        // Initialize database and services
        const db = getDatabase();
        const chromaClient = new ChromaClient({
            host: config.paths.chroma.host,
            port: config.paths.chroma.port,
            ssl: config.paths.chroma.ssl
        });

        // Configure pattern detection
        const patternConfig: PatternDetectionConfig = {
            ...DEFAULT_RULE_SCHEDULER_CONFIG.pattern_detection,
            min_confidence_threshold: options['min-confidence'],
            analysis_window_days: options.days,
            enable_user_behavior_analysis: options['include-user-behavior']
        };

        // Initialize services
        const patternService = new PatternDetectionService(db, chromaClient, patternConfig);
        const userBehaviorService = new UserBehaviorService(db, chromaClient, patternConfig);

        // Analyze activity patterns
        console.log('\n📊 Analyzing temporal patterns...');
        const patternAnalysis = await patternService.analyzeActivityPatterns(options.days);

        let userBehaviorAnalysis = null;
        if (options['include-user-behavior']) {
            console.log('👤 Analyzing user behavior patterns...');
            userBehaviorAnalysis = await userBehaviorService.analyzeUserBehavior('default', options.days);
        }

        // Generate user behavior patterns for rule creation
        let userPatterns = [];
        if (userBehaviorAnalysis) {
            console.log('🔄 Converting user behavior to activity patterns...');
            userPatterns = await userBehaviorService.generateBehaviorPatterns('default');
        }

        // Combine all patterns
        const allPatterns = [
            ...patternAnalysis.patterns_found,
            ...userPatterns
        ];

        // Output results
        console.log('\n✅ Analysis completed!');
        console.log('═'.repeat(60));

        if (options['output-format'] === 'json') {
            const output = {
                analysis_summary: patternAnalysis.analysis_summary,
                patterns: allPatterns,
                recommendations: patternAnalysis.recommendations,
                user_behavior: userBehaviorAnalysis
            };
            console.log(JSON.stringify(output, null, 2));
        } else if (options['output-format'] === 'table') {
            displayTableOutput(patternAnalysis, allPatterns, userBehaviorAnalysis);
        } else {
            displaySummaryOutput(patternAnalysis, allPatterns, userBehaviorAnalysis, options.verbose);
        }

        // Save patterns if requested
        if (options['save-patterns'] && allPatterns.length > 0) {
            console.log('\n💾 Patterns have been saved to the database');
            console.log('🔧 Use "bun run generate-scheduling-rules" to create rules from these patterns');
        }

        console.log('\n🎉 Pattern analysis completed successfully!');

    } catch (error) {
        console.error('❌ Failed to analyze activity patterns:', error);
        logger.error('Activity pattern analysis failed', { error });
        process.exit(1);
    }
}

function showHelp() {
    console.log(`
🔍 Analyze Activity Patterns

Analyzes system activity to identify temporal patterns for automated rule generation.

USAGE:
    bun run analyze-activity-patterns [OPTIONS]

OPTIONS:
    --days <number>              Number of days to analyze (default: 30, max: 365)
    --min-confidence <number>    Minimum confidence threshold (0-1, default: 0.7)
    --use-model <string>         LLM model to use: ollama, openai, both (default: ollama)
    --include-user-behavior      Include user behavior analysis (default: true)
    --output-format <format>     Output format: json, table, summary (default: summary)
    --save-patterns             Save detected patterns to database (default: true)
    --verbose                   Show detailed output (default: false)
    --help                      Show this help message

EXAMPLES:
    # Basic analysis with default settings
    bun run analyze-activity-patterns

    # Analyze last 7 days with high confidence threshold
    bun run analyze-activity-patterns --days 7 --min-confidence 0.8

    # Full analysis with JSON output
    bun run analyze-activity-patterns --days 60 --output-format json --verbose

    # Quick analysis without user behavior
    bun run analyze-activity-patterns --days 14 --include-user-behavior false

OUTPUT:
    The command will identify patterns such as:
    - Daily recurring tasks (e.g., backups at 2 AM)
    - Weekly patterns (e.g., media processing on weekends)
    - User behavior patterns (e.g., content creation in evenings)
    - Task correlations (e.g., download followed by transcription)

NEXT STEPS:
    After pattern analysis, use these commands:
    - bun run generate-scheduling-rules    # Create rules from patterns
    - bun run view-detected-patterns       # Review found patterns
    - bun run manage-rules                 # Manage generated rules
`);
}

function displaySummaryOutput(
    analysis: any,
    allPatterns: any[],
    userBehavior: any,
    verbose: boolean
) {
    console.log(`📈 ANALYSIS SUMMARY`);
    console.log(`   Total patterns found: ${analysis.analysis_summary.total_patterns}`);
    console.log(`   High confidence patterns: ${analysis.analysis_summary.high_confidence_patterns}`);
    console.log(`   Actionable patterns: ${analysis.analysis_summary.actionable_patterns}`);
    console.log(`   Analysis period: ${analysis.analysis_summary.analysis_period}`);

    if (allPatterns.length > 0) {
        console.log(`\n🎯 TOP PATTERNS BY CONFIDENCE:`);
        const topPatterns = allPatterns
            .sort((a, b) => b.confidence_score - a.confidence_score)
            .slice(0, 5);

        topPatterns.forEach((pattern, index) => {
            const data = JSON.parse(pattern.pattern_data);
            console.log(`   ${index + 1}. ${pattern.pattern_type} (${(pattern.confidence_score * 100).toFixed(1)}%)`);
            console.log(`      Frequency: ${pattern.detection_count} occurrences`);
            if (data.task_types && data.task_types.length > 0) {
                console.log(`      Task types: ${data.task_types.slice(0, 3).join(', ')}`);
            }
            if (verbose && data.time_windows && data.time_windows.length > 0) {
                const timeWindow = data.time_windows[0];
                console.log(`      Time window: ${timeWindow.start_hour}:00-${timeWindow.end_hour}:00`);
            }
        });
    }

    if (analysis.recommendations.length > 0) {
        console.log(`\n💡 RECOMMENDATIONS:`);
        analysis.recommendations.slice(0, 3).forEach((rec: any, index: number) => {
            console.log(`   ${index + 1}. ${rec.description} (${(rec.confidence * 100).toFixed(1)}% confidence)`);
            console.log(`      Impact: ${rec.potential_impact}`);
        });
    }

    if (userBehavior) {
        console.log(`\n👤 USER BEHAVIOR INSIGHTS:`);
        console.log(`   Peak hours: ${userBehavior.peak_hours.map((h: number) => `${h}:00`).join(', ')}`);
        console.log(`   Preferred tasks: ${userBehavior.preferred_task_types.slice(0, 3).join(', ')}`);
        console.log(`   Daily interaction frequency: ${userBehavior.interaction_frequency.toFixed(1)} tasks/day`);
    }
}

function displayTableOutput(analysis: any, allPatterns: any[], userBehavior: any) {
    console.log('📊 DETECTED PATTERNS:');
    console.log('┌─────────────────────┬────────────┬─────────────┬──────────────────┐');
    console.log('│ Pattern Type        │ Confidence │ Frequency   │ Task Types       │');
    console.log('├─────────────────────┼────────────┼─────────────┼──────────────────┤');
    
    allPatterns.slice(0, 10).forEach(pattern => {
        const data = JSON.parse(pattern.pattern_data);
        const taskTypes = data.task_types ? data.task_types.slice(0, 2).join(', ') : 'N/A';
        console.log(
            `│ ${pattern.pattern_type.padEnd(19)} │ ${(pattern.confidence_score * 100).toFixed(1).padStart(8)}% │ ${pattern.detection_count.toString().padStart(11)} │ ${taskTypes.padEnd(16)} │`
        );
    });
    
    console.log('└─────────────────────┴────────────┴─────────────┴──────────────────┘');
}

// Run the CLI command
main().catch(console.error);
