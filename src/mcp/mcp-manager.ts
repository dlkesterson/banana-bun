import { readFile } from 'fs/promises';
import { join } from 'path';
import { mcpClient } from './mcp-client.js';
import { logger } from '../utils/logger';
import { embeddingManager } from '../memory/embeddings.js';
import type { TaskEmbedding } from '../types/index.js';

interface MCPConfig {
    mcpServers: Record<string, {
        command: string;
        args: string[];
        env: Record<string, string>;
        description: string;
    }>;
    settings: {
        chromadb: {
            collection_name: string;
            embedding_model: string;
            similarity_threshold: number;
            max_results: number;
        };
        monitor: {
            websocket_port: number;
            notification_types: string[];
            log_retention_days: number;
            metrics_interval_minutes: number;
        };
        meilisearch: {
            index_name: string;
            search_analytics_collection: string;
            query_optimization_threshold: number;
            max_search_history: number;
            learning_enabled: boolean;
            auto_optimize_queries: boolean;
        };
    };
}

export class MCPManager {
    private config: MCPConfig | null = null;
    private isInitialized = false;
    private metricsInterval?: Timer;

    async initialize(): Promise<void> {
        try {
            await this.loadConfig();
            await this.startServers();
            await this.setupIntegrations();
            this.isInitialized = true;
            await logger.info('MCP Manager initialized successfully');
        } catch (error) {
            await logger.error('Failed to initialize MCP Manager', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private async loadConfig(): Promise<void> {
        try {
            const configPath = join(process.cwd(), 'src', 'mcp', 'mcp-config.json');
            const configContent = await readFile(configPath, 'utf-8');
            this.config = JSON.parse(configContent);
            await logger.info('MCP configuration loaded');
        } catch (error) {
            throw new Error(`Failed to load MCP configuration: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async startServers(): Promise<void> {
        if (!this.config) {
            throw new Error('MCP configuration not loaded');
        }

        const serverPromises = Object.entries(this.config.mcpServers).map(async ([name, serverConfig]) => {
            try {
                await mcpClient.startServer(name, serverConfig.command, serverConfig.args);
                await logger.info(`Started MCP server: ${name}`, { description: serverConfig.description });
            } catch (error) {
                await logger.error(`Failed to start MCP server: ${name}`, {
                    error: error instanceof Error ? error.message : String(error)
                });
                throw error;
            }
        });

        await Promise.all(serverPromises);
    }

    private async setupIntegrations(): Promise<void> {
        if (!this.config) return;

        // Setup default notifications
        try {
            await mcpClient.setupNotification('console', undefined, undefined, true);
            await logger.info('Default console notifications enabled');
        } catch (error) {
            await logger.error('Failed to setup default notifications', {
                error: error instanceof Error ? error.message : String(error)
            });
        }

        // Start metrics collection
        this.startMetricsCollection();
    }

    private startMetricsCollection(): void {
        if (!this.config) return;

        const intervalMinutes = this.config.settings.monitor.metrics_interval_minutes;
        this.metricsInterval = setInterval(async () => {
            try {
                const metrics = await mcpClient.getSystemMetrics(24);
                if (metrics) {
                    await logger.info('System metrics collected', { metrics });
                }
            } catch (error) {
                await logger.error('Failed to collect system metrics', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }, intervalMinutes * 60 * 1000);
    }

    // Enhanced task processing with MCP integration
    async processTaskWithMCP(task: any): Promise<any> {
        if (!this.isInitialized) {
            await logger.error('MCP Manager not initialized, falling back to standard processing');
            return task;
        }

        try {
            // Get recommendations before processing
            const recommendations = await this.getTaskRecommendations(task);
            if (recommendations) {
                await logger.info('Task recommendations received', {
                    taskId: task.id,
                    recommendations: recommendations.recommendations
                });
            }

            // Broadcast task start
            await mcpClient.broadcastStatusUpdate(task.id, 'running', {
                description: task.description,
                type: task.type,
                started_at: new Date().toISOString()
            });

            return task;
        } catch (error) {
            await logger.error('Error in MCP task processing', {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error)
            });
            return task;
        }
    }

    async completeTaskWithMCP(task: any, result: any): Promise<void> {
        if (!this.isInitialized) return;

        try {
            // Create task embedding
            const embedding: TaskEmbedding = {
                id: `task-${task.id}`,
                taskId: task.id,
                description: task.description || '',
                type: task.type || 'unknown',
                status: result.success ? 'completed' : 'failed',
                result: result,
                metadata: {
                    ...task.metadata,
                    completed_at: new Date().toISOString(),
                    success: result.success
                }
            };

            // Add embedding via MCP (with fallback to direct method)
            try {
                await mcpClient.batchAddEmbeddings([embedding]);
            } catch (mcpError) {
                await logger.error('Failed to add embedding via MCP, using fallback', {
                    taskId: task.id,
                    error: mcpError instanceof Error ? mcpError.message : String(mcpError)
                });
                await embeddingManager.addTaskEmbedding(embedding);
            }

            // Send notification
            await mcpClient.sendNotification(
                task.id,
                result.success ? 'completed' : 'failed',
                `Task ${task.id} ${result.success ? 'completed successfully' : 'failed'}`,
                {
                    task_type: task.type,
                    duration: task.started_at ? Date.now() - new Date(task.started_at).getTime() : null,
                    result: result
                }
            );

            // Broadcast status update
            await mcpClient.broadcastStatusUpdate(task.id, result.success ? 'completed' : 'failed', {
                result: result,
                finished_at: new Date().toISOString()
            });

        } catch (error) {
            await logger.error('Error in MCP task completion', {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    async getTaskRecommendations(task: any): Promise<any> {
        if (!this.isInitialized || !task.description) return null;

        try {
            return await mcpClient.getTaskRecommendations(task.description, task.type);
        } catch (error) {
            await logger.error('Failed to get task recommendations', {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    async findSimilarTasks(query: string, options: {
        limit?: number;
        statusFilter?: string;
        typeFilter?: string;
    } = {}): Promise<TaskEmbedding[]> {
        if (!this.isInitialized) return [];

        try {
            return await mcpClient.findSimilarTasks(query, options);
        } catch (error) {
            await logger.error('Failed to find similar tasks', {
                query,
                error: error instanceof Error ? error.message : String(error)
            });
            return [];
        }
    }

    async analyzeTaskPatterns(taskType?: string, timeRangeDays: number = 30): Promise<any> {
        if (!this.isInitialized) return null;

        try {
            return await mcpClient.analyzeTaskPatterns(taskType, timeRangeDays);
        } catch (error) {
            await logger.error('Failed to analyze task patterns', {
                taskType,
                timeRangeDays,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    async getSystemMetrics(timeRangeHours: number = 24): Promise<any> {
        if (!this.isInitialized) return null;

        try {
            return await mcpClient.getSystemMetrics(timeRangeHours);
        } catch (error) {
            await logger.error('Failed to get system metrics', {
                timeRangeHours,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    async setupWebhookNotification(webhookUrl: string): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('MCP Manager not initialized');
        }

        try {
            await mcpClient.setupNotification('webhook', webhookUrl, undefined, true);
            await logger.info('Webhook notification configured', { webhookUrl });
        } catch (error) {
            await logger.error('Failed to setup webhook notification', {
                webhookUrl,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getLiveDashboardInfo(): Promise<{ websocketUrl: string; dashboardPath: string }> {
        if (!this.config) {
            throw new Error('MCP configuration not loaded');
        }

        const port = this.config.settings.monitor.websocket_port;
        return {
            websocketUrl: `ws://localhost:${port}`,
            dashboardPath: join(process.cwd(), 'src', 'mcp', 'live-dashboard.html')
        };
    }

    async shutdown(): Promise<void> {
        try {
            if (this.metricsInterval) {
                clearInterval(this.metricsInterval);
            }

            await mcpClient.stopAllServers();
            this.isInitialized = false;
            await logger.info('MCP Manager shutdown completed');
        } catch (error) {
            await logger.error('Error during MCP Manager shutdown', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}

// Export singleton instance
export const mcpManager = new MCPManager();

