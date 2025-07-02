import { describe, it, expect, beforeEach, mock } from 'bun:test';

const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

const mockInitDatabase = mock(() => Promise.resolve());

mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/db', () => ({ initDatabase: mockInitDatabase }));
mock.module('../db', () => ({ initDatabase: mockInitDatabase }));

const mockServer = {
    setRequestHandler: mock(() => {}),
    connect: mock(() => Promise.resolve())
};

mock.module('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: mock(() => mockServer)
}));

mock.module('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: mock(() => ({}))
}));

mock.module('@modelcontextprotocol/sdk/types.js', () => ({
    CallToolRequestSchema: 'call_tool',
    ListToolsRequestSchema: 'list_tools'
}));

const mockService = {
    generateOptimizedPlan: mock(async (_req: any) => ({
        success: true,
        plan: { approach: 'test' },
        optimizationScore: 0.95,
        resourceEfficiency: 0.9,
        modelUsed: 'test-model',
        contextUsed: {},
        error: null
    })),
    analyzeSystemLogs: mock(async (_h: number) => [
        { id: 1, pattern_type: 'error', pattern_description: 'err', frequency: 1, severity: 'high', first_detected: 't', last_detected: 't', resolved: false }
    ]),
    generateOptimizationRecommendations: mock(async () => [
        { id: 1, recommendation_type: 'performance', description: 'desc', impact_score: 5, implementation_difficulty: 'medium', created_at: 't', implemented: false, llm_model_used: 'test' }
    ]),
    getPlanningMetrics: mock(async () => ({
        totalPlans: 1,
        averageOptimizationScore: 0.8,
        topRecommendations: [],
        recentPatterns: [],
        systemHealth: { score: 95, issues: [] }
    }))
};

mock.module('../src/services/llm-planning-service', () => ({ llmPlanningService: mockService }));

function getHandler(type: string) {
    return mockServer.setRequestHandler.mock.calls.find(call => call[0] === type)?.[1];
}

async function importServer() {
    await import(`../src/mcp/llm-planning-server?${Math.random()}`);
}

describe('LLM Planning MCP Server', () => {
    beforeEach(() => {
        mockServer.setRequestHandler.mockClear();
        mockInitDatabase.mockClear();
        Object.values(mockService).forEach(fn => 'mockClear' in fn && fn.mockClear());
    });

    it('registers tool handlers on startup', async () => {
        await importServer();
        expect(mockServer.setRequestHandler).toHaveBeenCalledWith('list_tools', expect.any(Function));
        expect(mockServer.setRequestHandler).toHaveBeenCalledWith('call_tool', expect.any(Function));
        expect(mockInitDatabase).toHaveBeenCalled();
    });

    it('lists all planning tools', async () => {
        await importServer();
        const handler = getHandler('list_tools');
        const res = await handler();
        const names = res.tools.map((t: any) => t.name);
        expect(res.tools).toHaveLength(6);
        expect(names).toEqual(expect.arrayContaining([
            'generate_optimized_plan',
            'analyze_system_logs',
            'get_optimization_recommendations',
            'get_planning_metrics',
            'analyze_metadata_quality',
            'predict_resource_usage'
        ]));
    });

    it('handles generate_optimized_plan requests', async () => {
        await importServer();
        const handler = getHandler('call_tool');
        const res = await handler({ params: { name: 'generate_optimized_plan', arguments: { goal: 'test' } } });
        expect(mockService.generateOptimizedPlan).toHaveBeenCalled();
        const data = JSON.parse(res.content[0].text);
        expect(data.success).toBe(true);
        expect(data.plan.approach).toBe('test');
    });

    it('handles analyze_system_logs with recommendations', async () => {
        await importServer();
        const handler = getHandler('call_tool');
        const res = await handler({ params: { name: 'analyze_system_logs', arguments: { time_range_hours: 12, generate_recommendations: true } } });
        expect(mockService.analyzeSystemLogs).toHaveBeenCalledWith(12);
        expect(mockService.generateOptimizationRecommendations).toHaveBeenCalled();
        const data = JSON.parse(res.content[0].text);
        expect(data.time_range_hours).toBe(12);
        expect(data.patterns_found).toBe(1);
        expect(data.recommendations.length).toBe(1);
    });

    it('filters optimization recommendations', async () => {
        await importServer();
        const handler = getHandler('call_tool');
        const res = await handler({ params: { name: 'get_optimization_recommendations', arguments: { category: 'performance', min_impact_score: 5, implementation_difficulty: 'medium', limit: 1 } } });
        expect(mockService.generateOptimizationRecommendations).toHaveBeenCalled();
        const data = JSON.parse(res.content[0].text);
        expect(data.filtered_recommendations).toBe(1);
        expect(data.recommendations[0].recommendation_type).toBe('performance');
    });

    it('returns planning metrics', async () => {
        await importServer();
        const handler = getHandler('call_tool');
        const res = await handler({ params: { name: 'get_planning_metrics', arguments: { time_range_hours: 48 } } });
        expect(mockService.getPlanningMetrics).toHaveBeenCalled();
        const data = JSON.parse(res.content[0].text);
        expect(data.metrics.totalPlans).toBe(1);
        expect(data.time_range_hours).toBe(48);
    });

    it('returns metadata quality placeholder', async () => {
        await importServer();
        const handler = getHandler('call_tool');
        const res = await handler({ params: { name: 'analyze_metadata_quality', arguments: { collection: 'test' } } });
        const data = JSON.parse(res.content[0].text);
        expect(data.collection).toBe('test');
        expect(data.analysis_available).toBe(true);
    });

    it('returns resource usage placeholder', async () => {
        await importServer();
        const handler = getHandler('call_tool');
        const res = await handler({ params: { name: 'predict_resource_usage', arguments: { resource_type: 'cpu', prediction_window_hours: 24, confidence_threshold: 0.7 } } });
        const data = JSON.parse(res.content[0].text);
        expect(data.resource_type).toBe('cpu');
        expect(data.status).toBe('coming_soon');
    });
});
