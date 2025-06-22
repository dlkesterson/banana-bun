import { getDatabase } from '../db';
import { logger } from '../utils/logger';

export interface RecommendationOptions {
    topK?: number;
    minScore?: number;
    includeReason?: boolean;
    excludeWatched?: boolean;
    userId?: string;
}

export interface RecommendationResult {
    media_id: number;
    score: number;
    reason?: string;
    metadata?: any;
}

export interface RecommendationResponse {
    success: boolean;
    recommendations?: RecommendationResult[];
    error?: string;
    algorithm_used?: string;
    total_candidates?: number;
}

export class RecommenderService {
    private initialized = false;

    constructor() {
        this.initialize();
    }

    private async initialize() {
        try {
            // Check if ChromaDB is available for similarity search
            // For now, we'll use basic similarity based on metadata
            this.initialized = true;
            await logger.info('Recommender service initialized successfully');
        } catch (error) {
            await logger.error('Failed to initialize recommender service', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Find similar media based on content similarity
     */
    async findSimilarMedia(mediaId: number, options: RecommendationOptions = {}): Promise<RecommendationResponse> {
        const startTime = Date.now();

        if (!this.initialized) {
            return {
                success: false,
                error: 'Recommender service not initialized'
            };
        }

        try {
            const {
                topK = 5,
                minScore = 0.1,
                includeReason = true,
                excludeWatched = false,
                userId
            } = options;

            const db = getDatabase();

            // Get source media metadata
            const sourceMedia = db.prepare(`
                SELECT mm.*, mt.transcript_text, mt.summary
                FROM media_metadata mm
                LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
                WHERE mm.id = ?
            `).get(mediaId) as any;

            if (!sourceMedia) {
                return {
                    success: false,
                    error: `Media with ID ${mediaId} not found`
                };
            }

            const sourceMetadata = JSON.parse(sourceMedia.metadata_json);

            // Get user's watched media if excluding watched content
            let watchedMediaIds: number[] = [];
            if (excludeWatched && userId) {
                const watchedRows = db.prepare(`
                    SELECT DISTINCT media_id 
                    FROM user_interactions 
                    WHERE user_id = ? AND action IN ('play', 'watch', 'complete')
                `).all(userId) as Array<{ media_id: number }>;
                watchedMediaIds = watchedRows.map(row => row.media_id);
            }

            // Find candidate media (excluding source and watched)
            let excludeClause = 'mm.id != ?';
            let excludeParams: any[] = [mediaId];
            
            if (watchedMediaIds.length > 0) {
                excludeClause += ` AND mm.id NOT IN (${watchedMediaIds.map(() => '?').join(',')})`;
                excludeParams.push(...watchedMediaIds);
            }

            const candidates = db.prepare(`
                SELECT mm.*, mt.transcript_text, mt.summary
                FROM media_metadata mm
                LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
                WHERE ${excludeClause}
                ORDER BY mm.extracted_at DESC
                LIMIT 100
            `).all(...excludeParams) as any[];

            // Calculate similarity scores
            const recommendations: RecommendationResult[] = [];

            for (const candidate of candidates) {
                const candidateMetadata = JSON.parse(candidate.metadata_json);
                const score = this.calculateSimilarityScore(sourceMetadata, candidateMetadata, {
                    sourceTranscript: sourceMedia.transcript_text,
                    sourceSummary: sourceMedia.summary,
                    candidateTranscript: candidate.transcript_text,
                    candidateSummary: candidate.summary
                });

                if (score >= minScore) {
                    const recommendation: RecommendationResult = {
                        media_id: candidate.id,
                        score,
                        metadata: {
                            filename: candidateMetadata.filename,
                            duration: candidateMetadata.duration,
                            format: candidateMetadata.format,
                            file_path: candidate.file_path
                        }
                    };

                    if (includeReason) {
                        recommendation.reason = this.generateReasonText(sourceMetadata, candidateMetadata, score);
                    }

                    recommendations.push(recommendation);
                }
            }

            // Sort by score and limit results
            recommendations.sort((a, b) => b.score - a.score);
            const topRecommendations = recommendations.slice(0, topK);

            // Cache recommendations for future use
            await this.cacheRecommendations(mediaId, topRecommendations, 'similar', userId);

            const processingTime = Date.now() - startTime;
            await logger.info('Similar media recommendations generated', {
                sourceMediaId: mediaId,
                candidatesEvaluated: candidates.length,
                recommendationsFound: topRecommendations.length,
                processingTimeMs: processingTime,
                userId
            });

            return {
                success: true,
                recommendations: topRecommendations,
                algorithm_used: 'content_similarity',
                total_candidates: candidates.length
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            await logger.error('Failed to find similar media', {
                mediaId,
                error: errorMessage,
                processingTimeMs: processingTime
            });

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Get user-based recommendations
     */
    async getUserRecommendations(userId: string, options: RecommendationOptions = {}): Promise<RecommendationResponse> {
        const startTime = Date.now();

        try {
            const {
                topK = 10,
                minScore = 0.2,
                includeReason = true
            } = options;

            const db = getDatabase();

            // Get user's interaction history
            const userInteractions = db.prepare(`
                SELECT ui.media_id, ui.action, COUNT(*) as interaction_count,
                       mm.metadata_json, mt.transcript_text, mt.summary
                FROM user_interactions ui
                JOIN media_metadata mm ON ui.media_id = mm.id
                LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
                WHERE ui.user_id = ?
                GROUP BY ui.media_id, ui.action
                ORDER BY ui.timestamp DESC
                LIMIT 50
            `).all(userId) as any[];

            if (userInteractions.length === 0) {
                // Fallback to popular content for new users
                return this.getPopularRecommendations(options);
            }

            // Analyze user preferences
            const userProfile = this.buildUserProfile(userInteractions);

            // Find recommendations based on user profile
            const recommendations = await this.findRecommendationsForProfile(userProfile, userId, options);

            const processingTime = Date.now() - startTime;
            await logger.info('User-based recommendations generated', {
                userId,
                interactionHistory: userInteractions.length,
                recommendationsFound: recommendations.length,
                processingTimeMs: processingTime
            });

            return {
                success: true,
                recommendations,
                algorithm_used: 'user_based',
                total_candidates: userInteractions.length
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            await logger.error('Failed to get user recommendations', {
                userId,
                error: errorMessage,
                processingTimeMs: processingTime
            });

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Calculate similarity score between two media items
     */
    private calculateSimilarityScore(source: any, candidate: any, context: {
        sourceTranscript?: string;
        sourceSummary?: string;
        candidateTranscript?: string;
        candidateSummary?: string;
    }): number {
        let score = 0;
        let factors = 0;

        // Format similarity (same format gets higher score)
        if (source.format && candidate.format) {
            if (source.format === candidate.format) {
                score += 0.3;
            }
            factors++;
        }

        // Duration similarity (similar length content)
        if (source.duration && candidate.duration) {
            const durationRatio = Math.min(source.duration, candidate.duration) / Math.max(source.duration, candidate.duration);
            score += durationRatio * 0.2;
            factors++;
        }

        // Tags similarity (if available)
        if (source.tags && candidate.tags && Array.isArray(source.tags) && Array.isArray(candidate.tags)) {
            const commonTags = source.tags.filter((tag: string) => candidate.tags.includes(tag));
            const tagSimilarity = commonTags.length / Math.max(source.tags.length, candidate.tags.length);
            score += tagSimilarity * 0.3;
            factors++;
        }

        // Text similarity (basic keyword matching)
        if (context.sourceSummary && context.candidateSummary) {
            const textSimilarity = this.calculateTextSimilarity(context.sourceSummary, context.candidateSummary);
            score += textSimilarity * 0.4;
            factors++;
        } else if (context.sourceTranscript && context.candidateTranscript) {
            // Fallback to transcript similarity (less weight due to noise)
            const textSimilarity = this.calculateTextSimilarity(
                context.sourceTranscript.substring(0, 500), // First 500 chars
                context.candidateTranscript.substring(0, 500)
            );
            score += textSimilarity * 0.2;
            factors++;
        }

        // Normalize score by number of factors
        return factors > 0 ? score / factors : 0;
    }

    /**
     * Simple text similarity using keyword overlap
     */
    private calculateTextSimilarity(text1: string, text2: string): number {
        if (!text1 || !text2) return 0;

        const words1 = text1.toLowerCase().split(/\W+/).filter(w => w.length > 3);
        const words2 = text2.toLowerCase().split(/\W+/).filter(w => w.length > 3);

        const set1 = new Set(words1);
        const set2 = new Set(words2);

        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return union.size > 0 ? intersection.size / union.size : 0;
    }

    /**
     * Generate human-readable reason for recommendation
     */
    private generateReasonText(source: any, candidate: any, score: number): string {
        const reasons: string[] = [];

        if (source.format === candidate.format) {
            reasons.push(`same format (${source.format})`);
        }

        if (source.duration && candidate.duration) {
            const durationDiff = Math.abs(source.duration - candidate.duration);
            if (durationDiff < source.duration * 0.2) {
                reasons.push('similar duration');
            }
        }

        if (source.tags && candidate.tags) {
            const commonTags = source.tags.filter((tag: string) => candidate.tags.includes(tag));
            if (commonTags.length > 0) {
                reasons.push(`shared topics: ${commonTags.slice(0, 3).join(', ')}`);
            }
        }

        if (reasons.length === 0) {
            reasons.push('content similarity');
        }

        return `Recommended based on ${reasons.join(', ')} (${Math.round(score * 100)}% match)`;
    }

    /**
     * Build user preference profile from interactions
     */
    private buildUserProfile(interactions: any[]): any {
        const profile = {
            preferredFormats: new Map<string, number>(),
            preferredDurations: [] as number[],
            preferredTags: new Map<string, number>(),
            totalInteractions: interactions.length
        };

        for (const interaction of interactions) {
            const metadata = JSON.parse(interaction.metadata_json);
            const weight = this.getInteractionWeight(interaction.action);

            // Track format preferences
            if (metadata.format) {
                const current = profile.preferredFormats.get(metadata.format) || 0;
                profile.preferredFormats.set(metadata.format, current + weight);
            }

            // Track duration preferences
            if (metadata.duration) {
                profile.preferredDurations.push(metadata.duration);
            }

            // Track tag preferences
            if (metadata.tags && Array.isArray(metadata.tags)) {
                for (const tag of metadata.tags) {
                    const current = profile.preferredTags.get(tag) || 0;
                    profile.preferredTags.set(tag, current + weight);
                }
            }
        }

        return profile;
    }

    /**
     * Get interaction weight based on action type
     */
    private getInteractionWeight(action: string): number {
        const weights: Record<string, number> = {
            'play': 1.0,
            'complete': 2.0,
            'like': 1.5,
            'share': 1.8,
            'search_click': 0.8,
            'skip': -0.5
        };

        return weights[action] || 0.5;
    }

    /**
     * Find recommendations based on user profile
     */
    private async findRecommendationsForProfile(profile: any, userId: string, options: RecommendationOptions): Promise<RecommendationResult[]> {
        const db = getDatabase();
        const { topK = 10, minScore = 0.2 } = options;

        // Get watched media to exclude
        const watchedRows = db.prepare(`
            SELECT DISTINCT media_id 
            FROM user_interactions 
            WHERE user_id = ?
        `).all(userId) as Array<{ media_id: number }>;
        const watchedIds = watchedRows.map(row => row.media_id);

        // Get candidate media
        let excludeClause = '';
        let excludeParams: any[] = [];
        
        if (watchedIds.length > 0) {
            excludeClause = `WHERE mm.id NOT IN (${watchedIds.map(() => '?').join(',')})`;
            excludeParams = watchedIds;
        }

        const candidates = db.prepare(`
            SELECT mm.*, mt.summary
            FROM media_metadata mm
            LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
            ${excludeClause}
            ORDER BY mm.extracted_at DESC
            LIMIT 100
        `).all(...excludeParams) as any[];

        const recommendations: RecommendationResult[] = [];

        for (const candidate of candidates) {
            const metadata = JSON.parse(candidate.metadata_json);
            const score = this.calculateProfileMatchScore(profile, metadata);

            if (score >= minScore) {
                recommendations.push({
                    media_id: candidate.id,
                    score,
                    reason: `Matches your preferences (${Math.round(score * 100)}% match)`,
                    metadata: {
                        filename: metadata.filename,
                        duration: metadata.duration,
                        format: metadata.format,
                        file_path: candidate.file_path
                    }
                });
            }
        }

        recommendations.sort((a, b) => b.score - a.score);
        return recommendations.slice(0, topK);
    }

    /**
     * Calculate how well media matches user profile
     */
    private calculateProfileMatchScore(profile: any, metadata: any): number {
        let score = 0;
        let factors = 0;

        // Format preference
        if (metadata.format && profile.preferredFormats.has(metadata.format)) {
            const formatScore = profile.preferredFormats.get(metadata.format)! / profile.totalInteractions;
            score += formatScore * 0.4;
            factors++;
        }

        // Duration preference
        if (metadata.duration && profile.preferredDurations.length > 0) {
            const avgDuration = profile.preferredDurations.reduce((a, b) => a + b, 0) / profile.preferredDurations.length;
            const durationSimilarity = 1 - Math.abs(metadata.duration - avgDuration) / Math.max(metadata.duration, avgDuration);
            score += durationSimilarity * 0.3;
            factors++;
        }

        // Tag preferences
        if (metadata.tags && Array.isArray(metadata.tags)) {
            let tagScore = 0;
            for (const tag of metadata.tags) {
                if (profile.preferredTags.has(tag)) {
                    tagScore += profile.preferredTags.get(tag)! / profile.totalInteractions;
                }
            }
            score += Math.min(tagScore, 1.0) * 0.3;
            factors++;
        }

        return factors > 0 ? score / factors : 0;
    }

    /**
     * Get popular recommendations for new users
     */
    private async getPopularRecommendations(options: RecommendationOptions): Promise<RecommendationResponse> {
        const db = getDatabase();
        const { topK = 10 } = options;

        // Get most interacted-with media
        const popular = db.prepare(`
            SELECT mm.id as media_id, mm.metadata_json, mm.file_path,
                   COUNT(ui.id) as interaction_count
            FROM media_metadata mm
            LEFT JOIN user_interactions ui ON mm.id = ui.media_id
            GROUP BY mm.id
            ORDER BY interaction_count DESC, mm.extracted_at DESC
            LIMIT ?
        `).all(topK) as any[];

        const recommendations: RecommendationResult[] = popular.map((item, index) => {
            const metadata = JSON.parse(item.metadata_json);
            return {
                media_id: item.media_id,
                score: 1.0 - (index * 0.1), // Decreasing score by popularity rank
                reason: `Popular content (${item.interaction_count} interactions)`,
                metadata: {
                    filename: metadata.filename,
                    duration: metadata.duration,
                    format: metadata.format,
                    file_path: item.file_path
                }
            };
        });

        return {
            success: true,
            recommendations,
            algorithm_used: 'popularity',
            total_candidates: popular.length
        };
    }

    /**
     * Cache recommendations for future use
     */
    private async cacheRecommendations(sourceMediaId: number, recommendations: RecommendationResult[], type: string, userId?: string): Promise<void> {
        try {
            const db = getDatabase();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            for (const rec of recommendations) {
                db.run(`
                    INSERT OR REPLACE INTO content_recommendations 
                    (source_media_id, source_user_id, recommended_media_id, recommendation_type, score, reason, algorithm_version, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    sourceMediaId,
                    userId || null,
                    rec.media_id,
                    type,
                    rec.score,
                    rec.reason || null,
                    'v1.0',
                    expiresAt.toISOString()
                ]);
            }
        } catch (error) {
            await logger.warn('Failed to cache recommendations', {
                sourceMediaId,
                userId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Record user interaction for future recommendations
     */
    async recordUserInteraction(userId: string, mediaId: number, action: string, metadata?: any): Promise<void> {
        try {
            const db = getDatabase();
            
            db.run(`
                INSERT INTO user_interactions (user_id, media_id, action, timestamp, metadata)
                VALUES (?, ?, ?, ?, ?)
            `, [
                userId,
                mediaId,
                action,
                Date.now(),
                metadata ? JSON.stringify(metadata) : null
            ]);

            await logger.info('User interaction recorded', {
                userId,
                mediaId,
                action
            });
        } catch (error) {
            await logger.error('Failed to record user interaction', {
                userId,
                mediaId,
                action,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Check if the service is properly initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

// Export singleton instance
export const recommenderService = new RecommenderService();
