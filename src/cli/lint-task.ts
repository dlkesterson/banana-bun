#!/usr/bin/env bun

/**
 * Task Linter CLI Tool
 *
 * Usage: bun run lint-task <task-file-path> [--fix] [--dry-run] [--verbose]
 *
 * Options:
 *   --fix       Automatically fix issues and save the file
 *   --dry-run   Preview fixes without saving (requires --fix)
 *   --verbose   Show detailed validation information
 *   --help      Show this help message
 */

import { readFile, writeFile } from 'fs/promises';
import { validateTask, TASK_TYPES, TASK_STATUSES } from '../validation/schemas';
import { safeParseTask } from '../validation/type-guards';
import { logger } from '../utils/logger';
import { parseTaskFile } from '../utils/parser';
import { extname } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// Helper functions
interface FixResult {
    fixed: boolean;
    fixedTask: any;
    appliedFixes: string[];
}

function categorizeError(error: string): { category: string; suggestion?: string } {
    if (error.includes('must be a string or number')) {
        return { category: 'Type Error', suggestion: 'Ensure the field is a string or number' };
    }
    if (error.includes('is required')) {
        return { category: 'Missing Field', suggestion: 'Add the required field' };
    }
    if (error.includes('must be one of')) {
        return { category: 'Invalid Value', suggestion: 'Use one of the allowed values' };
    }
    if (error.includes('must be an array')) {
        return { category: 'Type Error', suggestion: 'Convert to array format' };
    }
    if (error.includes('must be an object')) {
        return { category: 'Type Error', suggestion: 'Convert to object format' };
    }
    return { category: 'Validation Error' };
}

async function attemptAutoFix(task: any, errors: string[]): Promise<FixResult> {
    const fixedTask = JSON.parse(JSON.stringify(task)); // Deep clone
    const appliedFixes: string[] = [];
    let fixed = false;

    for (const error of errors) {
        // Fix missing required fields
        if (error.includes('id must be a string or number') && !fixedTask.id) {
            fixedTask.id = `task-${Date.now()}`;
            appliedFixes.push('Added missing task ID');
            fixed = true;
        }

        if (error.includes('status must be one of') && !TASK_STATUSES.includes(fixedTask.status)) {
            fixedTask.status = 'pending';
            appliedFixes.push('Set status to "pending"');
            fixed = true;
        }

        if (error.includes('result') && fixedTask.result === undefined) {
            fixedTask.result = null;
            appliedFixes.push('Added result field');
            fixed = true;
        }

        // Fix tool-specific issues
        if (fixedTask.type === 'tool') {
            if (error.includes('tool is required') && !fixedTask.tool) {
                // Can't auto-fix missing tool name
                continue;
            }

            if (error.includes('args is required') && !fixedTask.args) {
                fixedTask.args = {};
                appliedFixes.push('Added empty args object');
                fixed = true;
            }

            // Fix s3_sync specific issues
            if (fixedTask.tool === 's3_sync') {
                if (!fixedTask.args.hasOwnProperty('dry_run')) {
                    fixedTask.args.dry_run = false;
                    appliedFixes.push('Added dry_run: false to s3_sync args');
                    fixed = true;
                }

                if (!fixedTask.args.direction) {
                    fixedTask.args.direction = 'down';
                    appliedFixes.push('Added direction: "down" to s3_sync args');
                    fixed = true;
                }
            }
        }

        // Fix batch task issues
        if (fixedTask.type === 'batch') {
            if (error.includes('tasks is required') && !Array.isArray(fixedTask.tasks)) {
                fixedTask.tasks = [];
                appliedFixes.push('Added empty tasks array');
                fixed = true;
            }

            // Fix subtasks in batch
            if (Array.isArray(fixedTask.tasks)) {
                for (let i = 0; i < fixedTask.tasks.length; i++) {
                    const subtask = fixedTask.tasks[i];

                    if (!subtask.id) {
                        subtask.id = `subtask-${i + 1}`;
                        appliedFixes.push(`Added ID to subtask ${i + 1}`);
                        fixed = true;
                    }

                    if (!subtask.status) {
                        subtask.status = 'pending';
                        appliedFixes.push(`Set status for subtask ${i + 1}`);
                        fixed = true;
                    }

                    if (subtask.result === undefined) {
                        subtask.result = null;
                        appliedFixes.push(`Added result field to subtask ${i + 1}`);
                        fixed = true;
                    }

                    // Fix s3_sync in batch tasks
                    if (subtask.type === 'tool' && subtask.tool === 's3_sync' && subtask.args) {
                        if (!subtask.args.hasOwnProperty('dry_run')) {
                            subtask.args.dry_run = false;
                            appliedFixes.push(`Added dry_run to subtask ${i + 1}`);
                            fixed = true;
                        }
                    }
                }
            }
        }

        // Fix missing description for tasks that require it
        if (error.includes('description is required') && !fixedTask.description) {
            if (fixedTask.type === 'llm') {
                fixedTask.description = 'LLM task - please add description';
                appliedFixes.push('Added placeholder description for LLM task');
                fixed = true;
            } else if (fixedTask.type === 'code') {
                fixedTask.description = 'Code generation task - please add description';
                appliedFixes.push('Added placeholder description for code task');
                fixed = true;
            } else if (fixedTask.type === 'planner') {
                fixedTask.description = 'Planning task - please add description';
                appliedFixes.push('Added placeholder description for planner task');
                fixed = true;
            }
        }

        // Fix missing shell_command for shell tasks
        if (error.includes('shell_command is required') && fixedTask.type === 'shell' && !fixedTask.shell_command) {
            fixedTask.shell_command = 'echo "Please add your shell command"';
            appliedFixes.push('Added placeholder shell command');
            fixed = true;
        }

        // Fix missing dependencies for review/run_code tasks
        if (error.includes('dependencies is required') && !Array.isArray(fixedTask.dependencies)) {
            fixedTask.dependencies = [];
            appliedFixes.push('Added empty dependencies array');
            fixed = true;
        }
    }

    return { fixed, fixedTask, appliedFixes };
}

async function saveFixedTask(filePath: string, task: any, format: 'json' | 'yaml' | 'markdown'): Promise<void> {
    let content: string;

    if (format === 'json') {
        content = JSON.stringify(task, null, 2);
    } else if (format === 'yaml') {
        content = stringifyYaml(task);
    } else {
        // For markdown, we need to reconstruct the frontmatter format
        const { metadata, ...taskWithoutMetadata } = task;
        const frontmatter = stringifyYaml(taskWithoutMetadata);
        const markdownContent = metadata?.markdown_content || '# Task Description\n\nAdd your task description here.';
        content = `---\n${frontmatter}---\n${markdownContent}`;
    }

    await writeFile(filePath, content, 'utf-8');
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.length === 0) {
        console.log(`
Task Linter CLI Tool

Usage: bun run lint-task <task-file-path> [--fix] [--dry-run] [--verbose]

Options:
  --fix       Automatically fix issues and save the file
  --dry-run   Preview fixes without saving (requires --fix)
  --verbose   Show detailed validation information
  --help      Show this help message

Supported file formats: .json, .yaml, .yml, .md
        `);
        process.exit(0);
    }

    const filePath = args.find(arg => !arg.startsWith('--'));
    if (!filePath) {
        console.error('❌ Error: No file path provided');
        process.exit(1);
    }

    const shouldFix = args.includes('--fix');
    const dryRun = args.includes('--dry-run');
    const verbose = args.includes('--verbose');

    if (dryRun && !shouldFix) {
        console.error('❌ Error: --dry-run requires --fix');
        process.exit(1);
    }

    try {
        // Read and parse the task file
        const content = await readFile(filePath, 'utf-8');
        let task: any;
        let fileFormat: 'json' | 'yaml' | 'markdown' = 'json';

        // Determine file format and parse accordingly
        const ext = extname(filePath).toLowerCase();

        try {
            if (ext === '.json') {
                task = JSON.parse(content);
                fileFormat = 'json';
            } else if (ext === '.yaml' || ext === '.yml') {
                task = parseYaml(content);
                fileFormat = 'yaml';
            } else if (ext === '.md') {
                // Parse markdown with YAML frontmatter
                task = await parseTaskFile(filePath);
                fileFormat = 'markdown';
            } else {
                // Try JSON first, then YAML
                try {
                    task = JSON.parse(content);
                    fileFormat = 'json';
                } catch {
                    task = parseYaml(content);
                    fileFormat = 'yaml';
                }
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Error parsing ${fileFormat.toUpperCase()} file:`, errorMsg);
            process.exit(1);
        }

        // Validate the task
        const validationResult = validateTask(task);

        if (validationResult.valid) {
            console.log('✅ Task is valid!');

            if (verbose) {
                console.log('\nTask structure:');
                console.log(JSON.stringify(task, null, 2));
            }

            process.exit(0);
        }

        // Handle validation errors
        console.log('❌ Task validation failed:');
        console.log(`Found ${validationResult.errors.length} error(s):\n`);

        for (let i = 0; i < validationResult.errors.length; i++) {
            const error = validationResult.errors[i];
            if (!error) continue;
            const { category, suggestion } = categorizeError(error);

            console.log(`${i + 1}. [${category}] ${error}`);
            if (suggestion && verbose) {
                console.log(`   💡 Suggestion: ${suggestion}`);
            }
        }

        // Fix common issues if requested
        if (shouldFix) {
            const fixResult = await attemptAutoFix(task, validationResult.errors);

            if (fixResult.fixed) {
                console.log(`\n🔧 Applied ${fixResult.appliedFixes.length} fix(es):`);
                for (const fix of fixResult.appliedFixes) {
                    console.log(`  ✓ ${fix}`);
                }

                // Validate the fixed task
                const fixedValidationResult = validateTask(fixResult.fixedTask);

                if (fixedValidationResult.valid) {
                    if (dryRun) {
                        console.log('\n✅ Task would be valid after fixes (dry-run mode)');
                        console.log('\nFixed task preview:');
                        console.log(JSON.stringify(fixResult.fixedTask, null, 2));
                    } else {
                        // Save the fixed task in the appropriate format
                        await saveFixedTask(filePath, fixResult.fixedTask, fileFormat);
                        console.log('✅ Task has been fixed and saved!');
                    }
                    process.exit(0);
                } else {
                    console.log('\n⚠️ Attempted to fix some issues but task is still invalid:');
                    for (const error of fixedValidationResult.errors) {
                        console.log(`  - ${error}`);
                    }

                    if (!dryRun) {
                        const backupPath = `${filePath}.fixed`;
                        await saveFixedTask(backupPath, fixResult.fixedTask, fileFormat);
                        console.log(`\nPartially fixed task saved to: ${backupPath}`);
                    }
                }
            } else {
                console.log('\n❌ Could not automatically fix the issues.');
                console.log('💡 Try using --verbose for more detailed suggestions.');
            }
        }

        process.exit(1);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('Error:', errorMsg);
        process.exit(1);
    }
}

main().catch(console.error);