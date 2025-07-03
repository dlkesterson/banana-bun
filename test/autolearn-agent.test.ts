import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

// Mock logger
const mockLogger = {
  info: mock(() => Promise.resolve()),
  error: mock(() => Promise.resolve()),
  warn: mock(() => Promise.resolve()),
  debug: mock(() => Promise.resolve()),
};
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));

// Mock analytics logger
const mockAnalyticsLogger = {
  getTaskAnalytics: mock(async () => ({
    total_tasks: 50,
    success_rate: 0.75,
    average_duration_ms: 40000,
    most_common_failures: [{ error_reason: 'timeout', count: 5, percentage: 10 }],
    task_type_stats: [{ task_type: 'shell', count: 20, success_rate: 0.8, avg_duration_ms: 65000 }],
    bottlenecks: [],
  })),
  detectBottlenecks: mock(async () => [
    {
      task_type: 'shell',
      slow_tasks: 5,
      avg_duration_ms: 150000,
      max_duration_ms: 160000,
      recommendation: 'Optimize shell tasks',
    },
  ]),
};
mock.module('../src/analytics/logger', () => ({ analyticsLogger: mockAnalyticsLogger }));

// Mock feedback tracker
const mockFeedbackTracker = {
  getFeedbackStats: mock(async () => ({
    total_feedback: 15,
    feedback_by_type: [{ type: 'tag_correction', count: 15 }],
    most_corrected_media: [],
    recent_patterns: [],
  })),
  analyzeFeedbackPatterns: mock(async () => [
    {
      pattern_type: 'tag_correction',
      pattern_description: '"old" -> "new"',
      frequency: 5,
      confidence: 0.92,
      examples: [{ original: 'old', corrected: 'new', media_id: 1 }],
    },
  ]),
};
mock.module('../src/feedback-tracker', () => ({ feedbackTracker: mockFeedbackTracker }));

// Mock embedding service
const mockEmbeddingService = {
  isInitialized: mock(() => true),
  initialize: mock(() => Promise.resolve()),
  getMediaEmbeddingStats: mock(async () => ({
    total_embeddings: 60,
    collection_name: 'media_embeddings',
    model_used: 'qwen3',
  })),
};
mock.module('../src/services/embedding-service', () => ({
  mediaEmbeddingService: mockEmbeddingService,
}));
// Also cover relative path used within AutolearnAgent
mock.module('./services/embedding-service', () => ({
  mediaEmbeddingService: mockEmbeddingService,
}));

// Mock EnhancedLearningService class
class MockEnhancedLearningService {
  config: any;
  generateEnhancedLearningRules = mock(async () => [{ id: 1 }]);
  storeEnhancedRules = mock(async (rules: any) => rules);
  applyRulesAutomatically = mock(async (id: number) => [
    { rule_id: 1, media_id: id, applied: true },
  ]);
  constructor(cfg: any = {}) {
    this.config = {
      min_pattern_frequency: 3,
      min_confidence_threshold: 0.7,
      auto_apply_threshold: 0.85,
      enable_cross_modal_analysis: true,
      enable_temporal_analysis: true,
      ...cfg,
    };
  }
  getConfig() {
    return this.config;
  }
}
mock.module('../src/services/enhanced-learning-service', () => ({
  EnhancedLearningService: MockEnhancedLearningService,
}));

let db: Database;
const mockGetDatabase = mock(() => db);
const mockInitDatabase = mock(() => Promise.resolve());
const mockGetDependencyHelper = mock(() => ({
  addDependency: mock(() => {}),
  removeDependency: mock(() => {}),
  getDependencies: mock(() => []),
  hasCyclicDependency: mock(() => false),
  getExecutionOrder: mock(() => []),
  markTaskCompleted: mock(() => {}),
  getReadyTasks: mock(() => [])
}));

mock.module('../src/db', () => ({
  getDatabase: mockGetDatabase,
  initDatabase: mockInitDatabase,
  getDependencyHelper: mockGetDependencyHelper
}));

describe('AutolearnAgent', () => {
  let agent: any;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE media_metadata (id INTEGER PRIMARY KEY, extracted_at TEXT)');
    db.exec("INSERT INTO media_metadata (id, extracted_at) VALUES (1, date('now'))");

    Object.values(mockLogger).forEach(fn => 'mockClear' in fn && fn.mockClear());
    Object.values(mockAnalyticsLogger).forEach(fn => 'mockClear' in fn && fn.mockClear());
    Object.values(mockFeedbackTracker).forEach(fn => 'mockClear' in fn && fn.mockClear());
    Object.values(mockEmbeddingService).forEach(fn => 'mockClear' in fn && fn.mockClear());

    const mod = await import('../src/autolearn-agent');
    const AutolearnAgent = mod.AutolearnAgent;
    agent = new AutolearnAgent();
  });

  afterEach(() => {
    db.close();
  });

  describe('Constructor', () => {
    it('should initialize with default enhanced learning service configuration', () => {
      expect(agent).toBeDefined();
      expect((agent as any).enhancedLearningService).toBeDefined();
    });

    it('should set correct default thresholds', () => {
      const config = (agent as any).enhancedLearningService.getConfig();
      expect(config.min_pattern_frequency).toBe(2);
      expect(config.min_confidence_threshold).toBe(0.6);
      expect(config.auto_apply_threshold).toBe(0.85);
    });
  });

  describe('generateLearningInsights', () => {
    it('should generate performance insights from task data', async () => {
      const insights = await agent.generateLearningInsights();
      expect(insights).toBeArray();
      expect(insights.length).toBeGreaterThan(0);
      const perf = insights.find(i => i.type === 'performance');
      expect(perf).toBeDefined();
      expect(perf!.confidence).toBeGreaterThan(0);
      expect(perf!.confidence).toBeLessThanOrEqual(1);
    });

    it('should provide actionable recommendations', async () => {
      const insights = await agent.generateLearningInsights();
      const actionable = insights.filter(i => i.actionable);
      actionable.forEach(i => {
        expect(i.suggested_actions).toBeDefined();
        expect(i.suggested_actions!.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateOptimizationRecommendations', () => {
    it('should generate task scheduling recommendations', async () => {
      const recs = await agent.generateOptimizationRecommendations();
      expect(recs).toBeArray();
      const sched = recs.find(r => r.category === 'task_scheduling');
      expect(sched).toBeDefined();
      expect(['low', 'medium', 'high', 'critical']).toContain(sched!.priority);
      expect(typeof sched!.estimated_impact).toBe('string');
      expect(['low', 'medium', 'high']).toContain(sched!.implementation_effort);
    });

    it('should prioritize recommendations by impact', async () => {
      const recs = await agent.generateOptimizationRecommendations();
      const high = recs.filter(r => r.priority === 'high' || r.priority === 'critical');
      high.forEach(rec => {
        expect(rec.suggested_implementation).toBeArray();
        expect(rec.suggested_implementation.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Learning Cycle Integration', () => {
    it('should complete full learning cycle from task execution to recommendations', async () => {
      const result = await agent.runAutonomousLearningCycle();
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});

afterAll(() => {
  // Restore all mocks after all tests in this file complete
  mock.restore();
});
