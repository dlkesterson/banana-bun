# Test Assertions for Low-Coverage Files

This document provides targeted test assertions for the modules highlighted in [test-coverage-prd-achieve-80.md](test-coverage-prd-achieve-80.md). Each section summarizes the behaviour that should be covered by new unit tests.

## `src/db.ts`
- Verify `initDatabase()` creates required tables by checking that `Database.run` is called with `CREATE TABLE` statements.
- Mock failures in table creation to ensure errors are logged and rethrown.
- After initialization, confirm `getDatabase()` and `getDependencyHelper()` return the same instances created in `initDatabase()`.
- Confirm calling `getDatabase()` or `getDependencyHelper()` before initialization throws `Error('Database not initialized')`.

## `src/mcp/mcp-client.ts`
- Mock a server process to test that `startServer()` spawns the process, sends an `initialize` request and logs success.
- Ensure `sendRequest()` writes a JSON-RPC payload to `stdin` and resolves once `handleResponse()` receives a matching ID.
- Test that `sendRequest()` rejects with timeout when no response arrives.
- Verify that `handleResponse()` rejects pending promises when `response.error` is set.
- For methods such as `findSimilarTasks()` and `getTaskStatus()`, confirm they parse `result.content[0].text` JSON and return the parsed object, or `null` when empty.

## `src/tools/tool_runner.ts`
- `executeTool()` should log start and completion and return the result from the selected tool.
- Passing an unknown tool name should throw `Error('Unknown tool: name')`.
- `read_file` should read file contents and return `{ content }`.
- `write_file` should write the provided content and confirm the file path in the result.
- `rename_item` should invoke `fast_ollama_chat` and rename the file; ensure fallback logic triggers when the call fails.
- `yt_download` should create an output directory, pass correct arguments to `yt-dlp`, and throw when stderr contains errors.
- `s3_sync` should build the AWS CLI command according to options and write logs; verify error paths when credentials are missing or the command exits non‑zero.
- `ollama_chat` and `fast_ollama_chat` should send POST requests with expected payloads and handle non‑OK responses.

## `src/utils/logger.ts`
- Each log level (`info`, `warn`, `error`, `debug`) should call `_log` with the correct level string.
- `_log()` should create the logs directory when missing, append a line to the daily log file and output to `console.log`.
- When additional data is supplied, verify it is included in the JSON log entry.

## `src/mcp/resource-optimization-server.ts`
- When handling `ListToolsRequest`, the server should return tool descriptors containing the expected names (`analyze_resource_usage`, `optimize_load_balancing`, etc.).
- `CallToolRequest` with an unknown tool name should return an error response with `isError: true`.
- `analyzeResourceUsage()` should query the database for task metrics and return a JSON string containing `current_metrics` and `bottlenecks`.
- `optimizeLoadBalancing()` should compute current distribution, recommended distribution and rebalancing actions; verify results when `dry_run` is true versus false.
- `predictResourceBottlenecks()` should generate predictions only when random confidence meets the threshold.
- `suggestSchedulingWindows()` should build SQL with provided task types and include recommendations in the response.
- Ensure `calculateVariance()` and `calculateExpectedImprovement()` return expected numeric values given known inputs.
