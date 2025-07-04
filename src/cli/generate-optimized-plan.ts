#!/usr/bin/env bun

/**
 * Generate Optimized Plan CLI
 * 
 * This CLI tool generates optimized plans using the LLM-based planning system.
 * It analyzes system logs, finds similar plans, and uses LLM to create optimized execution plans.
 * 
 * Usage:
 *   bun run generate-optimized-plan --goal "Process new podcast episodes" --with-analysis --use-model "gpt-4"
 *   bun run generate-optimized-plan --goal "Optimize media library" --constraints "low resource usage" --model "ollama"
 */

import { parseArgs } from 'util';
import { logger } from '../utils/logger';
import { getLlmPlanningService } from '../services/llm-planning-service';
import { initDatabase } from '../db';
import type { LlmPlanningRequest } from '../types/llm-planning';

interface CliArgs {
    goal: string;
    context?: string;
    constraints?: string[];
    'preferred-approach'?: string;
    'max-subtasks'?: number;
    'use-model'?: string;
    'with-analysis'?: boolean;
    'advanced-model'?: boolean;
    'output'?: string;
    'dry-run'?: boolean;
    'help'?: boolean;
}

async function main() {
    try {
        const { values } = parseArgs({
            args: process.argv.slice(2),
            options: {
                goal: { type: 'string', short: 'g' },
                context: { type: 'string', short: 'c' },
                constraints: { type: 'string', multiple: true },
                'preferred-approach': { type: 'string' },
                'max-subtasks': { type: 'string' },
                'use-model': { type: 'string', short: 'm' },
                'with-analysis': { type: 'boolean', short: 'a' },
                'advanced-model': { type: 'boolean' },
                'output': { type: 'string', short: 'o' },
                'dry-run': { type: 'boolean' },
                'help': { type: 'boolean', short: 'h' }
            },
            allowPositionals: true
        }) as { values: CliArgs };

        if (values.help) {
            showHelp();
            return;
        }

        if (!values.goal) {
            console.error('❌ Error: --goal is required');
            showHelp();
            process.exit(1);
        }

        // Initialize database
        await initDatabase();
        await logger.info('🚀 Starting optimized plan generation', { goal: values.goal });

        console.log('🧠 Generating optimized plan...');
        console.log(`📋 Goal: ${values.goal}`);
        
        if (values.context) {
            console.log(`📝 Context: ${values.context}`);
        }
        
        if (values.constraints && values.constraints.length > 0) {
            console.log(`⚠️  Constraints: ${values.constraints.join(', ')}`);
        }

        // Build planning request
        const request: LlmPlanningRequest = {
            goal: values.goal,
            context: values.context,
            constraints: values.constraints,
            preferred_approach: values['preferred-approach'],
            max_subtasks: values['max-subtasks'] ? parseInt(values['max-subtasks']) : undefined,
            model: values['use-model'],
            useAdvancedModel: values['advanced-model'],
            withAnalysis: values['with-analysis'],
            include_similar_tasks: true
        };

        if (values['dry-run']) {
            console.log('🔍 Dry run mode - showing what would be analyzed:');
            console.log('  - System logs for patterns and bottlenecks');
            console.log('  - Similar plan templates from history');
            console.log('  - Current system metrics');
            console.log('  - Resource usage patterns');
            console.log(`  - LLM model: ${request.model || 'default'}`);
            return;
        }

        // Generate the optimized plan
        const startTime = Date.now();
        const llmPlanningService = getLlmPlanningService();
        const result = await llmPlanningService.generateOptimizedPlan(request);
        const duration = Date.now() - startTime;

        if (!result.success) {
            console.error('❌ Failed to generate optimized plan:', result.error);
            process.exit(1);
        }

        // Display results
        console.log('\n✅ Optimized plan generated successfully!');
        console.log(`⏱️  Generation time: ${duration}ms`);
        console.log(`🤖 Model used: ${result.modelUsed}`);
        console.log(`📊 Optimization score: ${(result.optimizationScore! * 100).toFixed(1)}%`);
        console.log(`⚡ Resource efficiency: ${(result.resourceEfficiency! * 100).toFixed(1)}%`);

        if (result.contextUsed) {
            console.log('\n📈 Context Analysis:');
            console.log(`  - Log patterns analyzed: ${result.contextUsed.logPatternsCount}`);
            console.log(`  - Similar templates found: ${result.contextUsed.templatesCount}`);
            console.log(`  - System metrics considered: ${result.contextUsed.metricsCount}`);
        }

        console.log('\n🎯 Generated Plan:');
        console.log(`📋 Approach: ${result.plan!.approach}`);
        
        if (result.plan!.optimization_notes) {
            console.log(`🔧 Optimizations: ${result.plan!.optimization_notes}`);
        }
        
        if (result.plan!.risk_assessment) {
            console.log(`⚠️  Risk Assessment: ${result.plan!.risk_assessment}`);
        }

        console.log('\n📝 Subtasks:');
        result.plan!.subtasks.forEach((subtask, index) => {
            console.log(`  ${index + 1}. [${subtask.type}] ${subtask.description}`);
            if (subtask.estimated_duration) {
                console.log(`     ⏱️  Duration: ${subtask.estimated_duration}`);
            }
            if (subtask.resource_requirements) {
                console.log(`     💾 Resources: ${subtask.resource_requirements}`);
            }
            if (subtask.dependencies && subtask.dependencies.length > 0) {
                console.log(`     🔗 Dependencies: ${subtask.dependencies.join(', ')}`);
            }
        });

        // Save output to file if requested
        if (values.output) {
            const outputData = {
                goal: values.goal,
                generated_at: new Date().toISOString(),
                generation_time_ms: duration,
                result
            };
            
            await Bun.write(values.output, JSON.stringify(outputData, null, 2));
            console.log(`\n💾 Plan saved to: ${values.output}`);
        }

        await logger.info('✅ Optimized plan generation completed', {
            goal: values.goal,
            success: result.success,
            optimizationScore: result.optimizationScore,
            subtaskCount: result.plan?.subtasks.length,
            duration
        });

    } catch (error) {
        console.error('❌ Error generating optimized plan:', error);
        await logger.error('Failed to generate optimized plan', {
            error: error instanceof Error ? error.message : String(error)
        });
        process.exit(1);
    }
}

function showHelp() {
    console.log(`
🧠 Generate Optimized Plan - LLM-Based Planning System

USAGE:
  bun run generate-optimized-plan --goal "GOAL_DESCRIPTION" [OPTIONS]

REQUIRED:
  -g, --goal <string>              The goal or objective for the plan

OPTIONS:
  -c, --context <string>           Additional context for planning
  --constraints <string>           Constraints to consider (can be used multiple times)
  --preferred-approach <string>    Preferred approach or strategy
  --max-subtasks <number>          Maximum number of subtasks to generate
  -m, --use-model <string>         LLM model to use (gpt-4, ollama, qwen3:8b, etc.)
  -a, --with-analysis              Include detailed system analysis
  --advanced-model                 Use advanced model for complex planning
  -o, --output <file>              Save plan to JSON file
  --dry-run                        Show what would be analyzed without generating plan
  -h, --help                       Show this help message

EXAMPLES:
  # Basic plan generation
  bun run generate-optimized-plan --goal "Process new podcast episodes"

  # With constraints and context
  bun run generate-optimized-plan \\
    --goal "Optimize media library" \\
    --context "Large collection with mixed quality" \\
    --constraints "low resource usage" \\
    --constraints "preserve existing structure"

  # Using specific model with analysis
  bun run generate-optimized-plan \\
    --goal "Batch process video files" \\
    --use-model "gpt-4" \\
    --with-analysis \\
    --output plan.json

  # Advanced planning with all features
  bun run generate-optimized-plan \\
    --goal "Implement automated content curation" \\
    --preferred-approach "incremental deployment" \\
    --max-subtasks 8 \\
    --advanced-model \\
    --with-analysis
`);
}

if (import.meta.main) {
    main();
}
