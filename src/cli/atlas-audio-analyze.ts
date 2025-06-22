#!/usr/bin/env bun

/**
 * Atlas CLI tool for audio analysis and music classification
 * 
 * Usage:
 *   bun run src/cli/atlas-audio-analyze.ts --media 123
 *   bun run src/cli/atlas-audio-analyze.ts --media 123 --type classification
 *   bun run src/cli/atlas-audio-analyze.ts --search --genre rock --min-bpm 120
 */

import { parseArgs } from 'util';
import { initDatabase, getDatabase } from '../db';
import { logger } from '../utils/logger';
import { createAudioAnalyzeTask, getAudioAnalysis, searchByAudioFeatures, getAudioFeatureStats } from '../executors/audio-analyze';
import { audioAnalyzerService } from '../services/audio-analyzer';

interface CliOptions {
    mediaId?: number;
    type?: 'full' | 'classification' | 'features';
    force?: boolean;
    direct?: boolean; // Run directly without creating a task
    search?: boolean; // Search by audio features
    stats?: boolean; // Show audio feature statistics
    // Search criteria
    genre?: string;
    mood?: string;
    minBpm?: number;
    maxBpm?: number;
    minEnergy?: number;
    maxEnergy?: number;
    isMusic?: boolean;
    language?: string;
    limit?: number;
    help?: boolean;
}

function printUsage() {
    console.log(`
Atlas Audio Analysis Tool

Usage: bun run src/cli/atlas-audio-analyze.ts [options]

Options:
  --media <id>              Media ID to analyze (required for analysis)
  --type <type>             Analysis type: full, classification, features (default: full)
  --force                   Force re-analysis even if results exist
  --direct                  Run analysis directly instead of creating a task
  --search                  Search media by audio features
  --stats                   Show audio feature statistics
  --help, -h                Show this help message

Search Options (use with --search):
  --genre <genre>           Filter by genre (rock, pop, classical, etc.)
  --mood <mood>             Filter by mood (energetic, calm, upbeat, etc.)
  --min-bpm <number>        Minimum BPM
  --max-bpm <number>        Maximum BPM
  --min-energy <number>     Minimum energy level (0.0-1.0)
  --max-energy <number>     Maximum energy level (0.0-1.0)
  --is-music <true/false>   Filter by music vs speech
  --language <lang>         Filter by language (en, es, fr, etc.)
  --limit <number>          Maximum results to return (default: 10)

Examples:
  # Analyze audio for media ID 123
  bun run src/cli/atlas-audio-analyze.ts --media 123

  # Quick classification only
  bun run src/cli/atlas-audio-analyze.ts --media 123 --type classification

  # Force re-analysis
  bun run src/cli/atlas-audio-analyze.ts --media 123 --force

  # Search for rock music with high energy
  bun run src/cli/atlas-audio-analyze.ts --search --genre rock --min-energy 0.7

  # Search for music between 120-140 BPM
  bun run src/cli/atlas-audio-analyze.ts --search --is-music true --min-bpm 120 --max-bpm 140

  # Show audio feature statistics
  bun run src/cli/atlas-audio-analyze.ts --stats

Audio Features:
  - Music vs Speech classification
  - Genre detection (rock, pop, classical, electronic, etc.)
  - BPM (tempo) estimation
  - Key signature detection
  - Mood analysis (energetic, calm, upbeat, etc.)
  - Audio characteristics (energy, danceability, valence)
  - Language detection for speech content
`);
}

function parseCliArgs(): CliOptions {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            media: { type: 'string' },
            type: { type: 'string' },
            force: { type: 'boolean', default: false },
            direct: { type: 'boolean', default: false },
            search: { type: 'boolean', default: false },
            stats: { type: 'boolean', default: false },
            genre: { type: 'string' },
            mood: { type: 'string' },
            'min-bpm': { type: 'string' },
            'max-bpm': { type: 'string' },
            'min-energy': { type: 'string' },
            'max-energy': { type: 'string' },
            'is-music': { type: 'string' },
            language: { type: 'string' },
            limit: { type: 'string' },
            help: { type: 'boolean', short: 'h', default: false }
        }
    });

    const options: CliOptions = {
        force: values.force,
        direct: values.direct,
        search: values.search,
        stats: values.stats,
        help: values.help
    };

    if (values.media) {
        const mediaId = parseInt(values.media, 10);
        if (isNaN(mediaId)) {
            throw new Error(`Invalid media ID: ${values.media}`);
        }
        options.mediaId = mediaId;
    }

    if (values.type) {
        if (!['full', 'classification', 'features'].includes(values.type)) {
            throw new Error(`Invalid analysis type: ${values.type}. Must be one of: full, classification, features`);
        }
        options.type = values.type as 'full' | 'classification' | 'features';
    }

    // Parse search criteria
    if (values.genre) options.genre = values.genre;
    if (values.mood) options.mood = values.mood;
    if (values.language) options.language = values.language;

    if (values['min-bpm']) {
        const minBpm = parseInt(values['min-bpm'], 10);
        if (isNaN(minBpm) || minBpm < 0) {
            throw new Error(`Invalid min-bpm: ${values['min-bpm']}`);
        }
        options.minBpm = minBpm;
    }

    if (values['max-bpm']) {
        const maxBpm = parseInt(values['max-bpm'], 10);
        if (isNaN(maxBpm) || maxBpm < 0) {
            throw new Error(`Invalid max-bpm: ${values['max-bpm']}`);
        }
        options.maxBpm = maxBpm;
    }

    if (values['min-energy']) {
        const minEnergy = parseFloat(values['min-energy']);
        if (isNaN(minEnergy) || minEnergy < 0 || minEnergy > 1) {
            throw new Error(`Invalid min-energy: ${values['min-energy']}. Must be between 0.0 and 1.0`);
        }
        options.minEnergy = minEnergy;
    }

    if (values['max-energy']) {
        const maxEnergy = parseFloat(values['max-energy']);
        if (isNaN(maxEnergy) || maxEnergy < 0 || maxEnergy > 1) {
            throw new Error(`Invalid max-energy: ${values['max-energy']}. Must be between 0.0 and 1.0`);
        }
        options.maxEnergy = maxEnergy;
    }

    if (values['is-music']) {
        if (values['is-music'] === 'true') {
            options.isMusic = true;
        } else if (values['is-music'] === 'false') {
            options.isMusic = false;
        } else {
            throw new Error(`Invalid is-music value: ${values['is-music']}. Must be 'true' or 'false'`);
        }
    }

    if (values.limit) {
        const limit = parseInt(values.limit, 10);
        if (isNaN(limit) || limit < 1 || limit > 100) {
            throw new Error(`Invalid limit: ${values.limit}. Must be between 1 and 100`);
        }
        options.limit = limit;
    }

    return options;
}

async function validateInputs(options: CliOptions): Promise<{ valid: boolean; error?: string }> {
    if (options.search || options.stats) {
        return { valid: true }; // No media ID required for search/stats
    }

    if (!options.mediaId) {
        return { valid: false, error: 'Media ID is required for audio analysis' };
    }

    const db = getDatabase();
    const mediaRow = db.prepare('SELECT file_path, metadata_json FROM media_metadata WHERE id = ?').get(options.mediaId) as { file_path: string; metadata_json: string } | undefined;
    
    if (!mediaRow) {
        return { valid: false, error: `Media with ID ${options.mediaId} not found` };
    }

    // Check if file has audio
    const metadata = JSON.parse(mediaRow.metadata_json);
    if (!metadata.audio && !metadata.format?.includes('audio')) {
        return { valid: false, error: 'Media file does not contain audio' };
    }

    return { valid: true };
}

async function runDirectAudioAnalysis(options: CliOptions): Promise<void> {
    console.log(`🎵 Analyzing audio for media ID ${options.mediaId}...`);
    console.log(`📊 Analysis type: ${options.type || 'full'}`);
    console.log(`💪 Force: ${options.force ? 'Yes' : 'No'}\n`);

    const result = await audioAnalyzerService.analyzeMediaAudio(options.mediaId!, {
        analysisType: options.type || 'full',
        sampleDuration: 30,
        extractSpectogram: options.type === 'full'
    });

    if (!result.success) {
        console.error(`❌ Audio analysis failed: ${result.error}`);
        process.exit(1);
    }

    console.log('✅ Audio analysis completed successfully!\n');
    console.log('🎵 Audio Features:');
    console.log('=' .repeat(50));

    const features = result.features!;
    console.log(`🎼 Type: ${features.is_music ? 'Music' : 'Speech/Audio'}`);
    if (features.genre) console.log(`🎸 Genre: ${features.genre}`);
    if (features.bpm) console.log(`🥁 BPM: ${features.bpm}`);
    if (features.key_signature) console.log(`🎹 Key: ${features.key_signature}`);
    if (features.mood) console.log(`😊 Mood: ${features.mood}`);
    if (features.language) console.log(`🗣️  Language: ${features.language}`);

    console.log('\n📊 Audio Characteristics:');
    if (features.energy_level !== undefined) console.log(`⚡ Energy: ${Math.round(features.energy_level * 100)}%`);
    if (features.danceability !== undefined) console.log(`💃 Danceability: ${Math.round(features.danceability * 100)}%`);
    if (features.valence !== undefined) console.log(`😄 Positivity: ${Math.round(features.valence * 100)}%`);
    if (features.speechiness !== undefined) console.log(`🗣️  Speechiness: ${Math.round(features.speechiness * 100)}%`);
    if (features.instrumentalness !== undefined) console.log(`🎻 Instrumentalness: ${Math.round(features.instrumentalness * 100)}%`);
    if (features.acousticness !== undefined) console.log(`🎸 Acousticness: ${Math.round(features.acousticness * 100)}%`);
    if (features.liveness !== undefined) console.log(`🎤 Liveness: ${Math.round(features.liveness * 100)}%`);

    console.log('\n' + '=' .repeat(50));
    console.log(`⏱️  Processing time: ${result.processing_time_ms}ms`);
    console.log(`🤖 Analysis model: ${result.analysis_model}`);
}

async function createAudioAnalysisTask(options: CliOptions): Promise<void> {
    console.log(`📋 Creating audio analysis task for media ID ${options.mediaId}...`);

    const taskId = await createAudioAnalyzeTask(options.mediaId!, {
        analysisType: options.type,
        force: options.force
    });

    console.log(`✅ Audio analysis task created successfully!`);
    console.log(`📋 Task ID: ${taskId}`);
    console.log(`\n🚀 The task will be processed by the orchestrator.`);
    console.log(`   Start the system with: bun run dev`);
    console.log(`   Or check the dashboard for progress.`);
}

async function searchAudioFeatures(options: CliOptions): Promise<void> {
    console.log('🔍 Searching media by audio features...\n');

    const results = await searchByAudioFeatures({
        isMusic: options.isMusic,
        genre: options.genre,
        minBpm: options.minBpm,
        maxBpm: options.maxBpm,
        mood: options.mood,
        minEnergy: options.minEnergy,
        maxEnergy: options.maxEnergy,
        language: options.language,
        limit: options.limit || 10
    });

    console.log('🎵 Search Results:');
    console.log('=' .repeat(60));

    if (results.length === 0) {
        console.log('No media found matching the specified criteria.');
    } else {
        results.forEach((result, index) => {
            const metadata = JSON.parse(result.metadata_json);
            console.log(`${index + 1}. ${metadata.filename || 'Unknown'}`);
            console.log(`   Type: ${result.is_music ? 'Music' : 'Speech/Audio'}`);
            if (result.genre) console.log(`   Genre: ${result.genre}`);
            if (result.bpm) console.log(`   BPM: ${result.bpm}`);
            if (result.mood) console.log(`   Mood: ${result.mood}`);
            if (result.energy_level !== null) console.log(`   Energy: ${Math.round(result.energy_level * 100)}%`);
            if (result.language) console.log(`   Language: ${result.language}`);
            console.log(`   File: ${result.file_path}`);
            console.log();
        });
    }

    console.log('=' .repeat(60));
    console.log(`📊 Found ${results.length} results`);
}

async function showAudioStats(): Promise<void> {
    console.log('📊 Audio Feature Statistics\n');

    const stats = await getAudioFeatureStats();

    console.log('📈 Overview:');
    console.log(`   Total analyzed: ${stats.total_analyzed}`);
    console.log(`   Music files: ${stats.music_count}`);
    console.log(`   Speech/Audio files: ${stats.speech_count}`);
    if (stats.avg_bpm > 0) console.log(`   Average BPM: ${stats.avg_bpm}`);
    if (stats.avg_energy > 0) console.log(`   Average Energy: ${stats.avg_energy}`);

    if (Object.keys(stats.genres).length > 0) {
        console.log('\n🎸 Genre Distribution:');
        const sortedGenres = Object.entries(stats.genres).sort((a, b) => b[1] - a[1]);
        sortedGenres.forEach(([genre, count]) => {
            console.log(`   ${genre}: ${count} files`);
        });
    }

    if (Object.keys(stats.moods).length > 0) {
        console.log('\n😊 Mood Distribution:');
        const sortedMoods = Object.entries(stats.moods).sort((a, b) => b[1] - a[1]);
        sortedMoods.forEach(([mood, count]) => {
            console.log(`   ${mood}: ${count} files`);
        });
    }

    if (Object.keys(stats.languages).length > 0) {
        console.log('\n🗣️  Language Distribution:');
        const sortedLanguages = Object.entries(stats.languages).sort((a, b) => b[1] - a[1]);
        sortedLanguages.forEach(([language, count]) => {
            console.log(`   ${language}: ${count} files`);
        });
    }
}

async function main() {
    try {
        const options = parseCliArgs();

        if (options.help) {
            printUsage();
            process.exit(0);
        }

        console.log('🎵 Atlas Audio Analysis Tool');
        console.log('============================\n');

        // Initialize database
        await initDatabase();
        console.log('✅ Database initialized');

        // Show statistics if requested
        if (options.stats) {
            await showAudioStats();
            return;
        }

        // Search if requested
        if (options.search) {
            await searchAudioFeatures(options);
            return;
        }

        // Validate inputs for analysis
        const validation = await validateInputs(options);
        if (!validation.valid) {
            console.error(`❌ ${validation.error}`);
            printUsage();
            process.exit(1);
        }

        // Check if audio analyzer service is available
        if (!audioAnalyzerService.isInitialized()) {
            console.error('❌ Audio analyzer service not initialized');
            console.log('💡 Tip: Make sure FFmpeg is installed and available in PATH');
            process.exit(1);
        }

        console.log(`✅ Validation passed\n`);

        // Run audio analysis
        if (options.direct) {
            await runDirectAudioAnalysis(options);
        } else {
            await createAudioAnalysisTask(options);
        }

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
