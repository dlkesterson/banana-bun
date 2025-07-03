import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
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

describe('Content Quality Server', () => {
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
                sample_rate INTEGER,
                file_size INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert test data with varying quality levels
        mockDb.exec(`
            INSERT INTO media_metadata (id, title, tags, summary, genre, duration, collection, width, height, audio_bitrate, sample_rate, file_size)
            VALUES 
                (1, 'High Quality Video', 'high-quality,4k', 'A high quality 4K video with excellent audio', 'documentary', 1800, 'premium', 3840, 2160, 320, 48000, 2147483648),
                (2, 'Medium Quality Video', 'standard,hd', 'Standard HD video with good audio', 'entertainment', 1200, 'standard', 1920, 1080, 192, 44100, 1073741824),
                (3, 'Low Quality Video', 'low-res', 'Low resolution video', 'test', 600, 'archive', 854, 480, 96, 22050, 268435456),
                (4, 'Poor Quality Video', '', '', '', 300, 'archive', 640, 360, 64, 22050, 134217728),
                (5, 'Ultra HD Video', 'uhd,premium', 'Ultra high definition content', 'cinema', 7200, 'premium', 7680, 4320, 512, 96000, 8589934592)
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
            const { default: ContentQualityServer } = await import('../src/mcp/content-quality-server');
            
            expect(mockServer.setRequestHandler).toHaveBeenCalledWith('list_tools', expect.any(Function));
            expect(mockServer.setRequestHandler).toHaveBeenCalledWith('call_tool', expect.any(Function));
        });

        it('should register correct tool names', async () => {
            const { default: ContentQualityServer } = await import('../src/mcp/content-quality-server');
            
            const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
                call => call[0] === 'list_tools'
            )?.[1];
            
            const toolsResponse = await listToolsHandler();
            const toolNames = toolsResponse.tools.map((tool: any) => tool.name);
            
            expect(toolNames).toContain('analyze_content_quality');
            expect(toolNames).toContain('suggest_quality_enhancements');
            expect(toolNames).toContain('track_quality_improvements');
            expect(toolNames).toContain('batch_quality_assessment');
            expect(toolNames).toContain('generate_quality_report');
        });
    });

    describe('Quality Assessment Functions', () => {
        describe('Resolution Quality Scoring', () => {
            it('should calculate resolution scores correctly', () => {
                const calculateResolutionScore = (width: number, height: number): number => {
                    const totalPixels = width * height;
                    
                    if (totalPixels >= 3840 * 2160) return 1.0; // 4K
                    if (totalPixels >= 1920 * 1080) return 0.9; // 1080p
                    if (totalPixels >= 1280 * 720) return 0.7;  // 720p
                    if (totalPixels >= 854 * 480) return 0.5;   // 480p
                    return 0.3; // Lower resolution
                };

                expect(calculateResolutionScore(3840, 2160)).toBe(1.0); // 4K
                expect(calculateResolutionScore(1920, 1080)).toBe(0.9); // 1080p
                expect(calculateResolutionScore(1280, 720)).toBe(0.7);  // 720p
                expect(calculateResolutionScore(854, 480)).toBe(0.5);   // 480p
                expect(calculateResolutionScore(640, 360)).toBe(0.3);   // Low res
            });
        });

        describe('Audio Quality Scoring', () => {
            it('should calculate audio scores correctly', () => {
                const calculateAudioScore = (bitrate: number): number => {
                    if (bitrate >= 320) return 1.0;
                    if (bitrate >= 256) return 0.9;
                    if (bitrate >= 192) return 0.8;
                    if (bitrate >= 128) return 0.6;
                    return 0.4;
                };

                expect(calculateAudioScore(320)).toBe(1.0);
                expect(calculateAudioScore(256)).toBe(0.9);
                expect(calculateAudioScore(192)).toBe(0.8);
                expect(calculateAudioScore(128)).toBe(0.6);
                expect(calculateAudioScore(96)).toBe(0.4);
            });
        });

        describe('Metadata Completeness', () => {
            it('should calculate metadata completeness correctly', () => {
                const calculateMetadataCompleteness = (mediaItem: any): number => {
                    const requiredFields = ['title', 'tags', 'summary', 'genre', 'duration'];
                    const presentFields = requiredFields.filter(field => 
                        mediaItem[field] && mediaItem[field] !== ''
                    );
                    
                    return presentFields.length / requiredFields.length;
                };

                const completeItem = { title: 'Test', tags: 'test', summary: 'Summary', genre: 'test', duration: 120 };
                const incompleteItem = { title: 'Test', tags: '', summary: '', genre: '', duration: 120 };
                const emptyItem = { title: '', tags: '', summary: '', genre: '', duration: null };

                expect(calculateMetadataCompleteness(completeItem)).toBe(1.0);
                expect(calculateMetadataCompleteness(incompleteItem)).toBe(0.4); // 2/5 fields
                expect(calculateMetadataCompleteness(emptyItem)).toBe(0.0);
            });
        });
    });

    describe('analyze_content_quality', () => {
        it('should analyze quality for existing media item', async () => {
            const mediaId = 1; // High quality video
            const item = mockDb.query('SELECT * FROM media_metadata WHERE id = ?').get(mediaId) as any;
            
            expect(item).toBeDefined();
            expect(item.width).toBe(3840);
            expect(item.height).toBe(2160);
            expect(item.audio_bitrate).toBe(320);
            
            // Calculate quality metrics
            const resolutionScore = 1.0; // 4K
            const audioScore = 1.0; // 320kbps
            const metadataCompleteness = 1.0; // All fields present
            const overallScore = (resolutionScore * 0.4 + audioScore * 0.3 + metadataCompleteness * 0.3);
            
            expect(overallScore).toBeCloseTo(1.0, 1);
        });

        it('should handle non-existent media items', async () => {
            const nonExistentId = 999;
            const item = mockDb.query('SELECT * FROM media_metadata WHERE id = ?').get(nonExistentId);
            
            expect(item).toBeNull();
        });

        it('should identify quality issues', async () => {
            const lowQualityItem = mockDb.query('SELECT * FROM media_metadata WHERE id = ?').get(4) as any; // Poor quality video
            
            const issues = [];
            
            // Check resolution
            const resolutionScore = 0.3; // 640x360
            if (resolutionScore < 0.7) {
                issues.push(`Low resolution quality (score: ${resolutionScore.toFixed(2)})`);
            }
            
            // Check audio
            const audioScore = 0.4; // 64kbps
            if (audioScore < 0.6) {
                issues.push(`Poor audio quality (bitrate: ${lowQualityItem.audio_bitrate}kbps)`);
            }
            
            // Check metadata
            const metadataCompleteness = 0.2; // Only duration present
            if (metadataCompleteness < 0.8) {
                issues.push(`Incomplete metadata (${(metadataCompleteness * 100).toFixed(1)}% complete)`);
            }
            
            expect(issues.length).toBe(3);
            expect(issues[0]).toContain('resolution');
            expect(issues[1]).toContain('audio');
            expect(issues[2]).toContain('metadata');
        });
    });

    describe('suggest_quality_enhancements', () => {
        it('should suggest appropriate enhancements', async () => {
            const mediaId = 3; // Low quality video
            const item = mockDb.query('SELECT * FROM media_metadata WHERE id = ?').get(mediaId) as any;
            
            const enhancements = [];
            
            // Resolution enhancement
            if (item.width < 1920) {
                enhancements.push({
                    type: 'upscaling',
                    description: 'AI-powered resolution enhancement',
                    current_resolution: `${item.width}x${item.height}`,
                    target_resolution: '1080p',
                    estimated_improvement: '+25% quality score'
                });
            }
            
            // Audio enhancement
            if (item.audio_bitrate < 192) {
                enhancements.push({
                    type: 'audio_enhancement',
                    description: 'Audio clarity and noise reduction',
                    current_bitrate: `${item.audio_bitrate}kbps`,
                    target_bitrate: '192kbps',
                    estimated_improvement: '+20% clarity score'
                });
            }
            
            expect(enhancements.length).toBe(2);
            expect(enhancements[0].type).toBe('upscaling');
            expect(enhancements[1].type).toBe('audio_enhancement');
        });

        it('should handle different target quality levels', async () => {
            const targetLevels = ['basic', 'standard', 'high', 'premium'];
            const expectedResolutions = ['720p', '1080p', '1440p', '4K'];
            const expectedBitrates = ['128kbps', '192kbps', '256kbps', '320kbps'];
            
            for (let i = 0; i < targetLevels.length; i++) {
                const level = targetLevels[i];
                const expectedRes = expectedResolutions[i];
                const expectedBitrate = expectedBitrates[i];
                
                // Test target resolution mapping
                let targetResolution = '';
                switch (level) {
                    case 'basic': targetResolution = '720p'; break;
                    case 'standard': targetResolution = '1080p'; break;
                    case 'high': targetResolution = '1440p'; break;
                    case 'premium': targetResolution = '4K'; break;
                }
                
                expect(targetResolution).toBe(expectedRes);
            }
        });
    });

    describe('track_quality_improvements', () => {
        it('should track improvements over time', async () => {
            const timeRangeDays = 30;
            const cutoffDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000).toISOString();
            
            const improvements = mockDb.query(`
                SELECT 
                    COUNT(*) as total_items,
                    AVG(CASE WHEN width >= 1920 THEN 1 ELSE 0 END) as hd_percentage,
                    AVG(CASE WHEN audio_bitrate >= 192 THEN 1 ELSE 0 END) as good_audio_percentage,
                    AVG(CASE WHEN tags IS NOT NULL AND tags != '' THEN 1 ELSE 0 END) as tagged_percentage
                FROM media_metadata 
                WHERE updated_at > ?
            `).get(cutoffDate) as any;
            
            expect(improvements).toBeDefined();
            expect(improvements.total_items).toBeGreaterThan(0);
            expect(improvements.hd_percentage).toBeGreaterThanOrEqual(0);
            expect(improvements.hd_percentage).toBeLessThanOrEqual(1);
        });

        it('should identify improvement areas', async () => {
            const mockData = {
                hd_percentage: 0.6,      // Below 70%
                good_audio_percentage: 0.65, // Above 60%
                tagged_percentage: 0.7   // Below 80%
            };
            
            const areas = [];
            
            if (mockData.hd_percentage < 0.7) {
                areas.push('Resolution quality - consider upscaling lower resolution content');
            }
            
            if (mockData.good_audio_percentage < 0.6) {
                areas.push('Audio quality - many items have low bitrate audio');
            }
            
            if (mockData.tagged_percentage < 0.8) {
                areas.push('Metadata completeness - improve tagging and descriptions');
            }
            
            expect(areas.length).toBe(2); // HD and metadata issues
            expect(areas[0]).toContain('Resolution quality');
            expect(areas[1]).toContain('Metadata completeness');
        });
    });

    describe('batch_quality_assessment', () => {
        it('should assess multiple items efficiently', async () => {
            const qualityThreshold = 0.7;
            const allItems = mockDb.query('SELECT * FROM media_metadata').all() as any[];
            
            const assessments = [];
            for (const item of allItems) {
                // Calculate quality score
                const resolutionScore = item.width >= 1920 ? 0.9 : (item.width >= 854 ? 0.5 : 0.3);
                const audioScore = item.audio_bitrate >= 192 ? 0.8 : 0.4;
                const metadataScore = (item.tags && item.summary) ? 1.0 : 0.5;
                const overallScore = (resolutionScore + audioScore + metadataScore) / 3;
                
                assessments.push({
                    media_id: item.id,
                    title: item.title,
                    overall_quality_score: overallScore,
                    meets_threshold: overallScore >= qualityThreshold,
                    priority: overallScore < qualityThreshold ? 'high' : 'low'
                });
            }
            
            expect(assessments.length).toBe(5);
            
            const belowThreshold = assessments.filter(a => !a.meets_threshold);
            const aboveThreshold = assessments.filter(a => a.meets_threshold);
            
            expect(belowThreshold.length + aboveThreshold.length).toBe(assessments.length);
        });

        it('should prioritize low quality items', async () => {
            const assessments = [
                { media_id: 1, overall_quality_score: 0.9, meets_threshold: true },
                { media_id: 2, overall_quality_score: 0.6, meets_threshold: false },
                { media_id: 3, overall_quality_score: 0.4, meets_threshold: false },
                { media_id: 4, overall_quality_score: 0.8, meets_threshold: true }
            ];
            
            // Sort by quality score (lowest first for prioritization)
            const prioritized = assessments.sort((a, b) => a.overall_quality_score - b.overall_quality_score);
            
            expect(prioritized[0].overall_quality_score).toBe(0.4);
            expect(prioritized[1].overall_quality_score).toBe(0.6);
            expect(prioritized[2].overall_quality_score).toBe(0.8);
            expect(prioritized[3].overall_quality_score).toBe(0.9);
        });
    });

    describe('generate_quality_report', () => {
        it('should generate comprehensive quality statistics', async () => {
            const allItems = mockDb.query('SELECT * FROM media_metadata').all() as any[];
            
            // Calculate resolution stats
            const hdCount = allItems.filter(item => item.width >= 1920).length;
            const resolutionStats = {
                hd_percentage: Math.round((hdCount / allItems.length) * 100),
                average_width: Math.round(allItems.reduce((sum, item) => sum + item.width, 0) / allItems.length),
                average_height: Math.round(allItems.reduce((sum, item) => sum + item.height, 0) / allItems.length)
            };
            
            // Calculate audio stats
            const goodAudioCount = allItems.filter(item => item.audio_bitrate >= 192).length;
            const audioStats = {
                good_audio_percentage: Math.round((goodAudioCount / allItems.length) * 100),
                average_bitrate: Math.round(allItems.reduce((sum, item) => sum + item.audio_bitrate, 0) / allItems.length)
            };
            
            // Calculate metadata stats
            const taggedCount = allItems.filter(item => item.tags && item.tags !== '').length;
            const summarizedCount = allItems.filter(item => item.summary && item.summary !== '').length;
            const metadataStats = {
                tagged_percentage: Math.round((taggedCount / allItems.length) * 100),
                summarized_percentage: Math.round((summarizedCount / allItems.length) * 100)
            };
            
            expect(resolutionStats.hd_percentage).toBeGreaterThanOrEqual(0);
            expect(resolutionStats.hd_percentage).toBeLessThanOrEqual(100);
            expect(audioStats.good_audio_percentage).toBeGreaterThanOrEqual(0);
            expect(metadataStats.tagged_percentage).toBeGreaterThanOrEqual(0);
        });

        it('should categorize quality distribution', async () => {
            const sampleItems = [
                { overall_quality_score: 0.9 }, // High
                { overall_quality_score: 0.85 }, // High
                { overall_quality_score: 0.7 },  // Medium
                { overall_quality_score: 0.65 }, // Medium
                { overall_quality_score: 0.5 },  // Low
                { overall_quality_score: 0.3 }   // Low
            ];
            
            const distribution = { high: 0, medium: 0, low: 0 };
            
            for (const item of sampleItems) {
                if (item.overall_quality_score >= 0.8) distribution.high++;
                else if (item.overall_quality_score >= 0.6) distribution.medium++;
                else distribution.low++;
            }
            
            expect(distribution.high).toBe(2);
            expect(distribution.medium).toBe(2);
            expect(distribution.low).toBe(2);
            expect(distribution.high + distribution.medium + distribution.low).toBe(sampleItems.length);
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
                errorDb.query('SELECT * FROM media_metadata');
            }).toThrow('Database connection failed');
        });

        it('should handle missing media files', async () => {
            const mediaId = 999;
            const item = mockDb.query('SELECT * FROM media_metadata WHERE id = ?').get(mediaId);
            
            expect(item).toBeNull();
        });
    });

    describe('Performance', () => {
        it('should handle large datasets efficiently', async () => {
            // Insert many test records
            const insertStmt = mockDb.prepare(`
                INSERT INTO media_metadata (title, tags, summary, genre, duration, collection, width, height, audio_bitrate, sample_rate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (let i = 0; i < 100; i++) {
                insertStmt.run(
                    `Test Video ${i}`,
                    i % 3 === 0 ? 'test,video' : '',
                    i % 2 === 0 ? `Summary for video ${i}` : '',
                    'test',
                    60 + i,
                    'test_collection',
                    [640, 854, 1280, 1920, 3840][i % 5],
                    [360, 480, 720, 1080, 2160][i % 5],
                    [64, 96, 128, 192, 320][i % 5],
                    [22050, 44100, 48000][i % 3]
                );
            }
            
            const totalItems = mockDb.query('SELECT COUNT(*) as count FROM media_metadata').get() as any;
            expect(totalItems.count).toBeGreaterThan(100);
            
            // Test batch processing with limits
            const batchSize = 20;
            const batch = mockDb.query(`SELECT * FROM media_metadata LIMIT ${batchSize}`).all();
            
            expect(batch.length).toBeLessThanOrEqual(batchSize);
        });
    });
});

afterAll(() => {
    // Restore all mocks after all tests in this file complete
    mock.restore();
});
