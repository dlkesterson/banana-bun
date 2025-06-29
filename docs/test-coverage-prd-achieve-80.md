# Test Coverage PRD: Achieving 80% Overall Coverage

**Generated**: 2025-06-29

**Current Coverage**: 56.63% lines, 63.14% functions (see `coverage-report.log`).
**Target Coverage**: 80%+ lines repository wide.

## Coverage Snapshot

The latest coverage report highlights several areas with extremely low coverage:

- `src/db.ts` – **2.94%** lines
- `src/mcp/mcp-client.ts` – **0.84%** lines
- `src/tools/tool_runner.ts` – **5.49%** lines
- `src/utils/logger.ts` – **8.20%** lines
- `src/mcp/resource-optimization-server.ts` – **26.41%** lines

Overall only **56.63%** of lines are covered and **289** tests pass while **288** fail.

## Objectives

- Increase overall line coverage to **80%** or higher.
- Reduce failing tests to zero so coverage accurately reflects the codebase.
- Add targeted unit tests for the lowest covered modules listed above.
- Expand integration tests around MCP servers and CLI tools.
- Integrate coverage checks into CI to enforce the threshold.

## Key Actions

1. **Stabilize Existing Tests**
   - Investigate failing suites (e.g., dashboard generation and file processing).
   - Mock external services and databases to remove nondeterminism.
2. **Create Unit Tests for Low Coverage Files**
   - `src/db.ts` – mock SQLite interactions and verify queries.
   - `src/mcp/mcp-client.ts` – test request/response handling and error paths.
   - `src/tools/tool_runner.ts` – cover basic tool execution and edge cases.
   - `src/utils/logger.ts` – verify log formatting and log level filtering.
3. **Add Integration Tests**
   - Exercise MCP servers end-to-end via their JSON-RPC interfaces.
   - Simulate CLI workflows such as media organization and smart transcription.
4. **Automate Coverage Enforcement**
   - Add `bun run test:coverage` in CI with a coverage threshold of 80%.
   - Fail builds when coverage or test suites regress.
5. **Monitor Progress**
   - Generate weekly coverage reports and update this document with metrics.

## Acceptance Criteria

- `coverage-report.log` shows overall line coverage >= **80%**.
- All tests pass (`bun test`) with no errors.
- Coverage check integrated into CI pipeline.
- Documentation updated with the new coverage status and badge.
