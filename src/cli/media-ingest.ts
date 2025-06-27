#!/usr/bin/env bun

/**
 * CLI tool for manually triggering media ingestion tasks
 * 
 * Usage:
 *   bun run src/cli/media-ingest.ts /path/to/media/file.mp4
 *   bun run src/cli/media-ingest.ts /path/to/media/file.mp4 --force
 *   bun run src/cli/media-ingest.ts /path/to/media/file.mp4 --tool=mediainfo
 */

import { promises as fs } from 'fs';
import { basename, extname } from 'path';
import { initDatabase, getDatabase } from '../db';
import { config } from '../config';
import { logger } from '../utils/logger';
import { hashFile } from '../utils/hash';
import type { MediaIngestTask } from '../types/task';

interface CliOptions {
    filePath: string;
    force?: boolean;
    tool?: 'ffprobe' | 'mediainfo' | 'auto';
    help?: boolean;
}

function parseArgs(args: string[]): CliOptions {
    const options: CliOptions = {
        filePath: '',
        force: false,
        tool: 'auto'
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else if (arg === '--force' || arg === '-f') {
            options.force = true;
        } else if (arg.startsWith('--tool=')) {
            const tool = arg.split('=')[1] as 'ffprobe' | 'mediainfo' | 'auto';
            if (['ffprobe', 'mediainfo', 'auto'].includes(tool)) {
                options.tool = tool;
            } else {
                throw new Error(`Invalid tool: ${tool}. Must be one of: ffprobe, mediainfo, auto`);
            }
        } else if (!arg.startsWith('-') && !options.filePath) {
            options.filePath = arg;
        }
    }

    return options;
}

function printHelp() {
    console.log(`
Media Ingestion CLI Tool

Usage:
  bun run src/cli/media-ingest.ts <file_path> [options]

Arguments:
  file_path                 Path to the media file to ingest

Options:
  --force, -f              Force processing even if file was already processed
  --tool=<tool>            Specify extraction tool (ffprobe, mediainfo, auto)
  --help, -h               Show this help message

Examples:
  bun run src/cli/media-ingest.ts /path/to/video.mp4
  bun run src/cli/media-ingest.ts /path/to/audio.mp3 --force
  bun run src/cli/media-ingest.ts /path/to/movie.mkv --tool=mediainfo

Supported Media Formats:
  Video: ${config.media.extensions.video.join(', ')}
  Audio: ${config.media.extensions.audio.join(', ')}
`);
}

function isMediaFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    const allExtensions = [
        ...config.media.extensions.video,
        ...config.media.extensions.audio
    ];
    return allExtensions.includes(ext);
}

async function createMediaIngestTask(options: CliOptions): Promise<number> {
    const { filePath, force, tool } = options;
    
    // Validate file exists
    try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
            throw new Error('Path is not a file');
        }
    } catch (error) {
        throw new Error(`File not found or not accessible: ${filePath}`);
    }

    // Validate file type
    if (!isMediaFile(filePath)) {
        throw new Error(`File type not supported. Supported extensions: ${[...config.media.extensions.video, ...config.media.extensions.audio].join(', ')}`);
    }

    // Calculate file hash
    const fileHash = await hashFile(filePath);
    const filename = basename(filePath);
    
    // Check for existing processing
    const db = getDatabase();
    if (!force && config.media.extraction.enable_deduplication) {
        const existing = db.prepare('SELECT id, task_id FROM media_metadata WHERE file_hash = ?').get(fileHash);
        if (existing) {
            console.log(`⚠️  File already processed (task ID: ${existing.task_id})`);
            console.log('   Use --force to reprocess');
            return existing.task_id;
        }
    }

    // Create task
    const description = `Manual media ingestion for ${filename}`;
    const taskArgs = {
        file_path: filePath,
        force: force || false,
        tool_preference: tool
    };

    const result = db.run(
        `INSERT INTO tasks (type, description, status, file_hash, args)
         VALUES (?, ?, ?, ?, ?)`,
        [
            'media_ingest',
            description,
            'pending',
            fileHash,
            JSON.stringify(taskArgs)
        ]
    );

    const taskId = result.lastInsertRowid as number;
    
    await logger.info('Manual media ingestion task created', {
        taskId,
        filePath,
        filename,
        fileHash,
        force,
        tool
    });

    return taskId;
}

async function main() {
    try {
        const args = process.argv.slice(2);
        const options = parseArgs(args);

        if (options.help || !options.filePath) {
            printHelp();
            process.exit(0);
        }

        console.log('🎬 Media Ingestion CLI Tool');
        console.log('==========================\n');

        // Initialize database
        await initDatabase();
        console.log('✅ Database initialized');

        // Create task
        console.log(`📁 Processing: ${options.filePath}`);
        console.log(`🔧 Tool: ${options.tool}`);
        console.log(`💪 Force: ${options.force ? 'Yes' : 'No'}\n`);

        const taskId = await createMediaIngestTask(options);
        
        console.log(`✅ Media ingestion task created successfully!`);
        console.log(`📋 Task ID: ${taskId}`);
        console.log(`\n🚀 The task will be processed by the orchestrator.`);
        console.log(`   Start the system with: bun run dev`);
        console.log(`   Or check the dashboard for progress.`);

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.main) {
    main();
}
