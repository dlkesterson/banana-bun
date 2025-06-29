import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
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
