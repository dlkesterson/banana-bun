/**
 * Test utilities index - exports all test infrastructure
 * Addresses PRD 4: Test Infrastructure Modernization
 */

// Mock factories
export {
    createMock,
    createDatabaseMock,
    createLoggerMock,
    createConfigMock,
    createMCPServerMock,
    createMCPClientMock,
    createWebSocketMock,
    createWebSocketServerMock,
    createFetchMock,
    createFileSystemMock,
    createProcessMock,
    createMeilisearchServiceMock,
    createChromaDBServiceMock,
    createWhisperServiceMock,
    resetAllMocks
} from './mock-factories';

// Test data factories
export {
    TaskTestFactory,
    DatabaseTestFactory,
    UserInteractionTestFactory,
    MCPResponseTestFactory
} from './test-data-factories';

// Test helpers and utilities
export {
    TestDatabaseSetup,
    MCPServerTestUtils,
    CommonTestSetup,
    assertIsString,
    assertIsNumber,
    assertIsArray,
    assertIsObject
} from './test-helpers';

// Re-export existing task factories for compatibility
export * from './task-factories';
