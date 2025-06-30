# PRD 3: Service Interface Completion and Method Implementation

## Problem Statement

Multiple service classes are missing methods that are expected by their consumers, causing TypeScript errors:

1. **Missing Service Methods**: Services referenced in code but not implemented
2. **Interface Mismatches**: Services don't fully implement their expected interfaces
3. **Method Signature Inconsistencies**: Existing methods have wrong signatures
4. **Incomplete MCP Server Implementations**: MCP servers missing expected functionality

## Root Cause Analysis

### Current Issues Found:
- `AnalyticsLogger.getTaskTrends()` - method doesn't exist (used in analyze-task-metrics.ts)
- `MeilisearchService.indexDocument()` - method doesn't exist (used in multiple executors)
- `MeilisearchService.indexDocuments()` - method doesn't exist (used in recommend.ts, scene-detect.ts)
- `TaskScheduler.getDueSchedules()` - method doesn't exist (used in scheduler.test.ts)
- `TaskScheduler.canExecuteSchedule()` - method doesn't exist (used in scheduler.test.ts)
- `PlannerService.decomposeGoal()` - method doesn't exist (used in services.integration.test.ts)
- `ReviewService.reviewTask()` - method doesn't exist (used in multiple test files)

### Core Problems:
1. **Incomplete Service Implementation**: Services were partially implemented
2. **Missing Interface Definitions**: No formal interfaces defining expected methods
3. **Test-Driven Assumptions**: Tests assume methods exist that were never implemented
4. **Inconsistent Method Naming**: Similar functionality has different method names across services

## Proposed Solution

### Phase 1: Service Interface Audit
1. **Catalog Expected Methods**: Review all service usage to identify expected methods
2. **Define Formal Interfaces**: Create TypeScript interfaces for each service
3. **Gap Analysis**: Identify which methods are missing vs incorrectly implemented

### Phase 2: Core Service Method Implementation

#### AnalyticsLogger Service
```typescript
interface IAnalyticsLogger {
  getTaskTrends(days: number): Promise<TaskTrend[]>;
  logTaskMetric(taskId: string, metric: string, value: number): Promise<void>;
  getPerformanceMetrics(timeRange: TimeRange): Promise<PerformanceMetrics>;
}
```

#### MeilisearchService
```typescript
interface IMeilisearchService {
  indexDocument(index: string, document: any): Promise<void>;
  indexDocuments(index: string, documents: any[]): Promise<void>;
  search(index: string, query: string, options?: SearchOptions): Promise<SearchResult>;
  deleteDocument(index: string, id: string): Promise<void>;
}
```

#### TaskScheduler
```typescript
interface ITaskScheduler {
  getDueSchedules(): Promise<Schedule[]>;
  canExecuteSchedule(scheduleId: string): boolean;
  scheduleTask(task: Task, schedule: ScheduleConfig): Promise<string>;
  cancelSchedule(scheduleId: string): Promise<void>;
}
```

### Phase 3: MCP Server Method Completion

#### Media Intelligence Server
- `optimizeContentTagging()` - missing implementation
- `generateContentRecommendations()` - missing (has generateDiscoveryRecommendations)
- `enhanceSemanticSearch()` - missing implementation
- `trackUserBehavior()` - missing implementation
- `getIntelligenceDashboard()` - missing implementation
- `correlateSearchTranscription()` - missing implementation

#### Other MCP Servers
- Review all MCP servers for missing tool implementations
- Ensure all advertised tools have working implementations

### Phase 4: Service Integration Testing
1. **Mock Service Implementations**: For testing purposes
2. **Integration Test Coverage**: Verify all service methods work together
3. **Error Handling**: Consistent error handling across all services

## Implementation Strategy

### Priority Order:
1. **High Impact Services**: MeilisearchService, AnalyticsLogger (used by many components)
2. **Core Functionality**: TaskScheduler, PlannerService, ReviewService
3. **MCP Server Completion**: Media Intelligence and other incomplete servers
4. **Testing Infrastructure**: Mock implementations and integration tests

### Method Implementation Approach:
1. **Start with Interfaces**: Define the contract first
2. **Stub Implementation**: Create basic implementations that satisfy TypeScript
3. **Full Implementation**: Add actual functionality
4. **Testing**: Verify each method works as expected

## Success Criteria

- [ ] All missing service methods implemented
- [ ] Formal interfaces defined for all services
- [ ] All TypeScript errors related to missing methods resolved
- [ ] MCP servers fully implement their advertised tools
- [ ] Integration tests verify service interactions
- [ ] Consistent error handling across all services

## Implementation Priority

**High Priority**: Missing methods are blocking functionality and tests

## Dependencies

- Database schema may need updates for new analytics/metrics storage
- MCP server protocol compliance
- Service configuration and initialization

## Estimated Effort

**Large** - Significant implementation work, but well-defined scope
