#!/usr/bin/env bun

/**
 * Smart Transcription CLI with MCP Integration
 * 
 * Enhanced transcription tool that uses the Whisper MCP server for:
 * - Intelligent model selection and optimization
 * - Quality assessment and learning
 * - Performance analytics and monitoring
 * - Batch processing optimization
 * 
 * Usage:
 *   bun run src/cli/smart-transcribe.ts "path/to/audio.mp3"
 *   bun run src/cli/smart-transcribe.ts --recommend "path/to/audio.mp3"
 *   bun run src/cli/smart-transcribe.ts --analytics
 *   bun run src/cli/smart-transcribe.ts --batch "path/to/folder/*.mp3"
 */

import { parseArgs } from 'util';
import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { initDatabase } from '../db';
import { mcpClient } from '../mcp/mcp-client';
import { logger } from '../utils/logger';
import { safeParseInt } from '../utils/safe-access';

interface CliOptions {
    filePath?: string;
    model?: string;
    language?: string;
    quality?: 'fast' | 'balanced' | 'high';
    recommend?: string;
    assess?: string;
    analytics?: boolean;
    patterns?: boolean;
    batch?: string;
    feedback?: string;
    rating?: number;
    sessionId?: string;
    help?: boolean;
}

function printUsage() {
    console.log(`
Smart Transcription with MCP Integration

Usage:
  bun run src/cli/smart-transcribe.ts [options] [file_path]

Options:
  --model <model>          Whisper model (tiny, base, small, medium, large, turbo)
  --language <lang>        Language code or 'auto' for detection
  --quality <target>       Quality target: fast, balanced, high (default: balanced)
  --recommend <file>       Get model recommendation for file
  --assess <transcript>    Assess transcription quality
  --analytics             Show transcription analytics
  --patterns              Analyze transcription patterns
  --batch <pattern>       Batch transcribe files (glob pattern)
  --feedback <trans_id>   Provide feedback for transcription
  --rating <1-5>          Quality rating (use with --feedback)
  --session-id <id>       Session ID for analytics tracking
  --help                  Show this help message

Examples:
  # Smart transcription with optimization
  bun run src/cli/smart-transcribe.ts "audio.mp3"
  
  # Get model recommendation
  bun run src/cli/smart-transcribe.ts --recommend "audio.mp3"
  
  # High quality transcription
  bun run src/cli/smart-transcribe.ts --quality high "audio.mp3"
  
  # Batch transcription
  bun run src/cli/smart-transcribe.ts --batch "media/*.mp3"
  
  # View analytics
  bun run src/cli/smart-transcribe.ts --analytics
  
  # Provide feedback
  bun run src/cli/smart-transcribe.ts --feedback "trans_123" --rating 4
`);
}

function parseCliArgs(args: string[]): CliOptions {
    const { values, positionals } = parseArgs({
        args,
        options: {
            model: { type: 'string' },
            language: { type: 'string' },
            quality: { type: 'string' },
            recommend: { type: 'string' },
            assess: { type: 'string' },
            analytics: { type: 'boolean' },
            patterns: { type: 'boolean' },
            batch: { type: 'string' },
            feedback: { type: 'string' },
            rating: { type: 'string' },
            'session-id': { type: 'string' },
            help: { type: 'boolean' }
        },
        allowPositionals: true
    });

    if (values.quality && !['fast', 'balanced', 'high'].includes(values.quality)) {
        throw new Error('Invalid quality. Must be one of: fast, balanced, high');
    }

    let rating: number | undefined;
    if (values.rating !== undefined) {
        rating = safeParseInt(values.rating);
        if (rating === undefined || rating < 1 || rating > 5) {
            throw new Error('Rating must be between 1 and 5');
        }
    }

    const options: CliOptions = {
        filePath: positionals[0],
        model: values.model,
        language: values.language,
        quality: values.quality as 'fast' | 'balanced' | 'high',
        recommend: values.recommend,
        assess: values.assess,
        analytics: values.analytics,
        patterns: values.patterns,
        batch: values.batch,
        feedback: values.feedback,
        rating,
        sessionId: values['session-id'],
        help: values.help
    };

    return options;
}

async function main() {
    try {
        const options = parseCliArgs(Bun.argv.slice(2));

        if (options.help) {
            printUsage();
            return;
        }

        // Initialize database
        initDatabase();
        console.log('🚀 Initializing MCP services...\n');

        if (options.recommend) {
            await getModelRecommendation(options.recommend, options.quality);
        } else if (options.assess) {
            await assessTranscriptionQuality(options.assess);
        } else if (options.analytics) {
            await showTranscriptionAnalytics();
        } else if (options.patterns) {
            await showTranscriptionPatterns();
        } else if (options.batch) {
            await performBatchTranscription(options.batch, options);
        } else if (options.feedback) {
            await provideFeedback(options.feedback, options.rating);
        } else if (options.filePath) {
            await performSmartTranscription(options.filePath, options);
        } else {
            console.error('Error: Must provide a file path or specify an action');
            printUsage();
            process.exit(1);
        }

    } catch (error) {
        console.error('Smart transcription failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

async function performSmartTranscription(filePath: string, options: CliOptions, client = mcpClient): Promise<void> {
    try {
        console.log(`🎙️  Smart transcription for: "${filePath}"`);
        if (options.model) {
            console.log(`🤖 Model: ${options.model}`);
        }
        if (options.language && options.language !== 'auto') {
            console.log(`🌍 Language: ${options.language}`);
        }
        console.log(`🎯 Quality target: ${options.quality || 'balanced'}`);
        console.log('');

        const result = await client.smartTranscribe(filePath, {
            model: options.model,
            language: options.language,
            qualityTarget: options.quality,
            sessionId: options.sessionId
        });

        if (!result) {
            console.error('❌ MCP transcription failed - server may not be running');
            console.log('Start the Whisper MCP server: bun run mcp:whisper');
            return;
        }

        if (!result.success) {
            console.error(`❌ Transcription failed: ${result.error || 'Unknown error'}`);
            return;
        }

        console.log(`✅ Transcription completed successfully!`);
        console.log(`🤖 Model used: ${result.model_used}`);
        console.log(`🌍 Language detected: ${result.language_detected}`);
        console.log(`⏱️  Processing time: ${result.processing_time_ms}ms`);
        console.log(`📊 Quality score: ${(result.quality_metrics.quality_score * 100).toFixed(1)}%`);
        console.log(`🎯 Confidence: ${(result.quality_metrics.confidence * 100).toFixed(1)}%`);

        if (result.model_recommendation) {
            console.log(`💡 Model recommendation: ${result.model_recommendation.reasoning}`);
        }

        if (result.transcription_id) {
            console.log(`🆔 Transcription ID: ${result.transcription_id} (use for feedback)`);
        }

        console.log('\n📝 Transcript:');
        console.log('─'.repeat(50));
        console.log(result.transcript);
        console.log('─'.repeat(50));

        if (result.chunks && result.chunks.length > 0) {
            console.log(`\n⏰ Chunks: ${result.chunks.length} segments`);
            console.log('First few chunks:');
            result.chunks.slice(0, 3).forEach((chunk: any, i: number) => {
                const start = formatTime(chunk.start_time);
                const end = formatTime(chunk.end_time);
                console.log(`  ${i + 1}. [${start} - ${end}] ${chunk.text.substring(0, 60)}...`);
            });
        }

        // Show quality assessment
        if (result.quality_metrics.estimated_error_rate > 0.1) {
            console.log(`\n⚠️  Quality warning: Estimated error rate ${(result.quality_metrics.estimated_error_rate * 100).toFixed(1)}%`);
            console.log('Consider using a larger model or improving audio quality');
        }

    } catch (error) {
        console.error('Smart transcription failed:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function getModelRecommendation(filePath: string, qualityTarget?: string, client = mcpClient): Promise<void> {
    try {
        console.log(`🤖 Getting model recommendation for: "${filePath}"\n`);

        const result = await client.getModelRecommendation(filePath, {
            qualityTarget: qualityTarget || 'balanced'
        });

        if (!result) {
            console.error('❌ Failed to get recommendation - MCP server may not be running');
            return;
        }

        console.log(`🎯 Recommended model: ${result.recommended_model}`);
        console.log(`💭 Reasoning: ${result.reasoning}`);
        console.log(`📊 Expected quality: ${(result.expected_quality * 100).toFixed(1)}%`);
        console.log(`⏱️  Expected processing time: ${(result.expected_processing_time / 1000).toFixed(1)}s`);
        console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);

        if (result.alternative_models && result.alternative_models.length > 0) {
            console.log('\n🔄 Alternative models:');
            result.alternative_models.forEach((alt: any) => {
                console.log(`\n  ${alt.model}:`);
                console.log(`    Pros: ${alt.pros.join(', ')}`);
                console.log(`    Cons: ${alt.cons.join(', ')}`);
            });
        }

    } catch (error) {
        console.error('Failed to get model recommendation:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function assessTranscriptionQuality(transcript: string, client = mcpClient): Promise<void> {
    try {
        console.log(`📊 Assessing transcription quality...\n`);

        const result = await client.assessTranscriptionQuality(transcript);

        if (!result) {
            console.error('❌ Failed to assess quality - MCP server may not be running');
            return;
        }

        const assessment = result.quality_assessment;
        console.log(`📈 Quality Assessment:`);
        console.log(`   Overall quality: ${(assessment.overall_quality * 100).toFixed(1)}%`);
        console.log(`   Confidence: ${(assessment.confidence * 100).toFixed(1)}%`);
        console.log(`   Estimated error rate: ${(assessment.estimated_error_rate * 100).toFixed(1)}%`);
        console.log(`   Word count: ${assessment.word_count}`);
        console.log(`   Character count: ${assessment.character_count}`);

        if (result.quality_issues && result.quality_issues.length > 0) {
            console.log(`\n⚠️  Quality Issues:`);
            result.quality_issues.forEach((issue: any) => {
                console.log(`   ${issue.severity.toUpperCase()}: ${issue.issue} - ${issue.description}`);
            });
        }

        if (result.improvement_suggestions && result.improvement_suggestions.length > 0) {
            console.log(`\n💡 Improvement Suggestions:`);
            result.improvement_suggestions.forEach((suggestion: string, i: number) => {
                console.log(`   ${i + 1}. ${suggestion}`);
            });
        }

        if (result.recommendations && result.recommendations.length > 0) {
            console.log(`\n🎯 Recommendations:`);
            result.recommendations.forEach((rec: string, i: number) => {
                console.log(`   ${i + 1}. ${rec}`);
            });
        }

    } catch (error) {
        console.error('Failed to assess quality:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function showTranscriptionAnalytics(client = mcpClient): Promise<void> {
    try {
        console.log('📊 Transcription Analytics (Last 24 hours)\n');

        const result = await client.getTranscriptionAnalytics();

        if (!result) {
            console.error('❌ Failed to get analytics - MCP server may not be running');
            return;
        }

        const summary = result.summary;
        console.log('📈 Summary:');
        console.log(`   Total transcriptions: ${summary.total_transcriptions}`);
        console.log(`   Total duration processed: ${formatDuration(summary.total_duration_processed)}`);
        console.log(`   Total words transcribed: ${summary.total_words_transcribed.toLocaleString()}`);
        console.log(`   Avg processing time: ${summary.avg_processing_time.toFixed(1)}ms`);
        console.log('');

        if (result.model_performance && result.model_performance.length > 0) {
            console.log('🤖 Model Performance:');
            result.model_performance.forEach((model: any) => {
                console.log(`   ${model.model}: ${model.usage_count} uses, ${(model.avg_quality_score * 100).toFixed(1)}% quality, ${model.avg_processing_time.toFixed(1)}ms avg`);
            });
            console.log('');
        }

        if (result.language_detection && result.language_detection.length > 0) {
            console.log('🌍 Language Detection:');
            result.language_detection.forEach((lang: any) => {
                console.log(`   ${lang.language}: ${lang.transcription_count} transcriptions (${lang.percentage.toFixed(1)}%), ${(lang.avg_quality_score * 100).toFixed(1)}% quality`);
            });
            console.log('');
        }

        if (result.quality_metrics) {
            const metrics = result.quality_metrics;
            console.log('📊 Quality Metrics:');
            console.log(`   Avg quality score: ${(metrics.avg_quality_score * 100).toFixed(1)}%`);
            console.log(`   Quality range: ${(metrics.min_quality_score * 100).toFixed(1)}% - ${(metrics.max_quality_score * 100).toFixed(1)}%`);
            console.log(`   Processing time range: ${metrics.min_processing_time}ms - ${metrics.max_processing_time}ms`);
        }

    } catch (error) {
        console.error('Failed to get analytics:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function showTranscriptionPatterns(client = mcpClient): Promise<void> {
    try {
        console.log('🔍 Transcription Pattern Analysis (Last 24 hours)\n');

        const result = await client.analyzeTranscriptionPatterns();

        if (!result) {
            console.error('❌ Failed to analyze patterns - MCP server may not be running');
            return;
        }

        console.log(`📊 Analysis Summary:`);
        console.log(`   Total transcriptions: ${result.total_transcriptions}`);
        console.log('');

        if (result.by_model) {
            console.log('🤖 By Model:');
            result.by_model.forEach((model: any) => {
                console.log(`   ${model.model}: ${model.usage_count} uses, efficiency ${model.efficiency_score.toFixed(2)}`);
                console.log(`     Quality: ${(model.avg_quality_score * 100).toFixed(1)}%, Time: ${model.avg_processing_time.toFixed(1)}ms`);
            });
            console.log('');
        }

        if (result.performance_metrics) {
            const perf = result.performance_metrics;
            console.log('⚡ Performance:');
            console.log(`   Avg processing time: ${perf.avg_processing_time.toFixed(1)}ms`);
            console.log(`   Avg quality score: ${(perf.avg_quality_score * 100).toFixed(1)}%`);
            console.log(`   Total duration processed: ${formatDuration(perf.total_duration_processed)}`);
            console.log(`   Total words transcribed: ${perf.total_words_transcribed.toLocaleString()}`);
        }

        if (result.quality_trends) {
            const trends = result.quality_trends;
            console.log('\n📈 Quality Trends:');
            console.log(`   Overall trend: ${trends.overall_trend > 0 ? '📈 Improving' : trends.overall_trend < 0 ? '📉 Declining' : '➡️ Stable'}`);
            console.log(`   Quality stability: ${(trends.quality_stability * 100).toFixed(1)}%`);
        }

    } catch (error) {
        console.error('Failed to analyze patterns:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function performBatchTranscription(pattern: string, options: CliOptions, client = mcpClient): Promise<void> {
    try {
        console.log(`📁 Batch transcription for pattern: "${pattern}"\n`);

        // Simple file finding (for demo purposes)
        const files = await findAudioFiles(pattern);
        if (files.length === 0) {
            console.log('No audio files found in the specified directory');
            return;
        }

        console.log(`Found ${files.length} files to transcribe`);

        // Get batch optimization
        const optimization = await client.optimizeBatchTranscription(files, {
            qualityTarget: options.quality,
            analyzeOnly: true
        });

        if (!optimization) {
            console.error('❌ Failed to optimize batch - MCP server may not be running');
            return;
        }

        console.log('\n🔧 Batch Optimization:');
        console.log(`   Recommended model: ${optimization.optimization_strategy.recommended_model}`);
        console.log(`   Optimal parallel jobs: ${optimization.optimization_strategy.optimal_parallel}`);
        console.log(`   Estimated total time: ${(optimization.estimated_total_time / 1000 / 60).toFixed(1)} minutes`);

        console.log('\n💡 Optimization reasoning:');
        optimization.optimization_strategy.optimization_reasoning.forEach((reason: string, i: number) => {
            console.log(`   ${i + 1}. ${reason}`);
        });

        console.log('\n📊 File Analysis:');
        console.log(`   Total files: ${optimization.file_analysis.total_files}`);
        console.log(`   Total size: ${(optimization.file_analysis.estimated_total_size / 1024 / 1024).toFixed(1)} MB`);
        console.log(`   Estimated duration: ${formatDuration(optimization.file_analysis.estimated_total_duration)}`);
        console.log(`   File types: ${optimization.file_analysis.file_types.join(', ')}`);

        console.log('\n📈 Size Distribution:');
        const dist = optimization.file_analysis.size_distribution;
        console.log(`   Small files (<10MB): ${dist.small}`);
        console.log(`   Medium files (10-100MB): ${dist.medium}`);
        console.log(`   Large files (>100MB): ${dist.large}`);

        console.log('\n🚀 To start batch transcription, run without --analyze-only flag');

    } catch (error) {
        console.error('Failed to perform batch transcription:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function provideFeedback(transcriptionId: string, rating?: number, client = mcpClient): Promise<void> {
    try {
        console.log(`📝 Providing feedback for transcription: ${transcriptionId}\n`);

        if (!rating) {
            console.error('Error: Rating is required for feedback');
            console.log('Use --rating <1-5> to provide a quality rating');
            return;
        }

        const result = await client.recordTranscriptionFeedback(transcriptionId, {
            userRating: rating
        });

        if (!result) {
            console.error('❌ Failed to record feedback - MCP server may not be running');
            return;
        }

        if (result.success) {
            console.log('✅ Feedback recorded successfully!');
            console.log(`   Rating: ${rating}/5`);
            console.log('   This feedback will help improve future transcriptions');
        } else {
            console.log('❌ Failed to record feedback');
        }

    } catch (error) {
        console.error('Failed to provide feedback:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

async function validateAudioFile(filePath: string): Promise<boolean> {
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.mp4', '.avi', '.mov', '.mkv'];
    if (!audioExtensions.includes(extname(filePath).toLowerCase())) {
        throw new Error(`Unsupported audio format: ${extname(filePath)}`);
    }

    try {
        await stat(filePath);
    } catch {
        throw new Error(`Audio file not found: ${filePath}`);
    }

    return true;
}

async function findAudioFiles(directory: string): Promise<string[]> {
    try {
        const audioExtensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.mp4', '.avi', '.mov', '.mkv'];
        const files = await readdir(directory);

        return files
            .filter(file => audioExtensions.includes(extname(file).toLowerCase()))
            .map(file => join(directory, file))
            .slice(0, 10); // Limit to 10 files for demo
    } catch (error) {
        console.warn(`Could not read directory ${directory}:`, error);
        return [];
    }
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

if (import.meta.main) {
    main().catch(console.error);
}

export {
    parseCliArgs,
    validateAudioFile,
    performSmartTranscription,
    getModelRecommendation,
    assessTranscriptionQuality,
    showTranscriptionAnalytics,
    showTranscriptionPatterns,
    performBatchTranscription,
    provideFeedback,
    formatTime,
    findAudioFiles,
    formatDuration,
    main
};
