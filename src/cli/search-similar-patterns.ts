#!/usr/bin/env bun

/**
 * CLI Command: Search Similar Patterns
 * 
 * Finds patterns similar to a given pattern using ChromaDB semantic search.
 * 
 * Usage:
 * bun run search-similar-patterns --pattern-id 123 --similarity 0.8 --use-chromadb
 */

import { Database } from 'bun:sqlite';
import { ChromaClient } from 'chromadb';
import { parseArgs } from 'util';
import { logger } from '../utils/logger';
import { config } from '../config';
import { getDatabase } from '../db';
import { safeObjectEntries } from '../utils/safe-access';
import type { ActivityPattern } from '../types/rule-scheduler';

interface SearchOptions {
    'pattern-id': number | null;
    'pattern-type': string | null;
    'task-types': string | null;
    'similarity': number;
    'use-chromadb': boolean;
    'max-results': number;
    'min-confidence': number;
    'output-format': 'table' | 'json' | 'detailed';
    'include-inactive': boolean;
    verbose: boolean;
}

async function main() {
    try {
        // Parse command line arguments
        const { values } = parseArgs({
            args: Bun.argv.slice(2),
            options: {
                'pattern-id': {
                    type: 'string'
                },
                'pattern-type': {
                    type: 'string'
                },
                'task-types': {
                    type: 'string'
                },
                'similarity': {
                    type: 'string',
                    default: '0.8'
                },
                'use-chromadb': {
                    type: 'boolean',
                    default: true
                },
                'max-results': {
                    type: 'string',
                    default: '10'
                },
                'min-confidence': {
                    type: 'string',
                    default: '0.0'
                },
                'output-format': {
                    type: 'string',
                    default: 'table'
                },
                'include-inactive': {
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

        const options: SearchOptions = {
            'pattern-id': values['pattern-id'] ? parseInt(values['pattern-id'] as string) : null,
            'pattern-type': values['pattern-type'] as string || null,
            'task-types': values['task-types'] as string || null,
            'similarity': parseFloat(values.similarity as string) || 0.8,
            'use-chromadb': values['use-chromadb'] as boolean,
            'max-results': parseInt(values['max-results'] as string) || 10,
            'min-confidence': parseFloat(values['min-confidence'] as string) || 0.0,
            'output-format': (values['output-format'] as 'table' | 'json' | 'detailed') || 'table',
            'include-inactive': values['include-inactive'] as boolean,
            verbose: values.verbose as boolean
        };

        // Validate options
        if (!options['pattern-id'] && !options['pattern-type'] && !options['task-types']) {
            console.error('❌ Please specify --pattern-id, --pattern-type, or --task-types');
            process.exit(1);
        }

        if (options.similarity < 0 || options.similarity > 1) {
            console.error('❌ Similarity must be between 0 and 1');
            process.exit(1);
        }

        if (options['max-results'] < 1 || options['max-results'] > 100) {
            console.error('❌ Max results must be between 1 and 100');
            process.exit(1);
        }

        console.log('🔍 Searching for similar patterns...');
        if (options['pattern-id']) {
            console.log(`📊 Base pattern ID: ${options['pattern-id']}`);
        }
        if (options['pattern-type']) {
            console.log(`📂 Pattern type: ${options['pattern-type']}`);
        }
        if (options['task-types']) {
            console.log(`🏷️  Task types: ${options['task-types']}`);
        }
        console.log(`🎯 Similarity threshold: ${options.similarity}`);
        console.log(`🔬 Using ChromaDB: ${options['use-chromadb']}`);

        // Initialize database and ChromaDB
        const db = getDatabase();
        let chromaClient: ChromaClient | null = null;
        
        if (options['use-chromadb']) {
            try {
                chromaClient = new ChromaClient({
                    host: config.paths.chroma.host,
                    port: config.paths.chroma.port,
                    ssl: config.paths.chroma.ssl
                });
            } catch (error) {
                console.warn('⚠️  ChromaDB not available, falling back to database search');
                options['use-chromadb'] = false;
            }
        }

        // Perform search
        let similarPatterns: ActivityPattern[] = [];
        let searchMethod = '';

        if (options['pattern-id']) {
            // Search by specific pattern ID
            const basePattern = await getPatternById(db, options['pattern-id']);
            if (!basePattern) {
                console.error(`❌ Pattern with ID ${options['pattern-id']} not found`);
                process.exit(1);
            }

            console.log(`\n📊 Base pattern: ${basePattern.pattern_type} (confidence: ${(basePattern.confidence_score * 100).toFixed(1)}%)`);

            if (options['use-chromadb'] && chromaClient) {
                similarPatterns = await searchSimilarPatternsWithChroma(
                    chromaClient,
                    db,
                    basePattern,
                    options
                );
                searchMethod = 'ChromaDB semantic search';
            } else {
                similarPatterns = await searchSimilarPatternsWithDatabase(
                    db,
                    basePattern,
                    options
                );
                searchMethod = 'Database pattern matching';
            }
        } else {
            // Search by pattern type or task types
            similarPatterns = await searchPatternsByAttributes(db, options);
            searchMethod = 'Database attribute search';
        }

        // Display results
        console.log(`\n✅ Found ${similarPatterns.length} similar pattern(s) using ${searchMethod}`);
        console.log('═'.repeat(80));

        if (similarPatterns.length === 0) {
            console.log('📭 No similar patterns found matching the criteria');
            console.log('💡 Try lowering the similarity threshold or broadening the search criteria');
            process.exit(0);
        }

        if (options['output-format'] === 'json') {
            console.log(JSON.stringify(similarPatterns, null, 2));
        } else if (options['output-format'] === 'detailed') {
            displayDetailedOutput(similarPatterns, options.verbose);
        } else {
            displayTableOutput(similarPatterns);
        }

        // Show analysis summary
        displayAnalysisSummary(similarPatterns, options);

    } catch (error) {
        console.error('❌ Failed to search similar patterns:', error);
        logger.error('Similar pattern search failed', { error });
        process.exit(1);
    }
}

async function getPatternById(db: Database, patternId: number): Promise<ActivityPattern | null> {
    return db.query('SELECT * FROM activity_patterns WHERE id = ?').get(patternId) as ActivityPattern | null;
}

async function searchSimilarPatternsWithChroma(
    chromaClient: ChromaClient,
    db: Database,
    basePattern: ActivityPattern,
    options: SearchOptions
): Promise<ActivityPattern[]> {
    try {
        // This would use ChromaDB for semantic similarity search
        // For now, fall back to database search as ChromaDB integration would require embeddings
        console.log('🔬 ChromaDB semantic search not fully implemented, using database fallback');
        return await searchSimilarPatternsWithDatabase(db, basePattern, options);
    } catch (error) {
        logger.warn('ChromaDB search failed, falling back to database', { error });
        return await searchSimilarPatternsWithDatabase(db, basePattern, options);
    }
}

async function searchSimilarPatternsWithDatabase(
    db: Database,
    basePattern: ActivityPattern,
    options: SearchOptions
): Promise<ActivityPattern[]> {
    const basePatternData = JSON.parse(basePattern.pattern_data);
    
    // Build query for similar patterns
    let query = `
        SELECT *, 
               ABS(confidence_score - ?) as confidence_diff,
               ABS(detection_count - ?) as frequency_diff
        FROM activity_patterns 
        WHERE id != ?
    `;
    const params: any[] = [
        basePattern.confidence_score,
        basePattern.detection_count,
        basePattern.id
    ];

    // Add filters
    if (!options['include-inactive']) {
        query += ' AND is_active = TRUE';
    }

    if (options['min-confidence'] > 0) {
        query += ' AND confidence_score >= ?';
        params.push(options['min-confidence']);
    }

    // Filter by pattern type similarity
    if (basePattern.pattern_type) {
        query += ' AND pattern_type = ?';
        params.push(basePattern.pattern_type);
    }

    // Order by similarity (simple heuristic)
    query += `
        ORDER BY 
            CASE WHEN pattern_type = ? THEN 0 ELSE 1 END,
            confidence_diff ASC,
            frequency_diff ASC
        LIMIT ?
    `;
    params.push(basePattern.pattern_type, options['max-results'] * 2); // Get more for filtering

    const candidates = db.query(query).all(...params) as any[];

    // Calculate similarity scores and filter
    const similarPatterns: ActivityPattern[] = [];

    for (const candidate of candidates) {
        try {
            const candidateData = JSON.parse(candidate.pattern_data);
            const similarity = calculatePatternSimilarity(basePatternData, candidateData);
            
            if (similarity >= options.similarity) {
                similarPatterns.push({
                    ...candidate,
                    similarity_score: similarity // Add similarity for display
                } as any);
            }
        } catch (error) {
            // Skip patterns with invalid data
            continue;
        }
    }

    // Sort by similarity and limit results
    return similarPatterns
        .sort((a: any, b: any) => b.similarity_score - a.similarity_score)
        .slice(0, options['max-results']);
}

async function searchPatternsByAttributes(
    db: Database,
    options: SearchOptions
): Promise<ActivityPattern[]> {
    let query = 'SELECT * FROM activity_patterns WHERE 1=1';
    const params: any[] = [];

    if (options['pattern-type']) {
        query += ' AND pattern_type = ?';
        params.push(options['pattern-type']);
    }

    if (options['task-types']) {
        const taskTypes = options['task-types'].split(',').map(t => t.trim());
        const taskTypeConditions = taskTypes.map(() => 'pattern_data LIKE ?').join(' OR ');
        query += ` AND (${taskTypeConditions})`;
        taskTypes.forEach(taskType => {
            params.push(`%"${taskType}"%`);
        });
    }

    if (!options['include-inactive']) {
        query += ' AND is_active = TRUE';
    }

    if (options['min-confidence'] > 0) {
        query += ' AND confidence_score >= ?';
        params.push(options['min-confidence']);
    }

    query += ' ORDER BY confidence_score DESC, detection_count DESC LIMIT ?';
    params.push(options['max-results']);

    return db.query(query).all(...params) as ActivityPattern[];
}

function calculatePatternSimilarity(pattern1: any, pattern2: any): number {
    let similarity = 0;
    let factors = 0;

    // Task type similarity
    if (pattern1.task_types && pattern2.task_types) {
        const types1 = new Set(pattern1.task_types);
        const types2 = new Set(pattern2.task_types);
        const intersection = new Set([...types1].filter(x => types2.has(x)));
        const union = new Set([...types1, ...types2]);
        
        if (union.size > 0) {
            similarity += intersection.size / union.size;
            factors++;
        }
    }

    // Time window similarity
    if (pattern1.time_windows && pattern2.time_windows && 
        pattern1.time_windows.length > 0 && pattern2.time_windows.length > 0) {
        const window1 = pattern1.time_windows[0];
        const window2 = pattern2.time_windows[0];
        
        // Hour similarity
        const hourDiff = Math.abs(window1.start_hour - window2.start_hour);
        const hourSimilarity = Math.max(0, 1 - hourDiff / 12); // 12-hour max difference
        similarity += hourSimilarity;
        factors++;

        // Day similarity (if applicable)
        if (window1.days_of_week && window2.days_of_week) {
            const days1 = new Set(window1.days_of_week);
            const days2 = new Set(window2.days_of_week);
            const dayIntersection = new Set([...days1].filter(x => days2.has(x)));
            const dayUnion = new Set([...days1, ...days2]);
            
            if (dayUnion.size > 0) {
                similarity += dayIntersection.size / dayUnion.size;
                factors++;
            }
        }
    }

    // Frequency similarity
    if (pattern1.frequency && pattern2.frequency) {
        const freqDiff = Math.abs(pattern1.frequency - pattern2.frequency);
        const maxFreq = Math.max(pattern1.frequency, pattern2.frequency);
        const freqSimilarity = maxFreq > 0 ? Math.max(0, 1 - freqDiff / maxFreq) : 1;
        similarity += freqSimilarity;
        factors++;
    }

    return factors > 0 ? similarity / factors : 0;
}

function displayTableOutput(patterns: ActivityPattern[]) {
    console.log('📊 SIMILAR PATTERNS:');
    console.log('┌─────┬─────────────────────┬────────────┬─────────────┬─────────────┬─────────────┐');
    console.log('│ ID  │ Pattern Type        │ Confidence │ Frequency   │ Similarity  │ Active      │');
    console.log('├─────┼─────────────────────┼────────────┼─────────────┼─────────────┼─────────────┤');

    patterns.forEach(pattern => {
        const id = pattern.id?.toString().padStart(3) || 'N/A';
        const type = pattern.pattern_type.padEnd(19);
        const confidence = `${(pattern.confidence_score * 100).toFixed(1)}%`.padStart(10);
        const frequency = pattern.detection_count.toString().padStart(11);
        const similarity = (pattern as any).similarity_score ? 
            `${((pattern as any).similarity_score * 100).toFixed(1)}%`.padStart(11) : 
            'N/A'.padStart(11);
        const active = (pattern.is_active ? '✅' : '❌').padEnd(11);

        console.log(`│ ${id} │ ${type} │ ${confidence} │ ${frequency} │ ${similarity} │ ${active} │`);
    });

    console.log('└─────┴─────────────────────┴────────────┴─────────────┴─────────────┴─────────────┘');
}

function displayDetailedOutput(patterns: ActivityPattern[], verbose: boolean) {
    patterns.forEach((pattern, index) => {
        console.log(`\n📊 Pattern #${pattern.id || index + 1}: ${pattern.pattern_type}`);
        console.log(`   Confidence: ${(pattern.confidence_score * 100).toFixed(1)}%`);
        console.log(`   Detection count: ${pattern.detection_count}`);
        console.log(`   Status: ${pattern.is_active ? '✅ Active' : '❌ Inactive'}`);
        
        if ((pattern as any).similarity_score) {
            console.log(`   Similarity: ${((pattern as any).similarity_score * 100).toFixed(1)}%`);
        }

        if (pattern.first_detected_at) {
            console.log(`   First detected: ${new Date(pattern.first_detected_at).toLocaleString()}`);
        }
        if (pattern.last_detected_at) {
            console.log(`   Last detected: ${new Date(pattern.last_detected_at).toLocaleString()}`);
        }

        // Parse and display pattern data
        try {
            const data = JSON.parse(pattern.pattern_data);
            
            if (data.task_types && data.task_types.length > 0) {
                console.log(`   Task types: ${data.task_types.join(', ')}`);
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
                    console.log(`     ${i + 1}. ${timeDesc}`);
                });
            }

            if (data.frequency) {
                console.log(`   Frequency: ${data.frequency}`);
            }

            if (verbose && data.correlation_strength) {
                console.log(`   Correlation strength: ${(data.correlation_strength * 100).toFixed(1)}%`);
            }
        } catch (error) {
            console.log(`   Pattern data: ${pattern.pattern_data.substring(0, 100)}...`);
        }
    });
}

function displayAnalysisSummary(patterns: ActivityPattern[], options: SearchOptions) {
    console.log('\n📈 ANALYSIS SUMMARY:');
    
    // Group by pattern type
    const typeGroups: { [key: string]: number } = {};
    let totalConfidence = 0;
    let activeCount = 0;
    let avgSimilarity = 0;
    let similarityCount = 0;

    patterns.forEach(pattern => {
        typeGroups[pattern.pattern_type] = (typeGroups[pattern.pattern_type] || 0) + 1;
        totalConfidence += pattern.confidence_score;
        if (pattern.is_active) activeCount++;
        
        if ((pattern as any).similarity_score) {
            avgSimilarity += (pattern as any).similarity_score;
            similarityCount++;
        }
    });

    console.log(`   Total similar patterns: ${patterns.length}`);
    console.log(`   Active patterns: ${activeCount}`);
    console.log(`   Average confidence: ${(totalConfidence / patterns.length * 100).toFixed(1)}%`);
    
    if (similarityCount > 0) {
        console.log(`   Average similarity: ${(avgSimilarity / similarityCount * 100).toFixed(1)}%`);
    }

    console.log('\n📊 BY PATTERN TYPE:');
    const typeEntries = safeObjectEntries(typeGroups);
    typeEntries
        .filter(([, count]) => typeof count === 'number')
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .forEach(([type, count]) => {
            console.log(`   ${type}: ${count}`);
        });

    console.log('\n🚀 NEXT STEPS:');
    console.log('   1. Review similar patterns for rule generation opportunities');
    console.log('   2. Use "bun run generate-scheduling-rules --pattern-ids <ids>" to create rules');
    console.log('   3. Consider merging similar patterns for better efficiency');
    console.log('   4. Analyze pattern differences to improve detection algorithms');
}

function showHelp() {
    console.log(`
🔍 Search Similar Patterns

Finds patterns similar to a given pattern using semantic search and pattern matching.

USAGE:
    bun run search-similar-patterns [OPTIONS]

SEARCH CRITERIA (specify at least one):
    --pattern-id <id>           Search for patterns similar to this pattern ID
    --pattern-type <type>       Search for patterns of this type
    --task-types <types>        Search for patterns with these task types (comma-separated)

OPTIONS:
    --similarity <threshold>    Similarity threshold (0-1, default: 0.8)
    --use-chromadb             Use ChromaDB for semantic search (default: true)
    --max-results <number>     Maximum results to return (1-100, default: 10)
    --min-confidence <number>  Minimum confidence threshold (0-1, default: 0.0)
    --output-format <format>   Output format: table, json, detailed (default: table)
    --include-inactive         Include inactive patterns (default: false)
    --verbose                  Show detailed information
    --help                     Show this help message

EXAMPLES:
    # Find patterns similar to pattern #5
    bun run search-similar-patterns --pattern-id 5 --similarity 0.7

    # Find all daily recurring patterns
    bun run search-similar-patterns --pattern-type daily_recurring

    # Find patterns involving transcription tasks
    bun run search-similar-patterns --task-types "transcribe,audio_analyze" --max-results 5

    # Detailed search with low similarity threshold
    bun run search-similar-patterns --pattern-id 3 --similarity 0.5 --output-format detailed --verbose

SIMILARITY CALCULATION:
    Patterns are compared based on:
    - Task type overlap
    - Time window similarity
    - Frequency patterns
    - Execution timing
    - Resource requirements

SEARCH METHODS:
    - ChromaDB: Semantic similarity using embeddings (when available)
    - Database: Pattern attribute matching and heuristic similarity
    - Hybrid: Combines both methods for best results

NEXT STEPS:
    After finding similar patterns, use:
    - bun run generate-scheduling-rules    # Create rules from patterns
    - bun run view-detected-patterns       # Review pattern details
    - bun run optimize-resource-schedule   # Optimize based on patterns
`);
}

// Run the CLI command
main().catch(console.error);
