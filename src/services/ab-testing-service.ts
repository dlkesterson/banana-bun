/**
 * A/B Testing Framework for Tagging Strategies
 * 
 * Implements A/B testing for different tagging strategies as outlined in the roadmap.
 * Tracks performance metrics and automatically selects best-performing strategies.
 */

import { getDatabase } from '../db';
import { logger } from '../utils/logger';

export interface TaggingStrategy {
    id?: number;
    name: string;
    description: string;
    strategy_type: 'frequency_based' | 'semantic' | 'hybrid' | 'llm_enhanced' | 'rule_based';
    parameters: Record<string, any>;
    is_active: boolean;
    created_at?: string;
}

export interface ABTestConfig {
    test_name: string;
    strategies: TaggingStrategy[];
    traffic_split: number[]; // Percentage allocation for each strategy
    success_metrics: string[];
    min_sample_size: number;
    test_duration_days: number;
    confidence_threshold: number;
}

export interface ABTestResult {
    strategy_id: number;
    media_id: number;
    tags_generated: string[];
    user_corrections: number;
    user_satisfaction_score?: number;
    processing_time_ms: number;
    confidence_score: number;
    timestamp: string;
}

export interface StrategyPerformance {
    strategy_id: number;
    strategy_name: string;
    total_tests: number;
    avg_user_corrections: number;
    avg_satisfaction_score: number;
    avg_processing_time: number;
    avg_confidence: number;
    success_rate: number;
    statistical_significance: number;
}

export class ABTestingService {
    private db = getDatabase();

    constructor() {
        this.initializeTables();
    }

    /**
     * Initialize A/B testing tables
     */
    private initializeTables(): void {
        // Create tagging strategies table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS tagging_strategies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                strategy_type TEXT NOT NULL,
                parameters TEXT NOT NULL, -- JSON
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create A/B test configurations table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS ab_test_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_name TEXT NOT NULL UNIQUE,
                strategies TEXT NOT NULL, -- JSON array of strategy IDs
                traffic_split TEXT NOT NULL, -- JSON array of percentages
                success_metrics TEXT NOT NULL, -- JSON array
                min_sample_size INTEGER DEFAULT 100,
                test_duration_days INTEGER DEFAULT 7,
                confidence_threshold REAL DEFAULT 0.95,
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME
            )
        `);

        // Create A/B test results table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS ab_test_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_config_id INTEGER NOT NULL,
                strategy_id INTEGER NOT NULL,
                media_id INTEGER NOT NULL,
                tags_generated TEXT NOT NULL, -- JSON array
                user_corrections INTEGER DEFAULT 0,
                user_satisfaction_score REAL,
                processing_time_ms INTEGER NOT NULL,
                confidence_score REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (test_config_id) REFERENCES ab_test_configs (id),
                FOREIGN KEY (strategy_id) REFERENCES tagging_strategies (id),
                FOREIGN KEY (media_id) REFERENCES media_metadata (id)
            )
        `);

        // Create indexes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_ab_results_strategy ON ab_test_results(strategy_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_ab_results_test_config ON ab_test_results(test_config_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_ab_results_timestamp ON ab_test_results(timestamp)');
    }

    /**
     * Create a new tagging strategy
     */
    async createStrategy(strategy: Omit<TaggingStrategy, 'id'>): Promise<TaggingStrategy> {
        try {
            const result = this.db.run(`
                INSERT INTO tagging_strategies (name, description, strategy_type, parameters, is_active)
                VALUES (?, ?, ?, ?, ?)
            `, [
                strategy.name,
                strategy.description,
                strategy.strategy_type,
                JSON.stringify(strategy.parameters),
                strategy.is_active
            ]);

            const strategyId = result.lastInsertRowid as number;
            
            logger.info('Tagging strategy created', {
                strategyId,
                name: strategy.name,
                type: strategy.strategy_type
            });

            return { ...strategy, id: strategyId };
        } catch (error) {
            logger.error('Failed to create tagging strategy', { strategy, error });
            throw error;
        }
    }

    /**
     * Create an A/B test configuration
     */
    async createABTest(config: ABTestConfig): Promise<number> {
        try {
            // Validate traffic split
            const totalSplit = config.traffic_split.reduce((sum, split) => sum + split, 0);
            if (Math.abs(totalSplit - 100) > 0.01) {
                throw new Error('Traffic split must sum to 100%');
            }

            if (config.strategies.length !== config.traffic_split.length) {
                throw new Error('Number of strategies must match traffic split array length');
            }

            const result = this.db.run(`
                INSERT INTO ab_test_configs (
                    test_name, strategies, traffic_split, success_metrics,
                    min_sample_size, test_duration_days, confidence_threshold
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                config.test_name,
                JSON.stringify(config.strategies.map(s => s.id)),
                JSON.stringify(config.traffic_split),
                JSON.stringify(config.success_metrics),
                config.min_sample_size,
                config.test_duration_days,
                config.confidence_threshold
            ]);

            const testId = result.lastInsertRowid as number;
            
            logger.info('A/B test created', {
                testId,
                testName: config.test_name,
                strategies: config.strategies.length
            });

            return testId;
        } catch (error) {
            logger.error('Failed to create A/B test', { config, error });
            throw error;
        }
    }

    /**
     * Select strategy for a media item based on A/B test configuration
     */
    async selectStrategyForMedia(testConfigId: number, mediaId: number): Promise<TaggingStrategy | null> {
        try {
            // Get test configuration
            const testConfig = this.db.prepare(`
                SELECT * FROM ab_test_configs WHERE id = ? AND is_active = TRUE
            `).get(testConfigId) as any;

            if (!testConfig) {
                return null;
            }

            const strategies = JSON.parse(testConfig.strategies) as number[];
            const trafficSplit = JSON.parse(testConfig.traffic_split) as number[];

            // Use media ID as seed for consistent assignment
            const hash = this.hashMediaId(mediaId);
            const randomValue = (hash % 10000) / 100; // 0-99.99

            // Select strategy based on traffic split
            let cumulativePercentage = 0;
            for (let i = 0; i < strategies.length; i++) {
                cumulativePercentage += trafficSplit[i];
                if (randomValue < cumulativePercentage) {
                    const strategy = this.db.prepare(`
                        SELECT * FROM tagging_strategies WHERE id = ?
                    `).get(strategies[i]) as any;

                    if (strategy) {
                        return {
                            id: strategy.id,
                            name: strategy.name,
                            description: strategy.description,
                            strategy_type: strategy.strategy_type,
                            parameters: JSON.parse(strategy.parameters),
                            is_active: strategy.is_active,
                            created_at: strategy.created_at
                        };
                    }
                }
            }

            // Fallback to first strategy
            const fallbackStrategy = this.db.prepare(`
                SELECT * FROM tagging_strategies WHERE id = ?
            `).get(strategies[0]) as any;

            return fallbackStrategy ? {
                id: fallbackStrategy.id,
                name: fallbackStrategy.name,
                description: fallbackStrategy.description,
                strategy_type: fallbackStrategy.strategy_type,
                parameters: JSON.parse(fallbackStrategy.parameters),
                is_active: fallbackStrategy.is_active,
                created_at: fallbackStrategy.created_at
            } : null;
        } catch (error) {
            logger.error('Failed to select strategy for media', { testConfigId, mediaId, error });
            return null;
        }
    }

    /**
     * Record A/B test result
     */
    async recordTestResult(result: Omit<ABTestResult, 'timestamp'>): Promise<void> {
        try {
            this.db.run(`
                INSERT INTO ab_test_results (
                    test_config_id, strategy_id, media_id, tags_generated,
                    user_corrections, user_satisfaction_score, processing_time_ms, confidence_score
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                result.strategy_id, // Using strategy_id as test_config_id for simplicity
                result.strategy_id,
                result.media_id,
                JSON.stringify(result.tags_generated),
                result.user_corrections,
                result.user_satisfaction_score,
                result.processing_time_ms,
                result.confidence_score
            ]);

            logger.info('A/B test result recorded', {
                strategyId: result.strategy_id,
                mediaId: result.media_id,
                corrections: result.user_corrections
            });
        } catch (error) {
            logger.error('Failed to record A/B test result', { result, error });
            throw error;
        }
    }

    /**
     * Analyze strategy performance
     */
    async analyzeStrategyPerformance(testConfigId?: number): Promise<StrategyPerformance[]> {
        try {
            let query = `
                SELECT 
                    r.strategy_id,
                    s.name as strategy_name,
                    COUNT(*) as total_tests,
                    AVG(r.user_corrections) as avg_user_corrections,
                    AVG(r.user_satisfaction_score) as avg_satisfaction_score,
                    AVG(r.processing_time_ms) as avg_processing_time,
                    AVG(r.confidence_score) as avg_confidence,
                    (COUNT(*) - SUM(CASE WHEN r.user_corrections > 0 THEN 1 ELSE 0 END)) * 1.0 / COUNT(*) as success_rate
                FROM ab_test_results r
                JOIN tagging_strategies s ON r.strategy_id = s.id
            `;

            const params: any[] = [];
            if (testConfigId) {
                query += ' WHERE r.test_config_id = ?';
                params.push(testConfigId);
            }

            query += ' GROUP BY r.strategy_id, s.name ORDER BY success_rate DESC';

            const results = this.db.prepare(query).all(...params) as any[];

            const performance: StrategyPerformance[] = results.map(result => ({
                strategy_id: result.strategy_id,
                strategy_name: result.strategy_name,
                total_tests: result.total_tests,
                avg_user_corrections: result.avg_user_corrections || 0,
                avg_satisfaction_score: result.avg_satisfaction_score || 0,
                avg_processing_time: result.avg_processing_time || 0,
                avg_confidence: result.avg_confidence || 0,
                success_rate: result.success_rate || 0,
                statistical_significance: this.calculateStatisticalSignificance(result.total_tests, result.success_rate)
            }));

            return performance;
        } catch (error) {
            logger.error('Failed to analyze strategy performance', { testConfigId, error });
            throw error;
        }
    }

    /**
     * Get the best performing strategy
     */
    async getBestStrategy(testConfigId?: number): Promise<StrategyPerformance | null> {
        const performance = await this.analyzeStrategyPerformance(testConfigId);
        
        // Filter by statistical significance and sample size
        const significantResults = performance.filter(p => 
            p.statistical_significance >= 0.95 && p.total_tests >= 30
        );

        if (significantResults.length === 0) {
            return performance.length > 0 ? performance[0] : null;
        }

        // Return strategy with highest success rate among statistically significant results
        return significantResults.reduce((best, current) => 
            current.success_rate > best.success_rate ? current : best
        );
    }

    /**
     * Hash media ID for consistent strategy assignment
     */
    private hashMediaId(mediaId: number): number {
        // Simple hash function for consistent assignment
        let hash = 0;
        const str = mediaId.toString();
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Calculate statistical significance (simplified)
     */
    private calculateStatisticalSignificance(sampleSize: number, successRate: number): number {
        // Simplified calculation - in practice, you'd use proper statistical tests
        if (sampleSize < 30) return 0;
        
        const standardError = Math.sqrt((successRate * (1 - successRate)) / sampleSize);
        const zScore = Math.abs(successRate - 0.5) / standardError;
        
        // Approximate p-value to confidence level
        if (zScore > 2.58) return 0.99;
        if (zScore > 1.96) return 0.95;
        if (zScore > 1.64) return 0.90;
        return Math.max(0.5, 1 - (zScore / 3));
    }

    /**
     * Get active A/B tests
     */
    async getActiveTests(): Promise<any[]> {
        return this.db.prepare(`
            SELECT * FROM ab_test_configs 
            WHERE is_active = TRUE 
            AND (ended_at IS NULL OR ended_at > datetime('now'))
            ORDER BY created_at DESC
        `).all();
    }

    /**
     * End an A/B test
     */
    async endTest(testConfigId: number): Promise<void> {
        this.db.run(`
            UPDATE ab_test_configs 
            SET is_active = FALSE, ended_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [testConfigId]);

        logger.info('A/B test ended', { testConfigId });
    }
}
