import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';

const mockLogger = {
  info: mock(() => Promise.resolve()),
  error: mock(() => Promise.resolve()),
  warn: mock(() => Promise.resolve()),
  debug: mock(() => Promise.resolve()),
};

const mockConfig = {
  paths: { logs: '/tmp/test-logs' }
};

mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/config', () => ({ config: mockConfig }));

let db: Database;
const mockGetDatabase = mock(() => db);

mock.module('../src/db', () => ({ getDatabase: mockGetDatabase }));

import { reviewService } from '../src/services/review-service';

describe('ReviewService Database Functions', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    db.run(`CREATE TABLE review_results (
      id INTEGER PRIMARY KEY,
      task_id INTEGER,
      passed BOOLEAN,
      score INTEGER,
      created_at TEXT)`);
    db.run(`CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT)`);

    db.run(`INSERT INTO tasks (id, status) VALUES (1, 'completed'), (2, 'failed')`);

    db.run(`INSERT INTO review_results (task_id, passed, score, created_at) VALUES
      (1, 1, 95, '2024-01-01T00:00:00Z'),
      (1, 0, 40, '2024-01-02T00:00:00Z'),
      (2, 1, 80, '2024-01-03T00:00:00Z'),
      (2, 0, 60, '2024-01-04T00:00:00Z')`);
  });

  afterEach(() => {
    db.close();
  });

  it('summarizes task reviews', () => {
    const summary = reviewService.getTaskReviewSummary(1);
    expect(summary.total_reviews).toBe(2);
    expect(summary.average_score).toBeCloseTo(67.5);
    expect(summary.passed_count).toBe(1);
    expect(summary.failed_count).toBe(1);
    expect(summary.latest_review?.score).toBe(40);
  });

  it('computes overall review metrics', () => {
    const metrics = reviewService.getReviewMetrics();
    expect(metrics.total_reviews).toBe(4);
    expect(metrics.passed_reviews).toBe(2);
    expect(metrics.failed_reviews).toBe(2);
    expect(metrics.average_score).toBeCloseTo(68.75);
    expect(metrics.score_distribution).toEqual({
      excellent: 1,
      good: 1,
      fair: 1,
      poor: 1,
    });
  });

  it('retrieves task review history', () => {
    const reviews = reviewService.getTaskReviews(1);
    expect(reviews).toHaveLength(2);
    expect(reviews[0].score).toBe(40);
    expect(reviews[1].score).toBe(95);
  });

  it('retrieves recent reviews', () => {
    const recent = reviewService.getRecentReviews(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].score).toBe(60);
  });

  it('badge helpers', () => {
    expect(reviewService.getPassFailBadge(true)).toContain('PASS');
    expect(reviewService.getPassFailBadge(false)).toContain('FAIL');
    expect(reviewService.getScoreBadge(null)).toContain('N/A');
    expect(reviewService.getScoreBadge(95)).toContain('Excellent');
    expect(reviewService.getScoreBadge(75)).toContain('Good');
    expect(reviewService.getScoreBadge(55)).toContain('Fair');
    expect(reviewService.getScoreBadge(30)).toContain('Poor');
  });
});

afterAll(() => {
  mock.restore();
});
