import { mock } from 'bun:test';
import { createTestDbSetup, createDbModuleMock, setupModuleMocks, type TestDbSetup } from './test-db-setup';

/**
 * Test isolation utilities to ensure proper cleanup and module isolation
 */

export interface TestIsolationSetup {
    dbSetup: TestDbSetup;
    cleanup: () => void;
}

/**
 * Creates a complete test isolation setup with database and module mocks
 */
export function createTestIsolation(additionalMocks: Record<string, any> = {}): TestIsolationSetup {
    const dbSetup = createTestDbSetup();
    
    // Standard mocks that most tests need
    const standardMocks = {
        '../src/db': () => createDbModuleMock(dbSetup),
        '../src/utils/logger': () => ({
            logger: {
                info: mock(() => Promise.resolve()),
                error: mock(() => Promise.resolve()),
                warn: mock(() => Promise.resolve()),
                debug: mock(() => Promise.resolve())
            }
        }),
        '../src/config': () => {
            // Use BASE_PATH environment variable if available, otherwise fallback to /tmp
            const basePath = process.env.BASE_PATH || '/tmp/test-isolation';
            return {
                config: {
                    paths: {
                        database: ':memory:',
                        logs: `${basePath}/logs`,
                        tasks: `${basePath}/tasks`,
                        outputs: `${basePath}/outputs`,
                        incoming: `${basePath}/incoming`,
                        processing: `${basePath}/processing`,
                        archive: `${basePath}/archive`,
                        error: `${basePath}/error`,
                        dashboard: `${basePath}/dashboard`,
                        media: `${basePath}/media`,
                        chroma: {
                            host: 'localhost',
                            port: 8000,
                            ssl: false
                        }
                    }
                }
            };
        }
    };

    // Combine standard mocks with additional ones
    const allMocks = { ...standardMocks, ...additionalMocks };
    
    // Setup module mocks
    const cleanupMocks = setupModuleMocks(allMocks);
    
    const cleanup = () => {
        dbSetup.cleanup();
        cleanupMocks();
    };

    return {
        dbSetup,
        cleanup
    };
}

/**
 * Standard logger mock that can be reused across tests
 */
export const createLoggerMock = () => ({
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
});

/**
 * Standard config mock that can be reused across tests
 */
export const createConfigMock = (overrides: any = {}) => ({
    config: {
        paths: {
            database: ':memory:',
            logs: '/tmp/test-logs',
            tasks: '/tmp/test-tasks',
            outputs: '/tmp/test-outputs',
            incoming: '/tmp/test-incoming',
            processing: '/tmp/test-processing',
            archive: '/tmp/test-archive',
            error: '/tmp/test-error',
            dashboard: '/tmp/test-dashboard',
            media: '/tmp/test-media',
            chroma: {
                host: 'localhost',
                port: 8000,
                ssl: false
            },
            ...overrides.paths
        },
        ...overrides
    }
});

/**
 * Helper to create analytics logger mock
 */
export const createAnalyticsLoggerMock = () => ({
    analyticsLogger: {
        logTaskStart: mock(() => Promise.resolve()),
        logTaskComplete: mock(() => Promise.resolve()),
        logTaskError: mock(() => Promise.resolve()),
        getTaskAnalytics: mock(() => Promise.resolve({
            total_tasks: 0,
            success_rate: 1.0,
            average_duration_ms: 1000,
            most_common_failures: [],
            task_type_stats: []
        })),
        detectBottlenecks: mock(() => Promise.resolve([])),
        cleanOldLogs: mock(() => Promise.resolve())
    }
});

/**
 * Helper to create embedding manager mock
 */
export const createEmbeddingManagerMock = () => ({
    embeddingManager: {
        addTaskEmbedding: mock(() => Promise.resolve()),
        findSimilarTasks: mock(() => Promise.resolve([])),
        initialize: mock(() => Promise.resolve()),
        shutdown: mock(() => Promise.resolve()),
        deleteTaskEmbedding: mock(() => Promise.resolve()),
        getCollectionStats: mock(() => Promise.resolve({ count: 0 })),
        clearAllEmbeddings: mock(() => Promise.resolve())
    }
});

/**
 * Helper to create feedback tracker mock
 */
export const createFeedbackTrackerMock = () => ({
    feedbackTracker: {
        addFeedback: mock(() => Promise.resolve()),
        getFeedbackStats: mock(() => ({ total: 0, byType: {} })),
        getRecentFeedback: mock(() => []),
        analyzeFeedbackPatterns: mock(() => Promise.resolve([])),
        generateLearningRules: mock(() => Promise.resolve([])),
        applyLearningRule: mock(() => Promise.resolve(true)),
        getTopCorrections: mock(() => Promise.resolve([]))
    }
});

/**
 * Utility to ensure proper test cleanup in afterEach/afterAll
 */
export function ensureTestCleanup(cleanupFn: () => void) {
    // Store the cleanup function to be called in afterEach/afterAll
    return cleanupFn;
}
