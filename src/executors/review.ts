import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';
import type { ReviewTask, DatabaseTask } from '../types';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';
import { reviewExecutor } from './review_executor';

export async function executeReviewTask(task: ReviewTask): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const db = getDatabase();
    // Find the dependency task (from dependencies list or target_task_id)
    let depTaskId: string | undefined;

    if (task.target_task_id) {
        depTaskId = task.target_task_id.toString();
    } else if (task.dependencies && task.dependencies.length > 0) {
        depTaskId = task.dependencies[0]?.trim();
    }

    if (!depTaskId) {
        const error = 'No target task found for review task (need target_task_id or dependencies)';
        await logger.error(error + ' ' + JSON.stringify({ task }));
        return { success: false, error: 'Target task not found' };
    }
    // Get the dependency task and its output file
    const depTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(depTaskId) as DatabaseTask | undefined;
    if (!depTask) {
        const error = `Dependency task ${depTaskId} not found`;
        await logger.error(error + ' ' + JSON.stringify({ task }));
        return { success: false, error };
    }
    // Try to find the output file from result_summary
    let depOutputPath = depTask.result_summary;
    if (!depOutputPath) {
        const error = `No result_summary/output file for dependency task ${depTaskId}`;
        await logger.error(error + ' ' + JSON.stringify({ task }));
        return { success: false, error };
    }
    // If result_summary is a label like 'Subtasks: ...', skip
    if (depOutputPath.startsWith('Subtasks:')) {
        const error = `Dependency task ${depTaskId} does not have a reviewable output file`;
        await logger.error(error + ' ' + JSON.stringify({ task }));
        return { success: false, error };
    }
    // Read the output file
    let depOutput = '';
    try {
        depOutput = await readFile(depOutputPath, 'utf-8');
    } catch (err) {
        const error = `Failed to read dependency output file: ${depOutputPath}`;
        await logger.error(error + ' ' + JSON.stringify({ task, depOutputPath, err }));
        return { success: false, error };
    }
    // Phase 3: Use enhanced review executor with assertions
    try {
        // Get assertions from task metadata if available
        const assertions = task.metadata?.assertions || [];

        // Use the enhanced review executor
        const reviewResult = await reviewExecutor.reviewOutput(
            depOutput,
            task.description || 'Review the output for quality and correctness',
            config.openai.model || 'gpt-4',
            typeof task.id === 'number' ? task.id : undefined,
            assertions
        );

        // Write review to output file with enhanced format
        const outputDir = config.paths.outputs;
        const outputPath = join(outputDir, `task-${task.id || 'unknown'}-review-output.txt`);

        let outputContent = `# Review of Task ${depTaskId}\n\n`;
        outputContent += `**Status:** ${reviewResult.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
        if (reviewResult.score !== undefined) {
            outputContent += `**Score:** ${reviewResult.score}/100\n`;
        }
        outputContent += `\n**Feedback:**\n${reviewResult.feedback}\n`;

        if (reviewResult.suggestions && reviewResult.suggestions.length > 0) {
            outputContent += `\n**Suggestions:**\n`;
            reviewResult.suggestions.forEach((suggestion, index) => {
                outputContent += `${index + 1}. ${suggestion}\n`;
            });
        }

        await writeFile(outputPath, outputContent, 'utf-8');
        await logger.info('Enhanced review task executed successfully', {
            taskId: task.id,
            outputPath,
            passed: reviewResult.passed,
            score: reviewResult.score,
            assertionsChecked: assertions.length
        });
        return { success: true, outputPath };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await logger.error('Error executing enhanced review task: ' + error + ' ' + JSON.stringify({ taskId: task.id }));
        return { success: false, error };
    }
} 