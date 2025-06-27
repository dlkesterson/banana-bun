#!/usr/bin/env bun

/**
 * Whisper MCP Server
 * 
 * Provides intelligent transcription capabilities with learning and optimization:
 * - Smart model selection based on content type and quality requirements
 * - Quality assessment and learning from user feedback
 * - Language detection optimization based on patterns
 * - Performance analytics and model optimization
 * - Batch processing optimization
 * - Transcription quality improvement suggestions
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'bun';
import { stat, readFile } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { ChromaClient } from 'chromadb';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getDatabase, initDatabase } from '../db';

interface WhisperServerConfig {
    defaultModel: string;
    defaultLanguage: string;
    defaultChunkDuration: number;
    qualityThreshold: number;
    learningEnabled: boolean;
}

interface TranscriptionAnalytics {
    id: string;
    media_id?: number;
    task_id?: number;
    file_path: string;
    file_size: number;
    duration_seconds: number;
    whisper_model: string;
    language_detected: string;
    language_specified?: string;
    confidence_score: number;
    processing_time_ms: number;
    transcript_length: number;
    chunk_count: number;
    word_count: number;
    quality_score: number;
    error_rate?: number;
    timestamp: number;
    session_id?: string;
}

interface QualityFeedback {
    transcription_id: string;
    user_rating: number;
    accuracy_rating: number;
    completeness_rating: number;
    corrections_made?: string[];
    feedback_notes?: string;
    improvement_suggestions?: string;
    timestamp: number;
}

interface ModelRecommendation {
    model: string;
    confidence: number;
    reasoning: string;
    expected_quality: number;
    expected_processing_time: number;
}

class WhisperMCPServer {
    private server: Server;
    private chromaClient: ChromaClient;
    private config: WhisperServerConfig;
    private transcriptionHistory: TranscriptionAnalytics[] = [];

    constructor() {
        this.config = {
            defaultModel: config.whisper.model,
            defaultLanguage: config.whisper.language,
            defaultChunkDuration: config.whisper.chunkDuration,
            qualityThreshold: 0.8,
            learningEnabled: true
        };

        this.chromaClient = new ChromaClient({
            host: config.paths.chroma.host,
            port: config.paths.chroma.port,
            ssl: config.paths.chroma.ssl
        });

        this.server = new Server(
            {
                name: 'whisper-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.initializeAsync();
    }

    private async initializeAsync() {
        try {
            await initDatabase();
            console.error('Whisper MCP server database initialized');
            this.setupToolHandlers();
        } catch (error) {
            console.error('Failed to initialize Whisper MCP server:', error);
        }
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'smart_transcribe',
                        description: 'Perform intelligent transcription with model optimization and quality learning',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                file_path: { type: 'string', description: 'Path to audio/video file to transcribe' },
                                model: { type: 'string', description: 'Whisper model to use (auto-selected if not specified)' },
                                language: { type: 'string', description: 'Language code or "auto" for detection' },
                                chunk_duration: { type: 'number', description: 'Chunk duration in seconds', default: 30 },
                                quality_target: { type: 'string', enum: ['fast', 'balanced', 'high'], description: 'Quality vs speed preference', default: 'balanced' },
                                learn_from_result: { type: 'boolean', description: 'Store transcription for learning', default: true },
                                session_id: { type: 'string', description: 'Session ID for analytics' }
                            },
                            required: ['file_path']
                        }
                    },
                    {
                        name: 'get_model_recommendation',
                        description: 'Get optimal Whisper model recommendation for a file',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                file_path: { type: 'string', description: 'Path to audio/video file' },
                                quality_target: { type: 'string', enum: ['fast', 'balanced', 'high'], default: 'balanced' },
                                content_type: { type: 'string', enum: ['speech', 'music', 'mixed', 'noisy', 'unknown'], description: 'Type of audio content' },
                                duration_seconds: { type: 'number', description: 'File duration in seconds' }
                            },
                            required: ['file_path']
                        }
                    },
                    {
                        name: 'assess_transcription_quality',
                        description: 'Assess the quality of a transcription and provide improvement suggestions',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                transcription_id: { type: 'string', description: 'ID of the transcription to assess' },
                                transcript_text: { type: 'string', description: 'Transcript text to assess' },
                                original_file_path: { type: 'string', description: 'Path to original audio/video file' },
                                include_suggestions: { type: 'boolean', description: 'Include improvement suggestions', default: true }
                            },
                            required: ['transcript_text']
                        }
                    },
                    {
                        name: 'analyze_transcription_patterns',
                        description: 'Analyze transcription patterns and performance metrics',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_hours: { type: 'number', description: 'Time range for analysis in hours', default: 24 },
                                group_by: { type: 'string', enum: ['model', 'language', 'content_type', 'quality'], default: 'model' },
                                include_performance: { type: 'boolean', description: 'Include performance metrics', default: true },
                                include_quality_trends: { type: 'boolean', description: 'Include quality trend analysis', default: true }
                            }
                        }
                    },
                    {
                        name: 'optimize_batch_transcription',
                        description: 'Optimize settings for batch transcription of multiple files',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                file_paths: { type: 'array', items: { type: 'string' }, description: 'Array of file paths to transcribe' },
                                quality_target: { type: 'string', enum: ['fast', 'balanced', 'high'], default: 'balanced' },
                                max_parallel: { type: 'number', description: 'Maximum parallel transcriptions', default: 2 },
                                analyze_only: { type: 'boolean', description: 'Only analyze, do not start transcription', default: false }
                            },
                            required: ['file_paths']
                        }
                    },
                    {
                        name: 'record_transcription_feedback',
                        description: 'Record user feedback on transcription quality for learning',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                transcription_id: { type: 'string', description: 'ID of the transcription' },
                                user_rating: { type: 'number', minimum: 1, maximum: 5, description: 'Overall quality rating (1-5)' },
                                accuracy_rating: { type: 'number', minimum: 1, maximum: 5, description: 'Accuracy rating (1-5)' },
                                completeness_rating: { type: 'number', minimum: 1, maximum: 5, description: 'Completeness rating (1-5)' },
                                corrections_made: { type: 'array', items: { type: 'string' }, description: 'List of corrections made' },
                                feedback_notes: { type: 'string', description: 'Additional feedback notes' },
                                improvement_suggestions: { type: 'string', description: 'Suggestions for improvement' }
                            },
                            required: ['transcription_id', 'user_rating']
                        }
                    },
                    {
                        name: 'get_transcription_analytics',
                        description: 'Get detailed transcription analytics and performance metrics',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_hours: { type: 'number', description: 'Time range for analytics in hours', default: 24 },
                                include_model_performance: { type: 'boolean', description: 'Include model performance comparison', default: true },
                                include_language_detection: { type: 'boolean', description: 'Include language detection analytics', default: true },
                                include_quality_metrics: { type: 'boolean', description: 'Include quality metrics', default: true }
                            }
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'smart_transcribe':
                        return await this.smartTranscribe(args);
                    case 'get_model_recommendation':
                        return await this.getModelRecommendation(args);
                    case 'assess_transcription_quality':
                        return await this.assessTranscriptionQuality(args);
                    case 'analyze_transcription_patterns':
                        return await this.analyzeTranscriptionPatterns(args);
                    case 'optimize_batch_transcription':
                        return await this.optimizeBatchTranscription(args);
                    case 'record_transcription_feedback':
                        return await this.recordTranscriptionFeedback(args);
                    case 'get_transcription_analytics':
                        return await this.getTranscriptionAnalytics(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }
                    ]
                };
            }
        });
    }

    private async smartTranscribe(args: any) {
        const {
            file_path,
            model,
            language = 'auto',
            chunk_duration = this.config.defaultChunkDuration,
            quality_target = 'balanced',
            learn_from_result = true,
            session_id
        } = args;

        try {
            // Get file information
            const fileStats = await stat(file_path);
            const fileSize = fileStats.size;

            // Get model recommendation if not specified
            let selectedModel = model;
            let modelRecommendation = null;

            if (!selectedModel) {
                const recommendation = await this.getOptimalModel(file_path, quality_target);
                selectedModel = recommendation.model;
                modelRecommendation = recommendation;
            }

            // Perform transcription
            const startTime = Date.now();
            const transcriptionResult = await this.runWhisperTranscription(file_path, {
                model: selectedModel,
                language,
                chunkDuration: chunk_duration
            });

            if (!transcriptionResult.success) {
                throw new Error(transcriptionResult.error || 'Transcription failed');
            }

            const processingTime = Date.now() - startTime;

            // Calculate quality metrics
            const qualityMetrics = await this.calculateQualityMetrics(transcriptionResult);

            // Store analytics if learning is enabled
            let analyticsId = null;
            if (learn_from_result) {
                const analytics: TranscriptionAnalytics = {
                    id: `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    file_path,
                    file_size: fileSize,
                    duration_seconds: transcriptionResult.duration || 0,
                    whisper_model: selectedModel,
                    language_detected: transcriptionResult.language || 'unknown',
                    language_specified: language !== 'auto' ? language : undefined,
                    confidence_score: qualityMetrics.confidence,
                    processing_time_ms: processingTime,
                    transcript_length: transcriptionResult.transcript?.length || 0,
                    chunk_count: transcriptionResult.chunks?.length || 0,
                    word_count: this.countWords(transcriptionResult.transcript || ''),
                    quality_score: qualityMetrics.quality_score,
                    error_rate: qualityMetrics.estimated_error_rate,
                    timestamp: Date.now(),
                    session_id
                };

                this.transcriptionHistory.push(analytics);
                await this.storeTranscriptionAnalytics(analytics);
                analyticsId = analytics.id;
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            transcription_id: analyticsId,
                            success: true,
                            transcript: transcriptionResult.transcript,
                            chunks: transcriptionResult.chunks,
                            language_detected: transcriptionResult.language,
                            model_used: selectedModel,
                            model_recommendation: modelRecommendation,
                            quality_metrics: qualityMetrics,
                            processing_time_ms: processingTime,
                            file_info: {
                                size_bytes: fileSize,
                                duration_seconds: transcriptionResult.duration
                            }
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Smart transcription failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async runWhisperTranscription(filePath: string, options: {
        model: string;
        language: string;
        chunkDuration: number;
    }): Promise<any> {
        const startTime = Date.now();

        try {
            // Create temporary output directory
            const tempDir = join(dirname(filePath), '.whisper_temp');
            const outputFile = join(tempDir, `${basename(filePath, extname(filePath))}.json`);

            // Ensure temp directory exists
            await Bun.write(join(tempDir, '.keep'), '');

            // Build Whisper command
            const whisperArgs = [
                filePath,
                '--model', options.model,
                '--output_format', 'json',
                '--output_dir', tempDir,
                '--verbose', 'False'
            ];

            // Add language if not auto-detect
            if (options.language !== 'auto') {
                whisperArgs.push('--language', options.language);
            }

            // Add timestamp options for chunking
            whisperArgs.push('--word_timestamps', 'True');

            // Run Whisper
            const proc = spawn({
                cmd: ['whisper', ...whisperArgs],
                stdout: 'pipe',
                stderr: 'pipe'
            });

            const stdout = await new Response(proc.stdout).text();
            const stderr = await new Response(proc.stderr).text();
            const exitCode = await proc.exited;

            if (exitCode !== 0) {
                return {
                    success: false,
                    error: `Whisper failed with exit code ${exitCode}: ${stderr}`,
                    processing_time_ms: Date.now() - startTime
                };
            }

            // Read the JSON output
            const jsonContent = await readFile(outputFile, 'utf-8');
            const whisperOutput = JSON.parse(jsonContent);

            // Extract transcript and chunks
            const transcript = whisperOutput.text || '';
            const chunks = this.extractChunks(whisperOutput, options.chunkDuration);
            const language = whisperOutput.language || 'unknown';
            const duration = whisperOutput.duration || 0;

            // Clean up temp files
            try {
                await Bun.write(outputFile, ''); // Clear file
            } catch (error) {
                // Ignore cleanup errors
            }

            return {
                success: true,
                transcript,
                chunks,
                language,
                duration,
                processing_time_ms: Date.now() - startTime
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                processing_time_ms: Date.now() - startTime
            };
        }
    }

    private extractChunks(whisperOutput: any, chunkDuration: number): any[] {
        if (!whisperOutput.segments) return [];

        const chunks = [];
        let currentChunk = {
            start_time: 0,
            end_time: 0,
            text: ''
        };

        for (const segment of whisperOutput.segments) {
            if (segment.end - currentChunk.start_time > chunkDuration) {
                if (currentChunk.text.trim()) {
                    currentChunk.end_time = segment.start;
                    chunks.push({ ...currentChunk });
                }
                currentChunk = {
                    start_time: segment.start,
                    end_time: segment.end,
                    text: segment.text
                };
            } else {
                currentChunk.text += segment.text;
                currentChunk.end_time = segment.end;
            }
        }

        if (currentChunk.text.trim()) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    private async calculateQualityMetrics(transcriptionResult: any): Promise<{
        confidence: number;
        quality_score: number;
        estimated_error_rate: number;
    }> {
        // Simple quality assessment based on available metrics
        // In production, this could use more sophisticated analysis

        const transcript = transcriptionResult.transcript || '';
        const chunks = transcriptionResult.chunks || [];

        // Calculate confidence based on transcript characteristics
        let confidence = 0.8; // Base confidence

        // Adjust based on transcript length and coherence
        if (transcript.length > 100) confidence += 0.1;
        if (transcript.length > 500) confidence += 0.05;

        // Check for common transcription issues
        const repeatedPhrases = this.detectRepeatedPhrases(transcript);
        if (repeatedPhrases > 0.1) confidence -= 0.2;

        const gibberishScore = this.detectGibberish(transcript);
        confidence -= gibberishScore * 0.3;

        // Ensure confidence is within bounds
        confidence = Math.max(0.1, Math.min(1.0, confidence));

        // Calculate quality score (similar to confidence but different weighting)
        const quality_score = Math.max(0.1, Math.min(1.0, confidence * 0.9 + 0.1));

        // Estimate error rate (inverse relationship with confidence)
        const estimated_error_rate = Math.max(0.0, Math.min(0.5, (1 - confidence) * 0.3));

        return {
            confidence,
            quality_score,
            estimated_error_rate
        };
    }

    private detectRepeatedPhrases(text: string): number {
        const words = text.toLowerCase().split(/\s+/);
        const phrases = new Map<string, number>();

        // Check for repeated 3-word phrases
        for (let i = 0; i < words.length - 2; i++) {
            const phrase = words.slice(i, i + 3).join(' ');
            phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
        }

        let repeatedCount = 0;
        for (const count of phrases.values()) {
            if (count > 1) repeatedCount += count - 1;
        }

        return repeatedCount / Math.max(1, words.length - 2);
    }

    private detectGibberish(text: string): number {
        const words = text.split(/\s+/);
        let gibberishCount = 0;

        for (const word of words) {
            // Simple heuristic: words with unusual character patterns
            if (word.length > 3) {
                const consonantRatio = (word.match(/[bcdfghjklmnpqrstvwxyz]/gi) || []).length / word.length;
                if (consonantRatio > 0.8) gibberishCount++;

                // Check for repeated characters
                if (/(.)\1{3,}/.test(word)) gibberishCount++;
            }
        }

        return gibberishCount / Math.max(1, words.length);
    }

    private countWords(text: string): number {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    private async getModelRecommendation(args: any) {
        const { file_path, quality_target = 'balanced', content_type, duration_seconds } = args;

        try {
            const recommendation = await this.getOptimalModel(file_path, quality_target, content_type, duration_seconds);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            recommended_model: recommendation.model,
                            confidence: recommendation.confidence,
                            reasoning: recommendation.reasoning,
                            expected_quality: recommendation.expected_quality,
                            expected_processing_time: recommendation.expected_processing_time,
                            alternative_models: await this.getAlternativeModels(quality_target)
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Model recommendation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getOptimalModel(filePath: string, qualityTarget: string, contentType?: string, duration?: number): Promise<ModelRecommendation> {
        // Get file stats if duration not provided
        if (!duration) {
            try {
                // This would require ffprobe or similar to get duration
                // For now, estimate based on file size
                const stats = await stat(filePath);
                duration = Math.max(60, stats.size / 1000000); // Rough estimate
            } catch (error) {
                duration = 300; // Default 5 minutes
            }
        }

        // Model selection logic based on quality target and content
        const models = {
            'tiny': { quality: 0.6, speed: 10, size: 'tiny' },
            'base': { quality: 0.7, speed: 7, size: 'small' },
            'small': { quality: 0.75, speed: 5, size: 'medium' },
            'medium': { quality: 0.8, speed: 3, size: 'large' },
            'large': { quality: 0.85, speed: 2, size: 'xlarge' },
            'turbo': { quality: 0.82, speed: 8, size: 'medium' }
        };

        let recommendedModel = 'base';
        let reasoning = 'Default balanced choice';

        if (qualityTarget === 'fast') {
            if (duration < 300) { // < 5 minutes
                recommendedModel = 'turbo';
                reasoning = 'Turbo model for fast processing of short content';
            } else {
                recommendedModel = 'base';
                reasoning = 'Base model for fast processing of longer content';
            }
        } else if (qualityTarget === 'high') {
            if (contentType === 'music' || contentType === 'noisy') {
                recommendedModel = 'large';
                reasoning = 'Large model for high quality transcription of challenging audio';
            } else {
                recommendedModel = 'medium';
                reasoning = 'Medium model for high quality speech transcription';
            }
        } else { // balanced
            if (duration > 1800) { // > 30 minutes
                recommendedModel = 'small';
                reasoning = 'Small model for balanced quality/speed on long content';
            } else {
                recommendedModel = 'turbo';
                reasoning = 'Turbo model for balanced quality/speed on shorter content';
            }
        }

        const modelInfo = models[recommendedModel as keyof typeof models];

        return {
            model: recommendedModel,
            confidence: 0.8,
            reasoning,
            expected_quality: modelInfo.quality,
            expected_processing_time: duration * modelInfo.speed
        };
    }

    private async getAlternativeModels(qualityTarget: string): Promise<Array<{ model: string, pros: string[], cons: string[] }>> {
        const alternatives = [
            {
                model: 'tiny',
                pros: ['Fastest processing', 'Lowest resource usage', 'Good for real-time'],
                cons: ['Lower accuracy', 'May miss nuances', 'Poor with accents']
            },
            {
                model: 'base',
                pros: ['Good balance', 'Reasonable accuracy', 'Moderate speed'],
                cons: ['Not the fastest', 'Not the most accurate']
            },
            {
                model: 'small',
                pros: ['Better accuracy', 'Good for most content', 'Reasonable speed'],
                cons: ['Slower than base', 'More resource intensive']
            },
            {
                model: 'medium',
                pros: ['High accuracy', 'Good with accents', 'Handles noise well'],
                cons: ['Slower processing', 'More memory usage']
            },
            {
                model: 'large',
                pros: ['Highest accuracy', 'Best with difficult audio', 'Excellent language detection'],
                cons: ['Slowest processing', 'High resource usage', 'Overkill for simple speech']
            },
            {
                model: 'turbo',
                pros: ['Fast processing', 'Good accuracy', 'Optimized for speed'],
                cons: ['May sacrifice some quality', 'Newer model with less testing']
            }
        ];

        return alternatives;
    }

    private async assessTranscriptionQuality(args: any) {
        const { transcription_id, transcript_text, original_file_path, include_suggestions = true } = args;

        try {
            const qualityMetrics = await this.calculateQualityMetrics({ transcript: transcript_text });

            const assessment = {
                overall_quality: qualityMetrics.quality_score,
                confidence: qualityMetrics.confidence,
                estimated_error_rate: qualityMetrics.estimated_error_rate,
                word_count: this.countWords(transcript_text),
                character_count: transcript_text.length
            };

            let suggestions = [];
            if (include_suggestions) {
                suggestions = await this.generateImprovementSuggestions(transcript_text, qualityMetrics);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            transcription_id,
                            quality_assessment: assessment,
                            improvement_suggestions: suggestions,
                            quality_issues: await this.detectQualityIssues(transcript_text),
                            recommendations: await this.getQualityRecommendations(qualityMetrics)
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Quality assessment failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async generateImprovementSuggestions(transcript: string, metrics: any): Promise<string[]> {
        const suggestions = [];

        if (metrics.quality_score < 0.7) {
            suggestions.push('Consider using a larger Whisper model for better accuracy');
            suggestions.push('Check if the audio quality can be improved (noise reduction, volume normalization)');
        }

        if (metrics.estimated_error_rate > 0.2) {
            suggestions.push('Audio may be too noisy or unclear - consider preprocessing');
            suggestions.push('Try specifying the correct language instead of auto-detection');
        }

        const repeatedPhrases = this.detectRepeatedPhrases(transcript);
        if (repeatedPhrases > 0.1) {
            suggestions.push('Detected repeated phrases - audio may have stuttering or loops');
        }

        const gibberishScore = this.detectGibberish(transcript);
        if (gibberishScore > 0.1) {
            suggestions.push('Some words may be incorrectly transcribed - manual review recommended');
        }

        if (transcript.length < 50) {
            suggestions.push('Very short transcript - ensure audio contains speech');
        }

        return suggestions;
    }

    private async detectQualityIssues(transcript: string): Promise<Array<{ issue: string, severity: string, description: string }>> {
        const issues = [];

        // Check for repeated phrases
        const repeatedPhrases = this.detectRepeatedPhrases(transcript);
        if (repeatedPhrases > 0.15) {
            issues.push({
                issue: 'repeated_phrases',
                severity: 'high',
                description: `${(repeatedPhrases * 100).toFixed(1)}% of content appears to be repeated phrases`
            });
        } else if (repeatedPhrases > 0.05) {
            issues.push({
                issue: 'repeated_phrases',
                severity: 'medium',
                description: `${(repeatedPhrases * 100).toFixed(1)}% of content appears to be repeated phrases`
            });
        }

        // Check for gibberish
        const gibberishScore = this.detectGibberish(transcript);
        if (gibberishScore > 0.2) {
            issues.push({
                issue: 'gibberish_words',
                severity: 'high',
                description: `${(gibberishScore * 100).toFixed(1)}% of words appear to be gibberish`
            });
        } else if (gibberishScore > 0.1) {
            issues.push({
                issue: 'gibberish_words',
                severity: 'medium',
                description: `${(gibberishScore * 100).toFixed(1)}% of words appear to be gibberish`
            });
        }

        // Check transcript length
        if (transcript.length < 20) {
            issues.push({
                issue: 'very_short_transcript',
                severity: 'high',
                description: 'Transcript is extremely short - may indicate transcription failure'
            });
        }

        // Check for missing punctuation
        const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const avgSentenceLength = transcript.length / Math.max(1, sentences.length);
        if (avgSentenceLength > 200) {
            issues.push({
                issue: 'missing_punctuation',
                severity: 'medium',
                description: 'Long sentences detected - may be missing punctuation'
            });
        }

        return issues;
    }

    private async getQualityRecommendations(metrics: any): Promise<string[]> {
        const recommendations = [];

        if (metrics.quality_score >= 0.9) {
            recommendations.push('Excellent transcription quality - no changes needed');
        } else if (metrics.quality_score >= 0.8) {
            recommendations.push('Good transcription quality - minor improvements possible');
            recommendations.push('Consider post-processing for punctuation and formatting');
        } else if (metrics.quality_score >= 0.7) {
            recommendations.push('Acceptable transcription quality - some improvements recommended');
            recommendations.push('Try a larger model for better accuracy');
            recommendations.push('Check audio quality and consider preprocessing');
        } else {
            recommendations.push('Poor transcription quality - significant improvements needed');
            recommendations.push('Use the largest available model');
            recommendations.push('Improve audio quality before transcription');
            recommendations.push('Consider manual review and correction');
        }

        return recommendations;
    }

    private async analyzeTranscriptionPatterns(args: any) {
        const { time_range_hours = 24, group_by = 'model', include_performance = true, include_quality_trends = true } = args;

        try {
            const cutoffTime = Date.now() - (time_range_hours * 60 * 60 * 1000);
            const recentTranscriptions = this.transcriptionHistory.filter(t => t.timestamp >= cutoffTime);

            let analysis: any = {
                total_transcriptions: recentTranscriptions.length,
                time_range_hours,
                analysis_timestamp: Date.now()
            };

            if (group_by === 'model') {
                analysis.by_model = this.analyzeByModel(recentTranscriptions);
            } else if (group_by === 'language') {
                analysis.by_language = this.analyzeByLanguage(recentTranscriptions);
            } else if (group_by === 'quality') {
                analysis.by_quality = this.analyzeByQuality(recentTranscriptions);
            }

            if (include_performance) {
                analysis.performance_metrics = this.calculatePerformanceMetrics(recentTranscriptions);
            }

            if (include_quality_trends) {
                analysis.quality_trends = this.calculateQualityTrends(recentTranscriptions);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(analysis, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Pattern analysis failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private analyzeByModel(transcriptions: TranscriptionAnalytics[]) {
        const modelStats: Record<string, any> = {};

        transcriptions.forEach(t => {
            if (!modelStats[t.whisper_model]) {
                modelStats[t.whisper_model] = {
                    count: 0,
                    total_processing_time: 0,
                    total_quality_score: 0,
                    total_duration: 0,
                    languages: new Set()
                };
            }

            const stats = modelStats[t.whisper_model];
            stats.count++;
            stats.total_processing_time += t.processing_time_ms;
            stats.total_quality_score += t.quality_score;
            stats.total_duration += t.duration_seconds;
            stats.languages.add(t.language_detected);
        });

        return Object.entries(modelStats).map(([model, stats]: [string, any]) => ({
            model,
            usage_count: stats.count,
            avg_processing_time: stats.total_processing_time / stats.count,
            avg_quality_score: stats.total_quality_score / stats.count,
            avg_duration: stats.total_duration / stats.count,
            languages_detected: Array.from(stats.languages),
            efficiency_score: (stats.total_quality_score / stats.count) / (stats.total_processing_time / stats.count / 1000)
        }));
    }

    private analyzeByLanguage(transcriptions: TranscriptionAnalytics[]) {
        const languageStats: Record<string, any> = {};

        transcriptions.forEach(t => {
            if (!languageStats[t.language_detected]) {
                languageStats[t.language_detected] = {
                    count: 0,
                    total_quality_score: 0,
                    models_used: new Set(),
                    avg_confidence: 0
                };
            }

            const stats = languageStats[t.language_detected];
            stats.count++;
            stats.total_quality_score += t.quality_score;
            stats.avg_confidence += t.confidence_score;
            stats.models_used.add(t.whisper_model);
        });

        return Object.entries(languageStats).map(([language, stats]: [string, any]) => ({
            language,
            transcription_count: stats.count,
            avg_quality_score: stats.total_quality_score / stats.count,
            avg_confidence: stats.avg_confidence / stats.count,
            models_used: Array.from(stats.models_used),
            percentage: (stats.count / transcriptions.length) * 100
        }));
    }

    private analyzeByQuality(transcriptions: TranscriptionAnalytics[]) {
        const qualityRanges = {
            excellent: transcriptions.filter(t => t.quality_score >= 0.9),
            good: transcriptions.filter(t => t.quality_score >= 0.8 && t.quality_score < 0.9),
            acceptable: transcriptions.filter(t => t.quality_score >= 0.7 && t.quality_score < 0.8),
            poor: transcriptions.filter(t => t.quality_score < 0.7)
        };

        return Object.entries(qualityRanges).map(([range, items]) => ({
            quality_range: range,
            count: items.length,
            percentage: (items.length / transcriptions.length) * 100,
            avg_processing_time: items.reduce((sum, t) => sum + t.processing_time_ms, 0) / items.length || 0,
            common_models: this.getMostCommonModels(items)
        }));
    }

    private getMostCommonModels(transcriptions: TranscriptionAnalytics[]): string[] {
        const modelCounts: Record<string, number> = {};
        transcriptions.forEach(t => {
            modelCounts[t.whisper_model] = (modelCounts[t.whisper_model] || 0) + 1;
        });

        return Object.entries(modelCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([model]) => model);
    }

    private calculatePerformanceMetrics(transcriptions: TranscriptionAnalytics[]) {
        const processingTimes = transcriptions.map(t => t.processing_time_ms);
        const qualityScores = transcriptions.map(t => t.quality_score);

        return {
            avg_processing_time: processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length || 0,
            min_processing_time: Math.min(...processingTimes) || 0,
            max_processing_time: Math.max(...processingTimes) || 0,
            avg_quality_score: qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length || 0,
            min_quality_score: Math.min(...qualityScores) || 0,
            max_quality_score: Math.max(...qualityScores) || 0,
            total_duration_processed: transcriptions.reduce((sum, t) => sum + t.duration_seconds, 0),
            total_words_transcribed: transcriptions.reduce((sum, t) => sum + t.word_count, 0)
        };
    }

    private calculateQualityTrends(transcriptions: TranscriptionAnalytics[]) {
        // Sort by timestamp
        const sorted = transcriptions.sort((a, b) => a.timestamp - b.timestamp);

        // Calculate moving average of quality scores
        const windowSize = Math.max(5, Math.floor(sorted.length / 10));
        const trends = [];

        for (let i = windowSize - 1; i < sorted.length; i++) {
            const window = sorted.slice(i - windowSize + 1, i + 1);
            const avgQuality = window.reduce((sum, t) => sum + t.quality_score, 0) / window.length;
            trends.push({
                timestamp: sorted[i].timestamp,
                avg_quality: avgQuality,
                sample_size: window.length
            });
        }

        return {
            trend_points: trends,
            overall_trend: trends.length > 1 ?
                (trends[trends.length - 1].avg_quality - trends[0].avg_quality) : 0,
            quality_stability: this.calculateStability(trends.map(t => t.avg_quality))
        };
    }

    private calculateStability(values: number[]): number {
        if (values.length < 2) return 1.0;

        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        // Return stability as inverse of coefficient of variation (lower variation = higher stability)
        return mean > 0 ? Math.max(0, 1 - (stdDev / mean)) : 0;
    }

    private async optimizeBatchTranscription(args: any) {
        const { file_paths, quality_target = 'balanced', max_parallel = 2, analyze_only = false } = args;

        try {
            const analysis = await this.analyzeBatchFiles(file_paths);
            const optimization = await this.generateBatchOptimization(analysis, quality_target, max_parallel);

            if (!analyze_only) {
                // In a real implementation, this would start the batch transcription
                optimization.batch_job_id = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                optimization.status = 'ready_to_start';
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            file_analysis: analysis,
                            optimization_strategy: optimization,
                            estimated_total_time: optimization.estimated_duration_ms,
                            recommended_settings: optimization.recommended_settings
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Batch optimization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async analyzeBatchFiles(filePaths: string[]): Promise<any> {
        const analysis = {
            total_files: filePaths.length,
            estimated_total_size: 0,
            estimated_total_duration: 0,
            file_types: new Set<string>(),
            size_distribution: { small: 0, medium: 0, large: 0 }
        };

        for (const filePath of filePaths) {
            try {
                const stats = await stat(filePath);
                analysis.estimated_total_size += stats.size;

                // Estimate duration based on file size (rough approximation)
                const estimatedDuration = Math.max(60, stats.size / 1000000);
                analysis.estimated_total_duration += estimatedDuration;

                // Categorize file size
                if (stats.size < 10 * 1024 * 1024) { // < 10MB
                    analysis.size_distribution.small++;
                } else if (stats.size < 100 * 1024 * 1024) { // < 100MB
                    analysis.size_distribution.medium++;
                } else {
                    analysis.size_distribution.large++;
                }

                // Track file extensions
                const ext = filePath.split('.').pop()?.toLowerCase();
                if (ext) analysis.file_types.add(ext);
            } catch (error) {
                console.warn(`Could not analyze file ${filePath}:`, error);
            }
        }

        return {
            ...analysis,
            file_types: Array.from(analysis.file_types),
            avg_file_size: analysis.estimated_total_size / analysis.total_files,
            avg_duration: analysis.estimated_total_duration / analysis.total_files
        };
    }

    private async generateBatchOptimization(analysis: any, qualityTarget: string, maxParallel: number): Promise<any> {
        // Determine optimal model based on batch characteristics
        let recommendedModel = 'base';
        if (qualityTarget === 'fast' && analysis.size_distribution.small > analysis.total_files * 0.7) {
            recommendedModel = 'tiny';
        } else if (qualityTarget === 'high') {
            recommendedModel = 'medium';
        } else if (analysis.avg_duration > 1800) { // > 30 minutes average
            recommendedModel = 'small';
        } else {
            recommendedModel = 'turbo';
        }

        // Calculate optimal parallelization
        const optimalParallel = Math.min(maxParallel, Math.max(1, Math.floor(analysis.total_files / 5)));

        // Estimate processing time
        const modelSpeeds = { tiny: 10, base: 7, small: 5, medium: 3, large: 2, turbo: 8 };
        const speed = modelSpeeds[recommendedModel as keyof typeof modelSpeeds] || 5;
        const estimatedDurationMs = (analysis.estimated_total_duration * speed * 1000) / optimalParallel;

        return {
            recommended_model: recommendedModel,
            optimal_parallel: optimalParallel,
            estimated_duration_ms: estimatedDurationMs,
            recommended_settings: {
                model: recommendedModel,
                language: 'auto',
                chunk_duration: 30,
                parallel_jobs: optimalParallel
            },
            optimization_reasoning: [
                `Selected ${recommendedModel} model for ${qualityTarget} quality target`,
                `Using ${optimalParallel} parallel jobs for optimal throughput`,
                `Estimated ${(estimatedDurationMs / 1000 / 60).toFixed(1)} minutes total processing time`
            ]
        };
    }

    private async recordTranscriptionFeedback(args: any) {
        const { transcription_id, user_rating, accuracy_rating, completeness_rating, corrections_made, feedback_notes, improvement_suggestions } = args;

        try {
            const feedback: QualityFeedback = {
                transcription_id,
                user_rating,
                accuracy_rating,
                completeness_rating,
                corrections_made,
                feedback_notes,
                improvement_suggestions,
                timestamp: Date.now()
            };

            await this.storeFeedback(feedback);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            transcription_id,
                            feedback_recorded: true,
                            user_rating,
                            accuracy_rating,
                            completeness_rating,
                            corrections_count: corrections_made?.length || 0
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Feedback recording failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getTranscriptionAnalytics(args: any) {
        const { time_range_hours = 24, include_model_performance = true, include_language_detection = true, include_quality_metrics = true } = args;

        try {
            const cutoffTime = Date.now() - (time_range_hours * 60 * 60 * 1000);
            const recentTranscriptions = this.transcriptionHistory.filter(t => t.timestamp >= cutoffTime);

            const analytics: any = {
                summary: {
                    total_transcriptions: recentTranscriptions.length,
                    time_range_hours,
                    total_duration_processed: recentTranscriptions.reduce((sum, t) => sum + t.duration_seconds, 0),
                    total_words_transcribed: recentTranscriptions.reduce((sum, t) => sum + t.word_count, 0),
                    avg_processing_time: recentTranscriptions.reduce((sum, t) => sum + t.processing_time_ms, 0) / recentTranscriptions.length || 0
                }
            };

            if (include_model_performance) {
                analytics.model_performance = this.analyzeByModel(recentTranscriptions);
            }

            if (include_language_detection) {
                analytics.language_detection = this.analyzeByLanguage(recentTranscriptions);
            }

            if (include_quality_metrics) {
                analytics.quality_metrics = this.calculatePerformanceMetrics(recentTranscriptions);
                analytics.quality_distribution = this.analyzeByQuality(recentTranscriptions);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(analytics, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Analytics retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async storeFeedback(feedback: QualityFeedback): Promise<void> {
        try {
            const db = getDatabase();
            db.run(`
                INSERT INTO transcription_quality_feedback
                (transcription_id, user_rating, accuracy_rating, completeness_rating,
                 corrections_made, feedback_notes, improvement_suggestions, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                feedback.transcription_id,
                feedback.user_rating,
                feedback.accuracy_rating,
                feedback.completeness_rating,
                JSON.stringify(feedback.corrections_made || []),
                feedback.feedback_notes || null,
                feedback.improvement_suggestions || null,
                feedback.timestamp
            ]);
        } catch (error) {
            console.error('Failed to store transcription feedback:', error);
        }
    }

    private async storeTranscriptionAnalytics(analytics: TranscriptionAnalytics): Promise<void> {
        try {
            const db = getDatabase();
            db.run(`
                INSERT OR REPLACE INTO transcription_analytics
                (id, media_id, task_id, file_path, file_size, duration_seconds, whisper_model,
                 language_detected, language_specified, confidence_score, processing_time_ms,
                 transcript_length, chunk_count, word_count, quality_score, error_rate, timestamp, session_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                analytics.id,
                analytics.media_id || null,
                analytics.task_id || null,
                analytics.file_path,
                analytics.file_size,
                analytics.duration_seconds,
                analytics.whisper_model,
                analytics.language_detected,
                analytics.language_specified || null,
                analytics.confidence_score,
                analytics.processing_time_ms,
                analytics.transcript_length,
                analytics.chunk_count,
                analytics.word_count,
                analytics.quality_score,
                analytics.error_rate || null,
                analytics.timestamp,
                analytics.session_id || null
            ]);
        } catch (error) {
            console.error('Failed to store transcription analytics:', error);
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Whisper MCP server running on stdio');
    }
}

// Run the server
const server = new WhisperMCPServer();
server.run().catch(console.error);
