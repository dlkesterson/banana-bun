#!/usr/bin/env bun

/**
 * Banana Bun CLI tool for running feedback loop analysis and learning
 * 
 * Usage:
 *   bun run src/cli/run-feedback-loop.ts
 *   bun run src/cli/run-feedback-loop.ts --analyze-only
 *   bun run src/cli/run-feedback-loop.ts --min-frequency 5
 *   bun run src/cli/run-feedback-loop.ts --apply-rules
 */

import { parseArgs } from 'util';
import { initDatabase, getDatabase } from '../db';
import { logger } from '../utils/logger';
import { feedbackTracker, type FeedbackPattern, type LearningRule } from '../feedback-tracker';

interface CliOptions {
    analyzeOnly?: boolean;
    minFrequency?: number;
    applyRules?: boolean;
    dryRun?: boolean;
    help?: boolean;
}

function printUsage() {
    console.log(`
Banana Bun Feedback Loop Learning Tool

Usage: bun run src/cli/run-feedback-loop.ts [options]

Options:
  --analyze-only            Only analyze patterns, don't generate rules
  --min-frequency <num>     Minimum frequency for pattern detection (default: 3)
  --apply-rules             Apply existing learning rules to media
  --dry-run                 Show what would be done without making changes
  --help, -h                Show this help message

Examples:
  # Full feedback loop analysis and rule generation
  bun run src/cli/run-feedback-loop.ts

  # Only analyze patterns with higher frequency threshold
  bun run src/cli/run-feedback-loop.ts --analyze-only --min-frequency 5

  # Apply existing rules to media
  bun run src/cli/run-feedback-loop.ts --apply-rules

  # Dry run to see what would happen
  bun run src/cli/run-feedback-loop.ts --dry-run
`);
}

function parseCliArgs(): CliOptions {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            'analyze-only': { type: 'boolean', default: false },
            'min-frequency': { type: 'string' },
            'apply-rules': { type: 'boolean', default: false },
            'dry-run': { type: 'boolean', default: false },
            help: { type: 'boolean', short: 'h', default: false }
        }
    });

    const options: CliOptions = {
        analyzeOnly: values['analyze-only'],
        applyRules: values['apply-rules'],
        dryRun: values['dry-run'],
        help: values.help
    };

    if (values['min-frequency']) {
        const minFreq = parseInt(values['min-frequency'], 10);
        if (isNaN(minFreq) || minFreq < 1) {
            throw new Error(`Invalid min-frequency: ${values['min-frequency']}. Must be at least 1`);
        }
        options.minFrequency = minFreq;
    }

    return options;
}

function displayPatterns(patterns: FeedbackPattern[]): void {
    if (patterns.length === 0) {
        console.log('No significant patterns detected.');
        return;
    }

    console.log(`🔍 Detected ${patterns.length} feedback patterns:\n`);

    patterns.forEach((pattern, index) => {
        console.log(`${index + 1}. ${pattern.pattern_type.toUpperCase()}: ${pattern.pattern_description}`);
        console.log(`   📊 Frequency: ${pattern.frequency} occurrences`);
        console.log(`   🎯 Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);

        if (pattern.examples.length > 0) {
            console.log(`   📝 Examples:`);
            pattern.examples.slice(0, 2).forEach(example => {
                console.log(`      "${example.original}" → "${example.corrected}" (Media ${example.media_id})`);
            });
        }

        if (pattern.suggested_rule) {
            console.log(`   💡 Suggested Rule: ${pattern.suggested_rule}`);
        }

        console.log();
    });
}

function displayRules(rules: LearningRule[]): void {
    if (rules.length === 0) {
        console.log('No learning rules generated.');
        return;
    }

    console.log(`🧠 Generated ${rules.length} learning rules:\n`);

    rules.forEach((rule, index) => {
        console.log(`${index + 1}. ${rule.rule_type.toUpperCase()}`);
        console.log(`   📋 Condition: ${rule.condition}`);
        console.log(`   ⚡ Action: ${rule.action}`);
        console.log(`   🎯 Confidence: ${(rule.confidence * 100).toFixed(1)}%`);
        console.log(`   📊 Usage: ${rule.usage_count} times`);
        console.log();
    });
}

async function analyzePatterns(minFrequency: number): Promise<FeedbackPattern[]> {
    console.log(`🔍 Analyzing feedback patterns (min frequency: ${minFrequency})...`);

    const patterns = await feedbackTracker.analyzeFeedbackPatterns(minFrequency);

    console.log(`✅ Analysis complete. Found ${patterns.length} patterns.\n`);

    displayPatterns(patterns);

    return patterns;
}

async function generateRules(patterns: FeedbackPattern[], dryRun: boolean): Promise<LearningRule[]> {
    console.log('🧠 Generating learning rules from patterns...');

    const rules = await feedbackTracker.generateLearningRules(patterns);

    console.log(`✅ Generated ${rules.length} learning rules.\n`);

    displayRules(rules);

    if (!dryRun && rules.length > 0) {
        console.log('💾 Saving learning rules to database...');

        const db = getDatabase();

        // Create learning_rules table if it doesn't exist
        db.run(`
            CREATE TABLE IF NOT EXISTS learning_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_type TEXT NOT NULL,
                condition_text TEXT NOT NULL,
                action_text TEXT NOT NULL,
                confidence REAL NOT NULL,
                created_from_feedback BOOLEAN DEFAULT TRUE,
                usage_count INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 0.0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used_at DATETIME
            )
        `);

        let savedCount = 0;
        for (const rule of rules) {
            try {
                db.run(`
                    INSERT INTO learning_rules (
                        rule_type, condition_text, action_text, confidence,
                        created_from_feedback, usage_count, success_rate
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    rule.rule_type,
                    rule.condition,
                    rule.action,
                    rule.confidence,
                    rule.created_from_feedback,
                    rule.usage_count,
                    rule.success_rate
                ]);
                savedCount++;
            } catch (error) {
                console.warn(`⚠️  Failed to save rule: ${error}`);
            }
        }

        console.log(`✅ Saved ${savedCount}/${rules.length} learning rules to database.`);
    } else if (dryRun) {
        console.log('🔍 Dry run: Rules would be saved to database.');
    }

    return rules;
}

async function applyExistingRules(dryRun: boolean): Promise<void> {
    console.log('⚡ Applying existing learning rules...');

    const db = getDatabase();

    // Get existing rules
    const rules = db.prepare(`
        SELECT * FROM learning_rules 
        WHERE confidence >= 0.7
        ORDER BY confidence DESC, usage_count ASC
    `).all() as any[];

    if (rules.length === 0) {
        console.log('No learning rules found to apply.');
        return;
    }

    console.log(`Found ${rules.length} rules to apply.`);

    // Get media that might benefit from rules
    const mediaItems = db.prepare(`
        SELECT DISTINCT mm.id 
        FROM media_metadata mm
        LEFT JOIN media_tags mt ON mm.id = mt.media_id
        WHERE mm.id NOT IN (
            SELECT DISTINCT media_id 
            FROM user_feedback 
            WHERE timestamp >= DATE('now', '-7 days')
        )
        LIMIT 100
    `).all() as { id: number }[];

    console.log(`Checking ${mediaItems.length} media items...`);

    let applicationsCount = 0;

    for (const media of mediaItems) {
        for (const rule of rules) {
            const learningRule: LearningRule = {
                id: rule.id,
                rule_type: rule.rule_type,
                condition: rule.condition_text,
                action: rule.action_text,
                confidence: rule.confidence,
                created_from_feedback: rule.created_from_feedback,
                usage_count: rule.usage_count,
                success_rate: rule.success_rate
            };

            if (!dryRun) {
                const applied = await feedbackTracker.applyLearningRule(learningRule, media.id);
                if (applied) {
                    applicationsCount++;
                }
            } else {
                // In dry run, simulate application
                console.log(`   Would apply rule ${rule.id} to media ${media.id}`);
                applicationsCount++;
            }
        }
    }

    if (dryRun) {
        console.log(`🔍 Dry run: Would apply rules ${applicationsCount} times.`);
    } else {
        console.log(`✅ Applied rules ${applicationsCount} times.`);
    }
}

async function showFeedbackSummary(): Promise<void> {
    console.log('\n📊 Feedback Summary:');
    console.log('='.repeat(50));

    const stats = await feedbackTracker.getFeedbackStats(30);

    console.log(`Total feedback (30 days): ${stats.total_feedback}`);

    if (stats.feedback_by_type.length > 0) {
        console.log('\nFeedback by type:');
        stats.feedback_by_type.forEach(type => {
            console.log(`  ${type.type}: ${type.count}`);
        });
    }

    const topCorrections = await feedbackTracker.getTopCorrections(5);
    if (topCorrections.length > 0) {
        console.log('\nTop corrections:');
        topCorrections.forEach(correction => {
            console.log(`  "${correction.original_value}" → "${correction.corrected_value}" (${correction.frequency}x)`);
        });
    }
}

async function main() {
    try {
        const options = parseCliArgs();

        if (options.help) {
            printUsage();
            process.exit(0);
        }

        console.log("🔄 Banana Bun Feedback Loop Learning Tool");
        console.log('====================================\n');

        // Initialize database
        initDatabase();
        console.log('✅ Database initialized');

        if (options.dryRun) {
            console.log('🔍 Running in dry-run mode (no changes will be made)\n');
        }

        // Show feedback summary
        await showFeedbackSummary();

        if (options.applyRules) {
            // Apply existing rules
            console.log('\n⚡ Applying Existing Rules:');
            console.log('='.repeat(50));
            await applyExistingRules(options.dryRun || false);
        } else {
            // Analyze patterns and generate rules
            console.log('\n🔍 Pattern Analysis:');
            console.log('='.repeat(50));

            const patterns = await analyzePatterns(options.minFrequency || 3);

            if (!options.analyzeOnly && patterns.length > 0) {
                console.log('\n🧠 Rule Generation:');
                console.log('='.repeat(50));

                await generateRules(patterns, options.dryRun || false);
            }
        }

        console.log('\n✅ Feedback loop analysis complete!');
        console.log('\n💡 Next steps:');
        console.log('   • Review generated rules for accuracy');
        console.log('   • Apply rules to improve future tagging: --apply-rules');
        console.log('   • Continue collecting user feedback for better learning');

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
