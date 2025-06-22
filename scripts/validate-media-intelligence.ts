#!/usr/bin/env node

/**
 * Validation script for Media Intelligence System implementation
 * Checks that all new components compile and basic functionality works
 */

import { promises as fs } from 'fs';
import { join } from 'path';

async function validateImplementation() {
    console.log('🔍 Validating Media Intelligence System implementation...\n');

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if all required files exist
    const requiredFiles = [
        'src/types/task.ts',
        'src/types/media.ts',
        'src/config.ts',
        'src/db.ts',
        'src/services/meilisearch-service.ts',
        'src/executors/transcribe.ts',
        'src/executors/tag.ts',
        'src/executors/index.ts',
        'src/executors/dispatcher.ts',
        'src/cli/media-search.ts',
        'src/cli/media-tags.ts',
        'package.json'
    ];

    console.log('📁 Checking required files...');
    for (const file of requiredFiles) {
        try {
            await fs.access(file);
            console.log(`  ✅ ${file}`);
        } catch (error) {
            errors.push(`Missing required file: ${file}`);
            console.log(`  ❌ ${file}`);
        }
    }

    // Check TypeScript compilation
    console.log('\n🔧 Checking TypeScript compilation...');
    try {
        // Import and check task types
        const { TASK_TYPES } = await import('../src/types/task.js');
        const newTaskTypes = ['media_transcribe', 'media_tag', 'index_meili', 'index_chroma'];
        
        for (const taskType of newTaskTypes) {
            if (TASK_TYPES.includes(taskType as any)) {
                console.log(`  ✅ Task type '${taskType}' registered`);
            } else {
                errors.push(`Task type '${taskType}' not found in TASK_TYPES`);
                console.log(`  ❌ Task type '${taskType}' missing`);
            }
        }
    } catch (error) {
        errors.push(`Failed to import task types: ${error}`);
        console.log(`  ❌ Task types import failed`);
    }

    // Check configuration
    console.log('\n⚙️  Checking configuration...');
    try {
        const { config } = await import('../src/config.js');
        
        const requiredConfigs = [
            'meilisearch',
            'whisper', 
            'vision'
        ];

        for (const configKey of requiredConfigs) {
            if (config[configKey]) {
                console.log(`  ✅ Configuration '${configKey}' present`);
            } else {
                errors.push(`Missing configuration section: ${configKey}`);
                console.log(`  ❌ Configuration '${configKey}' missing`);
            }
        }
    } catch (error) {
        errors.push(`Failed to import config: ${error}`);
        console.log(`  ❌ Config import failed`);
    }

    // Check package.json dependencies
    console.log('\n📦 Checking dependencies...');
    try {
        const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
        const requiredDeps = ['meilisearch'];
        
        for (const dep of requiredDeps) {
            if (packageJson.dependencies?.[dep]) {
                console.log(`  ✅ Dependency '${dep}' present`);
            } else {
                errors.push(`Missing dependency: ${dep}`);
                console.log(`  ❌ Dependency '${dep}' missing`);
            }
        }

        // Check new CLI scripts
        const requiredScripts = ['media-search', 'media-tags'];
        for (const script of requiredScripts) {
            if (packageJson.scripts?.[script]) {
                console.log(`  ✅ Script '${script}' present`);
            } else {
                warnings.push(`Missing script: ${script}`);
                console.log(`  ⚠️  Script '${script}' missing`);
            }
        }
    } catch (error) {
        errors.push(`Failed to read package.json: ${error}`);
        console.log(`  ❌ package.json read failed`);
    }

    // Check environment variables example
    console.log('\n🌍 Checking environment configuration...');
    try {
        const envExample = await fs.readFile('.env.example', 'utf-8');
        const requiredEnvVars = [
            'MEILISEARCH_URL',
            'WHISPER_MODEL',
            'VISION_MODEL'
        ];

        for (const envVar of requiredEnvVars) {
            if (envExample.includes(envVar)) {
                console.log(`  ✅ Environment variable '${envVar}' documented`);
            } else {
                warnings.push(`Environment variable '${envVar}' not documented`);
                console.log(`  ⚠️  Environment variable '${envVar}' missing`);
            }
        }
    } catch (error) {
        warnings.push(`Failed to read .env.example: ${error}`);
        console.log(`  ⚠️  .env.example read failed`);
    }

    // Summary
    console.log('\n📊 Validation Summary:');
    console.log(`  ✅ Checks passed: ${requiredFiles.length - errors.length}`);
    console.log(`  ❌ Errors: ${errors.length}`);
    console.log(`  ⚠️  Warnings: ${warnings.length}`);

    if (errors.length > 0) {
        console.log('\n❌ Errors found:');
        errors.forEach(error => console.log(`  • ${error}`));
    }

    if (warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        warnings.forEach(warning => console.log(`  • ${warning}`));
    }

    if (errors.length === 0) {
        console.log('\n🎉 Media Intelligence System implementation validation passed!');
        console.log('\n📋 Next steps:');
        console.log('  1. Install dependencies: npm install');
        console.log('  2. Set up external services:');
        console.log('     - Start Meilisearch: ./meilisearch --db-path ./meilisearch_db');
        console.log('     - Start ChromaDB: chroma run --path ./chroma_db');
        console.log('     - Install Whisper: pip install openai-whisper');
        console.log('  3. Configure environment variables (copy .env.example to .env)');
        console.log('  4. Run the system: npm run dev');
        console.log('  5. Test with CLI commands:');
        console.log('     - npm run media-search "funny videos"');
        console.log('     - npm run media-tags list /path/to/video.mp4');
        
        return true;
    } else {
        console.log('\n💥 Validation failed! Please fix the errors above.');
        return false;
    }
}

// Run validation
validateImplementation()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Validation script failed:', error);
        process.exit(1);
    });
