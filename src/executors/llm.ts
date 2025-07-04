import { writeFile } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';
import type { LlmTask } from '../types';
import { logger } from '../utils/logger';

export async function executeLlmTask(task: LlmTask): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    // Use config default model
    const model = config.ollama.model;
    const prompt = task.description; // Required by type system

    try {
        // Prepare output file path - handle both mocked and real config
        let outputDir: string;
        try {
            outputDir = config.paths.outputs;
            // If we're in a test environment with BASE_PATH set, but config is mocked,
            // use the BASE_PATH directly to ensure test isolation
            if (process.env.BASE_PATH && outputDir === '/tmp/test-outputs') {
                outputDir = join(process.env.BASE_PATH, 'outputs');
            }
        } catch (error) {
            // Fallback if config is completely broken
            outputDir = process.env.BASE_PATH ? join(process.env.BASE_PATH, 'outputs') : '/tmp/banana-bun-fallback/outputs';
        }
        const outputPath = join(outputDir, `task-${task.id || 'unknown'}-llm-output.txt`);

        // Call Ollama API
        const response = await fetch(`${config.ollama.url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                stream: false
            })
        });

        if (!response.ok) {
            const error = `Ollama API error: ${response.status} ${response.statusText}`;
            await logger.error(error, { taskId: task.id });
            return { success: false, error };
        }

        const data: any = await response.json();
        const llmOutput = data.response || '';

        // Write output to file
        let outputContent = `# Model\n${model}\n\n# Prompt\n${prompt}\n\n# Output\n${llmOutput}`;
        await writeFile(outputPath, outputContent, 'utf-8');

        await logger.info('LLM task executed successfully', { taskId: task.id, outputPath });
        return { success: true, outputPath };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await logger.error('Error executing LLM task', { taskId: task.id, error });
        return { success: false, error };
    }
} 
