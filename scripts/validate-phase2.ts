#!/usr/bin/env bun

/**
 * Phase 2 Implementation Validation Script
 * 
 * This script validates that all Phase 2 features are properly implemented
 * and integrated into the Atlas system.
 */

import { promises as fs } from 'fs';
import { join } from 'path';

interface ValidationResult {
    category: string;
    test: string;
    status: 'pass' | 'fail' | 'warning';
    message: string;
}

const results: ValidationResult[] = [];

function addResult(category: string, test: string, status: 'pass' | 'fail' | 'warning', message: string) {
    results.push({ category, test, status, message });
}

async function validateFileExists(filePath: string, description: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        addResult('Files', `${description} exists`, 'pass', `Found: ${filePath}`);
        return true;
    } catch (error) {
        addResult('Files', `${description} exists`, 'fail', `Missing: ${filePath}`);
        return false;
    }
}

async function validateFileContent(filePath: string, searchText: string, description: string): Promise<boolean> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.includes(searchText)) {
            addResult('Content', description, 'pass', `Found in ${filePath}`);
            return true;
        } else {
            addResult('Content', description, 'fail', `Not found in ${filePath}`);
            return false;
        }
    } catch (error) {
        addResult('Content', description, 'fail', `Cannot read ${filePath}: ${error}`);
        return false;
    }
}

async function validatePackageJson(): Promise<void> {
    try {
        const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
        
        // Check dependencies
        if (packageJson.dependencies?.openai) {
            addResult('Dependencies', 'OpenAI dependency', 'pass', `Version: ${packageJson.dependencies.openai}`);
        } else {
            addResult('Dependencies', 'OpenAI dependency', 'fail', 'OpenAI package not found in dependencies');
        }
        
        // Check scripts
        if (packageJson.scripts?.['atlas-summarize']) {
            addResult('Scripts', 'atlas-summarize script', 'pass', packageJson.scripts['atlas-summarize']);
        } else {
            addResult('Scripts', 'atlas-summarize script', 'fail', 'CLI script not found');
        }
        
    } catch (error) {
        addResult('Dependencies', 'package.json validation', 'fail', `Cannot read package.json: ${error}`);
    }
}

async function validateTypeDefinitions(): Promise<void> {
    const typesFile = 'src/types/task.ts';
    
    // Check for new task types
    const taskTypes = [
        'MediaSummarizeTask',
        'MediaRecommendTask', 
        'VideoSceneDetectTask',
        'VideoObjectDetectTask',
        'AudioAnalyzeTask'
    ];
    
    for (const taskType of taskTypes) {
        await validateFileContent(typesFile, taskType, `${taskType} interface defined`);
    }
    
    // Check TASK_TYPES array
    await validateFileContent(typesFile, 'media_summarize', 'media_summarize in TASK_TYPES');
}

async function validateServices(): Promise<void> {
    const services = [
        { file: 'src/services/summarizer.ts', class: 'SummarizerService', description: 'Summarizer service' }
    ];
    
    for (const service of services) {
        await validateFileExists(service.file, service.description);
        await validateFileContent(service.file, service.class, `${service.class} class defined`);
    }
}

async function validateExecutors(): Promise<void> {
    const executors = [
        { file: 'src/executors/summarize.ts', function: 'executeMediaSummarizeTask', description: 'Summarization executor' }
    ];
    
    for (const executor of executors) {
        await validateFileExists(executor.file, executor.description);
        await validateFileContent(executor.file, executor.function, `${executor.function} function defined`);
    }
    
    // Check dispatcher integration
    await validateFileContent('src/executors/dispatcher.ts', 'media_summarize', 'Summarization executor in dispatcher');
}

async function validateCLICommands(): Promise<void> {
    const commands = [
        { file: 'src/cli/atlas-summarize.ts', description: 'Atlas summarize CLI command' }
    ];
    
    for (const command of commands) {
        await validateFileExists(command.file, command.description);
        await validateFileContent(command.file, 'parseCliArgs', 'CLI argument parsing');
        await validateFileContent(command.file, 'printUsage', 'CLI help text');
    }
}

async function validateMigrations(): Promise<void> {
    const migrationFile = 'src/migrations/008-add-phase2-features.ts';
    
    await validateFileExists(migrationFile, 'Phase 2 migration file');
    await validateFileContent(migrationFile, 'ALTER TABLE media_transcripts ADD COLUMN summary', 'Summary column migration');
    await validateFileContent(migrationFile, 'CREATE TABLE IF NOT EXISTS user_interactions', 'User interactions table migration');
    await validateFileContent(migrationFile, 'CREATE TABLE IF NOT EXISTS video_scenes', 'Video scenes table migration');
    await validateFileContent(migrationFile, 'CREATE TABLE IF NOT EXISTS audio_features', 'Audio features table migration');
    
    // Check migration registration
    await validateFileContent('src/migrations/migrate-all.ts', 'migration008', 'Migration 008 registered');
}

async function validateDocumentation(): Promise<void> {
    const docs = [
        { file: 'docs/PHASE2-IMPLEMENTATION.md', description: 'Phase 2 implementation documentation' }
    ];
    
    for (const doc of docs) {
        await validateFileExists(doc.file, doc.description);
        await validateFileContent(doc.file, 'Content Summarization', 'Summarization feature documented');
        await validateFileContent(doc.file, 'atlas-summarize', 'CLI usage documented');
    }
}

async function validateTests(): Promise<void> {
    const testFiles = [
        { file: 'test/phase2-summarization.test.ts', description: 'Phase 2 summarization tests' }
    ];
    
    for (const testFile of testFiles) {
        await validateFileExists(testFile.file, testFile.description);
        await validateFileContent(testFile.file, 'SummarizerService', 'Summarizer service tests');
        await validateFileContent(testFile.file, 'MediaSummarizeTask', 'Summarization task tests');
    }
}

function printResults(): void {
    console.log('\n🔍 Atlas Phase 2 Implementation Validation Results');
    console.log('='.repeat(55));
    
    const categories = [...new Set(results.map(r => r.category))];
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let warnings = 0;
    
    for (const category of categories) {
        console.log(`\n📂 ${category}:`);
        const categoryResults = results.filter(r => r.category === category);
        
        for (const result of categoryResults) {
            const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
            console.log(`  ${icon} ${result.test}: ${result.message}`);
            
            totalTests++;
            if (result.status === 'pass') passedTests++;
            else if (result.status === 'fail') failedTests++;
            else warnings++;
        }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Total tests: ${totalTests}`);
    console.log(`   ✅ Passed: ${passedTests}`);
    console.log(`   ❌ Failed: ${failedTests}`);
    console.log(`   ⚠️  Warnings: ${warnings}`);
    
    const successRate = Math.round((passedTests / totalTests) * 100);
    console.log(`   📈 Success rate: ${successRate}%`);
    
    if (failedTests === 0) {
        console.log('\n🎉 All Phase 2 implementation checks passed!');
    } else {
        console.log('\n🚨 Some implementation checks failed. Please review the results above.');
    }
}

async function main(): Promise<void> {
    console.log('🚀 Starting Atlas Phase 2 Implementation Validation...\n');
    
    try {
        // Run all validation checks
        await validatePackageJson();
        await validateTypeDefinitions();
        await validateServices();
        await validateExecutors();
        await validateCLICommands();
        await validateMigrations();
        await validateDocumentation();
        await validateTests();
        
        // Print results
        printResults();
        
        // Exit with appropriate code
        const failedTests = results.filter(r => r.status === 'fail').length;
        process.exit(failedTests > 0 ? 1 : 0);
        
    } catch (error) {
        console.error('❌ Validation failed with error:', error);
        process.exit(1);
    }
}

main();
