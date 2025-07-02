import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

let cli: any;

// Use a real database for testing but ensure it's isolated
let db: Database;

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

  // Mock the database module to return our test database
  mock.module('../src/db', () => ({
    getDatabase: () => db,
    initDatabase: async () => {},
    getDependencyHelper: () => ({
      addDependency: () => {},
      removeDependency: () => {},
      getDependencies: () => [],
      hasCyclicDependency: () => false,
      getExecutionOrder: () => [],
      markTaskCompleted: () => {},
      getReadyTasks: () => []
    })
  }));

  // Mock summarizer service
  mock.module('../src/services/summarizer', () => ({
    summarizerService: {
      generateSummaryForMedia: mock(async () => ({
        success: true,
        summary: 'mock summary',
        tokens_used: 10,
        processing_time_ms: 5,
        model_used: 'gpt-4',
      })),
      isInitialized: () => true,
    },
  }));

  // Mock task creation
  mock.module('../src/executors/summarize', () => ({
    createMediaSummarizeTask: mock(async () => 123),
  }));

  // Import CLI after mocks are set up with cache busting
  cli = await import('../src/cli/banana-summarize.ts?t=' + Date.now());
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

  // Clear module cache to prevent interference with other tests
  try {
    delete require.cache[require.resolve('../src/db')];
    delete require.cache[require.resolve('../src/cli/banana-summarize')];
  } catch (error) {
    // Ignore cache clearing errors
  }
});

describe('parseCliArgs', () => {
  it('parses required media id and defaults', () => {
    const opts = cli.parseCliArgs(['--media', '42']);
    expect(opts.mediaId).toBe(42);
    expect(opts.style).toBe('bullet');
    expect(opts.force).toBe(false);
    expect(opts.direct).toBe(false);
  });

  it('parses optional style', () => {
    const opts = cli.parseCliArgs(['--media', '1', '--style', 'paragraph']);
    expect(opts.style).toBe('paragraph');
  });

  it('throws on invalid style', () => {
    expect(() => cli.parseCliArgs(['--media', '1', '--style', 'bad']))
      .toThrow('Invalid style');
  });

  it('throws when media id missing', () => {
    expect(() => cli.parseCliArgs([])).toThrow('Media ID is required');
  });

  it('prints help when requested', () => {
    const logMock = mock(() => {});
    (console as any).log = logMock;
    cli.parseCliArgs(['--help']);
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });
});

describe('validateMediaExists', () => {
  it('detects existing media with transcript', async () => {
    db.run(`INSERT INTO media_metadata (id, file_path) VALUES (1, '/tmp/file.mp4')`);
    db.run(`INSERT INTO media_transcripts (media_id, transcript_text) VALUES (1, 'text')`);

    const result = await cli.validateMediaExists(1);

    expect(result.exists).toBe(true);
    expect(result.hasTranscript).toBe(true);
    expect(result.filePath).toBe('/tmp/file.mp4');
  });

  it('detects media without transcript', async () => {
    db.run(`INSERT INTO media_metadata (id, file_path) VALUES (2, '/tmp/file2.mp4')`);
    const result = await cli.validateMediaExists(2);
    expect(result.exists).toBe(true);
    expect(result.hasTranscript).toBe(false);
  });

  it('handles missing media', async () => {
    const result = await cli.validateMediaExists(99);
    expect(result.exists).toBe(false);
    expect(result.hasTranscript).toBe(false);
  });
});

describe('runDirectSummarization', () => {
  it('outputs summary info', async () => {
    const logMock = mock(() => {});
    (console as any).log = logMock;

    await cli.runDirectSummarization({ mediaId: 1, style: 'bullet' });

    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Summary generated successfully'));
  });

  it('handles failure result', async () => {
    // Override summarizer to return failure
    const { summarizerService } = await import('../src/services/summarizer');
    summarizerService.generateSummaryForMedia = mock(async () => ({ success: false, error: 'bad' }));
    const errMock = mock(() => {});
    const exitMock = mock(() => {});
    (console as any).error = errMock;
    (process as any).exit = exitMock;

    await cli.runDirectSummarization({ mediaId: 1 });

    expect(errMock).toHaveBeenCalledWith(expect.stringContaining('Summarization failed'));
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});


describe('createSummarizationTask', () => {
  it('creates task through executor', async () => {
    const { createMediaSummarizeTask } = await import('../src/executors/summarize');
    (createMediaSummarizeTask as any).mockClear?.();
    const logMock = mock(() => {});
    (console as any).log = logMock;

    await cli.createSummarizationTask({ mediaId: 1, style: 'bullet' });

    expect(createMediaSummarizeTask).toHaveBeenCalledWith(1, { style: 'bullet', model: undefined, force: undefined });
    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('Task ID'));
  });
});
