import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { standardMockConfig } from './utils/standard-mock-config';
import type { ShellTask } from '../src/types/task';

// Always create our own test directory to avoid conflicts between test files
const TEST_BASE_DIR = join(tmpdir(), 'shell-executor-test-' + Date.now());
const OUTPUT_DIR = join(TEST_BASE_DIR, 'outputs');

// Create custom config for this test that uses our test directory
const shellExecutorTestConfig = {
    ...standardMockConfig,
    paths: {
        ...standardMockConfig.paths,
        outputs: OUTPUT_DIR,
        logs: join(TEST_BASE_DIR, 'logs'),
        tasks: join(TEST_BASE_DIR, 'tasks')
    }
};

// 1. Set up ALL mocks BEFORE any imports
// CRITICAL: Use custom config to prevent module interference
mock.module('../src/config', () => ({ config: shellExecutorTestConfig }));

mock.module('../src/utils/logger', () => ({
    logger: {
        info: mock(() => Promise.resolve()),
        error: mock(() => Promise.resolve()),
        warn: mock(() => Promise.resolve()),
        debug: mock(() => Promise.resolve())
    }
}));

// 2. Import AFTER mocks are set up - use dynamic import to avoid interference
let executeShellTask: typeof import('../src/executors/shell').executeShellTask;

describe('executeShellTask', () => {
    afterAll(() => {
        mock.restore(); // REQUIRED for cleanup
    });

    beforeEach(async () => {
        // Import with cache busting to avoid interference from other tests
        const shellModule = await import('../src/executors/shell?t=' + Date.now());
        executeShellTask = shellModule.executeShellTask;

        // Create test directory and subdirectories
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
    });

    afterEach(async () => {
        // Always clean up our test directory
        await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    });

    it('executes command successfully and writes output file', async () => {

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
