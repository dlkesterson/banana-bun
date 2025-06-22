#!/usr/bin/env bun

/**
 * Atlas CLI tool for object detection in video scenes
 * 
 * Usage:
 *   bun run src/cli/atlas-detect-objects.ts --scene 123
 *   bun run src/cli/atlas-detect-objects.ts --media 456 --all-scenes
 */

import { parseArgs } from 'util';
import { initDatabase, getDatabase } from '../db';
import { logger } from '../utils/logger';
import { executeVideoObjectDetectTask } from '../executors/scene-detect';
import { objectRecognizerService } from '../services/object-recognizer';

interface CliOptions {
    sceneId?: number;
    mediaId?: number;
    allScenes?: boolean;
    confidence?: number;
    force?: boolean;
    direct?: boolean; // Run directly without creating a task
    help?: boolean;
}

function printUsage() {
    console.log(`
Atlas Object Detection Tool

Usage: bun run src/cli/atlas-detect-objects.ts [options]

Options:
  --scene <id>              Scene ID to detect objects in (required if not using --media)
  --media <id>              Media ID to detect objects in all scenes (required if not using --scene)
  --all-scenes              Process all scenes for the media (use with --media)
  --confidence <number>     Confidence threshold 0.0-1.0 (default: 0.5)
  --force                   Force re-detection even if objects exist
  --direct                  Run detection directly instead of creating tasks
  --help, -h                Show this help message

Examples:
  # Detect objects in a specific scene
  bun run src/cli/atlas-detect-objects.ts --scene 123

  # Detect objects in all scenes of a media file
  bun run src/cli/atlas-detect-objects.ts --media 456 --all-scenes

  # Use custom confidence threshold
  bun run src/cli/atlas-detect-objects.ts --scene 123 --confidence 0.7

  # Force re-detection
  bun run src/cli/atlas-detect-objects.ts --scene 123 --force

Object Detection:
  - Extracts keyframes from video scenes
  - Uses TensorFlow.js for object recognition
  - Detects common objects (people, vehicles, animals, etc.)
  - Stores detected objects with confidence scores
`);
}

function parseCliArgs(): CliOptions {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            scene: { type: 'string' },
            media: { type: 'string' },
            'all-scenes': { type: 'boolean', default: false },
            confidence: { type: 'string' },
            force: { type: 'boolean', default: false },
            direct: { type: 'boolean', default: false },
            help: { type: 'boolean', short: 'h', default: false }
        }
    });

    const options: CliOptions = {
        allScenes: values['all-scenes'],
        force: values.force,
        direct: values.direct,
        help: values.help
    };

    if (values.scene) {
        const sceneId = parseInt(values.scene, 10);
        if (isNaN(sceneId)) {
            throw new Error(`Invalid scene ID: ${values.scene}`);
        }
        options.sceneId = sceneId;
    }

    if (values.media) {
        const mediaId = parseInt(values.media, 10);
        if (isNaN(mediaId)) {
            throw new Error(`Invalid media ID: ${values.media}`);
        }
        options.mediaId = mediaId;
    }

    if (values.confidence) {
        const confidence = parseFloat(values.confidence);
        if (isNaN(confidence) || confidence < 0 || confidence > 1) {
            throw new Error(`Invalid confidence: ${values.confidence}. Must be between 0.0 and 1.0`);
        }
        options.confidence = confidence;
    }

    return options;
}

async function validateInputs(options: CliOptions): Promise<{ valid: boolean; error?: string; sceneIds?: number[] }> {
    const db = getDatabase();

    if (!options.sceneId && !options.mediaId) {
        return { valid: false, error: 'Either --scene or --media must be specified' };
    }

    if (options.sceneId && options.mediaId) {
        return { valid: false, error: 'Cannot specify both --scene and --media' };
    }

    let sceneIds: number[] = [];

    if (options.sceneId) {
        // Validate single scene
        const sceneRow = db.prepare('SELECT id FROM video_scenes WHERE id = ?').get(options.sceneId);
        if (!sceneRow) {
            return { valid: false, error: `Scene with ID ${options.sceneId} not found` };
        }
        sceneIds = [options.sceneId];
    }

    if (options.mediaId) {
        // Validate media and get scenes
        const mediaRow = db.prepare('SELECT id FROM media_metadata WHERE id = ?').get(options.mediaId);
        if (!mediaRow) {
            return { valid: false, error: `Media with ID ${options.mediaId} not found` };
        }

        const scenes = db.prepare('SELECT id FROM video_scenes WHERE media_id = ? ORDER BY scene_index').all(options.mediaId) as Array<{ id: number }>;
        if (scenes.length === 0) {
            return { valid: false, error: `No scenes found for media ID ${options.mediaId}. Run scene detection first.` };
        }

        sceneIds = scenes.map(scene => scene.id);
    }

    return { valid: true, sceneIds };
}

async function runDirectObjectDetection(sceneIds: number[], options: CliOptions): Promise<void> {
    console.log(`🔍 Detecting objects in ${sceneIds.length} scene(s)...`);
    console.log(`🎯 Confidence threshold: ${options.confidence || 0.5}`);
    console.log(`💪 Force: ${options.force ? 'Yes' : 'No'}\n`);

    const results = [];

    for (let i = 0; i < sceneIds.length; i++) {
        const sceneId = sceneIds[i];
        console.log(`Processing scene ${i + 1}/${sceneIds.length} (ID: ${sceneId})...`);

        const result = await executeVideoObjectDetectTask({
            id: 0, // Dummy task ID for direct execution
            type: 'video_object_detect',
            description: `Direct object detection for scene ${sceneId}`,
            scene_id: sceneId,
            confidence_threshold: options.confidence || 0.5,
            force: options.force,
            status: 'running',
            result: null
        });

        results.push({ sceneId, result });

        if (result.success) {
            console.log(`✅ Scene ${sceneId}: ${result.objects?.length || 0} objects detected`);
        } else {
            console.log(`❌ Scene ${sceneId}: ${result.error}`);
        }
    }

    console.log('\n🔍 Object Detection Results:');
    console.log('=' .repeat(60));

    let totalObjects = 0;
    const objectCounts = new Map<string, number>();

    for (const { sceneId, result } of results) {
        if (result.success && result.objects) {
            console.log(`\nScene ${sceneId}:`);
            
            if (result.objects.length === 0) {
                console.log('  No objects detected');
            } else {
                result.objects.forEach((obj: any, index: number) => {
                    console.log(`  ${index + 1}. ${obj.label} (${Math.round(obj.confidence * 100)}%)`);
                    
                    // Count objects across all scenes
                    const current = objectCounts.get(obj.label) || 0;
                    objectCounts.set(obj.label, current + 1);
                    totalObjects++;
                });
            }
        }
    }

    console.log('\n' + '=' .repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   Total objects detected: ${totalObjects}`);
    console.log(`   Scenes processed: ${results.length}`);
    console.log(`   Success rate: ${Math.round((results.filter(r => r.result.success).length / results.length) * 100)}%`);

    if (objectCounts.size > 0) {
        console.log(`\n🏷️  Most common objects:`);
        const sortedObjects = Array.from(objectCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        sortedObjects.forEach(([label, count], index) => {
            console.log(`   ${index + 1}. ${label}: ${count} occurrences`);
        });
    }
}

async function createObjectDetectionTasks(sceneIds: number[], options: CliOptions): Promise<void> {
    const db = getDatabase();
    const taskIds: number[] = [];

    console.log(`📋 Creating object detection tasks for ${sceneIds.length} scene(s)...`);

    for (const sceneId of sceneIds) {
        const description = `Detect objects in scene ${sceneId}`;
        
        const result = db.run(
            `INSERT INTO tasks (type, description, status, args)
             VALUES (?, ?, ?, ?)`,
            [
                'video_object_detect',
                description,
                'pending',
                JSON.stringify({
                    scene_id: sceneId,
                    confidence_threshold: options.confidence || 0.5,
                    force: options.force || false
                })
            ]
        );

        taskIds.push(result.lastInsertRowid as number);
    }

    console.log(`✅ Object detection tasks created successfully!`);
    console.log(`📋 Task IDs: ${taskIds.join(', ')}`);
    console.log(`\n🚀 The tasks will be processed by the orchestrator.`);
    console.log(`   Start the system with: bun run dev`);
    console.log(`   Or check the dashboard for progress.`);
}

async function showModelInfo(): Promise<void> {
    const modelInfo = objectRecognizerService.getModelInfo();
    console.log(`🤖 Object Recognition Model Info:`);
    console.log(`   Type: ${modelInfo.type}`);
    console.log(`   Labels: ${modelInfo.labels}`);
    console.log(`   Initialized: ${modelInfo.initialized ? 'Yes' : 'No'}`);
    
    if (modelInfo.initialized) {
        const availableLabels = objectRecognizerService.getAvailableLabels();
        console.log(`\n🏷️  Available object labels (first 20):`);
        availableLabels.slice(0, 20).forEach((label, index) => {
            console.log(`   ${index + 1}. ${label}`);
        });
        if (availableLabels.length > 20) {
            console.log(`   ... and ${availableLabels.length - 20} more`);
        }
    }
}

async function main() {
    try {
        const options = parseCliArgs();

        if (options.help) {
            printUsage();
            process.exit(0);
        }

        console.log('🔍 Atlas Object Detection Tool');
        console.log('==============================\n');

        // Initialize database
        await initDatabase();
        console.log('✅ Database initialized');

        // Show model info
        await showModelInfo();
        console.log();

        // Check if object recognizer service is available
        if (!objectRecognizerService.isInitialized()) {
            console.error('❌ Object recognizer service not initialized');
            console.log('💡 Tip: TensorFlow.js model may be loading or unavailable');
            process.exit(1);
        }

        // Validate inputs
        const validation = await validateInputs(options);
        if (!validation.valid) {
            console.error(`❌ ${validation.error}`);
            printUsage();
            process.exit(1);
        }

        console.log(`✅ Validation passed - ${validation.sceneIds!.length} scene(s) to process\n`);

        // Run object detection
        if (options.direct) {
            await runDirectObjectDetection(validation.sceneIds!, options);
        } else {
            await createObjectDetectionTasks(validation.sceneIds!, options);
        }

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
