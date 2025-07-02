import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

// Mock config to use in-memory database and temporary log path
const mockConfig = {
    paths: {
        database: ':memory:',
        logs: '/tmp/test-logs'
    }
};
mock.module('../src/config', () => ({ config: mockConfig }));

// Mock logger to avoid filesystem writes
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));

let FeedbackTrackerClass: any;

let db: Database;
let tracker: any;

function createTestTables(database: Database) {
    database.run(`
        CREATE TABLE user_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            feedback_type TEXT NOT NULL,
            original_value TEXT,
            corrected_value TEXT,
            confidence_score REAL DEFAULT 1.0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            source TEXT DEFAULT 'user'
        )
    `);

    database.run(`
        CREATE TABLE learning_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_type TEXT,
            condition_text TEXT,
            action_text TEXT,
            confidence REAL,
            created_from_feedback BOOLEAN DEFAULT TRUE,
            usage_count INTEGER DEFAULT 0,
            success_rate REAL DEFAULT 0.0,
            enabled BOOLEAN DEFAULT TRUE
        )
    `);

    database.run(`
        CREATE TABLE media_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            tags_json TEXT NOT NULL
        )
    `);
}

describe('FeedbackTracker', () => {
    beforeEach(async () => {
        db = new Database(':memory:');
        createTestTables(db);

        // Clear module cache and re-mock
        delete require.cache[require.resolve('../src/feedback-tracker')];
        mock.module('../src/db', () => ({ getDatabase: () => db }));

        const mod = await import('../src/feedback-tracker?t=' + Date.now());
        FeedbackTrackerClass = mod.FeedbackTracker;
        tracker = new FeedbackTrackerClass();
        Object.values(mockLogger).forEach(fn => 'mockClear' in fn && fn.mockClear());
    });

    afterEach(() => {
        mock.restore();
        db.close();
    });

    it('records user feedback', async () => {
        await tracker.recordFeedback({
            media_id: 1,
            feedback_type: 'tag_correction',
            original_value: 'action',
            corrected_value: 'comedy',
            source: 'ui'
        });

        const rows = db.prepare('SELECT * FROM user_feedback WHERE media_id = 1').all();
        expect(rows.length).toBe(1);
        expect(rows[0].feedback_type).toBe('tag_correction');
        expect(rows[0].corrected_value).toBe('comedy');
        expect(mockLogger.info.mock.calls.length).toBe(1);
    });

    it('analyzes feedback patterns', async () => {
        const insert = db.prepare(`INSERT INTO user_feedback (media_id, feedback_type, original_value, corrected_value, confidence_score, source) VALUES (?, ?, ?, ?, ?, ?)`);
        for (let i = 0; i < 3; i++) {
            insert.run(10 + i, 'tag_correction', 'action', 'comedy', 0.9, 'ui');
        }
        insert.run(20, 'metadata_edit', 'genre:action', 'genre:comedy', 0.8, 'ui');
        insert.run(21, 'metadata_edit', 'genre:action', 'genre:comedy', 0.8, 'ui');

        const patterns = await tracker.analyzeFeedbackPatterns(2);
        expect(patterns.length).toBe(2);
        const tagPattern = patterns.find(p => p.pattern_type === 'tag_correction')!;
        expect(tagPattern.frequency).toBe(3);
        expect(tagPattern.examples.length).toBeGreaterThan(0);
        const genrePattern = patterns.find(p => p.pattern_type === 'genre_correction');
        expect(genrePattern).toBeDefined();
    });

    it('generates learning rules from patterns', async () => {
        const patterns = [
            {
                pattern_type: 'tag_correction',
                pattern_description: '"action" -> "comedy"',
                frequency: 5,
                confidence: 0.8,
                examples: [{ original: 'action', corrected: 'comedy', media_id: 1 }]
            },
            {
                pattern_type: 'genre_correction',
                pattern_description: 'Genre: action -> comedy',
                frequency: 4,
                confidence: 0.9,
                examples: [{ original: 'action', corrected: 'comedy', media_id: 1 }]
            },
            {
                pattern_type: 'tag_correction',
                pattern_description: '"x" -> "y"',
                frequency: 2,
                confidence: 0.4,
                examples: [{ original: 'x', corrected: 'y', media_id: 2 }]
            }
        ];

        const rules = await tracker.generateLearningRules(patterns as any);
        expect(rules.length).toBe(2);
        expect(rules.some(r => r.rule_type === 'tag_mapping')).toBe(true);
        expect(rules.some(r => r.rule_type === 'genre_correction')).toBe(true);
    });

    it('computes feedback statistics', async () => {
        const insert = db.prepare(`INSERT INTO user_feedback (media_id, feedback_type, original_value, corrected_value, confidence_score, source) VALUES (?, ?, ?, ?, ?, ?)`);
        insert.run(1, 'tag_correction', 'a', 'b', 1.0, 'ui');
        insert.run(1, 'tag_correction', 'a', 'b', 1.0, 'ui');
        insert.run(2, 'rating', '3', '5', 1.0, 'ui');
        insert.run(2, 'metadata_edit', 'genre:thriller', 'genre:horror', 1.0, 'ui');

        const stats = await tracker.getFeedbackStats(1);
        expect(stats.total_feedback).toBe(4);
        const typeCounts = Object.fromEntries(stats.feedback_by_type.map(f => [f.type, f.count]));
        expect(typeCounts['tag_correction']).toBe(2);
        expect(stats.most_corrected_media.length).toBeGreaterThan(0);
        const mediaIds = stats.most_corrected_media.map(m => m.media_id);
        expect(mediaIds).toContain(1);
        expect(stats.recent_patterns.length).toBeGreaterThan(0);
    });

    it('applies learning rule and updates usage', async () => {
        db.run(`INSERT INTO learning_rules (id, rule_type, usage_count) VALUES (1, 'tag_mapping', 0)`);
        db.run(`INSERT INTO media_tags (media_id, tags_json) VALUES (99, '["action"]')`);

        const rule = {
            id: 1,
            rule_type: 'tag_mapping' as const,
            condition: '',
            action: '',
            confidence: 0.9,
            created_from_feedback: true,
            usage_count: 0,
            success_rate: 0
        };

        const result = await tracker.applyLearningRule(rule, 99);
        expect(result).toBe(true);
        const updated = db.prepare('SELECT usage_count FROM learning_rules WHERE id = 1').get() as any;
        expect(updated.usage_count).toBe(1);
    });

    it('returns top corrections', async () => {
        const insert = db.prepare(`INSERT INTO user_feedback (media_id, feedback_type, original_value, corrected_value, confidence_score, source) VALUES (?, ?, ?, ?, ?, ?)`);
        insert.run(1, 'tag_correction', 'x', 'y', 1.0, 'ui');
        insert.run(2, 'tag_correction', 'x', 'y', 1.0, 'ui');
        insert.run(3, 'tag_correction', 'x', 'y', 1.0, 'ui');
        insert.run(1, 'tag_correction', 'a', 'b', 1.0, 'ui');

        const top = await tracker.getTopCorrections(2);
        expect(top.length).toBe(2);
        expect(top[0].frequency >= top[1].frequency).toBe(true);
    });

    it('returns false for unknown rule type', async () => {
        db.run(`INSERT INTO learning_rules (id, rule_type, usage_count) VALUES (2, 'unknown', 0)`);

        const rule = {
            id: 2,
            rule_type: 'unknown' as any,
            condition: '',
            action: '',
            confidence: 0.5,
            created_from_feedback: true,
            usage_count: 0,
            success_rate: 0
        };

        const result = await tracker.applyLearningRule(rule, 100);
        expect(result).toBe(false);
        const updated = db.prepare('SELECT usage_count FROM learning_rules WHERE id = 2').get() as any;
        expect(updated.usage_count).toBe(0);
        expect(mockLogger.info.mock.calls.length).toBe(0);
    });

    it('logs error when recordFeedback fails', async () => {
        mock.restore();
        const failingDb = { run: () => { throw new Error('fail'); } } as any;
        mock.module('../src/db', () => ({ getDatabase: () => failingDb }));
        delete require.cache[require.resolve('../src/feedback-tracker')];
        const mod = await import('../src/feedback-tracker?t=' + Date.now());
        const FT = mod.FeedbackTracker;
        const failingTracker = new FT();
        Object.values(mockLogger).forEach(fn => 'mockClear' in fn && fn.mockClear());

        await expect(failingTracker.recordFeedback({
            media_id: 1,
            feedback_type: 'tag_correction',
            original_value: 'x',
            corrected_value: 'y',
            source: 'ui'
        })).rejects.toThrow('fail');

        expect(mockLogger.error.mock.calls.length).toBe(1);
    });
});
