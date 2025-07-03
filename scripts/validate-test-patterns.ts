#!/usr/bin/env bun

/**
 * Script to validate that test files follow proper patterns for mock cleanup and isolation
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface ValidationResult {
    file: string;
    issues: string[];
    warnings: string[];
}

async function validateTestFile(filePath: string): Promise<ValidationResult> {
    const content = await readFile(filePath, 'utf-8');
    const issues: string[] = [];
    const warnings: string[] = [];
    
    // Check if file uses mock.module
    const usesMockModule = content.includes('mock.module(');
    
    if (usesMockModule) {
        // Check for afterAll cleanup
        if (!content.includes('afterAll(') || !content.includes('mock.restore()')) {
            issues.push('Missing afterAll(() => mock.restore()) cleanup');
        }
        
        // Check for complete db module mocks
        const dbMockMatch = content.match(/mock\.module\(['"`]\.\.\/src\/db['"`],\s*\(\)\s*=>\s*\({([^}]+)}\)/);
        if (dbMockMatch) {
            const mockContent = dbMockMatch[1];
            const hasGetDatabase = mockContent.includes('getDatabase');
            const hasInitDatabase = mockContent.includes('initDatabase');
            const hasGetDependencyHelper = mockContent.includes('getDependencyHelper');
            
            if (hasGetDatabase && !hasInitDatabase) {
                issues.push('Incomplete db mock: missing initDatabase export');
            }
            if (hasGetDatabase && !hasGetDependencyHelper) {
                issues.push('Incomplete db mock: missing getDependencyHelper export');
            }
        }
        
        // Check for proper imports
        if (!content.includes('afterAll') && content.includes('mock.module(')) {
            issues.push('Missing afterAll import when using mock.module');
        }
    }
    
    // Check for database cleanup
    if (content.includes('new Database(') && !content.includes('db.close()')) {
        warnings.push('Creates database but may not close it properly');
    }
    
    // Check for beforeEach/afterEach balance
    const beforeEachCount = (content.match(/beforeEach\(/g) || []).length;
    const afterEachCount = (content.match(/afterEach\(/g) || []).length;
    if (beforeEachCount > 0 && afterEachCount === 0) {
        warnings.push('Has beforeEach but no afterEach cleanup');
    }
    
    return {
        file: filePath,
        issues,
        warnings
    };
}

async function validateAllTestFiles(): Promise<void> {
    const testDir = join(process.cwd(), 'test');
    const files = await readdir(testDir);
    const testFiles = files.filter(f => f.endsWith('.test.ts') && !f.includes('template'));
    
    console.log(`🔍 Validating ${testFiles.length} test files...\n`);
    
    const results: ValidationResult[] = [];
    
    for (const file of testFiles) {
        const filePath = join(testDir, file);
        const result = await validateTestFile(filePath);
        results.push(result);
    }
    
    // Report results
    const filesWithIssues = results.filter(r => r.issues.length > 0);
    const filesWithWarnings = results.filter(r => r.warnings.length > 0);
    
    if (filesWithIssues.length === 0) {
        console.log('✅ All test files pass validation!');
    } else {
        console.log(`❌ Found issues in ${filesWithIssues.length} files:\n`);
        
        for (const result of filesWithIssues) {
            console.log(`📁 ${result.file}`);
            for (const issue of result.issues) {
                console.log(`  ❌ ${issue}`);
            }
            console.log();
        }
    }
    
    if (filesWithWarnings.length > 0) {
        console.log(`⚠️  Warnings in ${filesWithWarnings.length} files:\n`);
        
        for (const result of filesWithWarnings) {
            if (result.warnings.length > 0) {
                console.log(`📁 ${result.file}`);
                for (const warning of result.warnings) {
                    console.log(`  ⚠️  ${warning}`);
                }
                console.log();
            }
        }
    }
    
    // Summary
    console.log('📊 Summary:');
    console.log(`  Total files: ${testFiles.length}`);
    console.log(`  Files with issues: ${filesWithIssues.length}`);
    console.log(`  Files with warnings: ${filesWithWarnings.length}`);
    console.log(`  Clean files: ${testFiles.length - filesWithIssues.length - filesWithWarnings.length}`);
    
    if (filesWithIssues.length > 0) {
        console.log('\n💡 To fix issues, see test/README.md for best practices');
        process.exit(1);
    }
}

// Run validation
validateAllTestFiles().catch(console.error);
