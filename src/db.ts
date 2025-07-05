import { Database } from 'bun:sqlite';
import { config } from './config';
import { logger } from './utils/logger';
import { DependencyHelper } from './migrations/001-normalize-dependencies';

let db: Database;
let dependencyHelper: DependencyHelper;

function initDatabase(): void {
    try {
        db = new Database(config.paths.database);

        // Create tasks table
        db.run(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT,
                file_hash TEXT,
                parent_id INTEGER,
                description TEXT,
                type TEXT,
                status TEXT,
                dependencies TEXT,
                result_summary TEXT,
                shell_command TEXT,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                finished_at DATETIME
            )
        `);

        // Create media table
        db.run(`
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT UNIQUE,
                title TEXT,
                channel TEXT,
                file_path TEXT,
                downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create review_results table for Phase 3 enhancements
        db.run(`
            CREATE TABLE IF NOT EXISTS review_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                reviewer_type TEXT DEFAULT 'automated', -- 'llm', 'human', 'automated'
                model_used TEXT,
                passed BOOLEAN NOT NULL,
                score INTEGER, -- 0-100 score
                feedback TEXT,
                suggestions TEXT, -- JSON array of suggestions
                review_criteria TEXT, -- Original requirements/criteria
                reviewed_output TEXT, -- What was reviewed
                criteria_json TEXT, -- JSON of criteria used
                passed_criteria_json TEXT, -- JSON of passed criteria
                failed_criteria_json TEXT, -- JSON of failed criteria
                recommendations_json TEXT, -- JSON of recommendations
                quality_metrics_json TEXT, -- JSON of quality metrics
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        // Create planner_results table for storing GPT-generated plans
        db.run(`
            CREATE TABLE IF NOT EXISTS planner_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id TEXT,
                goal TEXT NOT NULL,
                context TEXT,
                tasks_json TEXT NOT NULL,
                model_used TEXT NOT NULL,
                estimated_duration INTEGER DEFAULT 0,
                task_id INTEGER,
                goal_description TEXT,
                generated_plan TEXT,
                similar_tasks_used TEXT,
                context_embeddings TEXT,
                subtask_count INTEGER DEFAULT 0,
                plan_version INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        // Create media_metadata table for Phase 4 media ingestion
        db.run(`
            CREATE TABLE IF NOT EXISTS media_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                file_hash TEXT NOT NULL UNIQUE,
                metadata_json TEXT NOT NULL,  -- Full MediaMetadata as JSON
                extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                tool_used TEXT NOT NULL,      -- 'ffprobe' or 'mediainfo'
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        // Create media_transcripts table for Whisper transcription results
        db.run(`
            CREATE TABLE IF NOT EXISTS media_transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                task_id INTEGER NOT NULL,
                transcript_text TEXT NOT NULL,
                language TEXT,
                chunks_json TEXT,             -- JSON array of transcript chunks with timestamps
                whisper_model TEXT NOT NULL,
                transcribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id) ON DELETE CASCADE,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        // Create media_tags table for AI-generated tags
        db.run(`
            CREATE TABLE IF NOT EXISTS media_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                task_id INTEGER NOT NULL,
                tags_json TEXT NOT NULL,      -- JSON array of tags
                explanations_json TEXT,       -- JSON object mapping tags to explanations
                llm_model TEXT NOT NULL,
                confidence_score REAL,
                tagged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id) ON DELETE CASCADE,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        // Create media_index_status table for tracking indexing status
        db.run(`
            CREATE TABLE IF NOT EXISTS media_index_status (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                meili_indexed BOOLEAN DEFAULT FALSE,
                meili_document_id TEXT,
                meili_indexed_at DATETIME,
                chroma_indexed BOOLEAN DEFAULT FALSE,
                chroma_embedding_id TEXT,
                chroma_indexed_at DATETIME,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id) ON DELETE CASCADE,
                UNIQUE(media_id)
            )
        `);

        // Create task_logs table for autonomous learning metrics
        db.run(`
            CREATE TABLE IF NOT EXISTS task_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                task_type TEXT NOT NULL,
                status TEXT NOT NULL,
                duration_ms INTEGER,
                retries INTEGER DEFAULT 0,
                error_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        // Create user_feedback table for tracking corrections
        db.run(`
            CREATE TABLE IF NOT EXISTS user_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                feedback_type TEXT NOT NULL, -- 'tag_correction', 'file_move', 'rating'
                original_value TEXT,
                corrected_value TEXT,
                confidence_score REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                source TEXT DEFAULT 'user',
                FOREIGN KEY (media_id) REFERENCES media_metadata (id) ON DELETE CASCADE
            )
        `);

        // Create search_behavior table for cross-modal intelligence
        db.run(`
            CREATE TABLE IF NOT EXISTS search_behavior (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                query TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                clicked_media_ids TEXT, -- JSON array of media IDs
                result_count INTEGER DEFAULT 0,
                satisfaction_score REAL DEFAULT 0,
                user_interactions TEXT, -- JSON array of interactions
                search_duration_ms INTEGER DEFAULT 0
            )
        `);

        // Create view_sessions table for content engagement
        db.run(`
            CREATE TABLE IF NOT EXISTS view_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                media_id INTEGER NOT NULL,
                user_id TEXT,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                duration_ms INTEGER DEFAULT 0,
                completion_percentage REAL DEFAULT 0,
                interaction_events TEXT, -- JSON array
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id)
            )
        `);

        // Create engagement_analytics table
        db.run(`
            CREATE TABLE IF NOT EXISTS engagement_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                date DATE NOT NULL,
                views_count INTEGER DEFAULT 0,
                unique_viewers INTEGER DEFAULT 0,
                total_watch_time_ms INTEGER DEFAULT 0,
                avg_completion_rate REAL DEFAULT 0,
                search_discoveries INTEGER DEFAULT 0,
                tag_corrections INTEGER DEFAULT 0,
                user_ratings_sum REAL DEFAULT 0,
                user_ratings_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id),
                UNIQUE(media_id, date)
            )
        `);

        // Create content_engagement table
        db.run(`
            CREATE TABLE IF NOT EXISTS content_engagement (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                view_count INTEGER DEFAULT 0,
                avg_view_duration_ms INTEGER DEFAULT 0,
                completion_rate REAL DEFAULT 0,
                user_rating REAL DEFAULT 0,
                last_viewed DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id),
                UNIQUE(media_id)
            )
        `);

        // Create content_trends table
        db.run(`
            CREATE TABLE IF NOT EXISTS content_trends (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                trend_type TEXT NOT NULL,
                trend_score REAL NOT NULL,
                period_days INTEGER NOT NULL,
                growth_rate REAL NOT NULL,
                factors TEXT, -- JSON array
                detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id)
            )
        `);

        // Add missing columns if they don't exist (for backward compatibility)
        try {
            db.run('ALTER TABLE tasks ADD COLUMN filename TEXT');
        } catch (error) {
            // Column already exists, ignore
        }

        try {
            db.run('ALTER TABLE tasks ADD COLUMN file_hash TEXT');
        } catch (error) {
            // Column already exists, ignore
        }

        try {
            db.run('ALTER TABLE tasks ADD COLUMN args TEXT');
        } catch (error) {
            // Column already exists, ignore
        }

        // Add summary columns to media_transcripts table
        try {
            db.run('ALTER TABLE media_transcripts ADD COLUMN summary TEXT');
        } catch (error) {
            // Column already exists, ignore
        }

        try {
            db.run('ALTER TABLE media_transcripts ADD COLUMN summary_style TEXT');
        } catch (error) {
            // Column already exists, ignore
        }

        try {
            db.run('ALTER TABLE media_transcripts ADD COLUMN summary_model TEXT');
        } catch (error) {
            // Column already exists, ignore
        }

        try {
            db.run('ALTER TABLE media_transcripts ADD COLUMN summary_tokens_used INTEGER');
        } catch (error) {
            // Column already exists, ignore
        }

        try {
            db.run('ALTER TABLE media_transcripts ADD COLUMN summary_processing_time_ms INTEGER');
        } catch (error) {
            // Column already exists, ignore
        }

        // Create task_schedules table for scheduler
        db.run(`
            CREATE TABLE IF NOT EXISTS task_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_task_id INTEGER,
                cron_expression TEXT,
                timezone TEXT DEFAULT 'UTC',
                enabled BOOLEAN DEFAULT TRUE,
                max_instances INTEGER DEFAULT 1,
                overlap_policy TEXT DEFAULT 'skip',
                next_run_at DATETIME,
                last_run_at DATETIME,
                execution_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (template_task_id) REFERENCES tasks(id)
            )
        `);

        // Create task_instances table for scheduler
        db.run(`
            CREATE TABLE IF NOT EXISTS task_instances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_id INTEGER,
                instance_task_id INTEGER,
                status TEXT DEFAULT 'pending',
                started_at DATETIME,
                finished_at DATETIME,
                result_summary TEXT,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (schedule_id) REFERENCES task_schedules(id),
                FOREIGN KEY (instance_task_id) REFERENCES tasks(id)
            )
        `);

        // Create learning_rules table for enhanced learning service
        db.run(`
            CREATE TABLE IF NOT EXISTS learning_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern_type TEXT NOT NULL,
                pattern_value TEXT NOT NULL,
                rule_type TEXT NOT NULL,
                rule_action TEXT NOT NULL,
                confidence REAL NOT NULL,
                frequency INTEGER DEFAULT 1,
                success_rate REAL DEFAULT 0.0,
                last_applied DATETIME,
                enabled BOOLEAN DEFAULT TRUE,
                pattern_strength REAL DEFAULT 0.0,
                effectiveness_score REAL DEFAULT 0.0,
                strategy_type TEXT,
                cross_modal_score REAL,
                search_correlation REAL,
                temporal_consistency REAL,
                user_validation_score REAL,
                similar_rules TEXT, -- JSON array of rule IDs
                embedding_id TEXT,
                auto_apply_threshold REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for performance
        try {
            db.run('CREATE INDEX IF NOT EXISTS idx_search_behavior_session ON search_behavior(session_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_search_behavior_timestamp ON search_behavior(timestamp)');
            db.run('CREATE INDEX IF NOT EXISTS idx_view_sessions_media ON view_sessions(media_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_view_sessions_start_time ON view_sessions(start_time)');
            db.run('CREATE INDEX IF NOT EXISTS idx_engagement_analytics_media_date ON engagement_analytics(media_id, date)');
            db.run('CREATE INDEX IF NOT EXISTS idx_content_engagement_media ON content_engagement(media_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_content_trends_media ON content_trends(media_id)');
            db.run('CREATE INDEX IF NOT EXISTS idx_task_schedules_next_run ON task_schedules(next_run_at)');
            db.run('CREATE INDEX IF NOT EXISTS idx_task_instances_schedule ON task_instances(schedule_id)');
        } catch (error) {
            // Indexes might already exist, ignore
        }

        try {
            db.run('ALTER TABLE tasks ADD COLUMN generator TEXT');
        } catch (error) {
            // Column already exists, ignore
        }

        try {
            db.run('ALTER TABLE tasks ADD COLUMN tool TEXT');
        } catch (error) {
            // Column already exists, ignore
        }

        try {
            db.run('ALTER TABLE tasks ADD COLUMN validation_errors TEXT');
        } catch (error) {
            // Column already exists, ignore
        }

        // Create task_dependencies table for normalized dependencies
        db.run(`
            CREATE TABLE IF NOT EXISTS task_dependencies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                depends_on_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
                UNIQUE(task_id, depends_on_id)
            )
        `);

        // Create indexes
        db.run('CREATE INDEX IF NOT EXISTS idx_status ON tasks(status)');
        db.run('CREATE INDEX IF NOT EXISTS idx_parent ON tasks(parent_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_id)');
        try {
            db.run('CREATE INDEX IF NOT EXISTS idx_file_hash ON tasks(file_hash)');
        } catch (error) {
            // Index creation failed, ignore
        }

        // Create indexes for Phase 3 tables
        db.run('CREATE INDEX IF NOT EXISTS idx_review_results_task_id ON review_results(task_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_review_results_score ON review_results(score)');
        db.run('CREATE INDEX IF NOT EXISTS idx_review_results_passed ON review_results(passed)');
        db.run('CREATE INDEX IF NOT EXISTS idx_planner_results_task_id ON planner_results(task_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_planner_results_model ON planner_results(model_used)');

        // Create indexes for Phase 4 media_metadata table
        db.run('CREATE INDEX IF NOT EXISTS idx_media_metadata_task_id ON media_metadata(task_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_media_metadata_file_hash ON media_metadata(file_hash)');
        db.run('CREATE INDEX IF NOT EXISTS idx_media_metadata_file_path ON media_metadata(file_path)');
        db.run('CREATE INDEX IF NOT EXISTS idx_media_metadata_extracted_at ON media_metadata(extracted_at)');

        // Create indexes for new media intelligence tables
        db.run('CREATE INDEX IF NOT EXISTS idx_media_transcripts_media_id ON media_transcripts(media_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_media_transcripts_task_id ON media_transcripts(task_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_media_transcripts_language ON media_transcripts(language)');

        db.run('CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON media_tags(media_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_media_tags_task_id ON media_tags(task_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_media_tags_confidence ON media_tags(confidence_score)');

        db.run('CREATE INDEX IF NOT EXISTS idx_media_index_status_media_id ON media_index_status(media_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_media_index_status_meili ON media_index_status(meili_indexed)');
        db.run('CREATE INDEX IF NOT EXISTS idx_media_index_status_chroma ON media_index_status(chroma_indexed)');

        // Initialize dependency helper
        dependencyHelper = new DependencyHelper(db);

        logger.info('Database initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize database', { error });
        throw error;
    }
}

export function getDatabase() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}

export function getDependencyHelper() {
    if (!dependencyHelper) {
        throw new Error('Database not initialized');
    }
    return dependencyHelper;
}

// Export initDatabase using explicit export statement
export { initDatabase };
