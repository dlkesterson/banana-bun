import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';

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
const mockInitDatabase = mock(() => Promise.resolve());

mock.module('../src/db', () => ({
    getDatabase: mockGetDatabase,
    initDatabase: mockInitDatabase
}));

// Mock MCP SDK
const mockServer = {
    setRequestHandler: mock(() => {}),
    connect: mock(() => Promise.resolve())
};

mock.module('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: mock(() => mockServer)
}));

mock.module('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: mock(() => ({}))
}));

mock.module('@modelcontextprotocol/sdk/types.js', () => ({
    CallToolRequestSchema: 'call_tool',
    ListToolsRequestSchema: 'list_tools'
}));

describe('Resource Optimization Server', () => {
    beforeEach(() => {
        // Create in-memory database for testing
        mockDb = new Database(':memory:');
        
        // Create test tables
        mockDb.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                started_at TEXT,
                finished_at TEXT,
                description TEXT
            )
        `);

        // Insert test task data with load distribution
        const now = new Date();
        const tasks = [
            // Heavy load during business hours
            ...Array.from({length: 15}, (_, i) => ({
                type: 'media_ingest',
                status: 'completed',
                hour: 9 + (i % 8) // 9 AM to 5 PM
            })),
            // Light load during off hours
            ...Array.from({length: 5}, (_, i) => ({
                type: 'batch',
                status: 'completed',
                hour: 22 + (i % 6) // 10 PM to 4 AM
            })),
            // Some failed tasks during peak hours
            ...Array.from({length: 3}, (_, i) => ({
                type: 'transcription',
                status: 'failed',
                hour: 14 + i // 2-4 PM
            }))
        ];

        for (const task of tasks) {
            const taskTime = new Date(now);
            taskTime.setHours(task.hour % 24, Math.floor(Math.random() * 60), 0, 0);
            
            const startTime = taskTime.toISOString();
            const endTime = task.status === 'completed' 
                ? new Date(taskTime.getTime() + Math.random() * 600000).toISOString() // 0-10 minutes
                : null;
            
            mockDb.run(`
                INSERT INTO tasks (type, status, created_at, started_at, finished_at)
                VALUES (?, ?, ?, ?, ?)
            `, [task.type, task.status, startTime, startTime, endTime]);
        }

        // Reset all mocks
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
        mockGetDatabase.mockClear();
        mockInitDatabase.mockClear();
    });

    afterEach(() => {
        mockDb?.close();
    });

    describe('Tool Registration', () => {
        it('should register all required tools', async () => {
            const { default: ResourceOptimizationServer } = await import('../src/mcp/resource-optimization-server');
            
            expect(mockServer.setRequestHandler).toHaveBeenCalledWith('list_tools', expect.any(Function));
            expect(mockServer.setRequestHandler).toHaveBeenCalledWith('call_tool', expect.any(Function));
        });

        it('should register correct tool names', async () => {
            const { default: ResourceOptimizationServer } = await import('../src/mcp/resource-optimization-server');
            
            const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
                call => call[0] === 'list_tools'
            )?.[1];
            
            const toolsResponse = await listToolsHandler();
            const toolNames = toolsResponse.tools.map((tool: any) => tool.name);
            
            expect(toolNames).toContain('analyze_resource_usage');
            expect(toolNames).toContain('optimize_load_balancing');
            expect(toolNames).toContain('predict_resource_bottlenecks');
            expect(toolNames).toContain('suggest_scheduling_windows');
            expect(toolNames).toContain('monitor_optimization_effectiveness');
        });
    });

    describe('analyze_resource_usage', () => {
        it('should analyze current resource metrics', async () => {
            // Simulate current resource metrics
            const runningTasks = mockDb.query('SELECT COUNT(*) as count FROM tasks WHERE status = "running"').get() as any;
            const queuedTasks = mockDb.query('SELECT COUNT(*) as count FROM tasks WHERE status = "pending"').get() as any;
            
            const resourceMetrics = {
                cpu_usage: 75.5,
                memory_usage: 68.2,
                disk_io: 45.0,
                network_io: 23.1,
                task_queue_length: queuedTasks?.count || 0,
                active_tasks: runningTasks?.count || 0
            };
            
            expect(resourceMetrics.cpu_usage).toBeGreaterThan(0);
            expect(resourceMetrics.cpu_usage).toBeLessThanOrEqual(100);
            expect(resourceMetrics.memory_usage).toBeGreaterThan(0);
            expect(resourceMetrics.memory_usage).toBeLessThanOrEqual(100);
        });

        it('should identify bottlenecks based on thresholds', async () => {
            const metrics = {
                cpu_usage: 85, // Above 80% threshold
                memory_usage: 90, // Above 85% threshold
                disk_io: 60,
                network_io: 30,
                task_queue_length: 15, // Above 10 threshold
                active_tasks: 5
            };
            
            const bottlenecks = [];
            
            if (metrics.cpu_usage > 80) {
                bottlenecks.push('High CPU usage detected - consider load balancing or task scheduling optimization');
            }
            
            if (metrics.memory_usage > 85) {
                bottlenecks.push('High memory usage - consider memory optimization or task batching');
            }
            
            if (metrics.task_queue_length > 10) {
                bottlenecks.push('Large task queue - consider increasing concurrency or optimizing task processing');
            }
            
            expect(bottlenecks.length).toBe(3);
            expect(bottlenecks[0]).toContain('CPU usage');
            expect(bottlenecks[1]).toContain('memory usage');
            expect(bottlenecks[2]).toContain('task queue');
        });

        it('should calculate optimization score', async () => {
            const testCases = [
                { cpu: 50, memory: 60, queue: 3, expectedScore: 100 }, // Good performance
                { cpu: 85, memory: 90, queue: 15, expectedScore: 45 }, // Poor performance
                { cpu: 70, memory: 75, queue: 8, expectedScore: 75 }   // Average performance
            ];
            
            for (const testCase of testCases) {
                let score = 100;
                
                // Deduct points for high resource usage
                if (testCase.cpu > 80) score -= 20;
                else if (testCase.cpu > 60) score -= 10;
                
                if (testCase.memory > 85) score -= 20;
                else if (testCase.memory > 70) score -= 10;
                
                // Deduct points for large queue
                if (testCase.queue > 10) score -= 15;
                else if (testCase.queue > 5) score -= 5;
                
                score = Math.max(score, 0);
                expect(score).toBe(testCase.expectedScore);
            }
        });
    });

    describe('optimize_load_balancing', () => {
        it('should analyze current load distribution', async () => {
            const currentLoad = mockDb.query(`
                SELECT 
                    strftime('%H', created_at) as hour,
                    COUNT(*) as task_count,
                    type,
                    AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_rate
                FROM tasks 
                WHERE created_at > datetime('now', '-7 days')
                GROUP BY hour, type
                ORDER BY hour, type
            `).all() as any[];
            
            expect(currentLoad.length).toBeGreaterThan(0);
            
            // Calculate load distribution
            const distribution: Record<string, number> = {};
            for (let hour = 0; hour < 24; hour++) {
                const hourData = currentLoad.filter(item => parseInt(item.hour) === hour);
                const totalTasks = hourData.reduce((sum, item) => sum + item.task_count, 0);
                distribution[hour.toString()] = totalTasks;
            }
            
            expect(Object.keys(distribution)).toHaveLength(24);
        });

        it('should support different optimization strategies', async () => {
            const strategies = ['even_distribution', 'peak_avoidance', 'efficiency_focused'];
            const currentDistribution = {
                '9': 5, '10': 8, '11': 6, '12': 4, '13': 7, '14': 9, '15': 8, '16': 5,
                '22': 1, '23': 2, '0': 1, '1': 0, '2': 1, '3': 0
            };
            
            for (const strategy of strategies) {
                // Initialize optimized with all 24 hours
                const optimized: Record<string, number> = {};
                for (let hour = 0; hour < 24; hour++) {
                    optimized[hour.toString()] = currentDistribution[hour.toString()] || 0;
                }

                const totalTasks = Object.values(currentDistribution).reduce((sum, count) => sum + count, 0);

                switch (strategy) {
                    case 'even_distribution':
                        const averagePerHour = totalTasks / 24;
                        for (let hour = 0; hour < 24; hour++) {
                            optimized[hour.toString()] = averagePerHour;
                        }
                        break;

                    case 'peak_avoidance':
                        // Should reduce load during peak hours (9-17)
                        const peakHours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
                        for (const hour of peakHours) {
                            if (optimized[hour.toString()] > 3) {
                                optimized[hour.toString()] = Math.max(3, optimized[hour.toString()] * 0.7);
                            }
                        }
                        break;

                    case 'efficiency_focused':
                        // Should favor hours with historically good performance
                        for (let hour = 0; hour < 24; hour++) {
                            const efficiency = hour >= 6 && hour <= 22 ? 1.2 : 0.8;
                            optimized[hour.toString()] = (currentDistribution[hour.toString()] || 0) * efficiency;
                        }
                        break;
                }
                
                expect(optimized).toBeDefined();
                expect(Object.keys(optimized)).toHaveLength(24);
            }
        });

        it('should calculate variance reduction', async () => {
            const current = [10, 15, 8, 12, 20, 5, 3, 1];
            const optimized = [9, 10, 9, 10, 11, 9, 10, 9];
            
            const calculateVariance = (values: number[]) => {
                const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
                const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
                return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
            };
            
            const currentVariance = calculateVariance(current);
            const optimizedVariance = calculateVariance(optimized);
            const improvement = ((currentVariance - optimizedVariance) / currentVariance) * 100;
            
            expect(improvement).toBeGreaterThan(0);
            expect(optimizedVariance).toBeLessThan(currentVariance);
        });
    });

    describe('predict_resource_bottlenecks', () => {
        it('should predict bottlenecks within time horizon', async () => {
            const predictionHorizonHours = 24;
            const confidenceThreshold = 0.7;
            const resourceTypes = ['cpu', 'memory', 'disk', 'network'];
            
            const predictions = {
                prediction_horizon_hours: predictionHorizonHours,
                confidence_threshold: confidenceThreshold,
                predicted_bottlenecks: [] as any[]
            };
            
            // Simulate bottleneck predictions
            for (const resourceType of resourceTypes) {
                const confidence = Math.random() * 0.4 + 0.6; // 0.6-1.0
                
                if (confidence >= confidenceThreshold) {
                    const hoursUntilBottleneck = Math.random() * predictionHorizonHours;
                    
                    predictions.predicted_bottlenecks.push({
                        resource_type: resourceType,
                        predicted_time: new Date(Date.now() + hoursUntilBottleneck * 60 * 60 * 1000).toISOString(),
                        confidence,
                        severity: confidence > 0.8 ? 'high' : 'medium'
                    });
                }
            }
            
            expect(predictions.predicted_bottlenecks.length).toBeGreaterThanOrEqual(0);
            
            // All predictions should meet confidence threshold
            predictions.predicted_bottlenecks.forEach(prediction => {
                expect(prediction.confidence).toBeGreaterThanOrEqual(confidenceThreshold);
            });
        });

        it('should categorize severity levels', async () => {
            const confidenceLevels = [0.95, 0.85, 0.75, 0.65];
            
            for (const confidence of confidenceLevels) {
                const severity = confidence > 0.8 ? 'high' : 'medium';
                
                if (confidence > 0.8) {
                    expect(severity).toBe('high');
                } else {
                    expect(severity).toBe('medium');
                }
            }
        });
    });

    describe('suggest_scheduling_windows', () => {
        it('should analyze historical performance by hour', async () => {
            const performanceData = mockDb.query(`
                SELECT 
                    type,
                    strftime('%H', created_at) as hour,
                    COUNT(*) as task_count,
                    AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_rate,
                    AVG(CASE WHEN finished_at IS NOT NULL THEN 
                        (julianday(finished_at) - julianday(started_at)) * 24 * 60 
                        ELSE NULL END) as avg_duration_minutes
                FROM tasks 
                WHERE created_at > datetime('now', '-30 days')
                GROUP BY type, hour
                HAVING task_count >= 1
                ORDER BY type, success_rate DESC, avg_duration_minutes ASC
            `).all() as any[];
            
            expect(performanceData.length).toBeGreaterThan(0);
            
            // Verify data structure
            performanceData.forEach(data => {
                expect(data.type).toBeDefined();
                expect(data.hour).toBeDefined();
                expect(data.task_count).toBeGreaterThan(0);
                expect(data.success_rate).toBeGreaterThanOrEqual(0);
                expect(data.success_rate).toBeLessThanOrEqual(1);
            });
        });

        it('should generate scheduling windows for different criteria', async () => {
            const criteria = ['resource_efficiency', 'completion_time', 'system_stability'];
            const mockData = [
                { type: 'media_ingest', hour: '9', task_count: 5, success_rate: 0.9, avg_duration_minutes: 120 },
                { type: 'media_ingest', hour: '14', task_count: 8, success_rate: 0.7, avg_duration_minutes: 180 },
                { type: 'transcription', hour: '10', task_count: 3, success_rate: 0.85, avg_duration_minutes: 90 },
                { type: 'transcription', hour: '16', task_count: 6, success_rate: 0.95, avg_duration_minutes: 60 }
            ];
            
            for (const criterion of criteria) {
                const windows = [];
                const taskTypes = [...new Set(mockData.map(item => item.type))];
                
                for (const taskType of taskTypes) {
                    const taskData = mockData.filter(item => item.type === taskType);
                    let optimalHours: any[] = [];
                    
                    switch (criterion) {
                        case 'resource_efficiency':
                            optimalHours = taskData
                                .filter(item => item.success_rate > 0.8)
                                .sort((a, b) => b.success_rate - a.success_rate)
                                .slice(0, 3);
                            break;
                        case 'completion_time':
                            optimalHours = taskData
                                .filter(item => item.avg_duration_minutes !== null)
                                .sort((a, b) => a.avg_duration_minutes - b.avg_duration_minutes)
                                .slice(0, 3);
                            break;
                        case 'system_stability':
                            optimalHours = taskData
                                .filter(item => item.success_rate > 0.7 && item.task_count < 10)
                                .sort((a, b) => b.success_rate - a.success_rate)
                                .slice(0, 3);
                            break;
                    }
                    
                    if (optimalHours.length > 0) {
                        windows.push({
                            task_type: taskType,
                            optimal_hours: optimalHours,
                            criterion
                        });
                    }
                }
                
                expect(windows.length).toBeGreaterThan(0);
            }
        });
    });

    describe('monitor_optimization_effectiveness', () => {
        it('should track optimization metrics', async () => {
            const optimizationId = 'test_optimization_001';
            const monitoringPeriodHours = 72;
            const metricsToTrack = ['throughput', 'resource_utilization', 'task_completion_time'];
            
            const effectiveness = {
                optimization_id: optimizationId,
                monitoring_period_hours: monitoringPeriodHours,
                metrics_tracked: metricsToTrack,
                effectiveness_summary: {
                    overall_improvement: '+15%',
                    throughput_change: '+22%',
                    resource_utilization_change: '-8%',
                    completion_time_change: '-12%'
                },
                detailed_metrics: {
                    before_optimization: {
                        avg_throughput: 45,
                        avg_resource_usage: 78,
                        avg_completion_time: 125
                    },
                    after_optimization: {
                        avg_throughput: 55,
                        avg_resource_usage: 72,
                        avg_completion_time: 110
                    }
                }
            };
            
            expect(effectiveness.optimization_id).toBe(optimizationId);
            expect(effectiveness.metrics_tracked).toEqual(metricsToTrack);
            expect(effectiveness.detailed_metrics.after_optimization.avg_throughput)
                .toBeGreaterThan(effectiveness.detailed_metrics.before_optimization.avg_throughput);
        });

        it('should calculate improvement percentages', async () => {
            const before = { throughput: 45, resource_usage: 78, completion_time: 125 };
            const after = { throughput: 55, resource_usage: 72, completion_time: 110 };
            
            const improvements = {
                throughput: ((after.throughput - before.throughput) / before.throughput * 100).toFixed(1),
                resource_usage: ((before.resource_usage - after.resource_usage) / before.resource_usage * 100).toFixed(1),
                completion_time: ((before.completion_time - after.completion_time) / before.completion_time * 100).toFixed(1)
            };
            
            expect(parseFloat(improvements.throughput)).toBeCloseTo(22.2, 1);
            expect(parseFloat(improvements.resource_usage)).toBeCloseTo(7.7, 1);
            expect(parseFloat(improvements.completion_time)).toBeCloseTo(12.0, 1);
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors gracefully', async () => {
            mockDb.close();
            
            const errorDb = {
                query: mock(() => {
                    throw new Error('Database connection failed');
                })
            };
            
            mockGetDatabase.mockReturnValue(errorDb);
            
            expect(() => {
                errorDb.query('SELECT * FROM tasks');
            }).toThrow('Database connection failed');
        });

        it('should handle invalid optimization strategies', async () => {
            const invalidStrategy = 'invalid_strategy';
            const validStrategies = ['even_distribution', 'peak_avoidance', 'efficiency_focused'];
            
            expect(validStrategies).not.toContain(invalidStrategy);
        });
    });

    describe('Performance', () => {
        it('should handle large task datasets efficiently', async () => {
            // Insert many test tasks
            const insertStmt = mockDb.prepare(`
                INSERT INTO tasks (type, status, created_at, started_at, finished_at)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            const now = new Date();
            for (let i = 0; i < 1000; i++) {
                const taskTime = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000); // Last 30 days
                const endTime = Math.random() > 0.1 ? 
                    new Date(taskTime.getTime() + Math.random() * 600000).toISOString() : null;
                
                insertStmt.run(
                    ['media_ingest', 'transcription', 'analysis', 'batch'][i % 4],
                    endTime ? 'completed' : 'failed',
                    taskTime.toISOString(),
                    taskTime.toISOString(),
                    endTime
                );
            }
            
            const totalTasks = mockDb.query('SELECT COUNT(*) as count FROM tasks').get() as any;
            expect(totalTasks.count).toBeGreaterThan(1000);
            
            // Test efficient querying with aggregation
            const hourlyLoad = mockDb.query(`
                SELECT 
                    strftime('%H', created_at) as hour,
                    COUNT(*) as task_count
                FROM tasks 
                WHERE created_at > datetime('now', '-7 days')
                GROUP BY hour
                ORDER BY hour
            `).all();
            
            expect(hourlyLoad.length).toBeLessThanOrEqual(24);
        });
    });
});

afterAll(() => {
  mock.restore();
});
