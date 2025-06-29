#!/usr/bin/env bun

/**
 * Script to verify Codecov integration setup
 * This script checks that coverage reports are generated correctly
 * and can be uploaded to Codecov
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface CoverageSummary {
  total: {
    lines: { pct: number };
    functions: { pct: number };
    statements: { pct: number };
    branches: { pct: number };
  };
}

async function verifyCoverageSetup(): Promise<void> {
  console.log('🔍 Verifying Codecov setup...\n');

  // Check if bunfig.toml has correct coverage configuration
  console.log('1. Checking bunfig.toml configuration...');
  const bunfigPath = join(process.cwd(), 'bunfig.toml');
  if (!existsSync(bunfigPath)) {
    console.error('❌ bunfig.toml not found');
    process.exit(1);
  }

  const bunfigContent = readFileSync(bunfigPath, 'utf-8');
  const hasLcovReporter = bunfigContent.includes('lcov');
  const hasCoverageEnabled = bunfigContent.includes('coverage = true');
  
  if (!hasLcovReporter) {
    console.error('❌ LCOV reporter not configured in bunfig.toml');
    process.exit(1);
  }
  
  if (!hasCoverageEnabled) {
    console.error('❌ Coverage not enabled in bunfig.toml');
    process.exit(1);
  }
  
  console.log('✅ bunfig.toml correctly configured');

  // Check GitHub Actions workflow
  console.log('\n2. Checking GitHub Actions workflow...');
  const workflowPath = join(process.cwd(), '.github/workflows/ci.yml');
  if (!existsSync(workflowPath)) {
    console.error('❌ GitHub Actions CI workflow not found');
    process.exit(1);
  }

  const workflowContent = readFileSync(workflowPath, 'utf-8');
  const hasCodecovAction = workflowContent.includes('codecov/codecov-action');
  const hasLcovUpload = workflowContent.includes('lcov.info');
  
  if (!hasCodecovAction) {
    console.error('❌ Codecov action not found in workflow');
    process.exit(1);
  }
  
  if (!hasLcovUpload) {
    console.error('❌ LCOV file upload not configured');
    process.exit(1);
  }
  
  console.log('✅ GitHub Actions workflow correctly configured');

  // Run tests and generate coverage
  console.log('\n3. Running tests with coverage...');
  const testProcess = Bun.spawn(['bun', 'test', '--coverage', '--coverage-reporter=lcov', '--coverage-reporter=json-summary'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const testResult = await testProcess.exited;
  if (testResult !== 0) {
    console.error('❌ Tests failed');
    const stderr = await new Response(testProcess.stderr).text();
    console.error(stderr);
    process.exit(1);
  }
  
  console.log('✅ Tests completed successfully');

  // Check if coverage files were generated
  console.log('\n4. Verifying coverage files...');
  const lcovPath = join(process.cwd(), 'coverage/lcov.info');
  const summaryPath = join(process.cwd(), 'coverage/coverage-summary.json');
  
  if (!existsSync(lcovPath)) {
    console.error('❌ LCOV file not generated at coverage/lcov.info');
    process.exit(1);
  }
  
  if (!existsSync(summaryPath)) {
    console.error('❌ Coverage summary not generated at coverage/coverage-summary.json');
    process.exit(1);
  }
  
  console.log('✅ Coverage files generated successfully');

  // Parse and display coverage summary
  console.log('\n5. Coverage Summary:');
  try {
    const summaryContent = readFileSync(summaryPath, 'utf-8');
    const summary: CoverageSummary = JSON.parse(summaryContent);
    
    console.log(`📊 Lines: ${summary.total.lines.pct}%`);
    console.log(`📊 Functions: ${summary.total.functions.pct}%`);
    console.log(`📊 Statements: ${summary.total.statements.pct}%`);
    console.log(`📊 Branches: ${summary.total.branches.pct}%`);
    
    const overallCoverage = summary.total.lines.pct;
    if (overallCoverage >= 80) {
      console.log(`✅ Coverage ${overallCoverage}% meets minimum threshold of 80%`);
    } else {
      console.log(`⚠️  Coverage ${overallCoverage}% is below minimum threshold of 80%`);
    }
  } catch (error) {
    console.error('❌ Failed to parse coverage summary:', error);
    process.exit(1);
  }

  console.log('\n🎉 Codecov setup verification completed successfully!');
  console.log('\n📝 Next steps:');
  console.log('1. Ensure CODECOV_TOKEN is set in GitHub repository secrets (for private repos)');
  console.log('2. Create a PR to test the coverage reporting in action');
  console.log('3. Check Codecov dashboard at https://codecov.io/gh/your-username/your-repo');
}

// Run the verification
verifyCoverageSetup().catch((error) => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
