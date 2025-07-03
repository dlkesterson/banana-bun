import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test';

// Mock analytics logger so we can verify calls
const mockAnalyticsLogger = {
  logTaskStart: mock(() => Promise.resolve()),
  logTaskComplete: mock(() => Promise.resolve()),
  logTaskError: mock(() => Promise.resolve())
};
mock.module('../src/analytics/logger', () => ({ analyticsLogger: mockAnalyticsLogger }));

// Mock shell executor used by dispatcher
const mockExecuteShellTask = mock(async () => ({ success: true, outputPath: '/tmp/out.txt' }));
mock.module('../src/executors/shell', () => ({ executeShellTask: mockExecuteShellTask }));

import { executeTask } from '../src/executors/dispatcher';

describe('executeTask dispatcher', () => {
  beforeEach(() => {
    mockExecuteShellTask.mockClear();
    Object.values(mockAnalyticsLogger).forEach(fn => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as any).mockClear();
      }
    });
  });

  it('dispatches shell task and logs completion', async () => {
    const task = { id: 1, type: 'shell', shell_command: 'echo hi', status: 'pending', result: null } as const;
    const result = await executeTask(task);

    expect(mockExecuteShellTask).toHaveBeenCalledWith(task);
    expect(mockAnalyticsLogger.logTaskStart).toHaveBeenCalledWith(task);
    expect(mockAnalyticsLogger.logTaskComplete).toHaveBeenCalledWith(task, expect.any(Number));
    expect(mockAnalyticsLogger.logTaskError).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.outputPath).toBe('/tmp/out.txt');
  });

  it('logs error when executor fails', async () => {
    mockExecuteShellTask.mockResolvedValueOnce({ success: false, error: 'boom' });

    const task = { id: 2, type: 'shell', shell_command: 'exit 1', status: 'pending', result: null } as const;
    const result = await executeTask(task);

    expect(mockAnalyticsLogger.logTaskStart).toHaveBeenCalledWith(task);
    expect(mockAnalyticsLogger.logTaskError).toHaveBeenCalledWith(task, 'boom', expect.any(Number));
    expect(mockAnalyticsLogger.logTaskComplete).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('handles executor exceptions and logs error', async () => {
    mockExecuteShellTask.mockRejectedValueOnce(new Error('fail'));

    const task = { id: 3, type: 'shell', shell_command: 'bad', status: 'pending', result: null } as const;
    const result = await executeTask(task);

    expect(mockAnalyticsLogger.logTaskStart).toHaveBeenCalledWith(task);
    expect(mockAnalyticsLogger.logTaskError).toHaveBeenCalledWith(task, 'fail', expect.any(Number));
    expect(mockAnalyticsLogger.logTaskComplete).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toBe('fail');
  });
});

afterAll(() => {
  // Restore all mocks after all tests in this file complete
  mock.restore();
});
