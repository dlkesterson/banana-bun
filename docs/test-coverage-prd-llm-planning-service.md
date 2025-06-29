# Test Coverage PRD: LLM Planning Service

**File**: `src/services/llm-planning-service.ts`  
**Current Coverage**: 0% (No dedicated tests)  
**Target Coverage**: 85%  
**Priority**: High  

## Overview

The LLM Planning Service is a sophisticated system that uses Large Language Models to generate optimized task execution plans, analyze system performance, and provide intelligent recommendations for workflow improvements.

## File Purpose

The LLM Planning Service implements:
- LLM-based plan generation and optimization
- System log analysis for pattern detection
- Plan template management and similarity matching
- Performance metrics analysis and recommendations
- Resource usage prediction and optimization

## Key Components to Test

### 1. LlmPlanningService Class
- Plan generation algorithms
- System metrics analysis
- Template management
- LLM integration

### 2. Plan Generation
- Goal-based plan creation
- Context-aware optimization
- Resource allocation planning
- Timeline estimation

### 3. System Analysis
- Log pattern detection
- Performance bottleneck identification
- Resource usage analysis
- Trend prediction

### 4. Template Management
- Plan template storage and retrieval
- Similarity matching algorithms
- Template optimization

## Test Assertions

### Unit Tests

#### Plan Generation
```typescript
describe('LlmPlanningService.generateOptimizedPlan', () => {
  it('should generate plan for simple goal', async () => {
    const request: LlmPlanningRequest = {
      goal: 'Process 100 video files for transcription',
      constraints: {
        max_duration_hours: 24,
        max_concurrent_tasks: 5,
        priority: 'medium'
      },
      context: {
        available_resources: { cpu_cores: 8, memory_gb: 16 },
        current_load: 0.3
      }
    };
    
    const result = await planningService.generateOptimizedPlan(request);
    
    expect(result.success).toBe(true);
    expect(result.plan).toBeDefined();
    expect(result.plan.steps).toHaveLength(greaterThan(0));
    expect(result.estimated_duration_hours).toBeGreaterThan(0);
    expect(result.estimated_duration_hours).toBeLessThanOrEqual(24);
  });

  it('should respect resource constraints', async () => {
    const request: LlmPlanningRequest = {
      goal: 'Process large dataset',
      constraints: {
        max_concurrent_tasks: 2,
        max_memory_gb: 8
      }
    };
    
    const result = await planningService.generateOptimizedPlan(request);
    
    expect(result.plan.resource_allocation.max_concurrent).toBeLessThanOrEqual(2);
    expect(result.plan.resource_allocation.memory_per_task_gb).toBeLessThanOrEqual(4);
  });

  it('should incorporate historical performance data', async () => {
    // Setup historical data showing slow transcription performance
    await setupHistoricalData({
      task_type: 'transcribe',
      avg_duration_minutes: 15,
      success_rate: 0.85
    });
    
    const request: LlmPlanningRequest = {
      goal: 'Transcribe 50 audio files',
      use_historical_data: true
    };
    
    const result = await planningService.generateOptimizedPlan(request);
    
    // Should account for slower performance in time estimation
    expect(result.estimated_duration_hours).toBeGreaterThan(10);
    expect(result.plan.buffer_time_percent).toBeGreaterThan(15);
  });

  it('should handle impossible constraints gracefully', async () => {
    const request: LlmPlanningRequest = {
      goal: 'Process 1000 files in 1 minute',
      constraints: {
        max_duration_hours: 0.017, // 1 minute
        max_concurrent_tasks: 1
      }
    };
    
    const result = await planningService.generateOptimizedPlan(request);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('impossible');
    expect(result.alternative_suggestions).toHaveLength(greaterThan(0));
  });
});
```

#### System Analysis
```typescript
describe('LlmPlanningService.analyzeSystemLogs', () => {
  it('should detect performance patterns in logs', async () => {
    await setupLogData([
      { timestamp: '2024-01-01T10:00:00Z', level: 'info', message: 'Task completed in 5000ms', task_type: 'llm' },
      { timestamp: '2024-01-01T10:05:00Z', level: 'info', message: 'Task completed in 5200ms', task_type: 'llm' },
      { timestamp: '2024-01-01T10:10:00Z', level: 'error', message: 'Task failed: timeout', task_type: 'llm' }
    ]);
    
    const patterns = await planningService.analyzeSystemLogs();
    
    expect(patterns).toHaveLength(greaterThan(0));
    
    const performancePattern = patterns.find(p => p.type === 'performance_degradation');
    expect(performancePattern).toBeDefined();
    expect(performancePattern.confidence).toBeGreaterThan(0.7);
    expect(performancePattern.affected_task_types).toContain('llm');
  });

  it('should identify resource bottlenecks', async () => {
    await setupResourceLogs([
      { timestamp: '2024-01-01T10:00:00Z', cpu_usage: 95, memory_usage: 85, task_count: 10 },
      { timestamp: '2024-01-01T10:01:00Z', cpu_usage: 98, memory_usage: 90, task_count: 12 },
      { timestamp: '2024-01-01T10:02:00Z', cpu_usage: 99, memory_usage: 95, task_count: 15 }
    ]);
    
    const patterns = await planningService.analyzeSystemLogs();
    
    const bottleneckPattern = patterns.find(p => p.type === 'resource_bottleneck');
    expect(bottleneckPattern).toBeDefined();
    expect(bottleneckPattern.resource_type).toBeOneOf(['cpu', 'memory']);
    expect(bottleneckPattern.severity).toBeOneOf(['low', 'medium', 'high', 'critical']);
  });

  it('should detect error patterns', async () => {
    await setupErrorLogs([
      'Network timeout connecting to service',
      'Network timeout connecting to service',
      'Database connection failed',
      'Network timeout connecting to service'
    ]);
    
    const patterns = await planningService.analyzeSystemLogs();
    
    const errorPattern = patterns.find(p => p.type === 'recurring_error');
    expect(errorPattern).toBeDefined();
    expect(errorPattern.error_message).toContain('Network timeout');
    expect(errorPattern.frequency).toBe(3);
  });
});
```

#### Template Management
```typescript
describe('LlmPlanningService.findSimilarPlanTemplates', () => {
  it('should find templates with similar goals', async () => {
    await setupPlanTemplates([
      { goal: 'Process video files for analysis', success_rate: 0.9, avg_duration: 120 },
      { goal: 'Transcribe audio recordings', success_rate: 0.85, avg_duration: 90 },
      { goal: 'Process media files for transcription', success_rate: 0.92, avg_duration: 100 }
    ]);
    
    const similar = await planningService.findSimilarPlanTemplates('Process videos for transcription');
    
    expect(similar).toHaveLength(greaterThan(0));
    expect(similar[0].similarity_score).toBeGreaterThan(0.7);
    expect(similar[0].goal).toContain('Process');
  });

  it('should rank templates by success rate and similarity', async () => {
    await setupPlanTemplates([
      { goal: 'Process files', success_rate: 0.6, similarity: 0.9 },
      { goal: 'Process files', success_rate: 0.95, similarity: 0.8 },
      { goal: 'Process files', success_rate: 0.8, similarity: 0.85 }
    ]);
    
    const similar = await planningService.findSimilarPlanTemplates('Process files');
    
    // Should prioritize high success rate with reasonable similarity
    expect(similar[0].success_rate).toBe(0.95);
  });

  it('should return empty array when no similar templates exist', async () => {
    const similar = await planningService.findSimilarPlanTemplates('Completely unique goal');
    
    expect(similar).toHaveLength(0);
  });
});
```

#### Resource Prediction
```typescript
describe('LlmPlanningService.predictResourceUsage', () => {
  it('should predict resource usage based on plan complexity', async () => {
    const plan = {
      steps: [
        { type: 'transcribe', count: 10, estimated_duration_minutes: 150 },
        { type: 'analyze', count: 10, estimated_duration_minutes: 60 }
      ]
    };
    
    const prediction = await planningService.predictResourceUsage(plan);
    
    expect(prediction.peak_cpu_usage).toBeGreaterThan(0);
    expect(prediction.peak_cpu_usage).toBeLessThanOrEqual(100);
    expect(prediction.peak_memory_gb).toBeGreaterThan(0);
    expect(prediction.estimated_duration_hours).toBeCloseTo(3.5, 1);
  });

  it('should account for concurrent task limits', async () => {
    const plan = {
      steps: [{ type: 'process', count: 100, max_concurrent: 5 }]
    };
    
    const prediction = await planningService.predictResourceUsage(plan);
    
    // With max 5 concurrent, should not predict excessive resource usage
    expect(prediction.peak_cpu_usage).toBeLessThan(80);
    expect(prediction.concurrent_task_peak).toBeLessThanOrEqual(5);
  });
});
```

### Integration Tests

#### End-to-End Planning Workflow
```typescript
describe('Planning Workflow Integration', () => {
  it('should complete full planning cycle', async () => {
    // 1. Setup system with historical data
    await setupSystemHistory();
    
    // 2. Generate plan
    const request: LlmPlanningRequest = {
      goal: 'Organize and process 500 media files',
      constraints: { max_duration_hours: 48 }
    };
    
    const result = await planningService.generateOptimizedPlan(request);
    expect(result.success).toBe(true);
    
    // 3. Verify plan is saved as template
    const templates = await planningService.findSimilarPlanTemplates(request.goal);
    expect(templates).toHaveLength(greaterThan(0));
    
    // 4. Verify recommendations are actionable
    expect(result.recommendations).toHaveLength(greaterThan(0));
    result.recommendations.forEach(rec => {
      expect(rec.action_items).toHaveLength(greaterThan(0));
    });
  });
});
```

## Mock Requirements

### LLM Service Mocks
- Plan generation responses
- Analysis and recommendation outputs
- Error scenarios and timeouts

### Database Mocks
- System logs with performance data
- Historical task execution records
- Plan templates with success metrics

### System Metrics
- Resource usage data
- Performance bottleneck scenarios
- Error pattern data

## Test Data Requirements

### Historical Performance Data
- Task execution times by type
- Success/failure rates
- Resource usage patterns
- Seasonal variations

### System Logs
- Performance degradation events
- Resource bottleneck incidents
- Error patterns and frequencies
- Recovery scenarios

### Plan Templates
- Successful plan examples
- Failed plan scenarios
- Resource allocation patterns
- Timeline estimation data

## Success Criteria

- [ ] Plan generation produces valid, executable plans
- [ ] Resource constraints are properly respected
- [ ] Historical data improves plan accuracy
- [ ] System analysis detects real performance issues
- [ ] Template matching finds relevant examples
- [ ] Resource predictions are reasonably accurate
- [ ] Integration with LLM service is reliable

## Implementation Priority

1. **High Priority**: Core plan generation and system analysis
2. **Medium Priority**: Template management and resource prediction
3. **Low Priority**: Advanced optimization and edge cases

## Dependencies

- LLM service for plan generation
- System metrics and logging infrastructure
- Historical task execution data
- Resource monitoring system
