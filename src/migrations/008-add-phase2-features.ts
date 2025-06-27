/**
 * Migration 008: Add Phase 2 Advanced AI Features Tables
 * 
 * Creates tables and columns for:
 * - Content summarization (add summary column to media_transcripts)
 * - Content recommendations (user_interactions table)
 * - Video scene detection (video_scenes, scene_objects tables)
 * - Audio analysis (audio_features table)
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';

export async function migration008(db: Database): Promise<void> {
    await logger.info('Running migration 008: Add Phase 2 Advanced AI Features');

    try {
      // 1. Add summary column to media_transcripts table
      try {
        db.run(`ALTER TABLE media_transcripts ADD COLUMN summary TEXT`);
        db.run(`ALTER TABLE media_transcripts ADD COLUMN summary_style TEXT`);
        db.run(`ALTER TABLE media_transcripts ADD COLUMN summary_model TEXT`);
        db.run(
          `ALTER TABLE media_transcripts ADD COLUMN summary_generated_at DATETIME`
        );
        await logger.info("Added summary columns to media_transcripts table");
      } catch (error) {
        // Columns might already exist, check if they do
        const tableInfo = db
          .prepare("PRAGMA table_info(media_transcripts)")
          .all() as Array<{ name: string }>;
        const hasColumns = tableInfo.some((col) =>
          [
            "summary",
            "summary_style",
            "summary_model",
            "summary_generated_at",
          ].includes(col.name)
        );
        if (!hasColumns) {
          throw error;
        }
        await logger.info(
          "Summary columns already exist in media_transcripts table"
        );
      }

      // 2. Create user_interactions table for recommendations
      db.run(`
            CREATE TABLE IF NOT EXISTS user_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                media_id INTEGER NOT NULL,
                action TEXT NOT NULL, -- 'play', 'like', 'share', 'search_click', etc.
                timestamp INTEGER NOT NULL,
                session_id TEXT,
                metadata TEXT, -- JSON for additional context
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id) ON DELETE CASCADE
            )
        `);

      // 3. Create video_scenes table
      db.run(`
            CREATE TABLE IF NOT EXISTS video_scenes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                thumbnail_path TEXT,
                scene_index INTEGER NOT NULL,
                confidence_score REAL,
                detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id) ON DELETE CASCADE
            )
        `);

      // 4. Create scene_objects table
      db.run(`
            CREATE TABLE IF NOT EXISTS scene_objects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scene_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                confidence REAL NOT NULL,
                bounding_box TEXT, -- JSON: {x, y, width, height}
                detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (scene_id) REFERENCES video_scenes (id) ON DELETE CASCADE
            )
        `);

      // 5. Create audio_features table
      db.run(`
            CREATE TABLE IF NOT EXISTS audio_features (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                is_music BOOLEAN,
                genre TEXT,
                bpm REAL,
                key_signature TEXT,
                mood TEXT,
                energy_level REAL,
                danceability REAL,
                valence REAL, -- Musical positivity
                loudness REAL,
                speechiness REAL,
                instrumentalness REAL,
                liveness REAL,
                acousticness REAL,
                language TEXT, -- For speech content
                features_json TEXT, -- Full feature set as JSON
                analysis_model TEXT,
                analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id) ON DELETE CASCADE,
                UNIQUE(media_id) -- One analysis per media file
            )
        `);

      // 6. Create recommendations cache table (Phase 2 version)
      // Note: content_recommendations table may already exist from migration 007 with different schema
      // We'll create a new table for Phase 2 recommendations to avoid conflicts
      db.run(`
            CREATE TABLE IF NOT EXISTS phase2_content_recommendations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_media_id INTEGER,
                source_user_id TEXT,
                recommended_media_id INTEGER NOT NULL,
                recommendation_type TEXT NOT NULL, -- 'similar', 'user_based', 'hybrid'
                score REAL NOT NULL,
                reason TEXT, -- Human-readable explanation
                algorithm_version TEXT,
                generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                FOREIGN KEY (source_media_id) REFERENCES media_metadata (id) ON DELETE CASCADE,
                FOREIGN KEY (recommended_media_id) REFERENCES media_metadata (id) ON DELETE CASCADE
            )
        `);

      // Create indexes for performance
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_user_interactions_user_id ON user_interactions(user_id)"
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_user_interactions_media_id ON user_interactions(media_id)"
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_user_interactions_timestamp ON user_interactions(timestamp)"
      );

      db.run(
        "CREATE INDEX IF NOT EXISTS idx_video_scenes_media_id ON video_scenes(media_id)"
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_video_scenes_start_ms ON video_scenes(start_ms)"
      );

      db.run(
        "CREATE INDEX IF NOT EXISTS idx_scene_objects_scene_id ON scene_objects(scene_id)"
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_scene_objects_label ON scene_objects(label)"
      );

      db.run(
        "CREATE INDEX IF NOT EXISTS idx_audio_features_media_id ON audio_features(media_id)"
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_audio_features_genre ON audio_features(genre)"
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_audio_features_is_music ON audio_features(is_music)"
      );

      db.run(
        "CREATE INDEX IF NOT EXISTS idx_phase2_content_recommendations_source_media ON phase2_content_recommendations(source_media_id)"
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_phase2_content_recommendations_source_user ON phase2_content_recommendations(source_user_id)"
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_phase2_content_recommendations_recommended ON phase2_content_recommendations(recommended_media_id)"
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_phase2_content_recommendations_type ON phase2_content_recommendations(recommendation_type)"
      );

      await logger.info("Migration 008 completed successfully");
    } catch (error) {
        await logger.error('Migration 008 failed', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}
