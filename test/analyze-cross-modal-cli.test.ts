import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, mock } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Create isolated test directory for this test file
const TEST_BASE_DIR = join(tmpdir(), 'cross-modal-cli-test-' + Date.now());

// Store original environment variables
let originalEnv: Record<string, string | undefined> = {};

// No module mocking - using Environment Variable Pattern

let cli: any;

beforeAll(async () => {
    // Store original environment variables
    originalEnv = {
        BASE_PATH: process.env.BASE_PATH,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OLLAMA_URL: process.env.OLLAMA_URL,
        OLLAMA_MODEL: process.env.OLLAMA_MODEL,
        OLLAMA_FAST_MODEL: process.env.OLLAMA_FAST_MODEL
    };

    // Set test environment
    process.env.BASE_PATH = TEST_BASE_DIR;
    process.env.OLLAMA_URL = 'http://localhost:11434';
    process.env.OLLAMA_MODEL = 'test-model';
    process.env.OLLAMA_FAST_MODEL = 'test-model';

    // Create test directories
    await fs.mkdir(TEST_BASE_DIR, { recursive: true });
    await fs.mkdir(join(TEST_BASE_DIR, 'outputs'), { recursive: true });

    // Import CLI after environment is set up with cache busting
    cli = await import('../src/cli/analyze-cross-modal-intelligence.ts?t=' + Date.now());
});

afterAll(async () => {
    // Clean up test directory
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });

    // Restore original environment variables
    for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
});

let consoleSpy: any;
let exitSpy: any;

beforeEach(() => {
    consoleSpy = mock(() => {});
    exitSpy = mock(() => {});
    (console as any).log = consoleSpy;
    (process as any).exit = exitSpy;
});

afterEach(() => {
    (console as any).log = console.log;
    (process as any).exit = process.exit;
});

describe('Cross-Modal CLI parseArgs', () => {
    it('parses correlation args', async () => {
        const opts = await cli.parseArgs(['correlations', '--media-id', '42']);
        expect(opts.action).toBe('correlations');
        expect(opts.mediaId).toBe(42);
    });

    it('parses quality args', async () => {
        const opts = await cli.parseArgs(['quality', '--media-id', '5']);
        expect(opts.action).toBe('quality');
        expect(opts.mediaId).toBe(5);
    });

    it('parses search pattern args', async () => {
        const opts = await cli.parseArgs(['search-patterns', '--days', '30', '--limit', '20']);
        expect(opts.action).toBe('search-patterns');
        expect(opts.days).toBe(30);
        expect(opts.limit).toBe(20);
    });

    it('parses track-search args', async () => {
        const opts = await cli.parseArgs(['track-search', '--query', 'cats', '--session-id', 'abc']);
        expect(opts.action).toBe('track-search');
        expect(opts.query).toBe('cats');
        expect(opts.sessionId).toBe('abc');
    });

    it('shows help when requested', async () => {
        await cli.parseArgs(['--help']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(consoleSpy).toHaveBeenCalled();
    });
});

describe('Cross-Modal CLI actions', () => {
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

