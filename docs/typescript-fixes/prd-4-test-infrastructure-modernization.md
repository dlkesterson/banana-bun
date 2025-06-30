# PRD 4: Test Infrastructure Modernization and Type Safety

## Problem Statement

The test infrastructure has significant TypeScript issues that are blocking CI/CD:

1. **Mock Type Mismatches**: Mocks don't properly implement the interfaces they're mocking
2. **Test Data Type Safety**: Test fixtures and data don't match expected types
3. **Incomplete Mock Implementations**: Mocks missing required properties/methods
4. **Database Test Setup**: Test database operations have type safety issues

## Root Cause Analysis

### Current Issues Found:
- 76+ errors in `test/mcp-client.test.ts` - mock implementation issues
- 22+ errors in `test/monitor-server.test.ts` - mock and type mismatches
- 21+ errors in `test/user-behavior-server.test.ts` - database mock issues
- 18+ errors in `test/mcp-manager.test.ts` - service mock problems
- Multiple test files have incomplete mock implementations
- Database query mocks don't match actual Database interface

### Core Problems:
1. **Mock Framework Inconsistency**: Different mocking approaches across test files
2. **Type-Unsafe Mocks**: Mocks created with `any` types instead of proper interfaces
3. **Database Mock Complexity**: Database interface is complex to mock properly
4. **Test Data Generation**: No standardized way to create valid test data
5. **Import/Export Issues**: Some modules don't export expected members

## Proposed Solution

### Phase 1: Mock Infrastructure Standardization

#### Type-Safe Mock Factory
```typescript
// Create a utility for type-safe mocks
function createMock<T>(partial: Partial<T> = {}): jest.Mocked<T> {
  return partial as jest.Mocked<T>;
}

// Database mock with proper interface
function createDatabaseMock(): jest.Mocked<Database> {
  return {
    query: jest.fn(),
    run: jest.fn(),
    exec: jest.fn(),
    prepare: jest.fn(),
    // ... all required Database methods
  };
}
```

#### Service Mock Templates
```typescript
// Standardized service mocks
function createMeilisearchServiceMock(): jest.Mocked<MeilisearchService> {
  return {
    indexDocument: jest.fn(),
    indexDocuments: jest.fn(),
    search: jest.fn(),
    // ... all required methods
  };
}
```

### Phase 2: Test Data Factories

#### Task Test Data
```typescript
interface TaskTestFactory {
  createShellTask(overrides?: Partial<ShellTask>): ShellTask;
  createLlmTask(overrides?: Partial<LlmTask>): LlmTask;
  createMediaTask(overrides?: Partial<MediaIngestTask>): MediaIngestTask;
  // ... for all task types
}
```

#### Database Test Data
```typescript
interface DatabaseTestFactory {
  createUserInteraction(overrides?: Partial<UserInteraction>): UserInteraction;
  createTaskRecord(overrides?: Partial<TaskRecord>): TaskRecord;
  createMediaRecord(overrides?: Partial<MediaRecord>): MediaRecord;
}
```

### Phase 3: Test Utilities and Helpers

#### Database Test Setup
```typescript
class TestDatabaseSetup {
  static async createTestDatabase(): Promise<Database>;
  static async seedTestData(db: Database): Promise<void>;
  static async cleanupTestData(db: Database): Promise<void>;
}
```

#### MCP Server Test Utilities
```typescript
class MCPServerTestUtils {
  static createMockMCPClient(): jest.Mocked<MCPClient>;
  static createMockMCPServer(): jest.Mocked<MCPServer>;
  static validateMCPResponse(response: any): boolean;
}
```

### Phase 4: Test Configuration Modernization

#### Jest Configuration Updates
- Ensure proper TypeScript support
- Configure module resolution for imports
- Set up test environment variables
- Configure coverage collection properly

#### Test Environment Setup
- Standardize test database configuration
- Mock external services consistently
- Set up proper test isolation

## Specific Fixes Needed

### Mock Implementation Issues
- `test/mcp-client.test.ts`: Fix fetch mock to properly implement fetch interface
- `test/user-behavior-server.test.ts`: Fix database mock to implement Database interface
- `test/monitor-server.test.ts`: Fix service mocks to match actual interfaces

### Import/Export Issues
- `test/search-logs.test.ts`: Fix missing `searchLogs` export
- `test/user-behavior-server.test.ts`: Fix missing `default` export issues
- Review all test imports for consistency

### Type Safety Issues
- Fix all `any` types in test files
- Ensure test data matches expected interfaces
- Add proper type assertions where needed

### Database Test Issues
- Fix SQLQueryBindings type issues
- Ensure all database operations are properly typed
- Add proper error handling for test database operations

## Success Criteria

- [ ] All test-related TypeScript errors resolved
- [ ] Standardized mock creation across all test files
- [ ] Type-safe test data factories for all major entities
- [ ] Consistent test database setup and teardown
- [ ] All tests pass with proper type checking
- [ ] Test coverage collection works properly
- [ ] Clear testing patterns and documentation

## Implementation Priority

**High Priority**: Tests are blocking CI/CD pipeline and preventing coverage reporting

## Dependencies

- Must align with service interface definitions (PRD 3)
- Requires task type system fixes (PRD 1)
- Database schema understanding for proper mocks

## Estimated Effort

**Medium-Large** - Significant refactoring of test infrastructure, but follows established patterns
