import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import type { MediaTagTask } from '../src/types/task';
import type { MediaMetadata } from '../src/types/media';

const mockConfig = {
    ollama: { model: 'test-model' },
    paths: { logs: '/tmp/test-logs' }
};

const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

const mockToolRunner = {
    executeTool: mock(() => Promise.resolve({
        success: true,
        response: '{"tags":["action","thriller"],"confidence":0.95}'
    }))
};

let db: Database;
let executeMediaTagTask: (task: MediaTagTask) => Promise<{ success: boolean; error?: string }>;

function createTables(database: Database) {
    database.run(`CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        description TEXT,
        status TEXT,
        parent_id INTEGER,
        args TEXT,
        result_summary TEXT
    )`);
    database.run(`CREATE TABLE media_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        metadata_json TEXT NOT NULL
    )`);
    database.run(`CREATE TABLE media_transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER,
        transcript_text TEXT,
        language TEXT
    )`);
    database.run(`CREATE TABLE media_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER,
        task_id INTEGER,
        tags_json TEXT,
        explanations_json TEXT,
        llm_model TEXT,
        confidence_score REAL
    )`);
}

beforeEach(async () => {
    db = new Database(':memory:');
    createTables(db);

    mock.module('../src/config', () => ({ config: mockConfig }));
    mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
    mock.module('../src/tools/tool_runner', () => ({ toolRunner: mockToolRunner }));
    mock.module('../src/db', () => ({
        getDatabase: () => db,
        initDatabase: mock(() => Promise.resolve()),
        getDependencyHelper: mock(() => ({}))
    }));

    const mod = await import('../src/executors/tag');
    executeMediaTagTask = mod.executeMediaTagTask;

    Object.values(mockToolRunner).forEach(fn => 'mockClear' in fn && fn.mockClear());
    Object.values(mockLogger).forEach(fn => 'mockClear' in fn && fn.mockClear());
});

afterEach(() => {
    db.close();
});

describe('executeMediaTagTask', () => {
    it('tags media and stores results', async () => {
        const filePath = '/tmp/test.mp4';
        const metadata: MediaMetadata = {
            filename: 'test.mp4',
            filepath: filePath,
            filesize: 1000,
            file_hash: 'hash',
            format: 'mp4',
            duration: 120,
            bitrate: 800,
            video: [{ codec: 'h264', resolution: '1920x1080', width: 1920, height: 1080, fps: 30, bitrate: 600 }],
            audio: [{ codec: 'aac', channels: 2, sample_rate: 44100, bitrate: 128 }],
            title: 'Test',
            artist: 'Tester',
            album: 'Album',
            year: 2020,
            genre: 'action',
            description: 'desc',
            guessed_type: 'movie'
        };
        db.run('INSERT INTO media_metadata (id, file_path, metadata_json) VALUES (1, ?, ?)', [filePath, JSON.stringify(metadata)]);
        db.run('INSERT INTO media_transcripts (media_id, transcript_text, language) VALUES (1, "hello", "en")');
        db.run('INSERT INTO tasks (id, type, description, status) VALUES (1, "media_tag", "tag", "pending")');

        const task: MediaTagTask = { id: 1, type: 'media_tag', file_path: filePath, status: 'pending' } as MediaTagTask;

        const result = await executeMediaTagTask(task);

        expect(result.success).toBe(true);
        expect(mockToolRunner.executeTool).toHaveBeenCalled();

        const tagRow = db.query('SELECT tags_json, llm_model FROM media_tags WHERE media_id = 1').get() as any;
        expect(tagRow.tags_json).toBe('["action","thriller"]');
        expect(tagRow.llm_model).toBe('test-model');

        const indexing = db.query('SELECT type FROM tasks WHERE parent_id = 1').all() as any[];
        expect(indexing.map(t => t.type).sort()).toEqual(['index_chroma', 'index_meili']);

        const summaryRow = db.query('SELECT result_summary FROM tasks WHERE id = 1').get() as any;
        const summary = JSON.parse(summaryRow.result_summary);
        expect(summary.tags_count).toBe(2);
    });

    it('returns error when metadata missing', async () => {
        const task: MediaTagTask = { id: 1, type: 'media_tag', file_path: '/missing.mp4', status: 'pending' } as MediaTagTask;
        const result = await executeMediaTagTask(task);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Media metadata not found');
        expect(mockToolRunner.executeTool).not.toHaveBeenCalled();
    });

    it('skips when already tagged', async () => {
        const filePath = '/tmp/test2.mp4';
        const metadata: MediaMetadata = {
            filename: 'test2.mp4',
            filepath: filePath,
            filesize: 1000,
            file_hash: 'hash2',
            format: 'mp4',
            duration: 60,
            bitrate: 800,
            video: [],
            audio: [],
            guessed_type: 'movie'
        };
        db.run('INSERT INTO media_metadata (id, file_path, metadata_json) VALUES (1, ?, ?)', [filePath, JSON.stringify(metadata)]);
        db.run(
            'INSERT INTO media_tags (media_id, task_id, tags_json, llm_model, confidence_score) VALUES (?, ?, ?, ?, ?)',
            [1, 99, JSON.stringify(['old']), 'model', 0.5]
        );

        const task: MediaTagTask = { id: 1, type: 'media_tag', file_path: filePath, status: 'pending' } as MediaTagTask;

        const result = await executeMediaTagTask(task);

        expect(result.success).toBe(true);
        expect(mockToolRunner.executeTool).not.toHaveBeenCalled();
    });
});

afterAll(() => {
    mock.restore();
});
