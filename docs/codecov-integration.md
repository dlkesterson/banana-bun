# Codecov Integration Guide

This document explains how code coverage reporting is integrated with Codecov in this project.

## Overview

The project uses Bun's built-in test runner with coverage reporting to generate LCOV format coverage reports, which are automatically uploaded to Codecov via GitHub Actions.

## Configuration

### Bun Configuration (`bunfig.toml`)

```toml
[test]
coverage = true
coverageThreshold = { lines = 0.70, functions = 0.70, statements = 0.70 }
coverageReporter = ["text", "lcov"]
coverageDir = "coverage"
coverageSkipTestFiles = true
coverageIgnoreSourcemaps = false
```

### GitHub Actions Workflow

The CI workflow (`.github/workflows/ci.yml`) includes:

1. **Test Job with Coverage**:
   - Runs tests with coverage: `bun test --coverage --coverage-reporter=lcov`
   - Verifies coverage file exists
   - Uploads to Codecov using `codecov/codecov-action@v4`
   - Generates PR comments with coverage summary
   - Uploads coverage artifacts for other jobs

2. **Coverage Check Job**:
   - Downloads coverage artifacts from test job
   - Enforces minimum 80% coverage threshold
   - Fails CI if coverage is below threshold

## Features

### Automatic PR Comments

For pull requests, the workflow automatically:
- Generates a coverage summary comment
- Updates existing coverage comments instead of creating duplicates
- Provides links to detailed Codecov reports
- Shows coverage breakdown by metric (lines, functions, statements, branches)

### Coverage Artifacts

Coverage reports are shared between jobs using GitHub Actions artifacts:
- Avoids re-running tests multiple times
- Enables coverage threshold checking without test duplication
- Improves CI performance

### Verbose Reporting

The Codecov upload includes:
- Verbose logging for debugging
- Proper file path specification
- Failure handling with `fail_ci_if_error: true`
- Flags for categorizing coverage data

## Usage

### Local Development

Run tests with coverage locally:
```bash
# Generate coverage report
bun test --coverage

# Generate LCOV format specifically
bun test --coverage --coverage-reporter=lcov

# Use npm script
bun run test:coverage
```

### Verify Setup

Use the verification script to check your Codecov integration:
```bash
bun run verify-codecov
```

This script will:
- Check configuration files
- Run tests with coverage
- Verify coverage files are generated
- Display coverage summary
- Provide next steps

### View Coverage Reports

1. **Local**: Coverage reports are generated in the `coverage/` directory
2. **Codecov Dashboard**: Visit `https://codecov.io/gh/your-username/your-repo`
3. **PR Comments**: Coverage summaries appear automatically on pull requests

## Setup Requirements

### GitHub Repository Secrets

For private repositories, add the `CODECOV_TOKEN` secret:

1. Go to your repository on Codecov.io
2. Copy the upload token from repository settings
3. Add it as `CODECOV_TOKEN` in GitHub repository secrets

Public repositories don't require a token.

### Codecov GitHub App

Ensure the Codecov GitHub App is installed and has access to your repository:
1. Visit https://github.com/apps/codecov
2. Install or configure the app for your repository
3. Grant necessary permissions

## Coverage Thresholds

The project enforces coverage thresholds:
- **Minimum**: 70% (configured in bunfig.toml)
- **CI Requirement**: 80% (enforced in GitHub Actions)

To update thresholds:
1. Modify `bunfig.toml` for local development warnings
2. Update `.github/workflows/ci.yml` for CI enforcement

## Troubleshooting

### Coverage File Not Found

If coverage files aren't generated:
1. Check that tests are passing
2. Verify bunfig.toml configuration
3. Ensure coverage directory exists and is writable

### Codecov Upload Failures

If uploads fail:
1. Check CODECOV_TOKEN is set correctly (private repos)
2. Verify network connectivity in CI
3. Check Codecov service status
4. Review verbose logs in GitHub Actions

### Coverage Threshold Failures

If CI fails due to low coverage:
1. Add more tests to increase coverage
2. Review uncovered code in Codecov dashboard
3. Consider adjusting thresholds if appropriate
4. Use coverage exclusion comments for non-testable code

## Best Practices

1. **Write Tests First**: Aim for high coverage from the start
2. **Review Coverage Reports**: Use Codecov insights to identify gaps
3. **Set Realistic Thresholds**: Balance quality with development speed
4. **Exclude Non-Testable Code**: Use appropriate exclusion patterns
5. **Monitor Trends**: Watch for coverage regressions over time

## Integration with Development Workflow

The coverage integration is designed to:
- Provide immediate feedback on PR coverage impact
- Prevent merging code that reduces overall coverage
- Give visibility into test quality and completeness
- Support continuous improvement of test coverage

Coverage reports help maintain code quality while providing transparency into the testing process.
