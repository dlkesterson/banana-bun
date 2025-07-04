import { describe, it, expect, beforeAll, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync, mkdirSync } from 'fs';

const mockMcpClient = {
  smartTranscribe: mock(async () => ({
    success: true,
    model_used: 'base',
    language_detected: 'en',
    processing_time_ms: 100,
    quality_metrics: { quality_score: 0.9, confidence: 0.95, estimated_error_rate: 0.01 },
    transcript: 'hello world',
    chunks: [{ start_time: 0, end_time: 1, text: 'hello world' }]
  })),
  getModelRecommendation: mock(async () => ({
    recommended_model: 'base',
    reasoning: 'works',
    expected_quality: 0.9,
    expected_processing_time: 1000,
    confidence: 0.8,
    alternative_models: []
  })),
  assessTranscriptionQuality: mock(async () => ({
    quality_assessment: {
      overall_quality: 0.9,
      confidence: 0.95,
      estimated_error_rate: 0.02,
      word_count: 2,
      character_count: 11
    },
    quality_issues: [],
    improvement_suggestions: [],
    recommendations: []
  })),
  getTranscriptionAnalytics: mock(async () => ({
    summary: {
      total_transcriptions: 1,
      total_duration_processed: 60,
      total_words_transcribed: 100,
      avg_processing_time: 1
    },
    model_performance: [],
    language_detection: [],
    quality_metrics: { avg_quality_score: 0.9, min_quality_score: 0.8, max_quality_score: 0.95, min_processing_time: 1, max_processing_time: 2 }
  })),
  analyzeTranscriptionPatterns: mock(async () => ({
    total_transcriptions: 1,
    by_model: [],
    performance_metrics: {
      avg_processing_time: 1,
      avg_quality_score: 0.9,
      total_duration_processed: 60,
      total_words_transcribed: 100
    },
    quality_trends: {
      overall_trend: 0,
      quality_stability: 0.9
    }
  })),
  optimizeBatchTranscription: mock(async () => ({
    optimization_strategy: {
      recommended_model: 'base',
      optimal_parallel: 2,
      optimization_reasoning: ['fast']
    },
    estimated_total_time: 10000,
    file_analysis: {
      total_files: 2,
      estimated_total_size: 2000,
      estimated_total_duration: 60,
      file_types: ['mp3'],
      size_distribution: { small: 2, medium: 0, large: 0 }
    }
  })),
  recordTranscriptionFeedback: mock(async () => ({ success: true }))
};

mock.module('../mcp/mcp-client', () => ({ mcpClient: mockMcpClient }));

let cli: typeof import('../src/cli/smart-transcribe');

beforeAll(async () => {
  cli = await import('../src/cli/smart-transcribe');
});

beforeEach(() => {
  Object.values(mockMcpClient).forEach(fn => fn.mockReset && fn.mockReset());
});

afterEach(() => {
  (console as any).log = console.log;
});

function createTempDir() {
  const dir = join(tmpdir(), `st_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function createFile(path: string) {
  await writeFile(path, 'dummy');
}

describe('Smart Transcribe CLI Parsing', () => {
  it('parses file path parameter', () => {
    const opts = cli.parseCliArgs(['audio.mp3']);
    expect(opts.filePath).toBe('audio.mp3');
  });

  it('parses quality parameter with valid values', () => {
    const opts = cli.parseCliArgs(['audio.mp3', '--quality', 'high']);
    expect(opts.quality).toBe('high');
  });

  it('rejects invalid quality values', () => {
    expect(() => cli.parseCliArgs(['audio.mp3', '--quality', 'bad']))
      .toThrow('Invalid quality. Must be one of: fast, balanced, high');
  });

  it('parses batch directory parameter', () => {
    const opts = cli.parseCliArgs(['--batch', '/files']);
    expect(opts.batch).toBe('/files');
  });

  it('parses feedback parameters', () => {
    const opts = cli.parseCliArgs(['--feedback', 't1', '--rating', '4']);
    expect(opts.feedback).toBe('t1');
    expect(opts.rating).toBe(4);
  });

  it('validates rating range', () => {
    expect(() => cli.parseCliArgs(['--rating', '6']))
      .toThrow('Rating must be between 1 and 5');
  });
});

describe('File Validation', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('validates audio file exists', async () => {
    const file = join(dir, 'a.mp3');
    await createFile(file);
    await expect(cli.validateAudioFile(file)).resolves.toBe(true);
  });

  it('rejects non-existent files', async () => {
    const file = join(dir, 'missing.mp3');
    try {
      await cli.validateAudioFile(file);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(`Audio file not found: ${file}`);
    }
  });

  it('rejects unsupported file formats', async () => {
    const file = join(dir, 'note.txt');
    await createFile(file);
    await expect(cli.validateAudioFile(file))
      .rejects.toThrow('Unsupported audio format');
  });

  it('finds audio files in directory', async () => {
    const f1 = join(dir, 'one.mp3');
    const f2 = join(dir, 'two.wav');
    const f3 = join(dir, 'other.txt');
    await createFile(f1); await createFile(f2); await createFile(f3);
    const list = await cli.findAudioFiles(dir);
    expect(list).toContain(f1);
    expect(list).toContain(f2);
    expect(list).not.toContain(f3);
  });
});

describe('Helper functions', () => {
  it('formats time', () => {
    expect(cli.formatTime(125)).toBe('2:05');
  });

  it('formats duration', () => {
    expect(cli.formatDuration(3700)).toBe('1h 1m');
    expect(cli.formatDuration(300)).toBe('5m');
  });
});

afterAll(() => {
  mock.restore();
});

