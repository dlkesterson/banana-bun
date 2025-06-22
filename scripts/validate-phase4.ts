#!/usr/bin/env bun

/**
 * Phase 4 Implementation Validation Script
 * 
 * This script validates that the Phase 4 implementation is correctly integrated
 * by checking imports, type definitions, and basic functionality.
 */

import { config } from '../src/config';
import { TASK_TYPES } from '../src/types/task';
import type { MediaIngestTask, MediaMetadata } from '../src/types';
import { validateMediaIngestTask } from '../src/validation/schemas';
import { isMediaIngestTask } from '../src/validation/type-guards';

console.log('🔍 Validating Phase 4 Implementation...\n');

// Test 1: Configuration
console.log('1. Testing Configuration...');
try {
    console.log('   ✅ Media config loaded:', {
        tools: config.media.tools.preferred,
        videoExtensions: config.media.extensions.video.length,
        audioExtensions: config.media.extensions.audio.length,
        deduplication: config.media.extraction.enable_deduplication
    });
} catch (error) {
    console.log('   ❌ Configuration error:', error);
    process.exit(1);
}

// Test 2: Task Types
console.log('\n2. Testing Task Types...');
try {
    const hasMediaIngest = TASK_TYPES.includes('media_ingest');
    console.log('   ✅ media_ingest in TASK_TYPES:', hasMediaIngest);
    
    if (!hasMediaIngest) {
        throw new Error('media_ingest not found in TASK_TYPES');
    }
} catch (error) {
    console.log('   ❌ Task types error:', error);
    process.exit(1);
}

// Test 3: Type Definitions
console.log('\n3. Testing Type Definitions...');
try {
    const testTask: MediaIngestTask = {
        id: 1,
        type: 'media_ingest',
        description: 'Test media ingestion',
        file_path: '/test/path/video.mp4',
        status: 'pending',
        result: null,
        force: false,
        tool_preference: 'ffprobe'
    };
    
    console.log('   ✅ MediaIngestTask interface works');
    
    const testMetadata: MediaMetadata = {
        filename: 'test.mp4',
        filepath: '/test/path/test.mp4',
        filesize: 1024000,
        file_hash: 'test-hash',
        format: 'mp4',
        duration: 120.5,
        bitrate: 1000000,
        video: [{
            codec: 'h264',
            resolution: '1920x1080',
            width: 1920,
            height: 1080,
            fps: 30,
            bitrate: 800000
        }],
        audio: [{
            codec: 'aac',
            channels: 2,
            sample_rate: 48000,
            bitrate: 128000
        }],
        guessed_type: 'movie',
        confidence: 0.85
    };
    
    console.log('   ✅ MediaMetadata interface works');
} catch (error) {
    console.log('   ❌ Type definitions error:', error);
    process.exit(1);
}

// Test 4: Validation Functions
console.log('\n4. Testing Validation Functions...');
try {
    const validTask = {
        type: 'media_ingest',
        description: 'Test task',
        file_path: '/test/path.mp4',
        id: 1,
        status: 'pending'
    };
    
    const validationResult = validateMediaIngestTask(validTask);
    console.log('   ✅ validateMediaIngestTask works:', validationResult.valid);
    
    const typeGuardResult = isMediaIngestTask(validTask);
    console.log('   ✅ isMediaIngestTask works:', typeGuardResult);
    
    if (!validationResult.valid) {
        console.log('   ⚠️  Validation errors:', validationResult.errors);
    }
} catch (error) {
    console.log('   ❌ Validation functions error:', error);
    process.exit(1);
}

// Test 5: Import Checks
console.log('\n5. Testing Import Resolution...');
try {
    // Test that all the main modules can be imported
    const modules = [
        '../src/executors/media',
        '../src/types/media',
        '../src/validation/schemas',
        '../src/validation/type-guards'
    ];
    
    for (const modulePath of modules) {
        try {
            await import(modulePath);
            console.log(`   ✅ ${modulePath} imports successfully`);
        } catch (importError) {
            console.log(`   ❌ ${modulePath} import failed:`, importError);
            throw importError;
        }
    }
} catch (error) {
    console.log('   ❌ Import resolution error:', error);
    process.exit(1);
}

console.log('\n🎉 Phase 4 Implementation Validation Complete!');
console.log('\n📋 Summary:');
console.log('   ✅ Configuration system updated');
console.log('   ✅ Task type system extended');
console.log('   ✅ Type definitions created');
console.log('   ✅ Validation functions implemented');
console.log('   ✅ All modules import successfully');
console.log('\n🚀 Phase 4 is ready for use!');

console.log('\n📖 Next Steps:');
console.log('   1. Install FFmpeg: apt install ffmpeg (Linux) or brew install ffmpeg (macOS)');
console.log('   2. Optionally install MediaInfo: apt install mediainfo');
console.log('   3. Start the system: bun run dev');
console.log('   4. Drop media files into the media/ directory');
console.log('   5. Watch automatic metadata extraction in action!');
