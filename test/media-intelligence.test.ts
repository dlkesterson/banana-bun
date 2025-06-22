import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { initDatabase, getDatabase } from '../src/db';
import { executeTask } from '../src/executors/dispatcher';
import type { MediaTranscribeTask, MediaTagTask, IndexMeiliTask, IndexChromaTask } from '../src/types/task';
import { meilisearchService } from '../src/services/meilisearch-service';
import { embeddingManager } from '../src/memory/embeddings';

describe('Media Intelligence System', () => {
    beforeEach(async () => {
        // Initialize database for testing
        await initDatabase();
        
        // Initialize services
        try {
            await meilisearchService.initialize();
        } catch (error) {
            console.warn('Meilisearch not available for testing');
        }
        
        try {
            await embeddingManager.initialize();
        } catch (error) {
            console.warn('ChromaDB not available for testing');
        }
    });

    afterEach(() => {
        // Clean up database
        const db = getDatabase();
        db.run('DELETE FROM tasks');
        db.run('DELETE FROM media_metadata');
        db.run('DELETE FROM media_transcripts');
        db.run('DELETE FROM media_tags');
        db.run('DELETE FROM media_index_status');
    });

    describe('Task Type Validation', () => {
        it('should recognize new media task types', () => {
            const transcribeTask: MediaTranscribeTask = {
                id: 1,
                type: 'media_transcribe',
                description: 'Test transcribe task',
                file_path: '/test/video.mp4',
                status: 'pending',
                result: null
            };

            const tagTask: MediaTagTask = {
                id: 2,
                type: 'media_tag',
                description: 'Test tag task',
                file_path: '/test/video.mp4',
                status: 'pending',
                result: null
            };

            const meiliTask: IndexMeiliTask = {
                id: 3,
                type: 'index_meili',
                description: 'Test Meilisearch index task',
                media_id: 1,
                status: 'pending',
                result: null
            };

            const chromaTask: IndexChromaTask = {
                id: 4,
                type: 'index_chroma',
                description: 'Test ChromaDB index task',
                media_id: 1,
                status: 'pending',
                result: null
            };

            expect(transcribeTask.type).toBe('media_transcribe');
            expect(tagTask.type).toBe('media_tag');
            expect(meiliTask.type).toBe('index_meili');
            expect(chromaTask.type).toBe('index_chroma');
        });
    });

    describe('Database Schema', () => {
        it('should have created new media intelligence tables', () => {
            const db = getDatabase();
            
            // Check if tables exist
            const tables = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name IN (
                    'media_transcripts', 
                    'media_tags', 
                    'media_index_status'
                )
            `).all() as { name: string }[];

            const tableNames = tables.map(t => t.name);
            expect(tableNames).toContain('media_transcripts');
            expect(tableNames).toContain('media_tags');
            expect(tableNames).toContain('media_index_status');
        });

        it('should allow inserting media transcript data', () => {
            const db = getDatabase();
            
            // First create a media_metadata entry
            db.run(`
                INSERT INTO media_metadata (task_id, file_path, file_hash, metadata_json, tool_used)
                VALUES (1, '/test/video.mp4', 'test_hash', '{}', 'ffprobe')
            `);
            
            const mediaId = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
            
            // Insert transcript
            db.run(`
                INSERT INTO media_transcripts (media_id, task_id, transcript_text, language, chunks_json, whisper_model)
                VALUES (?, 2, 'Test transcript', 'en', '[]', 'turbo')
            `, [mediaId.id]);
            
            const transcript = db.prepare('SELECT * FROM media_transcripts WHERE media_id = ?').get(mediaId.id);
            expect(transcript).toBeTruthy();
        });

        it('should allow inserting media tags data', () => {
            const db = getDatabase();
            
            // First create a media_metadata entry
            db.run(`
                INSERT INTO media_metadata (task_id, file_path, file_hash, metadata_json, tool_used)
                VALUES (1, '/test/video.mp4', 'test_hash', '{}', 'ffprobe')
            `);
            
            const mediaId = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
            
            // Insert tags
            const tags = ['comedy', 'kids', 'family'];
            const explanations = { 'comedy': 'Funny content', 'kids': 'Child-friendly' };
            
            db.run(`
                INSERT INTO media_tags (media_id, task_id, tags_json, explanations_json, llm_model, confidence_score)
                VALUES (?, 3, ?, ?, 'qwen3:8b', 0.85)
            `, [mediaId.id, JSON.stringify(tags), JSON.stringify(explanations)]);
            
            const tagRecord = db.prepare('SELECT * FROM media_tags WHERE media_id = ?').get(mediaId.id) as any;
            expect(tagRecord).toBeTruthy();
            expect(JSON.parse(tagRecord.tags_json)).toEqual(tags);
        });
    });

    describe('Task Execution', () => {
        it('should handle media_transcribe task gracefully when file missing', async () => {
            const task: MediaTranscribeTask = {
                id: 1,
                type: 'media_transcribe',
                description: 'Test transcribe task',
                file_path: '/nonexistent/video.mp4',
                status: 'pending',
                result: null
            };

            const result = await executeTask(task);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Media metadata not found');
        });

        it('should handle media_tag task gracefully when file missing', async () => {
            const task: MediaTagTask = {
                id: 2,
                type: 'media_tag',
                description: 'Test tag task',
                file_path: '/nonexistent/video.mp4',
                status: 'pending',
                result: null
            };

            const result = await executeTask(task);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Media metadata not found');
        });

        it('should handle index_meili task gracefully when media missing', async () => {
            const task: IndexMeiliTask = {
                id: 3,
                type: 'index_meili',
                description: 'Test Meilisearch index task',
                media_id: 999,
                status: 'pending',
                result: null
            };

            const result = await executeTask(task);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Media metadata not found');
        });

        it('should handle index_chroma task gracefully when media missing', async () => {
            const task: IndexChromaTask = {
                id: 4,
                type: 'index_chroma',
                description: 'Test ChromaDB index task',
                media_id: 999,
                status: 'pending',
                result: null
            };

            const result = await executeTask(task);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Media metadata not found');
        });
    });

    describe('Configuration', () => {
        it('should have Meilisearch configuration', () => {
            const { config } = require('../src/config');
            expect(config.meilisearch).toBeDefined();
            expect(config.meilisearch.url).toBeDefined();
            expect(config.meilisearch.indexName).toBeDefined();
        });

        it('should have Whisper configuration', () => {
            const { config } = require('../src/config');
            expect(config.whisper).toBeDefined();
            expect(config.whisper.model).toBeDefined();
            expect(config.whisper.device).toBeDefined();
        });

        it('should have Vision configuration', () => {
            const { config } = require('../src/config');
            expect(config.vision).toBeDefined();
            expect(config.vision.model).toBeDefined();
            expect(config.vision.frameExtraction).toBeDefined();
        });
    });
});
