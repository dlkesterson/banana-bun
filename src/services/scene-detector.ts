import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface Scene {
    start_ms: number;
    end_ms: number;
    scene_index: number;
    confidence_score?: number;
    thumbnail_path?: string;
}

export interface SceneDetectionOptions {
    threshold?: number; // Scene change threshold (0.0 to 1.0)
    minSceneDuration?: number; // Minimum scene duration in seconds
    maxScenes?: number; // Maximum number of scenes to detect
    generateThumbnails?: boolean;
    outputDir?: string;
}

export interface SceneDetectionResult {
    success: boolean;
    scenes?: Scene[];
    error?: string;
    total_scenes?: number;
    processing_time_ms?: number;
    tool_used?: string;
}

export class SceneDetectorService {
    private initialized = false;
    private ffmpegPath: string;
    private ffprobePath: string;

    constructor() {
        this.ffmpegPath = 'ffmpeg'; // Assume ffmpeg is in PATH
        this.ffprobePath = 'ffprobe'; // Assume ffprobe is in PATH
        this.initialize();
    }

    private async initialize() {
        try {
            // Check if FFmpeg is available
            await this.checkFFmpegAvailability();
            this.initialized = true;
            await logger.info('Scene detector service initialized successfully');
        } catch (error) {
            await logger.error('Failed to initialize scene detector service', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async checkFFmpegAvailability(): Promise<void> {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(this.ffmpegPath, ['-version']);
            
            ffmpeg.on('error', (error) => {
                reject(new Error(`FFmpeg not found: ${error.message}`));
            });
            
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg check failed with code ${code}`));
                }
            });
        });
    }

    async detectScenes(videoPath: string, options: SceneDetectionOptions = {}): Promise<SceneDetectionResult> {
        const startTime = Date.now();

        if (!this.initialized) {
            return {
                success: false,
                error: 'Scene detector service not initialized - FFmpeg may not be available'
            };
        }

        try {
            const {
                threshold = 0.4,
                minSceneDuration = 2,
                maxScenes = 100,
                generateThumbnails = false,
                outputDir = config.paths.outputs
            } = options;

            await logger.info('Starting scene detection', {
                videoPath,
                threshold,
                minSceneDuration,
                maxScenes,
                generateThumbnails
            });

            // Ensure output directory exists
            await fs.mkdir(outputDir, { recursive: true });

            // Get video duration first
            const duration = await this.getVideoDuration(videoPath);
            if (!duration) {
                return {
                    success: false,
                    error: 'Could not determine video duration'
                };
            }

            // Detect scenes using FFmpeg scene filter
            const scenes = await this.runSceneDetection(videoPath, threshold, minSceneDuration, duration);

            // Limit number of scenes
            const limitedScenes = scenes.slice(0, maxScenes);

            // Generate thumbnails if requested
            if (generateThumbnails) {
                await this.generateThumbnails(videoPath, limitedScenes, outputDir);
            }

            const processingTime = Date.now() - startTime;
            await logger.info('Scene detection completed', {
                videoPath,
                totalScenes: limitedScenes.length,
                processingTimeMs: processingTime
            });

            return {
                success: true,
                scenes: limitedScenes,
                total_scenes: limitedScenes.length,
                processing_time_ms: processingTime,
                tool_used: 'ffmpeg'
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            await logger.error('Scene detection failed', {
                videoPath,
                error: errorMessage,
                processingTimeMs: processingTime
            });

            return {
                success: false,
                error: errorMessage,
                processing_time_ms: processingTime
            };
        }
    }

    private async getVideoDuration(videoPath: string): Promise<number | null> {
        return new Promise((resolve) => {
            const ffprobe = spawn(this.ffprobePath, [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                videoPath
            ]);

            let output = '';
            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code === 0) {
                    try {
                        const info = JSON.parse(output);
                        const duration = parseFloat(info.format?.duration);
                        resolve(isNaN(duration) ? null : duration);
                    } catch (error) {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            });

            ffprobe.on('error', () => {
                resolve(null);
            });
        });
    }

    private async runSceneDetection(videoPath: string, threshold: number, minDuration: number, totalDuration: number): Promise<Scene[]> {
        return new Promise((resolve, reject) => {
            // Use FFmpeg scene filter to detect scene changes
            const ffmpeg = spawn(this.ffmpegPath, [
                '-i', videoPath,
                '-filter:v', `select='gt(scene,${threshold})',showinfo`,
                '-f', 'null',
                '-'
            ]);

            let output = '';
            let errorOutput = '';

            ffmpeg.stderr.on('data', (data) => {
                const text = data.toString();
                output += text;
                errorOutput += text;
            });

            ffmpeg.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`FFmpeg scene detection failed: ${errorOutput}`));
                    return;
                }

                try {
                    const scenes = this.parseSceneOutput(output, totalDuration, minDuration);
                    resolve(scenes);
                } catch (error) {
                    reject(error);
                }
            });

            ffmpeg.on('error', (error) => {
                reject(new Error(`FFmpeg execution failed: ${error.message}`));
            });
        });
    }

    private parseSceneOutput(output: string, totalDuration: number, minDuration: number): Scene[] {
        const scenes: Scene[] = [];
        const lines = output.split('\n');
        const timestamps: number[] = [0]; // Start with beginning of video

        // Extract timestamps from FFmpeg output
        for (const line of lines) {
            const match = line.match(/pts_time:(\d+\.?\d*)/);
            if (match) {
                const timestamp = parseFloat(match[1]);
                if (timestamp > 0 && timestamp < totalDuration) {
                    timestamps.push(timestamp);
                }
            }
        }

        // Add end of video
        timestamps.push(totalDuration);

        // Create scenes from timestamps
        for (let i = 0; i < timestamps.length - 1; i++) {
            const startTime = timestamps[i];
            const endTime = timestamps[i + 1];
            const duration = endTime - startTime;

            // Filter out scenes that are too short
            if (duration >= minDuration) {
                scenes.push({
                    start_ms: Math.round(startTime * 1000),
                    end_ms: Math.round(endTime * 1000),
                    scene_index: scenes.length,
                    confidence_score: 0.8 // Default confidence for FFmpeg detection
                });
            }
        }

        return scenes;
    }

    private async generateThumbnails(videoPath: string, scenes: Scene[], outputDir: string): Promise<void> {
        const videoBasename = basename(videoPath, extname(videoPath));
        const thumbnailDir = join(outputDir, 'thumbnails', videoBasename);
        
        await fs.mkdir(thumbnailDir, { recursive: true });

        const thumbnailPromises = scenes.map(async (scene, index) => {
            const thumbnailPath = join(thumbnailDir, `scene_${scene.scene_index}.jpg`);
            const midpointSeconds = (scene.start_ms + scene.end_ms) / 2000; // Convert to seconds

            return new Promise<void>((resolve, reject) => {
                const ffmpeg = spawn(this.ffmpegPath, [
                    '-i', videoPath,
                    '-ss', midpointSeconds.toString(),
                    '-vframes', '1',
                    '-q:v', '2', // High quality
                    '-y', // Overwrite output file
                    thumbnailPath
                ]);

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        scene.thumbnail_path = thumbnailPath;
                        resolve();
                    } else {
                        reject(new Error(`Thumbnail generation failed for scene ${scene.scene_index}`));
                    }
                });

                ffmpeg.on('error', (error) => {
                    reject(new Error(`FFmpeg thumbnail generation failed: ${error.message}`));
                });
            });
        });

        // Generate thumbnails in parallel but limit concurrency
        const batchSize = 3;
        for (let i = 0; i < thumbnailPromises.length; i += batchSize) {
            const batch = thumbnailPromises.slice(i, i + batchSize);
            try {
                await Promise.all(batch);
            } catch (error) {
                await logger.warn('Some thumbnail generation failed', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    /**
     * Extract keyframes from a specific scene for object detection
     */
    async extractKeyframes(videoPath: string, scene: Scene, outputDir: string, maxFrames: number = 5): Promise<string[]> {
        if (!this.initialized) {
            throw new Error('Scene detector service not initialized');
        }

        const videoBasename = basename(videoPath, extname(videoPath));
        const framesDir = join(outputDir, 'keyframes', videoBasename, `scene_${scene.scene_index}`);
        
        await fs.mkdir(framesDir, { recursive: true });

        const sceneDurationSeconds = (scene.end_ms - scene.start_ms) / 1000;
        const startSeconds = scene.start_ms / 1000;
        const interval = Math.max(1, sceneDurationSeconds / maxFrames);

        const framePromises: Promise<string>[] = [];

        for (let i = 0; i < maxFrames; i++) {
            const timestamp = startSeconds + (i * interval);
            if (timestamp >= startSeconds + sceneDurationSeconds) break;

            const framePath = join(framesDir, `frame_${i}.jpg`);
            
            const framePromise = new Promise<string>((resolve, reject) => {
                const ffmpeg = spawn(this.ffmpegPath, [
                    '-i', videoPath,
                    '-ss', timestamp.toString(),
                    '-vframes', '1',
                    '-q:v', '2',
                    '-y',
                    framePath
                ]);

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        resolve(framePath);
                    } else {
                        reject(new Error(`Frame extraction failed at ${timestamp}s`));
                    }
                });

                ffmpeg.on('error', (error) => {
                    reject(new Error(`FFmpeg frame extraction failed: ${error.message}`));
                });
            });

            framePromises.push(framePromise);
        }

        try {
            const framePaths = await Promise.all(framePromises);
            await logger.info('Keyframes extracted', {
                videoPath,
                sceneIndex: scene.scene_index,
                framesExtracted: framePaths.length
            });
            return framePaths;
        } catch (error) {
            await logger.error('Keyframe extraction failed', {
                videoPath,
                sceneIndex: scene.scene_index,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Check if the service is properly initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

// Export lazy singleton instance
let _sceneDetectorService: SceneDetectorService | null = null;

export function getSceneDetectorService(): SceneDetectorService {
    if (!_sceneDetectorService) {
        _sceneDetectorService = new SceneDetectorService();
    }
    return _sceneDetectorService;
}

// For backward compatibility - use a getter to make it lazy
export const sceneDetectorService = new Proxy({} as SceneDetectorService, {
    get(target, prop) {
        return getSceneDetectorService()[prop as keyof SceneDetectorService];
    }
});
