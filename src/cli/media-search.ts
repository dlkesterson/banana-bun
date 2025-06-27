#!/usr/bin/env bun

/**
 * CLI tool for searching media content using Meilisearch and ChromaDB
 * 
 * Usage:
 *   bun run src/cli/media-search.ts "funny cat videos"
 *   bun run src/cli/media-search.ts --filter "tags:comedy AND tags:kids"
 *   bun run src/cli/media-search.ts "baby crawling" --semantic
 *   bun run src/cli/media-search.ts --similar /path/to/video.mp4
 */

import { parseArgs } from 'util';
import { initDatabase, getDatabase } from '../db';
import { meilisearchService } from '../services/meilisearch-service';
import { embeddingManager } from '../memory/embeddings';
import { logger } from '../utils/logger';
import type { MediaMetadata } from '../types/media';

interface CliOptions {
    query?: string;
    filter?: string;
    semantic?: boolean;
    similar?: string;
    limit?: number;
    help?: boolean;
}

function printUsage() {
    console.log(`
Usage: bun run src/cli/media-search.ts [query] [options]

Search media content using keyword or semantic search.

Arguments:
  query                 Search query text

Options:
  --filter <expr>       Meilisearch filter expression (e.g., "tags:comedy AND year:2020")
  --semantic           Use ChromaDB semantic search instead of Meilisearch
  --similar <file>     Find media similar to the specified file
  --limit <n>          Maximum number of results (default: 10)
  --help               Show this help message

Examples:
  # Keyword search
  bun run src/cli/media-search.ts "funny cat videos"
  
  # Filter by tags
  bun run src/cli/media-search.ts --filter "tags:comedy AND tags:kids"
  
  # Semantic search
  bun run src/cli/media-search.ts "baby crawling" --semantic
  
  # Find similar content
  bun run src/cli/media-search.ts --similar /path/to/video.mp4
  
  # Combined search with filters
  bun run src/cli/media-search.ts "cooking" --filter "duration > 600"
`);
}

async function main() {
    try {
        const { values, positionals } = parseArgs({
            args: Bun.argv.slice(2),
            options: {
                filter: { type: 'string' },
                semantic: { type: 'boolean' },
                similar: { type: 'string' },
                limit: { type: 'string' },
                help: { type: 'boolean' }
            },
            allowPositionals: true
        });

        const options: CliOptions = {
            query: positionals[0],
            filter: values.filter,
            semantic: values.semantic,
            similar: values.similar,
            limit: values.limit ? parseInt(values.limit) : 10,
            help: values.help
        };

        if (options.help) {
            printUsage();
            return;
        }

        // Validate options
        if (!options.query && !options.filter && !options.similar) {
            console.error('Error: Must provide a query, filter, or --similar option');
            printUsage();
            process.exit(1);
        }

        // Initialize database and services
        await initDatabase();
        await meilisearchService.initialize();
        await embeddingManager.initialize();

        console.log('🔍 Searching media content...\n');

        if (options.similar) {
            await searchSimilar(options.similar, options.limit!);
        } else if (options.semantic) {
            await searchSemantic(options.query!, options.limit!);
        } else {
            await searchKeyword(options.query, options.filter, options.limit!);
        }

    } catch (error) {
        console.error('Search failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

async function searchKeyword(query?: string, filter?: string, limit: number = 10): Promise<void> {
    try {
        const searchQuery = query || '';
        const results = await meilisearchService.search(searchQuery, {
            filter,
            limit
        });

        console.log(`📊 Keyword Search Results (${results.totalHits} total, showing ${results.hits.length})`);
        console.log(`⏱️  Processing time: ${results.processingTimeMs}ms\n`);

        if (results.hits.length === 0) {
            console.log('No results found.');
            return;
        }

        for (let i = 0; i < results.hits.length; i++) {
            const hit = results.hits[i];
            console.log(`${i + 1}. ${hit.title || hit.filename}`);
            console.log(`   📁 ${hit.file_path}`);
            console.log(`   ⏱️  ${formatDuration(hit.duration)} | 📦 ${hit.format} | 🎭 ${hit.guessed_type || 'unknown'}`);
            
            if (hit.tags && hit.tags.length > 0) {
                console.log(`   🏷️  ${hit.tags.slice(0, 5).join(', ')}${hit.tags.length > 5 ? '...' : ''}`);
            }
            
            if (hit.transcript_snippet) {
                console.log(`   💬 ${hit.transcript_snippet}`);
            }
            
            console.log('');
        }

    } catch (error) {
        console.error('Keyword search failed:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function searchSemantic(query: string, limit: number = 10): Promise<void> {
    try {
        console.log(`🧠 Semantic search for: "${query}"`);
        
        const similarTasks = await embeddingManager.findSimilarTasks(query, limit);
        
        console.log(`📊 Found ${similarTasks.length} similar items\n`);

        if (similarTasks.length === 0) {
            console.log('No similar content found.');
            return;
        }

        for (let i = 0; i < similarTasks.length; i++) {
            const task = similarTasks[i];
            const metadata = task.metadata;
            
            console.log(`${i + 1}. ${metadata?.filename || 'Unknown file'}`);
            console.log(`   📁 ${metadata?.file_path || 'Unknown path'}`);
            console.log(`   🎯 Similarity: ${(task.similarity || 0).toFixed(3)}`);
            
            if (metadata?.duration) {
                console.log(`   ⏱️  ${formatDuration(metadata.duration)} | 📦 ${metadata.format || 'unknown'}`);
            }
            
            if (task.result?.tags && Array.isArray(task.result.tags)) {
                console.log(`   🏷️  ${task.result.tags.slice(0, 5).join(', ')}`);
            }
            
            console.log('');
        }

    } catch (error) {
        console.error('Semantic search failed:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

async function searchSimilar(filePath: string, limit: number = 10): Promise<void> {
    try {
        console.log(`🔗 Finding content similar to: ${filePath}`);
        
        // Get media metadata for the file
        const db = getDatabase();
        const mediaRow = db.prepare(`
            SELECT mm.id, mm.metadata_json, mt.transcript_text, mtags.tags_json
            FROM media_metadata mm
            LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
            LEFT JOIN media_tags mtags ON mm.id = mtags.media_id
            WHERE mm.file_path = ?
        `).get(filePath) as { 
            id: number; 
            metadata_json: string; 
            transcript_text?: string; 
            tags_json?: string; 
        } | undefined;

        if (!mediaRow) {
            console.error(`Media file not found in database: ${filePath}`);
            console.log('Run media ingestion first: bun run src/cli/media-ingest.ts');
            return;
        }

        const metadata: MediaMetadata = JSON.parse(mediaRow.metadata_json);
        
        // Build search query from metadata
        const searchParts = [];
        if (metadata.title) searchParts.push(metadata.title);
        if (metadata.description) searchParts.push(metadata.description);
        if (mediaRow.tags_json) {
            const tags = JSON.parse(mediaRow.tags_json);
            searchParts.push(tags.join(' '));
        }
        if (mediaRow.transcript_text) {
            // Use first 200 characters of transcript
            searchParts.push(mediaRow.transcript_text.substring(0, 200));
        }
        
        const searchQuery = searchParts.join(' ');
        
        if (!searchQuery.trim()) {
            console.error('No searchable content found for this file');
            return;
        }

        await searchSemantic(searchQuery, limit);

    } catch (error) {
        console.error('Similar search failed:', error instanceof Error ? error.message : String(error));
        throw error;
    }
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

main().catch(console.error);
