import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';

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

import { plannerService } from '../src/services/planner-service';

describe('PlannerService Database Functions', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    db.run(`CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT)`);
    db.run(`CREATE TABLE planner_results (
      id INTEGER PRIMARY KEY,
      task_id INTEGER,
      model_used TEXT,
      goal_description TEXT,
      generated_plan TEXT,
      similar_tasks_used TEXT,
      subtask_count INTEGER,
      created_at TEXT)`);

    db.run(`INSERT INTO tasks (id, status) VALUES (1, 'completed'), (2, 'failed')`);

    db.run(`INSERT INTO planner_results (task_id, model_used, goal_description, generated_plan, similar_tasks_used, subtask_count, created_at) VALUES
      (1, 'modelA', 'goal1', 'plan1', '[2]', 3, '2024-01-01T00:00:00Z'),
      (1, 'modelB', 'goal2', 'plan2', '[]', 4, '2024-01-02T00:00:00Z'),
      (2, 'modelA', 'goal3', 'plan3', '[1]', 2, '2024-01-03T00:00:00Z'),
      (2, 'modelA', 'goal4', 'plan4', NULL, 1, '2024-01-04T00:00:00Z')`);
  });

  afterEach(() => {
    db.close();
  });

  it('returns latest planner result for a task', () => {
    const result = plannerService.getPlannerResultForTask(1);
    expect(result?.goal_description).toBe('goal2');
  });

  it('calculates planner metrics correctly', () => {
    const metrics = plannerService.getPlannerMetrics();
    expect(metrics.total_plans).toBe(4);
    expect(metrics.average_subtasks).toBeCloseTo(2.5);
    expect(metrics.success_rate_by_context.with_similar_tasks).toBe(50);
    expect(metrics.success_rate_by_context.without_similar_tasks).toBe(50);
    expect(metrics.most_common_patterns).toEqual(['modelA (3)', 'modelB (1)']);
  });

  it('retrieves task planner history', () => {
    const history = plannerService.getTaskPlannerHistory(1);
    expect(history).toHaveLength(2);
    expect(history[0].goal_description).toBe('goal2');
    expect(history[1].goal_description).toBe('goal1');
  });

  it('retrieves recent planner results', () => {
    const recent = plannerService.getRecentPlannerResults(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].goal_description).toBe('goal4');
  });
});
