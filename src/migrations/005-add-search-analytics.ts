/**
 * Migration 005: Add Search Analytics Tables
 * 
 * Creates tables for storing MeiliSearch analytics and feedback:
 * - search_analytics: Store search queries, performance metrics, and results
 * - search_feedback: Store user feedback on search results
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';

export async function migration005(db: Database): Promise<void> {
    await logger.info('Running migration 005: Add search analytics tables');

    try {
        // Create search_analytics table
        db.run(`
            CREATE TABLE IF NOT EXISTS search_analytics (
                id TEXT PRIMARY KEY,
                query TEXT NOT NULL,
                filters TEXT,
                results_count INTEGER NOT NULL DEFAULT 0,
                processing_time_ms INTEGER NOT NULL DEFAULT 0,
                clicked_results TEXT, -- JSON array of clicked result IDs
                user_satisfaction INTEGER, -- 1-5 rating
                timestamp INTEGER NOT NULL,
                session_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create search_feedback table for additional feedback
        db.run(`
            CREATE TABLE IF NOT EXISTS search_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                search_id TEXT NOT NULL,
                feedback_notes TEXT,
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (search_id) REFERENCES search_analytics(id)
            )
        `);

        // Create indexes for better query performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_search_analytics_timestamp ON search_analytics(timestamp)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics(query)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_search_analytics_session ON search_analytics(session_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_search_analytics_results_count ON search_analytics(results_count)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_search_analytics_processing_time ON search_analytics(processing_time_ms)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_search_feedback_search_id ON search_feedback(search_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_search_feedback_timestamp ON search_feedback(timestamp)`);

        await logger.info('Migration 005 completed successfully');
    } catch (error) {
        await logger.error('Migration 005 failed', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}
