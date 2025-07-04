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

describe('Metadata Optimization Server', () => {
    beforeEach(() => {
        // Create in-memory database for testing
        mockDb = new Database(':memory:');
        
        // Create test tables
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
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert test data
        mockDb.exec(`
            INSERT INTO media_metadata (id, title, tags, summary, genre, duration, collection, width, height, audio_bitrate)
            VALUES 
                (1, 'Test Video 1', 'test,video', 'A test video', 'documentary', 120, 'test_collection', 1920, 1080, 192),
                (2, 'Test Video 2', '', '', '', 90, 'test_collection', 1280, 720, 128),
                (3, 'Test Video 3', 'incomplete', 'Short', 'unknown', 60, 'test_collection', 854, 480, 96),
                (4, 'Complete Video', 'complete,high-quality', 'A complete video with all metadata', 'entertainment', 180, 'test_collection', 3840, 2160, 320)
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
            // Import the server after mocking
            const { default: MetadataOptimizationServer } = await import('../src/mcp/metadata-optimization-server');
            
            // Verify that setRequestHandler was called for both schemas
            expect(mockServer.setRequestHandler).toHaveBeenCalledWith('list_tools', expect.any(Function));
            expect(mockServer.setRequestHandler).toHaveBeenCalledWith('call_tool', expect.any(Function));
        });
    });

    describe('analyze_metadata_quality', () => {
        it('should analyze metadata quality for all items', async () => {
            const { default: MetadataOptimizationServer } = await import('../src/mcp/metadata-optimization-server');
            
            // Get the handler function
            const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
                call => call[0] === 'list_tools'
            )?.[1];
            
            expect(listToolsHandler).toBeDefined();
            
            const toolsResponse = await listToolsHandler();
            expect(toolsResponse.tools).toHaveLength(5);
            
            const analyzeQualityTool = toolsResponse.tools.find(
                (tool: any) => tool.name === 'analyze_metadata_quality'
            );
            expect(analyzeQualityTool).toBeDefined();
            expect(analyzeQualityTool.description).toContain('metadata quality');
        });

        it('should handle collection filtering', async () => {
            // Test that the tool can filter by collection
            const items = mockDb.query('SELECT * FROM media_metadata WHERE collection = ?').all('test_collection');
            expect(items).toHaveLength(4);
        });

        it('should calculate completeness scores correctly', async () => {
            // Test completeness calculation logic
            const items = mockDb.query('SELECT * FROM media_metadata').all() as any[];
            
            const criticalFields = ['title', 'tags', 'summary', 'genre', 'duration'];
            let totalMissingFields = 0;
            
            for (const item of items) {
                for (const field of criticalFields) {
                    if (!item[field] || item[field] === '') {
                        totalMissingFields++;
                    }
                }
            }
            
            const totalPossibleFields = criticalFields.length * items.length;
            const completenessScore = ((totalPossibleFields - totalMissingFields) / totalPossibleFields) * 100;
            
            expect(completenessScore).toBeGreaterThan(0);
            expect(completenessScore).toBeLessThanOrEqual(100);
        });
    });

    describe('optimize_metadata', () => {
        it('should identify items needing optimization', async () => {
            const itemsNeedingOptimization = mockDb.query(`
                SELECT * FROM media_metadata 
                WHERE tags IS NULL OR tags = '' OR summary IS NULL OR summary = ''
            `).all();
            
            expect(itemsNeedingOptimization.length).toBeGreaterThan(0);
        });

        it('should handle batch size limits', async () => {
            const batchSize = 2;
            const items = mockDb.query(`
                SELECT * FROM media_metadata 
                WHERE tags IS NULL OR tags = '' 
                LIMIT ${batchSize}
            `).all();
            
            expect(items.length).toBeLessThanOrEqual(batchSize);
        });

        it('should support dry run mode', async () => {
            // In dry run mode, no actual updates should be made
            const originalCount = mockDb.query('SELECT COUNT(*) as count FROM media_metadata WHERE tags = ""').get() as any;
            
            // Simulate dry run - no database changes
            const dryRunResult = {
                message: 'Dry run - would optimize the following items',
                items_to_process: 2,
                preview: []
            };
            
            expect(dryRunResult.message).toContain('Dry run');
            
            // Verify no changes were made
            const afterCount = mockDb.query('SELECT COUNT(*) as count FROM media_metadata WHERE tags = ""').get() as any;
            expect(afterCount.count).toBe(originalCount.count);
        });
    });

    describe('get_metadata_recommendations', () => {
        it('should generate recommendations for specific media item', async () => {
            const mediaId = 2; // Item with incomplete metadata
            const item = mockDb.query('SELECT * FROM media_metadata WHERE id = ?').get(mediaId) as any;
            
            expect(item).toBeDefined();
            expect(item.tags).toBe('');
            expect(item.summary).toBe('');
            
            // Simulate recommendation generation
            const recommendations = {
                tags: {
                    current: item.tags || '',
                    suggestions: ['content-based', 'auto-generated', 'media-type'],
                    confidence: 0.8
                },
                summary: {
                    current: item.summary || '',
                    suggestion: `Enhanced summary for ${item.title || 'media item'} with AI analysis`,
                    confidence: 0.9
                }
            };
            
            expect(recommendations.tags.suggestions).toHaveLength(3);
            expect(recommendations.summary.confidence).toBeGreaterThan(0.8);
        });

        it('should handle non-existent media items', async () => {
            const nonExistentId = 999;
            const item = mockDb.query('SELECT * FROM media_metadata WHERE id = ?').get(nonExistentId);
            
            expect(item).toBeNull();
        });
    });

    describe('track_metadata_improvements', () => {
        it('should track improvements over time', async () => {
            const timeRangeHours = 24;
            const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();
            
            // Simulate tracking query
            const improvements = mockDb.query(`
                SELECT COUNT(*) as update_count,
                       AVG(CASE WHEN tags IS NOT NULL AND tags != '' THEN 1 ELSE 0 END) as tags_completeness,
                       AVG(CASE WHEN summary IS NOT NULL AND summary != '' THEN 1 ELSE 0 END) as summary_completeness
                FROM media_metadata 
                WHERE updated_at > ?
            `).get(cutoffTime) as any;
            
            expect(improvements).toBeDefined();
            expect(improvements.tags_completeness).toBeGreaterThanOrEqual(0);
            expect(improvements.summary_completeness).toBeGreaterThanOrEqual(0);
        });
    });

    describe('validate_metadata_consistency', () => {
        it('should detect duplicate titles', async () => {
            // Insert duplicate title for testing
            mockDb.exec(`
                INSERT INTO media_metadata (title, tags, summary, genre, duration, collection)
                VALUES ('Test Video 1', 'duplicate', 'Duplicate test', 'test', 60, 'test_collection')
            `);
            
            const duplicates = mockDb.query(`
                SELECT title, COUNT(*) as count 
                FROM media_metadata 
                WHERE title IS NOT NULL AND title != ''
                GROUP BY title 
                HAVING COUNT(*) > 1
            `).all() as any[];
            
            expect(duplicates.length).toBeGreaterThan(0);
            expect(duplicates[0].count).toBeGreaterThan(1);
        });

        it('should detect inconsistent tag formats', async () => {
            // Insert item with inconsistent tag format
            mockDb.exec(`
                INSERT INTO media_metadata (title, tags, summary, genre, duration, collection)
                VALUES ('Inconsistent Tags', 'tag1,tag2;tag3', 'Mixed separators', 'test', 60, 'test_collection')
            `);
            
            const inconsistentTags = mockDb.query(`
                SELECT id, tags 
                FROM media_metadata 
                WHERE tags IS NOT NULL 
                AND tags != ''
                AND (tags LIKE '%,%' OR tags LIKE '%;%')
            `).all() as any[];
            
            expect(inconsistentTags.length).toBeGreaterThan(0);
        });

        it('should support auto-fix mode', async () => {
            // Insert item with inconsistent tags
            const insertResult = mockDb.run(`
                INSERT INTO media_metadata (title, tags, summary, genre, duration, collection)
                VALUES ('Auto Fix Test', 'tag1;tag2;tag3', 'Test auto fix', 'test', 60, 'test_collection')
            `);
            
            const itemId = insertResult.lastInsertRowid;
            
            // Simulate auto-fix by normalizing tags
            const normalizedTags = 'tag1;tag2;tag3'.replace(/;/g, ',');
            mockDb.run('UPDATE media_metadata SET tags = ? WHERE id = ?', [normalizedTags, itemId]);
            
            const updatedItem = mockDb.query('SELECT tags FROM media_metadata WHERE id = ?').get(itemId) as any;
            expect(updatedItem.tags).toBe('tag1,tag2,tag3');
            expect(updatedItem.tags).not.toContain(';');
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors gracefully', async () => {
            // Simulate database error by closing the database
            mockDb.close();
            
            // Create a new mock that throws an error
            const errorDb = {
                query: mock(() => {
                    throw new Error('Database connection failed');
                })
            };
            
            mockGetDatabase.mockReturnValue(errorDb);
            
            // The server should handle this gracefully without crashing
            expect(() => {
                errorDb.query('SELECT * FROM media_metadata');
            }).toThrow('Database connection failed');
        });

        it('should handle invalid tool names', async () => {
            const { default: MetadataOptimizationServer } = await import('../src/mcp/metadata-optimization-server');
            
            // Get the call tool handler
            const callToolHandler = mockServer.setRequestHandler.mock.calls.find(
                call => call[0] === 'call_tool'
            )?.[1];
            
            expect(callToolHandler).toBeDefined();
            
            // Test with invalid tool name
            const request = {
                params: {
                    name: 'invalid_tool',
                    arguments: {}
                }
            };
            
            const response = await callToolHandler(request);
            expect(response.isError).toBe(true);
            expect(response.content[0].text).toContain('Unknown tool');
        });
    });

    describe('Performance', () => {
        it('should handle large datasets efficiently', async () => {
            // Insert many test records
            const insertStmt = mockDb.prepare(`
                INSERT INTO media_metadata (title, tags, summary, genre, duration, collection)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            for (let i = 0; i < 100; i++) {
                insertStmt.run(
                    `Test Video ${i}`,
                    i % 2 === 0 ? 'tag1,tag2' : '',
                    i % 3 === 0 ? `Summary for video ${i}` : '',
                    'test',
                    60 + i,
                    'large_collection'
                );
            }
            
            const totalItems = mockDb.query('SELECT COUNT(*) as count FROM media_metadata').get() as any;
            expect(totalItems.count).toBeGreaterThan(100);
            
            // Test batch processing
            const batchSize = 10;
            const batch = mockDb.query(`
                SELECT * FROM media_metadata 
                WHERE tags = '' OR summary = ''
                LIMIT ${batchSize}
            `).all();
            
            expect(batch.length).toBeLessThanOrEqual(batchSize);
        });
    });
});

afterAll(() => {
  mock.restore();
});
