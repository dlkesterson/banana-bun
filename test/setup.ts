/**
 * Global test setup configuration for Bun
 * Addresses PRD 4: Test Infrastructure Modernization
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { CommonTestSetup } from '../src/test-utils';

// Setup global mocks before all tests
beforeAll(async () => {
    // Setup common mocks
    CommonTestSetup.setupMockModules();
    CommonTestSetup.setupMCPMocks();

    console.log('🧪 Test infrastructure initialized');
});

// Cleanup after all tests
afterAll(async () => {
    console.log('🧹 Test cleanup completed');
});

// Reset mocks before each test
beforeEach(async () => {
    // Reset any global state
    process.env.NODE_ENV = 'test';
});

// Cleanup after each test
afterEach(async () => {
    // Wait for any pending async operations
    await CommonTestSetup.waitForAsync(10);
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Helper functions for test validation
export function isValidTaskResult(received: any): boolean {
    return received &&
           typeof received.success === 'boolean' &&
           (received.success || typeof received.error === 'string');
}

export function isValidMCPResponse(received: any): boolean {
    return received &&
           (received.content || received.error) &&
           (!received.content || Array.isArray(received.content)) &&
           (!received.error || (typeof received.error.code === 'number' && typeof received.error.message === 'string'));
}
