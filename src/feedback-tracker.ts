import { getDatabase } from './db';
import { logger } from './utils/logger';

export interface UserFeedback {
    media_id: number;
    feedback_type: 'tag_correction' | 'file_move' | 'rating' | 'metadata_edit';
    original_value: string;
    corrected_value: string;
    confidence_score?: number;
    source: string;
}

export interface FeedbackPattern {
    pattern_type: string;
    pattern_description: string;
    frequency: number;
    confidence: number;
    examples: Array<{
        original: string;
        corrected: string;
        media_id: number;
    }>;
    suggested_rule?: string;
}

export interface LearningRule {
    id?: number;
    rule_type: 'tag_mapping' | 'genre_correction' | 'metadata_enhancement' | 'search_optimization' | 'content_quality';
    condition: string;
    action: string;
    confidence: number;
    created_from_feedback: boolean;
    usage_count: number;
    success_rate: number;
    enabled?: boolean;
    strategy_type?: string;
    effectiveness_score?: number;
    last_applied?: string;
    auto_apply_threshold?: number;
}

export class FeedbackTracker {
    private db = getDatabase();

    async recordFeedback(feedback: UserFeedback): Promise<void> {
        try {
            this.db.run(`
                INSERT INTO user_feedback (
                    media_id, feedback_type, original_value, corrected_value, 
                    confidence_score, source, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                feedback.media_id,
                feedback.feedback_type,
                feedback.original_value,
                feedback.corrected_value,
                feedback.confidence_score || 1.0,
                feedback.source
            ]);

            await logger.info('User feedback recorded', {
                mediaId: feedback.media_id,
                feedbackType: feedback.feedback_type,
                source: feedback.source
            });
        } catch (error) {
            await logger.error('Failed to record user feedback', {
                mediaId: feedback.media_id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async analyzeFeedbackPatterns(minFrequency: number = 3): Promise<FeedbackPattern[]> {
        try {
            const patterns: FeedbackPattern[] = [];

            // Analyze tag correction patterns
            const tagPatterns = this.db.prepare(`
                SELECT 
                    original_value,
                    corrected_value,
                    COUNT(*) as frequency,
                    AVG(confidence_score) as avg_confidence,
                    GROUP_CONCAT(media_id) as media_ids
                FROM user_feedback 
                WHERE feedback_type = 'tag_correction'
                GROUP BY original_value, corrected_value
                HAVING COUNT(*) >= ?
                ORDER BY frequency DESC
            `).all(minFrequency) as any[];

            for (const pattern of tagPatterns) {
                const mediaIds = pattern.media_ids.split(',').map((id: string) => parseInt(id));
                const examples = mediaIds.slice(0, 3).map((id: number) => ({
                    original: pattern.original_value,
                    corrected: pattern.corrected_value,
                    media_id: id
                }));

                patterns.push({
                    pattern_type: 'tag_correction',
                    pattern_description: `"${pattern.original_value}" → "${pattern.corrected_value}"`,
                    frequency: pattern.frequency,
                    confidence: pattern.avg_confidence,
                    examples,
                    suggested_rule: `IF tag contains "${pattern.original_value}" THEN replace with "${pattern.corrected_value}"`
                });
            }

            // Analyze genre correction patterns
            const genrePatterns = this.db.prepare(`
                SELECT 
                    original_value,
                    corrected_value,
                    COUNT(*) as frequency,
                    AVG(confidence_score) as avg_confidence
                FROM user_feedback 
                WHERE feedback_type = 'metadata_edit' 
                AND original_value LIKE '%genre%'
                GROUP BY original_value, corrected_value
                HAVING COUNT(*) >= ?
                ORDER BY frequency DESC
            `).all(minFrequency) as any[];

            for (const pattern of genrePatterns) {
                patterns.push({
                    pattern_type: 'genre_correction',
                    pattern_description: `Genre: ${pattern.original_value} → ${pattern.corrected_value}`,
                    frequency: pattern.frequency,
                    confidence: pattern.avg_confidence,
                    examples: [],
                    suggested_rule: `IF genre = "${pattern.original_value}" THEN set genre = "${pattern.corrected_value}"`
                });
            }

            await logger.info('Analyzed feedback patterns', {
                patternsFound: patterns.length,
                minFrequency
            });

            return patterns;
        } catch (error) {
            await logger.error('Failed to analyze feedback patterns', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async generateLearningRules(patterns: FeedbackPattern[]): Promise<LearningRule[]> {
        try {
            const rules: LearningRule[] = [];

            for (const pattern of patterns) {
                if (pattern.confidence < 0.7 || pattern.frequency < 3) {
                    continue; // Skip low-confidence or infrequent patterns
                }

                let rule: LearningRule;

                switch (pattern.pattern_type) {
                    case 'tag_correction':
                        rule = {
                            rule_type: 'tag_mapping',
                            condition: `tag_contains("${pattern.examples[0]?.original}")`,
                            action: `replace_tag("${pattern.examples[0]?.original}", "${pattern.examples[0]?.corrected}")`,
                            confidence: pattern.confidence,
                            created_from_feedback: true,
                            usage_count: 0,
                            success_rate: 0
                        };
                        break;

                    case 'genre_correction':
                        rule = {
                            rule_type: 'genre_correction',
                            condition: `genre_equals("${pattern.examples[0]?.original}")`,
                            action: `set_genre("${pattern.examples[0]?.corrected}")`,
                            confidence: pattern.confidence,
                            created_from_feedback: true,
                            usage_count: 0,
                            success_rate: 0
                        };
                        break;

                    default:
                        continue;
                }

                rules.push(rule);
            }

            await logger.info('Generated learning rules', {
                rulesGenerated: rules.length,
                patternsAnalyzed: patterns.length
            });

            return rules;
        } catch (error) {
            await logger.error('Failed to generate learning rules', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getFeedbackStats(days: number = 30): Promise<{
        total_feedback: number;
        feedback_by_type: Array<{ type: string; count: number }>;
        most_corrected_media: Array<{ media_id: number; correction_count: number }>;
        recent_patterns: FeedbackPattern[];
    }> {
        try {
            const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

            // Get total feedback count
            const totalFeedback = this.db.prepare(`
                SELECT COUNT(*) as count 
                FROM user_feedback 
                WHERE timestamp >= ?
            `).get(cutoffDate) as { count: number };

            // Get feedback by type
            const feedbackByType = this.db.prepare(`
                SELECT feedback_type as type, COUNT(*) as count
                FROM user_feedback 
                WHERE timestamp >= ?
                GROUP BY feedback_type
                ORDER BY count DESC
            `).all(cutoffDate) as Array<{ type: string; count: number }>;

            // Get most corrected media
            const mostCorrected = this.db.prepare(`
                SELECT media_id, COUNT(*) as correction_count
                FROM user_feedback 
                WHERE timestamp >= ?
                GROUP BY media_id
                ORDER BY correction_count DESC
                LIMIT 10
            `).all(cutoffDate) as Array<{ media_id: number; correction_count: number }>;

            // Get recent patterns
            const recentPatterns = await this.analyzeFeedbackPatterns(2);

            return {
                total_feedback: totalFeedback.count,
                feedback_by_type: feedbackByType,
                most_corrected_media: mostCorrected,
                recent_patterns: recentPatterns.slice(0, 5)
            };
        } catch (error) {
            await logger.error('Failed to get feedback stats', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async applyLearningRule(rule: LearningRule, mediaId: number): Promise<boolean> {
        try {
            // This is a simplified implementation
            // In a real system, you'd have a more sophisticated rule engine
            
            const db = this.db;
            let applied = false;

            switch (rule.rule_type) {
                case 'tag_mapping':
                    // Get current tags
                    const mediaRow = db.prepare(`
                        SELECT tags_json FROM media_tags WHERE media_id = ?
                    `).get(mediaId) as { tags_json: string } | undefined;

                    if (mediaRow) {
                        try {
                            const tags = JSON.parse(mediaRow.tags_json || '[]');
                            // Apply tag transformation based on rule
                            // This would need more sophisticated parsing of the rule condition/action
                            applied = true;
                        } catch (error) {
                            // Invalid JSON, skip
                        }
                    }
                    break;

                case 'genre_correction':
                    // Apply genre correction
                    // This would need access to metadata and rule parsing
                    applied = true;
                    break;
            }

            if (applied) {
                // Update rule usage statistics
                if (rule.id) {
                    db.run(`
                        UPDATE learning_rules 
                        SET usage_count = usage_count + 1 
                        WHERE id = ?
                    `, [rule.id]);
                }

                await logger.info('Applied learning rule', {
                    ruleType: rule.rule_type,
                    mediaId,
                    ruleId: rule.id
                });
            }

            return applied;
        } catch (error) {
            await logger.error('Failed to apply learning rule', {
                ruleType: rule.rule_type,
                mediaId,
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    async getTopCorrections(limit: number = 10): Promise<Array<{
        original_value: string;
        corrected_value: string;
        frequency: number;
        feedback_type: string;
    }>> {
        try {
            const corrections = this.db.prepare(`
                SELECT 
                    original_value,
                    corrected_value,
                    COUNT(*) as frequency,
                    feedback_type
                FROM user_feedback 
                WHERE timestamp >= DATE('now', '-30 days')
                GROUP BY original_value, corrected_value, feedback_type
                ORDER BY frequency DESC
                LIMIT ?
            `).all(limit) as any[];

            return corrections;
        } catch (error) {
            await logger.error('Failed to get top corrections', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
}

// Export singleton instance
export const feedbackTracker = new FeedbackTracker();
