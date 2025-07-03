/**
 * Content Engagement Service
 * 
 * Tracks and analyzes content engagement metrics for cross-modal intelligence.
 * Complements the CrossModalIntelligenceService with detailed engagement tracking.
 */

import { getDatabase } from '../db';
import { logger } from '../utils/logger';

export interface EngagementMetrics {
    media_id: number;
    total_views: number;
    unique_viewers: number;
    avg_view_duration: number;
    completion_rate: number;
    search_discovery_rate: number;
    tag_correction_rate: number;
    user_satisfaction: number;
    trending_score: number;
}

export interface ViewSession {
    session_id: string;
    media_id: number;
    user_id?: string;
    start_time: string;
    end_time?: string;
    duration_ms: number;
    completion_percentage: number;
    interaction_events: InteractionEvent[];
}

export interface InteractionEvent {
    event_type: 'play' | 'pause' | 'seek' | 'skip' | 'rate' | 'tag_edit' | 'share';
    timestamp: string;
    position_ms?: number;
    value?: any;
}

export interface ContentTrend {
    media_id: number;
    trend_type: 'rising' | 'declining' | 'stable' | 'viral';
    trend_score: number;
    period_days: number;
    growth_rate: number;
    factors: string[];
}

export interface EngagementInsight {
    insight_type: 'high_engagement' | 'low_engagement' | 'discovery_issue' | 'quality_issue';
    media_ids: number[];
    description: string;
    confidence: number;
    suggested_actions: string[];
    impact_estimate: number;
}

export class ContentEngagementService {
    private db: any;

    constructor() {
        this.db = getDatabase();
        // Tables are now created in the main database initialization
        // No need to create them here
    }

    /**
     * Track a view session
     */
    async trackViewSession(session: ViewSession): Promise<void> {
        try {
            this.db.run(`
                INSERT OR REPLACE INTO view_sessions (
                    session_id, media_id, user_id, start_time, end_time,
                    duration_ms, completion_percentage, interaction_events
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                session.session_id,
                session.media_id,
                session.user_id,
                session.start_time,
                session.end_time,
                session.duration_ms,
                session.completion_percentage,
                JSON.stringify(session.interaction_events)
            ]);

            // Update daily analytics
            await this.updateDailyAnalytics(session.media_id, session);

            logger.info('View session tracked', {
                sessionId: session.session_id,
                mediaId: session.media_id,
                duration: session.duration_ms,
                completion: session.completion_percentage
            });
        } catch (error) {
            logger.error('Failed to track view session', { session, error });
            throw error;
        }
    }

    /**
     * Get engagement metrics for a media item
     */
    async getEngagementMetrics(mediaId: number, days: number = 30): Promise<EngagementMetrics> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            // Get aggregated metrics
            const metrics = this.db.prepare(`
                SELECT 
                    COUNT(*) as total_views,
                    COUNT(DISTINCT user_id) as unique_viewers,
                    AVG(duration_ms) as avg_view_duration,
                    AVG(completion_percentage) as completion_rate
                FROM view_sessions
                WHERE media_id = ? AND start_time >= ?
            `).get(mediaId, cutoffDate.toISOString()) as any;

            // Get search discovery rate
            const searchDiscoveries = this.db.prepare(`
                SELECT COUNT(*) as discoveries
                FROM search_behavior
                WHERE clicked_media_ids LIKE ? AND timestamp >= ?
            `).get(`%${mediaId}%`, cutoffDate.toISOString()) as { discoveries: number };

            // Get tag correction rate
            const tagCorrections = this.db.prepare(`
                SELECT COUNT(*) as corrections
                FROM user_feedback
                WHERE media_id = ? AND feedback_type = 'tag_correction' AND timestamp >= ?
            `).get(mediaId, cutoffDate.toISOString()) as { corrections: number };

            // Get user satisfaction
            const satisfaction = this.db.prepare(`
                SELECT AVG(user_ratings_sum / user_ratings_count) as avg_rating
                FROM engagement_analytics
                WHERE media_id = ? AND date >= ? AND user_ratings_count > 0
            `).get(mediaId, cutoffDate.toISOString().split('T')[0]) as { avg_rating: number };

            // Calculate trending score
            const trendingScore = await this.calculateTrendingScore(mediaId, days);

            return {
                media_id: mediaId,
                total_views: metrics.total_views || 0,
                unique_viewers: metrics.unique_viewers || 0,
                avg_view_duration: metrics.avg_view_duration || 0,
                completion_rate: (metrics.completion_rate || 0) / 100,
                search_discovery_rate: searchDiscoveries.discoveries / Math.max(1, metrics.total_views),
                tag_correction_rate: tagCorrections.corrections / Math.max(1, metrics.total_views),
                user_satisfaction: satisfaction.avg_rating || 0,
                trending_score: trendingScore
            };
        } catch (error) {
            logger.error('Failed to get engagement metrics', { mediaId, error });
            throw error;
        }
    }

    /**
     * Analyze content trends
     */
    async analyzeContentTrends(days: number = 7): Promise<ContentTrend[]> {
        try {
            const trends: ContentTrend[] = [];

            // Get media with sufficient data
            const mediaWithData = this.db.prepare(`
                SELECT DISTINCT media_id
                FROM engagement_analytics
                WHERE date >= DATE('now', '-${days} days')
                GROUP BY media_id
                HAVING COUNT(*) >= ?
            `).all(Math.min(days, 3)) as { media_id: number }[];

            for (const { media_id } of mediaWithData) {
                const trend = await this.calculateTrendForMedia(media_id, days);
                if (trend) {
                    trends.push(trend);
                }
            }

            // Store trends in database
            for (const trend of trends) {
                await this.storeTrend(trend);
            }

            return trends.sort((a, b) => Math.abs(b.trend_score) - Math.abs(a.trend_score));
        } catch (error) {
            logger.error('Failed to analyze content trends', { error });
            throw error;
        }
    }

    /**
     * Generate engagement insights
     */
    async generateEngagementInsights(days: number = 30): Promise<EngagementInsight[]> {
        try {
            const insights: EngagementInsight[] = [];

            // High engagement content
            const highEngagement = await this.findHighEngagementContent(days);
            if (highEngagement.length > 0) {
                insights.push({
                    insight_type: 'high_engagement',
                    media_ids: highEngagement,
                    description: `${highEngagement.length} pieces of content showing exceptional engagement`,
                    confidence: 0.9,
                    suggested_actions: [
                        'Analyze successful content patterns',
                        'Create similar content',
                        'Promote high-performing content'
                    ],
                    impact_estimate: 0.8
                });
            }

            // Low engagement content
            const lowEngagement = await this.findLowEngagementContent(days);
            if (lowEngagement.length > 0) {
                insights.push({
                    insight_type: 'low_engagement',
                    media_ids: lowEngagement,
                    description: `${lowEngagement.length} pieces of content with low engagement`,
                    confidence: 0.8,
                    suggested_actions: [
                        'Review and improve tags',
                        'Enhance content descriptions',
                        'Consider content quality improvements'
                    ],
                    impact_estimate: 0.6
                });
            }

            // Discovery issues
            const discoveryIssues = await this.findDiscoveryIssues(days);
            if (discoveryIssues.length > 0) {
                insights.push({
                    insight_type: 'discovery_issue',
                    media_ids: discoveryIssues,
                    description: `${discoveryIssues.length} pieces of content with poor search discoverability`,
                    confidence: 0.7,
                    suggested_actions: [
                        'Improve search tags',
                        'Enhance metadata',
                        'Review transcript quality'
                    ],
                    impact_estimate: 0.7
                });
            }

            return insights;
        } catch (error) {
            logger.error('Failed to generate engagement insights', { error });
            throw error;
        }
    }

    /**
     * Update daily analytics for a media item
     */
    private async updateDailyAnalytics(mediaId: number, session: ViewSession): Promise<void> {
        const today = new Date().toISOString().split('T')[0];

        // Get current analytics for today
        const current = this.db.prepare(`
            SELECT * FROM engagement_analytics WHERE media_id = ? AND date = ?
        `).get(mediaId, today) as any;

        if (current) {
            // Update existing record
            const newViewsCount = current.views_count + 1;
            const newUniqueViewers = session.user_id ? 
                current.unique_viewers + (current.unique_viewers === 0 ? 1 : 0) : 
                current.unique_viewers;
            const newTotalWatchTime = current.total_watch_time_ms + session.duration_ms;
            const newAvgCompletion = (current.avg_completion_rate * current.views_count + session.completion_percentage) / newViewsCount;

            this.db.run(`
                UPDATE engagement_analytics 
                SET views_count = ?, unique_viewers = ?, total_watch_time_ms = ?, avg_completion_rate = ?
                WHERE media_id = ? AND date = ?
            `, [newViewsCount, newUniqueViewers, newTotalWatchTime, newAvgCompletion, mediaId, today]);
        } else {
            // Create new record
            this.db.run(`
                INSERT INTO engagement_analytics (
                    media_id, date, views_count, unique_viewers, total_watch_time_ms, avg_completion_rate
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [mediaId, today, 1, session.user_id ? 1 : 0, session.duration_ms, session.completion_percentage]);
        }
    }

    /**
     * Calculate trending score for a media item
     */
    private async calculateTrendingScore(mediaId: number, days: number): Promise<number> {
        const recentViews = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM view_sessions
            WHERE media_id = ? AND start_time >= DATE('now', '-${Math.floor(days/2)} days')
        `).get(mediaId) as { count: number };

        const olderViews = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM view_sessions
            WHERE media_id = ? 
            AND start_time >= DATE('now', '-${days} days')
            AND start_time < DATE('now', '-${Math.floor(days/2)} days')
        `).get(mediaId) as { count: number };

        if (olderViews.count === 0) {
            return recentViews.count > 0 ? 1.0 : 0.0;
        }

        const growthRate = (recentViews.count - olderViews.count) / olderViews.count;
        return Math.max(-1, Math.min(1, growthRate));
    }

    /**
     * Calculate trend for specific media
     */
    private async calculateTrendForMedia(mediaId: number, days: number): Promise<ContentTrend | null> {
        const analytics = this.db.prepare(`
            SELECT date, views_count, avg_completion_rate
            FROM engagement_analytics
            WHERE media_id = ? AND date >= DATE('now', '-${days} days')
            ORDER BY date
        `).all(mediaId) as any[];

        if (analytics.length < 3) return null;

        // Calculate trend metrics
        const viewCounts = analytics.map(a => a.views_count);
        const completionRates = analytics.map(a => a.avg_completion_rate);

        const viewTrend = this.calculateLinearTrend(viewCounts);
        const completionTrend = this.calculateLinearTrend(completionRates);

        const trendScore = (viewTrend + completionTrend) / 2;
        const growthRate = viewCounts.length > 1 ? 
            (viewCounts[viewCounts.length - 1] - viewCounts[0]) / Math.max(1, viewCounts[0]) : 0;

        let trendType: ContentTrend['trend_type'];
        if (Math.abs(trendScore) < 0.1) trendType = 'stable';
        else if (trendScore > 0.5) trendType = 'viral';
        else if (trendScore > 0) trendType = 'rising';
        else trendType = 'declining';

        return {
            media_id: mediaId,
            trend_type: trendType,
            trend_score: trendScore,
            period_days: days,
            growth_rate: growthRate,
            factors: this.identifyTrendFactors(trendScore, viewTrend, completionTrend)
        };
    }

    /**
     * Calculate linear trend from data points
     */
    private calculateLinearTrend(values: number[]): number {
        if (values.length < 2) return 0;

        const n = values.length;
        const sumX = (n * (n - 1)) / 2; // Sum of indices 0, 1, 2, ...
        const sumY = values.reduce((sum, val) => sum + val, 0);
        const sumXY = values.reduce((sum, val, idx) => sum + idx * val, 0);
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squares of indices

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }

    /**
     * Identify factors contributing to trends
     */
    private identifyTrendFactors(trendScore: number, viewTrend: number, completionTrend: number): string[] {
        const factors: string[] = [];

        if (viewTrend > 0.1) factors.push('increasing_views');
        if (viewTrend < -0.1) factors.push('decreasing_views');
        if (completionTrend > 0.1) factors.push('improving_engagement');
        if (completionTrend < -0.1) factors.push('declining_engagement');
        if (Math.abs(trendScore) > 0.5) factors.push('strong_trend');

        return factors;
    }

    /**
     * Store trend in database
     */
    private async storeTrend(trend: ContentTrend): Promise<void> {
        this.db.run(`
            INSERT OR REPLACE INTO content_trends (
                media_id, trend_type, trend_score, period_days, growth_rate, factors
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
            trend.media_id,
            trend.trend_type,
            trend.trend_score,
            trend.period_days,
            trend.growth_rate,
            JSON.stringify(trend.factors)
        ]);
    }

    /**
     * Find high engagement content
     */
    private async findHighEngagementContent(days: number): Promise<number[]> {
        const results = this.db.prepare(`
            SELECT media_id
            FROM engagement_analytics
            WHERE date >= DATE('now', '-${days} days')
            GROUP BY media_id
            HAVING AVG(avg_completion_rate) > 80 AND SUM(views_count) > 5
            ORDER BY AVG(avg_completion_rate) DESC
            LIMIT 10
        `).all() as { media_id: number }[];

        return results.map(r => r.media_id);
    }

    /**
     * Find low engagement content
     */
    private async findLowEngagementContent(days: number): Promise<number[]> {
        const results = this.db.prepare(`
            SELECT media_id
            FROM engagement_analytics
            WHERE date >= DATE('now', '-${days} days')
            GROUP BY media_id
            HAVING AVG(avg_completion_rate) < 30 AND SUM(views_count) > 2
            ORDER BY AVG(avg_completion_rate) ASC
            LIMIT 10
        `).all() as { media_id: number }[];

        return results.map(r => r.media_id);
    }

    /**
     * Find content with discovery issues
     */
    private async findDiscoveryIssues(days: number): Promise<number[]> {
        // Content with low search discovery rate
        const results = this.db.prepare(`
            SELECT ea.media_id
            FROM engagement_analytics ea
            LEFT JOIN search_behavior sb ON sb.clicked_media_ids LIKE '%' || ea.media_id || '%'
            WHERE ea.date >= DATE('now', '-${days} days')
            GROUP BY ea.media_id
            HAVING SUM(ea.views_count) > 3 AND COUNT(sb.id) = 0
            LIMIT 10
        `).all() as { media_id: number }[];

        return results.map(r => r.media_id);
    }
}
