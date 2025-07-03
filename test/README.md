# Test Best Practices and Guidelines

This document outlines best practices for writing tests in this project to ensure proper isolation, consistency, and maintainability.

## Critical Requirements for Test Isolation

### 1. Always Include Proper Mock Cleanup

Every test file that uses `mock.module()` MUST include proper cleanup:

```typescript
import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';

// ... your test setup ...

afterAll(() => {
    // Restore all mocks after all tests in this file complete
    mock.restore();
});
```

### 2. Complete Database Module Mocks

When mocking the `../src/db` module, ALWAYS provide ALL required exports:

```typescript
// ❌ WRONG - Incomplete mock causes import/export errors
mock.module('../src/db', () => ({
    getDatabase: mockGetDatabase
}));

// ✅ CORRECT - Complete mock with all exports
mock.module('../src/db', () => ({
    getDatabase: mockGetDatabase,
    initDatabase: mockInitDatabase,
    getDependencyHelper: mockGetDependencyHelper
}));
```

### 3. Standard Mock Implementations

Use consistent mock implementations across test files:

```typescript
const mockGetDatabase = mock(() => db);
const mockInitDatabase = mock(() => Promise.resolve());
const mockGetDependencyHelper = mock(() => ({
    addDependency: mock(() => {}),
    removeDependency: mock(() => {}),
    getDependencies: mock(() => []),
    hasCyclicDependency: mock(() => false),
    getExecutionOrder: mock(() => []),
    markTaskCompleted: mock(() => {}),
    getReadyTasks: mock(() => [])
}));
```

## Using the Test Utilities (Recommended for New Tests)

For new test files, use the provided test utilities for better consistency:

```typescript
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { createTestIsolation, type TestIsolationSetup } from './utils/test-isolation';

describe('My New Feature', () => {
    let testSetup: TestIsolationSetup;
    let myService: any;

    beforeEach(async () => {
        // Create isolated test setup with database and standard mocks
        testSetup = createTestIsolation({
            // Add any additional mocks specific to your test
            '../src/my-service': () => ({ myService: mockMyService })
        });

        // Access the database if needed
        const { db } = testSetup.dbSetup;
        
        // Import your module after mocks are set up
        const mod = await import('../src/my-module');
        myService = mod.myService;
    });

    afterEach(() => {
        // Clean up test isolation setup
        testSetup.cleanup();
    });

    afterAll(() => {
        // Ensure complete cleanup
        mock.restore();
    });

    it('should work correctly', async () => {
        const { db } = testSetup.dbSetup;
        // Your test logic here
    });
});
```

## Available Test Utilities

### Database Setup
- `createTestDbSetup()` - Creates isolated in-memory database with standard tables
- `createDbModuleMock(setup)` - Creates complete db module mock

### Common Mocks
- `createLoggerMock()` - Standard logger mock
- `createConfigMock(overrides)` - Standard config mock with customization
- `createAnalyticsLoggerMock()` - Analytics logger mock
- `createEmbeddingManagerMock()` - Embedding manager mock
- `createFeedbackTrackerMock()` - Feedback tracker mock

### Test Isolation
- `createTestIsolation(additionalMocks)` - Complete test setup with cleanup

## Common Patterns

### Database Tests
```typescript
beforeEach(async () => {
    testSetup = createTestIsolation();
    const { db } = testSetup.dbSetup;
    
    // Add test data
    db.run("INSERT INTO tasks (id, type, status) VALUES (1, 'test', 'pending')");
});
```

### Service Tests with External Dependencies
```typescript
beforeEach(async () => {
    testSetup = createTestIsolation({
        '../src/external-service': () => ({ service: mockExternalService }),
        '../src/another-dep': () => ({ dep: mockDependency })
    });
});
```

## Troubleshooting

### "Export named 'X' not found" Errors
This usually means a test file has an incomplete module mock. Check that:
1. All required exports are provided in the mock
2. The mock is set up before importing the module
3. `afterAll(() => mock.restore())` is present

### Tests Pass Individually but Fail Together
This indicates mock leakage between tests. Ensure:
1. Each test file has `afterAll(() => mock.restore())`
2. Database connections are properly closed in `afterEach`
3. Module mocks are complete and consistent

### Database Connection Errors
Make sure:
1. Each test creates its own database instance
2. Database is closed in `afterEach` or cleanup function
3. Database tables are created before use

## Migration Guide for Existing Tests

If you need to update an existing test file:

1. Add `afterAll` import: `import { ..., afterAll, ... } from 'bun:test'`
2. Add cleanup: `afterAll(() => { mock.restore(); })`
3. Ensure complete db mocks (if used)
4. Consider using test utilities for consistency

## Examples

See these files for good examples:
- `test/analyze-cross-modal-cli.test.ts` - CLI testing with mocks
- `test/database.test.ts` - Database testing with isolation
- `test/additional-executors.test.ts` - Service testing with multiple mocks
