# PRD 1: Task Type System Refactor

## Problem Statement

The current task type system has fundamental issues causing widespread TypeScript errors:

1. **Incomplete Task Objects in Tests**: Many tests create task objects missing required properties like `result`, `shell_command`, etc.
2. **Type Union Complexity**: The `BaseTask` type is a union of many specific task types, making it difficult to work with
3. **Missing Required Properties**: Task interfaces require properties that aren't always needed or available
4. **Type Narrowing Issues**: Code often can't properly narrow union types to specific task types

## Root Cause Analysis

### Current Issues Found:
- 23+ errors in `test/validation.test.ts` - missing `result` property in task objects
- 11+ errors in `test/task-types.test.ts` - type narrowing and missing properties
- 12+ errors in `test/utils.test.ts` - incomplete task objects in test data
- Multiple executor files have type mismatches with task IDs (string vs number)

### Core Problems:
1. **Required vs Optional Properties**: Properties like `result` are marked as required but should be optional for pending tasks
2. **Task Creation vs Task Execution**: Different contexts need different property requirements
3. **Test Data Inconsistency**: Test fixtures don't match the actual type requirements

## Proposed Solution

### Phase 1: Type Interface Restructuring
1. **Separate Creation and Runtime Types**:
   - `TaskCreationInput` - for creating new tasks (minimal required fields)
   - `TaskRuntime` - for tasks being executed (includes execution state)
   - `TaskComplete` - for completed tasks (includes results)

2. **Make Properties Contextually Optional**:
   - `result` should be optional until task completion
   - `started_at`, `finished_at` should be optional until set
   - Execution-specific properties should be optional in creation context

### Phase 2: Test Data Standardization
1. **Create Test Fixtures**: Standardized test data that matches type requirements
2. **Test Utilities**: Helper functions for creating valid test tasks
3. **Mock Factories**: Type-safe factories for different task states

### Phase 3: Type Guards and Utilities
1. **Enhanced Type Guards**: Better functions to narrow union types
2. **Task State Validation**: Runtime validation that matches TypeScript types
3. **Migration Utilities**: Tools to convert between different task representations

## Success Criteria

- [ ] All task-related TypeScript errors resolved
- [ ] Tests can create valid task objects without type errors
- [ ] Clear separation between task creation, execution, and completion states
- [ ] Type-safe task state transitions
- [ ] Comprehensive test coverage for task type system

## Implementation Priority

**High Priority**: This blocks CI/CD pipeline and affects all task-related functionality

## Dependencies

- Must coordinate with database schema (some properties may need to be nullable)
- Affects all executor implementations
- Impacts MCP server task handling

## Estimated Effort

**Large** - This is a foundational change affecting many files across the codebase
