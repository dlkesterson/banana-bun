const fs = require('fs').promises;
const path = require('path');

async function getFiles(dir, pattern) {
    const files = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const subFiles = await getFiles(fullPath, pattern);
                files.push(...subFiles);
            } else if (entry.isFile() && pattern.test(entry.name)) {
                files.push(fullPath);
            }
        }
    } catch (error) {
        // Directory doesn't exist or can't be read
    }
    return files;
}

async function analyzeCoverage() {
    console.log('🔍 Analyzing test coverage...\n');

    const sourceFiles = await getFiles('src', /\.ts$/);
    const testFiles = await getFiles('test', /\.test\.ts$/);
    const actualSourceFiles = sourceFiles.filter(f => !f.endsWith('.d.ts'));

    console.log('📊 COVERAGE ANALYSIS RESULTS');
    console.log('============================\n');
    console.log(`📁 Total Source Files: ${actualSourceFiles.length}`);
    console.log(`🧪 Test Files: ${testFiles.length}`);

    console.log('\n✅ EXISTING TEST FILES:');
    testFiles.forEach(file => {
        console.log(`  • ${file}`);
    });

    const missingTests = [];
    const criticalFiles = ['src/index.ts', 'src/config.ts', 'src/dashboard.ts'];

    // Create mapping of test files to source files
    const testMappings = {
        'main-orchestrator.test.ts': 'src/index.ts',
        'config.test.ts': 'src/config.ts',
        'dashboard.test.ts': 'src/dashboard.ts',
        'enhanced-task-processor.test.ts': 'src/mcp/enhanced-task-processor.ts',
        'mcp-manager.test.ts': 'src/mcp/mcp-manager.ts',
        'mcp-client.test.ts': 'src/mcp/mcp-client.ts',
        'chromadb-server.test.ts': 'src/mcp/chromadb-server.ts',
        'monitor-server.test.ts': 'src/mcp/monitor-server.ts',
        'search-logs.test.ts': 'src/mcp/search-logs.ts',
        'services.test.ts': 'src/services/planner-service.ts',
        'cli-tools.test.ts': 'src/cli/lint-task.ts',
        'scheduler.test.ts': 'src/scheduler/task-scheduler.ts',
        'embeddings.test.ts': 'src/memory/embeddings.ts',
        'validation.test.ts': 'src/validation/schemas.ts',
        'database.test.ts': 'src/db.ts',
        'executors.test.ts': 'src/executors/dispatcher.ts',
        'utils.test.ts': 'src/utils/parser.ts',
        'file-processing.test.ts': 'src/utils/hash.ts',
        'retry-system.test.ts': 'src/retry/retry-manager.ts',
        'migration-runner.test.ts': 'src/migrations/migrate-all.ts',
        'periodic-tasks.test.ts': 'src/scheduler/cron-parser.ts',
        'type-guards.test.ts': 'src/validation/type-guards.ts',
        'task-types.test.ts': 'src/types/index.ts'
    };

    // Additional mappings for files covered by broader test suites
    const additionalCoverage = {
        'cli-tools.test.ts': ['src/cli/schedule-manager.ts'],
        'scheduler.test.ts': ['src/scheduler/cron-parser.ts'],
        'executors.test.ts': ['src/executors/shell.ts', 'src/executors/llm.ts', 'src/executors/code.ts', 'src/executors/tool.ts'],
        'additional-executors.test.ts': ['src/executors/batch.ts', 'src/executors/planner.ts', 'src/executors/review.ts', 'src/executors/run_code.ts', 'src/executors/youtube.ts'],
        'services.test.ts': ['src/services/review-service.ts'],
        'utils.test.ts': ['src/utils/task_converter.ts', 'src/utils/parent_task_utils.ts'],
        'validation.test.ts': ['src/validation/type-guards.ts']
    };

    const coveredFiles = new Set();
    testFiles.forEach(testFile => {
        const testName = path.basename(testFile);

        // Add primary mapping
        if (testMappings[testName]) {
            coveredFiles.add(testMappings[testName]);
        }

        // Add additional coverage
        if (additionalCoverage[testName]) {
            additionalCoverage[testName].forEach(file => coveredFiles.add(file));
        }

        // Also check for direct name matches
        const moduleName = path.basename(testFile, '.test.ts');
        actualSourceFiles.forEach(srcFile => {
            if (path.basename(srcFile, '.ts') === moduleName) {
                coveredFiles.add(srcFile);
            }
        });
    });

    actualSourceFiles.forEach(file => {
        if (!coveredFiles.has(file)) {
            let priority = 'low';
            if (criticalFiles.includes(file)) {
                priority = 'critical';
            } else if (file.includes('mcp/') || file.includes('scheduler/') || file.includes('memory/')) {
                priority = 'high';
            } else if (file.includes('executors/') || file.includes('services/') || file.includes('validation/')) {
                priority = 'medium';
            }
            missingTests.push({ file, priority });
        }
    });

    const testedCount = actualSourceFiles.length - missingTests.length;
    const coveragePercentage = Math.round((testedCount / actualSourceFiles.length) * 100);

    console.log(`\n📈 COVERAGE SUMMARY:`);
    console.log(`✅ Files with Tests: ${testedCount}`);
    console.log(`❌ Files Missing Tests: ${missingTests.length}`);
    console.log(`📊 Estimated Coverage: ${coveragePercentage}%\n`);

    const critical = missingTests.filter(t => t.priority === 'critical');
    const high = missingTests.filter(t => t.priority === 'high');
    const medium = missingTests.filter(t => t.priority === 'medium');

    if (critical.length > 0) {
        console.log('🚨 CRITICAL - NEEDS IMMEDIATE ATTENTION:');
        critical.forEach(item => console.log(`  • ${item.file}`));
        console.log();
    }

    if (high.length > 0) {
        console.log('⚠️  HIGH PRIORITY:');
        high.slice(0, 8).forEach(item => console.log(`  • ${item.file}`));
        if (high.length > 8) console.log(`  ... and ${high.length - 8} more`);
        console.log();
    }

    if (medium.length > 0) {
        console.log('📋 MEDIUM PRIORITY:');
        medium.slice(0, 5).forEach(item => console.log(`  • ${item.file}`));
        if (medium.length > 5) console.log(`  ... and ${medium.length - 5} more`);
        console.log();
    }

    console.log('💡 RECOMMENDATIONS:\n');
    console.log('  🎯 Great progress! You have added several important test files:');
    console.log('    ✅ config.test.ts - Configuration management');
    console.log('    ✅ dashboard.test.ts - Dashboard generation');  
    console.log('    ✅ enhanced-task-processor.test.ts - MCP functionality');
    console.log('    ✅ scheduler.test.ts - Task scheduling');
    console.log('    ✅ embeddings.test.ts - Vector embeddings');
    console.log('    ✅ validation.test.ts - Input validation');

    console.log('\n  📋 Next steps to improve coverage:');
    if (critical.length > 0) {
        console.log('    1. 🚨 Create tests for critical files (especially src/index.ts)');
    }
    console.log('    2. ⚙️  Add tests for remaining MCP components');
    console.log('    3. 🔧 Test CLI tools and services');
    console.log('    4. 📊 Run "bun run test:report" for detailed coverage');

    return { totalFiles: actualSourceFiles.length, testedFiles: testedCount, coveragePercentage };
}

analyzeCoverage().then(result => {
    if (result.coveragePercentage >= 70) {
        console.log('\n✅ Excellent coverage! Keep up the great work!');
    } else if (result.coveragePercentage >= 50) {
        console.log('\n⚠️  Good progress on coverage - keep going!');
    } else {
        console.log('\n❌ Coverage needs improvement - focus on critical files first!');
    }
}).catch(error => {
    console.error('Error:', error);
});
