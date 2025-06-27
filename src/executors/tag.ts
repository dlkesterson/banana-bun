import { config } from '../config';
import type { MediaTagTask } from '../types/task';
import type { MediaMetadata } from '../types/media';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';
import { toolRunner } from '../tools/tool_runner';

interface TaggingResult {
    success: boolean;
    tags?: string[];
    explanations?: { [tag: string]: string };
    confidence?: number;
    error?: string;
    processing_time_ms?: number;
}

export async function executeMediaTagTask(task: MediaTagTask): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    
    try {
        await logger.info('Starting media tagging task', { 
            taskId: task.id, 
            filePath: task.file_path
        });

        // Get media metadata and transcript
        const db = getDatabase();
        const mediaRow = db.prepare(`
            SELECT mm.id, mm.metadata_json, mt.transcript_text, mt.language
            FROM media_metadata mm
            LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
            WHERE mm.file_path = ?
        `).get(task.file_path) as { 
            id: number; 
            metadata_json: string; 
            transcript_text?: string; 
            language?: string; 
        } | undefined;
        
        if (!mediaRow) {
            const error = 'Media metadata not found. Run media_ingest first.';
            await logger.error(error, { taskId: task.id, filePath: task.file_path });
            return { success: false, error };
        }

        const mediaId = mediaRow.id;
        const metadata: MediaMetadata = JSON.parse(mediaRow.metadata_json);
        const transcript = task.transcript || mediaRow.transcript_text;

        // Check if already tagged (unless force is true)
        if (!task.force) {
            const existingTags = db.prepare('SELECT id FROM media_tags WHERE media_id = ?').get(mediaId);
            if (existingTags) {
                await logger.info('Media already tagged, skipping', { 
                    taskId: task.id, 
                    mediaId 
                });
                return { success: true };
            }
        }

        // Generate tags using LLM
        const taggingResult = await generateMediaTags(metadata, transcript, {
            explainReasoning: task.explain_reasoning || false
        });

        if (!taggingResult.success || !taggingResult.tags) {
            await logger.error('Media tagging failed', { 
                taskId: task.id, 
                error: taggingResult.error 
            });
            return { success: false, error: taggingResult.error };
        }

        // Store tags in database
        db.run(
            `INSERT OR REPLACE INTO media_tags (media_id, task_id, tags_json, explanations_json, llm_model, confidence_score)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                mediaId,
                task.id,
                JSON.stringify(taggingResult.tags),
                JSON.stringify(taggingResult.explanations || {}),
                config.ollama.model || 'unknown',
                taggingResult.confidence || 0.8
            ]
        );

        // Update media metadata with tags
        metadata.tags = taggingResult.tags;
        metadata.tag_explanations = taggingResult.explanations;

        db.run(
            'UPDATE media_metadata SET metadata_json = ? WHERE id = ?',
            [JSON.stringify(metadata), mediaId]
        );

        // Create result summary
        const resultSummary = {
            success: true,
            tags_count: taggingResult.tags.length,
            tags: taggingResult.tags,
            confidence: taggingResult.confidence,
            has_explanations: !!taggingResult.explanations,
            processing_time_ms: taggingResult.processing_time_ms,
            llm_model: config.ollama.model
        };

        // Update task with result summary
        db.run(
            `UPDATE tasks SET result_summary = ? WHERE id = ?`,
            [JSON.stringify(resultSummary), task.id]
        );

        // Create follow-up indexing tasks
        await createIndexingTasks(task.file_path, task.id, mediaId);

        const totalTime = Date.now() - startTime;
        await logger.info('Media tagging completed successfully', {
            taskId: task.id,
            mediaId,
            tagsCount: taggingResult.tags.length,
            confidence: taggingResult.confidence,
            processingTimeMs: taggingResult.processing_time_ms,
            totalTimeMs: totalTime
        });

        return { success: true };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logger.error('Media tagging task failed', { 
            taskId: task.id, 
            error: errorMessage 
        });
        return { success: false, error: errorMessage };
    }
}

async function generateMediaTags(
    metadata: MediaMetadata, 
    transcript?: string,
    options: { explainReasoning: boolean } = { explainReasoning: false }
): Promise<TaggingResult> {
    const startTime = Date.now();
    
    try {
        // Build context for LLM
        const context = buildTaggingContext(metadata, transcript);
        
        // Create prompt for tag generation
        const prompt = createTaggingPrompt(context, options.explainReasoning);

        await logger.info('Generating tags with LLM', { 
            contextLength: context.length,
            hasTranscript: !!transcript,
            explainReasoning: options.explainReasoning
        });

        // Call LLM via tool runner
        const result = await toolRunner.executeTool('ollama_chat', {
            model: config.ollama.model || 'qwen3:8b',
            prompt,
            system: 'You are an expert media content analyzer. Generate accurate, descriptive tags for media content.',
            temperature: 0.3 // Lower temperature for more consistent tagging
        });

        if (!result.success) {
            return {
                success: false,
                error: `LLM call failed: ${result.error}`,
                processing_time_ms: Date.now() - startTime
            };
        }

        // Parse LLM response
        const parsed = parseTaggingResponse(result.response);
        
        return {
            success: true,
            tags: parsed.tags,
            explanations: parsed.explanations,
            confidence: parsed.confidence,
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

function buildTaggingContext(metadata: MediaMetadata, transcript?: string): string {
    const context = [];
    
    // Basic file info
    context.push(`File: ${metadata.filename}`);
    context.push(`Format: ${metadata.format}`);
    context.push(`Duration: ${formatDuration(metadata.duration)}`);
    
    // Media type info
    if (metadata.video && metadata.video.length > 0) {
        const video = metadata.video[0];
        context.push(`Video: ${video.resolution}, ${video.codec}`);
    }
    
    if (metadata.audio && metadata.audio.length > 0) {
        const audio = metadata.audio[0];
        context.push(`Audio: ${audio.codec}, ${audio.channels} channels`);
    }
    
    // Embedded metadata
    if (metadata.title) context.push(`Title: ${metadata.title}`);
    if (metadata.artist) context.push(`Artist: ${metadata.artist}`);
    if (metadata.album) context.push(`Album: ${metadata.album}`);
    if (metadata.year) context.push(`Year: ${metadata.year}`);
    if (metadata.genre) context.push(`Genre: ${metadata.genre}`);
    if (metadata.description) context.push(`Description: ${metadata.description}`);
    if (metadata.guessed_type) context.push(`Guessed Type: ${metadata.guessed_type}`);
    
    // Transcript (truncated if too long)
    if (transcript) {
        const truncatedTranscript = transcript.length > 2000 
            ? transcript.substring(0, 2000) + '...'
            : transcript;
        context.push(`Transcript: ${truncatedTranscript}`);
    }
    
    return context.join('\n');
}

function createTaggingPrompt(context: string, explainReasoning: boolean): string {
    const basePrompt = `
Analyze the following media content and generate descriptive tags that would help users find and categorize this content.

Media Information:
${context}

Generate tags in the following categories:
- Content Type (e.g., "movie", "tv show", "music", "podcast", "documentary")
- Genre/Style (e.g., "comedy", "horror", "rock", "classical", "educational")
- Subject Matter (e.g., "cooking", "travel", "technology", "history")
- Audience (e.g., "kids", "family", "adult")
- Era/Time Period (e.g., "90s", "modern", "vintage")
- Mood/Tone (e.g., "upbeat", "relaxing", "intense", "funny")
- Notable Elements (e.g., "baby crawling", "car chase", "interview", "live performance")

Return your response as a JSON object with this structure:
{
  "tags": ["tag1", "tag2", "tag3", ...],
  "confidence": 0.85${explainReasoning ? ',\n  "explanations": {\n    "tag1": "reason for this tag",\n    "tag2": "reason for this tag"\n  }' : ''}
}

Guidelines:
- Generate 5-15 relevant tags
- Use lowercase, simple terms
- Be specific but not overly narrow
- Focus on searchable keywords users might use
- Avoid redundant or overly similar tags
`;

    return basePrompt.trim();
}

function parseTaggingResponse(response: string): {
    tags: string[];
    explanations?: { [tag: string]: string };
    confidence: number;
} {
    try {
        // Try to extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        return {
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            explanations: parsed.explanations || undefined,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8
        };
    } catch (error) {
        // Fallback: try to extract tags from text
        const lines = response.split('\n');
        const tags: string[] = [];
        
        for (const line of lines) {
            const tagMatch = line.match(/[-*]\s*(.+)/);
            if (tagMatch) {
                tags.push(tagMatch[1].trim().toLowerCase());
            }
        }
        
        return {
            tags: tags.slice(0, 15), // Limit to 15 tags
            confidence: 0.6 // Lower confidence for fallback parsing
        };
    }
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

async function createIndexingTasks(filePath: string, parentTaskId: number, mediaId: number): Promise<void> {
    try {
        const db = getDatabase();
        
        // Create Meilisearch indexing task
        const meiliTaskData = {
            type: 'index_meili',
            description: `Index in Meilisearch: ${filePath}`,
            status: 'pending',
            parent_id: parentTaskId,
            args: JSON.stringify({ media_id: mediaId })
        };

        const meiliResult = db.run(
            `INSERT INTO tasks (type, description, status, parent_id, args)
             VALUES (?, ?, ?, ?, ?)`,
            [
                meiliTaskData.type,
                meiliTaskData.description,
                meiliTaskData.status,
                meiliTaskData.parent_id,
                meiliTaskData.args
            ]
        );

        // Create ChromaDB indexing task
        const chromaTaskData = {
            type: 'index_chroma',
            description: `Index in ChromaDB: ${filePath}`,
            status: 'pending',
            parent_id: parentTaskId,
            args: JSON.stringify({ media_id: mediaId })
        };

        const chromaResult = db.run(
            `INSERT INTO tasks (type, description, status, parent_id, args)
             VALUES (?, ?, ?, ?, ?)`,
            [
                chromaTaskData.type,
                chromaTaskData.description,
                chromaTaskData.status,
                chromaTaskData.parent_id,
                chromaTaskData.args
            ]
        );

        await logger.info('Created indexing tasks', {
            parentTaskId,
            mediaId,
            meiliTaskId: meiliResult.lastInsertRowid,
            chromaTaskId: chromaResult.lastInsertRowid
        });

    } catch (error) {
        await logger.error('Failed to create indexing tasks', {
            parentTaskId,
            mediaId,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}
