# Test Coverage Improvement PRD

*Updated: 2025-??-??*

This PRD outlines the plan for increasing overall test coverage to at least **80%**.
The strategy focuses on creating new unit tests, fixing failing tests, and integrating
coverage checks into the CI pipeline.

## Objectives
- Achieve **80%** line coverage across the repository.
- Ensure new MCP server tests exceed existing coverage targets.
- Integrate coverage checks into branch protection rules.

## Current Status
- Latest `bun test --coverage` shows ~60% line coverage with many failing tests.
- Coverage threshold enforcement already exists in CI but fails due to low coverage.

## Key Actions
1. **Identify Low-Coverage Modules**
   - `src/services/planner-service.ts`
   - `src/services/review-service.ts`
   - `src/tools/tool_runner.ts`
   - `src/utils/hash.ts`
2. **Add Unit Tests**
   - Create dedicated tests for the modules above, mocking dependencies as needed.
   - Validate data retrieval, metrics calculation, tool execution paths, and hash output.
3. **Fix Existing Failing Tests**
   - Address missing mocks and database setup issues.
   - Ensure all existing tests pass so coverage is accurate.
4. **Add Integration Tests**
   - Expand cross-module workflow tests, following the new MCP servers suite.
5. **Run Coverage Reports Regularly**
   - Use `bun test` and `bun run test:report` to measure progress.
   - Update documentation when coverage milestones are reached.

## Acceptance Criteria
- Overall line coverage >= **80%** as reported in `coverage/coverage-summary.json`.
- All tests pass in CI with coverage check enabled.
- Documentation updated with coverage badge once threshold is met.

