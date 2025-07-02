import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { promises as fs } from 'fs';
import type { CodeTask } from '../src/types/task';

const mockConfig = {
    paths: {
        incoming: '/tmp/test-incoming',
        processing: '/tmp/test-processing',
        archive: '/tmp/test-archive',
        error: '/tmp/test-error',
        tasks: '/tmp/test-tasks',
        outputs: '/tmp/code-executor-tests',
        logs: '/tmp/test-logs',
        dashboard: '/tmp/test-dashboard',
        database: ':memory:',
        media: '/tmp/test-media',
        chroma: {
            host: 'localhost',
            port: 8000,
            ssl: false
        }
    },
    openai: {
        apiKey: 'test-api-key',
        model: 'gpt-4'
    },
    ollama: {
        url: 'http://localhost:11434',
        model: 'mock-model',
        fastModel: 'mock-model'
    }
};
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve())
};

mock.module('../src/config', () => ({ config: mockConfig }));
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));

let executeCodeTask: typeof import('../src/executors/code').executeCodeTask;

beforeEach(async () => {
    await fs.mkdir(mockConfig.paths.outputs, { recursive: true });
    const mod = await import('../src/executors/code');
    executeCodeTask = mod.executeCodeTask;
});

afterEach(async () => {
    await fs.rm(mockConfig.paths.outputs, { recursive: true, force: true });
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
    (global.fetch as any).mockReset?.();
});

describe('executeCodeTask', () => {
    it('extracts code from markdown block', async () => {
        const mockFetch = mock(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ response: '```python\nprint("hi")\n```' })
        }));
        global.fetch = mockFetch as any;

        const task: CodeTask = { id: 1, type: 'code', description: 'Test', status: 'pending', result: null };
        const result = await executeCodeTask(task);

        expect(result.success).toBe(true);
        expect(result.outputPath).toMatch(/\.py$/);
        const content = await fs.readFile(result.outputPath!, 'utf-8');
        expect(content.trim()).toBe('print("hi")');
    });

    it('infers language from code block label', async () => {
        const mockFetch = mock(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ response: 'console.log("test");' })
        }));
        global.fetch = mockFetch as any;

        const task: CodeTask = { id: 2, type: 'code', description: 'Example ```ts', status: 'pending', result: null };
        const result = await executeCodeTask(task);

        expect(result.success).toBe(true);
        expect(result.outputPath).toMatch(/\.ts$/);
        const call = mockFetch.mock.calls[0] || [undefined, {}];
        const body = JSON.parse((call[1] as RequestInit).body as string);
        expect(body.prompt.toLowerCase()).toContain('typescript');
    });

    it('defaults to python when language is unknown', async () => {
        const mockFetch = mock(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ response: 'print("default")' })
        }));
        global.fetch = mockFetch as any;

        const task: CodeTask = { id: 3, type: 'code', description: 'Do something', status: 'pending', result: null };
        const result = await executeCodeTask(task);

        expect(result.success).toBe(true);
        expect(result.outputPath).toMatch(/\.py$/);
        const call = mockFetch.mock.calls[0] || [undefined, {}];
        const body = JSON.parse((call[1] as RequestInit).body as string);
        expect(body.prompt.toLowerCase()).toContain('python');
    });

    it('handles API failure', async () => {
        const mockFetch = mock(() => Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        } as any));
        global.fetch = mockFetch as any;

        const task: CodeTask = { id: 4, type: 'code', description: 'Fail', status: 'pending', result: null };
        const result = await executeCodeTask(task);

        expect(result.success).toBe(false);
        expect(result.error).toContain('500');
        expect(mockLogger.error).toHaveBeenCalled();
    });
});
