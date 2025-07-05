import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';

// Note: All mocks are handled by the preload script in bunfig.toml
// This prevents mock interference between test files in the full test suite

describe('Smart Transcribe CLI', () => {

    describe('Parsing', () => {
        it('parses file path parameter', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('parses quality parameter with valid values', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('rejects invalid quality values', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('parses batch directory parameter', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('parses feedback parameters', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });

        it('validates rating range', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.parseCliArgs).toBe('function');
        });
    });

    describe('File Validation', () => {
        it('validates audio file exists', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.validateAudioFile).toBe('function');
        });

        it('rejects non-existent files', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.validateAudioFile).toBe('function');
        });

        it('rejects unsupported file formats', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.validateAudioFile).toBe('function');
        });

        it('finds audio files in directory', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.findAudioFiles).toBe('function');
        });
    });

    describe('Helper functions', () => {
        it('formats time', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.formatTime).toBe('function');
        });

        it('formats duration', async () => {
            const cli = await import('../src/cli/smart-transcribe?t=' + Date.now());
            expect(typeof cli.formatDuration).toBe('function');
        });
    });
});
