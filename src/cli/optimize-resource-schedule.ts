#!/usr/bin/env bun

/**
 * CLI Command: Optimize Resource Schedule
 * 
 * Balances task load across time periods to optimize resource usage.
 * 
 * Usage:
 * bun run optimize-resource-schedule --balance-load --target-date "2023-12-01" --use-model "gpt-4"
 */

import { Database } from 'bun:sqlite';
import { ChromaClient } from 'chromadb';
import { parseArgs } from 'util';
import { logger } from '../utils/logger';
import { config } from '../config';
import { getDatabase } from '../db';
import { ResourceOptimizerService } from '../services/resource-optimizer-service';
import { PredictiveSchedulerService } from '../services/predictive-scheduler-service';
import { DEFAULT_RULE_SCHEDULER_CONFIG } from '../types/rule-scheduler';
import type { 
    OptimizationType, 
    OptimizationConfig, 
    LLMIntegrationConfig,
    PredictiveSchedulingConfig 
} from '../types/rule-scheduler';

interface OptimizeOptions {
    'balance-load': boolean;
    'peak-mitigation': boolean;
    'resource-efficiency': boolean;
    'conflict-resolution': boolean;
    'target-date': string | null;
    'use-model': 'ollama' | 'openai' | 'auto';
    'look-ahead-hours': number;
    'dry-run': boolean;
    'output-format': 'table' | 'json' | 'detailed';
    'auto-apply': boolean;
    verbose: boolean;
}

async function main() {
    try {
        // Parse command line arguments
        const { values } = parseArgs({
            args: Bun.argv.slice(2),
            options: {
                'balance-load': {
                    type: 'boolean',
                    default: false
                },
                'peak-mitigation': {
                    type: 'boolean',
                    default: false
                },
                'resource-efficiency': {
                    type: 'boolean',
                    default: false
                },
                'conflict-resolution': {
                    type: 'boolean',
                    default: false
                },
                'target-date': {
                    type: 'string'
                },
                'use-model': {
                    type: 'string',
                    default: 'auto'
                },
                'look-ahead-hours': {
                    type: 'string',
                    default: '24'
                },
                'dry-run': {
                    type: 'boolean',
                    default: false
                },
                'output-format': {
                    type: 'string',
                    default: 'table'
                },
                'auto-apply': {
                    type: 'boolean',
                    default: false
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

        const options: OptimizeOptions = {
            'balance-load': values['balance-load'] as boolean,
            'peak-mitigation': values['peak-mitigation'] as boolean,
            'resource-efficiency': values['resource-efficiency'] as boolean,
            'conflict-resolution': values['conflict-resolution'] as boolean,
            'target-date': values['target-date'] as string || null,
            'use-model': (values['use-model'] as 'ollama' | 'openai' | 'auto') || 'auto',
            'look-ahead-hours': parseInt(values['look-ahead-hours'] as string) || 24,
            'dry-run': values['dry-run'] as boolean,
            'output-format': (values['output-format'] as 'table' | 'json' | 'detailed') || 'table',
            'auto-apply': values['auto-apply'] as boolean,
            verbose: values.verbose as boolean
        };

        // Validate options
        if (options['look-ahead-hours'] < 1 || options['look-ahead-hours'] > 168) {
            console.error('❌ Look ahead hours must be between 1 and 168 (1 week)');
            process.exit(1);
        }

        if (!['ollama', 'openai', 'auto'].includes(options['use-model'])) {
            console.error('❌ Use model must be one of: ollama, openai, auto');
            process.exit(1);
        }

        // Determine optimization type
        const optimizationType = determineOptimizationType(options);
        if (!optimizationType) {
            console.error('❌ Please specify at least one optimization type');
            console.error('   Use --balance-load, --peak-mitigation, --resource-efficiency, or --conflict-resolution');
            process.exit(1);
        }

        // Parse target date
        let targetDate: Date | undefined;
        if (options['target-date']) {
            targetDate = new Date(options['target-date']);
            if (isNaN(targetDate.getTime())) {
                console.error('❌ Invalid target date format. Use YYYY-MM-DD or ISO format');
                process.exit(1);
            }
        }

        console.log('⚡ Starting resource schedule optimization...');
        console.log(`🎯 Optimization type: ${optimizationType}`);
        console.log(`📅 Target date: ${targetDate?.toISOString().split('T')[0] || 'current'}`);
        console.log(`🔮 Look ahead: ${options['look-ahead-hours']} hours`);
        console.log(`🤖 Model: ${options['use-model']}`);
        console.log(`🧪 Dry run: ${options['dry-run']}`);

        // Initialize database and services
        const db = getDatabase();
        const chromaClient = new ChromaClient({
            host: config.paths.chroma.host,
            port: config.paths.chroma.port,
            ssl: config.paths.chroma.ssl
        });

        // Configure services
        const optimizationConfig: OptimizationConfig = {
            ...DEFAULT_RULE_SCHEDULER_CONFIG.optimization,
            auto_optimization_enabled: true
        };

        const predictiveConfig: PredictiveSchedulingConfig = {
            ...DEFAULT_RULE_SCHEDULER_CONFIG.predictive_scheduling,
            enabled: true
        };

        const llmConfig: LLMIntegrationConfig = DEFAULT_RULE_SCHEDULER_CONFIG.llm_integration;

        // Initialize services
        const optimizerService = new ResourceOptimizerService(
            db, 
            chromaClient, 
            optimizationConfig, 
            llmConfig
        );

        const predictiveService = new PredictiveSchedulerService(
            db,
            chromaClient,
            predictiveConfig,
            llmConfig
        );

        // Generate predictive schedules first
        console.log('\n🔮 Generating predictive schedules...');
        const predictions = await predictiveService.generatePredictiveSchedules(
            options['look-ahead-hours'],
            options['use-model']
        );

        console.log(`   Generated ${predictions.length} predictive schedules`);
        if (options.verbose) {
            const highConfidence = predictions.filter(p => p.confidence_score >= 0.8).length;
            console.log(`   High confidence predictions: ${highConfidence}`);
            const scheduled = predictions.filter(p => p.is_scheduled).length;
            console.log(`   Auto-scheduled: ${scheduled}`);
        }

        // Perform resource optimization
        console.log('\n⚡ Optimizing resource schedule...');
        const optimizationResult = await optimizerService.optimizeResourceSchedule(
            targetDate,
            optimizationType,
            options['use-model']
        );

        // Display results
        console.log('\n✅ Optimization completed!');
        console.log('═'.repeat(80));

        if (options['output-format'] === 'json') {
            const output = {
                optimization_result: optimizationResult,
                predictive_schedules: predictions
            };
            console.log(JSON.stringify(output, null, 2));
        } else if (options['output-format'] === 'detailed') {
            displayDetailedOutput(optimizationResult, predictions, options.verbose);
        } else {
            displayTableOutput(optimizationResult, predictions);
        }

        // Show summary and recommendations
        displaySummaryAndRecommendations(optimizationResult, options);

    } catch (error) {
        console.error('❌ Failed to optimize resource schedule:', error);
        logger.error('Resource optimization failed', { error });
        process.exit(1);
    }
}

function determineOptimizationType(options: OptimizeOptions): OptimizationType | null {
    if (options['balance-load']) return 'load_balancing';
    if (options['peak-mitigation']) return 'peak_mitigation';
    if (options['resource-efficiency']) return 'efficiency_improvement';
    if (options['conflict-resolution']) return 'conflict_resolution';
    
    // Default to load balancing if none specified but other options present
    if (options['target-date'] || options['look-ahead-hours'] !== 24) {
        return 'load_balancing';
    }
    
    return null;
}

function displayTableOutput(optimizationResult: any, predictions: any[]) {
    console.log('📊 OPTIMIZATION RESULTS:');
    console.log('┌─────────────────────────┬─────────────────────────┬─────────────────────────┐');
    console.log('│ Metric                  │ Before                  │ After                   │');
    console.log('├─────────────────────────┼─────────────────────────┼─────────────────────────┤');
    
    try {
        const improvements = JSON.parse(optimizationResult.improvement_metrics);
        
        const metrics = [
            ['Resource Utilization', 'Baseline', `${(improvements.resource_utilization_improvement * 100).toFixed(1)}% better`],
            ['Peak Load', 'Baseline', `${(improvements.peak_load_reduction * 100).toFixed(1)}% reduced`],
            ['Conflicts', 'Baseline', `${(improvements.conflict_reduction * 100).toFixed(1)}% fewer`],
            ['Efficiency Gain', 'N/A', `${(improvements.efficiency_gain * 100).toFixed(1)}%`],
            ['Time Savings', 'N/A', `${improvements.estimated_time_savings_minutes.toFixed(0)} min`]
        ];
        
        metrics.forEach(([metric, before, after]) => {
            console.log(`│ ${metric.padEnd(23)} │ ${before.padEnd(23)} │ ${after.padEnd(23)} │`);
        });
    } catch (error) {
        console.log('│ Error parsing metrics  │ N/A                     │ N/A                     │');
    }
    
    console.log('└─────────────────────────┴─────────────────────────┴─────────────────────────┘');

    if (predictions.length > 0) {
        console.log('\n🔮 PREDICTIVE SCHEDULES:');
        console.log(`   Total predictions: ${predictions.length}`);
        console.log(`   High confidence (>80%): ${predictions.filter(p => p.confidence_score > 0.8).length}`);
        console.log(`   Auto-scheduled: ${predictions.filter(p => p.is_scheduled).length}`);
    }
}

function displayDetailedOutput(optimizationResult: any, predictions: any[], verbose: boolean) {
    console.log(`🎯 OPTIMIZATION TYPE: ${optimizationResult.optimization_type}`);
    console.log(`✅ SUCCESS: ${optimizationResult.success ? 'Yes' : 'No'}`);
    console.log(`📅 APPLIED AT: ${optimizationResult.applied_at || 'Not applied'}`);
    
    if (optimizationResult.error_message) {
        console.log(`❌ ERROR: ${optimizationResult.error_message}`);
    }

    try {
        const improvements = JSON.parse(optimizationResult.improvement_metrics);
        
        console.log('\n📈 IMPROVEMENT METRICS:');
        console.log(`   Resource Utilization: ${(improvements.resource_utilization_improvement * 100).toFixed(2)}% improvement`);
        console.log(`   Peak Load Reduction: ${(improvements.peak_load_reduction * 100).toFixed(2)}%`);
        console.log(`   Conflict Reduction: ${(improvements.conflict_reduction * 100).toFixed(2)}%`);
        console.log(`   Overall Efficiency Gain: ${(improvements.efficiency_gain * 100).toFixed(2)}%`);
        console.log(`   Estimated Time Savings: ${improvements.estimated_time_savings_minutes.toFixed(0)} minutes`);
    } catch (error) {
        console.log('\n❌ Error parsing improvement metrics');
    }

    if (predictions.length > 0) {
        console.log('\n🔮 PREDICTIVE SCHEDULES:');
        console.log(`   Total generated: ${predictions.length}`);
        
        const byConfidence = {
            high: predictions.filter(p => p.confidence_score >= 0.8).length,
            medium: predictions.filter(p => p.confidence_score >= 0.6 && p.confidence_score < 0.8).length,
            low: predictions.filter(p => p.confidence_score < 0.6).length
        };
        
        console.log(`   High confidence (≥80%): ${byConfidence.high}`);
        console.log(`   Medium confidence (60-79%): ${byConfidence.medium}`);
        console.log(`   Low confidence (<60%): ${byConfidence.low}`);
        console.log(`   Auto-scheduled: ${predictions.filter(p => p.is_scheduled).length}`);

        if (verbose && predictions.length > 0) {
            console.log('\n📋 TOP PREDICTIONS:');
            const topPredictions = predictions
                .sort((a, b) => b.confidence_score - a.confidence_score)
                .slice(0, 5);
            
            topPredictions.forEach((pred, index) => {
                const time = new Date(pred.predicted_execution_time).toLocaleString();
                console.log(`   ${index + 1}. ${pred.predicted_task_type} at ${time} (${(pred.confidence_score * 100).toFixed(1)}%)`);
            });
        }
    }

    if (verbose) {
        try {
            const originalSchedule = JSON.parse(optimizationResult.original_schedule);
            const optimizedSchedule = JSON.parse(optimizationResult.optimized_schedule);
            
            console.log('\n📊 SCHEDULE COMPARISON:');
            console.log(`   Original active rules: ${originalSchedule.active_schedules?.length || 0}`);
            console.log(`   Optimized active rules: ${optimizedSchedule.active_schedules?.length || 0}`);
            console.log(`   Original timestamp: ${originalSchedule.timestamp}`);
            console.log(`   Optimized timestamp: ${optimizedSchedule.timestamp}`);
        } catch (error) {
            console.log('\n❌ Error parsing schedule data');
        }
    }
}

function displaySummaryAndRecommendations(optimizationResult: any, options: OptimizeOptions) {
    console.log('\n📈 SUMMARY:');
    console.log(`   Optimization: ${optimizationResult.success ? '✅ Successful' : '❌ Failed'}`);
    
    try {
        const improvements = JSON.parse(optimizationResult.improvement_metrics);
        const efficiencyGain = improvements.efficiency_gain * 100;
        
        if (efficiencyGain > 10) {
            console.log(`   Impact: 🚀 High (${efficiencyGain.toFixed(1)}% efficiency gain)`);
        } else if (efficiencyGain > 5) {
            console.log(`   Impact: ⚡ Medium (${efficiencyGain.toFixed(1)}% efficiency gain)`);
        } else if (efficiencyGain > 0) {
            console.log(`   Impact: 📈 Low (${efficiencyGain.toFixed(1)}% efficiency gain)`);
        } else {
            console.log(`   Impact: 📊 Minimal (${efficiencyGain.toFixed(1)}% efficiency gain)`);
        }
        
        if (improvements.estimated_time_savings_minutes > 60) {
            console.log(`   Time Savings: ${(improvements.estimated_time_savings_minutes / 60).toFixed(1)} hours`);
        } else {
            console.log(`   Time Savings: ${improvements.estimated_time_savings_minutes.toFixed(0)} minutes`);
        }
    } catch (error) {
        console.log('   Impact: ❓ Unknown (error parsing metrics)');
    }
    
    if (options['dry-run']) {
        console.log('\n🧪 DRY RUN - No changes were applied');
    } else if (optimizationResult.applied_at) {
        console.log('\n✅ Optimizations have been applied to the schedule');
    } else {
        console.log('\n⏳ Optimizations were not applied (insufficient improvement threshold)');
    }

    console.log('\n🚀 NEXT STEPS:');
    if (!optimizationResult.applied_at && optimizationResult.success) {
        console.log('   1. Review optimization results above');
        console.log('   2. Run with --auto-apply to apply optimizations');
        console.log('   3. Monitor system performance after changes');
    } else if (optimizationResult.applied_at) {
        console.log('   1. Monitor system performance for improvements');
        console.log('   2. Run optimization again in 6-12 hours');
        console.log('   3. Review predictive schedule accuracy');
    } else {
        console.log('   1. Check system logs for optimization errors');
        console.log('   2. Try different optimization type');
        console.log('   3. Ensure sufficient historical data exists');
    }
    
    console.log('   4. Use "bun run view-detected-patterns" to review patterns');
    console.log('   5. Use "bun run manage-rules" to review generated rules');
}

function showHelp() {
    console.log(`
⚡ Optimize Resource Schedule

Balances task load across time periods to optimize resource usage and system performance.

USAGE:
    bun run optimize-resource-schedule [OPTIONS]

OPTIMIZATION TYPES:
    --balance-load              Balance task load across time periods
    --peak-mitigation          Reduce peak resource usage periods
    --resource-efficiency      Optimize for overall resource efficiency
    --conflict-resolution      Resolve scheduling conflicts

OPTIONS:
    --target-date <date>        Target date for optimization (YYYY-MM-DD, default: current)
    --use-model <model>         LLM model: ollama, openai, auto (default: auto)
    --look-ahead-hours <hours>  Hours to look ahead for optimization (1-168, default: 24)
    --dry-run                   Preview optimizations without applying (default: false)
    --output-format <format>    Output format: table, json, detailed (default: table)
    --auto-apply               Automatically apply beneficial optimizations (default: false)
    --verbose                   Show detailed information
    --help                      Show this help message

EXAMPLES:
    # Basic load balancing optimization
    bun run optimize-resource-schedule --balance-load

    # Peak mitigation for tomorrow with detailed output
    bun run optimize-resource-schedule --peak-mitigation --target-date "2023-12-02" --output-format detailed

    # Resource efficiency optimization with auto-apply
    bun run optimize-resource-schedule --resource-efficiency --auto-apply --verbose

    # Preview 48-hour optimization using OpenAI
    bun run optimize-resource-schedule --balance-load --look-ahead-hours 48 --use-model openai --dry-run

OPTIMIZATION STRATEGIES:
    - Load Balancing: Redistributes tasks to avoid resource bottlenecks
    - Peak Mitigation: Staggers high-resource tasks to reduce peak usage
    - Resource Efficiency: Optimizes task timing for overall efficiency
    - Conflict Resolution: Resolves scheduling conflicts and overlaps

INTEGRATION:
    This command works with:
    - Detected activity patterns
    - Generated scheduling rules
    - Predictive schedules
    - System resource monitoring

NEXT STEPS:
    After optimization, use these commands:
    - bun run view-detected-patterns    # Review patterns
    - bun run manage-rules             # Manage rules
    - bun run schedule --status        # Check schedule status
`);
}

// Run the CLI command
main().catch(console.error);
