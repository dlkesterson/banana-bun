#!/usr/bin/env bun

/**
 * CLI tool for managing media tags
 * 
 * Usage:
 *   bun run src/cli/media-tags.ts list /path/to/video.mp4
 *   bun run src/cli/media-tags.ts add /path/to/video.mp4 "comedy" "kids"
 *   bun run src/cli/media-tags.ts remove /path/to/video.mp4 "horror"
 *   bun run src/cli/media-tags.ts retag /path/to/video.mp4 --explain
 */

import { parseArgs } from 'util';
import { initDatabase, getDatabase } from '../db';
import { logger } from '../utils/logger';
import type { MediaMetadata } from '../types/media';

interface CliOptions {
    command: string;
    filePath?: string;
    tags?: string[];
    explain?: boolean;
    force?: boolean;
    help?: boolean;
}

function printUsage() {
    console.log(`
Usage: bun run src/cli/media-tags.ts <command> [options]

Manage AI-generated tags for media files.

Commands:
  list <file>           Show tags for a media file
  add <file> <tags...>  Add tags to a media file
  remove <file> <tags...> Remove tags from a media file
  retag <file>          Re-run AI tagging for a file
  explain <file>        Show tag explanations

Options:
  --explain            Show LLM reasoning for tags (with retag command)
  --force              Force re-tagging even if tags exist
  --help               Show this help message

Examples:
  # List tags for a file
  bun run src/cli/media-tags.ts list /path/to/video.mp4
  
  # Add custom tags
  bun run src/cli/media-tags.ts add /path/to/video.mp4 "comedy" "kids" "family"
  
  # Remove tags
  bun run src/cli/media-tags.ts remove /path/to/video.mp4 "horror"
  
  # Re-run AI tagging with explanations
  bun run src/cli/media-tags.ts retag /path/to/video.mp4 --explain --force
  
  # Show tag explanations
  bun run src/cli/media-tags.ts explain /path/to/video.mp4
`);
}

async function main() {
    try {
        const { values, positionals } = parseArgs({
            args: Bun.argv.slice(2),
            options: {
                explain: { type: 'boolean' },
                force: { type: 'boolean' },
                help: { type: 'boolean' }
            },
            allowPositionals: true
        });

        const options: CliOptions = {
            command: positionals[0],
            filePath: positionals[1],
            tags: positionals.slice(2),
            explain: values.explain,
            force: values.force,
            help: values.help
        };

        if (options.help || !options.command) {
            printUsage();
            return;
        }

        if (!options.filePath && ['list', 'add', 'remove', 'retag', 'explain'].includes(options.command)) {
            console.error('Error: File path is required for this command');
            printUsage();
            process.exit(1);
        }

        // Initialize database
        await initDatabase();

        switch (options.command) {
            case 'list':
                await listTags(options.filePath!);
                break;
            case 'add':
                if (!options.tags || options.tags.length === 0) {
                    console.error('Error: No tags provided to add');
                    process.exit(1);
                }
                await addTags(options.filePath!, options.tags);
                break;
            case 'remove':
                if (!options.tags || options.tags.length === 0) {
                    console.error('Error: No tags provided to remove');
                    process.exit(1);
                }
                await removeTags(options.filePath!, options.tags);
                break;
            case 'retag':
                await retagFile(options.filePath!, options.explain, options.force);
                break;
            case 'explain':
                await explainTags(options.filePath!);
                break;
            default:
                console.error(`Unknown command: ${options.command}`);
                printUsage();
                process.exit(1);
        }

    } catch (error) {
        console.error('Command failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

async function listTags(filePath: string): Promise<void> {
    const db = getDatabase();
    
    const mediaRow = db.prepare(`
        SELECT mm.id, mm.metadata_json, mm.filename, mtags.tags_json, mtags.confidence_score, mtags.tagged_at
        FROM media_metadata mm
        LEFT JOIN media_tags mtags ON mm.id = mtags.media_id
        WHERE mm.file_path = ?
    `).get(filePath) as { 
        id: number; 
        metadata_json: string; 
        filename: string;
        tags_json?: string; 
        confidence_score?: number;
        tagged_at?: string;
    } | undefined;

    if (!mediaRow) {
        console.error(`Media file not found: ${filePath}`);
        console.log('Run media ingestion first: bun run src/cli/media-ingest.ts');
        return;
    }

    console.log(`📁 File: ${mediaRow.filename}`);
    console.log(`🆔 Media ID: ${mediaRow.id}`);

    if (!mediaRow.tags_json) {
        console.log('🏷️  No tags found. Run tagging first:');
        console.log(`   bun run src/cli/media-tags.ts retag "${filePath}"`);
        return;
    }

    const tags = JSON.parse(mediaRow.tags_json);
    console.log(`🏷️  Tags (${tags.length}):`);
    
    for (const tag of tags) {
        console.log(`   • ${tag}`);
    }

    if (mediaRow.confidence_score) {
        console.log(`🎯 Confidence: ${(mediaRow.confidence_score * 100).toFixed(1)}%`);
    }

    if (mediaRow.tagged_at) {
        console.log(`📅 Tagged: ${new Date(mediaRow.tagged_at).toLocaleString()}`);
    }
}

async function addTags(filePath: string, newTags: string[]): Promise<void> {
    const db = getDatabase();
    
    const mediaRow = db.prepare(`
        SELECT mm.id, mm.metadata_json, mtags.tags_json
        FROM media_metadata mm
        LEFT JOIN media_tags mtags ON mm.id = mtags.media_id
        WHERE mm.file_path = ?
    `).get(filePath) as { 
        id: number; 
        metadata_json: string; 
        tags_json?: string; 
    } | undefined;

    if (!mediaRow) {
        console.error(`Media file not found: ${filePath}`);
        return;
    }

    const mediaId = mediaRow.id;
    const metadata: MediaMetadata = JSON.parse(mediaRow.metadata_json);
    
    // Get existing tags
    let existingTags: string[] = [];
    if (mediaRow.tags_json) {
        existingTags = JSON.parse(mediaRow.tags_json);
    }

    // Add new tags (avoid duplicates)
    const allTags = [...new Set([...existingTags, ...newTags])];
    
    console.log(`Adding tags: ${newTags.join(', ')}`);
    console.log(`Total tags: ${allTags.length}`);

    // Update database
    if (mediaRow.tags_json) {
        // Update existing record
        db.run(
            'UPDATE media_tags SET tags_json = ?, last_updated = datetime("now") WHERE media_id = ?',
            [JSON.stringify(allTags), mediaId]
        );
    } else {
        // Create new record
        db.run(
            `INSERT INTO media_tags (media_id, task_id, tags_json, llm_model, confidence_score)
             VALUES (?, 0, ?, 'manual', 1.0)`,
            [mediaId, JSON.stringify(allTags)]
        );
    }

    // Update metadata
    metadata.tags = allTags;
    db.run(
        'UPDATE media_metadata SET metadata_json = ? WHERE id = ?',
        [JSON.stringify(metadata), mediaId]
    );

    console.log('✅ Tags added successfully');
}

async function removeTags(filePath: string, tagsToRemove: string[]): Promise<void> {
    const db = getDatabase();
    
    const mediaRow = db.prepare(`
        SELECT mm.id, mm.metadata_json, mtags.tags_json
        FROM media_metadata mm
        LEFT JOIN media_tags mtags ON mm.id = mtags.media_id
        WHERE mm.file_path = ?
    `).get(filePath) as { 
        id: number; 
        metadata_json: string; 
        tags_json?: string; 
    } | undefined;

    if (!mediaRow || !mediaRow.tags_json) {
        console.error(`No tags found for file: ${filePath}`);
        return;
    }

    const mediaId = mediaRow.id;
    const metadata: MediaMetadata = JSON.parse(mediaRow.metadata_json);
    const existingTags: string[] = JSON.parse(mediaRow.tags_json);
    
    // Remove specified tags
    const remainingTags = existingTags.filter(tag => !tagsToRemove.includes(tag));
    
    console.log(`Removing tags: ${tagsToRemove.join(', ')}`);
    console.log(`Remaining tags: ${remainingTags.length}`);

    // Update database
    db.run(
        'UPDATE media_tags SET tags_json = ?, last_updated = datetime("now") WHERE media_id = ?',
        [JSON.stringify(remainingTags), mediaId]
    );

    // Update metadata
    metadata.tags = remainingTags;
    db.run(
        'UPDATE media_metadata SET metadata_json = ? WHERE id = ?',
        [JSON.stringify(metadata), mediaId]
    );

    console.log('✅ Tags removed successfully');
}

async function retagFile(filePath: string, explain?: boolean, force?: boolean): Promise<void> {
    const db = getDatabase();
    
    // Create a media_tag task
    const filename = filePath.split(/[/\\]/).pop() || 'unknown';
    
    const taskData = {
        type: 'media_tag',
        description: `Re-tag media file: ${filename}`,
        status: 'pending',
        args: JSON.stringify({
            file_path: filePath,
            explain_reasoning: explain,
            force: force
        })
    };

    const result = db.run(
        `INSERT INTO tasks (type, description, status, args)
         VALUES (?, ?, ?, ?)`,
        [
            taskData.type,
            taskData.description,
            taskData.status,
            taskData.args
        ]
    );

    const taskId = result.lastInsertRowid;
    
    console.log(`🚀 Created tagging task (ID: ${taskId})`);
    console.log('📋 Task will be processed by the main orchestrator');
    console.log('💡 Check task status with: bun run src/cli/schedule-manager.ts metrics');
}

async function explainTags(filePath: string): Promise<void> {
    const db = getDatabase();
    
    const mediaRow = db.prepare(`
        SELECT mm.filename, mtags.tags_json, mtags.explanations_json, mtags.confidence_score
        FROM media_metadata mm
        LEFT JOIN media_tags mtags ON mm.id = mtags.media_id
        WHERE mm.file_path = ?
    `).get(filePath) as { 
        filename: string;
        tags_json?: string; 
        explanations_json?: string;
        confidence_score?: number;
    } | undefined;

    if (!mediaRow || !mediaRow.tags_json) {
        console.error(`No tags found for file: ${filePath}`);
        return;
    }

    const tags = JSON.parse(mediaRow.tags_json);
    const explanations = mediaRow.explanations_json ? JSON.parse(mediaRow.explanations_json) : {};

    console.log(`📁 File: ${mediaRow.filename}`);
    console.log(`🏷️  Tags with explanations:\n`);

    for (const tag of tags) {
        console.log(`• ${tag}`);
        if (explanations[tag]) {
            console.log(`  💭 ${explanations[tag]}`);
        } else {
            console.log(`  💭 No explanation available`);
        }
        console.log('');
    }

    if (mediaRow.confidence_score) {
        console.log(`🎯 Overall confidence: ${(mediaRow.confidence_score * 100).toFixed(1)}%`);
    }
}

main().catch(console.error);
