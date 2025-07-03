import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

const mockLogger = {
  info: mock(() => Promise.resolve()),
  error: mock(() => Promise.resolve()),
  warn: mock(() => Promise.resolve()),
  debug: mock(() => Promise.resolve())
};

let db: Database;
let ABTestingService: any;
let service: any;

beforeEach(async () => {
  db = new Database(':memory:');
  // minimal table referenced by ab_test_results
  db.run(`CREATE TABLE media_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    file_path TEXT,
    file_hash TEXT UNIQUE,
    metadata_json TEXT,
    extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tool_used TEXT
  )`);
  db.run(`INSERT INTO media_metadata (file_path, file_hash, metadata_json, tool_used, task_id) VALUES ('/tmp/file.mp4','hash1','{}','ffprobe',1)`);

  mock.module('../src/db', () => ({ getDatabase: () => db }));
  mock.module('../src/utils/logger', () => ({ logger: mockLogger }));

  const mod = await import('../src/services/ab-testing-service?t=' + Date.now());
  ABTestingService = mod.ABTestingService;
  service = new ABTestingService();
});

afterEach(() => {
  db.close();
  mockLogger.info.mockClear();
  mockLogger.error.mockClear();
});

function createStrategyInput(name: string) {
  return {
    name,
    description: name,
    strategy_type: 'frequency_based' as const,
    parameters: { value: 1 },
    is_active: true
  };
}

describe('ABTestingService', () => {
  it('creates a tagging strategy', async () => {
    const strat = await service.createStrategy(createStrategyInput('s1'));
    const row = db.prepare('SELECT name FROM tagging_strategies WHERE id = ?').get(strat.id);
    expect(row.name).toBe('s1');
  });

  it('creates an AB test configuration', async () => {
    const s1 = await service.createStrategy(createStrategyInput('A'));
    const s2 = await service.createStrategy(createStrategyInput('B'));

    const id = await service.createABTest({
      test_name: 'test1',
      strategies: [s1, s2],
      traffic_split: [50, 50],
      success_metrics: ['corrections'],
      min_sample_size: 10,
      test_duration_days: 7,
      confidence_threshold: 0.95
    });

    const row = db.prepare('SELECT test_name, is_active FROM ab_test_configs WHERE id = ?').get(id);
    expect(row.test_name).toBe('test1');
    expect(row.is_active).toBe(1);
  });

  it('selects same strategy consistently for a media id', async () => {
    const s1 = await service.createStrategy(createStrategyInput('A'));
    const s2 = await service.createStrategy(createStrategyInput('B'));
    const id = await service.createABTest({
      test_name: 'select',
      strategies: [s1, s2],
      traffic_split: [50, 50],
      success_metrics: ['metric'],
      min_sample_size: 10,
      test_duration_days: 7,
      confidence_threshold: 0.95
    });

    const first = await service.selectStrategyForMedia(id, 42);
    const second = await service.selectStrategyForMedia(id, 42);
    expect(first?.id).toBe(second?.id);
    expect([s1.id, s2.id]).toContain(first?.id);
  });

  it('records results and analyzes performance', async () => {
    const s1 = await service.createStrategy(createStrategyInput('A'));
    const s2 = await service.createStrategy(createStrategyInput('B'));
    const id = await service.createABTest({
      test_name: 'perf',
      strategies: [s1, s2],
      traffic_split: [50, 50],
      success_metrics: ['metric'],
      min_sample_size: 1,
      test_duration_days: 1,
      confidence_threshold: 0.9
    });

    for (let i = 0; i < 5; i++) {
      await service.recordTestResult({
        strategy_id: s1.id,
        media_id: 1,
        tags_generated: ['t'],
        user_corrections: 0,
        user_satisfaction_score: 1,
        processing_time_ms: 100,
        confidence_score: 0.9
      });
    }

    for (let i = 0; i < 3; i++) {
      await service.recordTestResult({
        strategy_id: s2.id,
        media_id: 1,
        tags_generated: ['u'],
        user_corrections: 1,
        user_satisfaction_score: 0.5,
        processing_time_ms: 120,
        confidence_score: 0.8
      });
    }

    const perf = await service.analyzeStrategyPerformance();
    expect(perf).toHaveLength(2);
    const a = perf.find(p => p.strategy_id === s1.id)!;
    const b = perf.find(p => p.strategy_id === s2.id)!;
    expect(a.total_tests).toBe(5);
    expect(a.success_rate).toBeCloseTo(1);
    expect(b.total_tests).toBe(3);
    expect(b.success_rate).toBeCloseTo(0);
  });

  it('identifies best strategy when sample size is significant', async () => {
    const s1 = await service.createStrategy(createStrategyInput('A'));
    const s2 = await service.createStrategy(createStrategyInput('B'));
    const id = await service.createABTest({
      test_name: 'best',
      strategies: [s1, s2],
      traffic_split: [50, 50],
      success_metrics: ['metric'],
      min_sample_size: 1,
      test_duration_days: 1,
      confidence_threshold: 0.9
    });

    for (let i = 0; i < 30; i++) {
      await service.recordTestResult({
        strategy_id: s1.id,
        media_id: 1,
        tags_generated: ['t'],
        user_corrections: 0,
        user_satisfaction_score: 1,
        processing_time_ms: 10,
        confidence_score: 0.9
      });
    }
    for (let i = 0; i < 30; i++) {
      await service.recordTestResult({
        strategy_id: s2.id,
        media_id: 1,
        tags_generated: ['u'],
        user_corrections: 1,
        user_satisfaction_score: 0.5,
        processing_time_ms: 10,
        confidence_score: 0.9
      });
    }

    const best = await service.getBestStrategy(id);
    expect(best?.strategy_id).toBe(s1.id);
    expect(best?.statistical_significance).toBeGreaterThanOrEqual(0.95);
  });

  it('can end a test and list active tests', async () => {
    const s1 = await service.createStrategy(createStrategyInput('A'));
    const id = await service.createABTest({
      test_name: 'end',
      strategies: [s1],
      traffic_split: [100],
      success_metrics: ['metric'],
      min_sample_size: 1,
      test_duration_days: 1,
      confidence_threshold: 0.9
    });
    let active = await service.getActiveTests();
    expect(active.length).toBe(1);
    await service.endTest(id);
    active = await service.getActiveTests();
    expect(active.length).toBe(0);
  });
});

afterAll(() => {
  // Restore all mocks after all tests in this file complete
  mock.restore();
});