import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';
import { join } from 'path';

let db: Database;
let executeMediaTranscribeTask: (task: any) => Promise<{ success: boolean; error?: string }>;
const testDir = '/tmp/transcribe-test';
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};
const mockConfig = {
    whisper: {
        model: 'test-model',
        language: 'en',
        chunkDuration: 30
    }
};

// Mock spawn to simulate successful Whisper execution
const mockSpawn = mock(() => ({
    stdout: new ReadableStream({
        start(controller) {
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

// Set up module mocks before importing executor
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/config', () => ({ config: mockConfig }));
mock.module('../src/db', () => ({
    getDatabase: () => db,
    initDatabase: mock(() => Promise.resolve()),
    getDependencyHelper: mock(() => ({}))
}));

// Mock Bun.write to avoid file system issues
mock.module('bun', () => ({
    spawn: mockSpawn,
    write: mock(() => Promise.resolve())
}));

describe('executeMediaTranscribeTask', () => {

    beforeEach(async () => {
        db = new Database(':memory:');
        db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            file_hash TEXT,
            parent_id INTEGER,
            description TEXT,
            type TEXT,
            status TEXT,
            dependencies TEXT,
            result_summary TEXT,
            shell_command TEXT,
            error_message TEXT,
            args TEXT,
            generator TEXT,
            tool TEXT,
            validation_errors TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            finished_at DATETIME
        )
    `);
        db.run(`
        CREATE TABLE IF NOT EXISTS media_metadata (
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
        CREATE TABLE IF NOT EXISTS media_transcripts (
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

        await fs.mkdir(testDir, { recursive: true });

        ({ executeMediaTranscribeTask } = await import('../src/executors/transcribe?t=' + Date.now()));
    });

    afterEach(async () => {
        db.close();
        await fs.rm(testDir, { recursive: true, force: true });
    });

    function createTask(filePath: string) {
        db.run(`INSERT INTO tasks (id, type, description, status) VALUES (1, 'media_transcribe', 'test', 'pending')`);
        return { id: 1, type: 'media_transcribe', description: 'test', file_path: filePath, status: 'pending', result: null };
    }

    it('returns error when media metadata missing', async () => {
        const filePath = join(testDir, 'audio.mp3');
        await fs.writeFile(filePath, 'data');
        const task = createTask(filePath);

        const result = await executeMediaTranscribeTask(task);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Media metadata not found');
    });

    it('skips when already transcribed', async () => {
        const filePath = join(testDir, 'skip.mp3');
        await fs.writeFile(filePath, 'data');
        const task = createTask(filePath);

        db.run(`INSERT INTO media_metadata (id, task_id, file_path, file_hash, metadata_json, tool_used) VALUES (1, 1, ?, 'hash', '{}', 'ffprobe')`, [filePath]);
        db.run(`INSERT INTO media_transcripts (media_id, task_id, transcript_text, language, chunks_json, whisper_model) VALUES (1, 1, 'Existing', 'en', '[]', 'test-model')`);

        const result = await executeMediaTranscribeTask(task);
        expect(result.success).toBe(true);
    });

    it('handles whisper not being available', async () => {
        const filePath = join(testDir, 'file.mp3');
        await fs.writeFile(filePath, 'data');
        const task = createTask(filePath);

        db.run(`INSERT INTO media_metadata (id, task_id, file_path, file_hash, metadata_json, tool_used) VALUES (1, 1, ?, 'hash', '{"meta":true}', 'ffprobe')`, [filePath]);

        const result = await executeMediaTranscribeTask(task);

        // Since Whisper is not available in the test environment, we expect it to fail gracefully
        expect(result.success).toBe(false);
        expect(result.error).toContain('Executable not found');
    });

});

afterAll(() => {
    mock.restore();
});
