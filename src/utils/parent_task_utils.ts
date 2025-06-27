import { getDatabase } from '../db';
import { logger } from './logger';

export async function checkAndCompleteParentTask(childTaskId: number): Promise<void> {
    try {
        const db = getDatabase();

        const childTask = db.query('SELECT parent_id FROM tasks WHERE id = ?').get(childTaskId) as { parent_id: number | null } | undefined;
        if (!childTask?.parent_id) {
            await logger.debug('Task has no parent, skipping parent completion check', { childTaskId });
            return;
        }

        const parentTaskId = childTask.parent_id;
        const siblingTasks = db.query(
            'SELECT id, status FROM tasks WHERE parent_id = ?'
        ).all(parentTaskId) as { id: number; status: string }[];

        if (siblingTasks.length === 0) return;

        const allFinished = siblingTasks.every(task =>
            ['completed', 'error', 'skipped'].includes(task.status)
        );

        if (allFinished) {
            const completed = siblingTasks.filter(task => task.status === 'completed').length;
            const errored = siblingTasks.filter(task => task.status === 'error').length;
            const skipped = siblingTasks.filter(task => task.status === 'skipped').length;

            // Determine parent status based on child outcomes
            const parentStatus = errored > 0 ? 'error' : 'completed';
            const parentResultSummary = `Subtasks completed: ${completed} successful, ${errored} failed, ${skipped} skipped (${siblingTasks.length} total)`;
            const errorMessage = errored > 0 ? `Parent task failed because ${errored} child task failed` : null;

            if (errorMessage) {
                db.run(
                    `UPDATE tasks SET
                    status = ?,
                    finished_at = CURRENT_TIMESTAMP,
                    result_summary = COALESCE(result_summary, '') || ' | ' || ?,
                    error_message = ?
                WHERE id = ?`,
                    [parentStatus, parentResultSummary, errorMessage, parentTaskId]
                );
            } else {
                db.run(
                    `UPDATE tasks SET
                    status = ?,
                    finished_at = CURRENT_TIMESTAMP,
                    result_summary = COALESCE(result_summary, '') || ' | ' || ?
                WHERE id = ?`,
                    [parentStatus, parentResultSummary, parentTaskId]
                );
            }

            await logger.info('Parent task marked as completed', {
                parentTaskId, childTaskId, completed, errored, skipped, total: siblingTasks.length
            });

            await checkAndCompleteParentTask(parentTaskId);
        } else {
            await logger.info('Parent task not yet ready for completion', {
                parentTaskId,
                childTaskId,
                finishedTasks: siblingTasks.filter(task =>
                    ['completed', 'error', 'skipped'].includes(task.status)
                ).length,
                totalTasks: siblingTasks.length
            });
        }
    } catch (error) {
        await logger.error('Error in checkAndCompleteParentTask', { childTaskId, error });
        // Don't re-throw the error to avoid breaking the calling code
    }
}
