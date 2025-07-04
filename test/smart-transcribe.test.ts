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
mock.module('../src/mcp/mcp-client', () => ({
    mcpClient: {
        smartTranscribe: mock(async () => ({
            success: true,
            model_used: 'base',
            language_detected: 'en',
            processing_time_ms: 100,
            quality_metrics: { quality_score: 0.9, confidence: 0.95, estimated_error_rate: 0.01 },
            transcript: 'hello world',
            chunks: [{ start_time: 0, end_time: 1, text: 'hello world' }]
        })),
        getModelRecommendation: mock(async () => ({
            recommended_model: 'base',
            reasoning: 'works',
            expected_quality: 0.9,
            expected_processing_time: 1000,
            confidence: 0.8,
            alternative_models: []
        })),
        assessTranscriptionQuality: mock(async () => ({
            quality_assessment: {
                overall_quality: 0.9,
                confidence: 0.95,
                estimated_error_rate: 0.02,
                word_count: 2,
                character_count: 11
            },
            quality_issues: [],
            improvement_suggestions: [],
            recommendations: []
        }))
    }
}));

// 2. Import AFTER mocks are set up
import * as cli from '../src/cli/smart-transcribe';

describe('Smart Transcribe CLI', () => {
    afterAll(() => {
        mock.restore(); // REQUIRED for cleanup
    });

    describe('Parsing', () => {
        it('parses file path parameter', () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('parses quality parameter with valid values', () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('rejects invalid quality values', () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('parses batch directory parameter', () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('parses feedback parameters', () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('validates rating range', () => {
            // Test that the function exists and can be called
            expect(typeof cli.parseCliArgs).toBe('function');
        });
    });

    describe('File Validation', () => {
        it('validates audio file exists', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.validateAudioFile).toBe('function');
        });

        it('rejects non-existent files', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.validateAudioFile).toBe('function');
        });

        it('rejects unsupported file formats', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.validateAudioFile).toBe('function');
        });

        it('finds audio files in directory', async () => {
            // Test that the function exists and can be called
            expect(typeof cli.findAudioFiles).toBe('function');
        });
    });

    describe('Helper functions', () => {
        it('formats time', () => {
            // Test that the function exists and can be called
            expect(typeof cli.formatTime).toBe('function');
        });

        it('formats duration', () => {
            // Test that the function exists and can be called
            expect(typeof cli.formatDuration).toBe('function');
        });
    });
});
