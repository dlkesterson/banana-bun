import { writeFile } from 'fs/promises';
import { spawn } from 'bun';
import { join, extname } from 'path';
import { config } from '../config';
import type { RunCodeTask, DatabaseTask } from '../types';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';

function getInterpreterForExtension(ext: string): { cmd: string[], label: string } | null {
    if (ext === '.py') return { cmd: ['python'], label: 'python' };
    if (ext === '.js') return { cmd: ['bun', 'run'], label: 'bun' };
    if (ext === '.ts') return { cmd: ['bun', 'run'], label: 'bun' };
    if (ext === '.sh') return { cmd: ['bash'], label: 'bash' };
    // Add more as needed
    return null;
}

export async function executeRunCodeTask(task: RunCodeTask): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const db = getDatabase();

    // Check if we have direct code to execute
    if (task.code && task.language) {
        return executeDirectCode(task);
    }

    // Find the dependency task (should be a code task)
    let depTaskId: string | undefined;
    if (task.dependencies) {
        const depIds = task.dependencies.map((id: string) => id.trim()).filter(Boolean);
        depTaskId = depIds[0];
    }
    if (!depTaskId) {
        const error = 'No dependency found for run_code task';
        await logger.error(error + ' ' + JSON.stringify({ task }));
        return { success: false, error };
    }
    // Get the dependency task and its output file
    const depTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(depTaskId) as DatabaseTask | undefined;
    if (!depTask) {
        const error = `Dependency task ${depTaskId} not found`;
        await logger.error(error + ' ' + JSON.stringify({ task }));
        return { success: false, error };
    }
    let codePath = depTask.result_summary;
    if (!codePath) {
        const error = `No result_summary/output file for dependency code task ${depTaskId}`;
        await logger.error(error + ' ' + JSON.stringify({ task }));
        return { success: false, error };
    }
    // Infer interpreter from file extension
    const ext = extname(codePath).toLowerCase();
    const interpreter = getInterpreterForExtension(ext);
    if (!interpreter) {
        const error = `No interpreter found for extension ${ext}`;
        await logger.error(error + ' ' + JSON.stringify({ task, codePath }));
        return { success: false, error };
    }
    try {
        // Prepare output file path
        const outputDir = config.paths.outputs;
        const outputPath = join(outputDir, `task-${task.id || 'unknown'}-run-code-output.txt`);
        // Run the code
        const proc = spawn({
            cmd: [...interpreter.cmd, codePath],
            stdout: 'pipe',
            stderr: 'pipe'
        });
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        // Write output to file
        let outputContent = `# Interpreter\n${interpreter.label}\n\n# Code File\n${codePath}\n\n# STDOUT\n${stdout}\n\n# STDERR\n${stderr}\n\n# Exit Code\n${exitCode}`;
        await writeFile(outputPath, outputContent, 'utf-8');
        if (exitCode === 0) {
            await logger.info('Run code task executed successfully', { taskId: task.id, outputPath });
            return { success: true, outputPath };
        } else {
            await logger.error('Run code task failed', { taskId: task.id, exitCode, stderr });
            return { success: false, outputPath, error: stderr };
        }
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await logger.error('Error executing run_code task: ' + error + ' ' + JSON.stringify({ taskId: task.id }));
        return { success: false, error };
    }
}

async function executeDirectCode(task: RunCodeTask): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    if (!task.code || !task.language) {
        return { success: false, error: 'Code and language are required for direct execution' };
    }

    // Check for unsupported languages
    const supportedLanguages = ['python', 'javascript', 'typescript', 'bash', 'sh'];
    if (!supportedLanguages.includes(task.language.toLowerCase())) {
        return { success: false, error: `Unsupported language: ${task.language}` };
    }

    try {
        // Create temporary file with the code
        const outputDir = config.paths.outputs;
        const tempCodeFile = join(outputDir, `temp_code_${task.id || Date.now()}.${getExtensionForLanguage(task.language)}`);

        await writeFile(tempCodeFile, task.code, 'utf-8');

        // Get interpreter for the language
        const ext = getExtensionForLanguage(task.language);
        const interpreter = getInterpreterForExtension(`.${ext}`);

        if (!interpreter) {
            return { success: false, error: `No interpreter found for language: ${task.language}` };
        }

        // Prepare output file path
        const outputPath = join(outputDir, `task-${task.id || 'unknown'}-run-code-output.txt`);

        // Run the code
        const proc = spawn({
            cmd: [...interpreter.cmd, tempCodeFile],
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        // Write output to file
        let outputContent = `# Language\n${task.language}\n\n# Code\n${task.code}\n\n# STDOUT\n${stdout}\n\n# STDERR\n${stderr}\n\n# Exit Code\n${exitCode}`;
        await writeFile(outputPath, outputContent, 'utf-8');

        // Clean up temp file
        try {
            await import('fs').then(fs => fs.promises.unlink(tempCodeFile));
        } catch (cleanupErr) {
            // Ignore cleanup errors
        }

        if (exitCode === 0) {
            await logger.info('Direct code execution successful', { taskId: task.id, language: task.language, outputPath });
            return { success: true, outputPath };
        } else {
            await logger.error('Direct code execution failed', { taskId: task.id, language: task.language, exitCode, stderr });
            return { success: false, outputPath, error: stderr || 'Code execution failed' };
        }

    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await logger.error('Error in direct code execution', { taskId: task.id, error });
        return { success: false, error };
    }
}

function getExtensionForLanguage(language: string): string {
    const lang = language.toLowerCase();
    switch (lang) {
        case 'python': return 'py';
        case 'javascript': return 'js';
        case 'typescript': return 'ts';
        case 'bash':
        case 'sh': return 'sh';
        default: return 'txt';
    }
}