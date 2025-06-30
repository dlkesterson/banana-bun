#!/usr/bin/env bun

/**
 * CLI Command: View Detected Patterns
 * 
 * Displays previously detected activity patterns with filtering and sorting options.
 * 
 * Usage:
 * bun run view-detected-patterns --with-confidence --sort-by confidence
 */

import { Database } from 'bun:sqlite';
import { parseArgs } from 'util';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';
import { safeObjectEntries } from '../utils/safe-access';
import type { ActivityPattern } from '../types/rule-scheduler';

interface ViewOptions {
    'pattern-type': string | null;
    'min-confidence': number;
    'sort-by': 'confidence' | 'frequency' | 'date' | 'type';
    'sort-order': 'asc' | 'desc';
    'with-confidence': boolean;
    'active-only': boolean;
    'output-format': 'table' | 'json' | 'detailed';
    limit: number;
    verbose: boolean;
}

async function main() {
    try {
        // Parse command line arguments
        const { values } = parseArgs({
            args: Bun.argv.slice(2),
            options: {
                'pattern-type': {
                    type: 'string'
                },
                'min-confidence': {
                    type: 'string',
                    default: '0.0'
                },
                'sort-by': {
                    type: 'string',
                    default: 'confidence'
                },
                'sort-order': {
                    type: 'string',
                    default: 'desc'
                },
                'with-confidence': {
                    type: 'boolean',
                    default: false
                },
                'active-only': {
                    type: 'boolean',
                    default: true
                },
                'output-format': {
                    type: 'string',
                    default: 'table'
                },
                limit: {
                    type: 'string',
                    default: '20'
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

        const options: ViewOptions = {
            'pattern-type': values['pattern-type'] as string || null,
            'min-confidence': parseFloat(values['min-confidence'] as string) || 0.0,
            'sort-by': (values['sort-by'] as 'confidence' | 'frequency' | 'date' | 'type') || 'confidence',
            'sort-order': (values['sort-order'] as 'asc' | 'desc') || 'desc',
            'with-confidence': values['with-confidence'] as boolean,
            'active-only': values['active-only'] as boolean,
            'output-format': (values['output-format'] as 'table' | 'json' | 'detailed') || 'table',
            limit: parseInt(values.limit as string) || 20,
            verbose: values.verbose as boolean
        };

        // Validate options
        if (options['min-confidence'] < 0 || options['min-confidence'] > 1) {
            console.error('❌ Min confidence must be between 0 and 1');
            process.exit(1);
        }

        if (!['confidence', 'frequency', 'date', 'type'].includes(options['sort-by'])) {
            console.error('❌ Sort by must be one of: confidence, frequency, date, type');
            process.exit(1);
        }

        if (!['asc', 'desc'].includes(options['sort-order'])) {
            console.error('❌ Sort order must be: asc or desc');
            process.exit(1);
        }

        console.log('🔍 Retrieving detected patterns...');

        // Initialize database
        const db = getDatabase();

        // Build query
        const patterns = await getPatterns(db, options);

        if (patterns.length === 0) {
            console.log('📭 No patterns found matching the criteria');
            console.log('💡 Try running "bun run analyze-activity-patterns" to detect new patterns');
            process.exit(0);
        }

        // Display results
        console.log(`\n✅ Found ${patterns.length} pattern(s)`);
        console.log('═'.repeat(80));

        if (options['output-format'] === 'json') {
            console.log(JSON.stringify(patterns, null, 2));
        } else if (options['output-format'] === 'detailed') {
            displayDetailedOutput(patterns, options.verbose);
        } else {
            displayTableOutput(patterns, options['with-confidence']);
        }

        // Show summary statistics
        if (patterns.length > 0) {
            displaySummaryStats(patterns);
        }

    } catch (error) {
        console.error('❌ Failed to view patterns:', error);
        logger.error('View patterns failed', { error });
        process.exit(1);
    }
}

async function getPatterns(db: Database, options: ViewOptions): Promise<ActivityPattern[]> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    // Add filters
    if (options['pattern-type']) {
        whereClause += ' AND pattern_type = ?';
        params.push(options['pattern-type']);
    }

    if (options['min-confidence'] > 0) {
        whereClause += ' AND confidence_score >= ?';
        params.push(options['min-confidence']);
    }

    if (options['active-only']) {
        whereClause += ' AND is_active = TRUE';
    }

    // Add sorting
    let orderClause = 'ORDER BY ';
    switch (options['sort-by']) {
        case 'confidence':
            orderClause += 'confidence_score';
            break;
        case 'frequency':
            orderClause += 'detection_count';
            break;
        case 'date':
            orderClause += 'last_detected_at';
            break;
        case 'type':
            orderClause += 'pattern_type';
            break;
    }
    orderClause += ` ${options['sort-order'].toUpperCase()}`;

    // Add limit
    const limitClause = `LIMIT ${options.limit}`;

    const query = `
        SELECT * FROM activity_patterns 
        ${whereClause} 
        ${orderClause} 
        ${limitClause}
    `;

    return db.query(query).all(...params) as ActivityPattern[];
}

function displayTableOutput(patterns: ActivityPattern[], withConfidence: boolean) {
    if (withConfidence) {
        console.log('┌─────┬─────────────────────┬────────────┬─────────────┬─────────────────────┬─────────────┐');
        console.log('│ ID  │ Pattern Type        │ Confidence │ Frequency   │ Last Detected       │ Active      │');
        console.log('├─────┼─────────────────────┼────────────┼─────────────┼─────────────────────┼─────────────┤');
    } else {
        console.log('┌─────┬─────────────────────┬─────────────┬─────────────────────┬─────────────┐');
        console.log('│ ID  │ Pattern Type        │ Frequency   │ Last Detected       │ Active      │');
        console.log('├─────┼─────────────────────┼─────────────┼─────────────────────┼─────────────┤');
    }

    patterns.forEach(pattern => {
        const id = pattern.id?.toString().padStart(3) || 'N/A';
        const type = pattern.pattern_type.padEnd(19);
        const frequency = pattern.detection_count.toString().padStart(11);
        const lastDetected = pattern.last_detected_at 
            ? new Date(pattern.last_detected_at).toLocaleDateString().padEnd(19)
            : 'N/A'.padEnd(19);
        const active = (pattern.is_active ? '✅' : '❌').padEnd(11);

        if (withConfidence) {
            const confidence = `${(pattern.confidence_score * 100).toFixed(1)}%`.padStart(10);
            console.log(`│ ${id} │ ${type} │ ${confidence} │ ${frequency} │ ${lastDetected} │ ${active} │`);
        } else {
            console.log(`│ ${id} │ ${type} │ ${frequency} │ ${lastDetected} │ ${active} │`);
        }
    });

    if (withConfidence) {
        console.log('└─────┴─────────────────────┴────────────┴─────────────┴─────────────────────┴─────────────┘');
    } else {
        console.log('└─────┴─────────────────────┴─────────────┴─────────────────────┴─────────────┘');
    }
}

function displayDetailedOutput(patterns: ActivityPattern[], verbose: boolean) {
    patterns.forEach((pattern, index) => {
        console.log(`\n📊 Pattern #${pattern.id || index + 1}: ${pattern.pattern_type}`);
        console.log(`   Confidence: ${(pattern.confidence_score * 100).toFixed(1)}%`);
        console.log(`   Detection count: ${pattern.detection_count}`);
        console.log(`   Status: ${pattern.is_active ? '✅ Active' : '❌ Inactive'}`);
        
        if (pattern.first_detected_at) {
            console.log(`   First detected: ${new Date(pattern.first_detected_at).toLocaleString()}`);
        }
        if (pattern.last_detected_at) {
            console.log(`   Last detected: ${new Date(pattern.last_detected_at).toLocaleString()}`);
        }

        // Parse and display pattern data
        try {
            const data = JSON.parse(pattern.pattern_data);
            
            if (data.frequency) {
                console.log(`   Frequency: ${data.frequency}`);
            }

            if (data.time_windows && data.time_windows.length > 0) {
                console.log(`   Time windows:`);
                data.time_windows.forEach((window: any, i: number) => {
                    let timeDesc = `${window.start_hour}:00-${window.end_hour}:00`;
                    if (window.days_of_week) {
                        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        const days = window.days_of_week.map((d: number) => dayNames[d]).join(', ');
                        timeDesc += ` on ${days}`;
                    }
                    if (window.days_of_month) {
                        timeDesc += ` on day(s) ${window.days_of_month.join(', ')} of month`;
                    }
                    console.log(`     ${i + 1}. ${timeDesc}`);
                });
            }

            if (data.task_types && data.task_types.length > 0) {
                console.log(`   Task types: ${data.task_types.join(', ')}`);
            }

            if (data.user_actions && data.user_actions.length > 0) {
                console.log(`   User actions: ${data.user_actions.join(', ')}`);
            }

            if (data.correlation_strength) {
                console.log(`   Correlation strength: ${(data.correlation_strength * 100).toFixed(1)}%`);
            }

            if (verbose && data.resource_metrics) {
                console.log(`   Resource metrics:`);
                console.log(`     CPU: ${data.resource_metrics.cpu_usage_avg?.toFixed(1)}%`);
                console.log(`     Memory: ${data.resource_metrics.memory_usage_avg?.toFixed(1)}%`);
            }

        } catch (error) {
            console.log(`   Pattern data: ${pattern.pattern_data.substring(0, 100)}...`);
        }

        if (pattern.embedding_id) {
            console.log(`   ChromaDB embedding: ${pattern.embedding_id}`);
        }
        if (pattern.search_index_id) {
            console.log(`   MeiliSearch index: ${pattern.search_index_id}`);
        }
    });
}

function displaySummaryStats(patterns: ActivityPattern[]) {
    console.log('\n📈 SUMMARY STATISTICS:');
    
    // Count by pattern type
    const typeCount: { [key: string]: number } = {};
    let totalConfidence = 0;
    let totalFrequency = 0;
    let activeCount = 0;

    patterns.forEach(pattern => {
        typeCount[pattern.pattern_type] = (typeCount[pattern.pattern_type] || 0) + 1;
        totalConfidence += pattern.confidence_score;
        totalFrequency += pattern.detection_count;
        if (pattern.is_active) activeCount++;
    });

    console.log(`   Total patterns: ${patterns.length}`);
    console.log(`   Active patterns: ${activeCount}`);
    console.log(`   Average confidence: ${(totalConfidence / patterns.length * 100).toFixed(1)}%`);
    console.log(`   Total frequency: ${totalFrequency}`);

    console.log('\n📊 BY PATTERN TYPE:');
    const typeEntries = safeObjectEntries(typeCount);
    typeEntries
        .filter(([, count]) => typeof count === 'number')
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .forEach(([type, count]) => {
            console.log(`   ${type}: ${count}`);
        });
}

function showHelp() {
    console.log(`
🔍 View Detected Patterns

Displays previously detected activity patterns with filtering and sorting options.

USAGE:
    bun run view-detected-patterns [OPTIONS]

OPTIONS:
    --pattern-type <type>        Filter by pattern type (daily_recurring, weekly_recurring, etc.)
    --min-confidence <number>    Minimum confidence threshold (0-1, default: 0.0)
    --sort-by <field>           Sort by: confidence, frequency, date, type (default: confidence)
    --sort-order <order>        Sort order: asc, desc (default: desc)
    --with-confidence           Show confidence scores in table output
    --active-only               Show only active patterns (default: true)
    --output-format <format>    Output format: table, json, detailed (default: table)
    --limit <number>            Maximum number of patterns to show (default: 20)
    --verbose                   Show detailed information
    --help                      Show this help message

EXAMPLES:
    # View all patterns with confidence scores
    bun run view-detected-patterns --with-confidence

    # View only daily patterns sorted by frequency
    bun run view-detected-patterns --pattern-type daily_recurring --sort-by frequency

    # View high-confidence patterns in detailed format
    bun run view-detected-patterns --min-confidence 0.8 --output-format detailed

    # View all patterns including inactive ones
    bun run view-detected-patterns --active-only false --verbose

PATTERN TYPES:
    - daily_recurring: Tasks that occur at the same time each day
    - weekly_recurring: Tasks that occur on specific days/times each week
    - monthly_recurring: Tasks that occur on specific days each month
    - user_behavior: Patterns based on user interaction analysis
    - task_correlation: Tasks that frequently occur together
    - resource_usage: Patterns based on system resource utilization

NEXT STEPS:
    After reviewing patterns, use these commands:
    - bun run generate-scheduling-rules    # Create rules from patterns
    - bun run analyze-activity-patterns    # Detect new patterns
    - bun run manage-rules                 # Manage generated rules
`);
}

// Run the CLI command
main().catch(console.error);
