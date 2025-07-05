# Test Infrastructure Fixes - Product Requirements Document

## Executive Summary

Following the successful resolution of database initialization issues affecting 280+ tests, this PRD outlines the systematic approach to fix the remaining test failures in the banana-bun project. The core infrastructure is now solid, and we can focus on addressing logical test issues, missing exports, configuration mismatches, and mock interface problems.

## Current Status

### ✅ Completed
- **Database Infrastructure**: All "Database not initialized" errors resolved
- **ES Module Mocking**: Fixed compatibility issues in test files
- **Global Test Setup**: Comprehensive database mocking strategy implemented

### 🔄 Current Test Results Summary
- **Total Tests**: 612
- **Passing**: ~319 (52%)
- **Failing**: ~293 (48%)
- **Key Achievement**: No more database initialization errors

## Problem Analysis

### 1. Missing Export Issues (Critical - Blocking Multiple Files)
**Files Affected**: `test/executors.test.ts`, `test/main-orchestrator.test.ts`
**Error**: `Export named 'executeMediaSummarizeTask' not found in module 'C:\Code\banana-bun\src\executors\summarize.ts'`
**Impact**: Complete test file failures
**Priority**: P0 - Critical

### 2. Configuration Structure Mismatches (High Impact)
**Files Affected**: `test/config.test.ts`
**Issues**:
- Missing `openai` configuration section
- Missing `ollama` configuration section  
- Missing `chroma` configuration section
- Missing `incoming` path in paths configuration
**Priority**: P1 - High

### 3. Database Closure Issues (Medium Impact)
**Files Affected**: `test/dashboard.test.ts`, `test/database.test.ts`
**Error**: `RangeError: Cannot use a closed database`
**Cause**: Tests trying to use databases after they've been closed
**Priority**: P1 - High

### 4. Test Expectation Mismatches (Medium Impact)
**Files Affected**: `test/additional-executors.test.ts`, `test/enhanced-task-processor.test.ts`
**Issues**:
- Tests expect `success: true` but get `success: false`
- Error message expectations don't match actual error messages
- Missing methods on service interfaces
**Priority**: P2 - Medium

### 5. Mock Interface Mismatches (Medium Impact)
**Files Affected**: Multiple test files
**Issues**:
- `embeddingManager.shutdown` is not a function
- Enhanced task processor missing methods
- Service mocks don't match actual interfaces
**Priority**: P2 - Medium

### 6. Timeout Issues (Low Impact)
**Files Affected**: `test/mcp-client.test.ts`
**Error**: Tests timing out after 30 seconds
**Priority**: P3 - Low

## Implementation Plan

### Phase 1: Critical Blocking Issues (P0)

#### Task 1.1: Fix Missing Export Issues
**Objective**: Resolve `executeMediaSummarizeTask` export error
**Files to Modify**:
- `src/executors/summarize.ts`
**Actions**:
1. Investigate current export structure in summarize.ts
2. Add missing `executeMediaSummarizeTask` export
3. Verify import statements in affected test files
**Success Criteria**: `test/executors.test.ts` and `test/main-orchestrator.test.ts` can import successfully

### Phase 2: High Impact Issues (P1)

#### Task 2.1: Fix Configuration Structure
**Objective**: Align configuration structure with test expectations
**Files to Modify**:
- `src/config.ts` (add missing sections)
- OR `test/config.test.ts` (update expectations)
**Actions**:
1. Analyze current config structure vs test expectations
2. Decide whether to add missing config sections or update tests
3. Implement chosen approach consistently
**Success Criteria**: All config tests pass

#### Task 2.2: Fix Database Closure Issues
**Objective**: Apply proper database mocking to remaining test files
**Files to Modify**:
- `test/dashboard.test.ts`
- `test/database.test.ts`
- `test/feedback-tracker.test.ts`
**Actions**:
1. Apply the same database mocking pattern used successfully in `test/additional-executors.test.ts`
2. Ensure proper database lifecycle management in tests
3. Add proper cleanup in afterEach hooks
**Success Criteria**: No more "Cannot use a closed database" errors

### Phase 3: Medium Impact Issues (P2)

#### Task 3.1: Fix Test Expectation Mismatches
**Objective**: Align test expectations with actual executor behavior
**Files to Modify**:
- `test/additional-executors.test.ts`
- `test/enhanced-task-processor.test.ts`
**Actions**:
1. Analyze actual executor return values and error messages
2. Update test expectations to match reality
3. Fix dependency-related test failures
**Success Criteria**: Executor tests pass with correct expectations

#### Task 3.2: Fix Mock Interface Mismatches
**Objective**: Ensure all mocks match actual service interfaces
**Files to Modify**:
- `test/embeddings.test.ts`
- `test/enhanced-task-processor.test.ts`
- Other files with mock interface issues
**Actions**:
1. Review actual service interfaces
2. Update mock implementations to match
3. Add missing methods to mocks
**Success Criteria**: No more "is not a function" errors

### Phase 4: Low Impact Issues (P3)

#### Task 4.1: Fix Timeout Issues
**Objective**: Resolve MCP client test timeouts
**Files to Modify**:
- `test/mcp-client.test.ts`
**Actions**:
1. Investigate why MCP client tests are timing out
2. Improve mock setup for faster test execution
3. Adjust timeout values if necessary
**Success Criteria**: MCP client tests complete within reasonable time

## Success Metrics

### Target Outcomes
- **Test Pass Rate**: Increase from 52% to 85%+
- **Zero Critical Errors**: No blocking import/export issues
- **Infrastructure Stability**: No database or mock-related failures
- **Maintainable Test Suite**: Clear patterns for future test development

### Key Performance Indicators
- Number of passing tests: Target 520+ (85% of 612)
- Number of test files with 100% pass rate: Target 80%+
- Average test execution time: Target <5 minutes for full suite
- Zero infrastructure-related test failures

## Risk Assessment

### High Risk
- **Configuration Changes**: Modifying core config might affect production code
- **Export Changes**: Adding exports might introduce unintended dependencies

### Medium Risk  
- **Test Expectation Changes**: Risk of masking real bugs by changing expectations
- **Mock Interface Changes**: Risk of tests passing but not reflecting real behavior

### Mitigation Strategies
- Thorough code review for all configuration changes
- Verify that test expectation changes reflect actual correct behavior
- Ensure mock interfaces accurately represent real service contracts

## Timeline

### Week 1: Critical Issues (P0)
- Day 1-2: Fix missing export issues
- Day 3: Verify and test export fixes

### Week 2: High Impact Issues (P1)  
- Day 1-3: Fix configuration structure issues
- Day 4-5: Fix database closure issues

### Week 3: Medium Impact Issues (P2)
- Day 1-3: Fix test expectation mismatches
- Day 4-5: Fix mock interface mismatches

### Week 4: Final Polish (P3)
- Day 1-2: Fix timeout issues
- Day 3-5: Final testing and documentation

## Dependencies

### Internal Dependencies
- Access to modify core configuration files
- Understanding of actual executor behavior vs expected behavior
- Knowledge of service interface contracts

### External Dependencies
- Bun test framework stability
- SQLite in-memory database reliability
- Mock library compatibility

## Conclusion

With the database infrastructure now solid, we have a clear path to achieving 85%+ test coverage. The systematic approach outlined in this PRD will address issues in order of impact, ensuring that critical blocking issues are resolved first, followed by high-impact structural issues, and finally polishing remaining edge cases.

The success of the database initialization fix demonstrates that systematic infrastructure improvements can have massive positive impact on test reliability and developer productivity.
