import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';

const mockLogger = {
  info: mock(() => Promise.resolve()),
  error: mock(() => Promise.resolve()),
  warn: mock(() => Promise.resolve()),
  debug: mock(() => Promise.resolve()),
};

const tempDir = '/tmp/tool-runner-basic-test';
const mockConfig = {
  paths: { outputs: tempDir, logs: tempDir },
};

// Apply mocks before importing
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/config', () => ({ config: mockConfig }));

// Import with cache busting to avoid conflicts
const { toolRunner } = await import('../src/tools/tool_runner?t=' + Date.now());

describe('ToolRunner Basic Tools', () => {
  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    // Clear all mocks
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.debug.mockClear();
  });

  it('reads files using read_file', async () => {
    const file = join(tempDir, 'read.txt');
    await fs.writeFile(file, 'hello');
    const result = await toolRunner.executeTool('read_file', { path: file });
    expect(result.content).toBe('hello');
  });

  it('writes files using write_file', async () => {
    const file = join(tempDir, 'write.txt');
    const result = await toolRunner.executeTool('write_file', { path: file, content: 'abc' });
    expect(result.path).toBe(file);
    const content = await fs.readFile(file, 'utf-8');
    expect(content).toBe('abc');
  });

  it('throws for unknown tool', async () => {
    await expect(toolRunner.executeTool('unknown' as any, {})).rejects.toThrow('Unknown tool');
  });
});
