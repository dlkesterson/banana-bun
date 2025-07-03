import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

let db: Database;
let originalGetDatabase: any;

// Store original getDatabase function and mock it
mock.module('../src/db', () => ({
    getDatabase: () => db,
    initDatabase: mock(() => Promise.resolve()),
    getDependencyHelper: mock(() => ({}))
}));
mock.module('../src/config', () => ({
    config: {
        paths: {
            incoming: '/tmp/test-incoming',
            processing: '/tmp/test-processing',
            archive: '/tmp/test-archive',
            error: '/tmp/test-error',
            tasks: '/tmp/test-tasks',
            outputs: '/tmp/test-outputs',
            logs: '/tmp/test-logs',
            dashboard: '/tmp/test-dashboard',
            database: ':memory:',
            media: '/tmp/test-media',
            chroma: {
                host: 'localhost',
                port: 8000,
                ssl: false
            }
        },
        openai: {
            apiKey: 'test-api-key',
            model: 'gpt-4'
        },
        ollama: {
            url: 'http://localhost:11434',
            model: 'qwen3:8b',
            fastModel: 'qwen3:8b'
        },
        chromadb: {
            url: 'http://localhost:8000',
            tenant: 'default_tenant'
        },
        meilisearch: {
            url: 'http://localhost:7700',
            masterKey: 'test-master-key',
            indexName: 'test-media-index'
        },
        services: {
            chromadb: { url: 'http://localhost:1234' }
        }
    }
}));

import { CrossModalIntelligenceService } from '../src/services/cross-modal-intelligence-service';
import { ContentEngagementService } from '../src/services/content-engagement-service';

describe('Cross-Modal Intelligence Service', () => {
    let crossModalService: CrossModalIntelligenceService;
    let engagementService: ContentEngagementService;

    beforeEach(async () => {
        // Create in-memory database for testing
        db = new Database(':memory:');

        // Create required tables
        createTestTables(db);

        // Insert test data
        insertTestData(db);

        process.env.CHROMA_URL = 'http://localhost:1234';

        // Initialize services with error handling
        try {
            crossModalService = new CrossModalIntelligenceService();
        } catch (error) {
            console.error('Failed to initialize CrossModalIntelligenceService:', error);
            throw error;
        }

        try {
            engagementService = new ContentEngagementService();
        } catch (error) {
            console.error('Failed to initialize ContentEngagementService:', error);
            throw error;
        }
    });

    afterEach(() => {
        // Clean up test data but don't close the database
        // as it might be shared with other tests
        if (db) {
            try {
                // Clean up test tables
                db.run('DELETE FROM content_engagement');
                db.run('DELETE FROM view_sessions');
                db.run('DELETE FROM engagement_analytics');
                db.run('DELETE FROM search_behavior');
                db.run('DELETE FROM cross_modal_embeddings');
                db.run('DELETE FROM quality_assessments');
                db.run('DELETE FROM user_feedback');
                db.run('DELETE FROM media_tags');
                db.run('DELETE FROM media_transcripts');
                db.run('DELETE FROM media_metadata');
            } catch (error) {
                // Ignore cleanup errors
            }
        }
        delete process.env.CHROMA_URL;
    });

    afterAll(() => {
        // Clean up database and restore mocks
        if (db) {
            try {
                db.close();
            } catch (error) {
                // Ignore cleanup errors
            }
        }

        // Note: Not calling mock.restore() to avoid interfering with other tests' mocks
    });

    test('should analyze search-transcript-tag correlations', async () => {
        expect(crossModalService).toBeDefined();
        const correlation = await crossModalService.analyzeSearchTranscriptTagCorrelation(1);
        
        expect(correlation.media_id).toBe(1);
        expect(correlation.search_queries).toBeDefined();
        expect(correlation.transcript_segments).toBeDefined();
        expect(correlation.current_tags).toBeDefined();
        expect(correlation.suggested_tags).toBeDefined();
        expect(correlation.correlation_score).toBeGreaterThanOrEqual(0);
        expect(correlation.correlation_score).toBeLessThanOrEqual(1);
        expect(correlation.confidence).toBeGreaterThanOrEqual(0);
        expect(correlation.confidence).toBeLessThanOrEqual(1);
    });

    test('should assess content quality', async () => {
        expect(crossModalService).toBeDefined();
        const quality = await crossModalService.assessContentQuality(1);
        
        expect(quality.media_id).toBe(1);
        expect(quality.engagement_score).toBeGreaterThanOrEqual(0);
        expect(quality.engagement_score).toBeLessThanOrEqual(1);
        expect(quality.search_discoverability).toBeGreaterThanOrEqual(0);
        expect(quality.tag_accuracy).toBeGreaterThanOrEqual(0);
        expect(quality.transcript_quality).toBeGreaterThanOrEqual(0);
        expect(quality.overall_quality).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(quality.improvement_suggestions)).toBe(true);
    });

    test('should generate cross-modal embeddings', async () => {
        expect(crossModalService).toBeDefined();
        const embedding = await crossModalService.generateCrossModalEmbedding(1);

        expect(embedding.media_id).toBe(1);
        expect(Array.isArray(embedding.text_embedding)).toBe(true);
        expect(Array.isArray(embedding.metadata_features)).toBe(true);
        expect(Array.isArray(embedding.combined_embedding)).toBe(true);
        expect(embedding.embedding_quality).toBeGreaterThanOrEqual(0);
        expect(embedding.embedding_quality).toBeLessThanOrEqual(1);
        expect(embedding.combined_embedding.length).toBeGreaterThan(0);
    });

    describe('correlation helpers', () => {
        test('calculate high correlation', async () => {
            const result = await (crossModalService as any).calculateCorrelations(
                ['machine learning tutorial'],
                [{ text: 'machine learning algorithms explained', start_time: 0, end_time: 5, relevance_score: 0.9, matched_terms: ['machine', 'learning'] }],
                ['machine-learning', 'ai']
            );
            expect(result.overall_score).toBeGreaterThan(0.4);
            expect(result.improvement_potential).toBeLessThan(0.5);
        });

        test('suggest tags from transcript and queries', async () => {
            const suggestions = await (crossModalService as any).generateTagSuggestions(
                ['neural networks overview'],
                [{ text: 'introduction to neural networks and deep learning', start_time: 0, end_time: 10, relevance_score: 0.8, matched_terms: [] }],
                ['tutorial']
            );
            expect(suggestions).toContain('neural');
            expect(suggestions).toContain('networks');
            expect(suggestions).not.toContain('tutorial');
        });

        test('handle empty transcript', async () => {
            const result = await (crossModalService as any).calculateCorrelations(
                ['test video'],
                [],
                ['video']
            );
            expect(result.overall_score).toBeLessThan(0.2);
            expect(result.confidence).toBeLessThan(0.5);
        });
    });

    test('should track search behavior', async () => {
        expect(crossModalService).toBeDefined();
        const sessionId = 'test-session-123';
        const query = 'test search query';
        const results = [{ id: 1, title: 'Test Video' }];
        const interactions = [
            {
                media_id: 1,
                interaction_type: 'click' as const,
                timestamp: new Date().toISOString(),
                duration_ms: 30000
            }
        ];

        await crossModalService.trackSearchBehavior(sessionId, query, results, interactions);

        // Verify search behavior was recorded
        const searchRecord = db.prepare(`
            SELECT * FROM search_behavior WHERE session_id = ? AND query = ?
        `).get(sessionId, query);

        expect(searchRecord).toBeDefined();
    });

    test('should analyze search patterns', async () => {
        const patterns = await crossModalService.analyzeSearchPatterns('test', [1], 0.8);
        
        expect(Array.isArray(patterns)).toBe(true);
        
        for (const pattern of patterns) {
            expect(pattern.query_pattern).toBeDefined();
            expect(Array.isArray(pattern.successful_results)).toBe(true);
            expect(Array.isArray(pattern.suggested_improvements)).toBe(true);
            expect(pattern.pattern_strength).toBeGreaterThanOrEqual(0);
        }
    });

    test('should track view sessions', async () => {
        expect(engagementService).toBeDefined();
        const session = {
            session_id: 'view-session-123',
            media_id: 1,
            user_id: 'test-user',
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            duration_ms: 120000,
            completion_percentage: 75,
            interaction_events: [
                {
                    event_type: 'play' as const,
                    timestamp: new Date().toISOString(),
                    position_ms: 0
                }
            ]
        };

        await engagementService.trackViewSession(session);

        // Verify session was recorded
        const sessionRecord = db.prepare(`
            SELECT * FROM view_sessions WHERE session_id = ?
        `).get(session.session_id);

        expect(sessionRecord).toBeDefined();
    });

    test('should get engagement metrics', async () => {
        expect(engagementService).toBeDefined();
        const metrics = await engagementService.getEngagementMetrics(1, 30);
        
        expect(metrics.media_id).toBe(1);
        expect(metrics.total_views).toBeGreaterThanOrEqual(0);
        expect(metrics.unique_viewers).toBeGreaterThanOrEqual(0);
        expect(metrics.avg_view_duration).toBeGreaterThanOrEqual(0);
        expect(metrics.completion_rate).toBeGreaterThanOrEqual(0);
        expect(metrics.completion_rate).toBeLessThanOrEqual(1);
        expect(metrics.search_discovery_rate).toBeGreaterThanOrEqual(0);
        expect(metrics.tag_correction_rate).toBeGreaterThanOrEqual(0);
        expect(metrics.trending_score).toBeGreaterThanOrEqual(-1);
        expect(metrics.trending_score).toBeLessThanOrEqual(1);
    });

    test('should analyze content trends', async () => {
        expect(engagementService).toBeDefined();
        const trends = await engagementService.analyzeContentTrends(7);
        
        expect(Array.isArray(trends)).toBe(true);
        
        for (const trend of trends) {
            expect(trend.media_id).toBeDefined();
            expect(['rising', 'declining', 'stable', 'viral']).toContain(trend.trend_type);
            expect(trend.trend_score).toBeGreaterThanOrEqual(-1);
            expect(trend.trend_score).toBeLessThanOrEqual(1);
            expect(trend.period_days).toBeGreaterThan(0);
            expect(Array.isArray(trend.factors)).toBe(true);
        }
    });

    test('should generate engagement insights', async () => {
        expect(engagementService).toBeDefined();
        const insights = await engagementService.generateEngagementInsights(30);
        
        expect(Array.isArray(insights)).toBe(true);
        
        for (const insight of insights) {
            expect(['high_engagement', 'low_engagement', 'discovery_issue', 'quality_issue']).toContain(insight.insight_type);
            expect(Array.isArray(insight.media_ids)).toBe(true);
            expect(insight.description).toBeDefined();
            expect(insight.confidence).toBeGreaterThanOrEqual(0);
            expect(insight.confidence).toBeLessThanOrEqual(1);
            expect(Array.isArray(insight.suggested_actions)).toBe(true);
            expect(insight.impact_estimate).toBeGreaterThanOrEqual(0);
            expect(insight.impact_estimate).toBeLessThanOrEqual(1);
        }
    });
});

function createTestTables(db: Database): void {
    // Media metadata table
    db.run(`
        CREATE TABLE media_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_hash TEXT NOT NULL UNIQUE,
            metadata_json TEXT NOT NULL,
            extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            tool_used TEXT NOT NULL
        )
    `);

    // Media transcripts table
    db.run(`
        CREATE TABLE media_transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            transcript_text TEXT NOT NULL,
            language TEXT,
            chunks_json TEXT,
            confidence_score REAL,
            whisper_model TEXT NOT NULL,
            transcribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Media tags table
    db.run(`
        CREATE TABLE media_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            tags_json TEXT NOT NULL,
            explanations_json TEXT,
            llm_model TEXT NOT NULL,
            confidence_score REAL,
            tagged_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // User feedback table
    db.run(`
        CREATE TABLE user_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            feedback_type TEXT NOT NULL,
            original_value TEXT,
            corrected_value TEXT,
            confidence_score REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            source TEXT DEFAULT 'user'
        )
    `);

    // Search behavior table
    db.run(`
        CREATE TABLE search_behavior (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            query TEXT NOT NULL,
            results_count INTEGER NOT NULL,
            interactions INTEGER NOT NULL,
            satisfaction_score REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Content engagement table
    db.run(`
        CREATE TABLE content_engagement (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            view_count INTEGER DEFAULT 0,
            total_watch_time INTEGER DEFAULT 0,
            completion_rate REAL DEFAULT 0,
            engagement_score REAL DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // View sessions table
    db.run(`
        CREATE TABLE view_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            media_id INTEGER NOT NULL,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            duration_ms INTEGER,
            completion_percentage REAL
        )
    `);

    // Engagement analytics table
    db.run(`
        CREATE TABLE engagement_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            metric_name TEXT NOT NULL,
            metric_value REAL NOT NULL,
            calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Cross modal embeddings table
    db.run(`
        CREATE TABLE cross_modal_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            text_embedding TEXT,
            metadata_features TEXT,
            combined_embedding TEXT,
            embedding_quality REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Quality assessments table
    db.run(`
        CREATE TABLE quality_assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            overall_quality REAL NOT NULL,
            engagement_score REAL,
            search_discoverability REAL,
            tag_accuracy REAL,
            transcript_quality REAL,
            assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

function insertTestData(db: Database): void {
    // Insert test media metadata
    db.run(`
        INSERT INTO media_metadata (id, task_id, file_path, file_hash, metadata_json, tool_used)
        VALUES (1, 1, '/test/video1.mp4', 'hash1', '{"title": "Test Video", "duration": 300}', 'ffprobe')
    `);

    db.run(`
        INSERT INTO media_metadata (id, task_id, file_path, file_hash, metadata_json, tool_used)
        VALUES (2, 2, '/test/video2.mp4', 'hash2', '{"title": "Another Video", "duration": 600}', 'ffprobe')
    `);

    // Insert test transcripts
    db.run(`
        INSERT INTO media_transcripts (media_id, task_id, transcript_text, chunks_json, confidence_score, whisper_model)
        VALUES (1, 1, 'This is a test video about cats and dogs playing together',
                '[{"text": "This is a test video", "start": 0, "end": 3}, {"text": "about cats and dogs", "start": 3, "end": 6}]',
                0.9,
                'whisper-1')
    `);

    db.run(`
        INSERT INTO media_transcripts (media_id, task_id, transcript_text, chunks_json, confidence_score, whisper_model)
        VALUES (2, 2, 'Another video showing funny animals in nature',
                '[{"text": "Another video showing", "start": 0, "end": 3}, {"text": "funny animals in nature", "start": 3, "end": 8}]',
                0.85,
                'whisper-1')
    `);

    // Insert test tags
    db.run(`
        INSERT INTO media_tags (media_id, task_id, tags_json, llm_model, confidence_score)
        VALUES (1, 1, '["cats", "dogs", "pets", "animals"]', 'gpt-4', 0.8)
    `);

    db.run(`
        INSERT INTO media_tags (media_id, task_id, tags_json, llm_model, confidence_score)
        VALUES (2, 2, '["animals", "nature", "funny", "wildlife"]', 'gpt-4', 0.9)
    `);

    // Insert test user feedback
    db.run(`
        INSERT INTO user_feedback (media_id, feedback_type, original_value, corrected_value, confidence_score)
        VALUES (1, 'tag_correction', 'pets', 'domestic animals', 0.9)
    `);

    // Insert test content engagement data
    db.run(`
        INSERT INTO content_engagement (media_id, view_count, total_watch_time, completion_rate, engagement_score)
        VALUES (1, 10, 2500, 0.83, 0.75)
    `);

    db.run(`
        INSERT INTO content_engagement (media_id, view_count, total_watch_time, completion_rate, engagement_score)
        VALUES (2, 5, 1800, 0.60, 0.65)
    `);

    // Insert test view sessions
    db.run(`
        INSERT INTO view_sessions (session_id, media_id, duration_ms, completion_percentage)
        VALUES ('session1', 1, 120000, 75.0)
    `);

    db.run(`
        INSERT INTO view_sessions (session_id, media_id, duration_ms, completion_percentage)
        VALUES ('session2', 2, 180000, 60.0)
    `);

    // Insert test search behavior
    db.run(`
        INSERT INTO search_behavior (session_id, query, results_count, interactions, satisfaction_score)
        VALUES ('search1', 'cats playing', 5, 3, 0.8)
    `);

    db.run(`
        INSERT INTO search_behavior (session_id, query, results_count, interactions, satisfaction_score)
        VALUES ('search2', 'funny animals', 8, 2, 0.7)
    `);
}
