import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

let db: Database;
const mockLogger = {
  info: mock(() => Promise.resolve()),
  error: mock(() => Promise.resolve()),
  warn: mock(() => Promise.resolve()),
};
const mockGetDatabase = mock(() => db);
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/db', () => ({ getDatabase: mockGetDatabase }));

let analyticsLogger: any;

beforeEach(async () => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      type TEXT,
      status TEXT,
      error_message TEXT,
      started_at DATETIME,
      finished_at DATETIME
    );
    CREATE TABLE task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER,
      retries INTEGER DEFAULT 0,
      error_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const mod = await import('../src/analytics/logger');
  analyticsLogger = mod.analyticsLogger;
});

afterEach(() => {
  db.close();
});

describe('AnalyticsLogger basic operations', () => {
  it('logs task start', async () => {
    db.run("INSERT INTO tasks (id, type, status) VALUES (1, 'llm', 'pending')");
    const task = { id: 1, type: 'llm', description: 'Test', status: 'pending' };
    await analyticsLogger.logTaskStart(task);

    const row = db
      .query('SELECT started_at FROM tasks WHERE id = 1')
      .get() as any;
    expect(row.started_at).toBeDefined();

    const log = db
      .query('SELECT status, retries FROM task_logs WHERE task_id = 1')
      .get() as any;
    expect(log.status).toBe('running');
    expect(log.retries).toBe(0);
  });

  it('logs task completion', async () => {
    db.run("INSERT INTO tasks (id, type, status) VALUES (2, 'llm', 'pending')");
    const task = { id: 2, type: 'llm', description: 'Complete', status: 'pending' };
    await analyticsLogger.logTaskStart(task);
    await analyticsLogger.logTaskComplete(task, 120);

    const row = db
      .query('SELECT status, finished_at FROM tasks WHERE id = 2')
      .get() as any;
    expect(row.status).toBe('completed');
    expect(row.finished_at).toBeDefined();

    const log = db
      .query('SELECT status, duration_ms FROM task_logs WHERE task_id = 2')
      .get() as any;
    expect(log.status).toBe('completed');
    expect(log.duration_ms).toBe(120);
  });

  it('logs task error and retry', async () => {
    db.run("INSERT INTO tasks (id, type, status) VALUES (3, 'shell', 'pending')");
    const task = { id: 3, type: 'shell', description: 'Err', status: 'pending' };
    await analyticsLogger.logTaskStart(task);
    await analyticsLogger.logTaskRetry(task, 1, 'tmp');
    await analyticsLogger.logTaskError(task, 'boom', 50);

    const row = db
      .query('SELECT status, error_message FROM tasks WHERE id = 3')
      .get() as any;
    expect(row.status).toBe('error');
    expect(row.error_message).toBe('boom');

    const log = db
      .query('SELECT status, retries, error_reason FROM task_logs WHERE task_id = 3')
      .get() as any;
    expect(log.retries).toBe(1);
    expect(log.status).toBe('error');
    expect(log.error_reason).toBe('boom');
  });
});

describe('AnalyticsLogger analytics functions', () => {
  it('computes task analytics', async () => {
    for (let i = 1; i <= 3; i++) {
      db.run(`INSERT INTO tasks (id, type, status) VALUES (${i + 10}, 'shell', 'pending')`);
      const t = { id: i + 10, type: 'shell', description: 'ok', status: 'pending' };
      await analyticsLogger.logTaskStart(t);
      await analyticsLogger.logTaskComplete(t, 100 * i);
    }
    for (let i = 1; i <= 2; i++) {
      const id = i + 20;
      db.run(`INSERT INTO tasks (id, type, status) VALUES (${id}, 'shell', 'pending')`);
      const t = { id, type: 'shell', description: 'err', status: 'pending' };
      await analyticsLogger.logTaskStart(t);
      await analyticsLogger.logTaskError(t, 'net', 50);
    }

    const analytics = await analyticsLogger.getTaskAnalytics();
    expect(analytics.total_tasks).toBe(5);
    expect(analytics.success_rate).toBeCloseTo(0.6, 2);
    expect(analytics.most_common_failures[0].error_reason).toBe('net');
    const shellStats = analytics.task_type_stats.find((s: any) => s.task_type === 'shell');
    expect(shellStats.count).toBe(5);
  });

  it('detects bottlenecks', async () => {
    for (let i = 1; i <= 3; i++) {
      db.run(`INSERT INTO tasks (id, type, status) VALUES (${30 + i}, 'shell', 'pending')`);
      const t = { id: 30 + i, type: 'shell', description: 'slow', status: 'pending' };
      await analyticsLogger.logTaskStart(t);
      await analyticsLogger.logTaskComplete(t, 60000 + i * 1000);
    }

    const result = await analyticsLogger.detectBottlenecks(50000);
    expect(result.length).toBe(1);
    expect(result[0].task_type).toBe('shell');
    expect(result[0].slow_tasks).toBe(3);
    expect(result[0].avg_duration_ms).toBeGreaterThan(60000);
  });

  it('cleans old logs', async () => {
    db.run("INSERT INTO tasks (id, type, status) VALUES (99, 'shell', 'pending')");
    db.run(`INSERT INTO task_logs (task_id, task_type, status, duration_ms, retries, created_at) VALUES (99, 'shell', 'completed', 10, 0, datetime('now','-40 day'))`);
    const deleted = await analyticsLogger.cleanupOldLogs(30);
    expect(deleted).toBe(1);
    const remaining = db.query('SELECT COUNT(*) as c FROM task_logs').get() as any;
    expect(remaining.c).toBe(0);
  });
});

describe('AnalyticsLogger edge cases', () => {
  it('handles database errors gracefully', async () => {
    mockGetDatabase.mockImplementationOnce(() => {
      throw new Error('fail');
    });
    const task = { id: 50, type: 'llm', description: 'x', status: 'pending' };
    await expect(analyticsLogger.logTaskStart(task)).resolves.toBeUndefined();
  });

  it('recommends optimization for frequent slow tasks', async () => {
    for (let i = 1; i <= 11; i++) {
      db.run(`INSERT INTO tasks (id, type, status) VALUES (${200 + i}, 'llm', 'pending')`);
      const t = { id: 200 + i, type: 'llm', description: 'slow', status: 'pending' };
      await analyticsLogger.logTaskStart(t);
      await analyticsLogger.logTaskComplete(t, 5000 + i);
    }
    const res = await analyticsLogger.detectBottlenecks(4000);
    const rec = res.find((r: any) => r.task_type === 'llm');
    expect(rec!.recommendation).toContain('High frequency');
  });
});

afterAll(() => {
  mock.restore();
});
