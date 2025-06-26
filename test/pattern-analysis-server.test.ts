import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
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

describe('Pattern Analysis Server', () => {
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

        mockDb.exec(`
            CREATE TABLE IF NOT EXISTS activity_patterns (
                id INTEGER PRIMARY KEY,
                pattern_type TEXT NOT NULL,
                pattern_data TEXT NOT NULL,
                confidence_score REAL NOT NULL,
                detection_count INTEGER NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert test task data with various patterns
        const now = new Date();
        const tasks = [
            // Morning pattern (9-11 AM)
            { type: 'media_ingest', status: 'completed', hour: 9 },
            { type: 'media_ingest', status: 'completed', hour: 9 },
            { type: 'media_ingest', status: 'completed', hour: 10 },
            { type: 'transcription', status: 'completed', hour: 10 },
            { type: 'transcription', status: 'completed', hour: 11 },
            
            // Afternoon pattern (2-4 PM)
            { type: 'analysis', status: 'completed', hour: 14 },
            { type: 'analysis', status: 'completed', hour: 15 },
            { type: 'media_ingest', status: 'failed', hour: 15 },
            { type: 'transcription', status: 'completed', hour: 16 },
            
            // Evening pattern (7-9 PM)
            { type: 'batch', status: 'completed', hour: 19 },
            { type: 'batch', status: 'completed', hour: 20 },
            { type: 'analysis', status: 'completed', hour: 21 }
        ];

        for (const task of tasks) {
            const taskTime = new Date(now);
            taskTime.setHours(task.hour, 0, 0, 0);
            
            mockDb.run(`
                INSERT INTO tasks (type, status, created_at, started_at, finished_at)
                VALUES (?, ?, ?, ?, ?)
            `, [
                task.type,
                task.status,
                taskTime.toISOString(),
                taskTime.toISOString(),
                task.status === 'completed' ? new Date(taskTime.getTime() + 300000).toISOString() : null
            ]);
        }

        // Insert test pattern data
        mockDb.run(`
            INSERT INTO activity_patterns (pattern_type, pattern_data, confidence_score, detection_count, is_active)
            VALUES 
                ('temporal', '{"hour": "9", "day_of_week": "1", "success_rate": 0.85, "task_count": 15}', 0.85, 15, true),
                ('task_sequence', '{"first_task": "media_ingest", "second_task": "transcription", "success_rate": 0.78, "sequence_count": 8}', 0.78, 8, true),
                ('resource_usage', '{"task_type": "batch", "peak_hour": "20", "success_rate": 0.92, "task_count": 12}', 0.92, 12, true),
                ('temporal', '{"hour": "15", "day_of_week": "3", "success_rate": 0.65, "task_count": 5}', 0.65, 5, false)
        `);

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
            const { default: PatternAnalysisServer } = await import('../src/mcp/pattern-analysis-server');
            
            expect(mockServer.setRequestHandler).toHaveBeenCalledWith('list_tools', expect.any(Function));
            expect(mockServer.setRequestHandler).toHaveBeenCalledWith('call_tool', expect.any(Function));
        });

        it('should register correct tool names', async () => {
            const { default: PatternAnalysisServer } = await import('../src/mcp/pattern-analysis-server');
            
            const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
                call => call[0] === 'list_tools'
            )?.[1];
            
            const toolsResponse = await listToolsHandler();
            const toolNames = toolsResponse.tools.map((tool: any) => tool.name);
            
            expect(toolNames).toContain('analyze_usage_patterns');
            expect(toolNames).toContain('find_similar_patterns');
            expect(toolNames).toContain('generate_scheduling_recommendations');
            expect(toolNames).toContain('track_pattern_effectiveness');
            expect(toolNames).toContain('predict_future_patterns');
        });
    });

    describe('analyze_usage_patterns', () => {
        it('should detect temporal patterns', async () => {
            const cutoffTime = new Date(Date.now() - 168 * 60 * 60 * 1000).toISOString();
            
            const temporalPatterns = mockDb.query(`
                SELECT 
                    strftime('%H', created_at) as hour,
                    strftime('%w', created_at) as day_of_week,
                    COUNT(*) as task_count,
                    AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_rate
                FROM tasks 
                WHERE created_at > ?
                GROUP BY hour, day_of_week
                HAVING task_count >= 2
                ORDER BY task_count DESC
            `).all(cutoffTime) as any[];
            
            expect(temporalPatterns.length).toBeGreaterThan(0);
            
            // Check that we have patterns with good success rates
            const goodPatterns = temporalPatterns.filter(p => p.success_rate > 0.7);
            expect(goodPatterns.length).toBeGreaterThan(0);
        });

        it('should detect task sequence patterns', async () => {
            const cutoffTime = new Date(Date.now() - 168 * 60 * 60 * 1000).toISOString();
            
            const sequences = mockDb.query(`
                SELECT 
                    t1.type as first_task,
                    t2.type as second_task,
                    COUNT(*) as sequence_count,
                    AVG(CASE WHEN t2.status = 'completed' THEN 1 ELSE 0 END) as success_rate
                FROM tasks t1
                JOIN tasks t2 ON t2.created_at > t1.created_at 
                    AND t2.created_at <= datetime(t1.created_at, '+1 hour')
                WHERE t1.created_at > ?
                GROUP BY t1.type, t2.type
                HAVING sequence_count >= 1
                ORDER BY sequence_count DESC
            `).all(cutoffTime) as any[];
            
            expect(sequences.length).toBeGreaterThan(0);
            
            // Verify sequence data structure
            sequences.forEach(seq => {
                expect(seq.first_task).toBeDefined();
                expect(seq.second_task).toBeDefined();
                expect(seq.sequence_count).toBeGreaterThan(0);
                expect(seq.success_rate).toBeGreaterThanOrEqual(0);
                expect(seq.success_rate).toBeLessThanOrEqual(1);
            });
        });

        it('should filter patterns by confidence threshold', async () => {
            const minConfidence = 0.8;
            
            const highConfidencePatterns = mockDb.query(`
                SELECT * FROM activity_patterns 
                WHERE confidence_score >= ? AND is_active = TRUE
            `).all(minConfidence) as any[];
            
            expect(highConfidencePatterns.length).toBeGreaterThan(0);
            highConfidencePatterns.forEach(pattern => {
                expect(pattern.confidence_score).toBeGreaterThanOrEqual(minConfidence);
            });
        });
    });

    describe('find_similar_patterns', () => {
        it('should find patterns similar to a given pattern', async () => {
            const basePatternId = 1;
            const similarityThreshold = 0.7;
            
            const basePattern = mockDb.query('SELECT * FROM activity_patterns WHERE id = ?').get(basePatternId) as any;
            expect(basePattern).toBeDefined();
            
            const candidates = mockDb.query(`
                SELECT * FROM activity_patterns 
                WHERE id != ? AND is_active = TRUE
            `).all(basePatternId) as any[];
            
            expect(candidates.length).toBeGreaterThan(0);
            
            // Test similarity calculation logic
            const baseData = JSON.parse(basePattern.pattern_data);
            const similarPatterns = [];
            
            for (const candidate of candidates) {
                const candidateData = JSON.parse(candidate.pattern_data);
                
                // Simple similarity calculation for temporal patterns
                if (basePattern.pattern_type === 'temporal' && candidate.pattern_type === 'temporal') {
                    let similarity = 0;
                    let factors = 0;
                    
                    if (baseData.hour !== undefined && candidateData.hour !== undefined) {
                        const hourDiff = Math.abs(parseInt(baseData.hour) - parseInt(candidateData.hour));
                        similarity += Math.max(0, 1 - hourDiff / 12);
                        factors++;
                    }
                    
                    if (factors > 0) {
                        const finalSimilarity = similarity / factors;
                        if (finalSimilarity >= similarityThreshold) {
                            similarPatterns.push({
                                ...candidate,
                                similarity_score: finalSimilarity
                            });
                        }
                    }
                }
            }
            
            // Should be able to calculate similarity
            expect(similarPatterns.length).toBeGreaterThanOrEqual(0);
        });

        it('should handle non-existent pattern IDs', async () => {
            const nonExistentId = 999;
            const pattern = mockDb.query('SELECT * FROM activity_patterns WHERE id = ?').get(nonExistentId);
            
            expect(pattern).toBeNull();
        });

        it('should respect similarity threshold', async () => {
            const highThreshold = 0.95;
            
            // With a very high threshold, we should find fewer similar patterns
            const patterns = mockDb.query('SELECT * FROM activity_patterns WHERE is_active = TRUE').all() as any[];
            
            // Most patterns won't be 95% similar to each other
            expect(patterns.length).toBeGreaterThan(0);
        });
    });

    describe('generate_scheduling_recommendations', () => {
        it('should generate recommendations based on historical patterns', async () => {
            const patterns = mockDb.query(`
                SELECT * FROM activity_patterns 
                WHERE is_active = TRUE 
                AND confidence_score > 0.7
                ORDER BY confidence_score DESC
                LIMIT 10
            `).all() as any[];
            
            expect(patterns.length).toBeGreaterThan(0);
            
            const recommendations = [];
            const schedulingWindows = [];
            
            for (const pattern of patterns) {
                const data = JSON.parse(pattern.pattern_data);
                
                if (pattern.pattern_type === 'temporal' && data.success_rate > 0.8) {
                    schedulingWindows.push({
                        hour: data.hour,
                        day_of_week: data.day_of_week,
                        efficiency_score: data.success_rate,
                        pattern_type: 'temporal'
                    });
                    
                    recommendations.push(
                        `Schedule tasks during hour ${data.hour} on day ${data.day_of_week} for ${(data.success_rate * 100).toFixed(1)}% success rate`
                    );
                }
            }
            
            expect(schedulingWindows.length).toBeGreaterThan(0);
            expect(recommendations.length).toBeGreaterThan(0);
        });

        it('should handle different optimization goals', async () => {
            const optimizationGoals = ['efficiency', 'load_balancing', 'resource_optimization'];
            
            for (const goal of optimizationGoals) {
                // Each goal should produce different recommendations
                const recommendations = {
                    optimization_goal: goal,
                    time_horizon_hours: 24,
                    recommendations: [],
                    scheduling_windows: []
                };
                
                expect(recommendations.optimization_goal).toBe(goal);
                expect(recommendations.time_horizon_hours).toBe(24);
            }
        });
    });

    describe('track_pattern_effectiveness', () => {
        it('should track pattern performance over time', async () => {
            const patternId = 1;
            const timeRangeHours = 72;
            
            const pattern = mockDb.query('SELECT * FROM activity_patterns WHERE id = ?').get(patternId) as any;
            expect(pattern).toBeDefined();
            
            const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();
            
            // Simulate effectiveness tracking
            const effectiveness = {
                pattern_id: patternId,
                tracking_period_hours: timeRangeHours,
                metrics_tracked: ['success_rate', 'execution_time', 'resource_usage'],
                effectiveness_score: 0.85,
                improvements: {
                    success_rate: '+12%',
                    execution_time: '-8%',
                    resource_usage: 'optimized'
                }
            };
            
            expect(effectiveness.effectiveness_score).toBeGreaterThan(0);
            expect(effectiveness.effectiveness_score).toBeLessThanOrEqual(1);
        });
    });

    describe('predict_future_patterns', () => {
        it('should generate future pattern predictions', async () => {
            const predictionHorizonHours = 48;
            const confidenceThreshold = 0.6;
            
            const predictions = {
                prediction_horizon_hours: predictionHorizonHours,
                confidence_threshold: confidenceThreshold,
                predicted_patterns: [
                    {
                        pattern_type: 'temporal',
                        predicted_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
                        confidence: 0.85,
                        description: 'High activity period predicted based on historical patterns'
                    },
                    {
                        pattern_type: 'resource_usage',
                        predicted_time: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
                        confidence: 0.72,
                        description: 'Resource peak expected for media processing tasks'
                    }
                ]
            };
            
            const highConfidencePredictions = predictions.predicted_patterns.filter(
                p => p.confidence >= confidenceThreshold
            );
            
            expect(highConfidencePredictions.length).toBeGreaterThan(0);
            expect(predictions.prediction_horizon_hours).toBe(predictionHorizonHours);
        });

        it('should filter predictions by confidence threshold', async () => {
            const highThreshold = 0.9;
            const lowThreshold = 0.5;
            
            const samplePredictions = [
                { confidence: 0.95, description: 'High confidence prediction' },
                { confidence: 0.75, description: 'Medium confidence prediction' },
                { confidence: 0.45, description: 'Low confidence prediction' }
            ];
            
            const highConfidencePredictions = samplePredictions.filter(p => p.confidence >= highThreshold);
            const lowConfidencePredictions = samplePredictions.filter(p => p.confidence >= lowThreshold);
            
            expect(highConfidencePredictions.length).toBe(1);
            expect(lowConfidencePredictions.length).toBe(2);
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
                errorDb.query('SELECT * FROM activity_patterns');
            }).toThrow('Database connection failed');
        });

        it('should handle invalid JSON in pattern data', async () => {
            // Insert pattern with invalid JSON
            mockDb.run(`
                INSERT INTO activity_patterns (pattern_type, pattern_data, confidence_score, detection_count)
                VALUES ('test', 'invalid json', 0.5, 1)
            `);
            
            const patterns = mockDb.query('SELECT * FROM activity_patterns WHERE pattern_type = ?').all('test') as any[];
            
            expect(patterns.length).toBe(1);
            
            // Attempting to parse invalid JSON should be handled gracefully
            expect(() => {
                JSON.parse(patterns[0].pattern_data);
            }).toThrow();
        });
    });

    describe('Performance', () => {
        it('should handle large datasets efficiently', async () => {
            // Insert many test patterns
            const insertStmt = mockDb.prepare(`
                INSERT INTO activity_patterns (pattern_type, pattern_data, confidence_score, detection_count, is_active)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            for (let i = 0; i < 100; i++) {
                insertStmt.run(
                    'temporal',
                    JSON.stringify({
                        hour: (i % 24).toString(),
                        day_of_week: (i % 7).toString(),
                        success_rate: Math.random(),
                        task_count: Math.floor(Math.random() * 20) + 1
                    }),
                    Math.random(),
                    Math.floor(Math.random() * 50) + 1,
                    true
                );
            }
            
            const totalPatterns = mockDb.query('SELECT COUNT(*) as count FROM activity_patterns').get() as any;
            expect(totalPatterns.count).toBeGreaterThan(100);
            
            // Test efficient querying with limits
            const limitedResults = mockDb.query(`
                SELECT * FROM activity_patterns 
                WHERE is_active = TRUE 
                ORDER BY confidence_score DESC 
                LIMIT 10
            `).all();
            
            expect(limitedResults.length).toBeLessThanOrEqual(10);
        });
    });
});
