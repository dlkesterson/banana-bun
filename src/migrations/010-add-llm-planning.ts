import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';

/**
 * Migration 010: Add LLM-Based Planning System
 * 
 * This migration adds the database schema for the LLM-based planning system
 * as described in PRD-LLM-BASED-PLANNING.md
 * 
 * Features added:
 * - Plan templates storage and management
 * - System metrics collection
 * - Optimization recommendations
 * - Enhanced planner results with LLM metadata
 */

export async function migration010(db: Database): Promise<void> {
    await logger.info('Running migration 010: Add LLM-Based Planning System');

    try {
        // Create plan_templates table
        db.run(`
            CREATE TABLE IF NOT EXISTS plan_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                template_data TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                success_rate REAL DEFAULT 0.0,
                usage_count INTEGER DEFAULT 0,
                embedding_id TEXT,  -- Reference to ChromaDB embedding
                search_index_id TEXT  -- Reference to MeiliSearch document
            )
        `);

        // Create system_metrics table
        db.run(`
            CREATE TABLE IF NOT EXISTS system_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_type TEXT NOT NULL,
                metric_value REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                context TEXT,
                search_index_id TEXT  -- Reference to MeiliSearch document
            )
        `);

        // Create optimization_recommendations table
        db.run(`
            CREATE TABLE IF NOT EXISTS optimization_recommendations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recommendation_type TEXT NOT NULL,
                description TEXT NOT NULL,
                impact_score REAL NOT NULL,
                implementation_difficulty TEXT NOT NULL CHECK (implementation_difficulty IN ('low', 'medium', 'high')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                implemented BOOLEAN DEFAULT FALSE,
                implemented_at DATETIME,
                llm_model_used TEXT,  -- Which LLM generated this recommendation
                embedding_id TEXT,  -- Reference to ChromaDB embedding
                search_index_id TEXT  -- Reference to MeiliSearch document
            )
        `);

        // Create log_analysis_patterns table
        db.run(`
            CREATE TABLE IF NOT EXISTS log_analysis_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern_type TEXT NOT NULL,
                pattern_description TEXT NOT NULL,
                frequency INTEGER NOT NULL DEFAULT 1,
                severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
                first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolved BOOLEAN DEFAULT FALSE,
                resolved_at DATETIME,
                embedding_id TEXT,  -- Reference to ChromaDB embedding
                search_index_id TEXT  -- Reference to MeiliSearch document
            )
        `);

        // Create resource_usage_predictions table
        db.run(`
            CREATE TABLE IF NOT EXISTS resource_usage_predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                resource_type TEXT NOT NULL,
                predicted_usage REAL NOT NULL,
                prediction_window_hours INTEGER NOT NULL,
                confidence_score REAL NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                actual_usage REAL,
                accuracy_score REAL,
                llm_model_used TEXT,
                embedding_id TEXT  -- Reference to ChromaDB embedding
            )
        `);

        // Ensure planner_results table exists before adding columns
        db.run(`
            CREATE TABLE IF NOT EXISTS planner_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id TEXT,
                goal TEXT NOT NULL,
                context TEXT,
                tasks_json TEXT NOT NULL,
                model_used TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                task_id INTEGER,
                FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
            )
        `);

        // Add new columns to existing planner_results table
        try {
            db.run(`ALTER TABLE planner_results ADD COLUMN optimization_score REAL DEFAULT 0.0`);
        } catch (error) {
            // Column might already exist, ignore error
        }

        try {
            db.run(`ALTER TABLE planner_results ADD COLUMN resource_efficiency REAL DEFAULT 0.0`);
        } catch (error) {
            // Column might already exist, ignore error
        }

        try {
            db.run(`ALTER TABLE planner_results ADD COLUMN template_id INTEGER`);
        } catch (error) {
            // Column might already exist, ignore error
        }

        try {
            db.run(`ALTER TABLE planner_results ADD COLUMN llm_model_used TEXT`);
        } catch (error) {
            // Column might already exist, ignore error
        }

        try {
            db.run(`ALTER TABLE planner_results ADD COLUMN embedding_id TEXT`);
        } catch (error) {
            // Column might already exist, ignore error
        }

        // Create indices for better performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_plan_templates_name ON plan_templates(name)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_plan_templates_success_rate ON plan_templates(success_rate)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_system_metrics_type_timestamp ON system_metrics(metric_type, timestamp)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_optimization_recommendations_type ON optimization_recommendations(recommendation_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_optimization_recommendations_impact ON optimization_recommendations(impact_score)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_log_patterns_type ON log_analysis_patterns(pattern_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_log_patterns_severity ON log_analysis_patterns(severity)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_resource_predictions_type ON resource_usage_predictions(resource_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_planner_results_template ON planner_results(template_id)`);

        await logger.info('✅ Migration 010 completed: LLM-Based Planning System tables created');

    } catch (error) {
        await logger.error('❌ Migration 010 failed', { error });
        throw error;
    }
}

export class Migration010AddLlmPlanning {
    constructor(private db: Database) {}

    async up(): Promise<void> {
        await migration010(this.db);
    }

    async down(): Promise<void> {
        await logger.info('Rolling back migration 010: Add LLM-Based Planning System');
        
        try {
            // Drop indices
            this.db.run(`DROP INDEX IF EXISTS idx_planner_results_template`);
            this.db.run(`DROP INDEX IF EXISTS idx_resource_predictions_type`);
            this.db.run(`DROP INDEX IF EXISTS idx_log_patterns_severity`);
            this.db.run(`DROP INDEX IF EXISTS idx_log_patterns_type`);
            this.db.run(`DROP INDEX IF EXISTS idx_optimization_recommendations_impact`);
            this.db.run(`DROP INDEX IF EXISTS idx_optimization_recommendations_type`);
            this.db.run(`DROP INDEX IF EXISTS idx_system_metrics_type_timestamp`);
            this.db.run(`DROP INDEX IF EXISTS idx_plan_templates_success_rate`);
            this.db.run(`DROP INDEX IF EXISTS idx_plan_templates_name`);

            // Drop new tables
            this.db.run(`DROP TABLE IF EXISTS resource_usage_predictions`);
            this.db.run(`DROP TABLE IF EXISTS log_analysis_patterns`);
            this.db.run(`DROP TABLE IF EXISTS optimization_recommendations`);
            this.db.run(`DROP TABLE IF EXISTS system_metrics`);
            this.db.run(`DROP TABLE IF EXISTS plan_templates`);

            // Note: We cannot easily remove columns from SQLite, so we leave the planner_results columns
            await logger.info('✅ Migration 010 rolled back successfully');
        } catch (error) {
            await logger.error('❌ Migration 010 rollback failed', { error });
            throw error;
        }
    }

    async verify(): Promise<boolean> {
        try {
            // Check if all tables exist
            const tables = ['plan_templates', 'system_metrics', 'optimization_recommendations', 
                          'log_analysis_patterns', 'resource_usage_predictions'];
            
            for (const table of tables) {
                const result = this.db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
                if (!result) {
                    await logger.error(`❌ Migration 010 verification failed: table ${table} not found`);
                    return false;
                }
            }

            await logger.info('✅ Migration 010 verification passed');
            return true;
        } catch (error) {
            await logger.error('❌ Migration 010 verification failed', { error });
            return false;
        }
    }
}
