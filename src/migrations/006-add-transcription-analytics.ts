/**
 * Migration 006: Add Transcription Analytics Tables
 * 
 * Creates tables for storing Whisper transcription analytics and quality metrics:
 * - transcription_analytics: Store transcription performance, quality, and model usage
 * - transcription_quality_feedback: Store user feedback on transcription quality
 * - language_detection_analytics: Track language detection accuracy and patterns
 * - model_performance_metrics: Store model performance data for optimization
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';

export async function migration006(db: Database): Promise<void> {
    await logger.info('Running migration 006: Add transcription analytics tables');

    try {
        // Create transcription_analytics table
        db.run(`
            CREATE TABLE IF NOT EXISTS transcription_analytics (
                id TEXT PRIMARY KEY,
                media_id INTEGER,
                task_id INTEGER,
                file_path TEXT NOT NULL,
                file_size INTEGER,
                duration_seconds REAL,
                whisper_model TEXT NOT NULL,
                language_detected TEXT,
                language_specified TEXT,
                confidence_score REAL, -- Overall transcription confidence
                processing_time_ms INTEGER NOT NULL,
                transcript_length INTEGER,
                chunk_count INTEGER,
                word_count INTEGER,
                quality_score REAL, -- Calculated quality score (0-1)
                error_rate REAL, -- Estimated error rate
                timestamp INTEGER NOT NULL,
                session_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata(id),
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            )
        `);

        // Create transcription_quality_feedback table
        db.run(`
            CREATE TABLE IF NOT EXISTS transcription_quality_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transcription_id TEXT NOT NULL,
                user_rating INTEGER, -- 1-5 rating
                accuracy_rating INTEGER, -- 1-5 rating for accuracy
                completeness_rating INTEGER, -- 1-5 rating for completeness
                corrections_made TEXT, -- JSON array of corrections
                feedback_notes TEXT,
                improvement_suggestions TEXT,
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (transcription_id) REFERENCES transcription_analytics(id)
            )
        `);

        // Create language_detection_analytics table
        db.run(`
            CREATE TABLE IF NOT EXISTS language_detection_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transcription_id TEXT NOT NULL,
                detected_language TEXT NOT NULL,
                detection_confidence REAL,
                actual_language TEXT, -- User-confirmed actual language
                detection_correct BOOLEAN, -- Whether detection was correct
                file_characteristics TEXT, -- JSON of file characteristics that influenced detection
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (transcription_id) REFERENCES transcription_analytics(id)
            )
        `);

        // Create model_performance_metrics table
        db.run(`
            CREATE TABLE IF NOT EXISTS model_performance_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_name TEXT NOT NULL,
                content_type TEXT, -- 'music', 'speech', 'mixed', 'noisy', etc.
                language TEXT,
                avg_processing_time_ms REAL,
                avg_quality_score REAL,
                avg_accuracy_rating REAL,
                total_transcriptions INTEGER,
                successful_transcriptions INTEGER,
                error_count INTEGER,
                last_updated INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create batch_transcription_jobs table for tracking batch operations
        db.run(`
            CREATE TABLE IF NOT EXISTS batch_transcription_jobs (
                id TEXT PRIMARY KEY,
                job_name TEXT,
                total_files INTEGER,
                completed_files INTEGER,
                failed_files INTEGER,
                estimated_duration_ms INTEGER,
                actual_duration_ms INTEGER,
                optimization_strategy TEXT, -- JSON of optimization settings used
                status TEXT, -- 'pending', 'running', 'completed', 'failed'
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                completed_at DATETIME
            )
        `);

        // Create indexes for better query performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_transcription_analytics_timestamp ON transcription_analytics(timestamp)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transcription_analytics_model ON transcription_analytics(whisper_model)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transcription_analytics_language ON transcription_analytics(language_detected)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transcription_analytics_quality ON transcription_analytics(quality_score)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transcription_analytics_processing_time ON transcription_analytics(processing_time_ms)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transcription_analytics_media_id ON transcription_analytics(media_id)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_quality_feedback_transcription_id ON transcription_quality_feedback(transcription_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_quality_feedback_timestamp ON transcription_quality_feedback(timestamp)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_quality_feedback_rating ON transcription_quality_feedback(user_rating)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_language_detection_language ON language_detection_analytics(detected_language)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_language_detection_correct ON language_detection_analytics(detection_correct)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_language_detection_timestamp ON language_detection_analytics(timestamp)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_model_performance_model ON model_performance_metrics(model_name)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_model_performance_content_type ON model_performance_metrics(content_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_model_performance_language ON model_performance_metrics(language)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_model_performance_updated ON model_performance_metrics(last_updated)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_transcription_jobs(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_batch_jobs_created ON batch_transcription_jobs(created_at)`);

        await logger.info('Migration 006 completed successfully');
    } catch (error) {
        await logger.error('Migration 006 failed', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}
