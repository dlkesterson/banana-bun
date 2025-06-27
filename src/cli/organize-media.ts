#!/usr/bin/env bun

import { parseArgs } from 'util';
import { getDatabase, initDatabase } from '../db';
import { executeMediaOrganizeTask } from '../executors/media';
import type { MediaOrganizeTask } from '../types/task';
import { logger } from '../utils/logger';

interface CliOptions {
    filePath?: string;
    filePaths?: string[];
    collection?: 'tv' | 'movies' | 'youtube' | 'catchall';
    dryRun?: boolean;
    force?: boolean;
    help?: boolean;
}

function printUsage() {
    console.log(`
Usage: bun run src/cli/organize-media.ts [options]

Options:
  --file-path <path>        Single file to organize
  --file-paths <paths>      Multiple files to organize (comma-separated)
  --collection <type>       Force specific collection (tv, movies, youtube, catchall)
  --dry-run                 Simulate organization without moving files
  --force                   Override existing files
  --help                    Show this help message

Examples:
  # Organize a single movie file
  bun run src/cli/organize-media.ts --file-path "/path/to/The.Matrix.1999.mkv"

  # Organize multiple TV episodes
  bun run src/cli/organize-media.ts --file-paths "/path/to/S01E01.mkv,/path/to/S01E02.mkv" --collection tv

  # Dry run to see what would happen
  bun run src/cli/organize-media.ts --file-path "/path/to/movie.mkv" --dry-run

  # Force organization even if target exists
  bun run src/cli/organize-media.ts --file-path "/path/to/movie.mkv" --force
`);
}

async function main() {
    try {
        const { values } = parseArgs({
            args: process.argv.slice(2),
            options: {
                'file-path': { type: 'string' },
                'file-paths': { type: 'string' },
                'collection': { type: 'string' },
                'dry-run': { type: 'boolean' },
                'force': { type: 'boolean' },
                'help': { type: 'boolean' }
            }
        });

        const options: CliOptions = {
            filePath: values['file-path'],
            filePaths: values['file-paths']?.split(',').map(p => p.trim()),
            collection: values['collection'] as any,
            dryRun: values['dry-run'],
            force: values['force'],
            help: values['help']
        };

        if (options.help) {
            printUsage();
            process.exit(0);
        }

        if (!options.filePath && !options.filePaths) {
            console.error('Error: Must specify either --file-path or --file-paths');
            printUsage();
            process.exit(1);
        }

        if (options.filePath && options.filePaths) {
            console.error('Error: Cannot specify both --file-path and --file-paths');
            printUsage();
            process.exit(1);
        }

        if (options.collection && !['tv', 'movies', 'youtube', 'catchall'].includes(options.collection)) {
            console.error('Error: Invalid collection type. Must be one of: tv, movies, youtube, catchall');
            process.exit(1);
        }

        // Initialize database
        await initDatabase();

        // Create media organize task
        const task: MediaOrganizeTask = {
            id: Date.now(), // Use timestamp as ID for CLI
            type: 'media_organize',
            description: `CLI organize: ${options.filePath || options.filePaths?.join(', ')}`,
            status: 'pending',
            result: null,
            file_path: options.filePath,
            file_paths: options.filePaths,
            target_collection: options.collection,
            dry_run: options.dryRun,
            force: options.force
        };

        console.log('Starting media organization...');
        console.log(`Files: ${options.filePath || options.filePaths?.join(', ')}`);
        if (options.collection) {
            console.log(`Forced collection: ${options.collection}`);
        }
        if (options.dryRun) {
            console.log('DRY RUN MODE - No files will be moved');
        }
        console.log('');

        // Execute the task
        const result = await executeMediaOrganizeTask(task);

        if (result.success) {
            console.log('✅ Media organization completed successfully!');
            
            // Get the result summary from the database
            const db = getDatabase();
            const taskRecord = db.prepare('SELECT result_summary FROM tasks WHERE id = ?').get(task.id) as { result_summary: string } | undefined;
            
            if (taskRecord?.result_summary) {
                const summary = JSON.parse(taskRecord.result_summary);
                console.log('\nSummary:');
                console.log(`  Total files: ${summary.total}`);
                console.log(`  Successful: ${summary.successful}`);
                console.log(`  Failed: ${summary.failed}`);
                console.log(`  Skipped: ${summary.skipped}`);
                
                if (summary.results && summary.results.length > 0) {
                    console.log('\nDetails:');
                    for (const fileResult of summary.results) {
                        const status = fileResult.success ? '✅' : '❌';
                        const reason = fileResult.reason || fileResult.error || '';
                        console.log(`  ${status} ${fileResult.originalPath}`);
                        if (fileResult.actualPath && fileResult.actualPath !== fileResult.originalPath) {
                            console.log(`     → ${fileResult.actualPath}`);
                        }
                        if (reason) {
                            console.log(`     ${reason}`);
                        }
                    }
                }
            }
        } else {
            console.error('❌ Media organization failed:', result.error);
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// Run the CLI
main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});
