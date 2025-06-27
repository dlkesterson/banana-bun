import { config } from '../config';
import type { PlannerTask } from '../types';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';
import { parse as parseYaml } from 'yaml';
import { embeddingManager } from '../memory/embeddings';
import type { PlannerContext, SimilarTaskContext, GeneratedPlan, DatabasePlannerResult } from '../types/planner';

export async function executePlannerTask(task: PlannerTask): Promise<{ success: boolean; subtaskIds?: number[]; error?: string }> {
    const goal = task.description; // Required by type system

    // Phase 3: Get similar tasks for context
    const plannerContext = await getSimilarTasksContext(goal);

    // Compose enhanced prompt for GPT-4 with context
    const systemPrompt = `You are an AI task planner. Given a goal, break it down into a list of subtasks. Each subtask should have a type (one of: shell, llm, code, run_code, review, batch) and a description.\n\nIf you create a 'code' subtask, always create a 'review' subtask immediately after it, with the 'review' task depending on the 'code' task. The review task should have a description like 'Review the generated code for correctness and quality.'\n\nIf the generated code should be executed, create a 'run_code' subtask after the 'code' subtask, with the 'run_code' task depending on the 'code' task.\n\nFor 'code' tasks, specify the programming language if possible (e.g., 'Generate a Python script that...').\n\nFor 'batch' tasks with generators, you can use:\n- folder_rename: scans a directory and creates rename_item subtasks for each folder found\n- (more generators can be added in the future)\n\nThe 'review', 'run_code', and 'batch' types are supported and will be executed by their respective modules, each operating on the output of their dependency where applicable.\n\nOutput only YAML in the following format:\n\nsubtasks:\n  - type: shell\n    description: ...\n  - type: llm\n    description: ...\n  - type: code\n    description: ... # specify language\n  - type: run_code\n    description: ... # (run_code tasks should depend on the code task)\n  - type: review\n    description: ... # (review tasks should depend on the code task)\n  - type: batch\n    description: ... # for dynamic batch tasks\n    generator:\n      type: folder_rename\n      directory_path: "/path/to/directory"\n      recursive: false\n  - type: batch\n    description: ... # for static batch tasks\n    tasks:\n      - tool: some_tool\n        args: {...}`;
    // Phase 3: Enhanced prompt with similar task context
    let userPrompt = `Goal: ${goal}`;

    if (plannerContext.similar_tasks.length > 0) {
        userPrompt += `\n\nSimilar completed tasks for reference:
${plannerContext.similar_tasks.map(t =>
            `- Task ${t.task_id} (${t.type}): ${t.description}
  Status: ${t.status}, Result: ${t.result_summary || 'N/A'}
  Similarity: ${(t.similarity_score * 100).toFixed(1)}%`
        ).join('\n')}

Use these examples to inform your planning approach.`;
    }

    try {
        // Call OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.openai.apiKey}`
            },
            body: JSON.stringify({
                model: config.openai.model || 'gpt-4',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.2
            })
        });

        if (!response.ok) {
            const error = `OpenAI API error: ${response.status} ${response.statusText}`;
            await logger.error(error, { taskId: task.id });
            return { success: false, error };
        }

        const data: any = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Parse YAML subtasks
        let subtasksYaml: any;
        try {
            subtasksYaml = parseYaml(content);
        } catch (parseErr) {
            const error = 'Failed to parse YAML from GPT-4 response';
            await logger.error(error, { content, parseErr });
            return { success: false, error };
        }
        const subtasks = subtasksYaml?.subtasks;
        if (!Array.isArray(subtasks) || subtasks.length === 0) {
            const error = 'No subtasks found in GPT-4 response';
            await logger.error(error, { content });
            return { success: false, error };
        }

        // Insert subtasks into DB
        const db = getDatabase();
        const subtaskIds: number[] = [];
        let prevId: number | null = null;
        for (const subtask of subtasks) {
            if (!subtask.type || !subtask.description) continue;
            // For sequential dependencies, set dependencies to previous subtask
            const dependencies = prevId ? String(prevId) : null;

            // Handle args and generator for subtasks that need them
            const args = subtask.args ? JSON.stringify(subtask.args) : null;
            const generator = subtask.generator ? JSON.stringify(subtask.generator) : null;

            db.run(
                `INSERT INTO tasks (type, description, status, parent_id, dependencies, args, generator) VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
                [subtask.type, subtask.description, task.id, dependencies, args, generator]
            );
            const result = db.query('SELECT last_insert_rowid() as id').get() as { id: number } | undefined;
            if (result?.id) {
                subtaskIds.push(result.id);
                prevId = result.id;
            }
        }

        // Phase 3: Save planner result to database
        if (typeof task.id === 'number') {
            await savePlannerResult(task.id, goal, content, subtasks, plannerContext, config.openai.model || 'gpt-4');
        }

        // Mark planner task as completed
        if (typeof task.id === 'number') {
            db.run(`UPDATE tasks SET status = 'completed', finished_at = CURRENT_TIMESTAMP, result_summary = ? WHERE id = ?`, [content, task.id]);
        }
        await logger.info('Planner task executed successfully', {
            taskId: task.id,
            subtaskIds,
            contextTasksUsed: plannerContext.similar_tasks.length
        });
        return { success: true, subtaskIds };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await logger.error('Error executing planner task', { taskId: task.id, error });
        return { success: false, error };
    }
}

// Phase 3: Get similar tasks for planning context
async function getSimilarTasksContext(goal: string): Promise<PlannerContext> {
    try {
        // Search for similar tasks using ChromaDB
        const similarTasks = await embeddingManager.findSimilarTasks(goal, 5);

        const db = getDatabase();
        const contextTasks: SimilarTaskContext[] = [];

        for (const similar of similarTasks) {
            // Get full task details from database
            const taskRow = db.query('SELECT * FROM tasks WHERE id = ?').get(similar.taskId) as any;
            if (taskRow && taskRow.status === 'completed') {
                contextTasks.push({
                    task_id: taskRow.id,
                    description: taskRow.description || '',
                    type: taskRow.type,
                    status: taskRow.status,
                    result_summary: taskRow.result_summary,
                    similarity_score: similar.metadata?.similarity || 0, // Use metadata.similarity instead
                    completed_at: taskRow.finished_at
                });
            }
        }

        return {
            similar_tasks: contextTasks,
            embedding_ids: similarTasks.map(t => t.id),
            total_context_tasks: contextTasks.length
        };
    } catch (error) {
        await logger.error('Failed to get similar tasks context', {
            goal,
            error: error instanceof Error ? error.message : String(error)
        });

        return {
            similar_tasks: [],
            embedding_ids: [],
            total_context_tasks: 0
        };
    }
}

// Phase 3: Save planner result to database
async function savePlannerResult(
    taskId: number,
    goal: string,
    generatedPlan: string,
    subtasks: any[],
    context: PlannerContext,
    model: string
): Promise<void> {
    try {
        const db = getDatabase();

        const planData: GeneratedPlan = {
            goal,
            approach: 'Sequential task breakdown',
            subtasks: subtasks.map(st => ({
                type: st.type,
                description: st.description,
                args: st.args,
                generator: st.generator
            }))
        };

        db.run(`
            INSERT INTO planner_results (
                task_id, model_used, goal_description, generated_plan,
                similar_tasks_used, context_embeddings, subtask_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            taskId,
            model,
            goal,
            JSON.stringify(planData),
            JSON.stringify(context.similar_tasks.map(t => t.task_id)),
            JSON.stringify(context.embedding_ids),
            subtasks.length
        ]);

        await logger.info('Planner result saved to database', {
            taskId,
            subtaskCount: subtasks.length,
            contextTasksUsed: context.total_context_tasks
        });
    } catch (error) {
        await logger.error('Failed to save planner result', {
            taskId,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}
