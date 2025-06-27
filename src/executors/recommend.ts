import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { recommenderService } from '../services/recommender';
import type { MediaRecommendTask } from '../types/task';

export async function executeMediaRecommendTask(task: MediaRecommendTask): Promise<{ success: boolean; error?: string; recommendations?: any[] }> {
    const startTime = Date.now();

    try {
        await logger.info('Starting media recommendation task', {
            taskId: task.id,
            mediaId: task.media_id,
            userId: task.user_id,
            recommendationType: task.recommendation_type,
            topK: task.top_k || 5
        });

        const db = getDatabase();

        // Check if recommender service is initialized
        if (!recommenderService.isInitialized()) {
            const error = 'Recommender service not initialized';
            await logger.error('Recommender service not available', { taskId: task.id, error });
            return { success: false, error };
        }

        let result;

        switch (task.recommendation_type) {
            case 'similar':
                if (!task.media_id) {
                    return { success: false, error: 'Media ID required for similar recommendations' };
                }
                result = await recommenderService.findSimilarMedia(task.media_id, {
                    topK: task.top_k || 5,
                    includeReason: true,
                    excludeWatched: true,
                    userId: task.user_id
                });
                break;

            case 'user_based':
                if (!task.user_id) {
                    return { success: false, error: 'User ID required for user-based recommendations' };
                }
                result = await recommenderService.getUserRecommendations(task.user_id, {
                    topK: task.top_k || 10,
                    includeReason: true
                });
                break;

            case 'hybrid':
                // Combine similar and user-based recommendations
                if (!task.user_id) {
                    return { success: false, error: 'User ID required for hybrid recommendations' };
                }
                result = await this.generateHybridRecommendations(task);
                break;

            default:
                return { success: false, error: `Unknown recommendation type: ${task.recommendation_type}` };
        }

        if (!result.success) {
            await logger.error('Failed to generate recommendations', {
                taskId: task.id,
                error: result.error
            });
            return { success: false, error: result.error };
        }

        // Store recommendations in database for caching/analytics
        await this.storeRecommendationResults(task, result);

        // Update MeiliSearch index with recommendation metadata
        try {
            await this.indexRecommendations(task, result);
        } catch (indexError) {
            // Don't fail the task if indexing fails
            await logger.warn('Failed to index recommendations', {
                taskId: task.id,
                error: indexError instanceof Error ? indexError.message : String(indexError)
            });
        }

        const totalTime = Date.now() - startTime;
        await logger.info('Media recommendation completed successfully', {
            taskId: task.id,
            recommendationType: task.recommendation_type,
            recommendationsCount: result.recommendations?.length || 0,
            algorithmUsed: result.algorithm_used,
            totalTimeMs: totalTime
        });

        return {
            success: true,
            recommendations: result.recommendations
        };

    } catch (error) {
        const totalTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await logger.error('Media recommendation task failed', {
            taskId: task.id,
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
 * Generate hybrid recommendations combining multiple approaches
 */
async function generateHybridRecommendations(task: MediaRecommendTask): Promise<any> {
    const topK = task.top_k || 10;
    const halfK = Math.ceil(topK / 2);

    try {
        // Get user-based recommendations
        const userResult = await recommenderService.getUserRecommendations(task.user_id!, {
            topK: halfK,
            includeReason: true
        });

        let allRecommendations = userResult.recommendations || [];

        // If we have a specific media ID, get similar recommendations too
        if (task.media_id) {
            const similarResult = await recommenderService.findSimilarMedia(task.media_id, {
                topK: halfK,
                includeReason: true,
                excludeWatched: true,
                userId: task.user_id
            });

            if (similarResult.success && similarResult.recommendations) {
                // Merge recommendations, avoiding duplicates
                const existingIds = new Set(allRecommendations.map(r => r.media_id));
                const newRecommendations = similarResult.recommendations.filter(r => !existingIds.has(r.media_id));
                allRecommendations = [...allRecommendations, ...newRecommendations];
            }
        }

        // Re-sort by score and limit to topK
        allRecommendations.sort((a, b) => b.score - a.score);
        allRecommendations = allRecommendations.slice(0, topK);

        // Update reasons to indicate hybrid approach
        allRecommendations.forEach(rec => {
            if (rec.reason) {
                rec.reason = `Hybrid: ${rec.reason}`;
            }
        });

        return {
            success: true,
            recommendations: allRecommendations,
            algorithm_used: 'hybrid'
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Store recommendation results for analytics and caching
 */
async function storeRecommendationResults(task: MediaRecommendTask, result: any): Promise<void> {
    try {
        const db = getDatabase();
        
        if (result.recommendations && Array.isArray(result.recommendations)) {
            for (const rec of result.recommendations) {
                // Check if this recommendation already exists
                const existing = db.prepare(`
                    SELECT id FROM content_recommendations 
                    WHERE source_media_id = ? AND source_user_id = ? AND recommended_media_id = ?
                    AND recommendation_type = ?
                `).get(task.media_id || null, task.user_id || null, rec.media_id, task.recommendation_type);

                if (!existing) {
                    // Insert new recommendation
                    db.run(`
                        INSERT INTO content_recommendations 
                        (source_media_id, source_user_id, recommended_media_id, recommendation_type, score, reason, algorithm_version, generated_at, expires_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, datetime('now', '+24 hours'))
                    `, [
                        task.media_id || null,
                        task.user_id || null,
                        rec.media_id,
                        task.recommendation_type,
                        rec.score,
                        rec.reason || null,
                        result.algorithm_used || 'unknown'
                    ]);
                }
            }
        }

        await logger.info('Recommendation results stored', {
            taskId: task.id,
            recommendationsStored: result.recommendations?.length || 0
        });

    } catch (error) {
        await logger.warn('Failed to store recommendation results', {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Index recommendations in MeiliSearch for searchability
 */
async function indexRecommendations(task: MediaRecommendTask, result: any): Promise<void> {
    try {
        const { meilisearchService } = await import('../services/meilisearch-service');
        
        if (result.recommendations && Array.isArray(result.recommendations)) {
            const documents = result.recommendations.map((rec, index) => ({
                id: `rec_${task.id}_${index}`,
                task_id: task.id,
                source_media_id: task.media_id,
                source_user_id: task.user_id,
                recommended_media_id: rec.media_id,
                recommendation_type: task.recommendation_type,
                score: rec.score,
                reason: rec.reason,
                algorithm_used: result.algorithm_used,
                filename: rec.metadata?.filename,
                duration: rec.metadata?.duration,
                format: rec.metadata?.format,
                indexed_at: new Date().toISOString()
            }));

            await meilisearchService.indexDocuments('recommendations', documents);
            
            await logger.info('Recommendations indexed in MeiliSearch', {
                taskId: task.id,
                documentsIndexed: documents.length
            });
        }
    } catch (error) {
        // Don't throw - this is not critical for the task success
        await logger.warn('Failed to index recommendations in MeiliSearch', {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Helper function to create a media recommendation task
 */
export async function createMediaRecommendTask(
    options: {
        mediaId?: number;
        userId?: string;
        recommendationType: 'similar' | 'user_based' | 'hybrid';
        topK?: number;
        parentTaskId?: number;
    }
): Promise<number> {
    const db = getDatabase();
    
    const description = options.mediaId 
        ? `Generate ${options.recommendationType} recommendations for media ID ${options.mediaId}`
        : `Generate ${options.recommendationType} recommendations for user ${options.userId}`;
    
    const result = db.run(
        `INSERT INTO tasks (type, description, status, args)
         VALUES (?, ?, ?, ?)`,
        [
            'media_recommend',
            description,
            'pending',
            JSON.stringify({
                media_id: options.mediaId,
                user_id: options.userId,
                recommendation_type: options.recommendationType,
                top_k: options.topK || 5
            })
        ]
    );

    const taskId = result.lastInsertRowid as number;
    
    await logger.info('Media recommendation task created', {
        taskId,
        mediaId: options.mediaId,
        userId: options.userId,
        recommendationType: options.recommendationType,
        topK: options.topK
    });

    return taskId;
}

/**
 * Helper function to record user interaction
 */
export async function recordUserInteraction(
    userId: string,
    mediaId: number,
    action: string,
    metadata?: any
): Promise<void> {
    await recommenderService.recordUserInteraction(userId, mediaId, action, metadata);
}
