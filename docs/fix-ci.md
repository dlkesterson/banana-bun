Thanks for the clarification. I’ll investigate the 10 errors listed in the GitHub Actions annotation list from the 'Test and Coverage' step of your PR for the 'fix/ts' branch, focusing on resolving issues that are blocking the test coverage report.

I’ll also incorporate the testing patterns outlined in `test/README.md`, `docs/test-refactor-plan.md`, and `docs/test-refactor-plan-2.md` to ensure compatibility with your refactor approach. I’ll get back to you with a summary of the root causes and proposed solutions.


# Fixing Test Failures Blocking Coverage

## 1. Ensure Proper Module Mocking Order (Bun’s `mock.module` Usage)

**Issue:** In `enhanced-task-processor.test.ts`, the Bun test mocks for dependencies are declared *after* importing the module under test. For example, the test imports `enhancedTaskProcessor` at the top, then calls `mock.module` to stub `embeddingManager` and `logger`. This means the actual `embeddingManager` and `logger` were already loaded into `enhancedTaskProcessor` before the mocks took effect. Consequently, calls like `embeddingManager.initialize()` weren’t using the mock (so the test spy never recorded a call) and errors weren’t caught as expected.

**Solution:** Use Bun’s module mocking *before* the module under test is imported. There are two approaches:

* **Use a Preload Script:** Define all necessary mocks in a separate file and preload it for tests. Bun’s docs recommend using the `--preload` flag to inject mocks early. For example, create **`test/preload-mocks.ts`** and in it:

  ```ts
  import { mock } from 'bun:test';
  // Stub the chromadb package to prevent import errors
  mock.module('chromadb', () => ({
    ChromaClient: class { 
      async getOrCreateCollection() { return { add: async()=>{}, query: async()=>({ metadatas: [[]], ids: [[]] }) }; }
    }
  }));
  // Stub the embeddings and logger modules
  mock.module('../src/memory/embeddings', () => ({
    embeddingManager: {
      initialize: mock(() => Promise.resolve()),
      findSimilarTasks: mock(() => Promise.resolve([])),
      addTaskEmbedding: mock(() => Promise.resolve()),
      shutdown: mock(() => Promise.resolve())
    }
  }));
  mock.module('../src/utils/logger', () => ({
    logger: {
      info: mock(() => Promise.resolve()),
      error: mock(() => Promise.resolve()),
      warn: mock(() => Promise.resolve()),
      debug: mock(() => Promise.resolve())
    }
  }));
  // (Add any other heavy dependencies to stub, e.g. '../src/db' if needed)
  ```

  Then run tests with: `bun test --preload test/preload-mocks.ts`. This ensures that when `enhanced-task-processor.ts` (or any other module) imports `embeddingManager` or `logger`, it gets the mocked versions. With this fix, your test expectations will align with actual calls: e.g. `expect(mockEmbeddingManager.initialize).toHaveBeenCalled()` will pass because the real initialization call hit the mock. Likewise, setting `mockEmbeddingManager.initialize.mockRejectedValueOnce(new Error('Init failed'))` will properly cause `enhancedTaskProcessor.initialize()` to reject, satisfying the `.rejects.toThrow('Init failed')` assertion (no more “promise resolved” error).

* **Dynamic Import After Mocks:** Alternatively, import the module under test *after* setting up mocks in the test file. For example, you could remove the top-level `import { enhancedTaskProcessor } ...` and instead do something like:

  ```ts
  beforeAll(async () => {
    // (set up mock.module for dependencies here)
    const mod = await import('../src/mcp/enhanced-task-processor');
    enhancedTaskProcessor = mod.enhancedTaskProcessor;
  });
  ```

  This ensures the mocks are in place when the module is loaded. In practice, the preload method is cleaner for multiple test files.

By reordering mocks, the **Enhanced Task Processor** tests should pass:

* The initializer test will see the mock’s calls (fixing *“Expected number of calls: 0”* on `.toHaveBeenCalled()`).
* The “Init failed” test will properly catch the thrown error instead of thinking the promise resolved.
* The tests expecting logging calls (e.g. `mockLogger.info` on init, `mockLogger.error` on embedding failure) will also pass since the real logger is stubbed.

## 2. Export/Import Fix for `verifyAllMigrations`

**Issue:** The error *“Export named 'verifyAllMigrations' not found in module '.../migrate-all.ts'”* indicates that the test is trying to import `verifyAllMigrations` but it wasn’t present at runtime. In `migration-runner.test.ts`, we see it importing `{ verifyAllMigrations }` from the migration module. The source code does export this function (along with `runAllMigrations`) in `migrate-all.ts`. So why is it “not found”?

Most likely, the module **failed to load fully**, so the export wasn’t registered. A common cause is an error during module initialization. Notably, `migrate-all.ts` imports the Chromadb client and instantiates an `EmbeddingManager` in `memory/embeddings.ts`. If the `chromadb` package isn’t installed in the CI environment, that import would throw, aborting module execution. In fact, the logs show an *“Unhandled error… cannot find package 'chromadb'”* right before tests started failing. That would prevent `verifyAllMigrations` from ever being defined, leading to the import error.

**Solution:** Make the migration module safe to load in test/CI or mock out the troublesome dependency:

* Since our tests don’t actually need to hit a real Chroma DB, you can reuse the **preload mock** approach above to stub the `'chromadb'` module (as shown). This will satisfy the import and avoid runtime errors when `EmbeddingManager` is constructed. After mocking, `MigrationRunner` and the convenience functions (`runAllMigrations`, `verifyAllMigrations`) can load normally. The test should then find the `verifyAllMigrations` export and pass.

* Double-check the import path in the test as well – it should match exactly how the module is exported. In this case `migrate-all.ts` is an ESM module, so `import { verifyAllMigrations } from '../src/migrations/migrate-all'` (without an extension) is correct in Bun. If there were a path or extension mismatch, adjust it. (For example, if `migrate-all.ts` was being imported as a compiled `.js` somewhere, it might miss the export. But in our repo, using the `.ts` path is fine under Bun’s TS support.)

After these fixes, the migration tests should load and execute. If `verifyAllMigrations` still isn’t found, verify that `migrate-all.ts` indeed exports it (it should — the code shows `export async function verifyAllMigrations(...) { … }`). Should the `verifyAllMigrations` function have been removed or renamed in the `fix/ts` branch, update the test accordingly (e.g., use `runner.verifyMigrations()` method directly, or import the new name). But given the error message, it was likely a loading issue rather than an intentional removal.

## 3. Fixing MCPClient Test Failures (Stubbing External Interactions)

The **MCP Client** tests are failing in multiple places due to unimplemented or incorrectly mocked methods (e.g. `smartSearch`, `stopServer`) and unexpected promise resolutions:

* *“TypeError: mcpClient.smartSearch is not a function”* – The `mcpClient` instance in tests is missing this method.
* *“TypeError: mcpClient.stopServer is not a function”* – Similarly, `stopServer` is undefined on the test instance.
* *“Expected promise that rejects but received resolved”* for calls that should error (lines 307 and 84 in the test).
* *“mcpClient.servers.has is undefined”* – indicating the internal `servers` map wasn’t properly set up.

**Cause:** These symptoms suggest that the MCPClient class was partially or improperly mocked in tests. The test likely created a dummy or stubbed version of `MCPClient` that did not fully implement all methods/properties expected. For example, if the test used `mock.module('../src/mcp/mcp-client', ...)` to override the export with a simplified class (perhaps to avoid spawning processes), they may have only implemented some methods and left out others like `smartSearch` or `stopServer`. As a result, calling those methods on the dummy instance throws `undefined is not a function`. Also, if the dummy didn’t set up a `servers` Map, references to `mcpClient.servers` would be undefined.

**Solution:** There are two paths here, depending on how you want to test `MCPClient`:

**a. Use the Real `MCPClient` Class but Stub Out External Effects:** This is often easiest to get tests passing while still exercising most logic. You can instantiate the real class in tests, then override specific behaviors:

* **Prevent actual subprocess spawning:** Intercept Bun’s spawn and the internal request handling. For example, use `mock.module('bun', () => ({ spawn: () => { 
      // Return a dummy process object
      return { stdin: { write: ()=>{} }, stdout: (async function*(){ /* no output */ })(), stderr: (async function*(){})(), kill: ()=>{} };
    }}));` in a preload or in the test setup. This way, calling `mcpClient.startServer()` won’t actually launch anything but will populate `mcpClient.servers` with a dummy entry. Ensure the dummy `stdout`/`stderr` are async iterators that terminate immediately (as shown) so that the for-await loops in `setupResponseHandler`/`setupErrorHandler` exit without hanging. You might also stub the initial `sendRequest('initialize', ...)` call to resolve successfully. For instance:

  ```ts
  mcpClient = new MCPClient();
  mcpClient.sendRequest = mock(async () => ({ content: [ { text: JSON.stringify({}) } ] })); 
  ``` 

  This makes `sendRequest` a no-op that returns an empty JSON result, satisfying any awaiting code. Using this approach, methods like `smartSearch` remain defined (since we’re using the real class) but their internals won’t actually reach out to external processes.
* **Simulate responses/errors for specific methods:** You can tailor the `sendRequest` stub per test to simulate different scenarios. For example, in a test expecting an error from `smartSearch("invalid query")`, have `mcpClient.sendRequest` throw or return a fake error result when called with that query. This will trigger the `.catch` in `smartSearch` and cause `mcpClient.smartSearch()` to reject as the test expects. Conversely, for a success path, return a fake successful payload. This avoids needing a real Meilisearch server or actual JSON-RPC responses. In Bun, you can also use `spyOn`/`jest.fn` on instance methods to achieve this.

Using the real class with these stubs fixes the “not a function” issues (since `smartSearch` and `stopServer` exist on the class) and gives you control over promise outcomes:

* Define `mcpClient.servers` as a new Map (the class constructor does this by default) so `.servers.has()` is valid. If you’ve intercepted `spawn`, ensure that in `startServer`, after your dummy server is set via `servers.set()`, you manually invoke any logic needed to mark it “connected” (perhaps faking an initialization response as above).
* Ensure to call `await mcpClient.stopServer(name)` in tests if you started one, so that the dummy process is “killed” and doesn’t leave hanging async tasks. (Our dummy `kill()` just does nothing, but calling it will break out of any loops if they’re waiting on EOF.)

**b. Or, Provide a Fully Featured Dummy MCPClient:** If you prefer to completely stub out MCPClient in tests, make sure your fake class implements all methods used. For example:

```ts
mock.module('../src/mcp/mcp-client', () => {
  class DummyMCPClient {
    servers = new Map<string, any>();
    async startServer(name: string, cmd: string, args: string[]) {
      // simulate a started server
      this.servers.set(name, { /* dummy server obj */ });
      return; 
    }
    async stopServer(name: string) {
      if (this.servers.has(name)) {
        this.servers.delete(name);
        // simulate logging if needed
      } else {
        // Optionally throw or log an error to simulate real behavior
      }
    }
    async smartSearch(query: string, options?: any) {
      if (query === "invalid query") throw new Error("Invalid query"); 
      return { /* fake search result data */ };
    }
    // ... implement any other method tests call (findSimilarTasks, etc.)
  }
  return { MCPClient: DummyMCPClient, mcpClient: new DummyMCPClient() };
});
```

This approach can work, but it’s easy to forget a method or property (leading to the kind of errors we saw). It also means you’re not testing any real logic of MCPClient – only your dummy. So, approach (a) is generally more robust and closer to the real code’s behavior, while still isolating external dependencies.

After applying these fixes, the MCP client tests should no longer throw type errors. For example, `mcpClient.smartSearch` will be a function (either real or fully mocked), so the “not a function” error goes away. If a test expected a rejected promise (e.g., calling `smartSearch` with an invalid input), your stubbed implementation should throw/reject accordingly so that `await expect(...).rejects.toThrow(...)` passes. Likewise, ensure `stopServer` is defined; if you don’t need to verify its internal behavior, a simple no-op (or a stub that deletes the map entry) is enough to avoid the undefined function error.

## 4. Other Considerations

* **WebSocket Server in Tests:** The `EnhancedTaskProcessor` starts a WebSocket server on port 8081 during initialization. In a CI environment, this could fail if the port is unavailable or if multiple tests run in parallel. If you encounter issues with this, consider mocking the `'ws'` module similarly (returning a stub `WebSocketServer` that no-ops on `.on()` and `.close`). Since our `mock.module` for `logger` and others already intercepts the most problematic parts, this may not be strictly necessary, but it’s good to be aware. For example, you could add:

  ```ts
  mock.module('ws', () => ({ 
    WebSocketServer: class { 
      on() {} 
      close() {} 
    } 
  }));
  ```

  in the preload file to prevent actually opening a socket.

* **GitHub Actions Cache Warnings:** The annotations show some cache restore/save failures (`Cache service responded with 503`). These warnings are coming from GitHub’s actions cache, not your tests. They don’t directly affect test results, except that the “Coverage Check” job was likely skipped because tests failed. You can usually ignore these or rerun the workflow – they are transient issues with the cache service. The primary goal is to get the tests green so the coverage job can produce a report.

By implementing the above changes – establishing consistent mocking patterns (preferably via a preload script) and simulating external systems like the database, chroma, and subprocesses – you align the tests with Bun’s best practices and eliminate the 10 annotated errors. This allows the **“Test & Coverage”** step to complete successfully, so the coverage report can be generated. The key is to **load modules in a controlled environment** where all external calls are either mocked or will no-op, thereby making tests deterministic and independent of missing packages or live services. Once these fixes are in place, re-run the PR’s CI workflow; the tests should pass and you’ll get a proper coverage report.

**Sources:**

* Bun 1.1 Testing Guide – on using `mock.module` and `--preload` for module mocking.
* Project code excerpts illustrating current test structure and needed changes (ordering of imports/mocks in `enhanced-task-processor.test.ts` and the failing expectations in CI annotations).
