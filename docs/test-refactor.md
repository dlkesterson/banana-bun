Detailed Analysis: Test Isolation and Module Caching Issues
🔍 Root Cause: Node.js/Bun Module Caching System
The fundamental issue preventing us from fixing all tests is how JavaScript runtimes handle module caching. Here's the detailed breakdown:

How Module Caching Works
// First import - module is loaded and cached
import { config } from '../src/config';
console.log(config.paths.outputs); // Uses environment variables at load time

// Later in the same process - module is retrieved from cache
import { config } from '../src/config'; // Same cached instance returned
console.log(config.paths.outputs); // Still uses OLD environment variables
The Specific Problem in Our Tests
Global test-setup.ts runs first and sets process.env.BASE_PATH = '/tmp/banana-bun-test-123'
Config module loads and reads environment variables, creating paths based on this BASE_PATH
Individual test files try to override process.env.BASE_PATH = '/tmp/my-test-456'
Config module is already cached - it doesn't re-read the new environment variables
Executors use the cached config with the old paths, causing file not found errors
🧪 Evidence from Our Testing
What We Observed:
```
# Test expects this path:
Expected: "/tmp/shell-executor-test-1751591212855/outputs/task-2-shell-output.txt"

# But executor uses this path (from cached config):
Received: "/tmp/executors-test-1751591152392/outputs/task-2-shell-output.txt"
```

Debug Output Showed:
```
// In shell-executor.test.ts
console.log('BASE_PATH in test:', process.env.BASE_PATH);
// Output: undefined (when run individually)
// Output: /tmp/banana-bun-test-123 (when run in suite)

// But the executor still used: /home/augment-agent/.local/share/banana-bun/outputs/
```
This proves the config module was using cached values, not current environment variables.

🔧 Solutions We Attempted and Why They Failed
Attempt 1: Dynamic Imports with Cache Busting
```
const { executeShellTask } = await import('../src/executors/shell?t=' + Date.now());
```
Why it failed: The executor imports the config module, which is still cached. Cache busting only works for the direct import, not transitive dependencies.

Attempt 2: Environment Variable Override
```
beforeEach(() => {
    process.env.BASE_PATH = TEST_DIR;
});
```
Why it failed: Config module already loaded and cached the old environment variables.

Attempt 3: Global Test Setup
```
// test-setup.ts sets global BASE_PATH
process.env.BASE_PATH = testBaseDir;
```
Why it partially worked: This works for the full test suite but not individual tests, because:

Individual tests don't load test-setup.ts
Different test files still conflict with each other
Attempt 4: Test Isolation Utilities
```
const testSetup = createTestIsolation({
    '../src/config': () => ({ config: mockConfig })
});
```
Why it was complex: Required mocking every dependency and maintaining mock consistency across all test files.

🎯 The Core Technical Challenge
Module Resolution Order:
1. test/executors.test.ts imports ../src/executors/shell
2. shell.ts imports ../src/config
3. config.ts reads process.env.BASE_PATH at module load time
4. Config object is created and cached
5. Later environment changes don't affect the cached config

Bun/Node.js Module Cache Behavior:
```
// This is what happens internally:
const moduleCache = new Map();

function require(modulePath) {
    if (moduleCache.has(modulePath)) {
        return moduleCache.get(modulePath); // Returns cached version
    }
    
    const module = loadAndExecuteModule(modulePath);
    moduleCache.set(modulePath, module);
    return module;
}
```

🔬 Specific Issues Encountered
1. Configuration Module Caching
```
// src/config.ts
export const config = {
    paths: getStandardDirectoryStructure(getDefaultBasePath())
    // ↑ This runs ONCE when module loads, not on each access
};
```
Problem: getDefaultBasePath() reads process.env.BASE_PATH once and caches the result.

2. Cross-Test Contamination
```
# Test 1 sets: BASE_PATH=/tmp/test-1
# Test 2 sets: BASE_PATH=/tmp/test-2
# But config still uses: BASE_PATH=/tmp/test-1 (cached)
```
3. Individual vs Suite Behavior
Individual test: No test-setup.ts, config uses default paths
Test suite: test-setup.ts sets global BASE_PATH, but individual tests try to override
Result: Inconsistent behavior depending on how tests are run
🛠 Potential Solutions for Research
1. Module Cache Clearing
```
// Theoretical approach (not available in standard Node.js/Bun)
delete require.cache[require.resolve('../src/config')];
```
Research Direction: Look into Bun-specific cache clearing APIs or test utilities.

2. Dependency Injection Pattern
```
// Instead of importing config directly
export function executeShellTask(task: ShellTask, configOverride?: Config) {
    const config = configOverride || defaultConfig;
    // ...
}
```
Research Direction: Refactor modules to accept configuration as parameters.

3. Environment-Aware Configuration
```
// Make config reactive to environment changes
export const config = {
    get paths() {
        return getStandardDirectoryStructure(getDefaultBasePath());
    }
};
```
Research Direction: Use getters to make config reactive to environment changes.

4. Test-Specific Module Loading
```
// Use different module resolution for tests
const moduleLoader = process.env.NODE_ENV === 'test' 
    ? testModuleLoader 
    : standardModuleLoader;
```
Research Direction: Custom module loaders or test-specific builds.

5. Process Isolation
```
// Run each test file in separate process
// Similar to Jest's --runInBand=false
```
Research Direction: Bun's process isolation capabilities for tests.

📊 Impact Analysis
Tests Affected by Module Caching:
Shell Executor Tests (4 failures) - Config paths cached
LLM Executor Tests (3 failures) - Ollama config cached
Cross-Modal CLI Tests (11 failures) - Database and service configs cached
Scheduler Tests (8 failures) - Service initialization cached
Enhanced Learning Service (4 failures) - Service dependencies cached
Total Impact: ~30 of 79 remaining failures are directly related to module caching issues.
🔍 Research Questions for Investigation
Bun-Specific Solutions:
Does Bun have test-specific module cache clearing?
Are there Bun test utilities for module isolation?
Can Bun's hot reload capabilities be leveraged for tests?
Configuration Architecture:
How do other projects handle environment-dependent configuration in tests?
What are best practices for reactive configuration systems?
Should configuration be lazy-loaded vs eager-loaded?
Test Framework Solutions:
Do other test frameworks (Vitest, Jest) have solutions for this?
Are there established patterns for module cache management in tests?
What do large TypeScript projects do for test isolation?
Alternative Approaches:
Should we use dependency injection throughout the codebase?
Would a service locator pattern help with test isolation?
Could we use environment-specific builds for testing?
💡 Immediate Workarounds We Implemented
Standardized test patterns to minimize conflicts
Proper cleanup procedures to prevent cross-test contamination
Documentation of the issues for future reference
Consistent environment handling where possible
The module caching issue is a fundamental challenge in JavaScript testing that requires either architectural changes to the codebase or advanced test framework features. This analysis should provide a solid foundation for researching solutions! 🚀