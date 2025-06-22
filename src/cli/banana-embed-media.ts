#!/usr/bin/env bun

/**
 * Banana Bun CLI tool for generating and storing media embeddings
 * 
 * Usage:
 *   bun run src/cli/banana-embed-media.ts --media 123
 *   bun run src/cli/banana-embed-media.ts --all
 *   bun run src/cli/banana-embed-media.ts --batch 10
 */

import { parseArgs } from 'util';
import { initDatabase, getDatabase } from '../db';
import { logger } from '../utils/logger';
import { mediaEmbeddingService, type MediaEmbedding } from '../services/embedding-service';

interface CliOptions {
    mediaId?: number;
    all?: boolean;
    batch?: number;
    force?: boolean;
    help?: boolean;
}

function printUsage() {
    console.log(`
Banana Bun Media Embedding Tool

Usage: bun run src/cli/banana-embed-media.ts [options]

Options:
  --media <id>              Generate embedding for specific media ID
  --all                     Generate embeddings for all media without embeddings
  --batch <number>          Process media in batches of specified size (default: 10)
  --force                   Regenerate embeddings even if they already exist
  --help, -h                Show this help message

Examples:
  # Generate embedding for specific media
  bun run src/cli/banana-embed-media.ts --media 123

  # Generate embeddings for all unprocessed media
  bun run src/cli/banana-embed-media.ts --all

  # Process in smaller batches
  bun run src/cli/banana-embed-media.ts --all --batch 5

  # Force regenerate all embeddings
  bun run src/cli/banana-embed-media.ts --all --force
`);
}

function parseCliArgs(): CliOptions {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            media: { type: 'string' },
            all: { type: 'boolean', default: false },
            batch: { type: 'string' },
            force: { type: 'boolean', default: false },
            help: { type: 'boolean', short: 'h', default: false }
        }
    });

    const options: CliOptions = {
        all: values.all,
        force: values.force,
        help: values.help
    };

    if (values.media) {
        const mediaId = parseInt(values.media, 10);
        if (isNaN(mediaId)) {
            throw new Error(`Invalid media ID: ${values.media}`);
        }
        options.mediaId = mediaId;
    }

    if (values.batch) {
        const batch = parseInt(values.batch, 10);
        if (isNaN(batch) || batch < 1 || batch > 100) {
            throw new Error(`Invalid batch size: ${values.batch}. Must be between 1 and 100`);
        }
        options.batch = batch;
    }

    return options;
}

async function validateInputs(options: CliOptions): Promise<{ valid: boolean; error?: string }> {
    if (!options.mediaId && !options.all) {
        return { valid: false, error: 'Either --media or --all must be specified' };
    }

    if (options.mediaId && options.all) {
        return { valid: false, error: 'Cannot specify both --media and --all' };
    }

    if (options.mediaId) {
        const db = getDatabase();
        const mediaRow = db.prepare('SELECT id FROM media_metadata WHERE id = ?').get(options.mediaId);
        if (!mediaRow) {
            return { valid: false, error: `Media with ID ${options.mediaId} not found` };
        }
    }

    return { valid: true };
}

async function buildEmbeddingText(mediaData: any): Promise<string> {
    const parts: string[] = [];

    // Add title
    if (mediaData.title) {
        parts.push(`Title: ${mediaData.title}`);
    }

    // Add transcript
    if (mediaData.transcript_text) {
        parts.push(`Transcript: ${mediaData.transcript_text.substring(0, 2000)}`); // Limit transcript length
    }

    // Add tags
    if (mediaData.tags_json) {
        try {
            const tags = JSON.parse(mediaData.tags_json);
            if (Array.isArray(tags) && tags.length > 0) {
                parts.push(`Tags: ${tags.join(', ')}`);
            }
        } catch (error) {
            // Ignore invalid JSON
        }
    }

    // Add metadata
    if (mediaData.metadata_json) {
        try {
            const metadata = JSON.parse(mediaData.metadata_json);
            if (metadata.genre) {
                parts.push(`Genre: ${metadata.genre}`);
            }
            if (metadata.summary) {
                parts.push(`Summary: ${metadata.summary}`);
            }
            if (metadata.description) {
                parts.push(`Description: ${metadata.description}`);
            }
        } catch (error) {
            // Ignore invalid JSON
        }
    }

    return parts.join('\n');
}

async function generateEmbeddingForMedia(mediaId: number, force: boolean = false): Promise<boolean> {
    const db = getDatabase();
    
    try {
        // Check if embedding already exists
        if (!force) {
            const existingIndex = db.prepare(`
                SELECT chroma_indexed FROM media_index_status 
                WHERE media_id = ? AND chroma_indexed = TRUE
            `).get(mediaId);
            
            if (existingIndex) {
                console.log(`⏭️  Media ${mediaId} already has embedding (use --force to regenerate)`);
                return true;
            }
        }

        // Get media data
        const mediaRow = db.prepare(`
            SELECT mm.id, mm.metadata_json, mm.file_path,
                   mt.transcript_text, mt.language,
                   mtags.tags_json
            FROM media_metadata mm
            LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
            LEFT JOIN media_tags mtags ON mm.id = mtags.media_id
            WHERE mm.id = ?
        `).get(mediaId) as any;

        if (!mediaRow) {
            console.error(`❌ Media ${mediaId} not found`);
            return false;
        }

        // Build embedding text
        const embeddingText = await buildEmbeddingText(mediaRow);
        
        if (!embeddingText.trim()) {
            console.log(`⚠️  Media ${mediaId} has no content for embedding`);
            return false;
        }

        // Parse metadata
        let metadata: any = {};
        try {
            metadata = JSON.parse(mediaRow.metadata_json || '{}');
        } catch (error) {
            // Use empty metadata if parsing fails
        }

        // Parse tags
        let tags: string[] = [];
        try {
            tags = JSON.parse(mediaRow.tags_json || '[]');
        } catch (error) {
            // Use empty tags if parsing fails
        }

        // Create media embedding
        const mediaEmbedding: MediaEmbedding = {
            id: `media_${mediaId}`,
            media_id: mediaId,
            embedding_text: embeddingText,
            metadata: {
                title: metadata.title || metadata.filename,
                tags: tags,
                genre: metadata.genre,
                summary: metadata.summary,
                transcript: mediaRow.transcript_text,
                file_path: mediaRow.file_path,
                duration: metadata.duration,
                format: metadata.format
            }
        };

        // Add to ChromaDB
        await mediaEmbeddingService.addMediaEmbedding(mediaEmbedding);

        // Update index status
        db.run(`
            INSERT OR REPLACE INTO media_index_status 
            (media_id, chroma_indexed, chroma_embedding_id, chroma_indexed_at, last_updated)
            VALUES (?, TRUE, ?, datetime('now'), datetime('now'))
        `, [mediaId, mediaEmbedding.id]);

        console.log(`✅ Generated embedding for media ${mediaId}`);
        return true;

    } catch (error) {
        console.error(`❌ Failed to generate embedding for media ${mediaId}:`, error);
        return false;
    }
}

async function processAllMedia(batchSize: number = 10, force: boolean = false): Promise<void> {
    const db = getDatabase();
    
    // Get media IDs that need embeddings
    let query = `
        SELECT mm.id 
        FROM media_metadata mm
        LEFT JOIN media_index_status mis ON mm.id = mis.media_id
    `;
    
    if (!force) {
        query += ` WHERE mis.chroma_indexed IS NULL OR mis.chroma_indexed = FALSE`;
    }
    
    query += ` ORDER BY mm.id`;

    const mediaRows = db.prepare(query).all() as { id: number }[];
    
    if (mediaRows.length === 0) {
        console.log('✅ All media already have embeddings');
        return;
    }

    console.log(`📊 Found ${mediaRows.length} media items to process`);
    console.log(`🔄 Processing in batches of ${batchSize}...`);

    let processed = 0;
    let successful = 0;

    for (let i = 0; i < mediaRows.length; i += batchSize) {
        const batch = mediaRows.slice(i, i + batchSize);
        console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(mediaRows.length / batchSize)}`);
        
        for (const media of batch) {
            const success = await generateEmbeddingForMedia(media.id, force);
            processed++;
            if (success) successful++;
            
            // Small delay to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`📈 Progress: ${processed}/${mediaRows.length} (${successful} successful)`);
    }

    console.log(`\n🎉 Completed! Processed ${processed} media items, ${successful} successful`);
}

async function main() {
    try {
        const options = parseCliArgs();

        if (options.help) {
            printUsage();
            process.exit(0);
        }

        console.log('🧠 Banana Bun Media Embedding Tool');
        console.log('==============================\n');

        // Initialize database
        await initDatabase();
        console.log('✅ Database initialized');

        // Initialize embedding service
        await mediaEmbeddingService.initialize();
        console.log('✅ Embedding service initialized');

        // Validate inputs
        const validation = await validateInputs(options);
        if (!validation.valid) {
            console.error(`❌ ${validation.error}`);
            printUsage();
            process.exit(1);
        }

        console.log('✅ Validation passed\n');

        // Process embeddings
        if (options.mediaId) {
            console.log(`🎯 Generating embedding for media ${options.mediaId}...`);
            const success = await generateEmbeddingForMedia(options.mediaId, options.force);
            if (!success) {
                process.exit(1);
            }
        } else if (options.all) {
            await processAllMedia(options.batch || 10, options.force);
        }

        // Show stats
        const stats = await mediaEmbeddingService.getMediaEmbeddingStats();
        console.log(`\n📊 Embedding Statistics:`);
        console.log(`   Total embeddings: ${stats.total_embeddings}`);
        console.log(`   Collection: ${stats.collection_name}`);
        console.log(`   Model: ${stats.model_used}`);

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
