import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

// Mock WebSocket server
const mockWebSocketServer = {
    on: mock(() => {}),
    close: mock(() => {}),
    clients: new Set()
};

const mockWebSocket = {
    send: mock(() => {}),
    close: mock(() => {}),
    on: mock(() => {}),
    readyState: 1
};

// Mock modules
mock.module('ws', () => ({
    WebSocketServer: mock(() => mockWebSocketServer),
    WebSocket: mockWebSocket
}));

// Mock logger
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

// Mock database functions
let mockDb: Database;
const mockGetDatabase = mock(() => mockDb);

mock.module('../src/db', () => ({
    getDatabase: mockGetDatabase
}));

import { monitorServer } from '../src/mcp/monitor-server';

describe('Monitor Server', () => {
    beforeEach(() => {
        // Create in-memory database for testing
        mockDb = new Database(':memory:');
        
        // Create required tables
        mockDb.run(`
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                description TEXT,
                status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                finished_at DATETIME,
                error_message TEXT,
                result_summary TEXT
            )
        `);

        mockDb.run(`
            CREATE TABLE task_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER,
                metric_name TEXT,
                metric_value REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            )
        `);

        mockDb.run(`
            CREATE TABLE monitoring_thresholds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                threshold_name TEXT UNIQUE NOT NULL,
                threshold_value REAL NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        mockDb.run(`
            CREATE TABLE system_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_type TEXT NOT NULL,
                metric_data TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert default thresholds
        mockDb.run(`
            INSERT INTO monitoring_thresholds (threshold_name, threshold_value)
            VALUES
                ('max_execution_time', 3600),
                ('max_queue_depth', 100),
                ('min_success_rate', 0.95),
                ('max_memory_usage', 0.8)
        `);

        // Reset mocks
        Object.values(mockLogger).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                fn.mockClear();
            }
        });

        mockWebSocketServer.on.mockClear();
        mockWebSocketServer.close.mockClear();
        mockWebSocket.send.mockClear();
        mockWebSocket.on.mockClear();
    });

    afterEach(async () => {
        mockDb?.close();
        await monitorServer.shutdown();
    });

    describe('Server Initialization', () => {
        it('should initialize monitor server successfully', async () => {
            await monitorServer.initialize();

            expect(mockWebSocketServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Monitor server initialized')
            );
        });

        it('should handle initialization errors', async () => {
            mockWebSocketServer.on.mockImplementationOnce(() => {
                throw new Error('Server initialization failed');
            });

            await expect(monitorServer.initialize()).rejects.toThrow();
        });
    });

    describe('Real-time Monitoring', () => {
        beforeEach(async () => {
            await monitorServer.initialize();
        });

        it('should track task status changes', async () => {
            // Insert test task
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES (1, 'shell', 'Test task', 'pending')
            `);

            await monitorServer.trackTaskStatusChange(1, 'pending', 'running');

            // Should broadcast update to connected clients
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Task status change')
            );
        });

        it('should monitor system metrics', async () => {
            const metrics = await monitorServer.getSystemMetrics();

            expect(metrics).toHaveProperty('cpu_usage');
            expect(metrics).toHaveProperty('memory_usage');
            expect(metrics).toHaveProperty('active_tasks');
            expect(metrics).toHaveProperty('completed_tasks');
            expect(metrics).toHaveProperty('failed_tasks');
        });

        it('should track task execution metrics', async () => {
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, started_at, finished_at)
                VALUES (1, 'shell', 'Test task', 'completed', 
                       datetime('now', '-5 minutes'), datetime('now'))
            `);

            await monitorServer.recordTaskMetric(1, 'execution_time', 300000); // 5 minutes in ms
            await monitorServer.recordTaskMetric(1, 'memory_peak', 128.5);

            const metrics = mockDb.query('SELECT * FROM task_metrics WHERE task_id = 1').all();
            expect(metrics.length).toBe(2);
        });

        it('should detect performance anomalies', async () => {
            // Insert tasks with varying execution times
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, started_at, finished_at)
                VALUES 
                    (1, 'shell', 'Normal task 1', 'completed', datetime('now', '-10 minutes'), datetime('now', '-8 minutes')),
                    (2, 'shell', 'Normal task 2', 'completed', datetime('now', '-15 minutes'), datetime('now', '-13 minutes')),
                    (3, 'shell', 'Slow task', 'completed', datetime('now', '-30 minutes'), datetime('now'))
            `);

            const anomalies = await monitorServer.detectAnomalies('shell');

            expect(anomalies).toBeArray();
            expect(anomalies.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('WebSocket Communication', () => {
        beforeEach(async () => {
            await monitorServer.initialize();
        });

        it('should handle WebSocket connections', async () => {
            const connectionHandler = mockWebSocketServer.on.mock.calls.find(
                call => call[0] === 'connection'
            )?.[1];

            expect(connectionHandler).toBeDefined();

            if (connectionHandler) {
                connectionHandler(mockWebSocket);
            }

            expect(mockWebSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
            expect(mockWebSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
        });

        it('should handle client requests', async () => {
            const connectionHandler = mockWebSocketServer.on.mock.calls.find(
                call => call[0] === 'connection'
            )?.[1];

            if (connectionHandler) {
                connectionHandler(mockWebSocket);
            }

            const messageHandler = mockWebSocket.on.mock.calls.find(
                call => call[0] === 'message'
            )?.[1];

            if (messageHandler) {
                const request = JSON.stringify({
                    id: 'test-request',
                    method: 'get_system_metrics',
                    params: {}
                });

                await messageHandler(request);

                // Wait a bit for async operations to complete
                await new Promise(resolve => setTimeout(resolve, 10));

                expect(mockWebSocket.send).toHaveBeenCalledWith(
                    expect.stringContaining('test-request')
                );
            }
        });

        it('should broadcast real-time updates', async () => {
            const mockClient1 = { ...mockWebSocket, send: mock(() => {}), readyState: 1 };
            const mockClient2 = { ...mockWebSocket, send: mock(() => {}), readyState: 1 };
            
            mockWebSocketServer.clients.add(mockClient1);
            mockWebSocketServer.clients.add(mockClient2);

            await monitorServer.broadcastUpdate({
                type: 'task_status_change',
                task_id: 1,
                old_status: 'pending',
                new_status: 'running',
                timestamp: new Date().toISOString()
            });

            expect(mockClient1.send).toHaveBeenCalled();
            expect(mockClient2.send).toHaveBeenCalled();
        });

        it('should handle client disconnections', async () => {
            const connectionHandler = mockWebSocketServer.on.mock.calls.find(
                call => call[0] === 'connection'
            )?.[1];

            if (connectionHandler) {
                connectionHandler(mockWebSocket);
            }

            const closeHandler = mockWebSocket.on.mock.calls.find(
                call => call[0] === 'close'
            )?.[1];

            if (closeHandler) {
                closeHandler();
            }

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Client disconnected')
            );
        });
    });

    describe('Alert System', () => {
        beforeEach(async () => {
            await monitorServer.initialize();
        });

        it('should trigger alerts for failed tasks', async () => {
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, error_message)
                VALUES (1, 'shell', 'Failed task', 'failed', 'Command not found')
            `);

            await monitorServer.checkAlertConditions();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Alert triggered')
            );
        });

        it('should monitor task queue depth', async () => {
            // Insert multiple pending tasks
            for (let i = 1; i <= 10; i++) {
                mockDb.run(`
                    INSERT INTO tasks (id, type, description, status)
                    VALUES (?, 'shell', 'Queued task ${i}', 'pending')
                `, [i]);
            }

            const queueDepth = await monitorServer.getQueueDepth();

            expect(queueDepth.pending).toBe(10);
            expect(queueDepth.running).toBe(0);
        });

        it('should detect stuck tasks', async () => {
            // Insert task that has been running for too long
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, started_at)
                VALUES (1, 'shell', 'Stuck task', 'running', datetime('now', '-2 hours'))
            `);

            const stuckTasks = await monitorServer.detectStuckTasks(3600); // 1 hour threshold

            expect(stuckTasks.length).toBe(1);
            expect(stuckTasks[0].id).toBe(1);
        });

        it('should monitor resource usage', async () => {
            const resourceUsage = await monitorServer.getResourceUsage();

            expect(resourceUsage).toHaveProperty('cpu_percent');
            expect(resourceUsage).toHaveProperty('memory_percent');
            expect(resourceUsage).toHaveProperty('disk_usage');
            expect(resourceUsage).toHaveProperty('network_io');
        });
    });

    describe('Historical Data', () => {
        beforeEach(async () => {
            await monitorServer.initialize();
        });

        it('should provide task execution history', async () => {
            // Insert historical tasks
            mockDb.run(`
                INSERT INTO tasks (type, description, status, created_at, finished_at)
                VALUES 
                    ('shell', 'Task 1', 'completed', datetime('now', '-1 day'), datetime('now', '-1 day', '+5 minutes')),
                    ('shell', 'Task 2', 'completed', datetime('now', '-2 days'), datetime('now', '-2 days', '+3 minutes')),
                    ('llm', 'Task 3', 'failed', datetime('now', '-3 days'), datetime('now', '-3 days', '+1 minute'))
            `);

            const history = await monitorServer.getTaskHistory(7); // Last 7 days

            expect(history.length).toBe(3);
            expect(history[0]).toHaveProperty('execution_time');
        });

        it('should calculate performance trends', async () => {
            // Insert tasks over time with varying performance
            const tasks = [
                { time: '-7 days', duration: 300 },
                { time: '-6 days', duration: 280 },
                { time: '-5 days', duration: 320 },
                { time: '-4 days', duration: 290 },
                { time: '-3 days', duration: 310 },
                { time: '-2 days', duration: 275 },
                { time: '-1 day', duration: 285 }
            ];

            tasks.forEach((task, index) => {
                mockDb.run(`
                    INSERT INTO tasks (id, type, description, status, started_at, finished_at)
                    VALUES (?, 'shell', 'Performance task', 'completed', 
                           datetime('now', ?), datetime('now', ?, '+${task.duration} seconds'))
                `, [index + 1, task.time, task.time]);
            });

            const trends = await monitorServer.getPerformanceTrends('shell', 7);

            expect(trends).toHaveProperty('average_execution_time');
            expect(trends).toHaveProperty('trend_direction'); // 'improving', 'degrading', or 'stable'
            expect(trends).toHaveProperty('success_rate');
        });

        it('should generate performance reports', async () => {
            mockDb.run(`
                INSERT INTO tasks (type, description, status, created_at, finished_at)
                VALUES
                    ('shell', 'Report task 1', 'completed', datetime('now', '-1 day'), datetime('now', '-1 day', '+2 minutes')),
                    ('shell', 'Report task 2', 'completed', datetime('now', '-1 day'), datetime('now', '-1 day', '+3 minutes')),
                    ('llm', 'Report task 3', 'failed', datetime('now', '-1 day'), datetime('now', '-1 day', '+1 minute'))
            `);



            const report = await monitorServer.generatePerformanceReport(1); // Last 1 day

            expect(report).toHaveProperty('summary');
            expect(report).toHaveProperty('task_types');
            expect(report).toHaveProperty('performance_metrics');
            expect(report.summary.total_tasks).toBe(3);
        });
    });

    describe('Health Monitoring', () => {
        beforeEach(async () => {
            await monitorServer.initialize();
        });

        it('should check system health', async () => {
            const health = await monitorServer.checkSystemHealth();

            expect(health).toHaveProperty('status'); // 'healthy', 'warning', 'critical'
            expect(health).toHaveProperty('checks');
            expect(health).toHaveProperty('timestamp');
        });

        it('should monitor database health', async () => {
            const dbHealth = await monitorServer.checkDatabaseHealth();

            expect(dbHealth).toHaveProperty('connection_status');
            expect(dbHealth).toHaveProperty('query_performance');
            expect(dbHealth).toHaveProperty('table_sizes');
        });

        it('should provide uptime statistics', async () => {
            const uptime = await monitorServer.getUptimeStats();

            expect(uptime).toHaveProperty('server_uptime');
            expect(uptime).toHaveProperty('last_restart');
            expect(uptime).toHaveProperty('availability_percentage');
        });
    });

    describe('Configuration and Management', () => {
        it('should configure monitoring thresholds', async () => {
            const thresholds = {
                max_execution_time: 3600, // 1 hour
                max_queue_depth: 100,
                min_success_rate: 0.95,
                max_memory_usage: 0.8
            };

            await monitorServer.setThresholds(thresholds);

            const currentThresholds = await monitorServer.getThresholds();
            expect(currentThresholds.max_execution_time).toBe(3600);
        });

        it('should enable/disable specific monitors', async () => {
            await monitorServer.enableMonitor('performance_tracking');
            await monitorServer.disableMonitor('resource_monitoring');

            const status = await monitorServer.getMonitorStatus();
            expect(status.performance_tracking).toBe(true);
            expect(status.resource_monitoring).toBe(false);
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await monitorServer.initialize();
        });

        it('should handle database errors gracefully', async () => {
            mockGetDatabase.mockImplementationOnce(() => {
                throw new Error('Database connection failed');
            });

            const result = await monitorServer.getSystemMetrics();

            expect(result.error).toContain('Database connection failed');
        });

        it('should handle WebSocket errors', async () => {
            const connectionHandler = mockWebSocketServer.on.mock.calls.find(
                call => call[0] === 'connection'
            )?.[1];

            if (connectionHandler) {
                connectionHandler(mockWebSocket);
            }

            const errorHandler = mockWebSocket.on.mock.calls.find(
                call => call[0] === 'error'
            )?.[1];

            if (errorHandler) {
                errorHandler(new Error('WebSocket error'));
            }

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('WebSocket error')
            );
        });
    });

    describe('Shutdown', () => {
        it('should shutdown gracefully', async () => {
            await monitorServer.initialize();
            await monitorServer.shutdown();

            expect(mockWebSocketServer.close).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Monitor server shutdown')
            );
        });

        it('should handle shutdown errors', async () => {
            await monitorServer.initialize();
            
            mockWebSocketServer.close.mockImplementationOnce(() => {
                throw new Error('Shutdown error');
            });

            await monitorServer.shutdown();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error during shutdown')
            );
        });
    });
});
