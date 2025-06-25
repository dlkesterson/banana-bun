/**
 * Enhanced Learning Rule Generation Service
 * 
 * Implements advanced pattern analysis, confidence scoring, and automatic rule application
 * for AI-enhanced learning improvements as outlined in the roadmap.
 */

import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { feedbackTracker, type FeedbackPattern, type LearningRule } from '../feedback-tracker';
import { ChromaClient } from 'chromadb';
import { config } from '../config';

export interface EnhancedLearningRule extends LearningRule {
    pattern_strength: number;
    cross_modal_score?: number;
    search_correlation?: number;
    temporal_consistency?: number;
    user_validation_score?: number;
    similar_rules?: number[];
    embedding_id?: string;
}

export interface RuleGenerationConfig {
    min_pattern_frequency: number;
    min_confidence_threshold: number;
    auto_apply_threshold: number;
    max_rules_per_pattern: number;
    enable_cross_modal_analysis: boolean;
    enable_temporal_analysis: boolean;
    similarity_threshold: number;
}

export interface LearningStrategy {
    name: string;
    description: string;
    weight: number;
    enabled: boolean;
    performance_score: number;
    rule_count: number;
}

export interface RuleApplicationResult {
    rule_id: number;
    media_id: number;
    applied: boolean;
    confidence_before: number;
    confidence_after: number;
    changes_made: string[];
    validation_required: boolean;
}

export class EnhancedLearningService {
    private db = getDatabase();
    private chromaClient?: ChromaClient;
    private config: RuleGenerationConfig;
    private strategies: Map<string, LearningStrategy> = new Map();

    constructor(config?: Partial<RuleGenerationConfig>) {
        this.config = {
            min_pattern_frequency: 3,
            min_confidence_threshold: 0.7,
            auto_apply_threshold: 0.85,
            max_rules_per_pattern: 5,
            enable_cross_modal_analysis: true,
            enable_temporal_analysis: true,
            similarity_threshold: 0.8,
            ...config
        };

        this.initializeStrategies();
        this.initializeChromaClient();
    }

    private initializeStrategies(): void {
        // Initialize different learning strategies
        this.strategies.set('frequency_based', {
            name: 'Frequency-Based Learning',
            description: 'Generate rules based on correction frequency',
            weight: 1.0,
            enabled: true,
            performance_score: 0.0,
            rule_count: 0
        });

        this.strategies.set('semantic_similarity', {
            name: 'Semantic Similarity Learning',
            description: 'Generate rules based on semantic patterns',
            weight: 0.8,
            enabled: true,
            performance_score: 0.0,
            rule_count: 0
        });

        this.strategies.set('temporal_correlation', {
            name: 'Temporal Correlation Learning',
            description: 'Generate rules based on time-based patterns',
            weight: 0.6,
            enabled: this.config.enable_temporal_analysis,
            performance_score: 0.0,
            rule_count: 0
        });

        this.strategies.set('cross_modal', {
            name: 'Cross-Modal Learning',
            description: 'Generate rules from search-transcript-tag correlations',
            weight: 0.9,
            enabled: this.config.enable_cross_modal_analysis,
            performance_score: 0.0,
            rule_count: 0
        });
    }

    private async initializeChromaClient(): Promise<void> {
        try {
            this.chromaClient = new ChromaClient({
                path: config.services.chromadb.url
            });
        } catch (error) {
            logger.warn('ChromaDB not available for enhanced learning', { error });
        }
    }

    /**
     * Generate enhanced learning rules with improved pattern analysis
     */
    async generateEnhancedLearningRules(
        minFrequency: number = this.config.min_pattern_frequency
    ): Promise<EnhancedLearningRule[]> {
        logger.info('Starting enhanced learning rule generation', { minFrequency });

        try {
            // Get feedback patterns from existing tracker
            const patterns = await feedbackTracker.analyzeFeedbackPatterns(minFrequency);
            
            // Enhance patterns with additional analysis
            const enhancedPatterns = await this.enhancePatterns(patterns);
            
            // Generate rules using multiple strategies
            const rules = await this.generateRulesFromPatterns(enhancedPatterns);
            
            // Apply confidence scoring and validation
            const scoredRules = await this.applyAdvancedScoring(rules);
            
            // Filter and rank rules
            const finalRules = this.filterAndRankRules(scoredRules);
            
            logger.info('Enhanced learning rule generation completed', {
                patternsAnalyzed: patterns.length,
                rulesGenerated: finalRules.length,
                strategiesUsed: Array.from(this.strategies.keys()).filter(k => this.strategies.get(k)?.enabled)
            });

            return finalRules;
        } catch (error) {
            logger.error('Failed to generate enhanced learning rules', { error });
            throw error;
        }
    }

    /**
     * Enhance patterns with cross-modal and temporal analysis
     */
    private async enhancePatterns(patterns: FeedbackPattern[]): Promise<FeedbackPattern[]> {
        const enhancedPatterns: FeedbackPattern[] = [];

        for (const pattern of patterns) {
            const enhanced = { ...pattern };

            // Add cross-modal analysis
            if (this.config.enable_cross_modal_analysis) {
                enhanced.cross_modal_score = await this.analyzeCrossModalCorrelation(pattern);
            }

            // Add temporal consistency analysis
            if (this.config.enable_temporal_analysis) {
                enhanced.temporal_consistency = await this.analyzeTemporalConsistency(pattern);
            }

            // Add semantic similarity analysis
            if (this.chromaClient) {
                enhanced.semantic_cluster_size = await this.analyzeSemanticClustering(pattern);
            }

            enhancedPatterns.push(enhanced);
        }

        return enhancedPatterns;
    }

    /**
     * Analyze cross-modal correlation between search, transcripts, and tags
     */
    private async analyzeCrossModalCorrelation(pattern: FeedbackPattern): Promise<number> {
        try {
            // Get media IDs from pattern examples
            const mediaIds = pattern.examples.map(e => e.media_id);
            
            if (mediaIds.length === 0) return 0;

            // Analyze search queries that led to these media items
            const searchCorrelation = this.db.prepare(`
                SELECT COUNT(*) as search_count
                FROM user_feedback uf
                WHERE uf.media_id IN (${mediaIds.map(() => '?').join(',')})
                AND uf.feedback_type = 'search_interaction'
                AND uf.original_value LIKE ?
            `).get(...mediaIds, `%${pattern.examples[0]?.original}%`) as { search_count: number };

            // Analyze transcript mentions
            const transcriptCorrelation = this.db.prepare(`
                SELECT COUNT(*) as transcript_count
                FROM media_transcripts mt
                WHERE mt.media_id IN (${mediaIds.map(() => '?').join(',')})
                AND mt.transcript_text LIKE ?
            `).get(...mediaIds, `%${pattern.examples[0]?.original}%`) as { transcript_count: number };

            // Calculate correlation score
            const totalMedia = mediaIds.length;
            const searchScore = searchCorrelation.search_count / totalMedia;
            const transcriptScore = transcriptCorrelation.transcript_count / totalMedia;
            
            return Math.min(1.0, (searchScore + transcriptScore) / 2);
        } catch (error) {
            logger.warn('Failed to analyze cross-modal correlation', { error });
            return 0;
        }
    }

    /**
     * Analyze temporal consistency of corrections
     */
    private async analyzeTemporalConsistency(pattern: FeedbackPattern): Promise<number> {
        try {
            const mediaIds = pattern.examples.map(e => e.media_id);
            
            if (mediaIds.length === 0) return 0;

            // Get timestamps of corrections
            const corrections = this.db.prepare(`
                SELECT timestamp
                FROM user_feedback
                WHERE media_id IN (${mediaIds.map(() => '?').join(',')})
                AND original_value = ? AND corrected_value = ?
                ORDER BY timestamp
            `).all(...mediaIds, pattern.examples[0]?.original, pattern.examples[0]?.corrected) as { timestamp: string }[];

            if (corrections.length < 2) return 0.5;

            // Calculate time intervals between corrections
            const intervals: number[] = [];
            for (let i = 1; i < corrections.length; i++) {
                const prev = new Date(corrections[i - 1].timestamp).getTime();
                const curr = new Date(corrections[i].timestamp).getTime();
                intervals.push(curr - prev);
            }

            // Calculate consistency (lower variance = higher consistency)
            const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
            const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
            const coefficientOfVariation = Math.sqrt(variance) / avgInterval;

            // Convert to consistency score (0-1, higher is more consistent)
            return Math.max(0, Math.min(1, 1 - coefficientOfVariation / 2));
        } catch (error) {
            logger.warn('Failed to analyze temporal consistency', { error });
            return 0.5;
        }
    }

    /**
     * Analyze semantic clustering using ChromaDB
     */
    private async analyzeSemanticClustering(pattern: FeedbackPattern): Promise<number> {
        if (!this.chromaClient) return 0;

        try {
            // This would use ChromaDB to find semantically similar content
            // For now, return a placeholder score
            return 0.7;
        } catch (error) {
            logger.warn('Failed to analyze semantic clustering', { error });
            return 0;
        }
    }

    /**
     * Generate rules from enhanced patterns using multiple strategies
     */
    private async generateRulesFromPatterns(patterns: FeedbackPattern[]): Promise<EnhancedLearningRule[]> {
        const rules: EnhancedLearningRule[] = [];

        for (const pattern of patterns) {
            // Skip low-quality patterns
            if (pattern.confidence < this.config.min_confidence_threshold || 
                pattern.frequency < this.config.min_pattern_frequency) {
                continue;
            }

            // Generate rules using different strategies
            for (const [strategyName, strategy] of this.strategies) {
                if (!strategy.enabled) continue;

                const strategyRules = await this.generateRulesForStrategy(pattern, strategyName);
                rules.push(...strategyRules);

                // Limit rules per pattern
                if (rules.length >= this.config.max_rules_per_pattern) break;
            }
        }

        return rules;
    }

    /**
     * Generate rules for a specific strategy
     */
    private async generateRulesForStrategy(
        pattern: FeedbackPattern, 
        strategyName: string
    ): Promise<EnhancedLearningRule[]> {
        const rules: EnhancedLearningRule[] = [];
        const strategy = this.strategies.get(strategyName);
        
        if (!strategy) return rules;

        // Calculate pattern strength based on multiple factors
        const patternStrength = this.calculatePatternStrength(pattern);

        switch (strategyName) {
            case 'frequency_based':
                rules.push(...this.generateFrequencyBasedRules(pattern, patternStrength));
                break;
            case 'semantic_similarity':
                rules.push(...await this.generateSemanticRules(pattern, patternStrength));
                break;
            case 'temporal_correlation':
                rules.push(...this.generateTemporalRules(pattern, patternStrength));
                break;
            case 'cross_modal':
                rules.push(...this.generateCrossModalRules(pattern, patternStrength));
                break;
        }

        // Apply strategy weight to rule confidence
        for (const rule of rules) {
            rule.confidence *= strategy.weight;
            rule.strategy_type = strategyName;
        }

        return rules;
    }

    /**
     * Calculate pattern strength from multiple factors
     */
    private calculatePatternStrength(pattern: FeedbackPattern): number {
        let strength = pattern.confidence * 0.4; // Base confidence
        strength += Math.min(1.0, pattern.frequency / 10) * 0.3; // Frequency factor

        if (pattern.cross_modal_score) {
            strength += pattern.cross_modal_score * 0.2; // Cross-modal factor
        }

        if (pattern.temporal_consistency) {
            strength += pattern.temporal_consistency * 0.1; // Temporal factor
        }

        return Math.min(1.0, strength);
    }

    /**
     * Generate frequency-based rules
     */
    private generateFrequencyBasedRules(pattern: FeedbackPattern, patternStrength: number): EnhancedLearningRule[] {
        const rules: EnhancedLearningRule[] = [];

        if (pattern.pattern_type === 'tag_correction' && pattern.examples.length > 0) {
            const example = pattern.examples[0];
            rules.push({
                rule_type: 'tag_mapping',
                condition: `tag_contains("${example.original}")`,
                action: `replace_tag("${example.original}", "${example.corrected}")`,
                confidence: pattern.confidence,
                created_from_feedback: true,
                usage_count: 0,
                success_rate: 0,
                pattern_strength: patternStrength,
                strategy_type: 'frequency_based',
                auto_apply_threshold: this.config.auto_apply_threshold
            });
        }

        return rules;
    }

    /**
     * Generate semantic similarity rules
     */
    private async generateSemanticRules(pattern: FeedbackPattern, patternStrength: number): Promise<EnhancedLearningRule[]> {
        const rules: EnhancedLearningRule[] = [];

        if (pattern.pattern_type === 'tag_correction' && this.chromaClient) {
            // Generate broader semantic rules
            const example = pattern.examples[0];
            rules.push({
                rule_type: 'tag_mapping',
                condition: `semantic_similar("${example.original}", 0.8)`,
                action: `suggest_tag_replacement("${example.original}", "${example.corrected}")`,
                confidence: pattern.confidence * 0.8, // Lower confidence for semantic rules
                created_from_feedback: true,
                usage_count: 0,
                success_rate: 0,
                pattern_strength: patternStrength,
                strategy_type: 'semantic_similarity',
                auto_apply_threshold: this.config.auto_apply_threshold + 0.1 // Higher threshold for auto-apply
            });
        }

        return rules;
    }

    /**
     * Generate temporal correlation rules
     */
    private generateTemporalRules(pattern: FeedbackPattern, patternStrength: number): EnhancedLearningRule[] {
        const rules: EnhancedLearningRule[] = [];

        if (pattern.temporal_consistency && pattern.temporal_consistency > 0.7) {
            const example = pattern.examples[0];
            rules.push({
                rule_type: 'metadata_enhancement',
                condition: `temporal_pattern("${pattern.pattern_type}", ${pattern.temporal_consistency})`,
                action: `apply_temporal_correction("${example.original}", "${example.corrected}")`,
                confidence: pattern.confidence * pattern.temporal_consistency,
                created_from_feedback: true,
                usage_count: 0,
                success_rate: 0,
                pattern_strength: patternStrength,
                strategy_type: 'temporal_correlation',
                temporal_consistency: pattern.temporal_consistency
            });
        }

        return rules;
    }

    /**
     * Generate cross-modal rules
     */
    private generateCrossModalRules(pattern: FeedbackPattern, patternStrength: number): EnhancedLearningRule[] {
        const rules: EnhancedLearningRule[] = [];

        if (pattern.cross_modal_score && pattern.cross_modal_score > 0.6) {
            const example = pattern.examples[0];
            rules.push({
                rule_type: 'search_optimization',
                condition: `cross_modal_correlation("${example.original}", ${pattern.cross_modal_score})`,
                action: `enhance_search_tags("${example.original}", "${example.corrected}")`,
                confidence: pattern.confidence * pattern.cross_modal_score,
                created_from_feedback: true,
                usage_count: 0,
                success_rate: 0,
                pattern_strength: patternStrength,
                strategy_type: 'cross_modal',
                cross_modal_score: pattern.cross_modal_score
            });
        }

        return rules;
    }

    /**
     * Apply advanced scoring to rules
     */
    private async applyAdvancedScoring(rules: EnhancedLearningRule[]): Promise<EnhancedLearningRule[]> {
        const scoredRules: EnhancedLearningRule[] = [];

        for (const rule of rules) {
            const scored = { ...rule };

            // Calculate effectiveness score based on multiple factors
            scored.effectiveness_score = this.calculateEffectivenessScore(rule);

            // Add user validation score if available
            scored.user_validation_score = await this.getUserValidationScore(rule);

            // Find similar rules for deduplication
            scored.similar_rules = await this.findSimilarRules(rule);

            // Adjust confidence based on similar rules
            if (scored.similar_rules && scored.similar_rules.length > 0) {
                scored.confidence *= 1.1; // Boost confidence if similar rules exist
            }

            scoredRules.push(scored);
        }

        return scoredRules;
    }

    /**
     * Calculate effectiveness score for a rule
     */
    private calculateEffectivenessScore(rule: EnhancedLearningRule): number {
        let score = rule.confidence * 0.4;
        score += rule.pattern_strength * 0.3;

        if (rule.cross_modal_score) {
            score += rule.cross_modal_score * 0.2;
        }

        if (rule.temporal_consistency) {
            score += rule.temporal_consistency * 0.1;
        }

        return Math.min(1.0, score);
    }

    /**
     * Get user validation score for a rule
     */
    private async getUserValidationScore(rule: EnhancedLearningRule): Promise<number> {
        try {
            // Check if users have validated similar corrections
            const validationData = this.db.prepare(`
                SELECT AVG(confidence_score) as avg_confidence, COUNT(*) as validation_count
                FROM user_feedback
                WHERE feedback_type = 'rule_validation'
                AND original_value LIKE ?
            `).get(`%${rule.condition}%`) as { avg_confidence: number; validation_count: number };

            if (validationData.validation_count > 0) {
                return validationData.avg_confidence || 0.5;
            }

            return 0.5; // Neutral score if no validation data
        } catch (error) {
            logger.warn('Failed to get user validation score', { error });
            return 0.5;
        }
    }

    /**
     * Find similar existing rules
     */
    private async findSimilarRules(rule: EnhancedLearningRule): Promise<number[]> {
        try {
            const similarRules = this.db.prepare(`
                SELECT id FROM learning_rules
                WHERE rule_type = ?
                AND (condition_text LIKE ? OR action_text LIKE ?)
                AND enabled = TRUE
            `).all(
                rule.rule_type,
                `%${rule.condition.substring(0, 20)}%`,
                `%${rule.action.substring(0, 20)}%`
            ) as { id: number }[];

            return similarRules.map(r => r.id);
        } catch (error) {
            logger.warn('Failed to find similar rules', { error });
            return [];
        }
    }

    /**
     * Filter and rank rules by quality and effectiveness
     */
    private filterAndRankRules(rules: EnhancedLearningRule[]): EnhancedLearningRule[] {
        // Remove duplicates and low-quality rules
        const filteredRules = rules.filter(rule => {
            return rule.confidence >= this.config.min_confidence_threshold &&
                   rule.effectiveness_score && rule.effectiveness_score >= 0.6;
        });

        // Sort by effectiveness score and confidence
        filteredRules.sort((a, b) => {
            const scoreA = (a.effectiveness_score || 0) * 0.6 + a.confidence * 0.4;
            const scoreB = (b.effectiveness_score || 0) * 0.6 + b.confidence * 0.4;
            return scoreB - scoreA;
        });

        // Remove near-duplicates
        const uniqueRules: EnhancedLearningRule[] = [];
        for (const rule of filteredRules) {
            const isDuplicate = uniqueRules.some(existing =>
                existing.rule_type === rule.rule_type &&
                this.calculateRuleSimilarity(existing, rule) > this.config.similarity_threshold
            );

            if (!isDuplicate) {
                uniqueRules.push(rule);
            }
        }

        return uniqueRules;
    }

    /**
     * Calculate similarity between two rules
     */
    private calculateRuleSimilarity(rule1: EnhancedLearningRule, rule2: EnhancedLearningRule): number {
        if (rule1.rule_type !== rule2.rule_type) return 0;

        // Simple text similarity for conditions and actions
        const conditionSimilarity = this.calculateTextSimilarity(rule1.condition, rule2.condition);
        const actionSimilarity = this.calculateTextSimilarity(rule1.action, rule2.action);

        return (conditionSimilarity + actionSimilarity) / 2;
    }

    /**
     * Calculate text similarity using simple overlap
     */
    private calculateTextSimilarity(text1: string, text2: string): number {
        const words1 = new Set(text1.toLowerCase().split(/\W+/));
        const words2 = new Set(text2.toLowerCase().split(/\W+/));

        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    /**
     * Store enhanced learning rules in database
     */
    async storeEnhancedRules(rules: EnhancedLearningRule[]): Promise<EnhancedLearningRule[]> {
        const storedRules: EnhancedLearningRule[] = [];

        // Ensure learning_rules table has enhanced columns
        await this.ensureEnhancedSchema();

        for (const rule of rules) {
            try {
                const result = this.db.run(`
                    INSERT INTO learning_rules (
                        rule_type, condition_text, action_text, confidence,
                        created_from_feedback, usage_count, success_rate, enabled,
                        strategy_type, effectiveness_score, auto_apply_threshold
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    rule.rule_type,
                    rule.condition,
                    rule.action,
                    rule.confidence,
                    rule.created_from_feedback,
                    rule.usage_count,
                    rule.success_rate,
                    rule.enabled !== false, // Default to true
                    rule.strategy_type,
                    rule.effectiveness_score,
                    rule.auto_apply_threshold
                ]);

                const ruleId = result.lastInsertRowid as number;
                storedRules.push({ ...rule, id: ruleId });

                logger.info('Enhanced learning rule stored', {
                    ruleId,
                    ruleType: rule.rule_type,
                    confidence: rule.confidence,
                    strategy: rule.strategy_type
                });
            } catch (error) {
                logger.error('Failed to store enhanced learning rule', { rule, error });
            }
        }

        return storedRules;
    }

    /**
     * Ensure database schema supports enhanced learning rules
     */
    private async ensureEnhancedSchema(): Promise<void> {
        try {
            // Add new columns if they don't exist
            const enhancedColumns = [
                'strategy_type TEXT',
                'effectiveness_score REAL',
                'last_applied DATETIME',
                'auto_apply_threshold REAL DEFAULT 0.85'
            ];

            for (const column of enhancedColumns) {
                try {
                    this.db.run(`ALTER TABLE learning_rules ADD COLUMN ${column}`);
                } catch (error) {
                    // Column already exists, ignore
                }
            }
        } catch (error) {
            logger.warn('Failed to ensure enhanced schema', { error });
        }
    }

    /**
     * Apply learning rules automatically to media
     */
    async applyRulesAutomatically(mediaId: number, confidenceThreshold?: number): Promise<RuleApplicationResult[]> {
        const threshold = confidenceThreshold || this.config.auto_apply_threshold;
        const results: RuleApplicationResult[] = [];

        try {
            // Get high-confidence rules that can be auto-applied
            const applicableRules = this.db.prepare(`
                SELECT * FROM learning_rules
                WHERE enabled = TRUE
                AND confidence >= ?
                AND (auto_apply_threshold IS NULL OR confidence >= auto_apply_threshold)
                ORDER BY confidence DESC, effectiveness_score DESC
            `).all(threshold) as EnhancedLearningRule[];

            for (const rule of applicableRules) {
                const result = await this.applyRuleToMedia(rule, mediaId);
                results.push(result);

                if (result.applied) {
                    // Update rule usage statistics
                    await this.updateRuleUsage(rule.id!, result.applied);
                }
            }

            logger.info('Automatic rule application completed', {
                mediaId,
                rulesApplied: results.filter(r => r.applied).length,
                totalRules: results.length
            });

            return results;
        } catch (error) {
            logger.error('Failed to apply rules automatically', { mediaId, error });
            throw error;
        }
    }

    /**
     * Apply a specific rule to media
     */
    private async applyRuleToMedia(rule: EnhancedLearningRule, mediaId: number): Promise<RuleApplicationResult> {
        const result: RuleApplicationResult = {
            rule_id: rule.id!,
            media_id: mediaId,
            applied: false,
            confidence_before: rule.confidence,
            confidence_after: rule.confidence,
            changes_made: [],
            validation_required: rule.confidence < 0.9
        };

        try {
            // This is a simplified implementation
            // In a real system, you'd have a more sophisticated rule engine

            switch (rule.rule_type) {
                case 'tag_mapping':
                    result.applied = await this.applyTagMappingRule(rule, mediaId, result);
                    break;
                case 'metadata_enhancement':
                    result.applied = await this.applyMetadataRule(rule, mediaId, result);
                    break;
                case 'search_optimization':
                    result.applied = await this.applySearchOptimizationRule(rule, mediaId, result);
                    break;
            }

            return result;
        } catch (error) {
            logger.error('Failed to apply rule to media', { ruleId: rule.id, mediaId, error });
            return result;
        }
    }

    /**
     * Apply tag mapping rule
     */
    private async applyTagMappingRule(
        rule: EnhancedLearningRule,
        mediaId: number,
        result: RuleApplicationResult
    ): Promise<boolean> {
        try {
            // Get current tags for the media
            const mediaRow = this.db.prepare(`
                SELECT tags_json FROM media_tags WHERE media_id = ?
            `).get(mediaId) as { tags_json: string } | undefined;

            if (!mediaRow) return false;

            const tags = JSON.parse(mediaRow.tags_json || '[]') as string[];

            // Extract condition and action from rule (simplified parsing)
            const conditionMatch = rule.condition.match(/tag_contains\("([^"]+)"\)/);
            const actionMatch = rule.action.match(/replace_tag\("([^"]+)",\s*"([^"]+)"\)/);

            if (!conditionMatch || !actionMatch) return false;

            const searchTag = conditionMatch[1];
            const oldTag = actionMatch[1];
            const newTag = actionMatch[2];

            // Check if condition is met and apply transformation
            let applied = false;
            const newTags = tags.map(tag => {
                if (tag.includes(searchTag) || tag === oldTag) {
                    applied = true;
                    result.changes_made.push(`Replaced tag "${tag}" with "${newTag}"`);
                    return newTag;
                }
                return tag;
            });

            if (applied) {
                // Update tags in database
                this.db.run(`
                    UPDATE media_tags
                    SET tags_json = ?, confidence_score = ?
                    WHERE media_id = ?
                `, [JSON.stringify(newTags), rule.confidence, mediaId]);
            }

            return applied;
        } catch (error) {
            logger.error('Failed to apply tag mapping rule', { error });
            return false;
        }
    }

    /**
     * Apply metadata enhancement rule
     */
    private async applyMetadataRule(
        rule: EnhancedLearningRule,
        mediaId: number,
        result: RuleApplicationResult
    ): Promise<boolean> {
        // Placeholder for metadata enhancement logic
        result.changes_made.push('Applied metadata enhancement');
        return true;
    }

    /**
     * Apply search optimization rule
     */
    private async applySearchOptimizationRule(
        rule: EnhancedLearningRule,
        mediaId: number,
        result: RuleApplicationResult
    ): Promise<boolean> {
        // Placeholder for search optimization logic
        result.changes_made.push('Applied search optimization');
        return true;
    }

    /**
     * Update rule usage statistics
     */
    private async updateRuleUsage(ruleId: number, success: boolean): Promise<void> {
        try {
            const currentStats = this.db.prepare(`
                SELECT usage_count, success_rate FROM learning_rules WHERE id = ?
            `).get(ruleId) as { usage_count: number; success_rate: number } | undefined;

            if (!currentStats) return;

            const newUsageCount = currentStats.usage_count + 1;
            const newSuccessRate = success
                ? (currentStats.success_rate * currentStats.usage_count + 1) / newUsageCount
                : (currentStats.success_rate * currentStats.usage_count) / newUsageCount;

            this.db.run(`
                UPDATE learning_rules
                SET usage_count = ?, success_rate = ?, last_used_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [newUsageCount, newSuccessRate, ruleId]);
        } catch (error) {
            logger.error('Failed to update rule usage', { ruleId, error });
        }
    }

    /**
     * Get learning strategy performance
     */
    async getStrategyPerformance(): Promise<LearningStrategy[]> {
        const strategies: LearningStrategy[] = [];

        for (const [name, strategy] of this.strategies) {
            const performance = this.db.prepare(`
                SELECT
                    COUNT(*) as rule_count,
                    AVG(success_rate) as avg_success_rate,
                    AVG(effectiveness_score) as avg_effectiveness
                FROM learning_rules
                WHERE strategy_type = ? AND enabled = TRUE
            `).get(name) as { rule_count: number; avg_success_rate: number; avg_effectiveness: number };

            strategies.push({
                ...strategy,
                rule_count: performance.rule_count || 0,
                performance_score: (performance.avg_success_rate || 0) * 0.6 + (performance.avg_effectiveness || 0) * 0.4
            });
        }

        return strategies;
    }
}
