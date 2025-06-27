import type { IndexMeiliTask, IndexChromaTask } from '../types/task';
import type { MediaMetadata } from '../types/media';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';
import { meilisearchService } from '../services/meilisearch-service';
import { embeddingManager } from '../memory/embeddings';

export async function executeIndexMeiliTask(task: IndexMeiliTask): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    
    try {
        await logger.info('Starting Meilisearch indexing task', { 
            taskId: task.id, 
            mediaId: task.media_id
        });

        // Get media metadata
        const db = getDatabase();
        const mediaRow = db.prepare(`
            SELECT mm.metadata_json, mm.file_path,
                   mt.transcript_text, mt.language,
                   mtags.tags_json
            FROM media_metadata mm
            LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
            LEFT JOIN media_tags mtags ON mm.id = mtags.media_id
            WHERE mm.id = ?
        `).get(task.media_id) as { 
            metadata_json: string; 
            file_path: string;
            transcript_text?: string; 
            language?: string;
            tags_json?: string;
        } | undefined;
        
        if (!mediaRow) {
            const error = 'Media metadata not found';
            await logger.error(error, { taskId: task.id, mediaId: task.media_id });
            return { success: false, error };
        }

        const metadata: MediaMetadata = JSON.parse(mediaRow.metadata_json);
        
        // Add transcript and tags to metadata
        if (mediaRow.transcript_text) {
            metadata.transcript = mediaRow.transcript_text;
            metadata.language = mediaRow.language;
        }
        
        if (mediaRow.tags_json) {
            metadata.tags = JSON.parse(mediaRow.tags_json);
        }

        // Check if already indexed (unless force is true)
        if (!task.force) {
            const indexStatus = db.prepare('SELECT meili_indexed FROM media_index_status WHERE media_id = ?').get(task.media_id) as { meili_indexed: boolean } | undefined;
            if (indexStatus?.meili_indexed) {
                await logger.info('Media already indexed in Meilisearch, skipping', { 
                    taskId: task.id, 
                    mediaId: task.media_id 
                });
                return { success: true };
            }
        }

        // Index in Meilisearch
        const documentId = await meilisearchService.indexMedia(task.media_id, metadata);

        // Update index status
        db.run(`
            INSERT OR REPLACE INTO media_index_status 
            (media_id, meili_indexed, meili_document_id, meili_indexed_at, last_updated)
            VALUES (?, TRUE, ?, datetime('now'), datetime('now'))
        `, [task.media_id, documentId]);

        // Update media metadata
        metadata.indexed_in_meili = true;
        metadata.meili_document_id = documentId;
        
        db.run(
            'UPDATE media_metadata SET metadata_json = ? WHERE id = ?',
            [JSON.stringify(metadata), task.media_id]
        );

        // Create result summary
        const resultSummary = {
            success: true,
            document_id: documentId,
            indexed_fields: Object.keys(metadata).length,
            has_transcript: !!metadata.transcript,
            has_tags: !!(metadata.tags && metadata.tags.length > 0),
            processing_time_ms: Date.now() - startTime
        };

        // Update task with result summary
        db.run(
            `UPDATE tasks SET result_summary = ? WHERE id = ?`,
            [JSON.stringify(resultSummary), task.id]
        );

        const totalTime = Date.now() - startTime;
        await logger.info('Meilisearch indexing completed successfully', {
            taskId: task.id,
            mediaId: task.media_id,
            documentId,
            totalTimeMs: totalTime
        });

        return { success: true };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logger.error('Meilisearch indexing task failed', { 
            taskId: task.id, 
            mediaId: task.media_id,
            error: errorMessage 
        });
        return { success: false, error: errorMessage };
    }
}

export async function executeIndexChromaTask(task: IndexChromaTask): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    
    try {
        await logger.info('Starting ChromaDB indexing task', { 
            taskId: task.id, 
            mediaId: task.media_id
        });

        // Get media metadata
        const db = getDatabase();
        const mediaRow = db.prepare(`
            SELECT mm.metadata_json, mm.file_path,
                   mt.transcript_text, mt.language,
                   mtags.tags_json
            FROM media_metadata mm
            LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
            LEFT JOIN media_tags mtags ON mm.id = mtags.media_id
            WHERE mm.id = ?
        `).get(task.media_id) as { 
            metadata_json: string; 
            file_path: string;
            transcript_text?: string; 
            language?: string;
            tags_json?: string;
        } | undefined;
        
        if (!mediaRow) {
            const error = 'Media metadata not found';
            await logger.error(error, { taskId: task.id, mediaId: task.media_id });
            return { success: false, error };
        }

        const metadata: MediaMetadata = JSON.parse(mediaRow.metadata_json);
        
        // Add transcript and tags to metadata
        if (mediaRow.transcript_text) {
            metadata.transcript = mediaRow.transcript_text;
            metadata.language = mediaRow.language;
        }
        
        if (mediaRow.tags_json) {
            metadata.tags = JSON.parse(mediaRow.tags_json);
        }

        // Check if already indexed (unless force is true)
        if (!task.force) {
            const indexStatus = db.prepare('SELECT chroma_indexed FROM media_index_status WHERE media_id = ?').get(task.media_id) as { chroma_indexed: boolean } | undefined;
            if (indexStatus?.chroma_indexed) {
                await logger.info('Media already indexed in ChromaDB, skipping', { 
                    taskId: task.id, 
                    mediaId: task.media_id 
                });
                return { success: true };
            }
        }

        // Create embedding text from metadata
        const embeddingText = createEmbeddingText(metadata);
        
        // Create media embedding for ChromaDB
        const mediaEmbedding = {
            id: `media_${task.media_id}`,
            taskId: task.id,
            description: embeddingText,
            type: 'media_content',
            status: 'completed',
            result: {
                media_id: task.media_id,
                file_path: mediaRow.file_path,
                tags: metadata.tags || [],
                duration: metadata.duration,
                format: metadata.format,
                guessed_type: metadata.guessed_type
            },
            metadata: {
                media_id: task.media_id,
                file_path: mediaRow.file_path,
                filename: metadata.filename,
                format: metadata.format,
                duration: metadata.duration,
                has_transcript: !!metadata.transcript,
                has_tags: !!(metadata.tags && metadata.tags.length > 0),
                language: metadata.language,
                guessed_type: metadata.guessed_type
            }
        };

        // Add to ChromaDB via embedding manager
        await embeddingManager.addTaskEmbedding(mediaEmbedding);

        const embeddingId = mediaEmbedding.id;

        // Update index status
        db.run(`
            INSERT OR REPLACE INTO media_index_status 
            (media_id, chroma_indexed, chroma_embedding_id, chroma_indexed_at, last_updated)
            VALUES (?, TRUE, ?, datetime('now'), datetime('now'))
        `, [task.media_id, embeddingId]);

        // Update media metadata
        metadata.indexed_in_chroma = true;
        metadata.chroma_embedding_id = embeddingId;
        
        db.run(
            'UPDATE media_metadata SET metadata_json = ? WHERE id = ?',
            [JSON.stringify(metadata), task.media_id]
        );

        // Create result summary
        const resultSummary = {
            success: true,
            embedding_id: embeddingId,
            embedding_text_length: embeddingText.length,
            has_transcript: !!metadata.transcript,
            has_tags: !!(metadata.tags && metadata.tags.length > 0),
            processing_time_ms: Date.now() - startTime
        };

        // Update task with result summary
        db.run(
            `UPDATE tasks SET result_summary = ? WHERE id = ?`,
            [JSON.stringify(resultSummary), task.id]
        );

        const totalTime = Date.now() - startTime;
        await logger.info('ChromaDB indexing completed successfully', {
            taskId: task.id,
            mediaId: task.media_id,
            embeddingId,
            totalTimeMs: totalTime
        });

        return { success: true };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logger.error('ChromaDB indexing task failed', { 
            taskId: task.id, 
            mediaId: task.media_id,
            error: errorMessage 
        });
        return { success: false, error: errorMessage };
    }
}

function createEmbeddingText(metadata: MediaMetadata): string {
    const parts = [];
    
    // Basic info
    parts.push(`File: ${metadata.filename}`);
    
    // Content info
    if (metadata.title) parts.push(`Title: ${metadata.title}`);
    if (metadata.description) parts.push(`Description: ${metadata.description}`);
    if (metadata.summary) parts.push(`Summary: ${metadata.summary}`);
    
    // Tags
    if (metadata.tags && metadata.tags.length > 0) {
        parts.push(`Tags: ${metadata.tags.join(', ')}`);
    }
    
    // Technical info
    parts.push(`Format: ${metadata.format}`);
    parts.push(`Duration: ${formatDuration(metadata.duration)}`);
    if (metadata.guessed_type) parts.push(`Type: ${metadata.guessed_type}`);
    
    // Metadata
    if (metadata.artist) parts.push(`Artist: ${metadata.artist}`);
    if (metadata.album) parts.push(`Album: ${metadata.album}`);
    if (metadata.genre) parts.push(`Genre: ${metadata.genre}`);
    if (metadata.year) parts.push(`Year: ${metadata.year}`);
    
    // Transcript (truncated)
    if (metadata.transcript) {
        const truncatedTranscript = metadata.transcript.length > 1000 
            ? metadata.transcript.substring(0, 1000) + '...'
            : metadata.transcript;
        parts.push(`Content: ${truncatedTranscript}`);
    }
    
    return parts.join('\n');
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
