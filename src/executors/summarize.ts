import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { summarizerService } from '../services/summarizer';
import type { MediaSummarizeTask } from '../types/task';

export async function executeMediaSummarizeTask(task: MediaSummarizeTask): Promise<{ success: boolean; error?: string; summary?: string }> {
    const startTime = Date.now();

    try {
        await logger.info('Starting media summarization task', {
            taskId: task.id,
            mediaId: task.media_id,
            style: task.style || 'bullet',
            model: task.model
        });

        const db = getDatabase();

        // Check if summarizer service is initialized
        if (!summarizerService.isInitialized()) {
            const error = 'Summarizer service not initialized - OpenAI API key may be missing';
            await logger.error('Summarizer service not available', { taskId: task.id, error });
            return { success: false, error };
        }

        // Check if summary already exists and force is not set
        if (!task.force) {
            const existingSummary = db.prepare(`
                SELECT id, summary 
                FROM media_transcripts 
                WHERE media_id = ? AND summary IS NOT NULL
                ORDER BY transcribed_at DESC 
                LIMIT 1
            `).get(task.media_id) as { id: number; summary: string } | undefined;

            if (existingSummary) {
                await logger.info('Summary already exists, skipping', {
                    taskId: task.id,
                    mediaId: task.media_id,
                    transcriptId: existingSummary.id
                });
                return {
                    success: true,
                    summary: existingSummary.summary
                };
            }
        }

        // Generate summary using the service
        const result = await summarizerService.generateSummaryForMedia(task.media_id, {
            style: task.style || 'bullet',
            model: task.model
        });

        if (!result.success) {
            await logger.error('Failed to generate summary', {
                taskId: task.id,
                mediaId: task.media_id,
                error: result.error
            });
            return { success: false, error: result.error };
        }

        // Update the transcript record with the summary
        if (result.transcript_id && result.summary) {
            db.run(`
                UPDATE media_transcripts 
                SET summary = ?, 
                    summary_style = ?, 
                    summary_model = ?, 
                    summary_generated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                result.summary,
                task.style || 'bullet',
                result.model_used || task.model || 'gpt-3.5-turbo',
                result.transcript_id
            ]);

            await logger.info('Summary saved to database', {
                taskId: task.id,
                mediaId: task.media_id,
                transcriptId: result.transcript_id,
                summaryLength: result.summary.length,
                tokensUsed: result.tokens_used,
                processingTimeMs: result.processing_time_ms
            });
        }

        // Update MeiliSearch index with the summary for searchability
        try {
            const { meilisearchService } = await import('../services/meilisearch-service');
            
            // Get media metadata for indexing
            const mediaRow = db.prepare(`
                SELECT mm.*, mt.summary, mt.transcript_text
                FROM media_metadata mm
                LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
                WHERE mm.id = ?
            `).get(task.media_id) as any;

            if (mediaRow && mediaRow.summary) {
                const metadata = JSON.parse(mediaRow.metadata_json);
                
                // Create searchable document with summary
                const searchDocument = {
                    id: `media_${task.media_id}`,
                    media_id: task.media_id,
                    title: metadata.filename || 'Unknown',
                    summary: mediaRow.summary,
                    transcript: mediaRow.transcript_text || '',
                    file_path: mediaRow.file_path,
                    duration: metadata.duration,
                    format: metadata.format,
                    tags: metadata.tags || [],
                    indexed_at: new Date().toISOString()
                };

                await meilisearchService.indexDocument('media_summaries', searchDocument);
                
                await logger.info('Summary indexed in MeiliSearch', {
                    taskId: task.id,
                    mediaId: task.media_id,
                    documentId: searchDocument.id
                });
            }
        } catch (indexError) {
            // Don't fail the task if indexing fails
            await logger.warn('Failed to index summary in MeiliSearch', {
                taskId: task.id,
                mediaId: task.media_id,
                error: indexError instanceof Error ? indexError.message : String(indexError)
            });
        }

        const totalTime = Date.now() - startTime;
        await logger.info('Media summarization completed successfully', {
            taskId: task.id,
            mediaId: task.media_id,
            summaryLength: result.summary?.length,
            tokensUsed: result.tokens_used,
            totalTimeMs: totalTime
        });

        return {
            success: true,
            summary: result.summary
        };

    } catch (error) {
        const totalTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await logger.error('Media summarization task failed', {
            taskId: task.id,
            mediaId: task.media_id,
            error: errorMessage,
            totalTimeMs: totalTime
        });

        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Helper function to create a media summarization task
 */
export async function createMediaSummarizeTask(
    mediaId: number,
    options: {
        style?: 'bullet' | 'paragraph' | 'key_points';
        model?: string;
        force?: boolean;
        parentTaskId?: number;
    } = {}
): Promise<number> {
    const db = getDatabase();
    
    const description = `Generate summary for media ID ${mediaId}`;
    
    const result = db.run(
        `INSERT INTO tasks (type, description, status, args)
         VALUES (?, ?, ?, ?)`,
        [
            'media_summarize',
            description,
            'pending',
            JSON.stringify({
                media_id: mediaId,
                style: options.style || 'bullet',
                model: options.model,
                force: options.force || false
            })
        ]
    );

    const taskId = result.lastInsertRowid as number;
    
    await logger.info('Media summarization task created', {
        taskId,
        mediaId,
        style: options.style || 'bullet',
        model: options.model,
        force: options.force
    });

    return taskId;
}
