import { describe, it, expect, mock } from 'bun:test';

// Test simple utility functions that don't require complex setup
describe('Simple Utility Functions', () => {
    describe('sanitizeForFilesystem', () => {
        it('should remove illegal characters', async () => {
            const { sanitizeForFilesystem } = await import('../src/utils/filename_normalizer');
            const result = sanitizeForFilesystem('test<>file|name?.txt');
            expect(result).toBe('testfilename.txt');
        });

        it('should replace multiple spaces with single space', async () => {
            const { sanitizeForFilesystem } = await import('../src/utils/filename_normalizer');
            const result = sanitizeForFilesystem('test    file   name');
            expect(result).toBe('test file name');
        });

        it('should trim whitespace', async () => {
            const { sanitizeForFilesystem } = await import('../src/utils/filename_normalizer');
            const result = sanitizeForFilesystem('  test file  ');
            expect(result).toBe('test file');
        });

        it('should handle empty string', async () => {
            const { sanitizeForFilesystem } = await import('../src/utils/filename_normalizer');
            const result = sanitizeForFilesystem('');
            expect(result).toBe('');
        });
    });

    describe('toTitleCase', () => {
        it('should convert basic string to title case', async () => {
            const { toTitleCase } = await import('../src/utils/filename_normalizer');
            const result = toTitleCase('hello world');
            expect(result).toBe('Hello World');
        });

        it('should handle articles and prepositions correctly', async () => {
            const { toTitleCase } = await import('../src/utils/filename_normalizer');
            const result = toTitleCase('the lord of the rings');
            expect(result).toBe('The Lord of the Rings');
        });

        it('should capitalize first and last words', async () => {
            const { toTitleCase } = await import('../src/utils/filename_normalizer');
            const result = toTitleCase('a tale of two cities');
            expect(result).toBe('A Tale of Two Cities');
        });

        it('should handle single word', async () => {
            const { toTitleCase } = await import('../src/utils/filename_normalizer');
            const result = toTitleCase('hello');
            expect(result).toBe('Hello');
        });

        it('should handle empty string', async () => {
            const { toTitleCase } = await import('../src/utils/filename_normalizer');
            const result = toTitleCase('');
            expect(result).toBe('');
        });
    });

    describe('formatTemplate', () => {
        it('should replace simple variables', async () => {
            const { formatTemplate } = await import('../src/utils/filename_normalizer');
            const result = formatTemplate('Hello {name}!', { name: 'World' });
            expect(result).toBe('Hello World!');
        });

        it('should handle multiple variables', async () => {
            const { formatTemplate } = await import('../src/utils/filename_normalizer');
            const result = formatTemplate('{greeting} {name}, today is {day}', {
                greeting: 'Hello',
                name: 'Alice',
                day: 'Monday'
            });
            expect(result).toBe('Hello Alice, today is Monday');
        });

        it('should handle missing variables', async () => {
            const { formatTemplate } = await import('../src/utils/filename_normalizer');
            const result = formatTemplate('Hello {name} and {missing}!', { name: 'World' });
            expect(result).toBe('Hello World and !');
        });

        it('should handle number formatting', async () => {
            const { formatTemplate } = await import('../src/utils/filename_normalizer');
            const result = formatTemplate('Episode {episode:02d}', { episode: 5 });
            expect(result).toBe('Episode 05');
        });

        it('should handle template without variables', async () => {
            const { formatTemplate } = await import('../src/utils/filename_normalizer');
            const result = formatTemplate('No variables here', {});
            expect(result).toBe('No variables here');
        });
    });

    describe('validateFilename', () => {
        it('should validate normal filename', async () => {
            const { validateFilename } = await import('../src/utils/filename_normalizer');
            const result = validateFilename('normal_file.txt');
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect illegal characters', async () => {
            const { validateFilename } = await import('../src/utils/filename_normalizer');
            const result = validateFilename('file<name>.txt');
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should detect filename too long', async () => {
            const { validateFilename } = await import('../src/utils/filename_normalizer');
            const longName = 'a'.repeat(300) + '.txt';
            const result = validateFilename(longName);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('too long'))).toBe(true);
        });

        it('should detect reserved Windows names', async () => {
            const { validateFilename } = await import('../src/utils/filename_normalizer');
            const result = validateFilename('CON.txt');
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('reserved'))).toBe(true);
        });

        it('should handle empty filename', async () => {
            const { validateFilename } = await import('../src/utils/filename_normalizer');
            const result = validateFilename('');
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('empty'))).toBe(true);
        });
    });

    describe('Media Type Detection', () => {
        it('should detect media type from metadata', async () => {
            const { detectMediaType } = await import('../src/utils/media_type_detector');
            const metadata = {
                guessed_type: 'movie',
                title: 'The Matrix',
                year: 1999
            };

            const result = await detectMediaType('/path/to/matrix.mp4', metadata);

            expect(result.type).toBe('movies');
            expect(result.confidence).toBe(0.9);
            expect(result.reason).toContain('movie from metadata');
        });

        it('should detect TV episode from metadata', async () => {
            const { detectMediaType } = await import('../src/utils/media_type_detector');
            const metadata = {
                guessed_type: 'tv_episode',
                title: 'Breaking Bad',
                season: 1,
                episode: 1
            };

            const result = await detectMediaType('/path/to/breaking_bad_s01e01.mp4', metadata);

            expect(result.type).toBe('tv');
            expect(result.confidence).toBe(0.9);
            expect(result.reason).toContain('TV episode from metadata');
        });

        it('should handle filename without metadata', async () => {
            const { detectMediaType } = await import('../src/utils/media_type_detector');
            const result = await detectMediaType('/path/to/unknown_file.mp4');

            expect(result.type).toBe('catchall');
            expect(result.confidence).toBeLessThan(0.5);
        });

        it('should handle empty filename', async () => {
            const { detectMediaType } = await import('../src/utils/media_type_detector');
            const result = await detectMediaType('');

            expect(result.type).toBe('catchall');
            expect(result.confidence).toBeLessThan(0.5);
        });
    });

    describe('Service Health Summary', () => {
        it('should summarize all healthy services', async () => {
            const { getServiceHealthSummary } = await import('../src/utils/service-health');
            const statuses = [
                { name: 'Service 1', url: 'http://localhost:8001', healthy: true, lastChecked: new Date() },
                { name: 'Service 2', url: 'http://localhost:8002', healthy: true, lastChecked: new Date() },
                { name: 'Service 3', url: 'http://localhost:8003', healthy: true, lastChecked: new Date() }
            ];

            const summary = getServiceHealthSummary(statuses);

            expect(summary.total).toBe(3);
            expect(summary.healthy).toBe(3);
            expect(summary.unhealthy).toBe(0);
            expect(summary.healthyServices).toEqual(['Service 1', 'Service 2', 'Service 3']);
            expect(summary.unhealthyServices).toEqual([]);
        });

        it('should summarize mixed healthy and unhealthy services', async () => {
            const { getServiceHealthSummary } = await import('../src/utils/service-health');
            const statuses = [
                { name: 'Service 1', url: 'http://localhost:8001', healthy: true, lastChecked: new Date() },
                { name: 'Service 2', url: 'http://localhost:8002', healthy: false, error: 'Connection failed', lastChecked: new Date() },
                { name: 'Service 3', url: 'http://localhost:8003', healthy: true, lastChecked: new Date() }
            ];

            const summary = getServiceHealthSummary(statuses);

            expect(summary.total).toBe(3);
            expect(summary.healthy).toBe(2);
            expect(summary.unhealthy).toBe(1);
            expect(summary.healthyServices).toEqual(['Service 1', 'Service 3']);
            expect(summary.unhealthyServices).toEqual(['Service 2']);
        });

        it('should handle empty status array', async () => {
            const { getServiceHealthSummary } = await import('../src/utils/service-health');
            const summary = getServiceHealthSummary([]);

            expect(summary.total).toBe(0);
            expect(summary.healthy).toBe(0);
            expect(summary.unhealthy).toBe(0);
            expect(summary.healthyServices).toEqual([]);
            expect(summary.unhealthyServices).toEqual([]);
        });
    });

    describe('Default Services Configuration', () => {
        it('should contain expected default services', async () => {
            const { DEFAULT_SERVICES } = await import('../src/utils/service-health');
            expect(DEFAULT_SERVICES).toHaveLength(3);

            const serviceNames = DEFAULT_SERVICES.map(s => s.name);
            expect(serviceNames).toContain('Ollama');
            expect(serviceNames).toContain('ChromaDB');
            expect(serviceNames).toContain('MeiliSearch');
        });

        it('should have valid URLs for all services', async () => {
            const { DEFAULT_SERVICES } = await import('../src/utils/service-health');
            DEFAULT_SERVICES.forEach(service => {
                expect(service.url).toMatch(/^https?:\/\//);
                expect(service.name).toBeTruthy();
            });
        });
    });

    describe('Cross Platform Paths', () => {
        it('should get user home directory', async () => {
            const { getUserHomeDirectory } = await import('../src/utils/cross-platform-paths');
            const result = getUserHomeDirectory();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should get default base path', async () => {
            const { getDefaultBasePath } = await import('../src/utils/cross-platform-paths');
            const result = getDefaultBasePath();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
            // The function uses BASE_PATH env var if set, so just check it's a valid path
            expect(result).toBeTruthy();
        });

        it('should get default media path', async () => {
            const { getDefaultMediaPath } = await import('../src/utils/cross-platform-paths');
            const result = getDefaultMediaPath();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });
    });
});
