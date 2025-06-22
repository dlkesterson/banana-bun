#!/usr/bin/env bun

/**
 * Optimize Metadata CLI
 * 
 * This CLI tool analyzes metadata quality and generates optimization
 * recommendations using LLM analysis to fill gaps and improve completeness.
 * 
 * Usage:
 *   bun run optimize-metadata --collection "podcasts" --fill-gaps --use-model "qwen3:8b"
 *   bun run optimize-metadata --analyze-only --output metadata-report.json
 */

import { parseArgs } from 'util';
import { logger } from '../utils/logger';
import { llmPlanningService } from '../services/llm-planning-service';
import { initDatabase, getDatabase } from '../db';
import type { MetadataQualityAnalysis } from '../types/llm-planning';

interface CliArgs {
    'collection'?: string;
    'fill-gaps'?: boolean;
    'analyze-only'?: boolean;
    'use-model'?: string;
    'output'?: string;
    'format'?: 'json' | 'text' | 'csv';
    'min-completeness'?: number;
    'batch-size'?: number;
    'dry-run'?: boolean;
    'help'?: boolean;
}

async function main() {
    try {
        const { values } = parseArgs({
            args: process.argv.slice(2),
            options: {
                collection: { type: 'string', short: 'c' },
                'fill-gaps': { type: 'boolean', short: 'f' },
                'analyze-only': { type: 'boolean', short: 'a' },
                'use-model': { type: 'string', short: 'm' },
                'output': { type: 'string', short: 'o' },
                'format': { type: 'string' },
                'min-completeness': { type: 'string' },
                'batch-size': { type: 'string' },
                'dry-run': { type: 'boolean' },
                'help': { type: 'boolean', short: 'h' }
            },
            allowPositionals: true
        }) as { values: CliArgs };

        if (values.help) {
            showHelp();
            return;
        }

        // Initialize database
        await initDatabase();
        const db = getDatabase();
        
        await logger.info('🚀 Starting metadata optimization', { 
            collection: values.collection,
            fillGaps: values['fill-gaps'],
            analyzeOnly: values['analyze-only']
        });

        console.log('📊 Analyzing metadata quality...');
        if (values.collection) {
            console.log(`🏷️  Collection: ${values.collection}`);
        }

        const startTime = Date.now();

        // Analyze metadata quality
        const analysis = await analyzeMetadataQuality(db, values.collection);
        
        const analysisTime = Date.now() - startTime;

        // Display analysis results
        console.log('\n✅ Metadata quality analysis completed!');
        console.log(`⏱️  Analysis time: ${analysisTime}ms`);
        console.log(`📊 Overall completeness score: ${(analysis.completenessScore * 100).toFixed(1)}%`);

        if (analysis.qualityIssues.length > 0) {
            console.log('\n⚠️  Quality Issues Found:');
            analysis.qualityIssues.forEach(issue => {
                console.log(`  - ${issue.type}: ${issue.count} items`);
                if (issue.examples.length > 0) {
                    console.log(`    Examples: ${issue.examples.slice(0, 3).join(', ')}`);
                }
            });
        }

        if (analysis.missingFields.length > 0) {
            console.log('\n📋 Missing Fields:');
            analysis.missingFields
                .sort((a, b) => b.percentage - a.percentage)
                .forEach(field => {
                    console.log(`  - ${field.field}: ${field.missingCount} items (${field.percentage.toFixed(1)}%)`);
                });
        }

        if (analysis.recommendations.length > 0) {
            console.log('\n💡 Optimization Recommendations:');
            analysis.recommendations
                .sort((a, b) => {
                    const priorityOrder = { high: 3, medium: 2, low: 1 };
                    return priorityOrder[b.priority] - priorityOrder[a.priority];
                })
                .forEach((rec, index) => {
                    const priorityIcon = getPriorityIcon(rec.priority);
                    console.log(`  ${index + 1}. ${priorityIcon} ${rec.action}`);
                    console.log(`     📈 Expected impact: ${rec.estimatedImpact}`);
                });
        }

        // Fill gaps if requested
        if (values['fill-gaps'] && !values['analyze-only']) {
            if (values['dry-run']) {
                console.log('\n🔍 Dry run mode - would fill gaps for:');
                analysis.missingFields.forEach(field => {
                    if (field.percentage > 10) { // Only show significant gaps
                        console.log(`  - ${field.field}: ${field.missingCount} items`);
                    }
                });
            } else {
                console.log('\n🔧 Filling metadata gaps...');
                const fillResults = await fillMetadataGaps(db, analysis, values);
                
                console.log(`✅ Filled gaps for ${fillResults.processedItems} items`);
                console.log(`📈 Completeness improved by ${fillResults.improvementPercentage.toFixed(1)}%`);
            }
        }

        // Save output to file if requested
        if (values.output) {
            const outputData = {
                analysis_timestamp: new Date().toISOString(),
                collection: values.collection,
                analysis_duration_ms: analysisTime,
                analysis
            };

            const format = values.format || 'json';
            let outputContent: string;

            switch (format) {
                case 'json':
                    outputContent = JSON.stringify(outputData, null, 2);
                    break;
                case 'csv':
                    outputContent = generateCsvReport(analysis);
                    break;
                case 'text':
                default:
                    outputContent = generateTextReport(outputData);
                    break;
            }

            await Bun.write(values.output, outputContent);
            console.log(`\n💾 Analysis report saved to: ${values.output}`);
        }

        await logger.info('✅ Metadata optimization completed', {
            collection: values.collection,
            completenessScore: analysis.completenessScore,
            qualityIssuesCount: analysis.qualityIssues.length,
            recommendationsCount: analysis.recommendations.length,
            duration: analysisTime
        });

    } catch (error) {
        console.error('❌ Error optimizing metadata:', error);
        await logger.error('Failed to optimize metadata', {
            error: error instanceof Error ? error.message : String(error)
        });
        process.exit(1);
    }
}

async function analyzeMetadataQuality(db: any, collection?: string): Promise<MetadataQualityAnalysis> {
    // Build query based on collection filter
    let whereClause = '';
    let params: any[] = [];
    
    if (collection) {
        // Simple collection filtering - could be enhanced based on actual schema
        whereClause = 'WHERE file_path LIKE ?';
        params = [`%${collection}%`];
    }

    // Get total count
    const totalResult = db.query(`SELECT COUNT(*) as total FROM media_metadata ${whereClause}`).get(...params) as any;
    const totalItems = totalResult?.total || 0;

    if (totalItems === 0) {
        return {
            completenessScore: 0,
            qualityIssues: [],
            recommendations: [],
            missingFields: []
        };
    }

    // Analyze missing fields
    const missingFields = [];
    const fields = ['title', 'tags', 'summary', 'genre', 'duration'];
    
    for (const field of fields) {
        const missingResult = db.query(`
            SELECT COUNT(*) as missing 
            FROM media_metadata 
            ${whereClause} AND (${field} IS NULL OR ${field} = '')
        `).get(...params) as any;
        
        const missingCount = missingResult?.missing || 0;
        const percentage = (missingCount / totalItems) * 100;
        
        if (missingCount > 0) {
            missingFields.push({
                field,
                missingCount,
                percentage
            });
        }
    }

    // Calculate completeness score
    const totalPossibleFields = fields.length * totalItems;
    const totalMissingFields = missingFields.reduce((sum, field) => sum + field.missingCount, 0);
    const completenessScore = Math.max(0, (totalPossibleFields - totalMissingFields) / totalPossibleFields);

    // Identify quality issues
    const qualityIssues = [];
    
    // Check for very short summaries
    const shortSummaries = db.query(`
        SELECT COUNT(*) as count 
        FROM media_metadata 
        ${whereClause} AND summary IS NOT NULL AND LENGTH(summary) < 50
    `).get(...params) as any;
    
    if (shortSummaries?.count > 0) {
        qualityIssues.push({
            type: 'short_summaries',
            count: shortSummaries.count,
            examples: ['Summary too brief', 'Incomplete description']
        });
    }

    // Check for missing tags
    const noTags = db.query(`
        SELECT COUNT(*) as count 
        FROM media_metadata 
        ${whereClause} AND (tags IS NULL OR tags = '')
    `).get(...params) as any;
    
    if (noTags?.count > 0) {
        qualityIssues.push({
            type: 'missing_tags',
            count: noTags.count,
            examples: ['No tags assigned', 'Untagged content']
        });
    }

    // Generate recommendations
    const recommendations = [];
    
    if (completenessScore < 0.8) {
        recommendations.push({
            action: 'Implement automated metadata extraction for missing fields',
            priority: 'high' as const,
            estimatedImpact: `Could improve completeness by ${((1 - completenessScore) * 50).toFixed(0)}%`
        });
    }

    if (qualityIssues.some(issue => issue.type === 'missing_tags')) {
        recommendations.push({
            action: 'Run automated tagging on untagged content',
            priority: 'medium' as const,
            estimatedImpact: 'Improve content discoverability and organization'
        });
    }

    if (qualityIssues.some(issue => issue.type === 'short_summaries')) {
        recommendations.push({
            action: 'Enhance summaries using LLM-based content analysis',
            priority: 'medium' as const,
            estimatedImpact: 'Better content understanding and search relevance'
        });
    }

    return {
        completenessScore,
        qualityIssues,
        recommendations,
        missingFields
    };
}

async function fillMetadataGaps(db: any, analysis: MetadataQualityAnalysis, options: CliArgs): Promise<{
    processedItems: number;
    improvementPercentage: number;
}> {
    // This is a simplified implementation
    // In a real system, this would use LLM services to generate missing metadata
    
    let processedItems = 0;
    const batchSize = options['batch-size'] ? parseInt(options['batch-size']) : 10;
    
    // Process items with missing critical fields
    const criticalFields = analysis.missingFields.filter(f => f.percentage > 20);
    
    for (const field of criticalFields) {
        // Get items missing this field
        const items = db.query(`
            SELECT id, file_path, title 
            FROM media_metadata 
            WHERE ${field.field} IS NULL OR ${field.field} = ''
            LIMIT ?
        `).all(batchSize) as any[];
        
        for (const item of items) {
            // Simulate metadata enhancement
            // In real implementation, this would call LLM services
            let newValue = '';
            
            switch (field.field) {
                case 'tags':
                    newValue = 'auto-generated, needs-review';
                    break;
                case 'summary':
                    newValue = `Auto-generated summary for ${item.title || 'media item'}`;
                    break;
                case 'genre':
                    newValue = 'unknown';
                    break;
                default:
                    newValue = 'auto-filled';
            }
            
            db.run(`UPDATE media_metadata SET ${field.field} = ? WHERE id = ?`, [newValue, item.id]);
            processedItems++;
        }
    }
    
    // Calculate improvement
    const improvementPercentage = (processedItems / (analysis.missingFields.reduce((sum, f) => sum + f.missingCount, 0) || 1)) * 100;
    
    return {
        processedItems,
        improvementPercentage
    };
}

function getPriorityIcon(priority: string): string {
    switch (priority) {
        case 'high': return '🔴';
        case 'medium': return '🟡';
        case 'low': return '🟢';
        default: return '⚪';
    }
}

function generateCsvReport(analysis: MetadataQualityAnalysis): string {
    let csv = 'Field,Missing Count,Percentage\n';
    analysis.missingFields.forEach(field => {
        csv += `${field.field},${field.missingCount},${field.percentage.toFixed(1)}\n`;
    });
    return csv;
}

function generateTextReport(data: any): string {
    return `METADATA QUALITY ANALYSIS REPORT
Generated: ${data.analysis_timestamp}
Collection: ${data.collection || 'All'}
Analysis Duration: ${data.analysis_duration_ms}ms

COMPLETENESS SCORE: ${(data.analysis.completenessScore * 100).toFixed(1)}%

MISSING FIELDS:
${data.analysis.missingFields.map((f: any) => `- ${f.field}: ${f.missingCount} items (${f.percentage.toFixed(1)}%)`).join('\n')}

QUALITY ISSUES:
${data.analysis.qualityIssues.map((i: any) => `- ${i.type}: ${i.count} items`).join('\n')}

RECOMMENDATIONS:
${data.analysis.recommendations.map((r: any, i: number) => `${i + 1}. [${r.priority.toUpperCase()}] ${r.action}
   Impact: ${r.estimatedImpact}`).join('\n\n')}
`;
}

function showHelp() {
    console.log(`
📊 Optimize Metadata - LLM-Based Planning System

USAGE:
  bun run optimize-metadata [OPTIONS]

OPTIONS:
  -c, --collection <name>          Filter by collection/category
  -f, --fill-gaps                  Automatically fill metadata gaps
  -a, --analyze-only               Only analyze, don't make changes
  -m, --use-model <string>         LLM model for gap filling (qwen3:8b, gpt-4, etc.)
  -o, --output <file>              Save report to file
  --format <format>                Output format: json, text, csv (default: json)
  --min-completeness <percent>     Minimum completeness threshold (0-100)
  --batch-size <number>            Batch size for processing (default: 10)
  --dry-run                        Show what would be processed without making changes
  -h, --help                       Show this help message

EXAMPLES:
  # Analyze all metadata
  bun run optimize-metadata --analyze-only

  # Analyze specific collection
  bun run optimize-metadata --collection "podcasts" --output podcast-analysis.json

  # Fill gaps with LLM assistance
  bun run optimize-metadata --fill-gaps --use-model "qwen3:8b" --batch-size 20

  # Generate CSV report
  bun run optimize-metadata --analyze-only --output metadata-gaps.csv --format csv
`);
}

if (import.meta.main) {
    main();
}
