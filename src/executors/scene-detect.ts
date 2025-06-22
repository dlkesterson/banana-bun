import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { sceneDetectorService } from '../services/scene-detector';
import { objectRecognizerService } from '../services/object-recognizer';
import type { VideoSceneDetectTask, VideoObjectDetectTask } from '../types/task';

export async function executeVideoSceneDetectTask(task: VideoSceneDetectTask): Promise<{ success: boolean; error?: string; scenes?: any[] }> {
    const startTime = Date.now();

    try {
        await logger.info('Starting video scene detection task', {
            taskId: task.id,
            mediaId: task.media_id,
            threshold: task.threshold || 0.4,
            force: task.force
        });

        const db = getDatabase();

        // Check if scene detector service is initialized
        if (!sceneDetectorService.isInitialized()) {
            const error = 'Scene detector service not initialized - FFmpeg may not be available';
            await logger.error('Scene detector service not available', { taskId: task.id, error });
            return { success: false, error };
        }

        // Get media file path
        const mediaRow = db.prepare('SELECT file_path FROM media_metadata WHERE id = ?').get(task.media_id) as { file_path: string } | undefined;
        if (!mediaRow) {
            return { success: false, error: `Media with ID ${task.media_id} not found` };
        }

        // Check if scenes already exist and force is not set
        if (!task.force) {
            const existingScenes = db.prepare('SELECT COUNT(*) as count FROM video_scenes WHERE media_id = ?').get(task.media_id) as { count: number };
            if (existingScenes.count > 0) {
                await logger.info('Scenes already exist, skipping detection', {
                    taskId: task.id,
                    mediaId: task.media_id,
                    existingScenes: existingScenes.count
                });
                
                const scenes = db.prepare('SELECT * FROM video_scenes WHERE media_id = ? ORDER BY scene_index').all(task.media_id);
                return { success: true, scenes };
            }
        }

        // Run scene detection
        const result = await sceneDetectorService.detectScenes(mediaRow.file_path, {
            threshold: task.threshold || 0.4,
            minSceneDuration: 2,
            maxScenes: 100,
            generateThumbnails: true
        });

        if (!result.success) {
            await logger.error('Scene detection failed', {
                taskId: task.id,
                mediaId: task.media_id,
                error: result.error
            });
            return { success: false, error: result.error };
        }

        // Store scenes in database
        if (result.scenes && result.scenes.length > 0) {
            // Clear existing scenes if force is true
            if (task.force) {
                db.run('DELETE FROM video_scenes WHERE media_id = ?', [task.media_id]);
                db.run('DELETE FROM scene_objects WHERE scene_id IN (SELECT id FROM video_scenes WHERE media_id = ?)', [task.media_id]);
            }

            const insertSceneStmt = db.prepare(`
                INSERT INTO video_scenes (media_id, start_ms, end_ms, thumbnail_path, scene_index, confidence_score)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            const sceneIds: number[] = [];
            for (const scene of result.scenes) {
                const sceneResult = insertSceneStmt.run(
                    task.media_id,
                    scene.start_ms,
                    scene.end_ms,
                    scene.thumbnail_path || null,
                    scene.scene_index,
                    scene.confidence_score || 0.8
                );
                sceneIds.push(sceneResult.lastInsertRowid as number);
            }

            await logger.info('Scenes stored in database', {
                taskId: task.id,
                mediaId: task.media_id,
                scenesStored: sceneIds.length
            });

            // Create object detection tasks for each scene
            await this.createObjectDetectionTasks(task.media_id, sceneIds);
        }

        // Update MeiliSearch index with scene metadata
        try {
            await this.indexScenes(task.media_id, result.scenes || []);
        } catch (indexError) {
            await logger.warn('Failed to index scenes', {
                taskId: task.id,
                error: indexError instanceof Error ? indexError.message : String(indexError)
            });
        }

        const totalTime = Date.now() - startTime;
        await logger.info('Video scene detection completed successfully', {
            taskId: task.id,
            mediaId: task.media_id,
            scenesDetected: result.scenes?.length || 0,
            totalTimeMs: totalTime
        });

        return {
            success: true,
            scenes: result.scenes
        };

    } catch (error) {
        const totalTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await logger.error('Video scene detection task failed', {
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

export async function executeVideoObjectDetectTask(task: VideoObjectDetectTask): Promise<{ success: boolean; error?: string; objects?: any[] }> {
    const startTime = Date.now();

    try {
        await logger.info('Starting video object detection task', {
            taskId: task.id,
            sceneId: task.scene_id,
            confidenceThreshold: task.confidence_threshold || 0.5,
            force: task.force
        });

        const db = getDatabase();

        // Check if object recognizer service is initialized
        if (!objectRecognizerService.isInitialized()) {
            const error = 'Object recognizer service not initialized';
            await logger.error('Object recognizer service not available', { taskId: task.id, error });
            return { success: false, error };
        }

        // Get scene and media information
        const sceneRow = db.prepare(`
            SELECT vs.*, mm.file_path 
            FROM video_scenes vs 
            JOIN media_metadata mm ON vs.media_id = mm.id 
            WHERE vs.id = ?
        `).get(task.scene_id) as { file_path: string; start_ms: number; end_ms: number; scene_index: number; media_id: number } | undefined;

        if (!sceneRow) {
            return { success: false, error: `Scene with ID ${task.scene_id} not found` };
        }

        // Check if objects already exist and force is not set
        if (!task.force) {
            const existingObjects = db.prepare('SELECT COUNT(*) as count FROM scene_objects WHERE scene_id = ?').get(task.scene_id) as { count: number };
            if (existingObjects.count > 0) {
                await logger.info('Objects already exist, skipping detection', {
                    taskId: task.id,
                    sceneId: task.scene_id,
                    existingObjects: existingObjects.count
                });
                
                const objects = db.prepare('SELECT * FROM scene_objects WHERE scene_id = ? ORDER BY confidence DESC').all(task.scene_id);
                return { success: true, objects };
            }
        }

        // Extract keyframes from the scene
        const keyframes = await sceneDetectorService.extractKeyframes(
            sceneRow.file_path,
            {
                start_ms: sceneRow.start_ms,
                end_ms: sceneRow.end_ms,
                scene_index: sceneRow.scene_index
            },
            '/tmp/atlas_keyframes', // Temporary directory
            3 // Extract 3 keyframes per scene
        );

        if (keyframes.length === 0) {
            return { success: false, error: 'No keyframes could be extracted from scene' };
        }

        // Run object detection on keyframes
        const detectionResults = await objectRecognizerService.detectObjectsInBatch(keyframes, {
            confidenceThreshold: task.confidence_threshold || 0.5,
            maxDetections: 10
        });

        // Aggregate objects from all keyframes
        const objectMap = new Map<string, { confidence: number; count: number }>();
        
        for (const result of detectionResults) {
            if (result.success && result.objects) {
                for (const obj of result.objects) {
                    const existing = objectMap.get(obj.label);
                    if (existing) {
                        existing.confidence = Math.max(existing.confidence, obj.confidence);
                        existing.count += 1;
                    } else {
                        objectMap.set(obj.label, { confidence: obj.confidence, count: 1 });
                    }
                }
            }
        }

        // Convert to final objects list
        const finalObjects = Array.from(objectMap.entries()).map(([label, data]) => ({
            label,
            confidence: data.confidence,
            detection_count: data.count
        })).sort((a, b) => b.confidence - a.confidence);

        // Store objects in database
        if (finalObjects.length > 0) {
            // Clear existing objects if force is true
            if (task.force) {
                db.run('DELETE FROM scene_objects WHERE scene_id = ?', [task.scene_id]);
            }

            const insertObjectStmt = db.prepare(`
                INSERT INTO scene_objects (scene_id, label, confidence, bounding_box)
                VALUES (?, ?, ?, ?)
            `);

            for (const obj of finalObjects) {
                insertObjectStmt.run(
                    task.scene_id,
                    obj.label,
                    obj.confidence,
                    null // No bounding box for now
                );
            }

            await logger.info('Objects stored in database', {
                taskId: task.id,
                sceneId: task.scene_id,
                objectsStored: finalObjects.length
            });
        }

        // Clean up temporary keyframes
        try {
            const fs = require('fs').promises;
            for (const keyframe of keyframes) {
                await fs.unlink(keyframe).catch(() => {}); // Ignore errors
            }
        } catch (error) {
            // Cleanup errors are not critical
        }

        const totalTime = Date.now() - startTime;
        await logger.info('Video object detection completed successfully', {
            taskId: task.id,
            sceneId: task.scene_id,
            objectsDetected: finalObjects.length,
            keyframesProcessed: keyframes.length,
            totalTimeMs: totalTime
        });

        return {
            success: true,
            objects: finalObjects
        };

    } catch (error) {
        const totalTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await logger.error('Video object detection task failed', {
            taskId: task.id,
            sceneId: task.scene_id,
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
 * Create object detection tasks for scenes
 */
async function createObjectDetectionTasks(mediaId: number, sceneIds: number[]): Promise<void> {
    const db = getDatabase();
    
    for (const sceneId of sceneIds) {
        const description = `Detect objects in scene ${sceneId} of media ${mediaId}`;
        
        db.run(
            `INSERT INTO tasks (type, description, status, args)
             VALUES (?, ?, ?, ?)`,
            [
                'video_object_detect',
                description,
                'pending',
                JSON.stringify({
                    scene_id: sceneId,
                    confidence_threshold: 0.5,
                    force: false
                })
            ]
        );
    }

    await logger.info('Object detection tasks created', {
        mediaId,
        tasksCreated: sceneIds.length
    });
}

/**
 * Index scenes in MeiliSearch
 */
async function indexScenes(mediaId: number, scenes: any[]): Promise<void> {
    try {
        const { meilisearchService } = await import('../services/meilisearch-service');
        
        const documents = scenes.map((scene, index) => ({
            id: `scene_${mediaId}_${scene.scene_index}`,
            media_id: mediaId,
            scene_index: scene.scene_index,
            start_ms: scene.start_ms,
            end_ms: scene.end_ms,
            duration_ms: scene.end_ms - scene.start_ms,
            confidence_score: scene.confidence_score,
            thumbnail_path: scene.thumbnail_path,
            indexed_at: new Date().toISOString()
        }));

        await meilisearchService.indexDocuments('video_scenes', documents);
        
        await logger.info('Scenes indexed in MeiliSearch', {
            mediaId,
            documentsIndexed: documents.length
        });
    } catch (error) {
        await logger.warn('Failed to index scenes in MeiliSearch', {
            mediaId,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Helper function to create a video scene detection task
 */
export async function createVideoSceneDetectTask(
    mediaId: number,
    options: {
        threshold?: number;
        force?: boolean;
        parentTaskId?: number;
    } = {}
): Promise<number> {
    const db = getDatabase();
    
    const description = `Detect scenes in video for media ID ${mediaId}`;
    
    const result = db.run(
        `INSERT INTO tasks (type, description, status, args)
         VALUES (?, ?, ?, ?)`,
        [
            'video_scene_detect',
            description,
            'pending',
            JSON.stringify({
                media_id: mediaId,
                threshold: options.threshold || 0.4,
                force: options.force || false
            })
        ]
    );

    const taskId = result.lastInsertRowid as number;
    
    await logger.info('Video scene detection task created', {
        taskId,
        mediaId,
        threshold: options.threshold,
        force: options.force
    });

    return taskId;
}
