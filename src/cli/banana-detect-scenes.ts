#!/usr/bin/env bun

/**
 * Banana Bun CLI tool for video scene detection
 * 
 * Usage:
 *   bun run src/cli/banana-detect-scenes.ts --media 123
 *   bun run src/cli/banana-detect-scenes.ts --video /path/to/video.mp4 --threshold 0.3
 */

import { parseArgs } from 'util';
import { initDatabase, getDatabase } from '../db';
import { logger } from '../utils/logger';
import { createVideoSceneDetectTask } from '../executors/scene-detect';
import { sceneDetectorService } from '../services/scene-detector';

interface CliOptions {
    mediaId?: number;
    videoPath?: string;
    threshold?: number;
    force?: boolean;
    direct?: boolean; // Run directly without creating a task
    help?: boolean;
}

function printUsage() {
    console.log(`
Banana Bun Video Scene Detection Tool

Usage: bun run src/cli/banana-detect-scenes.ts [options]

Options:
  --media <id>              Media ID to detect scenes for (required if not using --video)
  --video <path>            Direct video file path (required if not using --media)
  --threshold <number>      Scene change threshold 0.0-1.0 (default: 0.4)
  --force                   Force re-detection even if scenes exist
  --direct                  Run detection directly instead of creating a task
  --help, -h                Show this help message

Examples:
  # Detect scenes for media in database
  bun run src/cli/banana-detect-scenes.ts --media 123

  # Detect scenes with custom threshold
  bun run src/cli/banana-detect-scenes.ts --media 123 --threshold 0.3

  # Direct video file processing
  bun run src/cli/banana-detect-scenes.ts --video /path/to/video.mp4 --direct

  # Force re-detection
  bun run src/cli/banana-detect-scenes.ts --media 123 --force

Scene Detection:
  - Uses FFmpeg scene filter to detect scene changes
  - Generates thumbnails for each detected scene
  - Stores scene boundaries and metadata in database
  - Creates object detection tasks for each scene
`);
}

function parseCliArgs(): CliOptions {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            media: { type: 'string' },
            video: { type: 'string' },
            threshold: { type: 'string' },
            force: { type: 'boolean', default: false },
            direct: { type: 'boolean', default: false },
            help: { type: 'boolean', short: 'h', default: false }
        }
    });

    const options: CliOptions = {
        force: values.force,
        direct: values.direct,
        help: values.help
    };

    if (values.media) {
        const mediaId = parseInt(values.media, 10);
        if (isNaN(mediaId)) {
            throw new Error(`Invalid media ID: ${values.media}`);
        }
        options.mediaId = mediaId;
    }

    if (values.video) {
        options.videoPath = values.video;
    }

    if (values.threshold) {
        const threshold = parseFloat(values.threshold);
        if (isNaN(threshold) || threshold < 0 || threshold > 1) {
            throw new Error(`Invalid threshold: ${values.threshold}. Must be between 0.0 and 1.0`);
        }
        options.threshold = threshold;
    }

    return options;
}

async function validateInputs(options: CliOptions): Promise<{ valid: boolean; error?: string; videoPath?: string }> {
    if (!options.mediaId && !options.videoPath) {
        return { valid: false, error: 'Either --media or --video must be specified' };
    }

    if (options.mediaId && options.videoPath) {
        return { valid: false, error: 'Cannot specify both --media and --video' };
    }

    let videoPath = options.videoPath;

    // If media ID is provided, get the video path from database
    if (options.mediaId) {
        const db = getDatabase();
        const mediaRow = db.prepare('SELECT file_path FROM media_metadata WHERE id = ?').get(options.mediaId) as { file_path: string } | undefined;
        
        if (!mediaRow) {
            return { valid: false, error: `Media with ID ${options.mediaId} not found` };
        }
        
        videoPath = mediaRow.file_path;
    }

    // Check if video file exists
    if (videoPath) {
        try {
            const fs = require('fs').promises;
            await fs.access(videoPath);
        } catch (error) {
            return { valid: false, error: `Video file not found: ${videoPath}` };
        }
    }

    return { valid: true, videoPath };
}

async function runDirectSceneDetection(options: CliOptions, videoPath: string): Promise<void> {
    console.log(`🎬 Detecting scenes in video...`);
    console.log(`📁 Video: ${videoPath}`);
    console.log(`🎯 Threshold: ${options.threshold || 0.4}`);
    console.log(`💪 Force: ${options.force ? 'Yes' : 'No'}\n`);

    const result = await sceneDetectorService.detectScenes(videoPath, {
        threshold: options.threshold || 0.4,
        minSceneDuration: 2,
        maxScenes: 100,
        generateThumbnails: true
    });

    if (!result.success) {
        console.error(`❌ Scene detection failed: ${result.error}`);
        process.exit(1);
    }

    console.log('✅ Scene detection completed successfully!\n');
    console.log('🎬 Detected Scenes:');
    console.log('=' .repeat(60));

    if (!result.scenes || result.scenes.length === 0) {
        console.log('No scenes detected.');
    } else {
        result.scenes.forEach((scene, index) => {
            const startTime = formatTime(scene.start_ms / 1000);
            const endTime = formatTime(scene.end_ms / 1000);
            const duration = formatTime((scene.end_ms - scene.start_ms) / 1000);
            
            console.log(`${index + 1}. Scene ${scene.scene_index}`);
            console.log(`   Time: ${startTime} - ${endTime} (${duration})`);
            console.log(`   Confidence: ${Math.round((scene.confidence_score || 0.8) * 100)}%`);
            if (scene.thumbnail_path) {
                console.log(`   Thumbnail: ${scene.thumbnail_path}`);
            }
            console.log();
        });
    }

    console.log('=' .repeat(60));
    console.log(`📊 Total scenes: ${result.total_scenes || 0}`);
    console.log(`⏱️  Processing time: ${result.processing_time_ms}ms`);
    console.log(`🔧 Tool used: ${result.tool_used}`);
}

async function createSceneDetectionTask(options: CliOptions): Promise<void> {
    if (!options.mediaId) {
        throw new Error('Media ID is required for task creation');
    }

    console.log(`📋 Creating scene detection task for media ID ${options.mediaId}...`);

    const taskId = await createVideoSceneDetectTask(options.mediaId, {
        threshold: options.threshold,
        force: options.force
    });

    console.log(`✅ Scene detection task created successfully!`);
    console.log(`📋 Task ID: ${taskId}`);
    console.log(`\n🚀 The task will be processed by the orchestrator.`);
    console.log(`   Start the system with: bun run dev`);
    console.log(`   Or check the dashboard for progress.`);
}

function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

async function main() {
    try {
        const options = parseCliArgs();

        if (options.help) {
            printUsage();
            process.exit(0);
        }

        console.log('🎬 Banana Bun Video Scene Detection Tool');
        console.log('===================================\n');

        // Initialize database if using media ID
        if (options.mediaId) {
            await initDatabase();
            console.log('✅ Database initialized');
        }

        // Validate inputs
        const validation = await validateInputs(options);
        if (!validation.valid) {
            console.error(`❌ ${validation.error}`);
            printUsage();
            process.exit(1);
        }

        // Check if scene detector service is available
        if (!sceneDetectorService.isInitialized()) {
            console.error('❌ Scene detector service not initialized');
            console.log('💡 Tip: Make sure FFmpeg is installed and available in PATH');
            process.exit(1);
        }

        console.log(`✅ Validation passed\n`);

        // Run scene detection
        if (options.direct || options.videoPath) {
            await runDirectSceneDetection(options, validation.videoPath!);
        } else {
            await createSceneDetectionTask(options);
        }

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
