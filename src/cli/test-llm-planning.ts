#!/usr/bin/env bun

/**
 * Test LLM Planning System
 * 
 * This script tests the LLM-based planning system implementation
 * to ensure all components are working correctly.
 * 
 * Usage:
 *   bun run test-llm-planning --full
 *   bun run test-llm-planning --quick
 */

import { parseArgs } from 'util';
import { logger } from '../utils/logger';
import { initDatabase, getDatabase } from '../db';
import { getLlmPlanningService } from '../services/llm-planning-service';
import type { LlmPlanningRequest } from '../types/llm-planning';

interface CliArgs {
    'full'?: boolean;
    'quick'?: boolean;
    'verbose'?: boolean;
    'help'?: boolean;
}

async function main() {
    try {
        const { values } = parseArgs({
            args: process.argv.slice(2),
            options: {
                full: { type: 'boolean', short: 'f' },
                quick: { type: 'boolean', short: 'q' },
                verbose: { type: 'boolean', short: 'v' },
                help: { type: 'boolean', short: 'h' }
            },
            allowPositionals: true
        }) as { values: CliArgs };

        if (values.help) {
            showHelp();
            return;
        }

        // Initialize database
        await initDatabase();
        await logger.info('🚀 Starting LLM Planning System tests');

        console.log('🧪 Testing LLM Planning System Implementation');
        console.log('='.repeat(50));

        const testSuite = values.full ? 'full' : values.quick ? 'quick' : 'basic';
        console.log(`📋 Running ${testSuite} test suite...\n`);

        let passed = 0;
        let failed = 0;

        // Test 1: Database Schema
        console.log('1️⃣  Testing database schema...');
        try {
            await testDatabaseSchema();
            console.log('   ✅ Database schema test passed');
            passed++;
        } catch (error) {
            console.log(`   ❌ Database schema test failed: ${error}`);
            failed++;
        }

        // Test 2: Service Initialization
        console.log('\n2️⃣  Testing service initialization...');
        try {
            await testServiceInitialization();
            console.log('   ✅ Service initialization test passed');
            passed++;
        } catch (error) {
            console.log(`   ❌ Service initialization test failed: ${error}`);
            failed++;
        }

        // Test 3: Log Analysis
        console.log('\n3️⃣  Testing log analysis...');
        try {
            await testLogAnalysis();
            console.log('   ✅ Log analysis test passed');
            passed++;
        } catch (error) {
            console.log(`   ❌ Log analysis test failed: ${error}`);
            failed++;
        }

        // Test 4: Plan Generation (if not quick mode)
        if (!values.quick) {
            console.log('\n4️⃣  Testing plan generation...');
            try {
                await testPlanGeneration();
                console.log('   ✅ Plan generation test passed');
                passed++;
            } catch (error) {
                console.log(`   ❌ Plan generation test failed: ${error}`);
                failed++;
            }
        }

        // Test 5: Metrics Collection
        console.log('\n5️⃣  Testing metrics collection...');
        try {
            await testMetricsCollection();
            console.log('   ✅ Metrics collection test passed');
            passed++;
        } catch (error) {
            console.log(`   ❌ Metrics collection test failed: ${error}`);
            failed++;
        }

        // Test 6: Recommendations (if full mode)
        if (values.full) {
            console.log('\n6️⃣  Testing recommendation generation...');
            try {
                await testRecommendationGeneration();
                console.log('   ✅ Recommendation generation test passed');
                passed++;
            } catch (error) {
                console.log(`   ❌ Recommendation generation test failed: ${error}`);
                failed++;
            }
        }

        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 Test Results Summary:');
        console.log(`   ✅ Passed: ${passed}`);
        console.log(`   ❌ Failed: ${failed}`);
        console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

        if (failed === 0) {
            console.log('\n🎉 All tests passed! LLM Planning System is ready to use.');
        } else {
            console.log('\n⚠️  Some tests failed. Please check the implementation.');
            process.exit(1);
        }

        await logger.info('✅ LLM Planning System tests completed', {
            passed,
            failed,
            successRate: (passed / (passed + failed)) * 100
        });

    } catch (error) {
        console.error('❌ Error running tests:', error);
        await logger.error('Failed to run LLM Planning tests', {
            error: error instanceof Error ? error.message : String(error)
        });
        process.exit(1);
    }
}

async function testDatabaseSchema() {
    const db = getDatabase();
    
    // Check if all required tables exist
    const requiredTables = [
        'plan_templates',
        'system_metrics',
        'optimization_recommendations',
        'log_analysis_patterns',
        'resource_usage_predictions'
    ];

    for (const table of requiredTables) {
        const result = db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
        if (!result) {
            throw new Error(`Required table '${table}' not found`);
        }
    }

    // Check if planner_results table has new columns
    const plannerColumns = db.query(`PRAGMA table_info(planner_results)`).all() as any[];
    const requiredColumns = ['optimization_score', 'resource_efficiency', 'template_id', 'llm_model_used', 'embedding_id'];
    
    const existingColumns = plannerColumns.map(col => col.name);
    for (const column of requiredColumns) {
        if (!existingColumns.includes(column)) {
            throw new Error(`Required column '${column}' not found in planner_results table`);
        }
    }
}

async function testServiceInitialization() {
    // Test that the service can be imported and basic methods exist
    const llmPlanningService = getLlmPlanningService();

    if (typeof llmPlanningService.generateOptimizedPlan !== 'function') {
        throw new Error('generateOptimizedPlan method not found');
    }

    if (typeof llmPlanningService.analyzeSystemLogs !== 'function') {
        throw new Error('analyzeSystemLogs method not found');
    }

    if (typeof llmPlanningService.generateOptimizationRecommendations !== 'function') {
        throw new Error('generateOptimizationRecommendations method not found');
    }

    if (typeof llmPlanningService.getPlanningMetrics !== 'function') {
        throw new Error('getPlanningMetrics method not found');
    }
}

async function testLogAnalysis() {
    // Test log analysis with a short time window
    const llmPlanningService = getLlmPlanningService();
    const patterns = await llmPlanningService.analyzeSystemLogs(1); // 1 hour
    
    // Should return an array (even if empty)
    if (!Array.isArray(patterns)) {
        throw new Error('analyzeSystemLogs should return an array');
    }
    
    // If patterns exist, check structure
    if (patterns.length > 0) {
        const pattern = patterns[0];
        if (!pattern.pattern_type || !pattern.pattern_description || !pattern.severity) {
            throw new Error('Log pattern missing required fields');
        }
    }
}

async function testPlanGeneration() {
    // Test plan generation with a simple request
    const request: LlmPlanningRequest = {
        goal: 'Test plan generation',
        context: 'This is a test to verify the planning system works',
        model: 'test-model',
        withAnalysis: false // Skip analysis for faster testing
    };

    // Note: This might fail if no LLM is available, which is expected in test environments
    try {
        const llmPlanningService = getLlmPlanningService();
        const result = await llmPlanningService.generateOptimizedPlan(request);
        
        // Check result structure
        if (typeof result.success !== 'boolean') {
            throw new Error('Plan result should have success boolean');
        }
        
        if (typeof result.modelUsed !== 'string') {
            throw new Error('Plan result should have modelUsed string');
        }
        
        // If successful, check plan structure
        if (result.success && result.plan) {
            if (!result.plan.approach || !Array.isArray(result.plan.subtasks)) {
                throw new Error('Generated plan missing required fields');
            }
        }
    } catch (error) {
        // If it's a network/API error, that's expected in test environment
        if (error instanceof Error && (
            error.message.includes('fetch') || 
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('API')
        )) {
            console.log('   ℹ️  Plan generation skipped (no LLM service available)');
            return; // Don't fail the test
        }
        throw error;
    }
}

async function testMetricsCollection() {
    // Test metrics collection
    const llmPlanningService = getLlmPlanningService();
    const metrics = await llmPlanningService.getPlanningMetrics();
    
    // Check metrics structure
    if (typeof metrics.totalPlans !== 'number') {
        throw new Error('Metrics should have totalPlans number');
    }
    
    if (typeof metrics.averageOptimizationScore !== 'number') {
        throw new Error('Metrics should have averageOptimizationScore number');
    }
    
    if (!Array.isArray(metrics.topRecommendations)) {
        throw new Error('Metrics should have topRecommendations array');
    }
    
    if (!Array.isArray(metrics.recentPatterns)) {
        throw new Error('Metrics should have recentPatterns array');
    }
    
    if (typeof metrics.systemHealth !== 'object' || metrics.systemHealth === null) {
        throw new Error('Metrics should have systemHealth object');
    }
}

async function testRecommendationGeneration() {
    // Test recommendation generation
    const llmPlanningService = getLlmPlanningService();
    const recommendations = await llmPlanningService.generateOptimizationRecommendations();
    
    // Should return an array
    if (!Array.isArray(recommendations)) {
        throw new Error('generateOptimizationRecommendations should return an array');
    }
    
    // If recommendations exist, check structure
    if (recommendations.length > 0) {
        const rec = recommendations[0];
        if (!rec.recommendation_type || !rec.description || typeof rec.impact_score !== 'number') {
            throw new Error('Recommendation missing required fields');
        }
    }
}

function showHelp() {
    console.log(`
🧪 Test LLM Planning System

USAGE:
  bun run test-llm-planning [OPTIONS]

OPTIONS:
  -f, --full                       Run full test suite (includes LLM tests)
  -q, --quick                      Run quick test suite (skip LLM tests)
  -v, --verbose                    Verbose output
  -h, --help                       Show this help message

EXAMPLES:
  # Run basic tests
  bun run test-llm-planning

  # Run quick tests (no LLM calls)
  bun run test-llm-planning --quick

  # Run full test suite
  bun run test-llm-planning --full --verbose

NOTES:
  - Some tests may be skipped if LLM services are not available
  - Full tests require OpenAI API key or running Ollama instance
  - Database must be initialized before running tests
`);
}

if (import.meta.main) {
    main();
}
