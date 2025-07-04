import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from 'bun:sqlite';
import type { MediaSummarizeTask } from '../src/types/task';

// Create isolated test directory for this test file
const TEST_BASE_DIR = join(tmpdir(), 'summarize-executor-test-' + Date.now());

let originalBasePath: string | undefined;
let db: Database;

beforeEach(async () => {
  // Store original BASE_PATH and set our own
  originalBasePath = process.env.BASE_PATH;
  process.env.BASE_PATH = TEST_BASE_DIR;

  // Create test directory
  await fs.mkdir(TEST_BASE_DIR, { recursive: true });
  await fs.mkdir(join(TEST_BASE_DIR, 'outputs'), { recursive: true });

  // Create test database
  const dbPath = join(TEST_BASE_DIR, 'test.db');
  db = new Database(dbPath);

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
});

afterEach(async () => {
  // Close database and clean up test directory
  if (db) {
    db.close();
  }

  await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });

  // Restore original BASE_PATH
  if (originalBasePath === undefined) {
    delete process.env.BASE_PATH;
  } else {
    process.env.BASE_PATH = originalBasePath;
  }
});

describe('createMediaSummarizeTask', () => {
  it('inserts a new task record', async () => {
    // Clear any cached modules to ensure fresh imports
    try {
      delete require.cache[require.resolve('../src/config')];
      delete require.cache[require.resolve('../src/executors/summarize')];
      delete require.cache[require.resolve('../src/db')];
    } catch (e) {
      // Ignore if require.cache doesn't work in Bun
    }

    // Mock the database to return our test database
    const originalGetDatabase = global.getDatabase;
    global.getDatabase = () => db;

    const { createMediaSummarizeTask } = await import('../src/executors/summarize?t=' + Date.now());

    const taskId = await createMediaSummarizeTask(1, { style: 'bullet', model: 'gpt-3.5-turbo', force: true });
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    expect(row).toBeDefined();
    expect(row.type).toBe('media_summarize');
    const args = JSON.parse(row.args);
    expect(args.media_id).toBe(1);
    expect(args.style).toBe('bullet');
    expect(args.model).toBe('gpt-3.5-turbo');
    expect(args.force).toBe(true);

    // Restore original function
    if (originalGetDatabase) {
      global.getDatabase = originalGetDatabase;
    } else {
      delete global.getDatabase;
    }
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

afterAll(() => {
  mock.restore();
});
