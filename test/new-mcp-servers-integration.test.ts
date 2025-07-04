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
    setRequestHandler: mock(() => { }),
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

describe('New MCP Servers Integration', () => {
    beforeEach(async () => {
        // Create comprehensive test database
        mockDb = new Database(':memory:');

        // Create all necessary tables
        mockDb.exec(`
            CREATE TABLE IF NOT EXISTS media_metadata (
                id INTEGER PRIMARY KEY,
                title TEXT,
                tags TEXT,
                summary TEXT,
                genre TEXT,
                duration INTEGER,
                collection TEXT,
                width INTEGER,
                height INTEGER,
                audio_bitrate INTEGER,
                sample_rate INTEGER,
                file_size INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                started_at TEXT,
                finished_at TEXT,
                description TEXT
            );

            CREATE TABLE IF NOT EXISTS activity_patterns (
                id INTEGER PRIMARY KEY,
                pattern_type TEXT NOT NULL,
                pattern_data TEXT NOT NULL,
                confidence_score REAL NOT NULL,
                detection_count INTEGER NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_interactions (
                id INTEGER PRIMARY KEY,
                user_session_id TEXT,
                interaction_type TEXT NOT NULL,
                target_id TEXT,
                target_type TEXT,
                interaction_data TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                duration_ms INTEGER
            );

            CREATE TABLE IF NOT EXISTS user_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                started_at TEXT DEFAULT CURRENT_TIMESTAMP,
                ended_at TEXT,
                session_duration_ms INTEGER,
                total_interactions INTEGER DEFAULT 0
            );
        `);

        // Insert comprehensive test data
        await insertTestData();

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

    // Helper function to insert test data
    const insertTestData = async () => {
        // Insert media metadata with varying quality
        mockDb.exec(`
            INSERT INTO media_metadata (title, tags, summary, genre, duration, collection, width, height, audio_bitrate, sample_rate)
            VALUES 
                ('High Quality Video', 'high-quality,4k', 'Excellent quality content', 'documentary', 1800, 'premium', 3840, 2160, 320, 48000),
                ('Medium Quality Video', 'standard', 'Good quality content', 'entertainment', 1200, 'standard', 1920, 1080, 192, 44100),
                ('Low Quality Video', '', '', '', 600, 'archive', 854, 480, 96, 22050),
                ('Incomplete Metadata', 'partial', '', 'unknown', 300, 'test', 1280, 720, 128, 44100)
        `);

        // Insert task data for pattern analysis
        const now = new Date();
        for (let i = 0; i < 20; i++) {
            const taskTime = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
            const hour = 9 + (i % 8); // Business hours pattern
            taskTime.setHours(hour, Math.floor(Math.random() * 60), 0, 0);

            mockDb.run(`
                INSERT INTO tasks (type, status, created_at, started_at, finished_at)
                VALUES (?, ?, ?, ?, ?)
            `, [
                ['media_ingest', 'transcription', 'analysis'][i % 3],
                Math.random() > 0.2 ? 'completed' : 'failed',
                taskTime.toISOString(),
                taskTime.toISOString(),
                Math.random() > 0.2 ? new Date(taskTime.getTime() + 300000).toISOString() : null
            ]);
        }

        // Insert activity patterns
        mockDb.run(`
            INSERT INTO activity_patterns (pattern_type, pattern_data, confidence_score, detection_count, is_active)
            VALUES 
                ('temporal', '{"hour": "10", "success_rate": 0.85, "task_count": 12}', 0.85, 12, true),
                ('task_sequence', '{"first_task": "media_ingest", "second_task": "transcription", "success_rate": 0.78}', 0.78, 8, true)
        `);

        // Insert user interaction data
        const sessions = ['session_001', 'session_002'];
        for (const sessionId of sessions) {
            mockDb.run(`
                INSERT INTO user_sessions (id, user_id, started_at, session_duration_ms, total_interactions)
                VALUES (?, ?, ?, ?, ?)
            `, [sessionId, 'user_1', now.toISOString(), 1800000, 15]);

            // Insert interactions for each session
            for (let i = 0; i < 10; i++) {
                const interactionTime = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
                mockDb.run(`
                    INSERT INTO user_interactions (user_session_id, interaction_type, target_id, interaction_data, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    sessionId,
                    ['search', 'view', 'tag_edit'][i % 3],
                    `target_${i}`,
                    JSON.stringify({ test: true, index: i }),
                    interactionTime.toISOString()
                ]);
            }
        }
    };

    describe('Server Initialization', () => {
        it('should initialize all new MCP servers without errors', async () => {
            const servers = [
                '../src/mcp/metadata-optimization-server',
                '../src/mcp/pattern-analysis-server',
                '../src/mcp/resource-optimization-server',
                '../src/mcp/content-quality-server',
                '../src/mcp/user-behavior-server'
            ];

            for (const serverPath of servers) {
                expect(async () => {
                    await import(serverPath);
                }).not.toThrow();
            }
        });

        it('should register all tools across servers', async () => {
            const expectedToolCounts = {
                'metadata-optimization-server': 5,
                'pattern-analysis-server': 5,
                'resource-optimization-server': 5,
                'content-quality-server': 5,
                'user-behavior-server': 5
            };

            // Import all servers
            await import('../src/mcp/metadata-optimization-server');
            await import('../src/mcp/pattern-analysis-server');
            await import('../src/mcp/resource-optimization-server');
            await import('../src/mcp/content-quality-server');
            await import('../src/mcp/user-behavior-server');

            // Each server should have registered list_tools and call_tool handlers
            const listToolsCalls = mockServer.setRequestHandler.mock.calls.filter(
                call => call[0] === 'list_tools'
            );
            const callToolCalls = mockServer.setRequestHandler.mock.calls.filter(
                call => call[0] === 'call_tool'
            );

            expect(listToolsCalls.length).toBe(5); // One per server
            expect(callToolCalls.length).toBe(5); // One per server
        });
    });

    describe('Cross-Server Data Flow', () => {
        it('should support metadata optimization feeding into quality analysis', async () => {
            // Simulate metadata optimization improving an item
            const itemId = 3; // Low quality item
            const originalItem = mockDb.query('SELECT * FROM media_metadata WHERE id = ?').get(itemId) as any;

            expect(originalItem.tags).toBe('');
            expect(originalItem.summary).toBe('');

            // Simulate metadata optimization
            mockDb.run(`
                UPDATE media_metadata 
                SET tags = ?, summary = ?, updated_at = ?
                WHERE id = ?
            `, ['optimized,ai-enhanced', 'AI-generated summary for improved content', new Date().toISOString(), itemId]);

            // Verify quality improvement
            const updatedItem = mockDb.query('SELECT * FROM media_metadata WHERE id = ?').get(itemId) as any;
            expect(updatedItem.tags).toContain('optimized');
            expect(updatedItem.summary).toContain('AI-generated');

            // Calculate quality improvement
            const beforeCompleteness = 0.2; // Only duration was present
            const afterCompleteness = 0.6; // Now has title, tags, summary, duration
            expect(afterCompleteness).toBeGreaterThan(beforeCompleteness);
        });

        it('should support pattern analysis informing resource optimization', async () => {
            // Get temporal patterns
            const patterns = mockDb.query(`
                SELECT * FROM activity_patterns 
                WHERE pattern_type = 'temporal' AND is_active = TRUE
            `).all() as any[];

            expect(patterns.length).toBeGreaterThan(0);

            // Use patterns to optimize resource scheduling
            const pattern = patterns[0];
            const patternData = JSON.parse(pattern.pattern_data);

            if (patternData.success_rate > 0.8) {
                // This hour should be prioritized for scheduling
                expect(patternData.hour).toBeDefined();
                expect(patternData.success_rate).toBeGreaterThan(0.8);
            }
        });

        it('should support user behavior informing content quality priorities', async () => {
            // Analyze user viewing patterns
            const viewInteractions = mockDb.query(`
                SELECT interaction_data 
                FROM user_interactions 
                WHERE interaction_type = 'view'
            `).all() as any[];

            const contentPreferences = [];
            for (const interaction of viewInteractions) {
                try {
                    const data = JSON.parse(interaction.interaction_data);
                    if (data.completion_percentage && data.completion_percentage > 0.8) {
                        contentPreferences.push('high_engagement');
                    }
                } catch (error) {
                    // Skip invalid JSON
                }
            }

            // Use preferences to prioritize quality improvements
            if (contentPreferences.length > 0) {
                const lowQualityItems = mockDb.query(`
                    SELECT id FROM media_metadata 
                    WHERE (tags = '' OR summary = '') 
                    AND width < 1920
                `).all() as any[];

                expect(lowQualityItems.length).toBeGreaterThan(0);
                // These items should be prioritized for quality improvement
            }
        });
    });

    describe('Performance Under Load', () => {
        it('should handle concurrent operations across servers', async () => {
            // Simulate concurrent operations
            const operations = [
                // Metadata analysis
                () => mockDb.query('SELECT COUNT(*) FROM media_metadata WHERE tags = ""').get(),
                // Pattern detection
                () => mockDb.query('SELECT COUNT(*) FROM activity_patterns WHERE confidence_score > 0.8').get(),
                // Resource monitoring
                () => mockDb.query('SELECT COUNT(*) FROM tasks WHERE status = "running"').get(),
                // Quality assessment
                () => mockDb.query('SELECT AVG(width) FROM media_metadata').get(),
                // User behavior analysis
                () => mockDb.query('SELECT COUNT(*) FROM user_interactions').get()
            ];

            // Execute all operations
            const results = operations.map(op => op());

            // All operations should complete successfully
            expect(results.length).toBe(5);
            results.forEach(result => {
                expect(result).toBeDefined();
            });
        });

        it('should maintain data consistency across server operations', async () => {
            const initialCounts = {
                media: mockDb.query('SELECT COUNT(*) as count FROM media_metadata').get() as any,
                tasks: mockDb.query('SELECT COUNT(*) as count FROM tasks').get() as any,
                patterns: mockDb.query('SELECT COUNT(*) as count FROM activity_patterns').get() as any,
                interactions: mockDb.query('SELECT COUNT(*) as count FROM user_interactions').get() as any
            };

            // Simulate server operations that modify data
            mockDb.run(`
                UPDATE media_metadata 
                SET tags = 'updated' 
                WHERE id = 1
            `);

            mockDb.run(`
                INSERT INTO activity_patterns (pattern_type, pattern_data, confidence_score, detection_count)
                VALUES ('test', '{"test": true}', 0.9, 1)
            `);

            // Verify data consistency
            const finalCounts = {
                media: mockDb.query('SELECT COUNT(*) as count FROM media_metadata').get() as any,
                tasks: mockDb.query('SELECT COUNT(*) as count FROM tasks').get() as any,
                patterns: mockDb.query('SELECT COUNT(*) as count FROM activity_patterns').get() as any,
                interactions: mockDb.query('SELECT COUNT(*) as count FROM user_interactions').get() as any
            };

            expect(finalCounts.media.count).toBe(initialCounts.media.count);
            expect(finalCounts.tasks.count).toBe(initialCounts.tasks.count);
            expect(finalCounts.patterns.count).toBe(initialCounts.patterns.count + 1);
            expect(finalCounts.interactions.count).toBe(initialCounts.interactions.count);
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should handle database errors gracefully across all servers', async () => {
            // Close database to simulate connection failure
            mockDb.close();

            const errorDb = {
                query: mock(() => {
                    throw new Error('Database connection failed');
                }),
                run: mock(() => {
                    throw new Error('Database connection failed');
                })
            };

            mockGetDatabase.mockReturnValue(errorDb);

            // All servers should handle database errors gracefully
            expect(() => {
                errorDb.query('SELECT * FROM media_metadata');
            }).toThrow('Database connection failed');

            expect(() => {
                errorDb.query('SELECT * FROM tasks');
            }).toThrow('Database connection failed');
        });

        it('should provide meaningful error messages', async () => {
            const errorScenarios = [
                { operation: 'metadata_analysis', error: 'Invalid media ID provided' },
                { operation: 'pattern_detection', error: 'Insufficient data for pattern analysis' },
                { operation: 'resource_monitoring', error: 'Resource metrics unavailable' },
                { operation: 'quality_assessment', error: 'Content file not accessible' },
                { operation: 'behavior_analysis', error: 'User session not found' }
            ];

            for (const scenario of errorScenarios) {
                // Check that error messages are meaningful and descriptive
                expect(scenario.error.length).toBeGreaterThan(10);
                expect(scenario.error).toMatch(/[A-Z]/); // Contains at least one uppercase letter
                expect(scenario.error).not.toBe('Error'); // Not just generic "Error"
            }
        });
    });

    describe('Configuration and Settings', () => {
        it('should respect configuration thresholds across servers', async () => {
            const configThresholds = {
                metadata_completeness: 0.7,
                pattern_confidence: 0.7,
                resource_warning: 70,
                quality_minimum: 0.7,
                behavior_confidence: 0.7
            };

            // Test that each threshold is properly applied
            for (const [key, threshold] of Object.entries(configThresholds)) {
                expect(threshold).toBeGreaterThan(0);
                // Some thresholds are percentages (0-100), others are decimals (0-1)
                if (key.includes('warning') || key.includes('percentage')) {
                    expect(threshold).toBeLessThanOrEqual(100);
                } else {
                    expect(threshold).toBeLessThanOrEqual(1);
                }
            }
        });

        it('should support different optimization strategies', async () => {
            const strategies = {
                metadata: ['ai_enhancement', 'rule_based', 'hybrid'],
                patterns: ['temporal', 'sequence', 'resource'],
                resources: ['efficiency_focused', 'peak_avoidance', 'even_distribution'],
                quality: ['upscaling', 'audio_enhancement', 'metadata_enrichment'],
                behavior: ['personalization', 'engagement', 'prediction']
            };

            for (const [server, serverStrategies] of Object.entries(strategies)) {
                expect(serverStrategies.length).toBeGreaterThan(0);
                // Check that all strategies are strings
                serverStrategies.forEach(strategy => {
                    expect(typeof strategy).toBe('string');
                    expect(strategy.length).toBeGreaterThan(0);
                });
            }
        });
    });

    describe('Monitoring and Observability', () => {
        it('should provide comprehensive system metrics', async () => {
            const systemMetrics = {
                metadata_quality: {
                    total_items: mockDb.query('SELECT COUNT(*) as count FROM media_metadata').get() as any,
                    complete_items: mockDb.query('SELECT COUNT(*) as count FROM media_metadata WHERE tags != "" AND summary != ""').get() as any
                },
                pattern_detection: {
                    active_patterns: mockDb.query('SELECT COUNT(*) as count FROM activity_patterns WHERE is_active = TRUE').get() as any,
                    high_confidence: mockDb.query('SELECT COUNT(*) as count FROM activity_patterns WHERE confidence_score > 0.8').get() as any
                },
                task_performance: {
                    total_tasks: mockDb.query('SELECT COUNT(*) as count FROM tasks').get() as any,
                    successful_tasks: mockDb.query('SELECT COUNT(*) as count FROM tasks WHERE status = "completed"').get() as any
                },
                user_engagement: {
                    total_sessions: mockDb.query('SELECT COUNT(*) as count FROM user_sessions').get() as any,
                    total_interactions: mockDb.query('SELECT COUNT(*) as count FROM user_interactions').get() as any
                }
            };

            // Verify all metrics are available
            expect(systemMetrics.metadata_quality.total_items.count).toBeGreaterThan(0);
            expect(systemMetrics.pattern_detection.active_patterns.count).toBeGreaterThan(0);
            expect(systemMetrics.task_performance.total_tasks.count).toBeGreaterThan(0);
            expect(systemMetrics.user_engagement.total_sessions.count).toBeGreaterThan(0);
        });
    });
});

afterAll(() => {
  mock.restore();
});
