#!/usr/bin/env bun

/**
 * Analyze System Performance CLI
 * 
 * This CLI tool analyzes system performance, identifies bottlenecks,
 * and generates optimization recommendations using LLM analysis.
 * 
 * Usage:
 *   bun run analyze-system-performance --days 7 --generate-recommendations --use-model "ollama"
 *   bun run analyze-system-performance --hours 24 --bottlenecks-only --output report.json
 */

import { parseArgs } from 'util';
import { logger } from '../utils/logger';
import { llmPlanningService } from '../services/llm-planning-service';
import { initDatabase } from '../db';

interface CliArgs {
    'days'?: number;
    'hours'?: number;
    'generate-recommendations'?: boolean;
    'bottlenecks-only'?: boolean;
    'use-model'?: string;
    'output'?: string;
    'format'?: 'json' | 'text' | 'markdown';
    'min-severity'?: 'low' | 'medium' | 'high' | 'critical';
    'help'?: boolean;
}

async function main() {
    try {
        const { values } = parseArgs({
            args: process.argv.slice(2),
            options: {
                days: { type: 'string' },
                hours: { type: 'string' },
                'generate-recommendations': { type: 'boolean', short: 'r' },
                'bottlenecks-only': { type: 'boolean', short: 'b' },
                'use-model': { type: 'string', short: 'm' },
                'output': { type: 'string', short: 'o' },
                'format': { type: 'string', short: 'f' },
                'min-severity': { type: 'string' },
                'help': { type: 'boolean', short: 'h' }
            },
            allowPositionals: true
        }) as { values: CliArgs };

        if (values.help) {
            showHelp();
            return;
        }

        // Calculate time range
        let timeRangeHours = 24; // Default to 24 hours
        if (values.days) {
            timeRangeHours = parseInt(values.days) * 24;
        } else if (values.hours) {
            timeRangeHours = parseInt(values.hours);
        }

        // Initialize database
        await initDatabase();
        await logger.info('🚀 Starting system performance analysis', { timeRangeHours });

        console.log('📊 Analyzing system performance...');
        console.log(`⏱️  Time range: ${timeRangeHours} hours`);
        console.log(`🔍 Min severity: ${values['min-severity'] || 'all'}`);

        const startTime = Date.now();

        // Analyze system logs
        console.log('\n🔍 Analyzing system logs for patterns...');
        const logPatterns = await llmPlanningService.analyzeSystemLogs(timeRangeHours);
        
        // Filter by severity if specified
        const filteredPatterns = values['min-severity'] 
            ? logPatterns.filter(p => {
                const severityLevels = ['low', 'medium', 'high', 'critical'];
                const minIndex = severityLevels.indexOf(values['min-severity']!);
                const patternIndex = severityLevels.indexOf(p.severity);
                return patternIndex >= minIndex;
            })
            : logPatterns;

        console.log(`📋 Found ${filteredPatterns.length} patterns`);

        // Generate recommendations if requested
        let recommendations: any[] = [];
        if (values['generate-recommendations']) {
            console.log('\n💡 Generating optimization recommendations...');
            recommendations = await llmPlanningService.generateOptimizationRecommendations();
            console.log(`📝 Generated ${recommendations.length} recommendations`);
        }

        // Get planning metrics
        console.log('\n📈 Gathering system metrics...');
        const metrics = await llmPlanningService.getPlanningMetrics();

        const analysisTime = Date.now() - startTime;

        // Display results
        console.log('\n✅ System performance analysis completed!');
        console.log(`⏱️  Analysis time: ${analysisTime}ms`);
        console.log(`🏥 System health score: ${metrics.systemHealth.score}/100`);

        if (metrics.systemHealth.issues.length > 0) {
            console.log('\n⚠️  System Issues:');
            metrics.systemHealth.issues.forEach(issue => {
                console.log(`  - ${issue}`);
            });
        }

        if (!values['bottlenecks-only']) {
            console.log('\n📊 Performance Overview:');
            console.log(`  - Total plans generated: ${metrics.totalPlans}`);
            console.log(`  - Average optimization score: ${(metrics.averageOptimizationScore * 100).toFixed(1)}%`);
        }

        if (filteredPatterns.length > 0) {
            console.log('\n🔍 Detected Patterns:');
            filteredPatterns.forEach((pattern, index) => {
                const severityIcon = getSeverityIcon(pattern.severity);
                console.log(`  ${index + 1}. ${severityIcon} [${pattern.pattern_type}] ${pattern.pattern_description}`);
                console.log(`     📊 Frequency: ${pattern.frequency}, Severity: ${pattern.severity}`);
                console.log(`     🕐 Last detected: ${new Date(pattern.last_detected).toLocaleString()}`);
            });
        }

        if (recommendations.length > 0) {
            console.log('\n💡 Optimization Recommendations:');
            recommendations
                .sort((a, b) => b.impact_score - a.impact_score)
                .slice(0, 10) // Show top 10
                .forEach((rec, index) => {
                    const impactIcon = getImpactIcon(rec.impact_score);
                    const difficultyIcon = getDifficultyIcon(rec.implementation_difficulty);
                    console.log(`  ${index + 1}. ${impactIcon} ${rec.description}`);
                    console.log(`     📈 Impact: ${rec.impact_score.toFixed(1)}/10, Difficulty: ${difficultyIcon} ${rec.implementation_difficulty}`);
                    console.log(`     🏷️  Type: ${rec.recommendation_type}`);
                });
        }

        // Save output to file if requested
        if (values.output) {
            const outputData = {
                analysis_timestamp: new Date().toISOString(),
                time_range_hours: timeRangeHours,
                analysis_duration_ms: analysisTime,
                system_health: metrics.systemHealth,
                patterns: filteredPatterns,
                recommendations: recommendations,
                metrics: {
                    total_plans: metrics.totalPlans,
                    average_optimization_score: metrics.averageOptimizationScore
                }
            };

            const format = values.format || 'json';
            let outputContent: string;

            switch (format) {
                case 'json':
                    outputContent = JSON.stringify(outputData, null, 2);
                    break;
                case 'markdown':
                    outputContent = generateMarkdownReport(outputData);
                    break;
                case 'text':
                default:
                    outputContent = generateTextReport(outputData);
                    break;
            }

            await Bun.write(values.output, outputContent);
            console.log(`\n💾 Analysis report saved to: ${values.output}`);
        }

        await logger.info('✅ System performance analysis completed', {
            timeRangeHours,
            patternsFound: filteredPatterns.length,
            recommendationsGenerated: recommendations.length,
            systemHealthScore: metrics.systemHealth.score,
            duration: analysisTime
        });

    } catch (error) {
        console.error('❌ Error analyzing system performance:', error);
        await logger.error('Failed to analyze system performance', {
            error: error instanceof Error ? error.message : String(error)
        });
        process.exit(1);
    }
}

function getSeverityIcon(severity: string): string {
    switch (severity) {
        case 'critical': return '🚨';
        case 'high': return '⚠️';
        case 'medium': return '⚡';
        case 'low': return 'ℹ️';
        default: return '📋';
    }
}

function getImpactIcon(impact: number): string {
    if (impact >= 8) return '🔥';
    if (impact >= 6) return '⚡';
    if (impact >= 4) return '📈';
    return '💡';
}

function getDifficultyIcon(difficulty: string): string {
    switch (difficulty) {
        case 'low': return '🟢';
        case 'medium': return '🟡';
        case 'high': return '🔴';
        default: return '⚪';
    }
}

function generateMarkdownReport(data: any): string {
    return `# System Performance Analysis Report

**Generated:** ${data.analysis_timestamp}
**Time Range:** ${data.time_range_hours} hours
**Analysis Duration:** ${data.analysis_duration_ms}ms

## System Health Score: ${data.system_health.score}/100

${data.system_health.issues.length > 0 ? `### Issues
${data.system_health.issues.map((issue: string) => `- ${issue}`).join('\n')}` : ''}

## Detected Patterns (${data.patterns.length})

${data.patterns.map((p: any, i: number) => `### ${i + 1}. ${p.pattern_type}
- **Description:** ${p.pattern_description}
- **Frequency:** ${p.frequency}
- **Severity:** ${p.severity}
- **Last Detected:** ${new Date(p.last_detected).toLocaleString()}`).join('\n\n')}

## Recommendations (${data.recommendations.length})

${data.recommendations.map((r: any, i: number) => `### ${i + 1}. ${r.description}
- **Type:** ${r.recommendation_type}
- **Impact Score:** ${r.impact_score.toFixed(1)}/10
- **Difficulty:** ${r.implementation_difficulty}`).join('\n\n')}
`;
}

function generateTextReport(data: any): string {
    return `SYSTEM PERFORMANCE ANALYSIS REPORT
Generated: ${data.analysis_timestamp}
Time Range: ${data.time_range_hours} hours
Analysis Duration: ${data.analysis_duration_ms}ms

SYSTEM HEALTH SCORE: ${data.system_health.score}/100

${data.system_health.issues.length > 0 ? `ISSUES:
${data.system_health.issues.map((issue: string) => `- ${issue}`).join('\n')}

` : ''}DETECTED PATTERNS (${data.patterns.length}):
${data.patterns.map((p: any, i: number) => `${i + 1}. [${p.severity.toUpperCase()}] ${p.pattern_description}
   Frequency: ${p.frequency}, Type: ${p.pattern_type}
   Last Detected: ${new Date(p.last_detected).toLocaleString()}`).join('\n\n')}

RECOMMENDATIONS (${data.recommendations.length}):
${data.recommendations.map((r: any, i: number) => `${i + 1}. ${r.description}
   Type: ${r.recommendation_type}
   Impact: ${r.impact_score.toFixed(1)}/10, Difficulty: ${r.implementation_difficulty}`).join('\n\n')}
`;
}

function showHelp() {
    console.log(`
📊 Analyze System Performance - LLM-Based Planning System

USAGE:
  bun run analyze-system-performance [OPTIONS]

OPTIONS:
  --days <number>                  Number of days to analyze (default: 1)
  --hours <number>                 Number of hours to analyze (overrides --days)
  -r, --generate-recommendations   Generate optimization recommendations
  -b, --bottlenecks-only          Show only bottlenecks and critical issues
  -m, --use-model <string>         LLM model for analysis (gpt-4, ollama, etc.)
  -o, --output <file>              Save report to file
  -f, --format <format>            Output format: json, text, markdown (default: json)
  --min-severity <level>           Minimum severity: low, medium, high, critical
  -h, --help                       Show this help message

EXAMPLES:
  # Basic analysis of last 24 hours
  bun run analyze-system-performance

  # Analyze last week with recommendations
  bun run analyze-system-performance --days 7 --generate-recommendations

  # Focus on critical issues only
  bun run analyze-system-performance --min-severity critical --bottlenecks-only

  # Generate detailed report
  bun run analyze-system-performance \\
    --days 3 \\
    --generate-recommendations \\
    --output performance-report.md \\
    --format markdown
`);
}

if (import.meta.main) {
    main();
}
