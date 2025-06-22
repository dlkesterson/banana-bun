/**
 * Migration 007: Add Media Intelligence Tables
 * 
 * Creates tables for storing cross-modal learning and AI-powered insights:
 * - content_discovery_patterns: Track what users search for and discover
 * - cross_modal_correlations: Connect search queries, transcripts, and tags
 * - user_behavior_analytics: Track user interaction patterns
 * - content_recommendations: Store AI-generated content recommendations
 * - tagging_optimization_data: Learn from tagging effectiveness
 * - semantic_enhancement_cache: Cache enhanced embeddings and insights
 */

import { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';

export async function migration007(db: Database): Promise<void> {
    await logger.info('Running migration 007: Add media intelligence tables');

    try {
        // Create content_discovery_patterns table
        db.run(`
            CREATE TABLE IF NOT EXISTS content_discovery_patterns (
                id TEXT PRIMARY KEY,
                user_session_id TEXT,
                search_query TEXT NOT NULL,
                search_results_count INTEGER,
                clicked_results TEXT, -- JSON array of clicked media IDs
                transcription_triggered BOOLEAN DEFAULT FALSE,
                tags_viewed TEXT, -- JSON array of tags that were viewed/clicked
                discovery_path TEXT, -- JSON describing how user found content
                content_types_discovered TEXT, -- JSON array of content types
                satisfaction_score REAL, -- Inferred or explicit satisfaction
                timestamp INTEGER NOT NULL,
                session_duration_ms INTEGER,
                follow_up_searches TEXT, -- JSON array of related searches
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create cross_modal_correlations table
        db.run(`
            CREATE TABLE IF NOT EXISTS cross_modal_correlations (
                id TEXT PRIMARY KEY,
                media_id INTEGER NOT NULL,
                search_queries TEXT, -- JSON array of queries that found this media
                transcript_keywords TEXT, -- JSON array of key terms from transcript
                ai_generated_tags TEXT, -- JSON array of AI-generated tags
                user_applied_tags TEXT, -- JSON array of user-applied tags
                search_effectiveness_score REAL, -- How well search finds this content
                transcription_quality_score REAL, -- Quality of transcript for this media
                tagging_accuracy_score REAL, -- How accurate the tags are
                cross_modal_score REAL, -- Overall cross-modal effectiveness
                correlation_strength REAL, -- Strength of search-transcript-tag correlation
                last_updated INTEGER NOT NULL,
                update_count INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata(id)
            )
        `);

        // Create user_behavior_analytics table
        db.run(`
            CREATE TABLE IF NOT EXISTS user_behavior_analytics (
                id TEXT PRIMARY KEY,
                user_session_id TEXT,
                behavior_type TEXT NOT NULL, -- 'search', 'transcribe', 'tag', 'view', 'feedback'
                content_type TEXT, -- 'video', 'audio', 'music', 'speech'
                action_details TEXT, -- JSON with specific action data
                media_id INTEGER,
                search_query TEXT,
                transcription_id TEXT,
                time_spent_seconds INTEGER,
                interaction_quality REAL, -- Quality/satisfaction of interaction
                context_data TEXT, -- JSON with additional context
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata(id)
            )
        `);

        // Create content_recommendations table
        db.run(`
            CREATE TABLE IF NOT EXISTS content_recommendations (
                id TEXT PRIMARY KEY,
                user_session_id TEXT,
                recommendation_type TEXT NOT NULL, -- 'similar_content', 'trending', 'personalized', 'cross_modal'
                source_media_id INTEGER, -- Media that triggered recommendation
                recommended_media_ids TEXT, -- JSON array of recommended media IDs
                recommendation_score REAL, -- Confidence in recommendation
                reasoning TEXT, -- AI explanation of why recommended
                algorithm_used TEXT, -- Which algorithm generated recommendation
                user_feedback REAL, -- User rating of recommendation quality
                click_through_rate REAL, -- How often recommendations are clicked
                conversion_rate REAL, -- How often clicks lead to engagement
                generated_at INTEGER NOT NULL,
                expires_at INTEGER, -- When recommendation becomes stale
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_media_id) REFERENCES media_metadata(id)
            )
        `);

        // Create tagging_optimization_data table
        db.run(`
            CREATE TABLE IF NOT EXISTS tagging_optimization_data (
                id TEXT PRIMARY KEY,
                media_id INTEGER NOT NULL,
                original_tags TEXT, -- JSON array of original AI tags
                optimized_tags TEXT, -- JSON array of optimized tags
                search_performance_before REAL, -- Search effectiveness before optimization
                search_performance_after REAL, -- Search effectiveness after optimization
                user_engagement_before REAL, -- User engagement before optimization
                user_engagement_after REAL, -- User engagement after optimization
                optimization_strategy TEXT, -- Description of optimization approach
                confidence_score REAL, -- Confidence in optimization
                a_b_test_group TEXT, -- A/B testing group identifier
                performance_metrics TEXT, -- JSON with detailed metrics
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata(id)
            )
        `);

        // Create semantic_enhancement_cache table
        db.run(`
            CREATE TABLE IF NOT EXISTS semantic_enhancement_cache (
                id TEXT PRIMARY KEY,
                content_hash TEXT NOT NULL UNIQUE, -- Hash of content being enhanced
                content_type TEXT NOT NULL, -- 'search_query', 'transcript', 'tags', 'description'
                original_content TEXT NOT NULL,
                enhanced_content TEXT, -- AI-enhanced version
                enhancement_type TEXT NOT NULL, -- 'semantic_expansion', 'keyword_extraction', 'concept_mapping'
                enhancement_score REAL, -- Quality of enhancement
                usage_count INTEGER DEFAULT 0,
                last_used INTEGER,
                embedding_vector TEXT, -- JSON array of embedding values
                related_concepts TEXT, -- JSON array of related concepts
                confidence_score REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create ai_insights_cache table for storing AI-generated insights
        db.run(`
            CREATE TABLE IF NOT EXISTS ai_insights_cache (
                id TEXT PRIMARY KEY,
                insight_type TEXT NOT NULL, -- 'content_analysis', 'user_pattern', 'trend_detection', 'recommendation'
                input_data_hash TEXT NOT NULL, -- Hash of input data
                insight_data TEXT NOT NULL, -- JSON with AI-generated insights
                confidence_score REAL,
                model_used TEXT, -- Which AI model generated the insight
                processing_time_ms INTEGER,
                usage_count INTEGER DEFAULT 0,
                last_used INTEGER,
                expires_at INTEGER, -- When insight becomes stale
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for better query performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_content_discovery_session ON content_discovery_patterns(user_session_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_content_discovery_timestamp ON content_discovery_patterns(timestamp)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_content_discovery_query ON content_discovery_patterns(search_query)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_cross_modal_media_id ON cross_modal_correlations(media_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_cross_modal_score ON cross_modal_correlations(cross_modal_score)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_cross_modal_updated ON cross_modal_correlations(last_updated)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_user_behavior_session ON user_behavior_analytics(user_session_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_user_behavior_type ON user_behavior_analytics(behavior_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_user_behavior_timestamp ON user_behavior_analytics(timestamp)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_user_behavior_media_id ON user_behavior_analytics(media_id)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_recommendations_session ON content_recommendations(user_session_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_recommendations_type ON content_recommendations(recommendation_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_recommendations_score ON content_recommendations(recommendation_score)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_recommendations_generated ON content_recommendations(generated_at)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_tagging_optimization_media ON tagging_optimization_data(media_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_tagging_optimization_performance ON tagging_optimization_data(search_performance_after)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_tagging_optimization_timestamp ON tagging_optimization_data(timestamp)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_semantic_cache_hash ON semantic_enhancement_cache(content_hash)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_semantic_cache_type ON semantic_enhancement_cache(content_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_semantic_cache_usage ON semantic_enhancement_cache(usage_count)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_semantic_cache_last_used ON semantic_enhancement_cache(last_used)`);
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights_cache(insight_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_insights_hash ON ai_insights_cache(input_data_hash)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_insights_usage ON ai_insights_cache(usage_count)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_insights_expires ON ai_insights_cache(expires_at)`);

        await logger.info('Migration 007 completed successfully');
    } catch (error) {
        await logger.error('Migration 007 failed', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}
