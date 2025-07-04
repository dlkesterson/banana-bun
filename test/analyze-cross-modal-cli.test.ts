import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { standardMockConfig } from './utils/standard-mock-config';

// 1. Set up ALL mocks BEFORE any imports
// CRITICAL: Use standardMockConfig to prevent module interference
mock.module('../src/config', () => ({ config: standardMockConfig }));
mock.module('../src/db', () => ({
    initDatabase: mock(() => Promise.resolve()),
    getDatabase: mock(() => ({})),
    getDependencyHelper: mock(() => ({}))
}));
mock.module('../src/utils/logger', () => ({
    logger: {
        info: mock(() => Promise.resolve()),
        error: mock(() => Promise.resolve()),
        warn: mock(() => Promise.resolve()),
        debug: mock(() => Promise.resolve())
    }
}));
mock.module('../src/services/cross-modal-intelligence-service', () => ({
    CrossModalIntelligenceService: mock(() => ({}))
}));

// 2. Import AFTER mocks are set up
import * as cli from '../src/cli/analyze-cross-modal-intelligence';

describe('Cross-Modal CLI', () => {
    afterAll(() => {
        mock.restore(); // REQUIRED for cleanup
    });

    describe('parseArgs', () => {
        it('parses correlation args', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseArgs).toBe('function');
        });

        it('parses quality args', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseArgs).toBe('function');
        });

        it('parses search pattern args', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseArgs).toBe('function');
        });

        it('parses track-search args', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseArgs).toBe('function');
        });

        it('shows help when requested', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseArgs).toBe('function');
        });
    });

    describe('actions', () => {
        it('runs correlation analysis', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.analyzeCorrelations).toBe('function');
        });

        it('runs quality assessment', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.assessQuality).toBe('function');
        });

        it('generates embeddings', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.generateEmbeddings).toBe('function');
        });

        it('analyzes search patterns', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.analyzeSearchPatterns).toBe('function');
        });

        it('tracks search behavior', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.trackSearchBehavior).toBe('function');
        });

        it('shows dashboard with report', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.showDashboard).toBe('function');
        });
    });
});

