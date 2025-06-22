#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer } from 'ws';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { config } from '../config.js';
import { getDatabase, initDatabase } from '../db.js';
import type { DatabaseTask } from '../types/index.js';

interface TaskStatusUpdate {
    taskId: string | number;
    status: string;
    timestamp: string;
    details?: any;
}

interface NotificationConfig {
    type: 'webhook' | 'email' | 'console';
    endpoint?: string;
    email?: string;
    enabled: boolean;
}

class MonitorMCPServer {
    private server: Server;
    private wsServer?: WebSocketServer;
    private notifications: NotificationConfig[] = [];
    private taskStatusHistory: TaskStatusUpdate[] = [];
    private wsPort: number = 8080;

    constructor() {
        this.server = new Server(
            {
                name: 'monitor-server',
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
            // Initialize database first
            await initDatabase();
            console.error('Monitor server database initialized');

            // Then setup handlers and WebSocket server
            this.setupToolHandlers();
            this.initializeWebSocketServer();
        } catch (error) {
            console.error('Failed to initialize monitor server:', error);
        }
    }

    private initializeWebSocketServer() {
        this.wsServer = new WebSocketServer({ port: this.wsPort });

        this.wsServer.on('connection', (ws) => {
            console.error(`WebSocket client connected`);

            // Send current status on connection
            this.sendCurrentStatus(ws);

            ws.on('close', () => {
                console.error('WebSocket client disconnected');
            });
        });

        console.error(`WebSocket server started on port ${this.wsPort}`);
    }

    private async sendCurrentStatus(ws: any) {
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
            // Send empty status if database is not ready
            ws.send(JSON.stringify({
                type: 'current_status',
                data: {
                    tasks: [],
                    timestamp: new Date().toISOString(),
                    error: 'Database not ready'
                }
            }));
        }
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'get_task_status',
                        description: 'Get current status of all tasks or a specific task',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                task_id: {
                                    type: ['string', 'number'],
                                    description: 'Specific task ID to get status for (optional)'
                                },
                                status_filter: {
                                    type: 'string',
                                    description: 'Filter tasks by status',
                                    enum: ['pending', 'running', 'completed', 'failed', 'blocked', 'skipped', 'retrying']
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Maximum number of tasks to return',
                                    default: 50
                                }
                            }
                        }
                    },
                    {
                        name: 'get_task_progress',
                        description: 'Get detailed progress information for running tasks',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                include_logs: {
                                    type: 'boolean',
                                    description: 'Include recent log entries',
                                    default: true
                                },
                                log_lines: {
                                    type: 'number',
                                    description: 'Number of recent log lines to include',
                                    default: 20
                                }
                            }
                        }
                    },
                    {
                        name: 'setup_notification',
                        description: 'Configure notifications for task status changes',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['webhook', 'email', 'console'],
                                    description: 'Type of notification'
                                },
                                endpoint: {
                                    type: 'string',
                                    description: 'Webhook URL (for webhook type)'
                                },
                                email: {
                                    type: 'string',
                                    description: 'Email address (for email type)'
                                },
                                enabled: {
                                    type: 'boolean',
                                    description: 'Enable or disable this notification',
                                    default: true
                                }
                            },
                            required: ['type']
                        }
                    },
                    {
                        name: 'send_notification',
                        description: 'Send a notification about task status change',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                task_id: {
                                    type: ['string', 'number'],
                                    description: 'Task ID'
                                },
                                status: {
                                    type: 'string',
                                    description: 'New task status'
                                },
                                message: {
                                    type: 'string',
                                    description: 'Custom notification message'
                                },
                                details: {
                                    type: 'object',
                                    description: 'Additional details to include'
                                }
                            },
                            required: ['task_id', 'status']
                        }
                    },
                    {
                        name: 'get_system_metrics',
                        description: 'Get system performance metrics and statistics',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                time_range_hours: {
                                    type: 'number',
                                    description: 'Time range in hours for metrics calculation',
                                    default: 24
                                }
                            }
                        }
                    },
                    {
                        name: 'get_live_dashboard_url',
                        description: 'Get the URL for the live WebSocket dashboard',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'broadcast_status_update',
                        description: 'Broadcast a status update to all connected WebSocket clients',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                task_id: {
                                    type: ['string', 'number'],
                                    description: 'Task ID'
                                },
                                status: {
                                    type: 'string',
                                    description: 'New status'
                                },
                                details: {
                                    type: 'object',
                                    description: 'Additional details'
                                }
                            },
                            required: ['task_id', 'status']
                        }
                    }
                ] as Tool[]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'get_task_status':
                        return await this.getTaskStatus(args);
                    case 'get_task_progress':
                        return await this.getTaskProgress(args);
                    case 'setup_notification':
                        return await this.setupNotification(args);
                    case 'send_notification':
                        return await this.sendNotification(args);
                    case 'get_system_metrics':
                        return await this.getSystemMetrics(args);
                    case 'get_live_dashboard_url':
                        return await this.getLiveDashboardUrl(args);
                    case 'broadcast_status_update':
                        return await this.broadcastStatusUpdate(args);
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

    private async getTaskStatus(args: any) {
        const { task_id, status_filter, limit = 50 } = args;

        try {
            const db = getDatabase();
            let query = 'SELECT * FROM tasks';
            const params: any[] = [];

            if (task_id) {
                query += ' WHERE id = ?';
                params.push(task_id);
            } else if (status_filter) {
                query += ' WHERE status = ?';
                params.push(status_filter);
            }

            query += ' ORDER BY created_at DESC LIMIT ?';
            params.push(limit);

            const tasks = db.query(query).all(...params) as DatabaseTask[];

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            tasks,
                            total_found: tasks.length,
                            filters: { task_id, status_filter },
                            timestamp: new Date().toISOString()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get task status: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getTaskProgress(args: any) {
        const { include_logs = true, log_lines = 20 } = args;

        try {
            const db = getDatabase();
            const runningTasks = db.query('SELECT * FROM tasks WHERE status = ?').all('running') as DatabaseTask[];

            const progressData = [];

            for (const task of runningTasks) {
                const taskProgress: any = {
                    task_id: task.id,
                    description: task.description,
                    type: task.type,
                    started_at: task.started_at,
                    duration_seconds: task.started_at ?
                        Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000) : 0
                };

                if (include_logs) {
                    taskProgress.recent_logs = await this.getRecentLogs(task.id, log_lines);
                }

                progressData.push(taskProgress);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            running_tasks: progressData,
                            total_running: runningTasks.length,
                            timestamp: new Date().toISOString()
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get task progress: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getRecentLogs(taskId: number, lines: number = 20) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const logPath = join(config.paths.logs, `${today}.log`);

            const logContent = await readFile(logPath, 'utf-8');
            const logLines = logContent.split('\n')
                .filter(line => line.includes(`"taskId":"${taskId}"`) || line.includes(`"taskId":${taskId}`))
                .slice(-lines);

            return logLines.map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return { raw: line };
                }
            });
        } catch (error) {
            return [`Error reading logs: ${error instanceof Error ? error.message : String(error)}`];
        }
    }

    private async setupNotification(args: any) {
        const { type, endpoint, email, enabled = true } = args;

        const notification: NotificationConfig = {
            type,
            endpoint,
            email,
            enabled
        };

        // Remove existing notification of same type
        this.notifications = this.notifications.filter(n => n.type !== type);

        // Add new notification
        this.notifications.push(notification);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: `Notification configured successfully`,
                        notification,
                        total_notifications: this.notifications.length
                    }, null, 2)
                }
            ]
        };
    }

    private async sendNotification(args: any) {
        const { task_id, status, message, details } = args;

        const statusUpdate: TaskStatusUpdate = {
            taskId: task_id,
            status,
            timestamp: new Date().toISOString(),
            details
        };

        this.taskStatusHistory.push(statusUpdate);

        // Keep only last 1000 status updates
        if (this.taskStatusHistory.length > 1000) {
            this.taskStatusHistory = this.taskStatusHistory.slice(-1000);
        }

        const notificationMessage = message || `Task ${task_id} status changed to ${status}`;

        const results = [];
        for (const notification of this.notifications.filter(n => n.enabled)) {
            try {
                switch (notification.type) {
                    case 'console':
                        console.log(`[NOTIFICATION] ${notificationMessage}`, details);
                        results.push({ type: 'console', status: 'sent' });
                        break;

                    case 'webhook':
                        if (notification.endpoint) {
                            const response = await fetch(notification.endpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    task_id,
                                    status,
                                    message: notificationMessage,
                                    details,
                                    timestamp: statusUpdate.timestamp
                                })
                            });
                            results.push({
                                type: 'webhook',
                                status: response.ok ? 'sent' : 'failed',
                                response_status: response.status
                            });
                        }
                        break;

                    case 'email':
                        // Email implementation would go here
                        results.push({ type: 'email', status: 'not_implemented' });
                        break;
                }
            } catch (error) {
                results.push({
                    type: notification.type,
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        // Broadcast to WebSocket clients
        this.broadcastToWebSockets({
            type: 'status_update',
            data: statusUpdate
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Notification sent',
                        status_update: statusUpdate,
                        notification_results: results
                    }, null, 2)
                }
            ]
        };
    }

    private async getSystemMetrics(args: any) {
        const { time_range_hours = 24 } = args;

        try {
            const db = getDatabase();
            const cutoffTime = new Date(Date.now() - time_range_hours * 60 * 60 * 1000).toISOString();

            const metrics = {
                time_range_hours,
                cutoff_time: cutoffTime,
                task_counts: {} as Record<string, number>,
                performance: {},
                system_health: {}
            };

            // Task status counts
            const statusCounts = db.query(`
        SELECT status, COUNT(*) as count 
        FROM tasks 
        WHERE created_at >= ? 
        GROUP BY status
      `).all(cutoffTime) as Array<{ status: string, count: number }>;

            metrics.task_counts = Object.fromEntries(
                statusCounts.map(row => [row.status, row.count])
            );

            // Performance metrics
            const completedTasks = db.query(`
        SELECT 
          AVG(JULIANDAY(finished_at) - JULIANDAY(started_at)) * 24 * 60 * 60 as avg_duration_seconds,
          COUNT(*) as total_completed
        FROM tasks 
        WHERE status = 'completed' AND created_at >= ? AND started_at IS NOT NULL AND finished_at IS NOT NULL
      `).get(cutoffTime) as any;

            metrics.performance = {
                average_task_duration_seconds: completedTasks?.avg_duration_seconds || 0,
                total_completed_tasks: completedTasks?.total_completed || 0,
                success_rate: metrics.task_counts['completed'] ?
                    metrics.task_counts['completed'] /
                    Object.values(metrics.task_counts).reduce((a, b) => a + b, 0) : 0
            };

            // System health
            metrics.system_health = {
                pending_tasks: metrics.task_counts['pending'] || 0,
                running_tasks: metrics.task_counts['running'] || 0,
                failed_tasks: metrics.task_counts['failed'] || 0,
                websocket_connections: this.wsServer?.clients.size || 0,
                active_notifications: this.notifications.filter(n => n.enabled).length
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(metrics, null, 2)
                    }
                ]
            };
        } catch (error) {
            throw new Error(`Failed to get system metrics: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getLiveDashboardUrl(args: any) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        websocket_url: `ws://localhost:${this.wsPort}`,
                        dashboard_info: {
                            description: 'Connect to this WebSocket URL to receive real-time task status updates',
                            message_types: ['current_status', 'status_update'],
                            port: this.wsPort
                        }
                    }, null, 2)
                }
            ]
        };
    }

    private async broadcastStatusUpdate(args: any) {
        const { task_id, status, details } = args;

        const statusUpdate: TaskStatusUpdate = {
            taskId: task_id,
            status,
            timestamp: new Date().toISOString(),
            details
        };

        this.broadcastToWebSockets({
            type: 'status_update',
            data: statusUpdate
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Status update broadcasted',
                        status_update: statusUpdate,
                        clients_notified: this.wsServer?.clients.size || 0
                    }, null, 2)
                }
            ]
        };
    }

    private broadcastToWebSockets(message: any) {
        if (this.wsServer) {
            this.wsServer.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(JSON.stringify(message));
                }
            });
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Monitor MCP server running on stdio');
    }
}

// Run the server
const server = new MonitorMCPServer();
server.run().catch(console.error);

