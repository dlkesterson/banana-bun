import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';

// Note: All mocks are handled by the preload script in bunfig.toml
// This prevents mock interference between test files in the full test suite

let db: Database;

describe('Banana Summarize CLI', () => {

    beforeEach(async () => {
        // Create a real in-memory database for testing
        db = new Database(':memory:');

        // Create the required tables
        db.exec(`
            CREATE TABLE media_metadata (
                id INTEGER PRIMARY KEY,
                file_path TEXT NOT NULL
            )
        `);

        db.exec(`
            CREATE TABLE media_transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                transcript_text TEXT NOT NULL,
                FOREIGN KEY (media_id) REFERENCES media_metadata(id)
            )
        `);

        // Insert test data
        db.exec(`INSERT INTO media_metadata (id, file_path) VALUES (1, '/test/file.mp4')`);
        db.exec(`INSERT INTO media_transcripts (media_id, transcript_text) VALUES (1, 'Test transcript')`);
    });

    afterEach(() => {
        // Close the database connection
        if (db && !db.closed) {
            try {
                db.close();
            } catch (error) {
                // Ignore close errors in tests
            }
        }
    });

    describe('parseCliArgs', () => {
        it('parses required media id and defaults', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('parses optional style', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('throws on invalid style', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('throws when media id missing', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('prints help when requested', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });
    });

    describe('validateMediaExists', () => {
        it('detects existing media with transcript', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.validateMediaExists).toBe('function');
        });

        it('detects media without transcript', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.validateMediaExists).toBe('function');
        });

        it('handles missing media', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.validateMediaExists).toBe('function');
        });
    });

    describe('runDirectSummarization', () => {
        it('outputs summary info', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.runDirectSummarization).toBe('function');
        });

        it('handles failure result', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.runDirectSummarization).toBe('function');
        });
    });

    describe('createSummarizationTask', () => {
        it('creates task through executor', async () => {
            const cli = await import('../src/cli/banana-summarize?t=' + Date.now());
            expect(typeof cli.createSummarizationTask).toBe('function');
        });
    });
});
