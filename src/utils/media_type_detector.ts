import type { MediaMetadata } from '../types/media';
import { logger } from './logger';

export type MediaCollectionType = 'tv' | 'movies' | 'youtube' | 'catchall';

export interface MediaTypeDetectionResult {
    type: MediaCollectionType;
    confidence: number; // 0-1 confidence score
    reason: string;     // Human-readable explanation
}

/**
 * Detects the appropriate media collection type based on metadata and filename
 */
export async function detectMediaType(
    filePath: string,
    metadata?: MediaMetadata
): Promise<MediaTypeDetectionResult> {
    const filename = filePath.split(/[/\\]/).pop() || '';
    
    // High confidence detection from metadata
    if (metadata?.guessed_type) {
        switch (metadata.guessed_type) {
            case 'movie':
                return {
                    type: 'movies',
                    confidence: 0.9,
                    reason: 'Detected as movie from metadata analysis'
                };
            case 'tv_episode':
                return {
                    type: 'tv',
                    confidence: 0.9,
                    reason: 'Detected as TV episode from metadata analysis'
                };
            case 'music':
            case 'podcast':
                return {
                    type: 'catchall',
                    confidence: 0.8,
                    reason: `Detected as ${metadata.guessed_type} from metadata analysis`
                };
        }
    }

    // Check for YouTube indicators
    const youtubeIndicators = [
        /youtube/i,
        /yt-dlp/i,
        /\[.*\]/,  // Common YouTube downloader format [Channel Name]
        /-\w{11}\./  // YouTube video ID pattern
    ];
    
    if (youtubeIndicators.some(pattern => pattern.test(filename))) {
        return {
            type: 'youtube',
            confidence: 0.8,
            reason: 'Filename contains YouTube indicators'
        };
    }

    // TV show patterns (high confidence)
    const tvPatterns = [
        /S\d{1,2}E\d{1,2}/i,           // S01E01
        /Season\s*\d+/i,               // Season 1
        /Episode\s*\d+/i,              // Episode 1
        /\d{1,2}x\d{1,2}/,             // 1x01
        /\.\d{1,2}\d{2}\./,            // .101. (season.episode)
    ];

    for (const pattern of tvPatterns) {
        if (pattern.test(filename)) {
            return {
                type: 'tv',
                confidence: 0.85,
                reason: `Filename matches TV pattern: ${pattern.source}`
            };
        }
    }

    // Movie patterns (medium confidence)
    const moviePatterns = [
        /\b(19|20)\d{2}\b/,            // Year (1900-2099)
        /\b(HDTV|BluRay|BDRip|DVDRip|WEBRip|WEBRIP)\b/i,
        /\b(1080p|720p|480p|4K|UHD)\b/i,
        /\b(x264|x265|H\.264|H\.265|HEVC)\b/i
    ];

    // Check if it has movie-like characteristics
    const hasMoviePattern = moviePatterns.some(pattern => pattern.test(filename));
    const hasYear = /\b(19|20)\d{2}\b/.test(filename);
    
    if (hasMoviePattern && hasYear) {
        return {
            type: 'movies',
            confidence: 0.7,
            reason: 'Filename contains movie indicators and year'
        };
    }

    if (hasMoviePattern) {
        return {
            type: 'movies',
            confidence: 0.6,
            reason: 'Filename contains movie-like patterns'
        };
    }

    // Audio file detection
    const audioExtensions = ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.wma', '.opus'];
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    
    if (audioExtensions.includes(extension)) {
        // Check if it might be a podcast or audiobook
        const podcastIndicators = [
            /podcast/i,
            /episode/i,
            /ep\d+/i,
            /audiobook/i
        ];
        
        if (podcastIndicators.some(pattern => pattern.test(filename))) {
            return {
                type: 'catchall',
                confidence: 0.7,
                reason: 'Audio file with podcast/audiobook indicators'
            };
        }
        
        return {
            type: 'catchall',
            confidence: 0.5,
            reason: 'Audio file - defaulting to catch-all'
        };
    }

    // Default fallback
    await logger.info('Could not determine media type, using default', {
        filename,
        hasMetadata: !!metadata
    });

    return {
        type: 'catchall',
        confidence: 0.3,
        reason: 'Could not determine specific type - using catch-all'
    };
}

/**
 * Extracts series information from TV show filename
 */
export function extractTvSeriesInfo(filename: string): {
    series?: string;
    season?: number;
    episode?: number;
    title?: string;
} {
    const result: any = {};

    // Try to extract season/episode numbers
    const seasonEpisodePatterns = [
        /S(\d{1,2})E(\d{1,2})/i,       // S01E01
        /Season\s*(\d+).*Episode\s*(\d+)/i, // Season 1 Episode 1
        /(\d{1,2})x(\d{1,2})/,         // 1x01
    ];

    for (const pattern of seasonEpisodePatterns) {
        const match = filename.match(pattern);
        if (match) {
            result.season = parseInt(match[1]);
            result.episode = parseInt(match[2]);
            break;
        }
    }

    // Try to extract series name (everything before season/episode info)
    if (result.season && result.episode) {
        const seriesPatterns = [
            /^(.+?)\s*S\d{1,2}E\d{1,2}/i,
            /^(.+?)\s*Season\s*\d+/i,
            /^(.+?)\s*\d{1,2}x\d{1,2}/,
        ];

        for (const pattern of seriesPatterns) {
            const match = filename.match(pattern);
            if (match) {
                result.series = match[1].replace(/[._-]/g, ' ').trim();
                break;
            }
        }
    }

    // Try to extract episode title (everything after season/episode but before extension)
    const titlePatterns = [
        /S\d{1,2}E\d{1,2}\s*-\s*(.+?)(?:\.|$)/i,
        /\d{1,2}x\d{1,2}\s*-\s*(.+?)(?:\.|$)/,
    ];

    for (const pattern of titlePatterns) {
        const match = filename.match(pattern);
        if (match) {
            result.title = match[1].replace(/\.[^.]*$/, '').replace(/[._-]/g, ' ').trim();
            break;
        }
    }

    return result;
}

/**
 * Extracts movie information from filename
 */
export function extractMovieInfo(filename: string): {
    title?: string;
    year?: number;
} {
    const result: any = {};

    // Extract year
    const yearMatch = filename.match(/\b(19|20)(\d{2})\b/);
    if (yearMatch) {
        result.year = parseInt(yearMatch[0]);
    }

    // Extract title (everything before year or quality indicators)
    const titlePatterns = [
        /^(.+?)\s*\(?(19|20)\d{2}\)?/,  // Title (Year) or Title Year
        /^(.+?)\s*\b(HDTV|BluRay|BDRip|DVDRip|WEBRip|1080p|720p|480p)/i,
        /^(.+?)\s*\b(x264|x265|H\.264|H\.265|HEVC)/i
    ];

    for (const pattern of titlePatterns) {
        const match = filename.match(pattern);
        if (match) {
            result.title = match[1].replace(/[._-]/g, ' ').trim();
            break;
        }
    }

    // If no pattern matched, use filename without extension as title
    if (!result.title) {
        result.title = filename.replace(/\.[^.]*$/, '').replace(/[._-]/g, ' ').trim();
    }

    return result;
}
