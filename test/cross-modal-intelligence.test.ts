import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

let db: Database;
// mock database module before importing services
mock.module('../src/db', () => ({ getDatabase: () => db }));
mock.module('../src/config', () => ({
    config: {
        paths: { logs: '/tmp' },
        services: { chromadb: { url: 'http://localhost:1234' } }
    }
}));

import { CrossModalIntelligenceService } from '../src/services/cross-modal-intelligence-service';
import { ContentEngagementService } from '../src/services/content-engagement-service';

describe('Cross-Modal Intelligence Service', () => {
    let crossModalService: CrossModalIntelligenceService;
    let engagementService: ContentEngagementService;

    beforeAll(async () => {
        // Create in-memory database for testing
        db = new Database(':memory:');
        
        // Create required tables
        createTestTables(db);
        
        // Insert test data
        insertTestData(db);

        process.env.CHROMA_URL = 'http://localhost:1234';

        // Initialize services
        crossModalService = new CrossModalIntelligenceService();
        engagementService = new ContentEngagementService();
    });

    afterAll(() => {
        db.close();
        delete process.env.CHROMA_URL;
    });

    test('should analyze search-transcript-tag correlations', async () => {
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
}
