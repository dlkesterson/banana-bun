import { promises as fs } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { config } from '../config';
import type { MediaMetadata } from '../types/media';
import type { MediaOrganizeTask } from '../types/task';
import { detectMediaType, extractTvSeriesInfo, extractMovieInfo, type MediaCollectionType } from './media_type_detector';
import { normalizeFilename, formatTemplate, generateSafeFilename, validateFilename } from './filename_normalizer';
import { logger } from './logger';
import { hashFile } from './hash';

export interface OrganizationResult {
    success: boolean;
    originalPath: string;
    targetPath?: string;
    actualPath?: string;  // Final path after collision resolution
    skipped?: boolean;
    reason?: string;
    error?: string;
}

export interface OrganizationPlan {
    originalPath: string;
    targetPath: string;
    targetDirectory: string;
    filename: string;
    collectionType: MediaCollectionType;
    metadata?: MediaMetadata;
}

/**
 * Creates an organization plan for a media file
 */
export async function createOrganizationPlan(
    filePath: string,
    metadata?: MediaMetadata,
    forceCollection?: MediaCollectionType
): Promise<OrganizationPlan> {
    // Determine collection type
    const detectionResult = forceCollection 
        ? { type: forceCollection, confidence: 1.0, reason: 'Forced by user' }
        : await detectMediaType(filePath, metadata);

    const collectionType = detectionResult.type;
    
    // Get base collection path
    const basePath = getCollectionPath(collectionType);
    
    // Generate target path based on collection type
    const { targetDirectory, filename } = await generateTargetPath(
        filePath,
        basePath,
        collectionType,
        metadata
    );

    const targetPath = join(targetDirectory, filename);

    await logger.info('Created organization plan', {
        originalPath: filePath,
        targetPath,
        collectionType,
        confidence: detectionResult.confidence,
        reason: detectionResult.reason
    });

    return {
        originalPath: filePath,
        targetPath,
        targetDirectory,
        filename,
        collectionType,
        metadata
    };
}

/**
 * Executes an organization plan by moving the file
 */
export async function executeOrganizationPlan(
    plan: OrganizationPlan,
    options: { dryRun?: boolean; force?: boolean } = {}
): Promise<OrganizationResult> {
    const { originalPath, targetPath, targetDirectory } = plan;

    try {
        // Validate source file exists
        const sourceStats = await fs.stat(originalPath);
        if (!sourceStats.isFile()) {
            return {
                success: false,
                originalPath,
                error: 'Source is not a file'
            };
        }

        // Check if target already exists
        let finalTargetPath = targetPath;
        let skipped = false;

        try {
            const targetStats = await fs.stat(targetPath);
            if (targetStats.isFile()) {
                if (!options.force) {
                    // Check if files are identical by hash
                    const sourceHash = await hashFile(originalPath);
                    const targetHash = await hashFile(targetPath);
                    
                    if (sourceHash === targetHash) {
                        await logger.info('Target file already exists with same hash, skipping', {
                            originalPath,
                            targetPath,
                            hash: sourceHash
                        });
                        
                        return {
                            success: true,
                            originalPath,
                            targetPath,
                            actualPath: targetPath,
                            skipped: true,
                            reason: 'File already exists with identical content'
                        };
                    }
                    
                    // Generate safe filename for collision
                    const ext = extname(targetPath);
                    const nameWithoutExt = basename(targetPath, ext);
                    const safeFilename = generateSafeFilename(targetDirectory, nameWithoutExt, ext);
                    finalTargetPath = join(targetDirectory, safeFilename);
                    
                    await logger.info('Target file exists, using safe filename', {
                        originalTarget: targetPath,
                        newTarget: finalTargetPath
                    });
                }
            }
        } catch (error) {
            // Target doesn't exist, which is fine
        }

        if (options.dryRun) {
            await logger.info('Dry run: would move file', {
                from: originalPath,
                to: finalTargetPath
            });
            
            return {
                success: true,
                originalPath,
                targetPath: finalTargetPath,
                actualPath: finalTargetPath,
                reason: 'Dry run completed successfully'
            };
        }

        // Create target directory if it doesn't exist
        await fs.mkdir(targetDirectory, { recursive: true });

        // Move the file
        await fs.rename(originalPath, finalTargetPath);

        await logger.info('File organized successfully', {
            from: originalPath,
            to: finalTargetPath,
            collection: plan.collectionType
        });

        return {
            success: true,
            originalPath,
            targetPath,
            actualPath: finalTargetPath
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logger.error('Failed to organize file', {
            originalPath,
            targetPath,
            error: errorMessage
        });

        return {
            success: false,
            originalPath,
            targetPath,
            error: errorMessage
        };
    }
}

/**
 * Gets the base collection path for a media type
 */
function getCollectionPath(collectionType: MediaCollectionType): string {
    switch (collectionType) {
        case 'tv':
            return config.media.collectionTv;
        case 'movies':
            return config.media.collectionMovies;
        case 'youtube':
            return config.media.collectionYouTube;
        case 'catchall':
        default:
            return config.media.collectionCatchAll;
    }
}

/**
 * Generates target directory and filename based on collection type and metadata
 */
async function generateTargetPath(
    filePath: string,
    basePath: string,
    collectionType: MediaCollectionType,
    metadata?: MediaMetadata
): Promise<{ targetDirectory: string; filename: string }> {
    const originalFilename = basename(filePath);
    const extension = extname(originalFilename);
    const filenameWithoutExt = basename(originalFilename, extension);

    switch (collectionType) {
        case 'tv':
            return generateTvPath(basePath, originalFilename, filenameWithoutExt, extension, metadata);
        
        case 'movies':
            return generateMoviePath(basePath, originalFilename, filenameWithoutExt, extension, metadata);
        
        case 'youtube':
            return generateYouTubePath(basePath, originalFilename, filenameWithoutExt, extension, metadata);
        
        case 'catchall':
        default:
            return generateCatchAllPath(basePath, originalFilename, filenameWithoutExt, extension);
    }
}

function generateTvPath(
    basePath: string,
    originalFilename: string,
    filenameWithoutExt: string,
    extension: string,
    metadata?: MediaMetadata
): { targetDirectory: string; filename: string } {
    const pattern = config.media.organize.folderStructure.tv.pattern;
    const seriesInfo = extractTvSeriesInfo(originalFilename);
    
    // Use metadata title if available, otherwise extract from filename
    const variables = {
        series: metadata?.title || seriesInfo.series || 'Unknown Series',
        season: seriesInfo.season || 1,
        episode: seriesInfo.episode || 1,
        title: seriesInfo.title || filenameWithoutExt
    };

    const formattedPath = formatTemplate(pattern, variables);
    const normalizedFilename = normalizeFilename(basename(formattedPath) + extension);
    const targetDirectory = join(basePath, dirname(formattedPath));

    return {
        targetDirectory,
        filename: normalizedFilename
    };
}

function generateMoviePath(
    basePath: string,
    originalFilename: string,
    filenameWithoutExt: string,
    extension: string,
    metadata?: MediaMetadata
): { targetDirectory: string; filename: string } {
    const pattern = config.media.organize.folderStructure.movies.pattern;
    const movieInfo = extractMovieInfo(originalFilename);
    
    const variables = {
        title: metadata?.title || movieInfo.title || filenameWithoutExt,
        year: metadata?.year || movieInfo.year || new Date().getFullYear()
    };

    const formattedPath = formatTemplate(pattern, variables);
    const normalizedFilename = normalizeFilename(basename(formattedPath) + extension);
    const targetDirectory = join(basePath, dirname(formattedPath));

    return {
        targetDirectory,
        filename: normalizedFilename
    };
}

function generateYouTubePath(
    basePath: string,
    originalFilename: string,
    filenameWithoutExt: string,
    extension: string,
    metadata?: MediaMetadata
): { targetDirectory: string; filename: string } {
    const pattern = config.media.organize.folderStructure.youtube.pattern;
    
    const variables = {
        channel: metadata?.artist || 'Unknown Channel',
        title: metadata?.title || filenameWithoutExt
    };

    const formattedPath = formatTemplate(pattern, variables);
    const normalizedFilename = normalizeFilename(basename(formattedPath) + extension);
    const targetDirectory = join(basePath, dirname(formattedPath));

    return {
        targetDirectory,
        filename: normalizedFilename
    };
}

function generateCatchAllPath(
    basePath: string,
    originalFilename: string,
    filenameWithoutExt: string,
    extension: string
): { targetDirectory: string; filename: string } {
    const normalizedFilename = normalizeFilename(originalFilename);
    
    return {
        targetDirectory: basePath,
        filename: normalizedFilename
    };
}
