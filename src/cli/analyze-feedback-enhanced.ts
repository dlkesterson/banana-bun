#!/usr/bin/env bun

/**
 * Enhanced Feedback Analysis CLI
 * 
 * Implements the enhanced learning rule generation with improved pattern analysis,
 * confidence scoring, and automatic rule application as outlined in the roadmap.
 */

import { initDatabase } from '../db';
import { logger } from '../utils/logger';
import { EnhancedLearningService } from '../services/enhanced-learning-service';

interface AnalysisOptions {
    minFrequency: number;
    generateRules: boolean;
    applyRules: boolean;
    dryRun: boolean;
    confidenceThreshold: number;
    enableCrossModal: boolean;
    enableTemporal: boolean;
    strategy?: string;
    mediaId?: number;
}

async function parseArgs(): Promise<AnalysisOptions> {
    const args = process.argv.slice(2);
    const options: AnalysisOptions = {
        minFrequency: 3,
        generateRules: false,
        applyRules: false,
        dryRun: false,
        confidenceThreshold: 0.7,
        enableCrossModal: true,
        enableTemporal: true
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--min-frequency':
                options.minFrequency = parseInt(args[++i]) || 3;
                break;
            case '--generate-rules':
                options.generateRules = true;
                break;
            case '--apply-rules':
                options.applyRules = true;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--confidence':
                options.confidenceThreshold = parseFloat(args[++i]) || 0.7;
                break;
            case '--no-cross-modal':
                options.enableCrossModal = false;
                break;
            case '--no-temporal':
                options.enableTemporal = false;
                break;
            case '--strategy':
                options.strategy = args[++i];
                break;
            case '--media-id':
                options.mediaId = parseInt(args[++i]);
                break;
            case '--help':
                printHelp();
                process.exit(0);
        }
    }

    return options;
}

function printHelp(): void {
    console.log(`
🧠 Enhanced Feedback Analysis CLI

USAGE:
    bun run analyze-feedback-enhanced [OPTIONS]

OPTIONS:
    --min-frequency <n>      Minimum pattern frequency (default: 3)
    --generate-rules         Generate learning rules from patterns
    --apply-rules           Apply rules automatically to media
    --dry-run               Show what would be done without making changes
    --confidence <n>        Minimum confidence threshold (default: 0.7)
    --no-cross-modal        Disable cross-modal analysis
    --no-temporal           Disable temporal analysis
    --strategy <name>       Focus on specific strategy (frequency_based, semantic_similarity, temporal_correlation, cross_modal)
    --media-id <id>         Apply rules to specific media ID
    --help                  Show this help message

EXAMPLES:
    # Analyze patterns with enhanced learning
    bun run analyze-feedback-enhanced --generate-rules

    # Apply rules automatically with high confidence
    bun run analyze-feedback-enhanced --apply-rules --confidence 0.85

    # Dry run to see what would be generated
    bun run analyze-feedback-enhanced --generate-rules --dry-run

    # Focus on cross-modal learning only
    bun run analyze-feedback-enhanced --strategy cross_modal --generate-rules

    # Apply rules to specific media
    bun run analyze-feedback-enhanced --apply-rules --media-id 123
`);
}

async function main(): Promise<void> {
    try {
        const options = await parseArgs();
        
        console.log('🧠 Starting Enhanced Feedback Analysis...');
        console.log(`📊 Configuration:`, {
            minFrequency: options.minFrequency,
            confidenceThreshold: options.confidenceThreshold,
            crossModal: options.enableCrossModal,
            temporal: options.enableTemporal,
            strategy: options.strategy || 'all'
        });

        // Initialize database
        await initDatabase();

        // Initialize enhanced learning service
        const learningService = new EnhancedLearningService({
            min_pattern_frequency: options.minFrequency,
            min_confidence_threshold: options.confidenceThreshold,
            enable_cross_modal_analysis: options.enableCrossModal,
            enable_temporal_analysis: options.enableTemporal
        });

        if (options.generateRules) {
            console.log('\n🔍 Generating enhanced learning rules...');
            
            const rules = await learningService.generateEnhancedLearningRules(options.minFrequency);
            
            console.log(`\n📋 Generated ${rules.length} enhanced learning rules:`);
            
            for (const rule of rules) {
                console.log(`\n🔧 Rule: ${rule.rule_type}`);
                console.log(`   Strategy: ${rule.strategy_type}`);
                console.log(`   Condition: ${rule.condition}`);
                console.log(`   Action: ${rule.action}`);
                console.log(`   Confidence: ${(rule.confidence * 100).toFixed(1)}%`);
                console.log(`   Pattern Strength: ${((rule.pattern_strength || 0) * 100).toFixed(1)}%`);
                console.log(`   Effectiveness: ${((rule.effectiveness_score || 0) * 100).toFixed(1)}%`);
                
                if (rule.cross_modal_score) {
                    console.log(`   Cross-Modal Score: ${(rule.cross_modal_score * 100).toFixed(1)}%`);
                }
                
                if (rule.temporal_consistency) {
                    console.log(`   Temporal Consistency: ${(rule.temporal_consistency * 100).toFixed(1)}%`);
                }
                
                if (rule.similar_rules && rule.similar_rules.length > 0) {
                    console.log(`   Similar Rules: ${rule.similar_rules.length}`);
                }
            }

            if (!options.dryRun && rules.length > 0) {
                console.log('\n💾 Storing enhanced learning rules...');
                const storedRules = await learningService.storeEnhancedRules(rules);
                console.log(`✅ Stored ${storedRules.length}/${rules.length} rules successfully.`);
            } else if (options.dryRun) {
                console.log('\n🔍 Dry run: Rules would be stored in database.');
            }
        }

        if (options.applyRules) {
            console.log('\n🚀 Applying learning rules automatically...');
            
            if (options.mediaId) {
                // Apply to specific media
                const results = await learningService.applyRulesAutomatically(
                    options.mediaId, 
                    options.confidenceThreshold
                );
                
                console.log(`\n📊 Applied rules to media ${options.mediaId}:`);
                for (const result of results) {
                    if (result.applied) {
                        console.log(`✅ Rule ${result.rule_id}: ${result.changes_made.join(', ')}`);
                        if (result.validation_required) {
                            console.log(`   ⚠️  Validation recommended (confidence: ${(result.confidence_before * 100).toFixed(1)}%)`);
                        }
                    }
                }
                
                const appliedCount = results.filter(r => r.applied).length;
                console.log(`\n📈 Summary: ${appliedCount}/${results.length} rules applied successfully.`);
            } else {
                console.log('❌ --media-id required for rule application');
                process.exit(1);
            }
        }

        // Show strategy performance
        console.log('\n📊 Learning Strategy Performance:');
        const strategies = await learningService.getStrategyPerformance();
        
        for (const strategy of strategies) {
            console.log(`\n📈 ${strategy.name}:`);
            console.log(`   Enabled: ${strategy.enabled ? '✅' : '❌'}`);
            console.log(`   Rules Generated: ${strategy.rule_count}`);
            console.log(`   Performance Score: ${(strategy.performance_score * 100).toFixed(1)}%`);
            console.log(`   Weight: ${strategy.weight}`);
        }

        console.log('\n✨ Enhanced feedback analysis completed!');
        
    } catch (error) {
        console.error('❌ Enhanced feedback analysis failed:', error);
        await logger.error('Enhanced feedback analysis failed', { 
            error: error instanceof Error ? error.message : String(error) 
        });
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down enhanced feedback analysis...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down enhanced feedback analysis...');
    process.exit(0);
});

if (import.meta.main) {
    main();
}
