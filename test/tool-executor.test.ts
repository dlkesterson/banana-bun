import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import type { ToolTask } from '../src/types';

// Create a unique mock for this test file to avoid conflicts
const mockToolRunner = {
  executeTool: mock(async () => ({ path: '/tmp/out.txt' }))
};

// Store original module reference
let originalModule: any;
let executeToolTask: typeof import('../src/executors/tool').executeToolTask;

beforeEach(async () => {
  // Import original module if not already done
  if (!originalModule) {
    originalModule = await import('../src/tools/tool_runner');
  }

  // Apply mock only for this test suite
  mock.module('../src/tools/tool_runner', () => ({
    toolRunner: mockToolRunner,
    ToolRunner: originalModule.ToolRunner
  }));

  // Import the module under test after mocking
  const mod = await import('../src/executors/tool?t=' + Date.now());
  executeToolTask = mod.executeToolTask;
  mockToolRunner.executeTool.mockClear();
});

afterEach(() => {
  // Restore the original module after each test
  mock.module('../src/tools/tool_runner', () => originalModule);
});

describe('executeToolTask', () => {
  it('runs tool successfully', async () => {
    const task: ToolTask = {
      id: 1,
      type: 'tool',
      tool: 'read_file',
      args: { path: '/tmp/test.txt' },
      status: 'pending',
      result: null,
      description: 'run tool'
    };

    mockToolRunner.executeTool.mockResolvedValueOnce({ path: '/tmp/result.txt' });

    const result = await executeToolTask(task);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe('/tmp/result.txt');
    expect(mockToolRunner.executeTool).toHaveBeenCalledWith('read_file', { path: '/tmp/test.txt' });
  });

  it('throws when required fields missing', async () => {
    const badTask: ToolTask = {
      id: 2,
      type: 'tool',
      status: 'pending',
      result: null
    } as any;

    await expect(executeToolTask(badTask)).rejects.toThrow('Tool task missing required tool or args');
  });

  it('returns error when tool fails', async () => {
    mockToolRunner.executeTool.mockRejectedValueOnce(new Error('failure'));
    const task: ToolTask = {
      id: 3,
      type: 'tool',
      tool: 'read_file',
      args: { path: '/tmp/fail.txt' },
      status: 'pending',
      result: null
    };

    const result = await executeToolTask(task);

    expect(result.success).toBe(false);
    expect(result.error).toContain('failure');
  });
});

afterAll(() => {
  mock.restore();
});
