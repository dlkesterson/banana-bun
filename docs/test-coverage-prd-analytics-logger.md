# Test Coverage PRD: Analytics Logger

**File**: `src/analytics/logger.ts`  
**Current Coverage**: ~20% (Minimal coverage)  
**Target Coverage**: 85%  
**Priority**: High  

## Overview

The Analytics Logger is a core system component that tracks task execution metrics, performance analytics, and system bottlenecks. It provides critical data for system optimization and learning algorithms.

## File Purpose

The Analytics Logger implements:
- Task execution metrics tracking
- Performance analytics calculation
- Bottleneck identification
- Success rate monitoring
- Duration and timing analysis
- Error pattern detection

## Key Components to Test

### 1. AnalyticsLogger Class
- Task lifecycle tracking (start, completion, failure)
- Metrics calculation and aggregation
- Database operations for analytics data

### 2. Task Metrics Collection
- Task start/completion logging
- Duration measurement
- Retry count tracking
- Error reason capture

### 3. Analytics Generation
- Success rate calculations
- Performance bottleneck detection
- Task type statistics
- Trend analysis over time

### 4. Data Aggregation
- Time-based aggregations
- Task type groupings
- Performance percentiles
- Error categorization

## Test Assertions

### Unit Tests

#### Task Lifecycle Tracking
```typescript
describe('AnalyticsLogger.logTaskStart', () => {
  it('should log task start with correct timestamp', async () => {
    const task: BaseTask = {
      id: 123,
      type: 'llm',
      description: 'Test task',
      status: 'pending'
    };
    
    const startTime = Date.now();
    await analyticsLogger.logTaskStart(task);
    
    const metrics = await analyticsLogger.getTaskMetrics(123);
    expect(metrics.task_id).toBe(123);
    expect(metrics.status).toBe('running');
    expect(new Date(metrics.started_at).getTime()).toBeGreaterThanOrEqual(startTime);
  });

  it('should handle invalid task IDs gracefully', async () => {
    const invalidTask = { id: 'invalid', type: 'test' };
    
    await expect(analyticsLogger.logTaskStart(invalidTask))
      .not.toThrow();
  });

  it('should update existing task metrics on restart', async () => {
    const task = { id: 123, type: 'llm', status: 'pending' };
    
    await analyticsLogger.logTaskStart(task);
    await analyticsLogger.logTaskStart(task); // Restart
    
    const metrics = await analyticsLogger.getTaskMetrics(123);
    expect(metrics.retries).toBe(1);
  });
});

describe('AnalyticsLogger.logTaskCompletion', () => {
  it('should calculate accurate task duration', async () => {
    const task = { id: 123, type: 'llm', status: 'pending' };
    
    await analyticsLogger.logTaskStart(task);
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
    await analyticsLogger.logTaskCompletion(task, 'completed');
    
    const metrics = await analyticsLogger.getTaskMetrics(123);
    expect(metrics.duration_ms).toBeGreaterThanOrEqual(100);
    expect(metrics.status).toBe('completed');
    expect(metrics.finished_at).toBeDefined();
  });

  it('should record error details for failed tasks', async () => {
    const task = { id: 124, type: 'shell', status: 'pending' };
    const error = 'Command not found';
    
    await analyticsLogger.logTaskStart(task);
    await analyticsLogger.logTaskCompletion(task, 'error', error);
    
    const metrics = await analyticsLogger.getTaskMetrics(124);
    expect(metrics.status).toBe('error');
    expect(metrics.error_reason).toBe(error);
  });
});
```

#### Analytics Calculation
```typescript
describe('AnalyticsLogger.getTaskAnalytics', () => {
  it('should calculate correct success rate', async () => {
    // Setup test data: 7 successful, 3 failed tasks
    await setupTestTasks(7, 3);
    
    const analytics = await analyticsLogger.getTaskAnalytics();
    expect(analytics.total_tasks).toBe(10);
    expect(analytics.success_rate).toBeCloseTo(0.7, 2);
  });

  it('should identify most common failure reasons', async () => {
    await setupTasksWithErrors([
      'Network timeout',
      'Network timeout',
      'File not found',
      'Network timeout'
    ]);
    
    const analytics = await analyticsLogger.getTaskAnalytics();
    expect(analytics.most_common_failures).toHaveLength(2);
    
    const topFailure = analytics.most_common_failures[0];
    expect(topFailure.error_reason).toBe('Network timeout');
    expect(topFailure.count).toBe(3);
    expect(topFailure.percentage).toBeCloseTo(75, 1);
  });

  it('should calculate task type statistics', async () => {
    await setupMixedTaskTypes();
    
    const analytics = await analyticsLogger.getTaskAnalytics();
    expect(analytics.task_type_stats).toBeArray();
    
    const llmStats = analytics.task_type_stats.find(s => s.task_type === 'llm');
    expect(llmStats).toBeDefined();
    expect(llmStats.count).toBeGreaterThan(0);
    expect(llmStats.success_rate).toBeGreaterThanOrEqual(0);
    expect(llmStats.avg_duration_ms).toBeGreaterThan(0);
  });

  it('should detect performance bottlenecks', async () => {
    await setupSlowTasks();
    
    const analytics = await analyticsLogger.getTaskAnalytics();
    expect(analytics.bottlenecks).toBeArray();
    
    analytics.bottlenecks.forEach(bottleneck => {
      expect(bottleneck.task_type).toBeString();
      expect(bottleneck.avg_duration_ms).toBeGreaterThan(1000); // Slow tasks
      expect(bottleneck.slow_task_count).toBeGreaterThan(0);
    });
  });
});
```

#### Time-based Analytics
```typescript
describe('AnalyticsLogger.getAnalyticsForPeriod', () => {
  it('should filter analytics by date range', async () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    
    await setupTasksInDateRange(startDate, endDate);
    
    const analytics = await analyticsLogger.getAnalyticsForPeriod(startDate, endDate);
    expect(analytics.total_tasks).toBeGreaterThan(0);
    
    // Verify all tasks are within date range
    const tasks = await analyticsLogger.getTasksInPeriod(startDate, endDate);
    tasks.forEach(task => {
      const taskDate = new Date(task.started_at);
      expect(taskDate).toBeGreaterThanOrEqual(startDate);
      expect(taskDate).toBeLessThanOrEqual(endDate);
    });
  });

  it('should handle empty date ranges', async () => {
    const futureStart = new Date('2030-01-01');
    const futureEnd = new Date('2030-01-31');
    
    const analytics = await analyticsLogger.getAnalyticsForPeriod(futureStart, futureEnd);
    expect(analytics.total_tasks).toBe(0);
    expect(analytics.success_rate).toBe(0);
    expect(analytics.most_common_failures).toHaveLength(0);
  });
});
```

#### Performance Metrics
```typescript
describe('AnalyticsLogger.getPerformanceMetrics', () => {
  it('should calculate percentile durations', async () => {
    await setupTasksWithVariedDurations();
    
    const metrics = await analyticsLogger.getPerformanceMetrics();
    expect(metrics.duration_p50).toBeNumber();
    expect(metrics.duration_p95).toBeNumber();
    expect(metrics.duration_p99).toBeNumber();
    
    // P95 should be >= P50
    expect(metrics.duration_p95).toBeGreaterThanOrEqual(metrics.duration_p50);
    expect(metrics.duration_p99).toBeGreaterThanOrEqual(metrics.duration_p95);
  });

  it('should track memory and CPU usage trends', async () => {
    const metrics = await analyticsLogger.getPerformanceMetrics();
    
    if (metrics.memory_usage) {
      expect(metrics.memory_usage.average_mb).toBeGreaterThan(0);
      expect(metrics.memory_usage.peak_mb).toBeGreaterThanOrEqual(metrics.memory_usage.average_mb);
    }
    
    if (metrics.cpu_usage) {
      expect(metrics.cpu_usage.average_percent).toBeGreaterThanOrEqual(0);
      expect(metrics.cpu_usage.average_percent).toBeLessThanOrEqual(100);
    }
  });
});
```

### Integration Tests

#### Database Integration
```typescript
describe('Analytics Database Integration', () => {
  it('should persist analytics data correctly', async () => {
    const task = { id: 999, type: 'test', status: 'pending' };
    
    await analyticsLogger.logTaskStart(task);
    await analyticsLogger.logTaskCompletion(task, 'completed');
    
    // Verify data persists across logger instances
    const newLogger = new AnalyticsLogger();
    const metrics = await newLogger.getTaskMetrics(999);
    
    expect(metrics.task_id).toBe(999);
    expect(metrics.status).toBe('completed');
  });

  it('should handle database connection failures gracefully', async () => {
    // Mock database failure
    mockDatabaseFailure();
    
    const task = { id: 1000, type: 'test', status: 'pending' };
    
    // Should not throw, but log error
    await expect(analyticsLogger.logTaskStart(task))
      .not.toThrow();
  });
});
```

#### Real-time Analytics
```typescript
describe('Real-time Analytics Updates', () => {
  it('should update analytics in real-time as tasks complete', async () => {
    const initialAnalytics = await analyticsLogger.getTaskAnalytics();
    const initialCount = initialAnalytics.total_tasks;
    
    // Complete a new task
    const task = { id: 2000, type: 'test', status: 'pending' };
    await analyticsLogger.logTaskStart(task);
    await analyticsLogger.logTaskCompletion(task, 'completed');
    
    const updatedAnalytics = await analyticsLogger.getTaskAnalytics();
    expect(updatedAnalytics.total_tasks).toBe(initialCount + 1);
  });
});
```

## Mock Requirements

### Database Mocks
- Task execution records with varied durations
- Error patterns for failure analysis
- Historical data for trend analysis

### System Metrics
- Memory usage data
- CPU utilization metrics
- Network performance data

### Time-based Data
- Tasks distributed across different time periods
- Seasonal patterns in task execution
- Performance variations over time

## Test Data Requirements

### Task Execution Scenarios
- Fast-completing tasks (< 1s)
- Medium-duration tasks (1-10s)
- Slow tasks (> 10s)
- Failed tasks with various error types
- Retried tasks with multiple attempts

### Performance Patterns
- Gradual performance degradation
- Sudden performance spikes
- Resource exhaustion scenarios
- Network-related delays

## Success Criteria

- [ ] All analytics calculations are mathematically correct
- [ ] Performance metrics accurately reflect system behavior
- [ ] Error tracking captures all failure scenarios
- [ ] Time-based filtering works correctly
- [ ] Database operations are reliable and efficient
- [ ] Real-time updates function properly
- [ ] Memory usage is optimized for large datasets

## Implementation Priority

1. **High Priority**: Core metrics tracking and basic analytics
2. **Medium Priority**: Advanced analytics and bottleneck detection
3. **Low Priority**: Performance optimizations and edge cases

## Dependencies

- Database schema for analytics tables
- Task execution system for test data
- System monitoring for performance metrics
