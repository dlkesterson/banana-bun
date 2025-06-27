import { spawn } from 'bun';
import { stat } from 'fs/promises';
import { config } from '../config';
import type { MediaIngestTask, MediaOrganizeTask } from '../types/task';
import type { MediaMetadata, MediaExtractionResult } from '../types/media';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';
import { hashFile } from '../utils/hash';
import { createOrganizationPlan, executeOrganizationPlan, type OrganizationResult } from '../utils/media_organizer';

export async function executeMediaIngestTask(task: MediaIngestTask): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    
    try {
        await logger.info('Starting media ingestion task', { 
            taskId: task.id, 
            filePath: task.file_path,
            force: task.force 
        });

        // Validate file exists and get stats
        const fileStats = await stat(task.file_path);
        if (!fileStats.isFile()) {
            const error = 'Path is not a file';
            await logger.error(error, { taskId: task.id, filePath: task.file_path });
            return { success: false, error };
        }

        // Check file size limits
        const fileSizeMB = fileStats.size / (1024 * 1024);
        if (fileSizeMB > config.media.extraction.max_file_size_mb) {
            const error = `File size (${fileSizeMB.toFixed(2)}MB) exceeds limit (${config.media.extraction.max_file_size_mb}MB)`;
            await logger.error(error, { taskId: task.id, filePath: task.file_path });
            return { success: false, error };
        }

        // Calculate file hash for deduplication
        const fileHash = await hashFile(task.file_path);
        
        // Check for existing metadata (deduplication)
        const db = getDatabase();
        if (!task.force && config.media.extraction.enable_deduplication) {
            const existing = db.prepare('SELECT id, task_id FROM media_metadata WHERE file_hash = ?').get(fileHash);
            if (existing) {
                await logger.info('Media file already processed, skipping', { 
                    taskId: task.id, 
                    existingTaskId: existing.task_id,
                    fileHash 
                });
                return { success: true };
            }
        }

        // Extract metadata using preferred tool
        const toolPreference = task.tool_preference || config.media.tools.preferred;
        let extractionResult: MediaExtractionResult;

        if (toolPreference === 'ffprobe' || toolPreference === 'auto') {
            extractionResult = await extractWithFFprobe(task.file_path, fileStats.size, fileHash);
            
            // Fallback to mediainfo if ffprobe fails and auto mode
            if (!extractionResult.success && toolPreference === 'auto') {
                await logger.warn('FFprobe failed, trying mediainfo fallback', { taskId: task.id });
                extractionResult = await extractWithMediainfo(task.file_path, fileStats.size, fileHash);
            }
        } else {
            extractionResult = await extractWithMediainfo(task.file_path, fileStats.size, fileHash);
        }

        if (!extractionResult.success || !extractionResult.metadata) {
            await logger.error('Metadata extraction failed', { 
                taskId: task.id, 
                error: extractionResult.error,
                toolUsed: extractionResult.tool_used 
            });
            return { success: false, error: extractionResult.error };
        }

        // Store metadata in database
        db.run(
            `INSERT INTO media_metadata (task_id, file_path, file_hash, metadata_json, tool_used)
             VALUES (?, ?, ?, ?, ?)`,
            [
                task.id,
                task.file_path,
                fileHash,
                JSON.stringify(extractionResult.metadata),
                extractionResult.tool_used
            ]
        );

        // Create result summary for dashboard
        const resultSummary = createResultSummary(extractionResult);
        
        // Update task with result summary
        db.run(
            `UPDATE tasks SET result_summary = ? WHERE id = ?`,
            [JSON.stringify(resultSummary), task.id]
        );

        // Create follow-up transcription task for video/audio files
        if (extractionResult.metadata.video || extractionResult.metadata.audio) {
            await createMediaTranscribeTask(task.file_path, task.id);
        }

        // Create follow-up organization task if enabled
        if (config.media.organize.enabled && config.media.organize.auto_organize_after_ingest) {
            await createMediaOrganizeTask(task.file_path, task.id);
        }

        const totalTime = Date.now() - startTime;
        await logger.info('Media ingestion completed successfully', {
            taskId: task.id,
            toolUsed: extractionResult.tool_used,
            extractionTimeMs: extractionResult.extraction_time_ms,
            totalTimeMs: totalTime,
            fileType: extractionResult.metadata.video ? 'video' : 'audio',
            duration: extractionResult.metadata.duration
        });

        return { success: true };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logger.error('Media ingestion task failed', { 
            taskId: task.id, 
            error: errorMessage 
        });
        return { success: false, error: errorMessage };
    }
}

async function extractWithFFprobe(filePath: string, fileSize: number, fileHash: string): Promise<MediaExtractionResult> {
    const startTime = Date.now();
    
    try {
        // Run ffprobe to get JSON metadata
        const proc = spawn({
            cmd: [
                config.media.tools.ffprobe,
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                filePath
            ],
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            return {
                success: false,
                tool_used: 'ffprobe',
                extraction_time_ms: Date.now() - startTime,
                error: `FFprobe failed with exit code ${exitCode}: ${stderr}`,
                raw_output: stderr
            };
        }

        const ffprobeData = JSON.parse(stdout);
        const metadata = parseFFprobeOutput(ffprobeData, filePath, fileSize, fileHash);

        return {
            success: true,
            metadata,
            tool_used: 'ffprobe',
            extraction_time_ms: Date.now() - startTime,
            raw_output: stdout
        };

    } catch (error) {
        return {
            success: false,
            tool_used: 'ffprobe',
            extraction_time_ms: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

async function extractWithMediainfo(filePath: string, fileSize: number, fileHash: string): Promise<MediaExtractionResult> {
    const startTime = Date.now();
    
    try {
        // Run mediainfo to get JSON metadata
        const proc = spawn({
            cmd: [
                config.media.tools.mediainfo,
                '--Output=JSON',
                filePath
            ],
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            return {
                success: false,
                tool_used: 'mediainfo',
                extraction_time_ms: Date.now() - startTime,
                error: `MediaInfo failed with exit code ${exitCode}: ${stderr}`,
                raw_output: stderr
            };
        }

        const mediainfoData = JSON.parse(stdout);
        const metadata = parseMediainfoOutput(mediainfoData, filePath, fileSize, fileHash);

        return {
            success: true,
            metadata,
            tool_used: 'mediainfo',
            extraction_time_ms: Date.now() - startTime,
            raw_output: stdout
        };

    } catch (error) {
        return {
            success: false,
            tool_used: 'mediainfo',
            extraction_time_ms: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

function parseFFprobeOutput(data: any, filePath: string, fileSize: number, fileHash: string): MediaMetadata {
    const format = data.format || {};
    const streams = data.streams || [];
    
    const filename = filePath.split(/[/\\]/).pop() || '';
    const duration = parseFloat(format.duration) || 0;
    const bitrate = parseInt(format.bit_rate) || 0;

    const metadata: MediaMetadata = {
        filename,
        filepath: filePath,
        filesize: fileSize,
        file_hash: fileHash,
        format: format.format_name || 'unknown',
        duration,
        bitrate
    };

    // Parse video streams
    const videoStreams = streams.filter((s: any) => s.codec_type === 'video');
    if (videoStreams.length > 0) {
        metadata.video = videoStreams.map((stream: any) => ({
            codec: stream.codec_name || 'unknown',
            resolution: `${stream.width || 0}x${stream.height || 0}`,
            width: stream.width || 0,
            height: stream.height || 0,
            fps: parseFloat(stream.r_frame_rate?.split('/')[0]) / parseFloat(stream.r_frame_rate?.split('/')[1]) || 0,
            bitrate: parseInt(stream.bit_rate) || 0
        }));
    }

    // Parse audio streams
    const audioStreams = streams.filter((s: any) => s.codec_type === 'audio');
    if (audioStreams.length > 0) {
        metadata.audio = audioStreams.map((stream: any) => ({
            codec: stream.codec_name || 'unknown',
            channels: stream.channels || 0,
            sample_rate: parseInt(stream.sample_rate) || 0,
            bitrate: parseInt(stream.bit_rate) || 0,
            language: stream.tags?.language
        }));
    }

    // Parse subtitle streams
    const subtitleStreams = streams.filter((s: any) => s.codec_type === 'subtitle');
    if (subtitleStreams.length > 0) {
        metadata.subtitles = subtitleStreams.map((stream: any) => ({
            codec: stream.codec_name || 'unknown',
            language: stream.tags?.language,
            forced: stream.disposition?.forced === 1
        }));
    }

    // Extract embedded metadata
    const tags = format.tags || {};
    if (tags.title) metadata.title = tags.title;
    if (tags.artist) metadata.artist = tags.artist;
    if (tags.album) metadata.album = tags.album;
    if (tags.date) metadata.year = parseInt(tags.date);
    if (tags.genre) metadata.genre = tags.genre;
    if (tags.description || tags.comment) metadata.description = tags.description || tags.comment;

    // Guess content type
    const guessResult = guessContentType(metadata);
    metadata.guessed_type = guessResult.type;
    metadata.confidence = guessResult.confidence;

    return metadata;
}

function parseMediainfoOutput(data: any, filePath: string, fileSize: number, fileHash: string): MediaMetadata {
    // MediaInfo JSON structure is different from FFprobe
    // This is a simplified implementation - would need more detailed parsing
    const media = data.media || {};
    const tracks = media.track || [];
    
    const filename = filePath.split(/[/\\]/).pop() || '';
    
    // Find general track for overall info
    const generalTrack = tracks.find((t: any) => t['@type'] === 'General') || {};
    
    const metadata: MediaMetadata = {
        filename,
        filepath: filePath,
        filesize: fileSize,
        file_hash: fileHash,
        format: generalTrack.Format || 'unknown',
        duration: parseFloat(generalTrack.Duration) / 1000 || 0, // MediaInfo gives milliseconds
        bitrate: parseInt(generalTrack.OverallBitRate) || 0
    };

    // This would need more detailed implementation for MediaInfo parsing
    // For now, return basic metadata
    return metadata;
}

/**
 * Executes a media organization task
 */
export async function executeMediaOrganizeTask(task: MediaOrganizeTask): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();

    try {
        await logger.info('Starting media organization task', {
            taskId: task.id,
            filePath: task.file_path,
            filePaths: task.file_paths,
            dryRun: task.dry_run,
            force: task.force
        });

        const db = getDatabase();
        const results: OrganizationResult[] = [];

        // Determine files to organize
        const filesToOrganize = task.file_paths || (task.file_path ? [task.file_path] : []);

        if (filesToOrganize.length === 0) {
            const error = 'No files specified for organization';
            await logger.error(error, { taskId: task.id });
            return { success: false, error };
        }

        // Process each file
        for (const filePath of filesToOrganize) {
            try {
                // Get metadata from database if available
                let metadata: MediaMetadata | undefined;
                const metadataRow = db.prepare('SELECT metadata_json FROM media_metadata WHERE file_path = ?').get(filePath) as { metadata_json: string } | undefined;
                if (metadataRow) {
                    metadata = JSON.parse(metadataRow.metadata_json);
                }

                // Use provided metadata if available
                if (task.metadata) {
                    metadata = { ...metadata, ...task.metadata } as MediaMetadata;
                }

                // Create organization plan
                const plan = await createOrganizationPlan(filePath, metadata, task.target_collection);

                // Execute the plan
                const result = await executeOrganizationPlan(plan, {
                    dryRun: task.dry_run,
                    force: task.force
                });

                results.push(result);

                // Update database if file was actually moved
                if (result.success && result.actualPath && result.actualPath !== filePath && !task.dry_run) {
                    // Update media_metadata table
                    db.run(
                        'UPDATE media_metadata SET file_path = ? WHERE file_path = ?',
                        [result.actualPath, filePath]
                    );

                    // Update media table (for YouTube content)
                    db.run(
                        'UPDATE media SET file_path = ? WHERE file_path = ?',
                        [result.actualPath, filePath]
                    );

                    await logger.info('Updated database with new file path', {
                        taskId: task.id,
                        oldPath: filePath,
                        newPath: result.actualPath
                    });
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                results.push({
                    success: false,
                    originalPath: filePath,
                    error: errorMessage
                });

                await logger.error('Failed to organize file', {
                    taskId: task.id,
                    filePath,
                    error: errorMessage
                });
            }
        }

        // Create result summary
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const skipped = results.filter(r => r.skipped).length;

        const resultSummary = {
            total: results.length,
            successful,
            failed,
            skipped,
            dryRun: task.dry_run,
            results: results.map(r => ({
                originalPath: r.originalPath,
                targetPath: r.targetPath,
                actualPath: r.actualPath,
                success: r.success,
                skipped: r.skipped,
                reason: r.reason,
                error: r.error
            }))
        };

        // Update task with result summary
        db.run(
            `UPDATE tasks SET result_summary = ? WHERE id = ?`,
            [JSON.stringify(resultSummary), task.id]
        );

        const totalTime = Date.now() - startTime;
        await logger.info('Media organization completed', {
            taskId: task.id,
            totalFiles: results.length,
            successful,
            failed,
            skipped,
            totalTimeMs: totalTime,
            dryRun: task.dry_run
        });

        // Consider task successful if at least one file was processed successfully
        const overallSuccess = successful > 0 || (failed === 0 && skipped > 0);

        return {
            success: overallSuccess,
            error: failed > 0 ? `${failed} files failed to organize` : undefined
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logger.error('Media organization task failed', {
            taskId: task.id,
            error: errorMessage
        });
        return { success: false, error: errorMessage };
    }
}

/**
 * Creates a media transcribe task as a follow-up to media ingest
 */
async function createMediaTranscribeTask(filePath: string, parentTaskId: number): Promise<void> {
    try {
        const db = getDatabase();
        const filename = filePath.split(/[/\\]/).pop() || 'unknown';

        const taskData = {
            type: 'media_transcribe',
            description: `Transcribe media file: ${filename}`,
            status: 'pending',
            parent_id: parentTaskId,
            args: JSON.stringify({
                file_path: filePath
            })
        };

        const result = db.run(
            `INSERT INTO tasks (type, description, status, parent_id, args)
             VALUES (?, ?, ?, ?, ?)`,
            [
                taskData.type,
                taskData.description,
                taskData.status,
                taskData.parent_id,
                taskData.args
            ]
        );

        const taskId = result.lastInsertRowid;
        await logger.info('Created media transcribe task', {
            taskId,
            parentTaskId,
            filePath
        });

    } catch (error) {
        await logger.error('Failed to create media transcribe task', {
            parentTaskId,
            filePath,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Creates a media organize task as a follow-up to media ingest
 */
async function createMediaOrganizeTask(filePath: string, parentTaskId: number): Promise<void> {
    try {
        const db = getDatabase();
        const filename = filePath.split(/[/\\]/).pop() || 'unknown';

        const taskData = {
            type: 'media_organize',
            description: `Organize media file: ${filename}`,
            status: 'pending',
            parent_id: parentTaskId,
            args: JSON.stringify({
                file_path: filePath
            })
        };

        const result = db.run(
            `INSERT INTO tasks (type, description, status, parent_id, args)
             VALUES (?, ?, ?, ?, ?)`,
            [
                taskData.type,
                taskData.description,
                taskData.status,
                taskData.parent_id,
                taskData.args
            ]
        );

        const taskId = result.lastInsertRowid;
        await logger.info('Created media organize task', {
            taskId,
            parentTaskId,
            filePath
        });

    } catch (error) {
        await logger.error('Failed to create media organize task', {
            parentTaskId,
            filePath,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

function guessContentType(metadata: MediaMetadata): { type: MediaMetadata['guessed_type'], confidence: number } {
    // Simple heuristics for content type detection
    if (metadata.video && metadata.video.length > 0) {
        const duration = metadata.duration;
        if (duration > 3600) { // > 1 hour
            return { type: 'movie', confidence: 0.8 };
        } else if (duration > 1200) { // > 20 minutes
            return { type: 'tv_episode', confidence: 0.7 };
        }
        return { type: 'other', confidence: 0.5 };
    } else if (metadata.audio && metadata.audio.length > 0) {
        const duration = metadata.duration;
        if (duration > 1800) { // > 30 minutes
            return { type: 'podcast', confidence: 0.8 };
        } else {
            return { type: 'music', confidence: 0.9 };
        }
    }
    
    return { type: 'other', confidence: 0.3 };
}

function createResultSummary(result: MediaExtractionResult) {
    if (!result.metadata) return { success: false };

    const metadata = result.metadata;
    const isVideo = metadata.video && metadata.video.length > 0;
    
    return {
        success: true,
        tool_used: result.tool_used,
        extraction_time_ms: result.extraction_time_ms,
        file_type: isVideo ? 'video' : 'audio',
        duration: formatDuration(metadata.duration),
        resolution: isVideo ? metadata.video![0].resolution : undefined,
        audio_tracks: metadata.audio?.length || 0,
        subtitle_tracks: metadata.subtitles?.length || 0,
        metadata_fields_extracted: Object.keys(metadata).length,
        guessed_content_type: metadata.guessed_type ? 
            `${metadata.guessed_type} (${Math.round((metadata.confidence || 0) * 100)}% confidence)` : 
            undefined
    };
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}
