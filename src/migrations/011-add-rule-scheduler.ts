/**
 * Migration 011: Add Rule Scheduler System Tables
 * 
 * Creates tables for the intelligent rule scheduler system:
 * - activity_patterns: Store detected temporal patterns
 * - scheduling_rules: Store auto-generated and manual scheduling rules
 * - rule_actions: Store actions associated with rules
 * - predictive_schedules: Store predictive scheduling data
 * - optimization_results: Store optimization history and results
 * - user_behavior_profiles: Store user behavior analysis data
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';

export class RuleSchedulerMigration {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    async up(): Promise<void> {
        logger.info('Running Rule Scheduler migration (011)...');

        try {
            // Create activity_patterns table
            await this.createActivityPatternsTable();
            
            // Create scheduling_rules table
            await this.createSchedulingRulesTable();
            
            // Create rule_actions table
            await this.createRuleActionsTable();
            
            // Create predictive_schedules table
            await this.createPredictiveSchedulesTable();
            
            // Create optimization_results table
            await this.createOptimizationResultsTable();
            
            // Create user_behavior_profiles table
            await this.createUserBehaviorProfilesTable();
            
            // Add rule scheduler columns to existing task_schedules table
            await this.addRuleSchedulerColumnsToTaskSchedules();
            
            // Create indexes for performance
            await this.createIndexes();

            logger.info('Rule Scheduler migration completed successfully');
        } catch (error) {
            logger.error('Rule Scheduler migration failed', { error });
            throw error;
        }
    }

    async down(): Promise<void> {
        logger.info('Rolling back Rule Scheduler migration (011)...');

        try {
            // Drop tables in reverse order
            this.db.run('DROP TABLE IF EXISTS user_behavior_profiles');
            this.db.run('DROP TABLE IF EXISTS optimization_results');
            this.db.run('DROP TABLE IF EXISTS predictive_schedules');
            this.db.run('DROP TABLE IF EXISTS rule_actions');
            this.db.run('DROP TABLE IF EXISTS scheduling_rules');
            this.db.run('DROP TABLE IF EXISTS activity_patterns');

            // Remove added columns from task_schedules (SQLite doesn't support DROP COLUMN easily)
            // We'll leave them for data integrity

            logger.info('Rule Scheduler migration rollback completed');
        } catch (error) {
            logger.error('Rule Scheduler migration rollback failed', { error });
            throw error;
        }
    }

    private async createActivityPatternsTable(): Promise<void> {
        logger.info('Creating activity_patterns table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS activity_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern_type TEXT NOT NULL,
                pattern_data TEXT NOT NULL, -- JSON string
                confidence_score REAL NOT NULL,
                detection_count INTEGER DEFAULT 1,
                first_detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                embedding_id TEXT, -- Reference to ChromaDB embedding
                search_index_id TEXT, -- Reference to MeiliSearch document
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        logger.info('activity_patterns table created');
    }

    private async createSchedulingRulesTable(): Promise<void> {
        logger.info('Creating scheduling_rules table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS scheduling_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern_id INTEGER,
                rule_name TEXT NOT NULL,
                description TEXT,
                cron_expression TEXT NOT NULL,
                priority INTEGER DEFAULT 100,
                is_enabled BOOLEAN DEFAULT TRUE,
                is_auto_generated BOOLEAN DEFAULT TRUE,
                confidence_score REAL NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_triggered_at DATETIME,
                trigger_count INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 0.0,
                llm_model_used TEXT, -- Which LLM generated this rule
                embedding_id TEXT, -- Reference to ChromaDB embedding
                search_index_id TEXT, -- Reference to MeiliSearch document
                FOREIGN KEY (pattern_id) REFERENCES activity_patterns(id) ON DELETE SET NULL
            )
        `);

        logger.info('scheduling_rules table created');
    }

    private async createRuleActionsTable(): Promise<void> {
        logger.info('Creating rule_actions table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS rule_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                action_type TEXT NOT NULL,
                action_data TEXT NOT NULL, -- JSON string
                order_index INTEGER DEFAULT 0,
                is_enabled BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES scheduling_rules(id) ON DELETE CASCADE
            )
        `);

        logger.info('rule_actions table created');
    }

    private async createPredictiveSchedulesTable(): Promise<void> {
        logger.info('Creating predictive_schedules table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS predictive_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                predicted_task_type TEXT NOT NULL,
                predicted_execution_time DATETIME NOT NULL,
                confidence_score REAL NOT NULL,
                resource_requirements TEXT, -- JSON string
                is_scheduled BOOLEAN DEFAULT FALSE,
                actual_execution_time DATETIME,
                prediction_accuracy REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES scheduling_rules(id) ON DELETE CASCADE
            )
        `);

        logger.info('predictive_schedules table created');
    }

    private async createOptimizationResultsTable(): Promise<void> {
        logger.info('Creating optimization_results table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS optimization_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                optimization_type TEXT NOT NULL,
                original_schedule TEXT NOT NULL, -- JSON string
                optimized_schedule TEXT NOT NULL, -- JSON string
                improvement_metrics TEXT NOT NULL, -- JSON string
                applied_at DATETIME,
                success BOOLEAN DEFAULT FALSE,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        logger.info('optimization_results table created');
    }

    private async createUserBehaviorProfilesTable(): Promise<void> {
        logger.info('Creating user_behavior_profiles table...');

        this.db.run(`
            CREATE TABLE IF NOT EXISTS user_behavior_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT DEFAULT 'default', -- For multi-user systems
                activity_patterns TEXT NOT NULL, -- JSON string
                peak_hours TEXT NOT NULL, -- JSON array of hours
                preferred_task_types TEXT NOT NULL, -- JSON array
                interaction_frequency REAL DEFAULT 0.0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id)
            )
        `);

        logger.info('user_behavior_profiles table created');
    }

    private async addRuleSchedulerColumnsToTaskSchedules(): Promise<void> {
        logger.info('Adding rule scheduler columns to task_schedules table...');

        const columns = [
            'rule_id INTEGER',
            'is_predictive BOOLEAN DEFAULT FALSE',
            'prediction_confidence REAL',
            'llm_model_used TEXT'
        ];

        for (const column of columns) {
            try {
                this.db.run(`ALTER TABLE task_schedules ADD COLUMN ${column}`);
            } catch (error) {
                // Column might already exist, log and continue
                logger.debug(`Column might already exist: ${column}`, { error });
            }
        }

        // Add foreign key constraint (if not exists)
        try {
            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_task_schedules_rule_id 
                ON task_schedules(rule_id)
            `);
        } catch (error) {
            logger.debug('Index might already exist', { error });
        }

        logger.info('Rule scheduler columns added to task_schedules table');
    }

    private async createIndexes(): Promise<void> {
        logger.info('Creating indexes for rule scheduler tables...');

        const indexes = [
            // Activity patterns indexes
            'CREATE INDEX IF NOT EXISTS idx_activity_patterns_type ON activity_patterns(pattern_type)',
            'CREATE INDEX IF NOT EXISTS idx_activity_patterns_confidence ON activity_patterns(confidence_score)',
            'CREATE INDEX IF NOT EXISTS idx_activity_patterns_active ON activity_patterns(is_active)',
            'CREATE INDEX IF NOT EXISTS idx_activity_patterns_detected ON activity_patterns(last_detected_at)',

            // Scheduling rules indexes
            'CREATE INDEX IF NOT EXISTS idx_scheduling_rules_pattern ON scheduling_rules(pattern_id)',
            'CREATE INDEX IF NOT EXISTS idx_scheduling_rules_enabled ON scheduling_rules(is_enabled)',
            'CREATE INDEX IF NOT EXISTS idx_scheduling_rules_priority ON scheduling_rules(priority)',
            'CREATE INDEX IF NOT EXISTS idx_scheduling_rules_confidence ON scheduling_rules(confidence_score)',
            'CREATE INDEX IF NOT EXISTS idx_scheduling_rules_triggered ON scheduling_rules(last_triggered_at)',

            // Rule actions indexes
            'CREATE INDEX IF NOT EXISTS idx_rule_actions_rule ON rule_actions(rule_id)',
            'CREATE INDEX IF NOT EXISTS idx_rule_actions_type ON rule_actions(action_type)',
            'CREATE INDEX IF NOT EXISTS idx_rule_actions_enabled ON rule_actions(is_enabled)',

            // Predictive schedules indexes
            'CREATE INDEX IF NOT EXISTS idx_predictive_schedules_rule ON predictive_schedules(rule_id)',
            'CREATE INDEX IF NOT EXISTS idx_predictive_schedules_execution ON predictive_schedules(predicted_execution_time)',
            'CREATE INDEX IF NOT EXISTS idx_predictive_schedules_confidence ON predictive_schedules(confidence_score)',
            'CREATE INDEX IF NOT EXISTS idx_predictive_schedules_scheduled ON predictive_schedules(is_scheduled)',

            // Optimization results indexes
            'CREATE INDEX IF NOT EXISTS idx_optimization_results_type ON optimization_results(optimization_type)',
            'CREATE INDEX IF NOT EXISTS idx_optimization_results_applied ON optimization_results(applied_at)',
            'CREATE INDEX IF NOT EXISTS idx_optimization_results_success ON optimization_results(success)',

            // User behavior profiles indexes
            'CREATE INDEX IF NOT EXISTS idx_user_behavior_profiles_user ON user_behavior_profiles(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_user_behavior_profiles_updated ON user_behavior_profiles(last_updated)'
        ];

        for (const indexSql of indexes) {
            try {
                this.db.run(indexSql);
            } catch (error) {
                logger.debug('Index might already exist', { indexSql, error });
            }
        }

        logger.info('Indexes created for rule scheduler tables');
    }
}
