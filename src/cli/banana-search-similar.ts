#!/usr/bin/env bun

/**
 * Banana Bun CLI tool for finding similar media using vector embeddings
 * 
 * Usage:
 *   bun run src/cli/banana-search-similar.ts --media 456 --top 10
 *   bun run src/cli/banana-search-similar.ts --query "action movie with robots"
 *   bun run src/cli/banana-search-similar.ts --media 123 --cluster
 */

import { parseArgs } from 'util';
import { initDatabase, getDatabase } from '../db';
import { logger } from '../utils/logger';
import { mediaEmbeddingService } from '../services/embedding-service';
import { safeParseInt, safeParseFloat } from '../utils/safe-access';

interface CliOptions {
    mediaId?: number;
    query?: string;
    top?: number;
    cluster?: boolean;
    threshold?: number;
    help?: boolean;
}

function printUsage() {
    console.log(`
Banana Bun Similar Media Search Tool

Usage: bun run src/cli/banana-search-similar.ts [options]

Options:
  --media <id>              Find media similar to this media ID
  --query <text>            Search for media using text query
  --top <number>            Number of results to return (default: 10)
  --cluster                 Group results by similarity clusters
  --threshold <number>      Minimum similarity threshold (0.0-1.0, default: 0.1)
  --help, -h                Show this help message

Examples:
  # Find similar media by ID
  bun run src/cli/banana-search-similar.ts --media 456 --top 10

  # Search by text query
  bun run src/cli/banana-search-similar.ts --query "action movie with robots"

  # Find similar with clustering
  bun run src/cli/banana-search-similar.ts --media 123 --cluster

  # Set similarity threshold
  bun run src/cli/banana-search-similar.ts --media 456 --threshold 0.3
`);
}

function parseCliArgs(): CliOptions {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            media: { type: 'string' },
            query: { type: 'string' },
            top: { type: 'string' },
            cluster: { type: 'boolean', default: false },
            threshold: { type: 'string' },
            help: { type: 'boolean', short: 'h', default: false }
        }
    });

    const options: CliOptions = {
        cluster: values.cluster,
        help: values.help
    };

    if (values.media) {
        const mediaId = safeParseInt(values.media);
        if (mediaId === undefined) {
            throw new Error(`Invalid media ID: ${values.media}`);
        }
        options.mediaId = mediaId;
    }

    if (values.query) {
        options.query = values.query;
    }

    if (values.top) {
        const top = safeParseInt(values.top);
        if (top === undefined || top < 1 || top > 100) {
            throw new Error(`Invalid top value: ${values.top}. Must be between 1 and 100`);
        }
        options.top = top;
    }

    if (values.threshold) {
        const threshold = safeParseFloat(values.threshold);
        if (threshold === undefined || threshold < 0 || threshold > 1) {
            throw new Error(`Invalid threshold: ${values.threshold}. Must be between 0.0 and 1.0`);
        }
        options.threshold = threshold;
    }

    return options;
}

async function validateInputs(options: CliOptions): Promise<{ valid: boolean; error?: string }> {
    if (!options.mediaId && !options.query) {
        return { valid: false, error: 'Either --media or --query must be specified' };
    }

    if (options.mediaId && options.query) {
        return { valid: false, error: 'Cannot specify both --media and --query' };
    }

    if (options.mediaId) {
        const db = getDatabase();
        const mediaRow = db.prepare('SELECT id FROM media_metadata WHERE id = ?').get(options.mediaId);
        if (!mediaRow) {
            return { valid: false, error: `Media with ID ${options.mediaId} not found` };
        }

        // Check if media has embedding
        const indexStatus = db.prepare(`
            SELECT chroma_indexed FROM media_index_status 
            WHERE media_id = ? AND chroma_indexed = TRUE
        `).get(options.mediaId);
        
        if (!indexStatus) {
            return { 
                valid: false, 
                error: `Media ${options.mediaId} has no embedding. Run: bun run src/cli/banana-embed-media.ts --media ${options.mediaId}` 
            };
        }
    }

    return { valid: true };
}

function formatDuration(seconds: number): string {
    if (!seconds) return 'Unknown';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else {
        return `${minutes}m ${secs}s`;
    }
}

function displayResults(results: any[], sourceMediaId?: number) {
    if (results.length === 0) {
        console.log('No similar media found.');
        return;
    }

    console.log('🎯 Similar Media Results:');
    console.log('=' .repeat(80));

    results.forEach((result, index) => {
        const similarity = Math.round(result.similarity_score * 100);
        const title = result.metadata.title || `Media ID ${result.media_id}`;
        
        console.log(`${index + 1}. ${title}`);
        console.log(`   📊 Similarity: ${similarity}%`);
        console.log(`   🆔 Media ID: ${result.media_id}`);
        
        if (result.metadata.tags) {
            try {
                const tags = JSON.parse(result.metadata.tags);
                if (Array.isArray(tags) && tags.length > 0) {
                    console.log(`   🏷️  Tags: ${tags.slice(0, 5).join(', ')}${tags.length > 5 ? '...' : ''}`);
                }
            } catch (error) {
                // Ignore invalid JSON
            }
        }
        
        if (result.metadata.genre) {
            console.log(`   🎭 Genre: ${result.metadata.genre}`);
        }
        
        if (result.metadata.duration) {
            console.log(`   ⏱️  Duration: ${formatDuration(result.metadata.duration)}`);
        }
        
        if (result.metadata.format) {
            console.log(`   📁 Format: ${result.metadata.format}`);
        }
        
        if (result.metadata.file_path) {
            const filename = result.metadata.file_path.split('/').pop();
            console.log(`   📄 File: ${filename}`);
        }
        
        console.log();
    });

    console.log('=' .repeat(80));
    console.log(`📈 Found ${results.length} similar media items`);
    if (sourceMediaId) {
        console.log(`🎯 Source: Media ID ${sourceMediaId}`);
    }
}

function clusterResults(results: any[], threshold: number = 0.7): any[][] {
    const clusters: any[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < results.length; i++) {
        if (used.has(i)) continue;

        const cluster = [results[i]];
        used.add(i);

        for (let j = i + 1; j < results.length; j++) {
            if (used.has(j)) continue;

            // Simple clustering based on similarity score difference
            const scoreDiff = Math.abs(results[i].similarity_score - results[j].similarity_score);
            if (scoreDiff < (1 - threshold)) {
                cluster.push(results[j]);
                used.add(j);
            }
        }

        clusters.push(cluster);
    }

    return clusters;
}

function displayClusters(clusters: any[][]) {
    console.log('🔗 Similarity Clusters:');
    console.log('=' .repeat(80));

    clusters.forEach((cluster, clusterIndex) => {
        console.log(`\n📦 Cluster ${clusterIndex + 1} (${cluster.length} items):`);
        console.log('-' .repeat(40));
        
        cluster.forEach((item, itemIndex) => {
            const similarity = Math.round(item.similarity_score * 100);
            const title = item.metadata.title || `Media ID ${item.media_id}`;
            console.log(`  ${itemIndex + 1}. ${title} (${similarity}%)`);
        });
    });

    console.log('\n' + '=' .repeat(80));
    console.log(`📊 Found ${clusters.length} clusters`);
}

async function searchSimilarMedia(options: CliOptions): Promise<void> {
    const topK = options.top || 10;
    const threshold = options.threshold || 0.1;

    let results;

    if (options.mediaId) {
        console.log(`🔍 Finding media similar to ID ${options.mediaId}...`);
        results = await mediaEmbeddingService.findSimilarMedia(options.mediaId, topK);
    } else if (options.query) {
        console.log(`🔍 Searching for: "${options.query}"...`);
        results = await mediaEmbeddingService.searchMediaByText(options.query, topK);
    } else {
        throw new Error('No search criteria specified');
    }

    // Filter by threshold
    results = results.filter(r => r.similarity_score >= threshold);

    console.log(`\n📊 Search completed. Found ${results.length} results above ${Math.round(threshold * 100)}% similarity.\n`);

    if (options.cluster && results.length > 1) {
        const clusters = clusterResults(results, 0.7);
        displayClusters(clusters);
    } else {
        displayResults(results, options.mediaId);
    }
}

async function main() {
    try {
        const options = parseCliArgs();

        if (options.help) {
            printUsage();
            process.exit(0);
        }

        console.log('🔍 Banana Bun Similar Media Search Tool');
        console.log('===================================\n');

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

        // Perform search
        await searchSimilarMedia(options);

        // Show embedding stats
        const stats = await mediaEmbeddingService.getMediaEmbeddingStats();
        console.log(`\n📊 Embedding Database:`);
        console.log(`   Total embeddings: ${stats.total_embeddings}`);
        console.log(`   Model: ${stats.model_used}`);

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
