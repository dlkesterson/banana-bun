# Test Pattern Selector

Use this guide to choose the right test pattern for your test file.

## Quick Decision Tree

```
What are you testing?
├── Service/Utility with dependencies? → Module Mocking Pattern
├── Executor that needs file operations? → Environment Variable Pattern  
└── Complex integration with database? → Test Isolation Pattern
```

## Pattern 1: Module Mocking Pattern

**Use when:**
- Testing services, utilities, CLI tools
- Need to mock external dependencies (APIs, databases, services)
- Testing business logic without file system operations

**Template:**
```typescript
import { describe, it, expect, afterAll, mock } from 'bun:test';

// 1. Set up ALL mocks BEFORE imports
const mockConfig = { /* your config */ };
mock.module('../src/config', () => ({ config: mockConfig }));
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));

// 2. Import AFTER mocks
import { yourService } from '../src/your-service';

describe('Your Service', () => {
    afterAll(() => {
        mock.restore(); // REQUIRED
    });

    it('should work', async () => {
        // Test logic
    });
});
```

## Pattern 2: Environment Variable Pattern

**Use when:**
- Testing executors that need real configuration
- Need actual file system operations
- Testing shell commands, file I/O

**Template:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { join } from 'path';

const TEST_DIR = '/tmp/your-test-' + Date.now();
let originalBasePath: string | undefined;

describe('Your Executor', () => {
    beforeEach(async () => {
        originalBasePath = process.env.BASE_PATH;
        process.env.BASE_PATH = TEST_DIR;
        await fs.mkdir(TEST_DIR, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
        if (originalBasePath === undefined) {
            delete process.env.BASE_PATH;
        } else {
            process.env.BASE_PATH = originalBasePath;
        }
    });

    it('should execute task', async () => {
        const { executeYourTask } = await import('../src/executors/your-executor?t=' + Date.now());
        // Test logic
    });
});
```

## Pattern 3: Test Isolation Pattern

**Use when:**
- Testing complex integrations
- Need database operations
- Testing multiple services together

**Template:**
```typescript
import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { createTestIsolation, type TestIsolationSetup } from './utils/test-isolation';

describe('Your Integration', () => {
    let testSetup: TestIsolationSetup;

    beforeEach(async () => {
        testSetup = createTestIsolation({
            // Additional mocks
        });
        
        const { db } = testSetup.dbSetup;
        // Set up test data
    });

    afterEach(() => {
        testSetup.cleanup();
    });

    afterAll(() => {
        mock.restore();
    });

    it('should work', async () => {
        // Test logic
    });
});
```

## Examples by Type

| Test Type | Pattern | Example File |
|-----------|---------|--------------|
| Service | Module Mocking | `test/database.test.ts` |
| Executor | Environment Variables | `test/shell-executor.test.ts` |
| Integration | Test Isolation | `test/additional-executors.test.ts` |
| CLI | Module Mocking | `test/analyze-cross-modal-cli.test.ts` |
| Utilities | Module Mocking | `test/utils.test.ts` |
