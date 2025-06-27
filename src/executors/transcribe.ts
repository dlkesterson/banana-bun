import { spawn } from 'bun';
import { stat, writeFile, readFile } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { config } from '../config';
import type { MediaTranscribeTask } from '../types/task';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';

interface WhisperChunk {
    start_time: number;
    end_time: number;
    text: string;
}

interface WhisperResult {
    success: boolean;
    transcript?: string;
    chunks?: WhisperChunk[];
    language?: string;
    error?: string;
    processing_time_ms?: number;
}

export async function executeMediaTranscribeTask(task: MediaTranscribeTask): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    
    try {
        await logger.info('Starting media transcription task', { 
            taskId: task.id, 
            filePath: task.file_path,
            whisperModel: task.whisper_model || config.whisper.model
        });

        // Validate file exists
        const fileStats = await stat(task.file_path);
        if (!fileStats.isFile()) {
            const error = 'Path is not a file';
            await logger.error(error, { taskId: task.id, filePath: task.file_path });
            return { success: false, error };
        }

        // Get media metadata to check if already transcribed
        const db = getDatabase();
        const mediaRow = db.prepare('SELECT id FROM media_metadata WHERE file_path = ?').get(task.file_path) as { id: number } | undefined;
        
        if (!mediaRow) {
            const error = 'Media metadata not found. Run media_ingest first.';
            await logger.error(error, { taskId: task.id, filePath: task.file_path });
            return { success: false, error };
        }

        const mediaId = mediaRow.id;

        // Check if already transcribed (unless force is true)
        if (!task.force) {
            const existingTranscript = db.prepare('SELECT id FROM media_transcripts WHERE media_id = ?').get(mediaId);
            if (existingTranscript) {
                await logger.info('Media already transcribed, skipping', { 
                    taskId: task.id, 
                    mediaId 
                });
                return { success: true };
            }
        }

        // Run Whisper transcription
        const whisperResult = await runWhisperTranscription(task.file_path, {
            model: task.whisper_model || config.whisper.model,
            language: task.language || config.whisper.language,
            chunkDuration: task.chunk_duration || config.whisper.chunkDuration
        });

        if (!whisperResult.success || !whisperResult.transcript) {
            await logger.error('Whisper transcription failed', { 
                taskId: task.id, 
                error: whisperResult.error 
            });
            return { success: false, error: whisperResult.error };
        }

        // Store transcript in database
        db.run(
            `INSERT INTO media_transcripts (media_id, task_id, transcript_text, language, chunks_json, whisper_model)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                mediaId,
                task.id,
                whisperResult.transcript,
                whisperResult.language,
                JSON.stringify(whisperResult.chunks || []),
                task.whisper_model || config.whisper.model
            ]
        );

        // Update media metadata with transcript
        const metadataRow = db.prepare('SELECT metadata_json FROM media_metadata WHERE id = ?').get(mediaId) as { metadata_json: string };
        const metadata = JSON.parse(metadataRow.metadata_json);
        metadata.transcript = whisperResult.transcript;
        metadata.language = whisperResult.language;
        metadata.transcript_chunks = whisperResult.chunks;

        db.run(
            'UPDATE media_metadata SET metadata_json = ? WHERE id = ?',
            [JSON.stringify(metadata), mediaId]
        );

        // Create result summary
        const resultSummary = {
            success: true,
            transcript_length: whisperResult.transcript.length,
            language: whisperResult.language,
            chunks_count: whisperResult.chunks?.length || 0,
            processing_time_ms: whisperResult.processing_time_ms,
            whisper_model: task.whisper_model || config.whisper.model
        };

        // Update task with result summary
        db.run(
            `UPDATE tasks SET result_summary = ? WHERE id = ?`,
            [JSON.stringify(resultSummary), task.id]
        );

        // Create follow-up tagging task
        await createMediaTagTask(task.file_path, task.id, mediaId);

        const totalTime = Date.now() - startTime;
        await logger.info('Media transcription completed successfully', {
            taskId: task.id,
            mediaId,
            transcriptLength: whisperResult.transcript.length,
            language: whisperResult.language,
            chunksCount: whisperResult.chunks?.length || 0,
            processingTimeMs: whisperResult.processing_time_ms,
            totalTimeMs: totalTime
        });

        return { success: true };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logger.error('Media transcription task failed', { 
            taskId: task.id, 
            error: errorMessage 
        });
        return { success: false, error: errorMessage };
    }
}

async function runWhisperTranscription(filePath: string, options: {
    model: string;
    language: string;
    chunkDuration: number;
}): Promise<WhisperResult> {
    const startTime = Date.now();
    
    try {
        // Create temporary output directory
        const tempDir = join(dirname(filePath), '.whisper_temp');
        const outputFile = join(tempDir, `${basename(filePath, extname(filePath))}.json`);

        // Ensure temp directory exists
        await Bun.write(join(tempDir, '.keep'), '');

        // Build Whisper command
        const whisperArgs = [
            filePath,
            '--model', options.model,
            '--output_format', 'json',
            '--output_dir', tempDir,
            '--verbose', 'False'
        ];

        // Add language if not auto-detect
        if (options.language !== 'auto') {
            whisperArgs.push('--language', options.language);
        }

        // Add timestamp options for chunking
        whisperArgs.push('--word_timestamps', 'True');

        await logger.info('Running Whisper transcription', { 
            filePath, 
            model: options.model,
            language: options.language,
            outputFile 
        });

        // Run Whisper
        const proc = spawn({
            cmd: ['whisper', ...whisperArgs],
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            return {
                success: false,
                error: `Whisper failed with exit code ${exitCode}: ${stderr}`,
                processing_time_ms: Date.now() - startTime
            };
        }

        // Read the JSON output
        const jsonContent = await readFile(outputFile, 'utf-8');
        const whisperOutput = JSON.parse(jsonContent);

        // Extract transcript and chunks
        const transcript = whisperOutput.text || '';
        const chunks = extractChunks(whisperOutput, options.chunkDuration);
        const language = whisperOutput.language || 'unknown';

        // Clean up temp files
        try {
            await Bun.write(outputFile, ''); // Clear file
        } catch (error) {
            // Ignore cleanup errors
        }

        return {
            success: true,
            transcript,
            chunks,
            language,
            processing_time_ms: Date.now() - startTime
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            processing_time_ms: Date.now() - startTime
        };
    }
}

function extractChunks(whisperOutput: any, chunkDuration: number): WhisperChunk[] {
    const chunks: WhisperChunk[] = [];
    const segments = whisperOutput.segments || [];

    let currentChunk: WhisperChunk = {
        start_time: 0,
        end_time: 0,
        text: ''
    };

    for (const segment of segments) {
        const segmentStart = segment.start || 0;
        const segmentEnd = segment.end || 0;
        const segmentText = segment.text || '';

        // If this segment would make the chunk too long, finish current chunk
        if (currentChunk.text && (segmentEnd - currentChunk.start_time) > chunkDuration) {
            chunks.push({ ...currentChunk });
            currentChunk = {
                start_time: segmentStart,
                end_time: segmentEnd,
                text: segmentText.trim()
            };
        } else {
            // Add to current chunk
            if (!currentChunk.text) {
                currentChunk.start_time = segmentStart;
            }
            currentChunk.end_time = segmentEnd;
            currentChunk.text += (currentChunk.text ? ' ' : '') + segmentText.trim();
        }
    }

    // Add final chunk if it has content
    if (currentChunk.text) {
        chunks.push(currentChunk);
    }

    return chunks;
}

async function createMediaTagTask(filePath: string, parentTaskId: number, mediaId: number): Promise<void> {
    try {
        const db = getDatabase();
        const filename = basename(filePath);

        const taskData = {
            type: 'media_tag',
            description: `Generate AI tags for: ${filename}`,
            status: 'pending',
            parent_id: parentTaskId,
            args: JSON.stringify({
                file_path: filePath,
                media_id: mediaId
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
        await logger.info('Created media tag task', {
            taskId,
            parentTaskId,
            mediaId,
            filePath
        });

    } catch (error) {
        await logger.error('Failed to create media tag task', {
            parentTaskId,
            mediaId,
            filePath,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}
