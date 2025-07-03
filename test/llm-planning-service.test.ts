import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

const mockConfig = {
    ollama: { url: 'http://localhost:11434', model: 'test' },
    openai: { apiKey: '' }
};

let db: Database = new Database(':memory:');
const mockGetDatabase = mock(() => db);

// Mock fetch to prevent real HTTP requests
const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
        response: JSON.stringify({
            tasks: [{ type: 'shell', command: 'echo test' }],
            dependencies: [],
            optimization_score: 85
        })
    })
}));
global.fetch = mockFetch as any;

mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/config', () => ({ config: mockConfig }));
mock.module('../src/db', () => ({ getDatabase: mockGetDatabase }));
mock.module('../db', () => ({ getDatabase: mockGetDatabase }));
mock.module('../src/memory/embeddings', () => ({ embeddingManager: {} }));

import type { LlmPlanningRequest, GeneratedPlan, LogAnalysisPattern, PlanTemplate, SystemMetric } from '../src/types/llm-planning';

describe('LlmPlanningService Core Functions', () => {
    let service: LlmPlanningService;

    beforeEach(async () => {
        db.close();
        db = new Database(':memory:');

        // Create required tables for LlmPlanningService
        db.run(`
            CREATE TABLE IF NOT EXISTS analytics_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS log_analysis_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern_type TEXT NOT NULL,
                pattern_description TEXT NOT NULL,
                frequency INTEGER NOT NULL,
                severity TEXT NOT NULL,
                first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolved BOOLEAN DEFAULT FALSE
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS plan_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                template_data TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                success_rate REAL DEFAULT 0.0,
                usage_count INTEGER DEFAULT 0
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS system_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_type TEXT NOT NULL,
                metric_value REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS optimization_recommendations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recommendation_type TEXT NOT NULL,
                description TEXT NOT NULL,
                impact_score INTEGER NOT NULL,
                implementation_difficulty TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                implemented BOOLEAN DEFAULT FALSE,
                llm_model_used TEXT
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS planner_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id TEXT,
                goal TEXT NOT NULL,
                context TEXT,
                tasks_json TEXT NOT NULL,
                model_used TEXT NOT NULL,
                estimated_duration INTEGER DEFAULT 0,
                optimization_score REAL,
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

        const mod = await import('../src/services/llm-planning-service');
        service = new mod.LlmPlanningService();
        Object.values(mockLogger).forEach(fn => 'mockClear' in fn && fn.mockClear());
    });

    afterEach(() => {
        db.close();
    });

    it('parses JSON responses from LLM', () => {
        const json = '{"approach":"test","subtasks":[{"type":"run","description":"Do something long enough to trigger", "estimated_duration":"1h", "resource_requirements":"cpu"}],"optimization_notes":"bottleneck fixed","risk_assessment":"low"}';
        const result = (service as any).parsePlanResponse(json);
        expect(result.approach).toBe('test');
        expect(result.subtasks).toHaveLength(1);
        expect(result.risk_assessment).toBe('low');
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('falls back to text plan on invalid JSON', () => {
        const result = (service as any).parsePlanResponse('not json at all');
        expect(result.approach).toBe('Text-based plan');
        expect(result.subtasks[0].description).toContain('not json at all');
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('builds planning prompts with context', () => {
        const request: LlmPlanningRequest = {
            goal: 'Test Goal',
            context: 'Some context',
            constraints: ['c1', 'c2']
        };
        const ctx = {
            logPatterns: [{ id:1, pattern_type:'error', pattern_description:'err', frequency:3, severity:'medium', first_detected:'t', last_detected:'t', resolved:false }] as LogAnalysisPattern[],
            similarTemplates: [{ id:1, name:'temp', description:'desc', template_data:'', created_at:'t', updated_at:'t', success_rate:0.9, usage_count:1 }] as PlanTemplate[],
            systemMetrics: [{ id:1, metric_type:'cpu', metric_value:80, timestamp:'t' }] as SystemMetric[]
        };
        const prompt = (service as any).buildPlanningPrompt(request, ctx);
        expect(prompt).toContain('GOAL: Test Goal');
        expect(prompt).toContain('Some context');
        expect(prompt).toContain('c1');
        expect(prompt).toContain('error');
        expect(prompt).toContain('temp');
        expect(prompt).toContain('cpu');
    });

    it('calculates optimization score with bonuses', () => {
        const plan: GeneratedPlan = {
            approach: 'a',
            subtasks: [{ type: 'run', description: 'This description is certainly longer than twenty characters.', resource_requirements: 'cpu' }],
            optimization_notes: 'contains bottleneck and resource info',
            risk_assessment: 'low'
        };
        const score = (service as any).calculateOptimizationScore(plan, {});
        expect(score).toBeCloseTo(1, 5);
    });

    it('detects recurring error patterns', async () => {
        const logs = [
            { level: 'error', message: 'fail connect' },
            { level: 'error', message: 'fail connect' },
            { level: 'error', message: 'fail connect' },
            { level: 'warn', message: 'timeout' }
        ];
        const patterns = await (service as any).detectLogPatterns(logs);
        expect(patterns).toHaveLength(1);
        expect(patterns[0].pattern_description).toContain('fail connect');
        expect(patterns[0].severity).toBe('medium');
    });
});

afterAll(() => {
    mock.restore();
});
