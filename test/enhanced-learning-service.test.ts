import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

// Mock the database module first
let testDb: Database;
const mockGetDatabase = mock(() => testDb);

mock.module('../src/db', () => ({
    getDatabase: mockGetDatabase
}));

// Mock the feedback tracker to avoid initialization issues
const mockFeedbackTracker = {
    addFeedback: mock(() => Promise.resolve()),
    getFeedbackStats: mock(() => ({ total: 0, byType: {} })),
    getRecentFeedback: mock(() => []),
    analyzeFeedbackPatterns: mock((minFrequency = 1) => Promise.resolve([
        {
            pattern_type: 'tag_correction',
            frequency: Math.max(5, minFrequency + 1), // Ensure frequency is above minimum
            confidence: 0.8,
            examples: [
                { media_id: 1, original_value: 'cat', corrected_value: 'dog' },
                { media_id: 2, original_value: 'cat', corrected_value: 'dog' },
                { media_id: 3, original_value: 'cat', corrected_value: 'dog' }
            ]
        },
        {
            pattern_type: 'title_correction',
            frequency: Math.max(3, minFrequency + 1),
            confidence: 0.9,
            examples: [
                { media_id: 4, original_value: 'old title', corrected_value: 'new title' }
            ]
        }
    ]))
};

mock.module('../src/feedback-tracker', () => ({
    feedbackTracker: mockFeedbackTracker
}));

// Mock the config module
mock.module('../src/config', () => ({
    config: {
        services: {
            chromadb: {
                enabled: false
            }
        }
    }
}));

// Mock the logger
const mockLogger = {
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {})
};

mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

// Import after mocks are set up
let EnhancedLearningService: any;

describe('Enhanced Learning Service', () => {
    let db: Database;
    let learningService: EnhancedLearningService;

    beforeAll(async () => {
        // Import service after mocks are set up
        const serviceModule = await import('../src/services/enhanced-learning-service.ts?t=' + Date.now());
        EnhancedLearningService = serviceModule.EnhancedLearningService;

        // Create in-memory database for testing
        db = new Database(':memory:');
        testDb = db;
        
        // Create required tables
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

        db.run(`
            CREATE TABLE learning_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_type TEXT NOT NULL,
                condition_text TEXT NOT NULL,
                action_text TEXT NOT NULL,
                confidence REAL NOT NULL,
                created_from_feedback BOOLEAN DEFAULT TRUE,
                usage_count INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 0.0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used_at DATETIME,
                enabled BOOLEAN DEFAULT TRUE,
                strategy_type TEXT,
                effectiveness_score REAL,
                last_applied DATETIME,
                auto_apply_threshold REAL DEFAULT 0.85
            )
        `);

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

        db.run(`
            CREATE TABLE media_transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                task_id INTEGER NOT NULL,
                transcript_text TEXT NOT NULL,
                language TEXT,
                chunks_json TEXT,
                whisper_model TEXT NOT NULL,
                transcribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert test data
        insertTestData(db);

        // Initialize learning service
        learningService = new EnhancedLearningService({
            min_pattern_frequency: 2,
            min_confidence_threshold: 0.6,
            auto_apply_threshold: 0.8,
            enable_cross_modal_analysis: false, // Disable for testing
            enable_temporal_analysis: true
        });

        // Database is already set up in beforeAll
    });

    afterAll(() => {
        db.close();
    });

    test('should generate enhanced learning rules from feedback patterns', async () => {
        const rules = await learningService.generateEnhancedLearningRules(2);

        console.log('Generated rules:', rules);
        console.log('Mock was called:', mockFeedbackTracker.analyzeFeedbackPatterns.mock.calls);

        expect(rules.length).toBeGreaterThan(0);
        
        // Check that rules have enhanced properties
        for (const rule of rules) {
            expect(rule.pattern_strength).toBeDefined();
            expect(rule.effectiveness_score).toBeDefined();
            expect(rule.strategy_type).toBeDefined();
            expect(rule.confidence).toBeGreaterThanOrEqual(0.6);
        }
    });

    test('should store enhanced learning rules in database', async () => {
        const rules = await learningService.generateEnhancedLearningRules(2);
        const storedRules = await learningService.storeEnhancedRules(rules);
        
        expect(storedRules.length).toBe(rules.length);
        
        // Verify rules are in database
        const dbRules = db.prepare('SELECT * FROM learning_rules').all();
        expect(dbRules.length).toBeGreaterThanOrEqual(storedRules.length);
    });

    test('should apply rules automatically to media', async () => {
        // First generate and store some rules
        const rules = await learningService.generateEnhancedLearningRules(2);
        await learningService.storeEnhancedRules(rules);
        
        // Apply rules to test media
        const results = await learningService.applyRulesAutomatically(1, 0.7);
        
        expect(Array.isArray(results)).toBe(true);
        
        // Check result structure
        for (const result of results) {
            expect(result.rule_id).toBeDefined();
            expect(result.media_id).toBe(1);
            expect(typeof result.applied).toBe('boolean');
            expect(Array.isArray(result.changes_made)).toBe(true);
        }
    });

    test('should calculate strategy performance', async () => {
        const strategies = await learningService.getStrategyPerformance();
        
        expect(Array.isArray(strategies)).toBe(true);
        expect(strategies.length).toBeGreaterThan(0);
        
        for (const strategy of strategies) {
            expect(strategy.name).toBeDefined();
            expect(strategy.performance_score).toBeDefined();
            expect(typeof strategy.enabled).toBe('boolean');
            expect(typeof strategy.rule_count).toBe('number');
        }
    });

    test('should filter and rank rules by quality', async () => {
        const rules = await learningService.generateEnhancedLearningRules(1);
        
        // Rules should be sorted by effectiveness and confidence
        for (let i = 1; i < rules.length; i++) {
            const prevScore = (rules[i-1].effectiveness_score || 0) * 0.6 + rules[i-1].confidence * 0.4;
            const currScore = (rules[i].effectiveness_score || 0) * 0.6 + rules[i].confidence * 0.4;
            expect(prevScore).toBeGreaterThanOrEqual(currScore);
        }
    });

    test('should handle cross-modal analysis when enabled', async () => {
        const crossModalService = new EnhancedLearningService({
            min_pattern_frequency: 2,
            enable_cross_modal_analysis: true,
            enable_temporal_analysis: false
        });

        const rules = await crossModalService.generateEnhancedLearningRules(2);
        
        // Should generate rules even with cross-modal analysis
        expect(Array.isArray(rules)).toBe(true);
    });
});

function insertTestData(db: Database): void {
    // Insert test media metadata
    db.run(`
        INSERT INTO media_metadata (id, task_id, file_path, file_hash, metadata_json, tool_used)
        VALUES (1, 1, '/test/video1.mp4', 'hash1', '{}', 'ffprobe')
    `);

    db.run(`
        INSERT INTO media_metadata (id, task_id, file_path, file_hash, metadata_json, tool_used)
        VALUES (2, 2, '/test/video2.mp4', 'hash2', '{}', 'ffprobe')
    `);

    // Insert test media tags
    db.run(`
        INSERT INTO media_tags (media_id, task_id, tags_json, llm_model, confidence_score)
        VALUES (1, 1, '["music", "rock", "guitar"]', 'gpt-4', 0.8)
    `);

    db.run(`
        INSERT INTO media_tags (media_id, task_id, tags_json, llm_model, confidence_score)
        VALUES (2, 2, '["music", "classical", "piano"]', 'gpt-4', 0.9)
    `);

    // Insert test feedback data
    const feedbackData = [
        { media_id: 1, feedback_type: 'tag_correction', original_value: 'rock', corrected_value: 'rock music', confidence_score: 0.9 },
        { media_id: 1, feedback_type: 'tag_correction', original_value: 'rock', corrected_value: 'rock music', confidence_score: 0.8 },
        { media_id: 2, feedback_type: 'tag_correction', original_value: 'classical', corrected_value: 'classical music', confidence_score: 0.9 },
        { media_id: 2, feedback_type: 'tag_correction', original_value: 'classical', corrected_value: 'classical music', confidence_score: 0.85 },
        { media_id: 1, feedback_type: 'metadata_edit', original_value: 'genre:rock', corrected_value: 'genre:rock music', confidence_score: 0.7 },
        { media_id: 2, feedback_type: 'metadata_edit', original_value: 'genre:classical', corrected_value: 'genre:classical music', confidence_score: 0.8 }
    ];

    for (const feedback of feedbackData) {
        db.run(`
            INSERT INTO user_feedback (media_id, feedback_type, original_value, corrected_value, confidence_score)
            VALUES (?, ?, ?, ?, ?)
        `, [feedback.media_id, feedback.feedback_type, feedback.original_value, feedback.corrected_value, feedback.confidence_score]);
    }

    // Insert test transcripts for cross-modal analysis
    db.run(`
        INSERT INTO media_transcripts (media_id, task_id, transcript_text, whisper_model)
        VALUES (1, 1, 'This is a great rock song with amazing guitar solos', 'whisper-1')
    `);

    db.run(`
        INSERT INTO media_transcripts (media_id, task_id, transcript_text, whisper_model)
        VALUES (2, 2, 'Beautiful classical piano composition by Mozart', 'whisper-1')
    `);
}
