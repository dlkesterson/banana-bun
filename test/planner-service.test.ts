import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

// Mock config
const mockConfig = {
    paths: {
        database: ':memory:'
    },
    ollama: {
        url: 'http://localhost:11434',
        model: 'qwen3:8b'
    }
};

// Mock logger
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

// Mock modules
mock.module('../src/config', () => ({ config: mockConfig }));
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));

// Mock fetch for LLM calls
const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
        message: {
            content: JSON.stringify({
                success: true,
                tasks: [
                    {
                        type: 'shell',
                        description: 'Download video files',
                        dependencies: [],
                        priority: 4
                    },
                    {
                        type: 'transcribe',
                        description: 'Transcribe audio from videos',
                        dependencies: ['Download video files'],
                        priority: 3
                    }
                ],
                plan_id: 'test_plan_123',
                estimated_duration: 3600
            })
        }
    })
}));

global.fetch = mockFetch;

describe('PlannerService', () => {
    let db: Database;
    let plannerService: any;

    beforeEach(async () => {
        // Create in-memory database
        db = new Database(':memory:');

        // Create required tables
        db.run(`
            CREATE TABLE IF NOT EXISTS planner_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id TEXT NOT NULL,
                goal TEXT NOT NULL,
                context TEXT,
                tasks_json TEXT NOT NULL,
                model_used TEXT,
                estimated_duration INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                description TEXT,
                status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Mock database module
        mock.module('../src/db', () => ({
            getDatabase: () => db
        }));

        // Import PlannerService singleton after mocking
        const module = await import('../src/services/planner-service?t=' + Date.now());
        plannerService = module.plannerService;
    });

    afterEach(() => {
        if (db) {
            db.close();
        }
        mockFetch.mockClear();
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
    });

    describe('Goal Decomposition', () => {
        it('should decompose a simple goal into tasks', async () => {
            const goal = 'Process 10 video files for transcription';
            const result = await plannerService.decomposeGoal(goal);

            expect(result.success).toBe(true);
            expect(result.tasks).toBeDefined();
            expect(result.tasks.length).toBeGreaterThan(0);
            expect(result.plan_id).toBeDefined();
            expect(result.estimated_duration).toBeGreaterThan(0);
        });

        it('should handle goal decomposition with context', async () => {
            const goal = 'Organize media library';
            const context = {
                available_storage: '1TB',
                file_types: ['mp4', 'mkv'],
                priority: 'high'
            };

            const result = await plannerService.decomposeGoal(goal, context);

            expect(result.success).toBe(true);
            expect(result.tasks).toBeDefined();
            expect(mockFetch).toHaveBeenCalled();
        });

        it('should store planning results in database', async () => {
            const goal = 'Test goal for database storage';
            await plannerService.decomposeGoal(goal);

            const stored = db.query('SELECT * FROM planner_results WHERE goal = ?').get(goal);
            expect(stored).toBeDefined();
            expect(stored.goal).toBe(goal);
            expect(stored.tasks_json).toBeDefined();
        });

        it('should handle LLM API errors gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('API unavailable'));

            const goal = 'Test error handling';
            const result = await plannerService.decomposeGoal(goal);

            expect(result.success).toBe(false);
            expect(result.error).toContain('API unavailable');
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle invalid JSON responses', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    message: {
                        content: 'invalid json content'
                    }
                })
            });

            const goal = 'Test invalid JSON';
            const result = await plannerService.decomposeGoal(goal);

            expect(result.success).toBe(false);
            expect(result.error).toContain('parse');
        });
    });

    describe('Metrics Calculation', () => {
        beforeEach(() => {
            // Insert test data
            db.run(`
                INSERT INTO planner_results (plan_id, goal, tasks_json, estimated_duration)
                VALUES 
                    ('plan1', 'Goal 1', '[{"type":"shell"}]', 1800),
                    ('plan2', 'Goal 2', '[{"type":"shell"},{"type":"llm"}]', 3600),
                    ('plan3', 'Goal 3', '[{"type":"transcribe"}]', 2400)
            `);

            db.run(`
                INSERT INTO tasks (type, status)
                VALUES 
                    ('shell', 'completed'),
                    ('shell', 'completed'),
                    ('llm', 'failed'),
                    ('transcribe', 'completed')
            `);
        });

        it('should calculate basic planner metrics', async () => {
            const metrics = await plannerService.getMetrics();

            expect(metrics.total_plans).toBe(3);
            expect(metrics.average_subtasks).toBeGreaterThan(0);
            expect(metrics.success_rate_by_context).toBeDefined();
            expect(metrics.most_common_patterns).toBeDefined();
        });

        it('should calculate success rates by context', async () => {
            const metrics = await plannerService.getMetrics();

            expect(metrics.success_rate_by_context.with_similar_tasks).toBeNumber();
            expect(metrics.success_rate_by_context.without_similar_tasks).toBeNumber();
        });

        it('should identify common patterns', () => {
            const patterns = plannerService.getMostCommonPatterns();

            expect(Array.isArray(patterns)).toBe(true);
            expect(patterns.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Badge Generation', () => {
        it('should generate planning efficiency badge', () => {
            const badge = plannerService.generatePlanningEfficiencyBadge(85);

            expect(badge).toContain('Planning Efficiency');
            expect(badge).toContain('85%');
            expect(badge).toContain('brightgreen');
        });

        it('should use different colors for different efficiency levels', () => {
            const highBadge = plannerService.generatePlanningEfficiencyBadge(90);
            const mediumBadge = plannerService.generatePlanningEfficiencyBadge(70);
            const lowBadge = plannerService.generatePlanningEfficiencyBadge(40);

            expect(highBadge).toContain('brightgreen');
            expect(mediumBadge).toContain('yellow');
            expect(lowBadge).toContain('red');
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors gracefully', async () => {
            // Close database to simulate error
            db.close();

            const result = await plannerService.decomposeGoal('Test goal');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle empty goals', async () => {
            const result = await plannerService.decomposeGoal('');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Goal cannot be empty');
        });

        it('should handle network timeouts', async () => {
            mockFetch.mockImplementationOnce(() => 
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Request timeout')), 100)
                )
            );

            const goal = 'Test timeout';
            const result = await plannerService.decomposeGoal(goal);

            expect(result.success).toBe(false);
            expect(result.error).toContain('timeout');
        });
    });
});
