import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';

const mockLogger = {
  info: mock(() => Promise.resolve()),
  error: mock(() => Promise.resolve()),
};

const downloadDir = '/tmp/download-test';

const mockConfig = {
  paths: { media: downloadDir },
  downloaders: {
    ytdlp: {
      path: '/tmp/mock-ytdlp',
      defaultFormat: 'best',
      outputTemplate: '%(title)s [%(id)s].%(ext)s',
    },
  },
};

let db: Database;
const mockGetDatabase = mock(() => db);
let mockWrite: any;
let mockFetch: any;

mock.module('../src/config', () => ({ config: mockConfig }));
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/db', () => ({ getDatabase: mockGetDatabase }));

beforeEach(async () => {
  await fs.rm(downloadDir, { recursive: true, force: true });
  await fs.mkdir(downloadDir, { recursive: true });
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT UNIQUE,
      title TEXT,
      channel TEXT,
      file_path TEXT,
      downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      description TEXT,
      status TEXT,
      parent_id INTEGER,
      args TEXT
    );
  `);
  mockWrite = mock(() => Promise.resolve());
  (Bun as any).write = (...args: any[]) => mockWrite(...args);
  mockFetch = mock(() => Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    statusText: 'OK',
  }));
  global.fetch = mockFetch as any;
});

afterEach(async () => {
  await fs.rm(downloadDir, { recursive: true, force: true });
  if (db) db.close();
  mockWrite.mockClear();
  mockFetch.mockClear();
  mockLogger.info.mockClear();
  mockLogger.error.mockClear();
  // restore fetch
  (global as any).fetch = undefined;
});

describe('executeMediaDownloadTask', () => {
  it('returns error for unsupported source', async () => {
    const { executeMediaDownloadTask } = await import('../src/executors/download?t=' + Date.now());
    const result = await executeMediaDownloadTask({ id: 1, type: 'media_download', status: 'pending', source: 'unknown' } as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported download source');
  });

  it('downloads YouTube video and schedules ingest', async () => {
    const { executeMediaDownloadTask } = await import('../src/executors/download?t=' + Date.now());
    const result = await executeMediaDownloadTask({ id: 2, type: 'media_download', status: 'pending', source: 'youtube', url: 'http://y.t/' } as any);
    expect(result.success).toBe(true);
    expect(result.filePath).toContain('Test Video [abc123].mp4');
    const { getDatabase } = await import('../src/db');
    const db = getDatabase();
    const ingest = db.query("SELECT args FROM tasks WHERE type = 'media_ingest'").get() as any;
    const ingestPath = JSON.parse(ingest.args).file_path;
    expect(ingestPath).toBe(result.filePath);
    const media = db.query('SELECT file_path FROM media WHERE video_id = ?').get('abc123') as any;
    expect(media.file_path).toBe(result.filePath);
  });

  it('skips download if YouTube video already exists', async () => {
    const { getDatabase } = await import('../src/db');
    const db = getDatabase();
    const existingPath = join(downloadDir, 'existing.mp4');
    db.run('INSERT INTO media (video_id, title, channel, file_path) VALUES (?, ?, ?, ?)', ['abc123', 'Dup', 'Chan', existingPath]);
    const { executeMediaDownloadTask } = await import('../src/executors/download?t=' + Date.now());
    const result = await executeMediaDownloadTask({ id: 3, type: 'media_download', status: 'pending', source: 'youtube', url: 'http://y.t/' } as any);
    expect(result.success).toBe(true);
    expect(result.filePath).toBe(existingPath);
    const count = db.query("SELECT COUNT(*) as c FROM tasks WHERE type='media_ingest'").get() as any;
    expect(count.c).toBe(1);
  });

  it('downloads file from RSS feed', async () => {
    const { executeMediaDownloadTask } = await import('../src/executors/download?t=' + Date.now());
    const result = await executeMediaDownloadTask({ id: 4, type: 'media_download', status: 'pending', source: 'rss', url: 'http://example.com/test.mp3' } as any);
    expect(result.success).toBe(true);
    expect(result.filePath).toBe(join(downloadDir, 'test.mp3'));
    expect(mockFetch).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith(join(downloadDir, 'test.mp3'), new Uint8Array([1,2,3]));
  });
});
