import { Database } from 'bun:sqlite';
import { config } from './config';
import { logger } from './utils/logger';
import { DependencyHelper } from './migrations/001-normalize-dependencies';

let db: Database;
let dependencyHelper: DependencyHelper;

export async function initDatabase() {
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
