/**
 * Cross-Modal Intelligence Service
 * 
 * Implements Phase 2 of the roadmap: Cross-Modal Intelligence
 * - Search-Transcript-Tag Correlation
 * - Content Quality Correlation
 * - Cross-modal embedding generation
 * - Feedback loop between search behavior and tagging
 */

import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { ChromaClient } from 'chromadb';
import { config } from '../config';

export interface SearchTranscriptTagCorrelation {
    media_id: number;
    search_queries: string[];
    transcript_segments: TranscriptSegment[];
    current_tags: string[];
    suggested_tags: string[];
    correlation_score: number;
    confidence: number;
    improvement_potential: number;
}

export interface TranscriptSegment {
    text: string;
    start_time: number;
    end_time: number;
    relevance_score: number;
    matched_terms: string[];
}

export interface ContentQualityMetrics {
    media_id: number;
    engagement_score: number;
    search_discoverability: number;
    tag_accuracy: number;
    transcript_quality: number;
    overall_quality: number;
    improvement_suggestions: string[];
}

export interface CrossModalEmbedding {
    media_id: number;
    text_embedding: number[];
    audio_features?: number[];
    visual_features?: number[];
    metadata_features: number[];
    combined_embedding: number[];
    embedding_quality: number;
}

export interface SearchBehaviorPattern {
    query_pattern: string;
    successful_results: number[];
    failed_searches: string[];
    user_interactions: UserInteraction[];
    pattern_strength: number;
    suggested_improvements: TaggingImprovement[];
}

export interface UserInteraction {
    media_id: number;
    interaction_type: 'click' | 'view' | 'skip' | 'correct_tags' | 'rate';
    timestamp: string;
    duration_ms?: number;
    satisfaction_score?: number;
}

export interface TaggingImprovement {
    media_id: number;
    current_tags: string[];
    suggested_tags: string[];
    reason: string;
    confidence: number;
    expected_impact: number;
}

export class CrossModalIntelligenceService {
    private db: any;
    private chromaClient?: ChromaClient;

    constructor() {
        this.db = getDatabase();
        this.initializeChromaClient();
        try {
            this.initializeTables();
        } catch (error) {
            logger.warn('Failed to initialize cross-modal intelligence tables', { error });
        }
    }

    private async initializeChromaClient(): Promise<void> {
        try {
            this.chromaClient = new ChromaClient({
                path: config.services.chromadb.url
            });
        } catch (error) {
            logger.warn('ChromaDB not available for cross-modal intelligence', { error });
        }
    }

    /**
     * Initialize database tables for cross-modal intelligence
     */
    private initializeTables(): void {
        // Search behavior tracking
        this.db.run(`
            CREATE TABLE IF NOT EXISTS search_behavior (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                query TEXT NOT NULL,
                results_count INTEGER,
                clicked_media_ids TEXT, -- JSON array
                interaction_duration_ms INTEGER,
                satisfaction_score REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Content engagement metrics
        this.db.run(`
            CREATE TABLE IF NOT EXISTS content_engagement (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                view_count INTEGER DEFAULT 0,
                total_view_time_ms INTEGER DEFAULT 0,
                avg_view_duration_ms REAL DEFAULT 0,
                search_discovery_count INTEGER DEFAULT 0,
                tag_correction_count INTEGER DEFAULT 0,
                user_rating REAL,
                last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id)
            )
        `);

        // Cross-modal correlations
        this.db.run(`
            CREATE TABLE IF NOT EXISTS cross_modal_correlations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                correlation_type TEXT NOT NULL, -- 'search_transcript', 'search_tags', 'transcript_tags'
                source_text TEXT NOT NULL,
                target_text TEXT NOT NULL,
                correlation_score REAL NOT NULL,
                confidence REAL NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id)
            )
        `);

        // Content quality assessments
        this.db.run(`
            CREATE TABLE IF NOT EXISTS content_quality_assessments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                engagement_score REAL NOT NULL,
                discoverability_score REAL NOT NULL,
                tag_accuracy_score REAL NOT NULL,
                transcript_quality_score REAL NOT NULL,
                overall_quality_score REAL NOT NULL,
                improvement_suggestions TEXT, -- JSON array
                assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media_metadata (id)
            )
        `);

        // Create indexes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_search_behavior_query ON search_behavior(query)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_search_behavior_timestamp ON search_behavior(timestamp)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_content_engagement_media ON content_engagement(media_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_cross_modal_correlations_media ON cross_modal_correlations(media_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_content_quality_media ON content_quality_assessments(media_id)');
    }

    /**
     * Analyze search-transcript-tag correlations for a media item
     */
    async analyzeSearchTranscriptTagCorrelation(mediaId: number): Promise<SearchTranscriptTagCorrelation> {
        try {
            // Get media data
            const mediaData = await this.getMediaData(mediaId);
            if (!mediaData) {
                throw new Error(`Media ${mediaId} not found`);
            }

            // Get search queries that led to this media
            const searchQueries = await this.getSearchQueriesForMedia(mediaId);

            // Get transcript segments
            const transcriptSegments = await this.getRelevantTranscriptSegments(mediaId, searchQueries);

            // Get current tags
            const currentTags = await this.getCurrentTags(mediaId);

            // Analyze correlations and suggest improvements
            const correlationAnalysis = await this.calculateCorrelations(
                searchQueries,
                transcriptSegments,
                currentTags
            );

            const suggestedTags = await this.generateTagSuggestions(
                searchQueries,
                transcriptSegments,
                currentTags
            );

            return {
                media_id: mediaId,
                search_queries: searchQueries,
                transcript_segments: transcriptSegments,
                current_tags: currentTags,
                suggested_tags: suggestedTags,
                correlation_score: correlationAnalysis.overall_score,
                confidence: correlationAnalysis.confidence,
                improvement_potential: correlationAnalysis.improvement_potential
            };
        } catch (error) {
            logger.error('Failed to analyze search-transcript-tag correlation', { mediaId, error });
            throw error;
        }
    }

    /**
     * Assess content quality based on multiple factors
     */
    async assessContentQuality(mediaId: number): Promise<ContentQualityMetrics> {
        try {
            // Get engagement metrics
            const engagementScore = await this.calculateEngagementScore(mediaId);

            // Calculate search discoverability
            const discoverabilityScore = await this.calculateDiscoverabilityScore(mediaId);

            // Assess tag accuracy
            const tagAccuracyScore = await this.calculateTagAccuracyScore(mediaId);

            // Evaluate transcript quality
            const transcriptQualityScore = await this.calculateTranscriptQualityScore(mediaId);

            // Calculate overall quality score
            const overallQuality = (
                engagementScore * 0.3 +
                discoverabilityScore * 0.25 +
                tagAccuracyScore * 0.25 +
                transcriptQualityScore * 0.2
            );

            // Generate improvement suggestions
            const improvementSuggestions = await this.generateImprovementSuggestions(
                mediaId,
                {
                    engagement: engagementScore,
                    discoverability: discoverabilityScore,
                    tagAccuracy: tagAccuracyScore,
                    transcriptQuality: transcriptQualityScore
                }
            );

            const qualityMetrics: ContentQualityMetrics = {
                media_id: mediaId,
                engagement_score: engagementScore,
                search_discoverability: discoverabilityScore,
                tag_accuracy: tagAccuracyScore,
                transcript_quality: transcriptQualityScore,
                overall_quality: overallQuality,
                improvement_suggestions: improvementSuggestions
            };

            // Store assessment in database
            await this.storeQualityAssessment(qualityMetrics);

            return qualityMetrics;
        } catch (error) {
            logger.error('Failed to assess content quality', { mediaId, error });
            throw error;
        }
    }

    /**
     * Generate cross-modal embeddings combining multiple modalities
     */
    async generateCrossModalEmbedding(mediaId: number): Promise<CrossModalEmbedding> {
        try {
            if (!this.chromaClient) {
                throw new Error('ChromaDB not available');
            }

            // Get text content (transcript + tags + metadata)
            const textContent = await this.getTextContent(mediaId);
            const textEmbedding = await this.generateTextEmbedding(textContent);

            // Get metadata features
            const metadataFeatures = await this.extractMetadataFeatures(mediaId);

            // For now, we'll focus on text and metadata
            // Audio and visual features would require additional ML models
            const combinedEmbedding = this.combineEmbeddings([textEmbedding, metadataFeatures]);

            // Calculate embedding quality
            const embeddingQuality = await this.calculateEmbeddingQuality(combinedEmbedding, mediaId);

            const crossModalEmbedding: CrossModalEmbedding = {
                media_id: mediaId,
                text_embedding: textEmbedding,
                metadata_features: metadataFeatures,
                combined_embedding: combinedEmbedding,
                embedding_quality: embeddingQuality
            };

            // Store in ChromaDB
            await this.storeCrossModalEmbedding(crossModalEmbedding);

            return crossModalEmbedding;
        } catch (error) {
            logger.error('Failed to generate cross-modal embedding', { mediaId, error });
            throw error;
        }
    }

    /**
     * Track search behavior and learn from user interactions
     */
    async trackSearchBehavior(
        sessionId: string,
        query: string,
        results: any[],
        userInteractions: UserInteraction[]
    ): Promise<void> {
        try {
            // Calculate interaction metrics
            const clickedMediaIds = userInteractions
                .filter(i => i.interaction_type === 'click')
                .map(i => i.media_id);

            const totalDuration = userInteractions
                .reduce((sum, i) => sum + (i.duration_ms || 0), 0);

            const satisfactionScore = this.calculateSatisfactionScore(userInteractions);

            // Store search behavior
            this.db.run(`
                INSERT INTO search_behavior (
                    session_id, query, results_count, clicked_media_ids,
                    interaction_duration_ms, satisfaction_score
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
                sessionId,
                query,
                results.length,
                JSON.stringify(clickedMediaIds),
                totalDuration,
                satisfactionScore
            ]);

            // Update content engagement for clicked items
            for (const interaction of userInteractions) {
                await this.updateContentEngagement(interaction);
            }

            // Analyze patterns and generate improvements
            await this.analyzeSearchPatterns(query, clickedMediaIds, satisfactionScore);

            logger.info('Search behavior tracked', {
                sessionId,
                query,
                resultsCount: results.length,
                interactions: userInteractions.length,
                satisfactionScore
            });
        } catch (error) {
            logger.error('Failed to track search behavior', { sessionId, query, error });
            throw error;
        }
    }

    /**
     * Analyze search patterns and generate tagging improvements
     */
    async analyzeSearchPatterns(
        query: string,
        clickedMediaIds: number[],
        satisfactionScore: number
    ): Promise<SearchBehaviorPattern[]> {
        try {
            const patterns: SearchBehaviorPattern[] = [];

            // Find similar successful searches
            const similarSearches = this.db.prepare(`
                SELECT query, clicked_media_ids, satisfaction_score
                FROM search_behavior
                WHERE query LIKE ? AND satisfaction_score >= 0.7
                ORDER BY satisfaction_score DESC
                LIMIT 10
            `).all(`%${query.split(' ')[0]}%`) as any[];

            // Analyze successful patterns
            for (const search of similarSearches) {
                const successfulMediaIds = JSON.parse(search.clicked_media_ids || '[]');
                
                if (successfulMediaIds.length > 0) {
                    const improvements = await this.generateTaggingImprovements(
                        query,
                        successfulMediaIds,
                        clickedMediaIds
                    );

                    patterns.push({
                        query_pattern: search.query,
                        successful_results: successfulMediaIds,
                        failed_searches: [],
                        user_interactions: [],
                        pattern_strength: search.satisfaction_score,
                        suggested_improvements: improvements
                    });
                }
            }

            return patterns;
        } catch (error) {
            logger.error('Failed to analyze search patterns', { query, error });
            throw error;
        }
    }

    /**
     * Get media data including metadata, transcript, and tags
     */
    private async getMediaData(mediaId: number): Promise<any> {
        return this.db.prepare(`
            SELECT mm.*, mt.transcript_text, mtags.tags_json
            FROM media_metadata mm
            LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
            LEFT JOIN media_tags mtags ON mm.id = mtags.media_id
            WHERE mm.id = ?
        `).get(mediaId);
    }

    /**
     * Get search queries that led to discovering this media
     */
    private async getSearchQueriesForMedia(mediaId: number): Promise<string[]> {
        const searches = this.db.prepare(`
            SELECT DISTINCT query
            FROM search_behavior
            WHERE clicked_media_ids LIKE ?
            ORDER BY timestamp DESC
            LIMIT 20
        `).all(`%${mediaId}%`) as { query: string }[];

        return searches.map(s => s.query);
    }

    /**
     * Get relevant transcript segments based on search queries
     */
    private async getRelevantTranscriptSegments(
        mediaId: number,
        searchQueries: string[]
    ): Promise<TranscriptSegment[]> {
        const transcript = this.db.prepare(`
            SELECT transcript_text, chunks_json
            FROM media_transcripts
            WHERE media_id = ?
        `).get(mediaId) as { transcript_text: string; chunks_json: string } | undefined;

        if (!transcript) return [];

        const segments: TranscriptSegment[] = [];
        const chunks = JSON.parse(transcript.chunks_json || '[]');

        for (const query of searchQueries) {
            const queryTerms = query.toLowerCase().split(' ');

            for (const chunk of chunks) {
                const chunkText = chunk.text.toLowerCase();
                const matchedTerms = queryTerms.filter(term => chunkText.includes(term));

                if (matchedTerms.length > 0) {
                    const relevanceScore = matchedTerms.length / queryTerms.length;

                    segments.push({
                        text: chunk.text,
                        start_time: chunk.start || 0,
                        end_time: chunk.end || 0,
                        relevance_score: relevanceScore,
                        matched_terms: matchedTerms
                    });
                }
            }
        }

        // Sort by relevance and return top segments
        return segments
            .sort((a, b) => b.relevance_score - a.relevance_score)
            .slice(0, 10);
    }

    /**
     * Get current tags for media
     */
    private async getCurrentTags(mediaId: number): Promise<string[]> {
        const tagData = this.db.prepare(`
            SELECT tags_json FROM media_tags WHERE media_id = ?
        `).get(mediaId) as { tags_json: string } | undefined;

        if (!tagData) return [];

        try {
            return JSON.parse(tagData.tags_json || '[]');
        } catch {
            return [];
        }
    }

    /**
     * Calculate correlations between search, transcript, and tags
     */
    private async calculateCorrelations(
        searchQueries: string[],
        transcriptSegments: TranscriptSegment[],
        currentTags: string[]
    ): Promise<{ overall_score: number; confidence: number; improvement_potential: number }> {
        let totalScore = 0;
        let correlationCount = 0;

        // Search-Transcript correlation
        for (const query of searchQueries) {
            const queryTerms = query.toLowerCase().split(' ');
            const transcriptText = transcriptSegments.map(s => s.text).join(' ').toLowerCase();

            const matchingTerms = queryTerms.filter(term => transcriptText.includes(term));
            const searchTranscriptScore = matchingTerms.length / queryTerms.length;

            totalScore += searchTranscriptScore;
            correlationCount++;
        }

        // Search-Tags correlation
        for (const query of searchQueries) {
            const queryTerms = query.toLowerCase().split(' ');
            const tagText = currentTags.join(' ').toLowerCase();

            const matchingTerms = queryTerms.filter(term => tagText.includes(term));
            const searchTagScore = matchingTerms.length / queryTerms.length;

            totalScore += searchTagScore;
            correlationCount++;
        }

        // Transcript-Tags correlation
        const transcriptText = transcriptSegments.map(s => s.text).join(' ').toLowerCase();
        const tagText = currentTags.join(' ').toLowerCase();

        let transcriptTagScore = 0;
        if (currentTags.length > 0) {
            const matchingTags = currentTags.filter(tag =>
                transcriptText.includes(tag.toLowerCase())
            );
            transcriptTagScore = matchingTags.length / currentTags.length;
        }

        totalScore += transcriptTagScore;
        correlationCount++;

        const overallScore = correlationCount > 0 ? totalScore / correlationCount : 0;
        const confidence = Math.min(0.95, correlationCount / 10); // Higher confidence with more data
        const improvementPotential = 1 - overallScore; // How much room for improvement

        return {
            overall_score: overallScore,
            confidence: confidence,
            improvement_potential: improvementPotential
        };
    }

    /**
     * Generate tag suggestions based on search and transcript analysis
     */
    private async generateTagSuggestions(
        searchQueries: string[],
        transcriptSegments: TranscriptSegment[],
        currentTags: string[]
    ): Promise<string[]> {
        const suggestions = new Set<string>();

        // Extract important terms from search queries
        for (const query of searchQueries) {
            const terms = query.split(' ').filter(term => term.length > 2);
            terms.forEach(term => suggestions.add(term.toLowerCase()));
        }

        // Extract important terms from transcript segments
        for (const segment of transcriptSegments) {
            if (segment.relevance_score > 0.5) {
                const words = segment.text.split(' ')
                    .filter(word => word.length > 3)
                    .filter(word => !/^(the|and|but|for|are|was|were|been|have|has|had|will|would|could|should)$/i.test(word));

                words.forEach(word => suggestions.add(word.toLowerCase()));
            }
        }

        // Remove existing tags and common words
        const existingTagsLower = currentTags.map(tag => tag.toLowerCase());
        const filteredSuggestions = Array.from(suggestions)
            .filter(suggestion => !existingTagsLower.includes(suggestion))
            .filter(suggestion => suggestion.length > 2)
            .slice(0, 10); // Limit to top 10 suggestions

        return filteredSuggestions;
    }

    /**
     * Calculate engagement score based on user interactions
     */
    private async calculateEngagementScore(mediaId: number): Promise<number> {
        const engagement = this.db.prepare(`
            SELECT view_count, avg_view_duration_ms, user_rating
            FROM content_engagement
            WHERE media_id = ?
        `).get(mediaId) as { view_count: number; avg_view_duration_ms: number; user_rating: number } | undefined;

        if (!engagement) return 0;

        // Normalize metrics (simplified scoring)
        const viewScore = Math.min(1, engagement.view_count / 10); // Max score at 10 views
        const durationScore = Math.min(1, engagement.avg_view_duration_ms / 300000); // Max score at 5 minutes
        const ratingScore = engagement.user_rating ? engagement.user_rating / 5 : 0.5; // Default neutral

        return (viewScore * 0.4 + durationScore * 0.4 + ratingScore * 0.2);
    }

    /**
     * Calculate search discoverability score
     */
    private async calculateDiscoverabilityScore(mediaId: number): Promise<number> {
        const searchData = this.db.prepare(`
            SELECT search_discovery_count
            FROM content_engagement
            WHERE media_id = ?
        `).get(mediaId) as { search_discovery_count: number } | undefined;

        if (!searchData) return 0;

        // Score based on how often this content is discovered through search
        return Math.min(1, searchData.search_discovery_count / 20); // Max score at 20 discoveries
    }

    /**
     * Calculate tag accuracy score based on user corrections
     */
    private async calculateTagAccuracyScore(mediaId: number): Promise<number> {
        const corrections = this.db.prepare(`
            SELECT COUNT(*) as correction_count
            FROM user_feedback
            WHERE media_id = ? AND feedback_type = 'tag_correction'
        `).get(mediaId) as { correction_count: number };

        const engagement = this.db.prepare(`
            SELECT view_count
            FROM content_engagement
            WHERE media_id = ?
        `).get(mediaId) as { view_count: number } | undefined;

        const viewCount = engagement?.view_count || 1;
        const correctionRate = corrections.correction_count / viewCount;

        // Lower correction rate = higher accuracy
        return Math.max(0, 1 - correctionRate);
    }

    /**
     * Calculate transcript quality score
     */
    private async calculateTranscriptQualityScore(mediaId: number): Promise<number> {
        const transcript = this.db.prepare(`
            SELECT transcript_text, confidence_score
            FROM media_transcripts
            WHERE media_id = ?
        `).get(mediaId) as { transcript_text: string; confidence_score: number } | undefined;

        if (!transcript) return 0;

        // Basic quality metrics
        const textLength = transcript.transcript_text.length;
        const wordCount = transcript.transcript_text.split(' ').length;
        const avgWordLength = textLength / wordCount;

        // Quality indicators
        const lengthScore = Math.min(1, textLength / 1000); // Reasonable length
        const wordScore = avgWordLength > 3 && avgWordLength < 8 ? 1 : 0.5; // Reasonable word length
        const confidenceScore = transcript.confidence_score || 0.5;

        return (lengthScore * 0.4 + wordScore * 0.3 + confidenceScore * 0.3);
    }

    /**
     * Generate improvement suggestions based on quality scores
     */
    private async generateImprovementSuggestions(
        mediaId: number,
        scores: { engagement: number; discoverability: number; tagAccuracy: number; transcriptQuality: number }
    ): Promise<string[]> {
        const suggestions: string[] = [];

        if (scores.engagement < 0.5) {
            suggestions.push('Improve content engagement by enhancing title and description');
        }

        if (scores.discoverability < 0.5) {
            suggestions.push('Add more relevant tags to improve search discoverability');
        }

        if (scores.tagAccuracy < 0.7) {
            suggestions.push('Review and correct tags based on user feedback');
        }

        if (scores.transcriptQuality < 0.6) {
            suggestions.push('Consider re-transcribing with higher quality settings');
        }

        // Cross-modal suggestions
        const correlation = await this.analyzeSearchTranscriptTagCorrelation(mediaId);
        if (correlation.improvement_potential > 0.5) {
            suggestions.push('Improve tag-transcript alignment for better search results');
        }

        return suggestions;
    }

    /**
     * Store quality assessment in database
     */
    private async storeQualityAssessment(metrics: ContentQualityMetrics): Promise<void> {
        this.db.run(`
            INSERT OR REPLACE INTO content_quality_assessments (
                media_id, engagement_score, discoverability_score, tag_accuracy_score,
                transcript_quality_score, overall_quality_score, improvement_suggestions
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            metrics.media_id,
            metrics.engagement_score,
            metrics.search_discoverability,
            metrics.tag_accuracy,
            metrics.transcript_quality,
            metrics.overall_quality,
            JSON.stringify(metrics.improvement_suggestions)
        ]);
    }

    /**
     * Get text content for embedding generation
     */
    private async getTextContent(mediaId: number): Promise<string> {
        const data = await this.getMediaData(mediaId);
        if (!data) return '';

        const parts: string[] = [];

        // Add transcript
        if (data.transcript_text) {
            parts.push(data.transcript_text);
        }

        // Add tags
        if (data.tags_json) {
            try {
                const tags = JSON.parse(data.tags_json);
                parts.push(tags.join(' '));
            } catch {
                // Ignore invalid JSON
            }
        }

        // Add metadata
        if (data.metadata_json) {
            try {
                const metadata = JSON.parse(data.metadata_json);
                if (metadata.title) parts.push(metadata.title);
                if (metadata.description) parts.push(metadata.description);
            } catch {
                // Ignore invalid JSON
            }
        }

        return parts.join(' ');
    }

    /**
     * Generate text embedding (placeholder - would use actual embedding model)
     */
    private async generateTextEmbedding(text: string): Promise<number[]> {
        // Placeholder implementation - in real system would use embedding model
        const words = text.toLowerCase().split(' ');
        const embedding = new Array(384).fill(0); // Standard embedding size

        // Simple hash-based embedding for demonstration
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const hash = this.simpleHash(word);
            const index = Math.abs(hash) % embedding.length;
            embedding[index] += 1 / words.length;
        }

        return embedding;
    }

    /**
     * Extract metadata features
     */
    private async extractMetadataFeatures(mediaId: number): Promise<number[]> {
        const data = await this.getMediaData(mediaId);
        const features = new Array(64).fill(0); // Smaller feature vector for metadata

        if (data?.metadata_json) {
            try {
                const metadata = JSON.parse(data.metadata_json);

                // Duration feature
                if (metadata.duration) {
                    features[0] = Math.min(1, metadata.duration / 3600); // Normalize to hours
                }

                // File size feature
                if (metadata.size) {
                    features[1] = Math.min(1, metadata.size / (1024 * 1024 * 1024)); // Normalize to GB
                }

                // Quality features
                if (metadata.width && metadata.height) {
                    features[2] = Math.min(1, (metadata.width * metadata.height) / (1920 * 1080)); // Normalize to 1080p
                }

                // Add more features as needed
            } catch {
                // Ignore invalid JSON
            }
        }

        return features;
    }

    /**
     * Combine multiple embeddings
     */
    private combineEmbeddings(embeddings: number[][]): number[] {
        if (embeddings.length === 0) return [];

        const combinedLength = embeddings.reduce((sum, emb) => sum + emb.length, 0);
        const combined = new Array(combinedLength).fill(0);

        let offset = 0;
        for (const embedding of embeddings) {
            for (let i = 0; i < embedding.length; i++) {
                combined[offset + i] = embedding[i];
            }
            offset += embedding.length;
        }

        return combined;
    }

    /**
     * Calculate embedding quality
     */
    private async calculateEmbeddingQuality(embedding: number[], mediaId: number): Promise<number> {
        // Simple quality metrics
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        const sparsity = embedding.filter(val => Math.abs(val) < 0.001).length / embedding.length;

        // Quality score based on magnitude and sparsity
        const magnitudeScore = Math.min(1, magnitude / 10);
        const sparsityScore = 1 - sparsity; // Lower sparsity is better

        return (magnitudeScore + sparsityScore) / 2;
    }

    /**
     * Store cross-modal embedding in ChromaDB
     */
    private async storeCrossModalEmbedding(embedding: CrossModalEmbedding): Promise<void> {
        if (!this.chromaClient) return;

        try {
            const collection = await this.chromaClient.getOrCreateCollection({
                name: 'cross_modal_embeddings'
            });

            await collection.add({
                ids: [`media_${embedding.media_id}`],
                embeddings: [embedding.combined_embedding],
                metadatas: [{
                    media_id: embedding.media_id,
                    embedding_quality: embedding.embedding_quality,
                    created_at: new Date().toISOString()
                }]
            });
        } catch (error) {
            logger.error('Failed to store cross-modal embedding', { mediaId: embedding.media_id, error });
        }
    }

    /**
     * Calculate satisfaction score from user interactions
     */
    private calculateSatisfactionScore(interactions: UserInteraction[]): number {
        if (interactions.length === 0) return 0.5;

        let totalScore = 0;
        let scoreCount = 0;

        for (const interaction of interactions) {
            switch (interaction.interaction_type) {
                case 'click':
                    totalScore += 0.7;
                    scoreCount++;
                    break;
                case 'view':
                    const viewScore = interaction.duration_ms ?
                        Math.min(1, interaction.duration_ms / 60000) : 0.5; // Normalize to 1 minute
                    totalScore += viewScore;
                    scoreCount++;
                    break;
                case 'skip':
                    totalScore += 0.2;
                    scoreCount++;
                    break;
                case 'correct_tags':
                    totalScore += 0.3; // Indicates content was relevant but tags were wrong
                    scoreCount++;
                    break;
                case 'rate':
                    if (interaction.satisfaction_score) {
                        totalScore += interaction.satisfaction_score / 5;
                        scoreCount++;
                    }
                    break;
            }
        }

        return scoreCount > 0 ? totalScore / scoreCount : 0.5;
    }

    /**
     * Update content engagement metrics
     */
    private async updateContentEngagement(interaction: UserInteraction): Promise<void> {
        // Get current engagement data
        const current = this.db.prepare(`
            SELECT * FROM content_engagement WHERE media_id = ?
        `).get(interaction.media_id) as any;

        if (current) {
            // Update existing record
            const newViewCount = current.view_count + (interaction.interaction_type === 'view' ? 1 : 0);
            const newTotalTime = current.total_view_time_ms + (interaction.duration_ms || 0);
            const newAvgDuration = newViewCount > 0 ? newTotalTime / newViewCount : 0;

            this.db.run(`
                UPDATE content_engagement
                SET view_count = ?, total_view_time_ms = ?, avg_view_duration_ms = ?,
                    search_discovery_count = search_discovery_count + ?,
                    tag_correction_count = tag_correction_count + ?,
                    user_rating = COALESCE(?, user_rating),
                    last_accessed = CURRENT_TIMESTAMP
                WHERE media_id = ?
            `, [
                newViewCount,
                newTotalTime,
                newAvgDuration,
                interaction.interaction_type === 'click' ? 1 : 0,
                interaction.interaction_type === 'correct_tags' ? 1 : 0,
                interaction.satisfaction_score,
                interaction.media_id
            ]);
        } else {
            // Create new record
            this.db.run(`
                INSERT INTO content_engagement (
                    media_id, view_count, total_view_time_ms, avg_view_duration_ms,
                    search_discovery_count, tag_correction_count, user_rating
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                interaction.media_id,
                interaction.interaction_type === 'view' ? 1 : 0,
                interaction.duration_ms || 0,
                interaction.duration_ms || 0,
                interaction.interaction_type === 'click' ? 1 : 0,
                interaction.interaction_type === 'correct_tags' ? 1 : 0,
                interaction.satisfaction_score
            ]);
        }
    }

    /**
     * Generate tagging improvements based on successful search patterns
     */
    private async generateTaggingImprovements(
        query: string,
        successfulMediaIds: number[],
        currentMediaIds: number[]
    ): Promise<TaggingImprovement[]> {
        const improvements: TaggingImprovement[] = [];

        // Analyze tags from successful results
        const successfulTags = new Set<string>();
        for (const mediaId of successfulMediaIds) {
            const tags = await this.getCurrentTags(mediaId);
            tags.forEach(tag => successfulTags.add(tag.toLowerCase()));
        }

        // Check current results for missing tags
        for (const mediaId of currentMediaIds) {
            const currentTags = await this.getCurrentTags(mediaId);
            const currentTagsLower = currentTags.map(tag => tag.toLowerCase());

            const missingTags = Array.from(successfulTags)
                .filter(tag => !currentTagsLower.includes(tag))
                .slice(0, 5); // Limit suggestions

            if (missingTags.length > 0) {
                improvements.push({
                    media_id: mediaId,
                    current_tags: currentTags,
                    suggested_tags: missingTags,
                    reason: `Based on successful searches for "${query}"`,
                    confidence: 0.7,
                    expected_impact: missingTags.length / 10 // Simple impact estimation
                });
            }
        }

        return improvements;
    }

    /**
     * Simple hash function for text
     */
    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }
}
