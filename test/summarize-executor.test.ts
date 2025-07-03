import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import type { MediaSummarizeTask } from '../src/types/task';

let executeMediaSummarizeTask: typeof import('../src/executors/summarize').executeMediaSummarizeTask;
let createMediaSummarizeTask: typeof import('../src/executors/summarize').createMediaSummarizeTask;

const mockLogger = {
  info: mock(() => Promise.resolve()),
  error: mock(() => Promise.resolve()),
  warn: mock(() => Promise.resolve()),
  debug: mock(() => Promise.resolve())
};

const mockSummarizerService = {
  isInitialized: mock(() => true),
  generateSummaryForMedia: mock(async () => ({
    success: true,
    summary: 'mock summary',
    transcript_id: 1,
    model_used: 'gpt-4',
    tokens_used: 5,
    processing_time_ms: 10
  }))
};

const mockMeiliService = {
  indexDocument: mock(async () => {})
};

let db: Database;

beforeEach(async () => {
  // Create in-memory database and tables
  db = new Database(':memory:');
  db.run(`
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      description TEXT,
      status TEXT,
      args TEXT
    )
  `);

  db.run(`
    CREATE TABLE media_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      file_path TEXT,
      file_hash TEXT,
      metadata_json TEXT,
      tool_used TEXT
    )
  `);

  db.run(`
    CREATE TABLE media_transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER,
      task_id INTEGER,
      transcript_text TEXT,
      summary TEXT,
      summary_style TEXT,
      summary_model TEXT,
      summary_generated_at DATETIME,
      transcribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Mock modules
  mock.module('../src/db', () => ({ getDatabase: () => db }));
  mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
  mock.module('../src/services/summarizer', () => ({ summarizerService: mockSummarizerService }));
  mock.module('../src/services/meilisearch-service', () => ({ meilisearchService: mockMeiliService }));

  const mod = await import('../src/executors/summarize');
  executeMediaSummarizeTask = mod.executeMediaSummarizeTask;
  createMediaSummarizeTask = mod.createMediaSummarizeTask;
});

afterEach(() => {
  // Clean up test data but don't close the database
  db.run('DELETE FROM tasks');
  db.run('DELETE FROM media_metadata');
  db.run('DELETE FROM media_transcripts');

  mockSummarizerService.generateSummaryForMedia.mockClear();
  mockSummarizerService.isInitialized.mockClear();
  mockMeiliService.indexDocument.mockClear();
  Object.values(mockLogger).forEach((fn) => (fn as any).mockClear?.());
});

afterAll(() => {
  db.close();
  mock.restore();
});

describe('createMediaSummarizeTask', () => {
  it('inserts a new task record', async () => {
    const taskId = await createMediaSummarizeTask(1, { style: 'bullet', model: 'gpt-3.5-turbo', force: true });
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    expect(row).toBeDefined();
    expect(row.type).toBe('media_summarize');
    const args = JSON.parse(row.args);
    expect(args.media_id).toBe(1);
    expect(args.style).toBe('bullet');
    expect(args.model).toBe('gpt-3.5-turbo');
    expect(args.force).toBe(true);
  });
});

describe('executeMediaSummarizeTask', () => {
  it('returns error when summarizer service is not initialized', async () => {
    mockSummarizerService.isInitialized.mockReturnValueOnce(false);
    const task: MediaSummarizeTask = { id: 1, type: 'media_summarize', media_id: 1, status: 'pending', result: null };
    const result = await executeMediaSummarizeTask(task);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Summarizer service not initialized');
  });

  it('skips summarization when summary already exists', async () => {
    db.run(`INSERT INTO media_transcripts (media_id, task_id, transcript_text, summary) VALUES (1, 1, 'text', 'existing')`);
    const task: MediaSummarizeTask = { id: 2, type: 'media_summarize', media_id: 1, status: 'pending', result: null, force: false };
    const result = await executeMediaSummarizeTask(task);
    expect(result.success).toBe(true);
    expect(result.summary).toBe('existing');
    expect(mockSummarizerService.generateSummaryForMedia).not.toHaveBeenCalled();
  });

  it('generates summary and updates database', async () => {
    db.run(`INSERT INTO media_metadata (id, task_id, file_path, file_hash, metadata_json, tool_used) VALUES (1, 1, '/tmp/file.mp4', 'hash', '{"filename":"file.mp4","duration":50,"format":"mp4"}', 'ffprobe')`);
    db.run(`INSERT INTO media_transcripts (id, media_id, task_id, transcript_text) VALUES (1, 1, 1, 'hello world')`);
    const task: MediaSummarizeTask = { id: 3, type: 'media_summarize', media_id: 1, status: 'pending', result: null, style: 'bullet' };
    const result = await executeMediaSummarizeTask(task);
    expect(result.success).toBe(true);
    expect(result.summary).toBe('mock summary');
    const row = db.prepare('SELECT summary, summary_style, summary_model FROM media_transcripts WHERE id = 1').get() as any;
    expect(row.summary).toBe('mock summary');
    expect(row.summary_style).toBe('bullet');
    expect(row.summary_model).toBe('gpt-4');
    expect(mockMeiliService.indexDocument).toHaveBeenCalledWith('media_summaries', expect.any(Object));
  });
});
