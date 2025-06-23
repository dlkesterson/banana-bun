#!/usr/bin/env bun

/**
 * CLI Command: Generate Scheduling Rules
 * 
 * Creates scheduling rules from detected patterns using LLM assistance.
 * 
 * Usage:
 * bun run generate-scheduling-rules --from-patterns --auto-enable --use-model "openai"
 */

import { Database } from 'bun:sqlite';
import { ChromaClient } from 'chromadb';
import { parseArgs } from 'util';
import { logger } from '../utils/logger';
import { config } from '../config';
import { getDatabase } from '../db';
import { RuleGenerationService } from '../services/rule-generation-service';
import { CronOptimizationService } from '../services/cron-optimization-service';
import { DEFAULT_RULE_SCHEDULER_CONFIG } from '../types/rule-scheduler';
import type { RuleGenerationConfig, LLMIntegrationConfig } from '../types/rule-scheduler';

interface GenerateOptions {
    'from-patterns': boolean;
    'pattern-ids': string | null;
    'auto-enable': boolean;
    'use-model': 'ollama' | 'openai' | 'both';
    'min-confidence': number;
    'max-rules': number;
    'conflict-strategy': 'priority' | 'merge' | 'disable_lower';
    'dry-run': boolean;
    'output-format': 'table' | 'json' | 'detailed';
    verbose: boolean;
}

async function main() {
    try {
        // Parse command line arguments
        const { values } = parseArgs({
            args: Bun.argv.slice(2),
            options: {
                'from-patterns': {
                    type: 'boolean',
                    default: true
                },
                'pattern-ids': {
                    type: 'string'
                },
                'auto-enable': {
                    type: 'boolean',
                    default: false
                },
                'use-model': {
                    type: 'string',
                    default: 'ollama'
                },
                'min-confidence': {
                    type: 'string',
                    default: '0.8'
                },
                'max-rules': {
                    type: 'string',
                    default: '10'
                },
                'conflict-strategy': {
                    type: 'string',
                    default: 'priority'
                },
                'dry-run': {
                    type: 'boolean',
                    default: false
                },
                'output-format': {
                    type: 'string',
                    default: 'table'
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

        const options: GenerateOptions = {
            'from-patterns': values['from-patterns'] as boolean,
            'pattern-ids': values['pattern-ids'] as string || null,
            'auto-enable': values['auto-enable'] as boolean,
            'use-model': (values['use-model'] as 'ollama' | 'openai' | 'both') || 'ollama',
            'min-confidence': parseFloat(values['min-confidence'] as string) || 0.8,
            'max-rules': parseInt(values['max-rules'] as string) || 10,
            'conflict-strategy': (values['conflict-strategy'] as 'priority' | 'merge' | 'disable_lower') || 'priority',
            'dry-run': values['dry-run'] as boolean,
            'output-format': (values['output-format'] as 'table' | 'json' | 'detailed') || 'table',
            verbose: values.verbose as boolean
        };

        // Validate options
        if (options['min-confidence'] < 0 || options['min-confidence'] > 1) {
            console.error('❌ Min confidence must be between 0 and 1');
            process.exit(1);
        }

        if (!['ollama', 'openai', 'both'].includes(options['use-model'])) {
            console.error('❌ Use model must be one of: ollama, openai, both');
            process.exit(1);
        }

        if (!['priority', 'merge', 'disable_lower'].includes(options['conflict-strategy'])) {
            console.error('❌ Conflict strategy must be one of: priority, merge, disable_lower');
            process.exit(1);
        }

        console.log('🔧 Starting rule generation...');
        console.log(`📊 From patterns: ${options['from-patterns']}`);
        console.log(`🤖 Model: ${options['use-model']}`);
        console.log(`🎯 Min confidence: ${options['min-confidence']}`);
        console.log(`📝 Max rules: ${options['max-rules']}`);
        console.log(`🔄 Conflict strategy: ${options['conflict-strategy']}`);
        console.log(`🧪 Dry run: ${options['dry-run']}`);

        // Initialize database and services
        const db = getDatabase();
        const chromaClient = new ChromaClient({
            host: config.paths.chroma.host,
            port: config.paths.chroma.port,
            ssl: config.paths.chroma.ssl
        });

        // Configure rule generation
        const ruleConfig: RuleGenerationConfig = {
            ...DEFAULT_RULE_SCHEDULER_CONFIG.rule_generation,
            auto_generation_enabled: options['auto-enable'],
            min_pattern_confidence: options['min-confidence'],
            max_rules_per_pattern: Math.ceil(options['max-rules'] / 3), // Distribute across patterns
            conflict_resolution_strategy: options['conflict-strategy']
        };

        const llmConfig: LLMIntegrationConfig = DEFAULT_RULE_SCHEDULER_CONFIG.llm_integration;

        // Initialize services
        const ruleService = new RuleGenerationService(db, chromaClient, ruleConfig);
        const cronService = new CronOptimizationService(llmConfig);

        // Parse pattern IDs if provided
        let patternIds: number[] | undefined;
        if (options['pattern-ids']) {
            patternIds = options['pattern-ids']
                .split(',')
                .map(id => parseInt(id.trim()))
                .filter(id => !isNaN(id));
            
            if (patternIds.length === 0) {
                console.error('❌ Invalid pattern IDs provided');
                process.exit(1);
            }
        }

        // Check if patterns exist
        if (options['from-patterns']) {
            const existingPatterns = await checkExistingPatterns(db, patternIds, options['min-confidence']);
            if (existingPatterns.length === 0) {
                console.log('📭 No patterns found matching the criteria');
                console.log('💡 Try running "bun run analyze-activity-patterns" first');
                process.exit(0);
            }
            console.log(`📊 Found ${existingPatterns.length} pattern(s) for rule generation`);
        }

        // Generate rules
        console.log('\n🔄 Generating scheduling rules...');
        const result = await ruleService.generateRulesFromPatterns(
            patternIds,
            options['use-model'] === 'both' ? 'ollama' : options['use-model']
        );

        // Optimize cron expressions if not dry run
        if (!options['dry-run'] && result.generated_rules.length > 0) {
            console.log('⚡ Optimizing cron expressions...');
            for (const rule of result.generated_rules) {
                try {
                    const validation = await cronService.validateAndImprove(rule.cron_expression);
                    if (validation.improvedExpression && validation.suggestions.length > 0) {
                        console.log(`   Improved rule "${rule.rule_name}": ${validation.suggestions[0]}`);
                        if (rule.id) {
                            await ruleService.updateRule(rule.id, {
                                cron_expression: validation.improvedExpression
                            });
                        }
                    }
                } catch (error) {
                    logger.warn('Failed to optimize cron expression', { 
                        ruleId: rule.id, 
                        error 
                    });
                }
            }
        }

        // Display results
        console.log('\n✅ Rule generation completed!');
        console.log('═'.repeat(80));

        if (options['output-format'] === 'json') {
            console.log(JSON.stringify(result, null, 2));
        } else if (options['output-format'] === 'detailed') {
            displayDetailedOutput(result, options.verbose);
        } else {
            displayTableOutput(result);
        }

        // Show summary
        displaySummary(result, options['dry-run']);

        // Show next steps
        if (!options['dry-run'] && result.generated_rules.length > 0) {
            console.log('\n🚀 NEXT STEPS:');
            console.log('   1. Review generated rules: bun run manage-rules --list');
            console.log('   2. Test rule execution: bun run test-rule-generation --rule-id <id>');
            console.log('   3. Monitor rule performance: bun run schedule --status');
            
            if (result.conflicts.length > 0) {
                console.log('   4. Resolve conflicts: bun run manage-rules --resolve-conflicts');
            }
        }

    } catch (error) {
        console.error('❌ Failed to generate scheduling rules:', error);
        logger.error('Rule generation failed', { error });
        process.exit(1);
    }
}

async function checkExistingPatterns(
    db: Database, 
    patternIds?: number[], 
    minConfidence?: number
): Promise<any[]> {
    let query = `
        SELECT id, pattern_type, confidence_score, detection_count 
        FROM activity_patterns 
        WHERE is_active = TRUE
    `;
    const params: any[] = [];

    if (minConfidence) {
        query += ' AND confidence_score >= ?';
        params.push(minConfidence);
    }

    if (patternIds && patternIds.length > 0) {
        query += ` AND id IN (${patternIds.map(() => '?').join(',')})`;
        params.push(...patternIds);
    }

    return db.query(query).all(...params) as any[];
}

function displayTableOutput(result: any) {
    if (result.generated_rules.length === 0) {
        console.log('📭 No rules were generated');
        return;
    }

    console.log('📋 GENERATED RULES:');
    console.log('┌─────┬─────────────────────────────┬─────────────────────┬─────────────┬─────────────┐');
    console.log('│ ID  │ Rule Name                   │ Cron Expression     │ Priority    │ Enabled     │');
    console.log('├─────┼─────────────────────────────┼─────────────────────┼─────────────┼─────────────┤');

    result.generated_rules.forEach((rule: any) => {
        const id = rule.id?.toString().padStart(3) || 'N/A';
        const name = rule.rule_name.substring(0, 27).padEnd(27);
        const cron = rule.cron_expression.padEnd(19);
        const priority = rule.priority.toString().padStart(11);
        const enabled = (rule.is_enabled ? '✅' : '❌').padEnd(11);

        console.log(`│ ${id} │ ${name} │ ${cron} │ ${priority} │ ${enabled} │`);
    });

    console.log('└─────┴─────────────────────────────┴─────────────────────┴─────────────┴─────────────┘');
}

function displayDetailedOutput(result: any, verbose: boolean) {
    console.log(`📊 RULE GENERATION RESULTS:`);
    console.log(`   Total generated: ${result.generation_summary.total_generated}`);
    console.log(`   Auto-enabled: ${result.generation_summary.auto_enabled}`);
    console.log(`   Requires review: ${result.generation_summary.requires_review}`);
    console.log(`   Conflicts detected: ${result.generation_summary.conflicts_detected}`);

    if (result.generated_rules.length > 0) {
        console.log('\n📋 GENERATED RULES:');
        result.generated_rules.forEach((rule: any, index: number) => {
            console.log(`\n${index + 1}. ${rule.rule_name}`);
            console.log(`   ID: ${rule.id || 'Not assigned'}`);
            console.log(`   Cron: ${rule.cron_expression}`);
            console.log(`   Priority: ${rule.priority}`);
            console.log(`   Confidence: ${(rule.confidence_score * 100).toFixed(1)}%`);
            console.log(`   Enabled: ${rule.is_enabled ? '✅ Yes' : '❌ No'}`);
            console.log(`   Auto-generated: ${rule.is_auto_generated ? 'Yes' : 'No'}`);
            console.log(`   Model used: ${rule.llm_model_used || 'N/A'}`);
            
            if (rule.description && verbose) {
                console.log(`   Description: ${rule.description}`);
            }
        });
    }

    if (result.conflicts.length > 0) {
        console.log('\n⚠️  CONFLICTS DETECTED:');
        result.conflicts.forEach((conflict: any, index: number) => {
            console.log(`\n${index + 1}. ${conflict.conflict_type} (${conflict.severity})`);
            console.log(`   Rules: ${conflict.rule_id_1} ↔ ${conflict.rule_id_2}`);
            console.log(`   Resolution: ${conflict.resolution_suggestion}`);
        });
    }
}

function displaySummary(result: any, isDryRun: boolean) {
    console.log(`\n📈 SUMMARY:`);
    console.log(`   Rules generated: ${result.generation_summary.total_generated}`);
    console.log(`   Auto-enabled: ${result.generation_summary.auto_enabled}`);
    console.log(`   Requires review: ${result.generation_summary.requires_review}`);
    console.log(`   Conflicts: ${result.generation_summary.conflicts_detected}`);
    
    if (isDryRun) {
        console.log('\n🧪 DRY RUN - No rules were actually saved to the database');
    } else if (result.generation_summary.total_generated > 0) {
        console.log('\n💾 Rules have been saved to the database');
    }
}

function showHelp() {
    console.log(`
🔧 Generate Scheduling Rules

Creates scheduling rules from detected patterns using LLM assistance.

USAGE:
    bun run generate-scheduling-rules [OPTIONS]

OPTIONS:
    --from-patterns             Generate rules from detected patterns (default: true)
    --pattern-ids <ids>         Comma-separated list of pattern IDs to use
    --auto-enable               Auto-enable generated rules (default: false)
    --use-model <model>         LLM model: ollama, openai, both (default: ollama)
    --min-confidence <number>   Minimum pattern confidence (0-1, default: 0.8)
    --max-rules <number>        Maximum rules to generate (default: 10)
    --conflict-strategy <strategy> Conflict resolution: priority, merge, disable_lower (default: priority)
    --dry-run                   Preview rules without saving (default: false)
    --output-format <format>    Output format: table, json, detailed (default: table)
    --verbose                   Show detailed information
    --help                      Show this help message

EXAMPLES:
    # Generate rules from all high-confidence patterns
    bun run generate-scheduling-rules --min-confidence 0.9

    # Generate rules from specific patterns
    bun run generate-scheduling-rules --pattern-ids "1,3,5" --auto-enable

    # Preview rules without saving
    bun run generate-scheduling-rules --dry-run --output-format detailed

    # Generate rules using OpenAI with conflict resolution
    bun run generate-scheduling-rules --use-model openai --conflict-strategy merge

CONFLICT RESOLUTION STRATEGIES:
    - priority: Keep higher priority rule, disable lower priority
    - merge: Attempt to merge conflicting rules (experimental)
    - disable_lower: Disable rule with lower confidence score

NEXT STEPS:
    After generating rules, use these commands:
    - bun run manage-rules --list           # Review generated rules
    - bun run test-rule-generation          # Test rule execution
    - bun run optimize-resource-schedule    # Optimize resource usage
`);
}

// Run the CLI command
main().catch(console.error);
