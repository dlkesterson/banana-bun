#!/usr/bin/env bun

/**
 * Atlas CLI tool for tracking user tag corrections and feedback
 * 
 * Usage:
 *   bun run src/cli/track-tag-edits.ts --media 123 --tags "Action, Sci-fi"
 *   bun run src/cli/track-tag-edits.ts --media 456 --genre "Science Fiction"
 *   bun run src/cli/track-tag-edits.ts --media 789 --rating 4.5
 */

import { parseArgs } from 'util';
import { initDatabase, getDatabase } from '../db';
import { logger } from '../utils/logger';
import { feedbackTracker, type UserFeedback } from '../feedback-tracker';

interface CliOptions {
    mediaId?: number;
    tags?: string;
    genre?: string;
    rating?: number;
    title?: string;
    summary?: string;
    confidence?: number;
    source?: string;
    help?: boolean;
}

function printUsage() {
    console.log(`
Atlas Tag Edit Tracking Tool

Usage: bun run src/cli/track-tag-edits.ts [options]

Options:
  --media <id>              Media ID to track corrections for
  --tags <tags>             Corrected tags (comma-separated)
  --genre <genre>           Corrected genre
  --rating <rating>         User rating (1.0-5.0)
  --title <title>           Corrected title
  --summary <summary>       Corrected summary
  --confidence <score>      Confidence in correction (0.0-1.0, default: 1.0)
  --source <source>         Source of correction (default: 'user')
  --help, -h                Show this help message

Examples:
  # Correct tags for media
  bun run src/cli/track-tag-edits.ts --media 123 --tags "Action, Sci-fi, Robot"

  # Correct genre
  bun run src/cli/track-tag-edits.ts --media 456 --genre "Science Fiction"

  # Add rating
  bun run src/cli/track-tag-edits.ts --media 789 --rating 4.5

  # Correct title with confidence score
  bun run src/cli/track-tag-edits.ts --media 123 --title "Blade Runner 2049" --confidence 0.9

  # Multiple corrections at once
  bun run src/cli/track-tag-edits.ts --media 123 --tags "Sci-fi, Drama" --genre "Science Fiction" --rating 4.2
`);
}

function parseCliArgs(): CliOptions {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            media: { type: 'string' },
            tags: { type: 'string' },
            genre: { type: 'string' },
            rating: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string' },
            confidence: { type: 'string' },
            source: { type: 'string' },
            help: { type: 'boolean', short: 'h', default: false }
        }
    });

    const options: CliOptions = {
        help: values.help,
        source: values.source || 'user'
    };

    if (values.media) {
        const mediaId = parseInt(values.media, 10);
        if (isNaN(mediaId)) {
            throw new Error(`Invalid media ID: ${values.media}`);
        }
        options.mediaId = mediaId;
    }

    if (values.tags) {
        options.tags = values.tags;
    }

    if (values.genre) {
        options.genre = values.genre;
    }

    if (values.rating) {
        const rating = parseFloat(values.rating);
        if (isNaN(rating) || rating < 1.0 || rating > 5.0) {
            throw new Error(`Invalid rating: ${values.rating}. Must be between 1.0 and 5.0`);
        }
        options.rating = rating;
    }

    if (values.title) {
        options.title = values.title;
    }

    if (values.summary) {
        options.summary = values.summary;
    }

    if (values.confidence) {
        const confidence = parseFloat(values.confidence);
        if (isNaN(confidence) || confidence < 0.0 || confidence > 1.0) {
            throw new Error(`Invalid confidence: ${values.confidence}. Must be between 0.0 and 1.0`);
        }
        options.confidence = confidence;
    }

    return options;
}

async function validateInputs(options: CliOptions): Promise<{ valid: boolean; error?: string }> {
    if (!options.mediaId) {
        return { valid: false, error: 'Media ID is required (--media)' };
    }

    if (!options.tags && !options.genre && !options.rating && !options.title && !options.summary) {
        return { valid: false, error: 'At least one correction must be specified (--tags, --genre, --rating, --title, or --summary)' };
    }

    // Check if media exists
    const db = getDatabase();
    const mediaRow = db.prepare('SELECT id FROM media_metadata WHERE id = ?').get(options.mediaId);
    if (!mediaRow) {
        return { valid: false, error: `Media with ID ${options.mediaId} not found` };
    }

    return { valid: true };
}

async function getCurrentValues(mediaId: number): Promise<{
    tags?: string[];
    genre?: string;
    title?: string;
    summary?: string;
}> {
    const db = getDatabase();
    
    // Get current metadata
    const metadataRow = db.prepare(`
        SELECT metadata_json FROM media_metadata WHERE id = ?
    `).get(mediaId) as { metadata_json: string } | undefined;

    // Get current tags
    const tagsRow = db.prepare(`
        SELECT tags_json FROM media_tags WHERE media_id = ?
    `).get(mediaId) as { tags_json: string } | undefined;

    const current: any = {};

    if (metadataRow) {
        try {
            const metadata = JSON.parse(metadataRow.metadata_json);
            current.genre = metadata.genre;
            current.title = metadata.title || metadata.filename;
            current.summary = metadata.summary;
        } catch (error) {
            // Invalid JSON, ignore
        }
    }

    if (tagsRow) {
        try {
            current.tags = JSON.parse(tagsRow.tags_json || '[]');
        } catch (error) {
            current.tags = [];
        }
    }

    return current;
}

async function recordCorrections(options: CliOptions): Promise<void> {
    const mediaId = options.mediaId!;
    const confidence = options.confidence || 1.0;
    const source = options.source || 'user';

    // Get current values for comparison
    const currentValues = await getCurrentValues(mediaId);

    const corrections: UserFeedback[] = [];

    // Track tag corrections
    if (options.tags) {
        const newTags = options.tags.split(',').map(tag => tag.trim());
        const originalTags = currentValues.tags || [];
        
        corrections.push({
            media_id: mediaId,
            feedback_type: 'tag_correction',
            original_value: JSON.stringify(originalTags),
            corrected_value: JSON.stringify(newTags),
            confidence_score: confidence,
            source
        });

        console.log(`📝 Recording tag correction:`);
        console.log(`   Original: ${originalTags.join(', ') || 'None'}`);
        console.log(`   Corrected: ${newTags.join(', ')}`);
    }

    // Track genre corrections
    if (options.genre) {
        const originalGenre = currentValues.genre || '';
        
        corrections.push({
            media_id: mediaId,
            feedback_type: 'metadata_edit',
            original_value: `genre:${originalGenre}`,
            corrected_value: `genre:${options.genre}`,
            confidence_score: confidence,
            source
        });

        console.log(`📝 Recording genre correction:`);
        console.log(`   Original: ${originalGenre || 'None'}`);
        console.log(`   Corrected: ${options.genre}`);
    }

    // Track title corrections
    if (options.title) {
        const originalTitle = currentValues.title || '';
        
        corrections.push({
            media_id: mediaId,
            feedback_type: 'metadata_edit',
            original_value: `title:${originalTitle}`,
            corrected_value: `title:${options.title}`,
            confidence_score: confidence,
            source
        });

        console.log(`📝 Recording title correction:`);
        console.log(`   Original: ${originalTitle || 'None'}`);
        console.log(`   Corrected: ${options.title}`);
    }

    // Track summary corrections
    if (options.summary) {
        const originalSummary = currentValues.summary || '';
        
        corrections.push({
            media_id: mediaId,
            feedback_type: 'metadata_edit',
            original_value: `summary:${originalSummary.substring(0, 100)}...`,
            corrected_value: `summary:${options.summary.substring(0, 100)}...`,
            confidence_score: confidence,
            source
        });

        console.log(`📝 Recording summary correction:`);
        console.log(`   Original: ${originalSummary.substring(0, 50) || 'None'}...`);
        console.log(`   Corrected: ${options.summary.substring(0, 50)}...`);
    }

    // Track rating
    if (options.rating) {
        corrections.push({
            media_id: mediaId,
            feedback_type: 'rating',
            original_value: 'no_rating',
            corrected_value: options.rating.toString(),
            confidence_score: confidence,
            source
        });

        console.log(`📝 Recording rating:`);
        console.log(`   Rating: ${options.rating}/5.0`);
    }

    // Record all corrections
    for (const correction of corrections) {
        await feedbackTracker.recordFeedback(correction);
    }

    console.log(`\n✅ Recorded ${corrections.length} correction(s) for media ${mediaId}`);
}

async function showFeedbackStats(): Promise<void> {
    console.log('\n📊 Recent Feedback Statistics:');
    console.log('=' .repeat(50));

    const stats = await feedbackTracker.getFeedbackStats(7); // Last 7 days

    console.log(`Total feedback entries: ${stats.total_feedback}`);
    
    if (stats.feedback_by_type.length > 0) {
        console.log('\nFeedback by type:');
        stats.feedback_by_type.forEach(type => {
            console.log(`  ${type.type}: ${type.count}`);
        });
    }

    if (stats.most_corrected_media.length > 0) {
        console.log('\nMost corrected media:');
        stats.most_corrected_media.slice(0, 5).forEach(media => {
            console.log(`  Media ${media.media_id}: ${media.correction_count} corrections`);
        });
    }

    if (stats.recent_patterns.length > 0) {
        console.log('\nRecent patterns detected:');
        stats.recent_patterns.forEach(pattern => {
            console.log(`  ${pattern.pattern_description} (${pattern.frequency}x)`);
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

        console.log('📝 Atlas Tag Edit Tracking Tool');
        console.log('===============================\n');

        // Initialize database
        await initDatabase();
        console.log('✅ Database initialized');

        // Validate inputs
        const validation = await validateInputs(options);
        if (!validation.valid) {
            console.error(`❌ ${validation.error}`);
            printUsage();
            process.exit(1);
        }

        console.log('✅ Validation passed\n');

        // Record corrections
        await recordCorrections(options);

        // Show feedback stats
        await showFeedbackStats();

        console.log('\n💡 Tip: Use the feedback loop analyzer to learn from these corrections:');
        console.log('   bun run src/cli/run-feedback-loop.ts');

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
