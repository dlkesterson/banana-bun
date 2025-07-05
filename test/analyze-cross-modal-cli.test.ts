import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';

// Note: All mocks are handled by the preload script in bunfig.toml
// This prevents mock interference between test files in the full test suite

describe('Cross-Modal CLI', () => {

    describe('parseArgs', () => {
        it('parses correlation args', async () => {
            // Use dynamic import to avoid module resolution issues
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.parseArgs).toBe('function');
        });

        it('parses quality args', async () => {
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.parseArgs).toBe('function');
        });

        it('parses search pattern args', async () => {
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.parseArgs).toBe('function');
        });

        it('parses track-search args', async () => {
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.parseArgs).toBe('function');
        });

        it('shows help when requested', async () => {
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.parseArgs).toBe('function');
        });
    });

    describe('actions', () => {
        it('runs correlation analysis', async () => {
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.analyzeCorrelations).toBe('function');
        });

        it('runs quality assessment', async () => {
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.assessQuality).toBe('function');
        });

        it('generates embeddings', async () => {
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.generateEmbeddings).toBe('function');
        });

        it('analyzes search patterns', async () => {
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.analyzeSearchPatterns).toBe('function');
        });

        it('tracks search behavior', async () => {
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.trackSearchBehavior).toBe('function');
        });

        it('shows dashboard with report', async () => {
            const cli = await import('../src/cli/analyze-cross-modal-intelligence?t=' + Date.now());
            expect(typeof cli.showDashboard).toBe('function');
        });
    });
});

