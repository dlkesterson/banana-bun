import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { audioAnalyzerService } from '../services/audio-analyzer';
import type { AudioAnalyzeTask } from '../types/task';

export async function executeAudioAnalyzeTask(task: AudioAnalyzeTask): Promise<{ success: boolean; error?: string; features?: any }> {
    const startTime = Date.now();

    try {
        await logger.info('Starting audio analysis task', {
            taskId: task.id,
            mediaId: task.media_id,
            analysisType: task.analysis_type || 'full',
            force: task.force
        });

        const db = getDatabase();

        // Check if audio analyzer service is initialized
        if (!audioAnalyzerService.isInitialized()) {
            const error = 'Audio analyzer service not initialized - FFmpeg may not be available';
            await logger.error('Audio analyzer service not available', { taskId: task.id, error });
            return { success: false, error };
        }

        // Check if analysis already exists and force is not set
        if (!task.force) {
            const existingAnalysis = db.prepare('SELECT * FROM audio_features WHERE media_id = ?').get(task.media_id) as any;
            if (existingAnalysis) {
                await logger.info('Audio analysis already exists, skipping', {
                    taskId: task.id,
                    mediaId: task.media_id,
                    analysisId: existingAnalysis.id
                });
                return {
                    success: true,
                    features: existingAnalysis
                };
            }
        }

        // Get media file path
        const mediaRow = db.prepare('SELECT file_path, metadata_json FROM media_metadata WHERE id = ?').get(task.media_id) as { file_path: string; metadata_json: string } | undefined;
        if (!mediaRow) {
            return { success: false, error: `Media with ID ${task.media_id} not found` };
        }

        // Check if file has audio
        const metadata = JSON.parse(mediaRow.metadata_json);
        if (!metadata.audio && !metadata.format?.includes('audio')) {
            return { success: false, error: 'Media file does not contain audio' };
        }

        // Run audio analysis
        const result = await audioAnalyzerService.analyzeMediaAudio(task.media_id, {
            analysisType: task.analysis_type || 'full',
            sampleDuration: 30,
            extractSpectogram: task.analysis_type === 'full'
        });

        if (!result.success) {
            await logger.error('Audio analysis failed', {
                taskId: task.id,
                mediaId: task.media_id,
                error: result.error
            });
            return { success: false, error: result.error };
        }

        // Store analysis results in database
        if (result.features) {
            // Clear existing analysis if force is true
            if (task.force) {
                db.run('DELETE FROM audio_features WHERE media_id = ?', [task.media_id]);
            }

            const insertStmt = db.prepare(`
                INSERT OR REPLACE INTO audio_features (
                    media_id, is_music, genre, bpm, key_signature, mood,
                    energy_level, danceability, valence, loudness, speechiness,
                    instrumentalness, liveness, acousticness, language,
                    features_json, analysis_model
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const features = result.features;
            insertStmt.run(
                task.media_id,
                features.is_music ? 1 : 0,
                features.genre || null,
                features.bpm || null,
                features.key_signature || null,
                features.mood || null,
                features.energy_level || null,
                features.danceability || null,
                features.valence || null,
                features.loudness || null,
                features.speechiness || null,
                features.instrumentalness || null,
                features.liveness || null,
                features.acousticness || null,
                features.language || null,
                features.features_json || null,
                result.analysis_model || 'ffmpeg_heuristic'
            );

            await logger.info('Audio analysis stored in database', {
                taskId: task.id,
                mediaId: task.media_id,
                isMusic: features.is_music,
                genre: features.genre,
                bpm: features.bpm,
                mood: features.mood
            });
        }

        // Update MeiliSearch index with audio features
        try {
            await this.indexAudioFeatures(task.media_id, result.features);
        } catch (indexError) {
            await logger.warn('Failed to index audio features', {
                taskId: task.id,
                error: indexError instanceof Error ? indexError.message : String(indexError)
            });
        }

        const totalTime = Date.now() - startTime;
        await logger.info('Audio analysis completed successfully', {
            taskId: task.id,
            mediaId: task.media_id,
            isMusic: result.features?.is_music,
            genre: result.features?.genre,
            processingTimeMs: result.processing_time_ms,
            totalTimeMs: totalTime
        });

        return {
            success: true,
            features: result.features
        };

    } catch (error) {
        const totalTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await logger.error('Audio analysis task failed', {
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
 * Index audio features in MeiliSearch
 */
async function indexAudioFeatures(mediaId: number, features: any): Promise<void> {
    try {
        const { meilisearchService } = await import('../services/meilisearch-service');
        const { getDatabase } = await import('../db');
        const db = getDatabase();
        
        // Get media metadata for indexing
        const mediaRow = db.prepare(`
            SELECT mm.file_path, mm.metadata_json
            FROM media_metadata mm
            WHERE mm.id = ?
        `).get(mediaId) as any;

        if (mediaRow && features) {
            const metadata = JSON.parse(mediaRow.metadata_json);
            
            // Create searchable document with audio features
            const searchDocument = {
                id: `audio_${mediaId}`,
                media_id: mediaId,
                title: metadata.filename || 'Unknown',
                file_path: mediaRow.file_path,
                is_music: features.is_music,
                genre: features.genre,
                bpm: features.bpm,
                key_signature: features.key_signature,
                mood: features.mood,
                energy_level: features.energy_level,
                danceability: features.danceability,
                valence: features.valence,
                speechiness: features.speechiness,
                instrumentalness: features.instrumentalness,
                language: features.language,
                duration: metadata.duration,
                format: metadata.format,
                indexed_at: new Date().toISOString()
            };

            await meilisearchService.indexDocument('audio_features', searchDocument);
            
            await logger.info('Audio features indexed in MeiliSearch', {
                mediaId,
                documentId: searchDocument.id,
                isMusic: features.is_music,
                genre: features.genre
            });
        }
    } catch (error) {
        await logger.warn('Failed to index audio features in MeiliSearch', {
            mediaId,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Helper function to create an audio analysis task
 */
export async function createAudioAnalyzeTask(
    mediaId: number,
    options: {
        analysisType?: 'full' | 'classification' | 'features';
        force?: boolean;
        parentTaskId?: number;
    } = {}
): Promise<number> {
    const db = getDatabase();
    
    const description = `Analyze audio features for media ID ${mediaId}`;
    
    const result = db.run(
        `INSERT INTO tasks (type, description, status, args)
         VALUES (?, ?, ?, ?)`,
        [
            'audio_analyze',
            description,
            'pending',
            JSON.stringify({
                media_id: mediaId,
                analysis_type: options.analysisType || 'full',
                force: options.force || false
            })
        ]
    );

    const taskId = result.lastInsertRowid as number;
    
    await logger.info('Audio analysis task created', {
        taskId,
        mediaId,
        analysisType: options.analysisType || 'full',
        force: options.force
    });

    return taskId;
}

/**
 * Helper function to get audio analysis results
 */
export async function getAudioAnalysis(mediaId: number): Promise<any | null> {
    const db = getDatabase();
    
    const analysis = db.prepare('SELECT * FROM audio_features WHERE media_id = ?').get(mediaId);
    return analysis || null;
}

/**
 * Helper function to search media by audio features
 */
export async function searchByAudioFeatures(criteria: {
    isMusic?: boolean;
    genre?: string;
    minBpm?: number;
    maxBpm?: number;
    mood?: string;
    minEnergy?: number;
    maxEnergy?: number;
    language?: string;
    limit?: number;
}): Promise<any[]> {
    const db = getDatabase();
    
    let query = `
        SELECT af.*, mm.file_path, mm.metadata_json
        FROM audio_features af
        JOIN media_metadata mm ON af.media_id = mm.id
        WHERE 1=1
    `;
    const params: any[] = [];

    if (criteria.isMusic !== undefined) {
        query += ' AND af.is_music = ?';
        params.push(criteria.isMusic ? 1 : 0);
    }

    if (criteria.genre) {
        query += ' AND af.genre = ?';
        params.push(criteria.genre);
    }

    if (criteria.minBpm !== undefined) {
        query += ' AND af.bpm >= ?';
        params.push(criteria.minBpm);
    }

    if (criteria.maxBpm !== undefined) {
        query += ' AND af.bpm <= ?';
        params.push(criteria.maxBpm);
    }

    if (criteria.mood) {
        query += ' AND af.mood = ?';
        params.push(criteria.mood);
    }

    if (criteria.minEnergy !== undefined) {
        query += ' AND af.energy_level >= ?';
        params.push(criteria.minEnergy);
    }

    if (criteria.maxEnergy !== undefined) {
        query += ' AND af.energy_level <= ?';
        params.push(criteria.maxEnergy);
    }

    if (criteria.language) {
        query += ' AND af.language = ?';
        params.push(criteria.language);
    }

    query += ' ORDER BY af.analyzed_at DESC';
    
    if (criteria.limit) {
        query += ' LIMIT ?';
        params.push(criteria.limit);
    }

    return db.prepare(query).all(...params) as any[];
}

/**
 * Helper function to get audio feature statistics
 */
export async function getAudioFeatureStats(): Promise<any> {
    const db = getDatabase();
    
    const stats = {
        total_analyzed: 0,
        music_count: 0,
        speech_count: 0,
        genres: {} as Record<string, number>,
        moods: {} as Record<string, number>,
        languages: {} as Record<string, number>,
        avg_bpm: 0,
        avg_energy: 0
    };

    // Get basic counts
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM audio_features').get() as { count: number };
    stats.total_analyzed = totalCount.count;

    const musicCount = db.prepare('SELECT COUNT(*) as count FROM audio_features WHERE is_music = 1').get() as { count: number };
    stats.music_count = musicCount.count;
    stats.speech_count = stats.total_analyzed - stats.music_count;

    // Get genre distribution
    const genres = db.prepare('SELECT genre, COUNT(*) as count FROM audio_features WHERE genre IS NOT NULL GROUP BY genre').all() as Array<{ genre: string; count: number }>;
    for (const genre of genres) {
        stats.genres[genre.genre] = genre.count;
    }

    // Get mood distribution
    const moods = db.prepare('SELECT mood, COUNT(*) as count FROM audio_features WHERE mood IS NOT NULL GROUP BY mood').all() as Array<{ mood: string; count: number }>;
    for (const mood of moods) {
        stats.moods[mood.mood] = mood.count;
    }

    // Get language distribution
    const languages = db.prepare('SELECT language, COUNT(*) as count FROM audio_features WHERE language IS NOT NULL GROUP BY language').all() as Array<{ language: string; count: number }>;
    for (const lang of languages) {
        stats.languages[lang.language] = lang.count;
    }

    // Get averages
    const avgStats = db.prepare('SELECT AVG(bpm) as avg_bpm, AVG(energy_level) as avg_energy FROM audio_features WHERE bpm IS NOT NULL AND energy_level IS NOT NULL').get() as { avg_bpm: number; avg_energy: number };
    stats.avg_bpm = Math.round(avgStats.avg_bpm || 0);
    stats.avg_energy = Math.round((avgStats.avg_energy || 0) * 100) / 100;

    return stats;
}
