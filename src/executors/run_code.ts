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