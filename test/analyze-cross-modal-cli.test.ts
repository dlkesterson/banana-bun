import { describe, it, expect, mock, beforeEach, afterEach, beforeAll } from 'bun:test';

// Mock chromadb module to avoid dependency issues
mock.module('chromadb', () => ({ ChromaClient: class {} }));

let cli: typeof import('../src/cli/analyze-cross-modal-intelligence');

beforeAll(async () => {
    cli = await import('../src/cli/analyze-cross-modal-intelligence');
});

type MockService = {
    analyzeSearchTranscriptTagCorrelation: ReturnType<typeof mock>;
    assessContentQuality: ReturnType<typeof mock>;
    generateCrossModalEmbedding: ReturnType<typeof mock>;
    trackSearchBehavior: ReturnType<typeof mock>;
};

let consoleSpy: ReturnType<typeof mock>;
let exitSpy: ReturnType<typeof mock>;
let service: MockService;

beforeEach(() => {
    consoleSpy = mock(() => {});
    exitSpy = mock(() => {});
    (console as any).log = consoleSpy;
    (process as any).exit = exitSpy;

    service = {
        analyzeSearchTranscriptTagCorrelation: mock(() =>
            Promise.resolve({
                media_id: 1,
                search_queries: ['cats'],
                transcript_segments: [
                    {
                        text: 'cats are great',
                        start_time: 0,
                        end_time: 1,
                        relevance_score: 0.8,
                        matched_terms: ['cats']
                    }
                ],
                current_tags: ['pets'],
                suggested_tags: ['animals'],
                correlation_score: 0.75,
                confidence: 0.9,
                improvement_potential: 0.25
            })
        ),
        assessContentQuality: mock(() =>
            Promise.resolve({
                media_id: 1,
                engagement_score: 0.7,
                search_discoverability: 0.6,
                tag_accuracy: 0.5,
                transcript_quality: 0.9,
                overall_quality: 0.8,
                improvement_suggestions: ['Improve tags']
            })
        ),
        generateCrossModalEmbedding: mock(() =>
            Promise.resolve({
                media_id: 1,
                text_embedding: [0.1, 0.2],
                metadata_features: [0.3],
                combined_embedding: [0.1, 0.2, 0.3],
                embedding_quality: 0.88
            })
        ),
        trackSearchBehavior: mock(() => Promise.resolve())
    } as MockService;
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
        await cli.analyzeCorrelations(service as any, { action: 'correlations', mediaId: 1 });
        expect(service.analyzeSearchTranscriptTagCorrelation).toHaveBeenCalledWith(1);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Correlation Analysis Results:'));
    });

    it('runs quality assessment', async () => {
        await cli.assessQuality(service as any, { action: 'quality', mediaId: 1 });
        expect(service.assessContentQuality).toHaveBeenCalledWith(1);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Content Quality Assessment:'));
    });

    it('generates embeddings', async () => {
        await cli.generateEmbeddings(service as any, { action: 'embeddings', mediaId: 1 });
        expect(service.generateCrossModalEmbedding).toHaveBeenCalledWith(1);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cross-Modal Embedding Generated:'));
    });

    it('analyzes search patterns', async () => {
        await cli.analyzeSearchPatterns(service as any, { action: 'search-patterns', days: 7 });
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Search Pattern Analysis:'));
    });

    it('tracks search behavior', async () => {
        await cli.trackSearchBehavior(service as any, { action: 'track-search', query: 'cats', sessionId: 's1' });
        expect(service.trackSearchBehavior).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Search behavior tracked:'));
    });

    it('shows dashboard with report', async () => {
        await cli.showDashboard(service as any, { action: 'dashboard', generateReport: true });
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cross-Modal Intelligence Dashboard'));
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Detailed Report'));
    });
});

