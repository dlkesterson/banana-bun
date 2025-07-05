# Test Coverage Setup

This document explains the test coverage setup for the Banana Bun project.

## Overview

The project is configured to require a minimum of **25% test coverage** for all pull requests to pass CI checks.

## How It Works

1. **Test Execution**: Tests run with coverage collection using `bun test --coverage`
2. **Coverage Analysis**: The `lcov.info` file is parsed to calculate line coverage percentage
3. **Threshold Check**: Coverage must be >= 80% for CI to pass
4. **Failure Handling**: If coverage is below threshold, the CI build fails with helpful guidance

## CI Workflow

The GitHub Actions workflow includes these jobs:
- `test`: Runs tests and generates coverage reports
- `coverage-check`: Downloads coverage reports and validates the 80% threshold
- `ci-status`: Final status check that depends on all other jobs

## Local Testing

To check coverage locally:

```bash
# Run tests with coverage
bun run test:coverage

# Check coverage threshold (cross-platform)
bun run test:coverage:check

# Or run coverage check directly
bun run scripts/cross-platform-runner.ts check-coverage
```

## Coverage Scripts

- **Linux/macOS**: `scripts/check-coverage.sh`
- **Windows**: `scripts/check-coverage.ps1`
- **Cross-platform**: `scripts/cross-platform-runner.ts`

## Adjusting the Coverage Threshold

If you need to adjust the coverage threshold:

1. **For CI**: Update the `MIN_COVERAGE` variable in `.github/workflows/ci.yml`
2. **For local scripts**: Update the threshold in both `check-coverage.sh` and `check-coverage.ps1`

Current threshold: **80%**

## Improving Coverage

When coverage is below the threshold:

1. **Identify uncovered code**: Run `bun test --coverage` to see detailed coverage report
2. **Add tests**: Focus on files with low coverage first
3. **Test critical paths**: Ensure error handling and edge cases are covered
4. **Review test quality**: Make sure tests are meaningful, not just increasing numbers

## Coverage Reports

Coverage reports are generated in the `coverage/` directory:
- `lcov.info`: Machine-readable coverage data
- Text output: Human-readable coverage summary

## Branch Protection

To enforce coverage requirements:

1. Go to your GitHub repository settings
2. Navigate to "Branches"
3. Add a branch protection rule for your main branch
4. Require the "CI Status" check to pass before merging

This ensures that all PRs must pass the coverage threshold before they can be merged.
