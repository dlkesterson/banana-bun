import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { standardMockConfig } from './utils/standard-mock-config';
import type { MediaMetadata } from '../src/types/media';

// 1. Set up ALL mocks BEFORE any imports
// CRITICAL: Use standardMockConfig to prevent module interference
const mediaOrganizerConfig = {
    ...standardMockConfig,
    media: {
        ...standardMockConfig.media,
        collectionTv: '/test/Shows',
        collectionMovies: '/test/Movies',
        collectionYouTube: '/test/YouTube',
        collectionCatchAll: '/test/Downloads',
        organize: {
            enabled: true,
            auto_organize_after_ingest: true,
            categorization: {
                useMetadataType: true,
                fallbackToFilename: true,
                defaultCategory: 'catchall' as const
            },
            folderStructure: {
                movies: {
                    pattern: "{title} ({year})",
                    groupByYear: false,
                    groupByGenre: false
                },
                tv: {
                    pattern: "{series}/Season {season:02d}/{series} - S{season:02d}E{episode:02d} - {title}",
                    groupBySeries: true
                },
                youtube: {
                    pattern: "{channel}/{title}",
                    groupByChannel: true
                }
            },
            filenameNormalization: {
                maxLength: 180,
                case: "title" as const,
                replaceSpaces: false,
                sanitizeChars: true
            }
        }
    }
};

mock.module('../src/config', () => ({
    config: mediaOrganizerConfig
}));

mock.module('../src/utils/logger', () => ({
    logger: {
        info: mock(() => Promise.resolve()),
        error: mock(() => Promise.resolve()),
        warn: mock(() => Promise.resolve())
    }
}));

// Mock hash utility with configurable mock
const mockHashFile = mock(() => Promise.resolve('mock-hash-123'));
mock.module('../src/utils/hash', () => ({
    hashFile: mockHashFile
}));

// 2. Import AFTER mocks are set up - Use dynamic imports to avoid module interference
// import { detectMediaType, extractTvSeriesInfo, extractMovieInfo } from '../src/utils/media_type_detector';
// import { normalizeFilename, sanitizeForFilesystem, formatTemplate } from '../src/utils/filename_normalizer';
// import { createOrganizationPlan, executeOrganizationPlan } from '../src/utils/media_organizer';

describe('Media Type Detector', () => {
    beforeEach(() => {
        mockHashFile.mockReset();
        mockHashFile.mockResolvedValue('mock-hash-123');
    });

    afterEach(() => {
        mock.restore();
    });
    it('should detect TV shows from filename patterns', async () => {
        const { detectMediaType } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const result = await detectMediaType('The.Office.S01E01.Pilot.mkv');
        expect(result.type).toBe('tv');
        expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect movies from year patterns', async () => {
        const { detectMediaType } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const result = await detectMediaType('The Matrix (1999).mp4');
        expect(result.type).toBe('movies');
        expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should detect YouTube content', async () => {
        const { detectMediaType } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const result = await detectMediaType('[Channel Name] Video Title.mp4');
        expect(result.type).toBe('youtube');
        expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should use metadata when available', async () => {
        const { detectMediaType } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const metadata: Partial<MediaMetadata> = {
            guessed_type: 'movie'
        };
        const result = await detectMediaType('random_filename.mkv', metadata as MediaMetadata);
        expect(result.type).toBe('movies');
        expect(result.confidence).toBe(0.9);
    });

    it('should fallback to catch-all for unknown types', async () => {
        const { detectMediaType } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const result = await detectMediaType('unknown_file.txt');
        expect(result.type).toBe('catchall');
        expect(result.confidence).toBeLessThan(0.5);
    });
});

describe('TV Series Info Extraction', () => {
    it('should extract series info from S01E01 pattern', async () => {
        const { extractTvSeriesInfo } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const info = extractTvSeriesInfo('The.Office.S01E01 - Pilot.mkv');
        expect(info.series).toBe('The Office');
        expect(info.season).toBe(1);
        expect(info.episode).toBe(1);
        expect(info.title).toBe('Pilot');
    });

    it('should extract series info from Season/Episode pattern', async () => {
        const { extractTvSeriesInfo } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const info = extractTvSeriesInfo('Breaking Bad Season 1 Episode 1.mp4');
        expect(info.series).toBe('Breaking Bad');
        expect(info.season).toBe(1);
        expect(info.episode).toBe(1);
    });

    it('should extract series info from 1x01 pattern', async () => {
        const { extractTvSeriesInfo } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const info = extractTvSeriesInfo('Friends 1x01 - The One Where Monica Gets a Roommate.avi');
        expect(info.series).toBe('Friends');
        expect(info.season).toBe(1);
        expect(info.episode).toBe(1);
        expect(info.title).toBe('The One Where Monica Gets a Roommate');
    });
});

describe('Movie Info Extraction', () => {
    it('should extract movie title and year', async () => {
        const { extractMovieInfo } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const info = extractMovieInfo('The Matrix (1999).mkv');
        expect(info.title).toBe('The Matrix');
        expect(info.year).toBe(1999);
    });

    it('should extract title from quality indicators', async () => {
        const { extractMovieInfo } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const info = extractMovieInfo('Inception.2010.1080p.BluRay.x264.mkv');
        expect(info.title).toBe('Inception');
        expect(info.year).toBe(2010);
    });

    it('should handle titles without years', async () => {
        const { extractMovieInfo } = await import('../src/utils/media_type_detector?t=' + Date.now());
        const info = extractMovieInfo('Some Movie Title.mp4');
        expect(info.title).toBe('Some Movie Title');
        expect(info.year).toBeUndefined();
    });
});

describe('Filename Normalizer', () => {
    it('should sanitize illegal characters', async () => {
        const { sanitizeForFilesystem } = await import('../src/utils/filename_normalizer?t=' + Date.now());
        const result = sanitizeForFilesystem('File<>:"/\\|?*Name.txt');
        expect(result).toBe('FileName.txt');
    });

    it('should normalize to title case', async () => {
        const { normalizeFilename } = await import('../src/utils/filename_normalizer?t=' + Date.now());
        const result = normalizeFilename('the matrix reloaded.mkv', { case: 'title' });
        expect(result).toBe('The Matrix Reloaded.mkv');
    });

    it('should truncate long filenames', async () => {
        const { normalizeFilename } = await import('../src/utils/filename_normalizer?t=' + Date.now());
        const longName = 'a'.repeat(200) + '.mkv';
        const result = normalizeFilename(longName, { maxLength: 50 });
        expect(result.length).toBeLessThanOrEqual(50);
        expect(result.endsWith('.mkv')).toBe(true);
    });

    it('should replace spaces when requested', async () => {
        const { normalizeFilename } = await import('../src/utils/filename_normalizer?t=' + Date.now());
        const result = normalizeFilename('File Name.txt', { replaceSpaces: true });
        expect(result).toBe('File.Name.txt');
    });
});

describe('Template Formatting', () => {
    it('should format TV show template', async () => {
        const { formatTemplate } = await import('../src/utils/filename_normalizer?t=' + Date.now());
        const template = "{series}/Season {season:02d}/{series} - S{season:02d}E{episode:02d} - {title}";
        const variables = {
            series: 'The Office',
            season: 1,
            episode: 1,
            title: 'Pilot'
        };
        const result = formatTemplate(template, variables);
        expect(result).toBe('The Office/Season 01/The Office - S01E01 - Pilot');
    });

    it('should format movie template', async () => {
        const { formatTemplate } = await import('../src/utils/filename_normalizer?t=' + Date.now());
        const template = "{title} ({year})";
        const variables = {
            title: 'The Matrix',
            year: 1999
        };
        const result = formatTemplate(template, variables);
        expect(result).toBe('The Matrix (1999)');
    });

    it('should handle missing variables', async () => {
        const { formatTemplate } = await import('../src/utils/filename_normalizer?t=' + Date.now());
        const template = "{title} ({year})";
        const variables = {
            title: 'Movie Title'
        };
        const result = formatTemplate(template, variables);
        expect(result).toBe('Movie Title ()');
    });
});

describe('Organization Plan Creation', () => {
    it('should create plan for TV show', async () => {
        const { createOrganizationPlan } = await import('../src/utils/media_organizer?t=' + Date.now());
        const plan = await createOrganizationPlan('/source/The.Office.S01E01 - Pilot.mkv');
        expect(plan.collectionType).toBe('tv');
        expect(plan.targetDirectory).toContain('Shows');
        expect(plan.targetDirectory).toContain('The Office');
        expect(plan.targetDirectory).toContain('Season 01');
        expect(plan.filename).toMatch(/S01E01/i);
    });

    it('should create plan for movie', async () => {
        const { createOrganizationPlan } = await import('../src/utils/media_organizer?t=' + Date.now());
        const plan = await createOrganizationPlan('/source/The Matrix (1999).mkv');
        expect(plan.collectionType).toBe('movies');
        expect(plan.targetDirectory).toContain('Movies');
        expect(plan.filename).toContain('The Matrix (1999)');
    });

    it('should respect forced collection type', async () => {
        const { createOrganizationPlan } = await import('../src/utils/media_organizer?t=' + Date.now());
        const plan = await createOrganizationPlan('/source/random.mkv', undefined, 'youtube');
        expect(plan.collectionType).toBe('youtube');
        expect(plan.targetDirectory).toContain('YouTube');
    });

    it('should default to catch-all when type is unknown', async () => {
        const { createOrganizationPlan } = await import('../src/utils/media_organizer?t=' + Date.now());
        const plan = await createOrganizationPlan('/source/unknown_file.mp4');
        expect(plan.collectionType).toBe('catchall');
        expect(plan.targetDirectory).toContain('Downloads');
        expect(plan.filename).toBe('Unknown_file.mp4');
    });
});

describe('Organization Plan Execution', () => {
    const tempDir = '/tmp/media-organizer-test';

    beforeEach(async () => {
        // Create temp directory structure
        await fs.mkdir(tempDir, { recursive: true });
        await fs.mkdir(join(tempDir, 'source'), { recursive: true });
        await fs.mkdir(join(tempDir, 'target'), { recursive: true });
    });

    afterEach(async () => {
        // Clean up temp directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    it('should execute dry run without moving files', async () => {
        const { executeOrganizationPlan } = await import('../src/utils/media_organizer?t=' + Date.now());
        const sourceFile = join(tempDir, 'source', 'test.mkv');
        await fs.writeFile(sourceFile, 'test content');

        const plan = {
            originalPath: sourceFile,
            targetPath: join(tempDir, 'target', 'test.mkv'),
            targetDirectory: join(tempDir, 'target'),
            filename: 'test.mkv',
            collectionType: 'catchall' as const
        };

        const result = await executeOrganizationPlan(plan, { dryRun: true });

        expect(result.success).toBe(true);
        expect(result.reason).toContain('Dry run');

        // File should still exist in source
        const sourceExists = await fs.access(sourceFile).then(() => true).catch(() => false);
        expect(sourceExists).toBe(true);
    });

    it('should move file when run normally', async () => {
        const { executeOrganizationPlan } = await import('../src/utils/media_organizer?t=' + Date.now());
        const sourceFile = join(tempDir, 'source', 'move.mkv');
        await fs.writeFile(sourceFile, 'abc');

        const targetFile = join(tempDir, 'target', 'move.mkv');
        const plan = {
            originalPath: sourceFile,
            targetPath: targetFile,
            targetDirectory: join(tempDir, 'target'),
            filename: 'move.mkv',
            collectionType: 'catchall' as const
        };

        const result = await executeOrganizationPlan(plan);

        expect(result.success).toBe(true);
        expect(result.actualPath).toBe(targetFile);
        const existsSource = await fs.access(sourceFile).then(() => true).catch(() => false);
        const existsTarget = await fs.access(targetFile).then(() => true).catch(() => false);
        expect(existsSource).toBe(false);
        expect(existsTarget).toBe(true);
    });

    it('should skip move when identical file exists', async () => {
        const { executeOrganizationPlan } = await import('../src/utils/media_organizer?t=' + Date.now());
        const sourceFile = join(tempDir, 'source', 'same.mkv');
        const targetFile = join(tempDir, 'target', 'same.mkv');
        await fs.writeFile(sourceFile, '123');
        await fs.writeFile(targetFile, '123');

        const plan = {
            originalPath: sourceFile,
            targetPath: targetFile,
            targetDirectory: join(tempDir, 'target'),
            filename: 'same.mkv',
            collectionType: 'catchall' as const
        };

        const result = await executeOrganizationPlan(plan);

        expect(result.success).toBe(true);
        expect(result.skipped).toBe(true);
        expect(result.actualPath).toBe(targetFile);
        const existsSource = await fs.access(sourceFile).then(() => true).catch(() => false);
        expect(existsSource).toBe(true);
    });

    it('should create safe filename when different file exists', async () => {
        const { executeOrganizationPlan } = await import('../src/utils/media_organizer?t=' + Date.now());
        const sourceFile = join(tempDir, 'source', 'conflict.mkv');
        const targetFile = join(tempDir, 'target', 'conflict.mkv');
        await fs.writeFile(sourceFile, 'aaa');
        await fs.writeFile(targetFile, 'bbb');

        mockHashFile.mockResolvedValueOnce('hash-source').mockResolvedValueOnce('hash-target');

        const plan = {
            originalPath: sourceFile,
            targetPath: targetFile,
            targetDirectory: join(tempDir, 'target'),
            filename: 'conflict.mkv',
            collectionType: 'catchall' as const
        };

        const result = await executeOrganizationPlan(plan);

        expect(result.success).toBe(true);
        expect(result.actualPath).not.toBe(targetFile);
        const existsNew = await fs.access(result.actualPath!).then(() => true).catch(() => false);
        const existsSource = await fs.access(sourceFile).then(() => true).catch(() => false);
        expect(existsNew).toBe(true);
        expect(existsSource).toBe(false);
    });
});
