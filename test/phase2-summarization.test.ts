import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { SummarizerService } from '../src/services/summarizer';
import { executeMediaSummarizeTask, createMediaSummarizeTask } from '../src/executors/summarize';
import type { MediaSummarizeTask } from '../src/types/task';

describe('Phase 2 Summarization Feature', () => {
    let db: Database;
    let summarizerService: SummarizerService;

    beforeEach(() => {
        // Create in-memory database for testing
        db = new Database(':memory:');
        
        // Create required tables
        db.run(`
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'pending',
                args TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            CREATE TABLE media_transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                task_id INTEGER NOT NULL,
                transcript_text TEXT NOT NULL,
                language TEXT,
                whisper_model TEXT NOT NULL,
                transcribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                summary TEXT,
                summary_style TEXT,
                summary_model TEXT,
                summary_generated_at DATETIME
            )
        `);

        // Mock the database getter
        global.mockDb = db;
        
        summarizerService = new SummarizerService();
    });

    afterEach(() => {
        db.close();
        delete global.mockDb;
    });

    describe('SummarizerService', () => {
        test('should initialize without OpenAI API key', () => {
            // Service should initialize but not be ready for use
            expect(summarizerService).toBeDefined();
        });

        test('should handle empty transcript text', async () => {
            const result = await summarizerService.generateSummary('');
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Empty transcript text');
        });

        test('should handle missing OpenAI API key', async () => {
            const result = await summarizerService.generateSummary('Test transcript text');
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('not initialized');
        });

        test('should validate summary options', async () => {
            const testText = 'This is a test transcript with some content to summarize.';
            
            // Test with different styles
            const styles = ['bullet', 'paragraph', 'key_points'] as const;
            
            for (const style of styles) {
                const result = await summarizerService.generateSummary(testText, { style });
                // Should fail due to missing API key, but options should be validated
                expect(result.success).toBe(false);
                expect(result.error).toContain('not initialized');
            }
        });
    });

    describe('MediaSummarizeTask Executor', () => {
        test('should create media summarization task', async () => {
            // Insert test data
            const taskResult = db.run(
                'INSERT INTO tasks (type, description, status) VALUES (?, ?, ?)',
                ['media_ingest', 'Test media ingestion', 'completed']
            );
            const taskId = taskResult.lastInsertRowid as number;
            
            const mediaResult = db.run(
                'INSERT INTO media_metadata (task_id, file_path, file_hash, metadata_json, tool_used) VALUES (?, ?, ?, ?, ?)',
                [taskId, '/test/video.mp4', 'test-hash-123', JSON.stringify({
                    filename: 'test-video.mp4',
                    duration: 120.5,
                    format: 'mp4'
                }), 'ffprobe']
            );
            const mediaId = mediaResult.lastInsertRowid as number;
            
            db.run(
                'INSERT INTO media_transcripts (media_id, task_id, transcript_text, language, whisper_model) VALUES (?, ?, ?, ?, ?)',
                [mediaId, taskId, 'Test transcript content for summarization testing.', 'en', 'turbo']
            );

            // Mock the database getter for the executor
            const originalGetDatabase = require('../src/db').getDatabase;
            require('../src/db').getDatabase = () => db;

            try {
                const summarizeTaskId = await createMediaSummarizeTask(mediaId, {
                    style: 'bullet',
                    force: false
                });

                expect(summarizeTaskId).toBeGreaterThan(0);

                // Verify task was created
                const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(summarizeTaskId) as any;
                expect(task).toBeDefined();
                expect(task.type).toBe('media_summarize');
                expect(task.status).toBe('pending');
                
                const args = JSON.parse(task.args);
                expect(args.media_id).toBe(mediaId);
                expect(args.style).toBe('bullet');
                expect(args.force).toBe(false);
            } finally {
                require('../src/db').getDatabase = originalGetDatabase;
            }
        });

        test('should handle missing transcript', async () => {
            const task: MediaSummarizeTask = {
                id: 1,
                type: 'media_summarize',
                description: 'Test summarization',
                media_id: 999, // Non-existent media ID
                status: 'pending',
                result: null,
                style: 'bullet'
            };

            // Mock the database getter
            const originalGetDatabase = require('../src/db').getDatabase;
            require('../src/db').getDatabase = () => db;

            try {
                const result = await executeMediaSummarizeTask(task);
                
                expect(result.success).toBe(false);
                expect(result.error).toContain('No transcript found');
            } finally {
                require('../src/db').getDatabase = originalGetDatabase;
            }
        });

        test('should skip summarization if summary exists and force is false', async () => {
            // Insert test data with existing summary
            const taskResult = db.run(
                'INSERT INTO tasks (type, description, status) VALUES (?, ?, ?)',
                ['media_ingest', 'Test media ingestion', 'completed']
            );
            const taskId = taskResult.lastInsertRowid as number;
            
            const mediaResult = db.run(
                'INSERT INTO media_metadata (task_id, file_path, file_hash, metadata_json, tool_used) VALUES (?, ?, ?, ?, ?)',
                [taskId, '/test/video.mp4', 'test-hash-123', JSON.stringify({
                    filename: 'test-video.mp4',
                    duration: 120.5,
                    format: 'mp4'
                }), 'ffprobe']
            );
            const mediaId = mediaResult.lastInsertRowid as number;
            
            db.run(
                'INSERT INTO media_transcripts (media_id, task_id, transcript_text, language, whisper_model, summary) VALUES (?, ?, ?, ?, ?, ?)',
                [mediaId, taskId, 'Test transcript content.', 'en', 'turbo', 'Existing summary']
            );

            const task: MediaSummarizeTask = {
                id: 1,
                type: 'media_summarize',
                description: 'Test summarization',
                media_id: mediaId,
                status: 'pending',
                result: null,
                style: 'bullet',
                force: false
            };

            // Mock the database getter
            const originalGetDatabase = require('../src/db').getDatabase;
            require('../src/db').getDatabase = () => db;

            try {
                const result = await executeMediaSummarizeTask(task);
                
                expect(result.success).toBe(true);
                expect(result.summary).toBe('Existing summary');
            } finally {
                require('../src/db').getDatabase = originalGetDatabase;
            }
        });
    });

    describe('Task Type Integration', () => {
        test('should include media_summarize in TASK_TYPES', () => {
            const { TASK_TYPES } = require('../src/types/task');
            expect(TASK_TYPES).toContain('media_summarize');
        });

        test('should handle media_summarize in task dispatcher', () => {
            const { taskExecutors } = require('../src/executors/dispatcher');
            expect(taskExecutors.media_summarize).toBeDefined();
            expect(typeof taskExecutors.media_summarize).toBe('function');
        });
    });

    describe('Database Schema', () => {
        test('should have summary columns in media_transcripts', () => {
            const columns = db.prepare("PRAGMA table_info(media_transcripts)").all() as Array<{name: string}>;
            const columnNames = columns.map(c => c.name);
            
            expect(columnNames).toContain('summary');
            expect(columnNames).toContain('summary_style');
            expect(columnNames).toContain('summary_model');
            expect(columnNames).toContain('summary_generated_at');
        });

        test('should allow null values for summary columns', () => {
            // Insert transcript without summary
            db.run(
                'INSERT INTO media_transcripts (media_id, task_id, transcript_text, language, whisper_model) VALUES (?, ?, ?, ?, ?)',
                [1, 1, 'Test transcript', 'en', 'turbo']
            );

            const transcript = db.prepare('SELECT * FROM media_transcripts WHERE id = 1').get() as any;
            expect(transcript.summary).toBeNull();
            expect(transcript.summary_style).toBeNull();
            expect(transcript.summary_model).toBeNull();
            expect(transcript.summary_generated_at).toBeNull();
        });

        test('should store summary data correctly', () => {
            // Insert transcript with summary
            db.run(
                'INSERT INTO media_transcripts (media_id, task_id, transcript_text, language, whisper_model, summary, summary_style, summary_model) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [1, 1, 'Test transcript', 'en', 'turbo', 'Test summary', 'bullet', 'gpt-3.5-turbo']
            );

            const transcript = db.prepare('SELECT * FROM media_transcripts WHERE id = 1').get() as any;
            expect(transcript.summary).toBe('Test summary');
            expect(transcript.summary_style).toBe('bullet');
            expect(transcript.summary_model).toBe('gpt-3.5-turbo');
        });
    });
});
