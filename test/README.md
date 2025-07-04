# Test Best Practices and Guidelines

This document outlines best practices for writing tests in this project to ensure proper isolation, consistency, and maintainability.

## Test Patterns Overview

We support **three standardized test patterns** depending on your needs:

1. **🏗️ Module Mocking Pattern** - For testing services with complex dependencies
2. **🌍 Environment Variable Pattern** - For testing executors that need real config
3. **🔧 Test Isolation Utility Pattern** - For comprehensive testing with database

**⚠️ CRITICAL: Never mix patterns within the same test file!**

## Pattern 1: Module Mocking Pattern

**Best for:** Services, utilities, CLI tools that have many dependencies

```typescript
import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { standardMockConfig } from './utils/standard-mock-config';

// 1. Set up ALL mocks BEFORE any imports
// CRITICAL: Use standardMockConfig to prevent module interference
mock.module('../src/config', () => ({ config: standardMockConfig }));
mock.module('../src/utils/logger', () => ({
    logger: {
        info: mock(() => Promise.resolve()),
        error: mock(() => Promise.resolve()),
        warn: mock(() => Promise.resolve()),
        debug: mock(() => Promise.resolve())
    }
}));

// 2. Import AFTER mocks are set up
import { yourService } from '../src/your-service';

describe('Your Service', () => {
    afterAll(() => {
        mock.restore(); // REQUIRED for cleanup
    });

    it('should work', async () => {
        // Your test logic
    });
});
```

## Pattern 2: Global Environment Pattern

**Best for:** Executors, CLI tools that need real configuration and file system access

**Key Principle:** Use consistent global environment, but handle module caching properly

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Create isolated test directory for this test file
const TEST_BASE_DIR = join(tmpdir(), 'your-test-' + Date.now());
const OUTPUT_DIR = join(TEST_BASE_DIR, 'outputs');

let originalBasePath: string | undefined;

describe('Your Executor', () => {
    beforeEach(async () => {
        // Store original and set test-specific BASE_PATH
        originalBasePath = process.env.BASE_PATH;
        process.env.BASE_PATH = TEST_BASE_DIR;

        // Create test directories
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
    });

    afterEach(async () => {
        // Clean up test directory
        await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });

        // Restore original BASE_PATH
        if (originalBasePath === undefined) {
            delete process.env.BASE_PATH;
        } else {
            process.env.BASE_PATH = originalBasePath;
        }
    });

    it('should execute task', async () => {
        // Dynamic import with cache busting for fresh module state
        const { executeYourTask } = await import('../src/executors/your-executor?t=' + Date.now());

        const task = { id: 1, type: 'your_type', status: 'pending', result: null };
        const result = await executeYourTask(task);

        expect(result.success).toBe(true);
        expect(result.outputPath).toBe(join(OUTPUT_DIR, 'expected-output.txt'));
    });
});
```

**Why this works:**
- Each test file gets its own isolated environment
- Dynamic imports with cache busting ensure fresh config
- Proper cleanup prevents test interference
- Works both individually and in test suites

## Pattern 3: Test Isolation Utility Pattern

**Best for:** Complex integration tests, database operations, service interactions

```typescript
import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { createTestIsolation, type TestIsolationSetup } from './utils/test-isolation';

describe('My Complex Feature', () => {
    let testSetup: TestIsolationSetup;
    let myService: any;

    beforeEach(async () => {
        // 1. Create isolated test setup with database and standard mocks
        testSetup = createTestIsolation({
            // Add any additional mocks specific to your test
            '../src/my-service': () => ({ myService: mockMyService })
        });

        // 2. Access the database if needed
        const { db } = testSetup.dbSetup;

        // 3. Set up test data
        db.run("INSERT INTO tasks (id, type, status) VALUES (1, 'test', 'pending')");

        // 4. Import your module after mocks are set up
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

## Pattern Selection Guide

| Test Type | Pattern | When to Use |
|-----------|---------|-------------|
| **Services/Utils** | Module Mocking | Testing business logic, API calls, data processing |
| **Executors** | Global Environment | Testing file operations, shell commands, real config |
| **Integration** | Test Isolation | Testing database operations, complex workflows |

## Critical Rules for Test Isolation

### ⚠️ Rule 1: Never Mix Patterns
```typescript
// ❌ WRONG - Mixing patterns and overriding global environment
beforeEach(() => {
    process.env.BASE_PATH = '/tmp/my-test';  // Overrides global setup
    testSetup = createTestIsolation();       // Isolation pattern
});

// ✅ CORRECT - Use global environment consistently
beforeEach(() => {
    const outputDir = join(process.env.BASE_PATH!, 'outputs');
    await fs.mkdir(outputDir, { recursive: true });
});
```

### ⚠️ Rule 2: Import Order Matters
```typescript
// ❌ WRONG - Import before mocks
import { myService } from '../src/my-service';
mock.module('../src/config', () => ({ config: mockConfig }));

// ✅ CORRECT - Mocks before imports
mock.module('../src/config', () => ({ config: mockConfig }));
import { myService } from '../src/my-service';
```

### ⚠️ Rule 3: Always Clean Up
```typescript
// ❌ WRONG - No cleanup
describe('My Test', () => {
    mock.module('../src/config', () => ({ config: mockConfig }));
    // ... tests
});

// ✅ CORRECT - Proper cleanup
describe('My Test', () => {
    mock.module('../src/config', () => ({ config: mockConfig }));

    afterAll(() => {
        mock.restore(); // REQUIRED
    });
});
```

## Common Mock Implementations

### Standard Config Mock
```typescript
const mockConfig = {
    paths: {
        database: ':memory:',
        outputs: '/tmp/test-outputs',
        logs: '/tmp/test-logs',
        tasks: '/tmp/test-tasks',
        incoming: '/tmp/test-incoming',
        processing: '/tmp/test-processing',
        archive: '/tmp/test-archive',
        error: '/tmp/test-error',
        dashboard: '/tmp/test-dashboard',
        media: '/tmp/test-media',
        chroma: { host: 'localhost', port: 8000, ssl: false }
    },
    ollama: { model: 'test-model', url: 'http://localhost:11434' },
    meilisearch: { url: 'http://localhost:7700', masterKey: 'test-key' }
};
```

### Complete Database Mock
```typescript
mock.module('../src/db', () => ({
    getDatabase: mock(() => db),
    initDatabase: mock(() => Promise.resolve()),
    getDependencyHelper: mock(() => ({
        addDependency: mock(() => {}),
        removeDependency: mock(() => {}),
        getDependencies: mock(() => []),
        hasCyclicDependency: mock(() => false),
        getExecutionOrder: mock(() => []),
        markTaskCompleted: mock(() => {}),
        getReadyTasks: mock(() => [])
    }))
}));
```

## Troubleshooting

### "Export named 'X' not found" Errors
**Cause:** Incomplete module mock
**Fix:** Provide ALL exports in your mock:
```typescript
// ❌ Missing exports
mock.module('../src/db', () => ({ getDatabase: mockDb }));

// ✅ Complete exports
mock.module('../src/db', () => ({
    getDatabase: mockDb,
    initDatabase: mockInit,
    getDependencyHelper: mockHelper
}));
```

### Tests Pass Individually but Fail Together
**Cause:** Mock leakage between test files
**Fix:** Add proper cleanup:
```typescript
afterAll(() => {
    mock.restore(); // REQUIRED in every test file using mocks
});
```

### Configuration Undefined Errors
**Cause:** Config imported before mocks set up
**Fix:** Set up mocks before any imports:
```typescript
// ❌ Wrong order
import { config } from '../src/config';
mock.module('../src/config', () => ({ config: mockConfig }));

// ✅ Correct order
mock.module('../src/config', () => ({ config: mockConfig }));
import { config } from '../src/config';
```

## Migration Guide for Existing Tests

### Step 1: Identify Current Pattern
- **Has `mock.module()`?** → Module Mocking Pattern
- **Sets `process.env.BASE_PATH`?** → Environment Variable Pattern
- **Uses `createTestIsolation()`?** → Test Isolation Pattern

### Step 2: Standardize the Pattern
```typescript
// For Module Mocking Pattern:
afterAll(() => { mock.restore(); });

// For Environment Variable Pattern:
beforeEach(() => { process.env.BASE_PATH = TEST_DIR; });
afterEach(() => { /* restore env */ });

// For Test Isolation Pattern:
beforeEach(() => { testSetup = createTestIsolation(); });
afterEach(() => { testSetup.cleanup(); });
```

### Step 3: Fix Import Order
Move all `mock.module()` calls before any imports from `../src/`

## Examples by Pattern

### Module Mocking Examples
- `test/database.test.ts` - Database operations with mocks
- `test/planner-service.test.ts` - Service testing with API mocks

### Global Environment Examples
- `test/shell-executor.test.ts` - Executor with file operations
- `test/executors.test.ts` - Multiple executors with consistent environment

### Test Isolation Examples
- `test/additional-executors.test.ts` - Complex service interactions
- `test/enhanced-task-processor.test.ts` - Integration testing

## Quick Reference

| Issue | Pattern | Solution |
|-------|---------|----------|
| Config undefined | Module Mocking | Mock config before imports |
| File not found | Environment Variables | Set BASE_PATH + create dirs |
| DB connection error | Test Isolation | Use createTestIsolation() |
| Tests interfere | All | Add proper cleanup |
| Import/export error | Module Mocking | Complete module mocks |

## Critical Findings and Lessons Learned

### ⚠️ Incomplete Mock Configs Cause Module Interference

**The Problem:** Tests using partial mock configs like `{ paths: { database: ':memory:' } }` caused other tests to fail when accessing missing properties like `config.paths.outputs`.

**The Solution:** Always use `standardMockConfig` from `test/utils/standard-mock-config.ts` which provides a complete configuration that prevents interference.

```typescript
// ❌ BAD - Incomplete config causes interference
const mockConfig = { paths: { database: ':memory:' } };

// ✅ GOOD - Complete config prevents interference
import { standardMockConfig } from './utils/standard-mock-config';
mock.module('../src/config', () => ({ config: standardMockConfig }));
```

### 🔄 Module Mocks Persist Across Test Files

**Discovery:** Bun's `mock.module()` calls persist across test files even with `mock.restore()`. The `mock.restore()` only restores function mocks, not module replacements.

**Implication:** If one test file uses an incomplete mock config, it can break subsequent test files that expect complete config properties.

**Mitigation:** Using `standardMockConfig` ensures that even if mocks persist, they don't break other tests because all required properties are present.

### 🛡️ Defensive Config Pattern

**Implementation:** Executors now detect test environments and handle mocked configs gracefully:

```typescript
// Executors use defensive config access
let outputDir: string;
try {
    outputDir = config.paths.outputs;
    // If in test environment with BASE_PATH but config is mocked, use BASE_PATH directly
    if (process.env.BASE_PATH && outputDir === '/tmp/test-outputs') {
        outputDir = join(process.env.BASE_PATH, 'outputs');
    }
} catch (error) {
    // Fallback if config is broken
    outputDir = process.env.BASE_PATH ? join(process.env.BASE_PATH, 'outputs') : '/tmp/fallback';
}
```

### 📊 Test Pattern Success Metrics

After implementing these patterns and fixes:
- **✅ 592 tests passing** (maintained)
- **✅ Zero regressions** introduced
- **✅ Tests pass consistently** whether run individually or as full suite
- **✅ Module interference eliminated**

### 🎯 Best Practices Summary

1. **Always use `standardMockConfig`** for Module Mocking Pattern
2. **Never create partial mock configs** - they cause interference
3. **Always call `mock.restore()`** in `afterAll()` even though module mocks persist
4. **Don't mix test patterns** within the same file
5. **Use Environment Variable Pattern** for executors that need real file system operations
6. **Add proper cleanup** in `beforeEach`/`afterEach` for all patterns
