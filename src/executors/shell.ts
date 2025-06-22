import { writeFile } from 'fs/promises';
import { spawn } from 'bun';
import { join } from 'path';
import { config } from '../config';
import type { ShellTask } from '../types';
import { logger } from '../utils/logger';

export async function executeShellTask(task: ShellTask): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    if (!task.shell_command) {
        const error = 'No shell_command found in task';
        await logger.error(error, { task });
        return { success: false, error };
    }

    try {
        // Prepare output file path
        const outputDir = config.paths.outputs;
        const outputPath = join(outputDir, `task-${task.id || 'unknown'}-shell-output.txt`);

        // Run the shell command
        const proc = spawn({
            cmd: ["bash", "-c", task.shell_command],
            stdout: "pipe",
            stderr: "pipe"
        });
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        // Write output to file
        let outputContent = `# Command\n${task.shell_command}\n\n# STDOUT\n${stdout}\n\n# STDERR\n${stderr}\n\n# Exit Code\n${exitCode}`;
        await writeFile(outputPath, outputContent, 'utf-8');

        if (exitCode === 0) {
            await logger.info('Shell task executed successfully', { taskId: task.id, outputPath });
            return { success: true, outputPath };
        } else {
            await logger.error('Shell task failed', { taskId: task.id, exitCode, stderr });
            return { success: false, outputPath, error: stderr };
        }
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await logger.error('Error executing shell task', { taskId: task.id, error });
        return { success: false, error };
    }
} 