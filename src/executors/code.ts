import { writeFile } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';
import type { CodeTask } from '../types/task';
import { logger } from '../utils/logger';

// Helper to infer language and extension from description or code block label
function inferLanguageAndExtension(description: string): { lang: string, ext: string } {
    // Look for code block label in description, e.g. ```ts or ```sh
    const codeBlockLabel = description.match(/```([a-zA-Z0-9]+)/);
    if (codeBlockLabel && codeBlockLabel[1]) {
        const lang = codeBlockLabel[1].toLowerCase();
        if (lang === 'python' || lang === 'py') return { lang: 'python', ext: 'py' };
        if (lang === 'typescript' || lang === 'ts') return { lang: 'typescript', ext: 'ts' };
        if (lang === 'javascript' || lang === 'js') return { lang: 'javascript', ext: 'js' };
        if (lang === 'shell' || lang === 'sh' || lang === 'bash') return { lang: 'shell', ext: 'sh' };
        if (lang === 'json') return { lang: 'json', ext: 'json' };
        // Add more as needed
        return { lang, ext: lang };
    }
    // Fallback: look for keywords in description
    if (/python/i.test(description)) return { lang: 'python', ext: 'py' };
    if (/typescript/i.test(description)) return { lang: 'typescript', ext: 'ts' };
    if (/javascript/i.test(description)) return { lang: 'javascript', ext: 'js' };
    if (/shell|bash/i.test(description)) return { lang: 'shell', ext: 'sh' };
    // Default to python
    return { lang: 'python', ext: 'py' };
}

export async function executeCodeTask(task: CodeTask): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const description = task.description || ''; // Ensure description is never undefined or null
    const { lang, ext } = inferLanguageAndExtension(description);
    const prompt = `Write a complete, runnable ${lang} script for the following task.\n\n${description}`;
    try {
        // Call LLM (Ollama by default)
        const model = config.ollama.model;
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
        let code = data.response || '';
        // Try to extract code from markdown block if present
        const codeBlock = code.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
        if (codeBlock) {
            code = codeBlock[1].trim();
        }
        // Write code to file
        const outputDir = config.paths.outputs;
        const outputPath = join(outputDir, `task-${task.id || 'unknown'}-generated-code.${ext}`);
        await writeFile(outputPath, code, 'utf-8');
        await logger.info('Code task executed successfully', { taskId: task.id, outputPath, lang });
        return { success: true, outputPath };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await logger.error('Error executing code task', { taskId: task.id, error });
        return { success: false, error };
    }
} 
