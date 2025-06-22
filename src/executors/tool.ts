import { toolRunner } from '../tools/tool_runner';
import type { ToolTask } from '../types';

export async function executeToolTask(task: ToolTask): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    if (!task.tool || !task.args) {
        throw new Error('Tool task missing required tool or args');
    }

    try {
        const result = await toolRunner.executeTool(task.tool, task.args);
        return { success: true, outputPath: result.path || result.output_path };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
} 