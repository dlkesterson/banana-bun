# Testing Action Plan
## banana-bun Project Test Coverage Improvement

**Priority:** URGENT  
**Goal:** Stabilize test infrastructure and improve coverage from 41% to 80%

---

## 🚨 Phase 1: Fix Test Infrastructure (IMMEDIATE - Week 1)

### Critical Issues to Resolve

#### 1. Database Connection Problems
- **Issue:** SQLite databases being closed unexpectedly
- **Files affected:** `test/database.test.ts`, `test/enhanced-task-processor.test.ts`
- **Action:** Review database initialization in `test/setup.ts`
- **Priority:** P0 (Blocking all database tests)

#### 2. ChromaDB Integration Failures
- **Issue:** `undefined is not an object (evaluating 'c.headers.get')`
- **Files affected:** `test/embeddings.test.ts`, `test/chromadb-server.test.ts`
- **Action:** Fix ChromaDB mock setup and client initialization
- **Priority:** P0 (Blocking embedding tests)

#### 3. Missing Exports
- **Issue:** `Export named 'executeMediaSummarizeTask' not found`
- **Files affected:** `test/executors.test.ts`, `test/main-orchestrator.test.ts`
- **Action:** Add missing exports to `src/executors/summarize.ts`
- **Priority:** P0 (Blocking executor tests)

#### 4. Configuration Mismatches
- **Issue:** Tests expecting properties that don't exist in config
- **Files affected:** `test/config.test.ts`
- **Action:** Align test expectations with actual config structure
- **Priority:** P1

#### 5. Test Timeout Issues
- **Issue:** Tests taking 20+ minutes to execute
- **Files affected:** `test/mcp-client.test.ts`, `test/database.test.ts`
- **Action:** Optimize test setup and add proper mocking
- **Priority:** P1

---

## 🎯 Phase 2: Add Critical Core Tests (Week 2-3)

### Priority Order

#### P0: Main Entry Point
- [ ] `src/index.ts` - Main orchestrator initialization and shutdown
- [ ] `src/feedback-tracker.ts` - Core feedback system

#### P1: Core Executors (Most Critical)
- [ ] `src/executors/dispatcher.ts` - Task routing logic
- [ ] `src/executors/index.ts` - Executor registry
- [ ] `src/executors/llm.ts` - LLM integration
- [ ] `src/executors/summarize.ts` - Content summarization

#### P2: Essential MCP Servers
- [ ] `src/mcp/chromadb-server.ts` - Vector database operations
- [ ] `src/mcp/meilisearch-server.ts` - Search functionality
- [ ] `src/mcp/media-intelligence-server.ts` - AI media processing

#### P3: Key Services
- [ ] `src/services/embedding-service.ts` - Vector embeddings
- [ ] `src/services/meilisearch-service.ts` - Search service
- [ ] `src/services/enhanced-learning-service.ts` - AI learning

---

## 🔧 Phase 3: Improve Existing Coverage (Week 4-5)

### Target Improvements

#### Executors (Current: 12% → Target: 60%)
- Add comprehensive tests for task execution workflows
- Test error handling and retry logic
- Add integration tests for executor chains

#### MCP Servers (Current: 19% → Target: 50%)
- Test tool registration and execution
- Add error handling tests
- Test client-server communication

#### Services (Current: 30% → Target: 70%)
- Add business logic tests
- Test service integrations
- Add performance tests for critical paths

---

## 📋 Phase 4: Comprehensive Coverage (Week 6-8)

### Remaining Components

#### CLI Tools (29 files)
- **Priority:** Medium
- **Approach:** Focus on argument parsing and core functionality
- **Target:** 40% coverage (user-facing, less critical than core logic)

#### System Components
- [ ] `src/retry/retry-manager.ts`
- [ ] `src/scheduler/task-scheduler.ts`
- [ ] `src/tools/task_processor.ts`

#### Utilities and Types
- **Priority:** Low
- **Approach:** Add tests for complex utility functions only
- **Target:** 30% coverage (utilities often don't need extensive testing)

---

## 🛠️ Implementation Guidelines

### Test Structure
```typescript
// Example test structure for executors
describe('ExecutorName', () => {
  describe('Core Functionality', () => {
    it('should execute task successfully');
    it('should handle invalid input');
    it('should propagate errors correctly');
  });
  
  describe('Integration', () => {
    it('should work with real dependencies');
    it('should handle timeout scenarios');
  });
  
  describe('Error Handling', () => {
    it('should retry on transient failures');
    it('should fail fast on permanent errors');
  });
});
```

### Mocking Strategy
- **External Services:** Mock ChromaDB, Ollama, MeiliSearch
- **File System:** Use in-memory or temporary directories
- **Database:** Use separate test database with cleanup
- **Network:** Mock HTTP requests and WebSocket connections

### Test Data
- Use test factories from `src/test-utils/`
- Create realistic but minimal test data
- Ensure tests are deterministic and isolated

---

## 📊 Success Metrics

### Phase 1 (Infrastructure)
- [ ] All existing tests pass consistently
- [ ] Test execution time under 5 minutes
- [ ] Zero infrastructure-related test failures

### Phase 2 (Core Tests)
- [ ] File coverage: 41% → 60%
- [ ] Core components have >70% line coverage
- [ ] Critical paths are fully tested

### Phase 3 (Improvement)
- [ ] Line coverage: 27% → 50%
- [ ] Function coverage: 55% → 70%
- [ ] All executors have >60% coverage

### Phase 4 (Comprehensive)
- [ ] File coverage: 60% → 80%
- [ ] Line coverage: 50% → 70%
- [ ] All critical workflows tested end-to-end

---

## 🚀 Getting Started

### Immediate Actions (Today)
1. Run `bun test` to see current failures
2. Fix the missing export in `src/executors/summarize.ts`
3. Review and fix database setup in `test/setup.ts`
4. Address ChromaDB mock configuration

### This Week
1. Stabilize all existing tests
2. Add tests for `src/index.ts`
3. Begin executor testing with `dispatcher.ts`

### Tools and Resources
- Use `bun run analyze-coverage.ts` to track progress
- Reference existing test patterns in working test files
- Leverage test utilities in `src/test-utils/`
- Follow the project's existing testing conventions

---

*This action plan provides a structured approach to systematically improve test coverage while addressing critical infrastructure issues first.*
