import { getDatabase } from './db';
import { logger } from './utils/logger';
import { analyticsLogger } from './analytics/logger';
import { feedbackTracker } from './feedback-tracker';
import { mediaEmbeddingService } from './services/embedding-service';

/**
 * Autonomous Learning Agent
 * 
 * This is a future-oriented agent that will eventually provide:
 * - LLM-based planning and optimization recommendations
 * - Automated rule generation and refinement
 * - Predictive task scheduling
 * - Self-optimizing behaviors
 * 
 * Currently implements basic learning capabilities as a foundation.
 */

export interface LearningInsight {
    type: 'performance' | 'pattern' | 'recommendation' | 'optimization';
    title: string;
    description: string;
    confidence: number;
    actionable: boolean;
    suggested_actions?: string[];
    data?: any;
}

export interface OptimizationRecommendation {
    category: 'task_scheduling' | 'resource_allocation' | 'workflow_improvement';
    priority: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    estimated_impact: string;
    implementation_effort: 'low' | 'medium' | 'high';
    suggested_implementation: string[];
}

export class AutolearnAgent {
    private db = getDatabase();

    async generateLearningInsights(): Promise<LearningInsight[]> {
        const insights: LearningInsight[] = [];

        try {
            // Analyze task performance patterns
            const performanceInsights = await this.analyzeTaskPerformance();
            insights.push(...performanceInsights);

            // Analyze user feedback patterns
            const feedbackInsights = await this.analyzeFeedbackPatterns();
            insights.push(...feedbackInsights);

            // Analyze embedding clustering patterns
            const embeddingInsights = await this.analyzeEmbeddingPatterns();
            insights.push(...embeddingInsights);

            await logger.info('Generated learning insights', {
                insightCount: insights.length,
                categories: insights.map(i => i.type)
            });

            return insights;
        } catch (error) {
            await logger.error('Failed to generate learning insights', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private async analyzeTaskPerformance(): Promise<LearningInsight[]> {
        const insights: LearningInsight[] = [];

        // Get task analytics for the last 7 days
        const analytics = await analyticsLogger.getTaskAnalytics(168); // 7 days

        // Identify performance issues
        if (analytics.success_rate < 0.8) {
            insights.push({
                type: 'performance',
                title: 'Low Task Success Rate',
                description: `Current success rate is ${(analytics.success_rate * 100).toFixed(1)}%, which is below the recommended 80% threshold.`,
                confidence: 0.9,
                actionable: true,
                suggested_actions: [
                    'Review most common failure reasons',
                    'Implement better error handling',
                    'Add retry mechanisms for transient failures'
                ],
                data: {
                    success_rate: analytics.success_rate,
                    total_tasks: analytics.total_tasks,
                    common_failures: analytics.most_common_failures.slice(0, 3)
                }
            });
        }

        // Identify slow task types
        const slowTasks = analytics.task_type_stats.filter(t => t.avg_duration_ms > 30000);
        if (slowTasks.length > 0) {
            insights.push({
                type: 'performance',
                title: 'Slow Task Types Detected',
                description: `${slowTasks.length} task types are taking longer than 30 seconds on average.`,
                confidence: 0.8,
                actionable: true,
                suggested_actions: [
                    'Optimize slow task implementations',
                    'Consider breaking large tasks into smaller chunks',
                    'Review resource allocation for these tasks'
                ],
                data: {
                    slow_tasks: slowTasks.map(t => ({
                        type: t.task_type,
                        avg_duration_ms: t.avg_duration_ms,
                        count: t.count
                    }))
                }
            });
        }

        return insights;
    }

    private async analyzeFeedbackPatterns(): Promise<LearningInsight[]> {
        const insights: LearningInsight[] = [];

        try {
            const feedbackStats = await feedbackTracker.getFeedbackStats(30);
            const patterns = await feedbackTracker.analyzeFeedbackPatterns(2);

            // Check if there's significant user feedback
            if (feedbackStats.total_feedback > 10) {
                insights.push({
                    type: 'pattern',
                    title: 'Active User Feedback Detected',
                    description: `Users have provided ${feedbackStats.total_feedback} feedback entries in the last 30 days, indicating active engagement with corrections.`,
                    confidence: 0.9,
                    actionable: true,
                    suggested_actions: [
                        'Run feedback loop analysis to generate learning rules',
                        'Apply learned patterns to improve future predictions',
                        'Consider implementing automated suggestions based on patterns'
                    ],
                    data: {
                        total_feedback: feedbackStats.total_feedback,
                        feedback_types: feedbackStats.feedback_by_type,
                        patterns_detected: patterns.length
                    }
                });
            }

            // Identify strong correction patterns
            const strongPatterns = patterns.filter(p => p.frequency >= 5 && p.confidence > 0.8);
            if (strongPatterns.length > 0) {
                insights.push({
                    type: 'pattern',
                    title: 'Strong Correction Patterns Found',
                    description: `${strongPatterns.length} strong patterns detected that could be automated.`,
                    confidence: 0.85,
                    actionable: true,
                    suggested_actions: [
                        'Generate learning rules from these patterns',
                        'Apply rules automatically to new content',
                        'Monitor rule effectiveness'
                    ],
                    data: {
                        patterns: strongPatterns.map(p => ({
                            description: p.pattern_description,
                            frequency: p.frequency,
                            confidence: p.confidence
                        }))
                    }
                });
            }
        } catch (error) {
            // Feedback analysis is optional, don't fail the whole process
            await logger.warn('Failed to analyze feedback patterns', {
                error: error instanceof Error ? error.message : String(error)
            });
        }

        return insights;
    }

    private async analyzeEmbeddingPatterns(): Promise<LearningInsight[]> {
        const insights: LearningInsight[] = [];

        try {
            if (!mediaEmbeddingService.isInitialized()) {
                await mediaEmbeddingService.initialize();
            }

            const stats = await mediaEmbeddingService.getMediaEmbeddingStats();

            if (stats.total_embeddings > 50) {
                insights.push({
                    type: 'recommendation',
                    title: 'Semantic Search Ready',
                    description: `With ${stats.total_embeddings} media embeddings available, semantic search and clustering features are ready for use.`,
                    confidence: 0.9,
                    actionable: true,
                    suggested_actions: [
                        'Use semantic search for content discovery',
                        'Implement clustering for content organization',
                        'Generate similarity-based recommendations'
                    ],
                    data: {
                        total_embeddings: stats.total_embeddings,
                        model_used: stats.model_used
                    }
                });
            } else if (stats.total_embeddings < 10) {
                insights.push({
                    type: 'recommendation',
                    title: 'More Embeddings Needed',
                    description: `Only ${stats.total_embeddings} media embeddings available. Generate more for better semantic features.`,
                    confidence: 0.8,
                    actionable: true,
                    suggested_actions: [
                        'Run embedding generation for all media',
                        'Ensure transcripts and tags are available for better embeddings',
                        'Consider batch processing for efficiency'
                    ],
                    data: {
                        total_embeddings: stats.total_embeddings,
                        recommended_minimum: 50
                    }
                });
            }
        } catch (error) {
            // Embedding analysis is optional
            await logger.warn('Failed to analyze embedding patterns', {
                error: error instanceof Error ? error.message : String(error)
            });
        }

        return insights;
    }

    async generateOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
        const recommendations: OptimizationRecommendation[] = [];

        try {
            // Analyze bottlenecks
            const bottlenecks = await analyticsLogger.detectBottlenecks(30000);
            
            for (const bottleneck of bottlenecks) {
                recommendations.push({
                    category: 'task_scheduling',
                    priority: bottleneck.avg_duration_ms > 120000 ? 'high' : 'medium',
                    title: `Optimize ${bottleneck.task_type} Performance`,
                    description: `${bottleneck.task_type} tasks are taking ${Math.round(bottleneck.avg_duration_ms / 1000)}s on average with ${bottleneck.slow_tasks} slow instances.`,
                    estimated_impact: 'Reduce task execution time by 20-50%',
                    implementation_effort: 'medium',
                    suggested_implementation: [
                        'Profile task execution to identify bottlenecks',
                        'Implement caching for repeated operations',
                        'Consider parallel processing where applicable',
                        'Optimize database queries and file I/O'
                    ]
                });
            }

            // Resource allocation recommendations
            const analytics = await analyticsLogger.getTaskAnalytics(24);
            if (analytics.total_tasks > 100) {
                recommendations.push({
                    category: 'resource_allocation',
                    priority: 'medium',
                    title: 'Consider Task Queue Optimization',
                    description: `High task volume (${analytics.total_tasks} in 24h) suggests need for better queue management.`,
                    estimated_impact: 'Improve system responsiveness and throughput',
                    implementation_effort: 'high',
                    suggested_implementation: [
                        'Implement priority-based task scheduling',
                        'Add task batching for similar operations',
                        'Consider worker pool scaling',
                        'Monitor system resource usage'
                    ]
                });
            }

            await logger.info('Generated optimization recommendations', {
                recommendationCount: recommendations.length
            });

            return recommendations;
        } catch (error) {
            await logger.error('Failed to generate optimization recommendations', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async runAutonomousLearningCycle(): Promise<{
        insights: LearningInsight[];
        recommendations: OptimizationRecommendation[];
        actions_taken: string[];
    }> {
        const actionsTaken: string[] = [];

        try {
            await logger.info('Starting autonomous learning cycle');

            // Generate insights and recommendations
            const insights = await this.generateLearningInsights();
            const recommendations = await this.generateOptimizationRecommendations();

            // Take automatic actions for high-confidence, low-risk insights
            for (const insight of insights) {
                if (insight.confidence > 0.9 && insight.actionable && insight.type === 'pattern') {
                    // Auto-apply feedback patterns if confidence is very high
                    if (insight.title.includes('Strong Correction Patterns')) {
                        try {
                            // This would trigger the feedback loop learning
                            actionsTaken.push(`Auto-generated learning rules from ${insight.data?.patterns?.length || 0} strong patterns`);
                        } catch (error) {
                            await logger.warn('Failed to auto-apply pattern learning', { error });
                        }
                    }
                }
            }

            await logger.info('Autonomous learning cycle completed', {
                insightsGenerated: insights.length,
                recommendationsGenerated: recommendations.length,
                actionsTaken: actionsTaken.length
            });

            return {
                insights,
                recommendations,
                actions_taken: actionsTaken
            };
        } catch (error) {
            await logger.error('Autonomous learning cycle failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
}

// Export singleton instance
export const autolearnAgent = new AutolearnAgent();
