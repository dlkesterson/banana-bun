/**
 * Migration 009: Add Autonomous Learning Tables
 * 
 * Creates tables for autonomous learning and optimization:
 * - task_logs: Enhanced task execution metrics
 * - user_feedback: User corrections and feedback
 * - learning_rules: Generated rules from feedback patterns
 * - media_embeddings_metadata: Additional metadata for embeddings
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';

export async function migration009(db: Database): Promise<void> {
    await logger.info('Running migration 009: Add autonomous learning tables');

    try {
        // Create task_logs table (enhanced version)
        db.run(`
            CREATE TABLE IF NOT EXISTS task_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                task_type TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'error', 'cancelled')),
                duration_ms INTEGER,
                retries INTEGER DEFAULT 0,
                error_reason TEXT,
                memory_usage_mb REAL,
                cpu_usage_percent REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        // Create user_feedback table
        db.run(`
            CREATE TABLE IF NOT EXISTS user_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                feedback_type TEXT NOT NULL CHECK (feedback_type IN ('tag_correction', 'file_move', 'rating', 'metadata_edit')),
                original_value TEXT,
                corrected_value TEXT,
                confidence_score REAL DEFAULT 1.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                source TEXT DEFAULT 'user',
                session_id TEXT,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id) ON DELETE CASCADE
            )
        `);

        // Create learning_rules table
        db.run(`
            CREATE TABLE IF NOT EXISTS learning_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_type TEXT NOT NULL CHECK (rule_type IN ('tag_mapping', 'genre_correction', 'metadata_enhancement')),
                condition_text TEXT NOT NULL,
                action_text TEXT NOT NULL,
                confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
                created_from_feedback BOOLEAN DEFAULT TRUE,
                usage_count INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 0.0 CHECK (success_rate >= 0.0 AND success_rate <= 1.0),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used_at DATETIME,
                enabled BOOLEAN DEFAULT TRUE
            )
        `);

        // Create media_embeddings_metadata table for additional embedding info
        db.run(`
            CREATE TABLE IF NOT EXISTS media_embeddings_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                embedding_id TEXT NOT NULL,
                embedding_model TEXT NOT NULL,
                embedding_text_length INTEGER,
                embedding_quality_score REAL,
                similarity_cluster_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id) ON DELETE CASCADE,
                UNIQUE(media_id, embedding_id)
            )
        `);

        // Create feedback_patterns table for storing detected patterns
        db.run(`
            CREATE TABLE IF NOT EXISTS feedback_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern_type TEXT NOT NULL,
                pattern_description TEXT NOT NULL,
                frequency INTEGER NOT NULL DEFAULT 1,
                confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
                first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                rule_generated BOOLEAN DEFAULT FALSE,
                rule_id INTEGER,
                FOREIGN KEY (rule_id) REFERENCES learning_rules (id) ON DELETE SET NULL
            )
        `);

        // Create task_performance_metrics table for detailed performance tracking
        db.run(`
            CREATE TABLE IF NOT EXISTS task_performance_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_type TEXT NOT NULL,
                date DATE NOT NULL,
                total_tasks INTEGER DEFAULT 0,
                successful_tasks INTEGER DEFAULT 0,
                failed_tasks INTEGER DEFAULT 0,
                avg_duration_ms REAL DEFAULT 0.0,
                max_duration_ms INTEGER DEFAULT 0,
                min_duration_ms INTEGER DEFAULT 0,
                total_retries INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(task_type, date)
            )
        `);

        // Create indexes for better performance
        db.run('CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_task_logs_type_status ON task_logs(task_type, status)');
        db.run('CREATE INDEX IF NOT EXISTS idx_task_logs_created_at ON task_logs(created_at)');
        
        db.run('CREATE INDEX IF NOT EXISTS idx_user_feedback_media_id ON user_feedback(media_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON user_feedback(feedback_type)');
        db.run('CREATE INDEX IF NOT EXISTS idx_user_feedback_timestamp ON user_feedback(timestamp)');
        
        db.run('CREATE INDEX IF NOT EXISTS idx_learning_rules_type ON learning_rules(rule_type)');
        db.run('CREATE INDEX IF NOT EXISTS idx_learning_rules_enabled ON learning_rules(enabled)');
        db.run('CREATE INDEX IF NOT EXISTS idx_learning_rules_confidence ON learning_rules(confidence)');
        
        db.run('CREATE INDEX IF NOT EXISTS idx_embeddings_metadata_media_id ON media_embeddings_metadata(media_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_embeddings_metadata_cluster ON media_embeddings_metadata(similarity_cluster_id)');
        
        db.run('CREATE INDEX IF NOT EXISTS idx_feedback_patterns_type ON feedback_patterns(pattern_type)');
        db.run('CREATE INDEX IF NOT EXISTS idx_feedback_patterns_frequency ON feedback_patterns(frequency)');
        
        db.run('CREATE INDEX IF NOT EXISTS idx_performance_metrics_type_date ON task_performance_metrics(task_type, date)');

        // Create triggers for automatic metrics aggregation
        db.run(`
            CREATE TRIGGER IF NOT EXISTS update_performance_metrics_on_task_log
            AFTER INSERT ON task_logs
            BEGIN
                INSERT OR REPLACE INTO task_performance_metrics (
                    task_type, date, total_tasks, successful_tasks, failed_tasks,
                    avg_duration_ms, max_duration_ms, min_duration_ms, total_retries
                )
                SELECT 
                    NEW.task_type,
                    DATE(NEW.created_at),
                    COUNT(*),
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END),
                    AVG(COALESCE(duration_ms, 0)),
                    MAX(COALESCE(duration_ms, 0)),
                    MIN(COALESCE(duration_ms, 0)),
                    SUM(COALESCE(retries, 0))
                FROM task_logs 
                WHERE task_type = NEW.task_type 
                AND DATE(created_at) = DATE(NEW.created_at);
            END
        `);

        // Create trigger to update learning rule usage
        db.run(`
            CREATE TRIGGER IF NOT EXISTS update_rule_last_used
            AFTER UPDATE OF usage_count ON learning_rules
            BEGIN
                UPDATE learning_rules 
                SET last_used_at = CURRENT_TIMESTAMP 
                WHERE id = NEW.id;
            END
        `);

        // Create trigger to update feedback pattern timestamps
        db.run(`
            CREATE TRIGGER IF NOT EXISTS update_pattern_last_seen
            AFTER UPDATE OF frequency ON feedback_patterns
            BEGIN
                UPDATE feedback_patterns 
                SET last_seen = CURRENT_TIMESTAMP 
                WHERE id = NEW.id;
            END
        `);

        await logger.info('Migration 009 completed successfully');
    } catch (error) {
        await logger.error('Migration 009 failed', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

// Export the migration class for compatibility with the migration system
export class AutonomousLearningMigration {
    constructor(private db: Database) {}
    
    async up() {
        await migration009(this.db);
    }
}
