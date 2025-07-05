import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';

// Mock all dependencies that the summarize module needs
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));

const mockSummarizerService = {
    isInitialized: mock(() => true),
    generateSummaryForMedia: mock(() => Promise.resolve({ success: true, summary: 'test summary' }))
};
mock.module('../src/services/summarizer', () => ({ summarizerService: mockSummarizerService }));

const mockGetDatabase = mock(() => ({
    prepare: mock(() => ({
        get: mock(() => undefined),
        run: mock(() => ({ lastInsertRowid: 1 }))
    }))
}));
mock.module('../src/db', () => ({
    getDatabase: mockGetDatabase,
    initDatabase: mock(() => Promise.resolve()),
    getDependencyHelper: mock(() => ({}))
}));

// Mock analytics logger so we can verify calls
const mockAnalyticsLogger = {
    logTaskStart: mock(() => Promise.resolve()),
    logTaskComplete: mock(() => Promise.resolve()),
    logTaskError: mock(() => Promise.resolve())
};
mock.module('../src/analytics/logger', () => ({ analyticsLogger: mockAnalyticsLogger }));

// Mock shell executor used by dispatcher - use a more realistic path
const mockExecuteShellTask = mock(async (task: any) => ({
    success: true,
    outputPath: `/tmp/test-outputs/task-${task.id || 'unknown'}-shell-output.txt`
}));

// Use a scoped mock that only affects this test file
let executeTask: typeof import('../src/executors/dispatcher').executeTask;

describe('executeTask dispatcher', () => {
    beforeEach(async () => {
        // Set up scoped mock for this test suite only
        mock.module('../src/executors/shell', () => ({ executeShellTask: mockExecuteShellTask }));

        // Import the module after setting up the mock
        const dispatcherModule = await import('../src/executors/dispatcher?t=' + Date.now());
        executeTask = dispatcherModule.executeTask;

        mockExecuteShellTask.mockClear();
        Object.values(mockAnalyticsLogger).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                (fn as any).mockClear();
            }
        });
    });

    afterEach(() => {
        // Clean up the mock after each test
        mock.restore();
    });

    it('dispatches shell task and logs completion', async () => {
        const task = { id: 1, type: 'shell', shell_command: 'echo hi', status: 'pending', result: null } as const;
        const result = await executeTask(task);

        expect(mockExecuteShellTask).toHaveBeenCalledWith(task);
        expect(mockAnalyticsLogger.logTaskStart).toHaveBeenCalledWith(task);
        expect(mockAnalyticsLogger.logTaskComplete).toHaveBeenCalledWith(task, expect.any(Number));
        expect(mockAnalyticsLogger.logTaskError).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.outputPath).toBe('/tmp/test-outputs/task-1-shell-output.txt');
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


