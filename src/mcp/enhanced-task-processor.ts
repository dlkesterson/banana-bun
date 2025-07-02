/**
 * Enhanced Task Processor with MCP-like capabilities
 * 
 * This provides the core functionality you wanted from the MCP servers:
 * 1. Learning from past tasks via ChromaDB embeddings
 * 2. Real-time monitoring and notifications
 * 3. Task recommendations and pattern analysis
 * 
 * You can integrate this directly into your existing task processor.
 */

import { embeddingManager } from '../memory/embeddings';
import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { WebSocketServer } from 'ws';
import type { TaskEmbedding, DatabaseTask } from '../types';

export interface EnhancedTaskResult {
    success: boolean;
    recommendations?: string[];
    similarTasks?: TaskEmbedding[];
    patterns?: any;
    outputPath?: string;
    error?: string;
}

export class EnhancedTaskProcessor {
    private wsServer?: WebSocketServer;
    private wsPort = 8081; // Enhanced Task Processor WebSocket on port 8081
    private isInitialized = false;
    private notifications: Array<{ type: string; endpoint?: string; enabled: boolean }> = [];

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Initialize embedding manager
            await embeddingManager.initialize();

            // Start WebSocket server for real-time monitoring
            this.startWebSocketServer();

            // Setup default notifications
            this.notifications.push({ type: 'console', enabled: true });

            this.isInitialized = true;
            await logger.info('Enhanced Task Processor initialized');
        } catch (error) {
            await logger.error('Failed to initialize Enhanced Task Processor', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private startWebSocketServer(): void {
        this.wsServer = new WebSocketServer({ port: this.wsPort });

        this.wsServer.on('connection', (ws) => {
            console.log('📱 WebSocket client connected');
            this.sendCurrentStatus(ws);

            ws.on('close', () => {
                console.log('📱 WebSocket client disconnected');
            });
        });
    }

    private async sendCurrentStatus(ws: any): Promise<void> {
        try {
            const db = getDatabase();
            const tasks = db.query('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50').all() as DatabaseTask[];

            ws.send(JSON.stringify({
                type: 'current_status',
                data: {
                    tasks,
                    timestamp: new Date().toISOString()
                }
            }));
        } catch (error) {
            console.error('Error sending current status:', error);
        }
    }

    /**
     * Enhanced task processing with learning and recommendations
     */
    async processTaskWithEnhancements(task: any): Promise<EnhancedTaskResult> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Get recommendations before processing
            const recommendations = await this.getTaskRecommendations(task.description, task.type);

            // Find similar successful tasks
            const similarTasks = await this.findSimilarTasks(task.description, 3, 'completed');

            // Broadcast task start
            await this.broadcastStatusUpdate(task.id, 'running', {
                description: task.description,
                type: task.type,
                started_at: new Date().toISOString()
            });

            return {
                success: true,
                recommendations: recommendations?.recommendations || [],
                similarTasks,
                patterns: recommendations
            };
        } catch (error) {
            await logger.error('Error in enhanced task processing', {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Complete task with embedding storage and notifications
     */
    async completeTaskWithEnhancements(task: any, result: any): Promise<void> {
        if (!this.isInitialized) return;

        try {
            // Create and store task embedding
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

            await embeddingManager.addTaskEmbedding(embedding);

            // Send notification
            await this.sendNotification(
                task.id,
                result.success ? 'completed' : 'failed',
                `Task ${task.id} ${result.success ? 'completed successfully' : 'failed'}`,
                {
                    task_type: task.type,
                    result: result
                }
            );

            // Broadcast status update
            await this.broadcastStatusUpdate(task.id, result.success ? 'completed' : 'failed', {
                result: result,
                finished_at: new Date().toISOString()
            });

        } catch (error) {
            await logger.error('Error in enhanced task completion', {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Find similar tasks using vector similarity
     */
    async findSimilarTasks(query: string, limit: number = 5, statusFilter?: string): Promise<TaskEmbedding[]> {
        try {
            const similarTasks = await embeddingManager.findSimilarTasks(query, limit);

            // Apply status filter if provided
            if (statusFilter) {
                return similarTasks.filter(task => task.status === statusFilter);
            }

            return similarTasks;
        } catch (error) {
            await logger.error('Failed to find similar tasks', {
                error: error instanceof Error ? error.message : String(error)
            });
            return [];
        }
    }

    /**
     * Get task recommendations based on similar successful tasks
     */
    async getTaskRecommendations(taskDescription: string, taskType?: string): Promise<any> {
        try {
            // Find similar successful tasks
            const similarTasks = await this.findSimilarTasks(taskDescription, 10, 'completed');

            if (similarTasks.length === 0) {
                return {
                    current_task: taskDescription,
                    similar_successful_tasks: 0,
                    recommendations: ['No similar successful tasks found. Consider breaking down the task into smaller components.']
                };
            }

            const recommendations = [
                `Found ${similarTasks.length} similar successful tasks`,
                'Consider using similar approaches that worked before',
                'Review the metadata and results of similar tasks for insights'
            ];

            return {
                current_task: taskDescription,
                similar_successful_tasks: similarTasks.length,
                recommendations,
                similar_tasks: similarTasks.slice(0, 3)
            };
        } catch (error) {
            await logger.error('Failed to get task recommendations', {
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Analyze task patterns for insights
     */
    async analyzeTaskPatterns(taskType?: string, timeRangeDays: number = 30): Promise<any> {
        try {
            const db = getDatabase();
            const cutoffTime = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000).toISOString();

            let query = 'SELECT * FROM tasks WHERE created_at >= ?';
            const params = [cutoffTime];

            if (taskType) {
                query += ' AND type = ?';
                params.push(taskType);
            }

            const tasks = db.query(query).all(...params) as DatabaseTask[];

            // Calculate patterns
            const statusCounts: Record<string, number> = {};
            const typeCounts: Record<string, number> = {};
            const commonErrors: Record<string, number> = {};

            tasks.forEach(task => {
                statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
                typeCounts[task.type] = (typeCounts[task.type] || 0) + 1;

                if (task.status === 'error' && task.error_message) {
                    const errorKey = task.error_message.substring(0, 100);
                    commonErrors[errorKey] = (commonErrors[errorKey] || 0) + 1;
                }
            });

            return {
                total_tasks_analyzed: tasks.length,
                time_range_days: timeRangeDays,
                task_type_filter: taskType,
                patterns: {
                    status_distribution: statusCounts,
                    type_distribution: typeCounts,
                    success_rate: tasks.length > 0 ? (statusCounts.completed || 0) / tasks.length : 0,
                    common_errors: Object.entries(commonErrors)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .map(([error, count]) => ({ error, count }))
                }
            };
        } catch (error) {
            await logger.error('Failed to analyze task patterns', {
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Send notifications about task status changes
     */
    async sendNotification(taskId: string | number, status: string, message?: string, details?: any): Promise<void> {
        const notificationMessage = message || `Task ${taskId} status changed to ${status}`;

        // Console notification
        if (this.notifications.some(n => n.type === 'console' && n.enabled)) {
            console.log(`🔔 [NOTIFICATION] ${notificationMessage}`);
        }

        // Log notification
        await logger.info('Task notification sent', {
            taskId,
            status,
            message: notificationMessage,
            details
        });
    }

    /**
     * Broadcast status updates to WebSocket clients
     */
    async broadcastStatusUpdate(taskId: string | number, status: string, details?: any): Promise<void> {
        const statusUpdate = {
            taskId,
            status,
            timestamp: new Date().toISOString(),
            details
        };

        if (this.wsServer) {
            this.wsServer.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(JSON.stringify({
                        type: 'status_update',
                        data: statusUpdate
                    }));
                }
            });
        }
    }

    /**
     * Get system metrics and health information
     */
    async getSystemMetrics(timeRangeHours: number = 24): Promise<any> {
        try {
            const db = getDatabase();
            const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();

            // Task status counts
            const statusCounts = db.query(`
                SELECT status, COUNT(*) as count 
                FROM tasks 
                WHERE created_at >= ? 
                GROUP BY status
            `).all(cutoffTime) as Array<{ status: string, count: number }>;

            const taskCounts = Object.fromEntries(
                statusCounts.map(row => [row.status, row.count])
            );

            return {
                time_range_hours: timeRangeHours,
                task_counts: taskCounts,
                system_health: {
                    pending_tasks: taskCounts.pending || 0,
                    running_tasks: taskCounts.running || 0,
                    failed_tasks: taskCounts.failed || 0,
                    websocket_connections: this.wsServer?.clients.size || 0
                }
            };
        } catch (error) {
            await logger.error('Failed to get system metrics', {
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Get live dashboard information
     */
    getLiveDashboardInfo() {
        return {
            websocketUrl: `ws://localhost:${this.wsPort}`,
            dashboardPath: `${process.cwd()}/src/mcp/live-dashboard.html`
        };
    }

    /**
     * Shutdown the enhanced processor
     */
    async shutdown(): Promise<void> {
        try {
            if (this.wsServer) {
                this.wsServer.close();
            }

            // Shutdown embedding manager
            await embeddingManager.shutdown();

            this.isInitialized = false;
            await logger.info('Enhanced Task Processor shutdown completed');
        } catch (error) {
            await logger.error('Error during Enhanced Task Processor shutdown', {
                error: error instanceof Error ? error.message : String(error)
            });
            // Don't re-throw to allow graceful shutdown
        }
    }
}

// Export singleton instance
export const enhancedTaskProcessor = new EnhancedTaskProcessor();


