import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ShellTask } from '../src/types/task';

// Always create our own test directory to avoid conflicts between test files
const TEST_BASE_DIR = join(tmpdir(), 'shell-executor-test-' + Date.now());
const OUTPUT_DIR = join(TEST_BASE_DIR, 'outputs');

let originalBasePath: string | undefined;

beforeEach(async () => {
  // Store original BASE_PATH and set our own
  originalBasePath = process.env.BASE_PATH;
  process.env.BASE_PATH = TEST_BASE_DIR;

  // Create test directory and subdirectories
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Clear any cached config modules to ensure fresh reactive config
  // This is needed because other tests using module mocking can interfere
  try {
    delete require.cache[require.resolve('../src/config')];
  } catch (e) {
    // Ignore if require.cache doesn't work in Bun
  }
});

afterEach(async () => {
  // Always clean up our test directory
  await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });

  // Restore original BASE_PATH
  if (originalBasePath === undefined) {
    delete process.env.BASE_PATH;
  } else {
    process.env.BASE_PATH = originalBasePath;
  }
});

describe('executeShellTask', () => {
  it('executes command successfully and writes output file', async () => {
    const { executeShellTask } = await import('../src/executors/shell?t=' + Date.now());

    const task: ShellTask = {
      id: 1,
      type: 'shell',
      shell_command: 'echo "Hello"',
      status: 'pending',
      result: null,
    } as ShellTask;

    const result = await executeShellTask(task);

    expect(result.success).toBe(true);
    const expectedPath = join(OUTPUT_DIR, 'task-1-shell-output.txt');
    expect(result.outputPath).toBe(expectedPath);
    const content = await fs.readFile(expectedPath, 'utf-8');
    expect(content).toContain('Hello');
    expect(content).toContain('# Exit Code');
  });

  it('returns failure when command exits non-zero', async () => {
    const { executeShellTask } = await import('../src/executors/shell?t=' + Date.now());

    const task: ShellTask = {
      id: 2,
      type: 'shell',
      shell_command: 'exit 1',
      status: 'pending',
      result: null,
    } as ShellTask;

    const result = await executeShellTask(task);

    expect(result.success).toBe(false);
    expect(result.outputPath).toBe(join(OUTPUT_DIR, 'task-2-shell-output.txt'));
    expect(result.error).toBeDefined();
  });

  it('handles missing shell_command', async () => {
    const { executeShellTask } = await import('../src/executors/shell?t=' + Date.now());

    const task: ShellTask = {
      id: 3,
      type: 'shell',
      shell_command: '',
      status: 'pending',
      result: null,
    } as ShellTask;

    const result = await executeShellTask(task);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No shell_command found');
  });
});
