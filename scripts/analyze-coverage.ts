#!/usr/bin/env bun

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

interface CoverageData {
    file: string;
    functionsFound: number;
    functionsHit: number;
    linesFound: number;
    linesHit: number;
    branchesFound: number;
    branchesHit: number;
}

interface UncoveredFile {
    path: string;
    type: 'source' | 'test';
    category: string;
}

function getAllSourceFiles(dir: string, baseDir: string = dir): string[] {
    const files: string[] = [];

    try {
        const items = readdirSync(dir);

        for (const item of items) {
            const fullPath = join(dir, item);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                // Skip node_modules, .git, coverage, etc.
                if (!['node_modules', '.git', 'coverage', 'dist', 'build'].includes(item)) {
                    files.push(...getAllSourceFiles(fullPath, baseDir));
                }
            } else if (stat.isFile()) {
                // Include TypeScript files
                if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
                    const relativePath = relative(baseDir, fullPath).replace(/\\/g, '/');
                    files.push(relativePath);
                }
            }
        }
    } catch (error) {
        console.warn(`Warning: Could not read directory ${dir}:`, error);
    }

    return files;
}

function parseLcovFile(filePath: string): CoverageData[] {
    try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const coverageData: CoverageData[] = [];
        let currentFile: Partial<CoverageData> = {};

        for (const line of lines) {
            if (line.startsWith('SF:')) {
                // Source file
                currentFile.file = line.substring(3).replace(/\\/g, '/');
            } else if (line.startsWith('FNF:')) {
                // Functions found
                currentFile.functionsFound = parseInt(line.substring(4));
            } else if (line.startsWith('FNH:')) {
                // Functions hit
                currentFile.functionsHit = parseInt(line.substring(4));
            } else if (line.startsWith('LF:')) {
                // Lines found
                currentFile.linesFound = parseInt(line.substring(3));
            } else if (line.startsWith('LH:')) {
                // Lines hit
                currentFile.linesHit = parseInt(line.substring(3));
            } else if (line.startsWith('BRF:')) {
                // Branches found
                currentFile.branchesFound = parseInt(line.substring(4));
            } else if (line.startsWith('BRH:')) {
                // Branches hit
                currentFile.branchesHit = parseInt(line.substring(4));
            } else if (line === 'end_of_record') {
                // End of record
                if (currentFile.file) {
                    coverageData.push({
                        file: currentFile.file,
                        functionsFound: currentFile.functionsFound || 0,
                        functionsHit: currentFile.functionsHit || 0,
                        linesFound: currentFile.linesFound || 0,
                        linesHit: currentFile.linesHit || 0,
                        branchesFound: currentFile.branchesFound || 0,
                        branchesHit: currentFile.branchesHit || 0,
                    });
                }
                currentFile = {};
            }
        }

        return coverageData;
    } catch (error) {
        console.error('Error reading lcov file:', error);
        return [];
    }
}

function categorizeFile(filePath: string): string {
    // Remove src/ prefix if present for consistent categorization
    const normalizedPath = filePath.replace(/^src[\/\\]/, '');

    if (normalizedPath.startsWith('cli/')) return 'CLI Tools';
    if (normalizedPath.startsWith('executors/')) return 'Executors';
    if (normalizedPath.startsWith('mcp/')) return 'MCP Servers';
    if (normalizedPath.startsWith('services/')) return 'Services';
    if (normalizedPath.startsWith('utils/')) return 'Utilities';
    if (normalizedPath.startsWith('types/')) return 'Type Definitions';
    if (normalizedPath.startsWith('migrations/')) return 'Database Migrations';
    if (normalizedPath.startsWith('scheduler/')) return 'Scheduler';
    if (normalizedPath.startsWith('memory/')) return 'Memory/Embeddings';
    if (normalizedPath.startsWith('analytics/')) return 'Analytics';
    if (normalizedPath.startsWith('retry/')) return 'Retry System';
    if (normalizedPath.startsWith('validation/')) return 'Validation';
    if (normalizedPath.startsWith('tools/')) return 'Tools';
    if (normalizedPath.startsWith('test-utils/')) return 'Test Utilities';
    if (normalizedPath.startsWith('test/')) return 'Tests';
    return 'Core';
}

function calculateCoveragePercentage(hit: number, found: number): number {
    return found > 0 ? Math.round((hit / found) * 100) : 100;
}

function main() {
    console.log('🔍 Analyzing Test Coverage for banana-bun project\n');

    // Get all source files
    const allSourceFiles = getAllSourceFiles('src');
    const allTestFiles = getAllSourceFiles('test');

    console.log(`📁 Found ${allSourceFiles.length} source files and ${allTestFiles.length} test files\n`);

    // Parse coverage data
    const coverageData = parseLcovFile('coverage/lcov.info');
    const coveredFiles = new Set(coverageData.map(d => d.file));

    console.log(`📊 Coverage data found for ${coverageData.length} files\n`);

    // Find uncovered files - need to match the path format from coverage data
    const uncoveredSourceFiles: UncoveredFile[] = allSourceFiles
        .filter(file => {
            // Try both formats: with and without src/ prefix, and with both slash types
            const srcPath = `src/${file}`;
            const srcPathBackslash = `src\\${file.replace(/\//g, '\\')}`;
            return !coveredFiles.has(file) && !coveredFiles.has(srcPath) && !coveredFiles.has(srcPathBackslash);
        })
        .map(file => ({
            path: file,
            type: 'source' as const,
            category: categorizeFile(file)
        }));

    // Group uncovered files by category
    const uncoveredByCategory = uncoveredSourceFiles.reduce((acc, file) => {
        if (!acc[file.category]) acc[file.category] = [];
        acc[file.category].push(file.path);
        return acc;
    }, {} as Record<string, string[]>);

    // Display results
    console.log('🚨 UNCOVERED SOURCE FILES:\n');

    if (uncoveredSourceFiles.length === 0) {
        console.log('✅ All source files have test coverage!\n');
    } else {
        console.log(`❌ ${uncoveredSourceFiles.length} source files lack test coverage:\n`);

        Object.entries(uncoveredByCategory)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([category, files]) => {
                console.log(`📂 ${category} (${files.length} files):`);
                files.sort().forEach(file => {
                    console.log(`   • ${file}`);
                });
                console.log();
            });
    }

    // Coverage summary for covered files
    console.log('📈 COVERAGE SUMMARY FOR COVERED FILES:\n');

    const categoryStats = coverageData.reduce((acc, data) => {
        const category = categorizeFile(data.file);
        if (!acc[category]) {
            acc[category] = {
                files: 0,
                totalLines: 0,
                coveredLines: 0,
                totalFunctions: 0,
                coveredFunctions: 0
            };
        }

        acc[category].files++;
        acc[category].totalLines += data.linesFound;
        acc[category].coveredLines += data.linesHit;
        acc[category].totalFunctions += data.functionsFound;
        acc[category].coveredFunctions += data.functionsHit;

        return acc;
    }, {} as Record<string, any>);

    Object.entries(categoryStats)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([category, stats]) => {
            const linesCoverage = calculateCoveragePercentage(stats.coveredLines, stats.totalLines);
            const functionsCoverage = calculateCoveragePercentage(stats.coveredFunctions, stats.totalFunctions);

            console.log(`📂 ${category}:`);
            console.log(`   Files: ${stats.files}`);
            console.log(`   Lines: ${linesCoverage}% (${stats.coveredLines}/${stats.totalLines})`);
            console.log(`   Functions: ${functionsCoverage}% (${stats.coveredFunctions}/${stats.totalFunctions})`);
            console.log();
        });

    // Overall statistics
    const totalLines = coverageData.reduce((sum, data) => sum + data.linesFound, 0);
    const coveredLines = coverageData.reduce((sum, data) => sum + data.linesHit, 0);
    const totalFunctions = coverageData.reduce((sum, data) => sum + data.functionsFound, 0);
    const coveredFunctions = coverageData.reduce((sum, data) => sum + data.functionsHit, 0);

    const overallLinesCoverage = calculateCoveragePercentage(coveredLines, totalLines);
    const overallFunctionsCoverage = calculateCoveragePercentage(coveredFunctions, totalFunctions);

    console.log('🎯 OVERALL COVERAGE STATISTICS:\n');
    console.log(`📁 Total source files: ${allSourceFiles.length}`);
    console.log(`✅ Files with coverage: ${coverageData.length}`);
    console.log(`❌ Files without coverage: ${uncoveredSourceFiles.length}`);
    console.log(`📊 File coverage: ${calculateCoveragePercentage(coverageData.length, allSourceFiles.length)}%`);
    console.log(`📈 Line coverage: ${overallLinesCoverage}% (${coveredLines}/${totalLines})`);
    console.log(`🔧 Function coverage: ${overallFunctionsCoverage}% (${coveredFunctions}/${totalFunctions})`);
    console.log();

    // Recommendations
    console.log('💡 RECOMMENDATIONS:\n');

    if (uncoveredSourceFiles.length > 0) {
        const priorityCategories = ['Core', 'Executors', 'Services', 'MCP Servers'];
        const highPriorityUncovered = uncoveredSourceFiles.filter(file =>
            priorityCategories.includes(file.category)
        );

        if (highPriorityUncovered.length > 0) {
            console.log('🔥 High Priority (Core functionality):');
            highPriorityUncovered.forEach(file => {
                console.log(`   • ${file.path}`);
            });
            console.log();
        }

        console.log('📝 Consider adding tests for uncovered files to improve reliability');
        console.log('🎯 Focus on Core, Executors, Services, and MCP Servers first');
        console.log('🧪 Utility and type files can have lower priority');
    } else {
        console.log('🎉 Excellent! All source files have test coverage.');
        console.log('🔍 Consider reviewing low-coverage files to improve test quality');
    }
}

if (import.meta.main) {
    main();
}
