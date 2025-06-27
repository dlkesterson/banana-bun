import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';
import { join } from 'path';
import { executeMediaIngestTask } from '../src/executors/media';
import type { MediaIngestTask } from '../src/types/task';

// Mock external dependencies
const mockConfig = {
    media: {
        tools: {
            ffprobe: 'ffprobe',
            mediainfo: 'mediainfo',
            preferred: 'ffprobe' as const
        },
        extensions: {
            video: ['.mp4', '.mkv', '.avi'],
            audio: ['.mp3', '.flac', '.wav']
        },
        extraction: {
            timeout_ms: 30000,
            max_file_size_mb: 1000,
            enable_deduplication: true
        }
    }
};

const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

const mockHashFile = mock(() => Promise.resolve('mock-hash-123'));

// Mock the imports
mock.module('../src/config', () => ({
    config: mockConfig
}));

mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

mock.module('../src/utils/hash', () => ({
    hashFile: mockHashFile
}));

describe('Media Executor', () => {
    let db: Database;
    let testTask: MediaIngestTask;
    let testFilePath: string;

    beforeEach(async () => {
        // Create in-memory database
        db = new Database(':memory:');
        
        // Create required tables
        db.run(`
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                description TEXT,
                status TEXT,
                result_summary TEXT
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
                tool_used TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        // Mock getDatabase
        mock.module('../src/db', () => ({
            getDatabase: () => db
        }));

        // Create test file
        testFilePath = join('/tmp', 'test-video.mp4');
        await fs.writeFile(testFilePath, 'mock video content');

        // Create test task
        testTask = {
            id: 1,
            type: 'media_ingest',
            description: 'Test media ingestion',
            file_path: testFilePath,
            status: 'pending',
            result: null
        };

        // Clear mock call history
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
        mockLogger.warn.mockClear();
        mockHashFile.mockClear();
    });

    afterEach(async () => {
        db.close();
        try {
            await fs.unlink(testFilePath);
        } catch {
            // File might not exist
        }
    });

    describe('executeMediaIngestTask', () => {
        it('should handle missing file gracefully', async () => {
            const nonExistentTask: MediaIngestTask = {
                ...testTask,
                file_path: '/non/existent/file.mp4'
            };

            const result = await executeMediaIngestTask(nonExistentTask);

            expect(result.success).toBe(false);
            expect(result.error).toContain('ENOENT');
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle file size limit exceeded', async () => {
            // Mock file stats to return large size
            const originalStat = fs.stat;
            mock.module('fs/promises', () => ({
                stat: mock(() => Promise.resolve({
                    isFile: () => true,
                    size: 2000 * 1024 * 1024 // 2GB, exceeds 1GB limit
                }))
            }));

            const result = await executeMediaIngestTask(testTask);

            expect(result.success).toBe(false);
            expect(result.error).toContain('exceeds limit');
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should skip processing if file already exists (deduplication)', async () => {
            // Mock file stats
            mock.module('fs/promises', () => ({
                stat: mock(() => Promise.resolve({
                    isFile: () => true,
                    size: 1024 * 1024 // 1MB
                }))
            }));

            // Insert existing metadata
            db.run(
                'INSERT INTO media_metadata (task_id, file_path, file_hash, metadata_json, tool_used) VALUES (?, ?, ?, ?, ?)',
                [999, '/other/path.mp4', 'mock-hash-123', '{}', 'ffprobe']
            );

            const result = await executeMediaIngestTask(testTask);

            expect(result.success).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Media file already processed, skipping',
                expect.objectContaining({
                    existingTaskId: 999,
                    fileHash: 'mock-hash-123'
                })
            );
        });

        it('should process file when force flag is set', async () => {
            // Mock file stats
            mock.module('fs/promises', () => ({
                stat: mock(() => Promise.resolve({
                    isFile: () => true,
                    size: 1024 * 1024 // 1MB
                }))
            }));

            // Mock spawn to simulate successful ffprobe execution
            const mockSpawn = mock(() => ({
                stdout: new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode(JSON.stringify({
                            format: {
                                format_name: 'mp4',
                                duration: '120.5',
                                bit_rate: '1000000'
                            },
                            streams: [
                                {
                                    codec_type: 'video',
                                    codec_name: 'h264',
                                    width: 1920,
                                    height: 1080,
                                    r_frame_rate: '30/1'
                                }
                            ]
                        })));
                        controller.close();
                    }
                }),
                stderr: new ReadableStream({
                    start(controller) {
                        controller.close();
                    }
                }),
                exited: Promise.resolve(0)
            }));

            mock.module('bun', () => ({
                spawn: mockSpawn
            }));

            // Insert existing metadata
            db.run(
                'INSERT INTO media_metadata (task_id, file_path, file_hash, metadata_json, tool_used) VALUES (?, ?, ?, ?, ?)',
                [999, '/other/path.mp4', 'mock-hash-123', '{}', 'ffprobe']
            );

            const forceTask: MediaIngestTask = {
                ...testTask,
                force: true
            };

            const result = await executeMediaIngestTask(forceTask);

            expect(result.success).toBe(true);
            expect(mockSpawn).toHaveBeenCalled();
        });
    });

    describe('Media file validation', () => {
        it('should validate task structure', () => {
            expect(testTask.type).toBe('media_ingest');
            expect(testTask.file_path).toBeDefined();
            expect(testTask.description).toBeDefined();
        });

        it('should handle optional fields', () => {
            const taskWithOptionals: MediaIngestTask = {
                ...testTask,
                force: true,
                tool_preference: 'mediainfo'
            };

            expect(taskWithOptionals.force).toBe(true);
            expect(taskWithOptionals.tool_preference).toBe('mediainfo');
        });
    });
});
