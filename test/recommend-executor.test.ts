import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import type { MediaRecommendTask } from '../src/types/task';

const mockLogger = {
  info: mock(() => Promise.resolve()),
  error: mock(() => Promise.resolve()),
  warn: mock(() => Promise.resolve()),
};

const mockRecommenderService = {
  isInitialized: mock(() => true),
  findSimilarMedia: mock(async () => ({ success: true, recommendations: [] })),
  getUserRecommendations: mock(async () => ({ success: true, recommendations: [] })),
  recordUserInteraction: mock(async () => {}),
};

let testDb: Database;

// Apply module mocks before importing executor
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/services/recommender', () => ({ recommenderService: mockRecommenderService }));
mock.module('../src/db', () => ({ getDatabase: () => testDb }));

describe('recommend executor', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    Object.values(mockLogger).forEach(fn => (fn as any).mockClear?.());
    Object.values(mockRecommenderService).forEach(fn => (fn as any).mockClear?.());
  });

  afterEach(() => {
    testDb.close();
  });

  it('returns error when recommender not initialized', async () => {
    mockRecommenderService.isInitialized.mockReturnValueOnce(false);

    const { executeMediaRecommendTask } = await import('../src/executors/recommend');

    const task: MediaRecommendTask = {
      id: 1,
      type: 'media_recommend',
      recommendation_type: 'similar',
      media_id: 5,
      user_id: 'u1',
      status: 'pending',
      result: null,
    };

    const result = await executeMediaRecommendTask.call({
      storeRecommendationResults: async () => {},
      indexRecommendations: async () => {},
    }, task);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Recommender service not initialized');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('executes similar recommendations successfully', async () => {
    mockRecommenderService.isInitialized.mockReturnValueOnce(true);
    mockRecommenderService.findSimilarMedia.mockResolvedValueOnce({
      success: true,
      recommendations: [{ media_id: 9, score: 0.9 }],
    });

    const storeMock = mock(async () => {});
    const indexMock = mock(async () => {});

    const { executeMediaRecommendTask } = await import('../src/executors/recommend');

    const task: MediaRecommendTask = {
      id: 2,
      type: 'media_recommend',
      recommendation_type: 'similar',
      media_id: 1,
      user_id: 'u1',
      status: 'pending',
      result: null,
    };

    const result = await executeMediaRecommendTask.call({
      storeRecommendationResults: storeMock,
      indexRecommendations: indexMock,
    }, task);

    expect(result.success).toBe(true);
    expect(result.recommendations?.length).toBe(1);
    expect(mockRecommenderService.findSimilarMedia).toHaveBeenCalledWith(1, expect.objectContaining({ topK: 5 }));
    expect(storeMock).toHaveBeenCalled();
    expect(indexMock).toHaveBeenCalled();
  });

  it('createMediaRecommendTask inserts new task', async () => {
    testDb.run(`CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, description TEXT, status TEXT, args TEXT)`);

    const { createMediaRecommendTask } = await import('../src/executors/recommend');

    const id = await createMediaRecommendTask({ mediaId: 42, recommendationType: 'similar', topK: 3 });

    const row = testDb.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    expect(row.type).toBe('media_recommend');
    const args = JSON.parse(row.args);
    expect(args.media_id).toBe(42);
    expect(args.recommendation_type).toBe('similar');
    expect(args.top_k).toBe(3);
  });

  it('recordUserInteraction delegates to service', async () => {
    const { recordUserInteraction } = await import('../src/executors/recommend');
    await recordUserInteraction('userA', 5, 'play');
    expect(mockRecommenderService.recordUserInteraction).toHaveBeenCalledWith('userA', 5, 'play', undefined);
  });
});

afterAll(() => {
  mock.restore();
});
