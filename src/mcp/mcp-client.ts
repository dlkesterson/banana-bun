import { spawn } from 'bun';
import { logger } from '../utils/logger';
import type { TaskEmbedding } from '../types/index.js';

// Simple MCP client that works with Bun's process spawning

interface MCPServerProcess {
    process: any;
    stdin: any;
    stdout: any;
    stderr: any;
}

interface MCPRequest {
    jsonrpc: string;
    id: number;
    method: string;
    params?: any;
}

interface MCPResponse {
    jsonrpc: string;
    id: number;
    result?: any;
    error?: any;
}

export class MCPClient {
    private servers: Map<string, MCPServerProcess> = new Map();
    private requestId = 0;
    private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();

    async startServer(serverName: string, command: string, args: string[]): Promise<void> {
        try {
            const process = spawn({
                cmd: [command, ...args],
                stdin: 'pipe',
                stdout: 'pipe',
                stderr: 'pipe'
            });

            const server: MCPServerProcess = {
                process,
                stdin: process.stdin,
                stdout: process.stdout,
                stderr: process.stderr
            };

            this.servers.set(serverName, server);

            // Handle stdout responses
            this.setupResponseHandler(serverName, server.stdout);

            // Handle stderr for logging
            this.setupErrorHandler(serverName, server.stderr);

            // Wait a bit for the server to start
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Initialize the server
            await this.sendRequest(serverName, 'initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {}
                },
                clientInfo: {
                    name: 'folder-watcher',
                    version: '1.0.0'
                }
            });

            await logger.info(`MCP server ${serverName} started successfully`);
        } catch (error) {
            await logger.error(`Failed to start MCP server ${serverName}`, {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private async setupResponseHandler(serverName: string, stdout: any) {
        try {
            let buffer = '';

            // For Bun, we need to handle the stream differently
            for await (const chunk of stdout) {
                const text = chunk.toString();
                buffer += text;

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const response: MCPResponse = JSON.parse(line);
                            this.handleResponse(response);
                        } catch (error) {
                            await logger.error(`Failed to parse MCP response from ${serverName}`, {
                                line,
                                error: error instanceof Error ? error.message : String(error)
                            });
                        }
                    }
                }
            }
        } catch (error) {
            await logger.error(`Error reading from MCP server ${serverName}`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async setupErrorHandler(serverName: string, stderr: any) {
        try {
            // For Bun, we need to handle the stream differently
            for await (const chunk of stderr) {
                const text = chunk.toString();
                if (text.trim()) {
                    await logger.info(`MCP server ${serverName} stderr`, { message: text.trim() });
                }
            }
        } catch (error) {
            await logger.error(`Error reading stderr from MCP server ${serverName}`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private handleResponse(response: MCPResponse) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
            this.pendingRequests.delete(response.id);
            if (response.error) {
                pending.reject(new Error(response.error.message || 'MCP server error'));
            } else {
                pending.resolve(response.result);
            }
        }
    }

    private async sendRequest(serverName: string, method: string, params?: any): Promise<any> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server ${serverName} not found`);
        }

        const id = ++this.requestId;
        const request: MCPRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });

            try {
                // For Bun, we need to write directly to stdin
                const data = JSON.stringify(request) + '\n';
                server.stdin.write(data);
            } catch (error) {
                this.pendingRequests.delete(id);
                reject(error);
                return;
            }

            // Set timeout for request
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`MCP request timeout for ${method}`));
                }
            }, 30000); // 30 second timeout
        });
    }

    // ChromaDB MCP Server methods
    async findSimilarTasks(query: string, options: {
        limit?: number;
        statusFilter?: string;
        typeFilter?: string;
    } = {}): Promise<TaskEmbedding[]> {
        try {
            const { limit = 5, statusFilter, typeFilter } = options;

            const result = await this.sendRequest('chromadb', 'tools/call', {
                name: 'find_similar_tasks',
                arguments: {
                    query,
                    limit,
                    status_filter: statusFilter,
                    type_filter: typeFilter
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                const data = JSON.parse(content);
                return data.results || [];
            }
            return [];
        } catch (error) {
            await logger.error('Failed to find similar tasks via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async analyzeTaskPatterns(taskType?: string, timeRangeDays: number = 30): Promise<any> {
        try {
            const result = await this.sendRequest('chromadb', 'tools/call', {
                name: 'analyze_task_patterns',
                arguments: {
                    task_type: taskType,
                    time_range_days: timeRangeDays
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to analyze task patterns via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getTaskRecommendations(currentTaskDescription: string, taskType?: string): Promise<any> {
        try {
            const result = await this.sendRequest('chromadb', 'tools/call', {
                name: 'get_task_recommendations',
                arguments: {
                    current_task_description: currentTaskDescription,
                    task_type: taskType
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to get task recommendations via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async batchAddEmbeddings(tasks: TaskEmbedding[]): Promise<any> {
        try {
            const result = await this.sendRequest('chromadb', 'tools/call', {
                name: 'batch_add_embeddings',
                arguments: { tasks }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to batch add embeddings via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    // Monitor MCP Server methods
    async getTaskStatus(taskId?: string | number, statusFilter?: string, limit: number = 50): Promise<any> {
        try {
            const result = await this.sendRequest('monitor', 'tools/call', {
                name: 'get_task_status',
                arguments: {
                    task_id: taskId,
                    status_filter: statusFilter,
                    limit
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to get task status via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getTaskProgress(includeLogs: boolean = true, logLines: number = 20): Promise<any> {
        try {
            const result = await this.sendRequest('monitor', 'tools/call', {
                name: 'get_task_progress',
                arguments: {
                    include_logs: includeLogs,
                    log_lines: logLines
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to get task progress via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async setupNotification(type: 'webhook' | 'email' | 'console', endpoint?: string, email?: string, enabled: boolean = true): Promise<any> {
        try {
            const result = await this.sendRequest('monitor', 'tools/call', {
                name: 'setup_notification',
                arguments: {
                    type,
                    endpoint,
                    email,
                    enabled
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to setup notification via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async sendNotification(taskId: string | number, status: string, message?: string, details?: any): Promise<any> {
        try {
            const result = await this.sendRequest('monitor', 'tools/call', {
                name: 'send_notification',
                arguments: {
                    task_id: taskId,
                    status,
                    message,
                    details
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to send notification via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getSystemMetrics(timeRangeHours: number = 24): Promise<any> {
        try {
            const result = await this.sendRequest('monitor', 'tools/call', {
                name: 'get_system_metrics',
                arguments: {
                    time_range_hours: timeRangeHours
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to get system metrics via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async broadcastStatusUpdate(taskId: string | number, status: string, details?: any): Promise<any> {
        try {
            const result = await this.sendRequest('monitor', 'tools/call', {
                name: 'broadcast_status_update',
                arguments: {
                    task_id: taskId,
                    status,
                    details
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to broadcast status update via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async stopServer(serverName: string): Promise<void> {
        const server = this.servers.get(serverName);
        if (server) {
            try {
                server.process.kill();
                this.servers.delete(serverName);
                await logger.info(`MCP server ${serverName} stopped`);
            } catch (error) {
                await logger.error(`Failed to stop MCP server ${serverName}`, {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    async stopAllServers(): Promise<void> {
        const serverNames = Array.from(this.servers.keys());
        for (const serverName of serverNames) {
            await this.stopServer(serverName);
        }
    }

    // MeiliSearch MCP Server methods
    async smartSearch(query: string, options: {
        filters?: string;
        limit?: number;
        offset?: number;
        optimizeQuery?: boolean;
        learnFromSearch?: boolean;
        sessionId?: string;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('meilisearch', 'tools/call', {
                name: 'smart_search',
                arguments: {
                    query,
                    filters: options.filters,
                    limit: options.limit || 20,
                    offset: options.offset || 0,
                    optimize_query: options.optimizeQuery !== false,
                    learn_from_search: options.learnFromSearch !== false,
                    session_id: options.sessionId
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to perform smart search via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getSearchSuggestions(partialQuery: string, options: {
        limit?: number;
        includeFilters?: boolean;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('meilisearch', 'tools/call', {
                name: 'get_search_suggestions',
                arguments: {
                    partial_query: partialQuery,
                    limit: options.limit || 5,
                    include_filters: options.includeFilters !== false
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to get search suggestions via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async analyzeSearchPatterns(options: {
        timeRangeHours?: number;
        includePerformance?: boolean;
        groupBy?: 'query_type' | 'time_period' | 'user_session';
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('meilisearch', 'tools/call', {
                name: 'analyze_search_patterns',
                arguments: {
                    time_range_hours: options.timeRangeHours || 24,
                    include_performance: options.includePerformance !== false,
                    group_by: options.groupBy || 'query_type'
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to analyze search patterns via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async optimizeSearchIndex(options: {
        analyzeOnly?: boolean;
        focusArea?: 'searchable_attributes' | 'filterable_attributes' | 'ranking_rules';
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('meilisearch', 'tools/call', {
                name: 'optimize_index',
                arguments: {
                    analyze_only: options.analyzeOnly || false,
                    focus_area: options.focusArea
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to optimize search index via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getSearchAnalytics(options: {
        timeRangeHours?: number;
        includeFailedSearches?: boolean;
        groupByTime?: 'hour' | 'day' | 'week';
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('meilisearch', 'tools/call', {
                name: 'get_search_analytics',
                arguments: {
                    time_range_hours: options.timeRangeHours || 24,
                    include_failed_searches: options.includeFailedSearches !== false,
                    group_by_time: options.groupByTime || 'hour'
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to get search analytics via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async recordSearchFeedback(searchId: string, options: {
        clickedResults?: string[];
        satisfactionRating?: number;
        feedbackNotes?: string;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('meilisearch', 'tools/call', {
                name: 'record_search_feedback',
                arguments: {
                    search_id: searchId,
                    clicked_results: options.clickedResults,
                    satisfaction_rating: options.satisfactionRating,
                    feedback_notes: options.feedbackNotes
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to record search feedback via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    // Whisper MCP Server methods
    async smartTranscribe(filePath: string, options: {
        model?: string;
        language?: string;
        chunkDuration?: number;
        qualityTarget?: 'fast' | 'balanced' | 'high';
        learnFromResult?: boolean;
        sessionId?: string;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('whisper', 'tools/call', {
                name: 'smart_transcribe',
                arguments: {
                    file_path: filePath,
                    model: options.model,
                    language: options.language || 'auto',
                    chunk_duration: options.chunkDuration || 30,
                    quality_target: options.qualityTarget || 'balanced',
                    learn_from_result: options.learnFromResult !== false,
                    session_id: options.sessionId
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to perform smart transcription via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getModelRecommendation(filePath: string, options: {
        qualityTarget?: 'fast' | 'balanced' | 'high';
        contentType?: 'speech' | 'music' | 'mixed' | 'noisy' | 'unknown';
        durationSeconds?: number;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('whisper', 'tools/call', {
                name: 'get_model_recommendation',
                arguments: {
                    file_path: filePath,
                    quality_target: options.qualityTarget || 'balanced',
                    content_type: options.contentType,
                    duration_seconds: options.durationSeconds
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to get model recommendation via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async assessTranscriptionQuality(transcriptText: string, options: {
        transcriptionId?: string;
        originalFilePath?: string;
        includeSuggestions?: boolean;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('whisper', 'tools/call', {
                name: 'assess_transcription_quality',
                arguments: {
                    transcription_id: options.transcriptionId,
                    transcript_text: transcriptText,
                    original_file_path: options.originalFilePath,
                    include_suggestions: options.includeSuggestions !== false
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to assess transcription quality via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async analyzeTranscriptionPatterns(options: {
        timeRangeHours?: number;
        groupBy?: 'model' | 'language' | 'content_type' | 'quality';
        includePerformance?: boolean;
        includeQualityTrends?: boolean;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('whisper', 'tools/call', {
                name: 'analyze_transcription_patterns',
                arguments: {
                    time_range_hours: options.timeRangeHours || 24,
                    group_by: options.groupBy || 'model',
                    include_performance: options.includePerformance !== false,
                    include_quality_trends: options.includeQualityTrends !== false
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to analyze transcription patterns via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async optimizeBatchTranscription(filePaths: string[], options: {
        qualityTarget?: 'fast' | 'balanced' | 'high';
        maxParallel?: number;
        analyzeOnly?: boolean;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('whisper', 'tools/call', {
                name: 'optimize_batch_transcription',
                arguments: {
                    file_paths: filePaths,
                    quality_target: options.qualityTarget || 'balanced',
                    max_parallel: options.maxParallel || 2,
                    analyze_only: options.analyzeOnly || false
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to optimize batch transcription via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async recordTranscriptionFeedback(transcriptionId: string, options: {
        userRating: number;
        accuracyRating?: number;
        completenessRating?: number;
        correctionsMade?: string[];
        feedbackNotes?: string;
        improvementSuggestions?: string;
    }): Promise<any> {
        try {
            const result = await this.sendRequest('whisper', 'tools/call', {
                name: 'record_transcription_feedback',
                arguments: {
                    transcription_id: transcriptionId,
                    user_rating: options.userRating,
                    accuracy_rating: options.accuracyRating,
                    completeness_rating: options.completenessRating,
                    corrections_made: options.correctionsMade,
                    feedback_notes: options.feedbackNotes,
                    improvement_suggestions: options.improvementSuggestions
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to record transcription feedback via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getTranscriptionAnalytics(options: {
        timeRangeHours?: number;
        includeModelPerformance?: boolean;
        includeLanguageDetection?: boolean;
        includeQualityMetrics?: boolean;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('whisper', 'tools/call', {
                name: 'get_transcription_analytics',
                arguments: {
                    time_range_hours: options.timeRangeHours || 24,
                    include_model_performance: options.includeModelPerformance !== false,
                    include_language_detection: options.includeLanguageDetection !== false,
                    include_quality_metrics: options.includeQualityMetrics !== false
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to get transcription analytics via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    // Media Intelligence MCP Server methods
    async analyzeContentDiscovery(options: {
        timeRangeHours?: number;
        userSessionId?: string;
        includeRecommendations?: boolean;
        discoveryThreshold?: number;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('media_intelligence', 'tools/call', {
                name: 'analyze_content_discovery',
                arguments: {
                    time_range_hours: options.timeRangeHours || 24,
                    user_session_id: options.userSessionId,
                    include_recommendations: options.includeRecommendations !== false,
                    discovery_threshold: options.discoveryThreshold || 0.7
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to analyze content discovery via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async generateCrossModalInsights(options: {
        mediaId?: number;
        correlationThreshold?: number;
        includeOptimizationSuggestions?: boolean;
        analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('media_intelligence', 'tools/call', {
                name: 'generate_cross_modal_insights',
                arguments: {
                    media_id: options.mediaId,
                    correlation_threshold: options.correlationThreshold || 0.6,
                    include_optimization_suggestions: options.includeOptimizationSuggestions !== false,
                    analysis_depth: options.analysisDepth || 'detailed'
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to generate cross-modal insights via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async optimizeContentTagging(mediaId: number, options: {
        optimizationStrategy?: 'search_driven' | 'user_behavior' | 'ai_enhanced' | 'hybrid';
        testMode?: boolean;
        confidenceThreshold?: number;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('media_intelligence', 'tools/call', {
                name: 'optimize_content_tagging',
                arguments: {
                    media_id: mediaId,
                    optimization_strategy: options.optimizationStrategy || 'hybrid',
                    test_mode: options.testMode || false,
                    confidence_threshold: options.confidenceThreshold || 0.8
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to optimize content tagging via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async generateContentRecommendations(options: {
        userSessionId?: string;
        sourceMediaId?: number;
        recommendationType?: 'similar_content' | 'trending' | 'personalized' | 'cross_modal';
        maxRecommendations?: number;
        includeReasoning?: boolean;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('media_intelligence', 'tools/call', {
                name: 'generate_content_recommendations',
                arguments: {
                    user_session_id: options.userSessionId,
                    source_media_id: options.sourceMediaId,
                    recommendation_type: options.recommendationType || 'personalized',
                    max_recommendations: options.maxRecommendations || 10,
                    include_reasoning: options.includeReasoning !== false
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to generate content recommendations via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async enhanceSemanticSearch(options: {
        query?: string;
        contentText?: string;
        enhancementType?: 'query_expansion' | 'keyword_extraction' | 'concept_mapping' | 'semantic_enrichment';
        useUserPatterns?: boolean;
        cacheResult?: boolean;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('media_intelligence', 'tools/call', {
                name: 'enhance_semantic_search',
                arguments: {
                    query: options.query,
                    content_text: options.contentText,
                    enhancement_type: options.enhancementType || 'semantic_enrichment',
                    use_user_patterns: options.useUserPatterns !== false,
                    cache_result: options.cacheResult !== false
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to enhance semantic search via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async trackUserBehavior(behaviorType: string, options: {
        userSessionId?: string;
        actionDetails?: any;
        mediaId?: number;
        interactionQuality?: number;
        contextData?: any;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('media_intelligence', 'tools/call', {
                name: 'track_user_behavior',
                arguments: {
                    user_session_id: options.userSessionId,
                    behavior_type: behaviorType,
                    action_details: options.actionDetails,
                    media_id: options.mediaId,
                    interaction_quality: options.interactionQuality,
                    context_data: options.contextData
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to track user behavior via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getIntelligenceDashboard(options: {
        timeRangeHours?: number;
        includeTrends?: boolean;
        includePredictions?: boolean;
        includeOptimizationOpportunities?: boolean;
        detailLevel?: 'summary' | 'detailed' | 'comprehensive';
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('media_intelligence', 'tools/call', {
                name: 'get_intelligence_dashboard',
                arguments: {
                    time_range_hours: options.timeRangeHours || 168,
                    include_trends: options.includeTrends !== false,
                    include_predictions: options.includePredictions !== false,
                    include_optimization_opportunities: options.includeOptimizationOpportunities !== false,
                    detail_level: options.detailLevel || 'detailed'
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to get intelligence dashboard via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async correlateSearchTranscription(options: {
        searchQuery?: string;
        transcriptionId?: string;
        mediaId?: number;
        updateCorrelations?: boolean;
        generateInsights?: boolean;
    } = {}): Promise<any> {
        try {
            const result = await this.sendRequest('media_intelligence', 'tools/call', {
                name: 'correlate_search_transcription',
                arguments: {
                    search_query: options.searchQuery,
                    transcription_id: options.transcriptionId,
                    media_id: options.mediaId,
                    update_correlations: options.updateCorrelations !== false,
                    generate_insights: options.generateInsights !== false
                }
            });

            const content = result.content?.[0]?.text;
            if (content) {
                return JSON.parse(content);
            }
            return null;
        } catch (error) {
            await logger.error('Failed to correlate search and transcription via MCP', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async sendCustomRequest(serverName: string, method: string, params?: any): Promise<any> {
        try {
            const result = await this.sendRequest(serverName, method, params);
            return result;
        } catch (error) {
            await logger.error(`Failed to send custom request to ${serverName}`, {
                error: error instanceof Error ? error.message : String(error),
                method,
            });
            throw error;
        }
    }
}

// Export singleton instance
export const mcpClient = new MCPClient();
