# GitHub Actions Workflow Improvements for Codecov

This document contains the GitHub Actions workflow improvements that need to be applied manually to `.github/workflows/ci.yml` due to OAuth workflow scope limitations.

## Changes to Apply

### 1. Update Codecov Upload Step

**Current (lines 29-34):**
```yaml
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v4
      with:
        file: ./coverage/lcov.info
        fail_ci_if_error: true
        token: ${{ secrets.CODECOV_TOKEN }}
```

**Replace with:**
```yaml
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v4
      with:
        files: ./coverage/lcov.info
        fail_ci_if_error: true
        token: ${{ secrets.CODECOV_TOKEN }}
        verbose: true
        name: codecov-umbrella
        flags: unittests
```

### 2. Add Coverage File Verification

**Add after line 27 (after "Run tests with coverage"):**
```yaml
    - name: Verify coverage file exists
      run: |
        if [ ! -f "./coverage/lcov.info" ]; then
          echo "Coverage file not found at ./coverage/lcov.info"
          ls -la coverage/ || echo "Coverage directory does not exist"
          exit 1
        fi
        echo "Coverage file found, size: $(wc -l < ./coverage/lcov.info) lines"
```

### 3. Add PR Coverage Comments

**Add after the Codecov upload step:**
```yaml
    - name: Generate coverage summary for PR comment
      if: github.event_name == 'pull_request'
      run: |
        bun test --coverage --coverage-reporter=json-summary
        COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
        echo "COVERAGE_PERCENT=$COVERAGE" >> $GITHUB_ENV
        echo "## 📊 Coverage Report" >> coverage_comment.md
        echo "" >> coverage_comment.md
        echo "**Overall Coverage: ${COVERAGE}%**" >> coverage_comment.md
        echo "" >> coverage_comment.md
        echo "| Metric | Coverage |" >> coverage_comment.md
        echo "|--------|----------|" >> coverage_comment.md
        echo "| Lines | $(cat coverage/coverage-summary.json | jq '.total.lines.pct')% |" >> coverage_comment.md
        echo "| Functions | $(cat coverage/coverage-summary.json | jq '.total.functions.pct')% |" >> coverage_comment.md
        echo "| Statements | $(cat coverage/coverage-summary.json | jq '.total.statements.pct')% |" >> coverage_comment.md
        echo "| Branches | $(cat coverage/coverage-summary.json | jq '.total.branches.pct')% |" >> coverage_comment.md
        echo "" >> coverage_comment.md
        echo "📈 [View detailed coverage report on Codecov](https://codecov.io/gh/${{ github.repository }}/pull/${{ github.event.number }})" >> coverage_comment.md
        
    - name: Comment coverage on PR
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v7
      with:
        script: |
          const fs = require('fs');
          const coverageComment = fs.readFileSync('coverage_comment.md', 'utf8');
          
          // Find existing coverage comment
          const comments = await github.rest.issues.listComments({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number,
          });
          
          const existingComment = comments.data.find(comment => 
            comment.body.includes('📊 Coverage Report')
          );
          
          if (existingComment) {
            // Update existing comment
            await github.rest.issues.updateComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              comment_id: existingComment.id,
              body: coverageComment
            });
          } else {
            // Create new comment
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: coverageComment
            });
          }
```

### 4. Add Coverage Artifacts

**Add after the PR comment step:**
```yaml
    - name: Upload coverage artifacts
      uses: actions/upload-artifact@v4
      with:
        name: coverage-reports
        path: |
          coverage/
        retention-days: 1
```

### 5. Optimize Coverage Check Job

**Replace the entire coverage-check job (lines 167-203) with:**
```yaml
  coverage-check:
    name: Coverage Check
    runs-on: ubuntu-latest
    needs: test
    
    steps:
    - name: Download coverage artifacts
      uses: actions/download-artifact@v4
      with:
        name: coverage-reports
        path: coverage/
      
    - name: Check coverage threshold
      run: |
        if [ ! -f "coverage/coverage-summary.json" ]; then
          echo "Coverage summary file not found"
          exit 1
        fi
        COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
        echo "Current coverage: $COVERAGE%"
        if (( $(echo "$COVERAGE < 80" | bc -l) )); then
          echo "Coverage $COVERAGE% is below minimum threshold of 80%"
          exit 1
        fi
        echo "Coverage check passed!"
```

## Benefits of These Changes

1. **Fixed Parameter**: Changed `file` to `files` for proper Codecov action usage
2. **Better Debugging**: Added verbose logging and file verification
3. **PR Integration**: Automatic coverage comments on pull requests
4. **Performance**: Artifact sharing eliminates duplicate test runs
5. **Reliability**: Comprehensive error checking and validation

## How to Apply

1. Open `.github/workflows/ci.yml` in your editor
2. Apply each change section by section
3. Test the workflow by creating a test PR
4. Verify coverage comments appear on the PR
5. Check Codecov dashboard for proper integration

## Testing the Changes

After applying these changes:

1. Create a test PR with some code changes
2. Verify the CI workflow runs successfully
3. Check that coverage comments appear on the PR
4. Confirm coverage artifacts are uploaded
5. Validate Codecov dashboard shows the coverage data

The enhanced workflow will provide comprehensive coverage reporting with improved performance and better developer experience.
