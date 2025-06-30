import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import type { BaseTask } from '../types';
import type { TaskTrend, TimeRange, PerformanceMetrics, IAnalyticsLogger } from '../types/service-interfaces';

export interface TaskMetrics {
    task_id: number;
    task_type: string;
    status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
    duration_ms?: number;
    retries: number;
    error_reason?: string;
    started_at?: Date;
    finished_at?: Date;
}

export interface TaskAnalytics {
    total_tasks: number;
    success_rate: number;
    average_duration_ms: number;
    most_common_failures: Array<{
        error_reason: string;
        count: number;
        percentage: number;
    }>;
    task_type_stats: Array<{
        task_type: string;
        count: number;
        success_rate: number;
        avg_duration_ms: number;
    }>;
    bottlenecks: Array<{
        task_type: string;
        avg_duration_ms: number;
        max_duration_ms: number;
        slow_task_count: number;
    }>;
}

export class AnalyticsLogger implements IAnalyticsLogger {
  private getDb() {
    return getDatabase();
  }

  async logTaskStart(task: BaseTask): Promise<void> {
    try {
      const db = this.getDb();
      const taskId =
        typeof task.id === "number" ? task.id : parseInt(String(task.id));

      // Update task start time
      db.run("UPDATE tasks SET started_at = CURRENT_TIMESTAMP WHERE id = ?", [
        taskId,
      ]);

      // Log to task_logs
      db.run(
        `
                INSERT INTO task_logs (task_id, task_type, status, retries, created_at)
                VALUES (?, ?, 'running', 0, CURRENT_TIMESTAMP)
            `,
        [taskId, task.type]
      );

      await logger.info("Task started", {
        taskId,
        taskType: task.type,
        description: task.description || "No description",
      });
    } catch (error) {
      await logger.error("Failed to log task start", {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async logTaskComplete(task: BaseTask, durationMs: number): Promise<void> {
    try {
      const db = this.getDb();
      const taskId =
        typeof task.id === "number" ? task.id : parseInt(String(task.id));

      // Update task completion time
      db.run(
        "UPDATE tasks SET finished_at = CURRENT_TIMESTAMP, status = ? WHERE id = ?",
        ["completed", taskId]
      );

      // Update task_logs
      db.run(
        `
                UPDATE task_logs
                SET status = 'completed', duration_ms = ?
                WHERE task_id = ? AND status = 'running'
            `,
        [durationMs, taskId]
      );

      await logger.info("Task completed", {
        taskId,
        taskType: task.type,
        durationMs,
      });
    } catch (error) {
      await logger.error("Failed to log task completion", {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async logTaskError(
    task: BaseTask,
    errorReason: string,
    durationMs?: number
  ): Promise<void> {
    try {
      const db = this.getDb();
      const taskId =
        typeof task.id === "number" ? task.id : parseInt(String(task.id));

      // Update task error
      db.run(
        "UPDATE tasks SET finished_at = CURRENT_TIMESTAMP, status = ?, error_message = ? WHERE id = ?",
        ["error", errorReason, taskId]
      );

      // Update task_logs
      db.run(
        `
                UPDATE task_logs
                SET status = 'error', error_reason = ?, duration_ms = ?
                WHERE task_id = ? AND status = 'running'
            `,
        [errorReason, durationMs || 0, taskId]
      );

      await logger.error("Task failed", {
        taskId,
        taskType: task.type,
        errorReason,
        durationMs,
      });
    } catch (error) {
      await logger.error("Failed to log task error", {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async logTaskRetry(
    task: BaseTask,
    retryCount: number,
    errorReason: string
  ): Promise<void> {
    try {
      const db = this.getDb();
      const taskId =
        typeof task.id === "number" ? task.id : parseInt(String(task.id));

      // Update retry count in task_logs
      db.run(
        `
                UPDATE task_logs
                SET retries = ?, error_reason = ?
                WHERE task_id = ? AND status = 'running'
            `,
        [retryCount, errorReason, taskId]
      );

      await logger.warn("Task retry", {
        taskId,
        taskType: task.type,
        retryCount,
        errorReason,
      });
    } catch (error) {
      await logger.error("Failed to log task retry", {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getTaskAnalytics(timeRangeHours: number = 24): Promise<TaskAnalytics> {
    try {
      const db = this.getDb();
      const cutoffTime = new Date(
        Date.now() - timeRangeHours * 60 * 60 * 1000
      ).toISOString();

      // Get total tasks and success rate
      const totalStats = db
        .prepare(
          `
                SELECT
                    COUNT(*) as total_tasks,
                    AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END) as success_rate,
                    AVG(duration_ms) as avg_duration_ms
                FROM task_logs
                WHERE created_at >= ?
            `
        )
        .get(cutoffTime) as any;

      // Get most common failures
      const failures = db
        .prepare(
          `
                SELECT
                    error_reason,
                    COUNT(*) as count,
                    (COUNT(*) * 100.0 / ?) as percentage
                FROM task_logs
                WHERE status = 'error' AND error_reason IS NOT NULL AND created_at >= ?
                GROUP BY error_reason
                ORDER BY count DESC
                LIMIT 10
            `
        )
        .all(totalStats.total_tasks || 1, cutoffTime) as any[];

      // Get task type statistics
      const taskTypeStats = db
        .prepare(
          `
                SELECT
                    task_type,
                    COUNT(*) as count,
                    AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END) as success_rate,
                    AVG(duration_ms) as avg_duration_ms
                FROM task_logs
                WHERE created_at >= ?
                GROUP BY task_type
                ORDER BY count DESC
            `
        )
        .all(cutoffTime) as any[];

      // Get bottlenecks (tasks taking longer than average)
      const avgDuration = totalStats.avg_duration_ms || 0;
      const bottlenecks = db
        .prepare(
          `
                SELECT
                    task_type,
                    AVG(duration_ms) as avg_duration_ms,
                    MAX(duration_ms) as max_duration_ms,
                    COUNT(*) as slow_task_count
                FROM task_logs
                WHERE duration_ms > ? AND created_at >= ?
                GROUP BY task_type
                HAVING COUNT(*) > 1
                ORDER BY avg_duration_ms DESC
                LIMIT 10
            `
        )
        .all(avgDuration * 2, cutoffTime) as any[];

      return {
        total_tasks: totalStats.total_tasks || 0,
        success_rate: totalStats.success_rate || 0,
        average_duration_ms: totalStats.avg_duration_ms || 0,
        most_common_failures: failures.map((f) => ({
          error_reason: f.error_reason,
          count: f.count,
          percentage: f.percentage,
        })),
        task_type_stats: taskTypeStats.map((t) => ({
          task_type: t.task_type,
          count: t.count,
          success_rate: t.success_rate,
          avg_duration_ms: t.avg_duration_ms || 0,
        })),
        bottlenecks: bottlenecks.map((b) => ({
          task_type: b.task_type,
          avg_duration_ms: b.avg_duration_ms || 0,
          max_duration_ms: b.max_duration_ms || 0,
          slow_task_count: b.slow_task_count,
        })),
      };
    } catch (error) {
      await logger.error("Failed to get task analytics", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async detectBottlenecks(thresholdMs: number = 30000): Promise<
    Array<{
      task_type: string;
      slow_tasks: number;
      avg_duration_ms: number;
      max_duration_ms: number;
      recommendation: string;
    }>
  > {
    try {
      const db = this.getDb();
      const bottlenecks = db
        .prepare(
          `
                SELECT
                    task_type,
                    COUNT(*) as slow_tasks,
                    AVG(duration_ms) as avg_duration_ms,
                    MAX(duration_ms) as max_duration_ms
                FROM task_logs
                WHERE duration_ms > ? AND created_at >= DATE('now', '-7 days')
                GROUP BY task_type
                HAVING COUNT(*) >= 3
                ORDER BY avg_duration_ms DESC
            `
        )
        .all(thresholdMs) as any[];

      return bottlenecks.map((b) => {
        let recommendation = "Consider optimizing this task type.";

        if (b.avg_duration_ms > 60000) {
          recommendation =
            "Task takes over 1 minute on average. Consider breaking into smaller tasks or optimizing the implementation.";
        } else if (b.slow_tasks > 10) {
          recommendation =
            "High frequency of slow tasks. Check for resource constraints or inefficient algorithms.";
        }

        return {
          task_type: b.task_type,
          slow_tasks: b.slow_tasks,
          avg_duration_ms: b.avg_duration_ms || 0,
          max_duration_ms: b.max_duration_ms || 0,
          recommendation,
        };
      });
    } catch (error) {
      await logger.error("Failed to detect bottlenecks", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
    try {
      const db = this.getDb();
      const cutoffDate = new Date(
        Date.now() - daysToKeep * 24 * 60 * 60 * 1000
      ).toISOString();

      const result = db.run("DELETE FROM task_logs WHERE created_at < ?", [
        cutoffDate,
      ]);

      await logger.info("Cleaned up old task logs", {
        deletedRows: result.changes,
        cutoffDate,
      });

      return result.changes;
    } catch (error) {
      await logger.error("Failed to cleanup old logs", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get task trends over a specified number of days
   */
  async getTaskTrends(days: number): Promise<TaskTrend[]> {
    try {
      const db = this.getDb();
      const cutoffTime = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000
      ).toISOString();

      const trends = db
        .prepare(
          `
          SELECT
            DATE(created_at) as date,
            COUNT(*) as total_tasks,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_tasks,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed_tasks,
            AVG(duration_ms) as avg_duration_ms
          FROM task_logs
          WHERE created_at >= ?
          GROUP BY DATE(created_at)
          ORDER BY date DESC
          `
        )
        .all(cutoffTime) as TaskTrend[];

      return trends.map(trend => ({
        ...trend,
        avg_duration_ms: trend.avg_duration_ms || 0
      }));
    } catch (error) {
      await logger.error("Failed to get task trends", {
        error: error instanceof Error ? error.message : String(error),
        days
      });
      throw error;
    }
  }

  /**
   * Log a specific task metric
   */
  async logTaskMetric(taskId: string, metric: string, value: number): Promise<void> {
    try {
      const db = this.getDb();
      const numericTaskId = parseInt(taskId);

      // Create task_metrics table if it doesn't exist
      db.run(`
        CREATE TABLE IF NOT EXISTS task_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          metric_name TEXT NOT NULL,
          metric_value REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(
        `INSERT INTO task_metrics (task_id, metric_name, metric_value) VALUES (?, ?, ?)`,
        [numericTaskId, metric, value]
      );

      await logger.debug("Task metric logged", {
        taskId: numericTaskId,
        metric,
        value
      });
    } catch (error) {
      await logger.error("Failed to log task metric", {
        error: error instanceof Error ? error.message : String(error),
        taskId,
        metric,
        value
      });
      throw error;
    }
  }

  /**
   * Get performance metrics for a specific time range
   */
  async getPerformanceMetrics(timeRange: TimeRange): Promise<PerformanceMetrics> {
    try {
      const db = this.getDb();
      const startTime = timeRange.start.toISOString();
      const endTime = timeRange.end.toISOString();

      // Get basic analytics for the time range
      const analytics = await this.getTaskAnalytics(
        Math.ceil((timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60))
      );

      // Get trends for the time range
      const daysDiff = Math.ceil((timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24));
      const trends = await this.getTaskTrends(daysDiff);

      return {
        total_tasks: analytics.total_tasks,
        success_rate: analytics.success_rate,
        average_duration_ms: analytics.average_duration_ms,
        bottlenecks: analytics.bottlenecks,
        trends
      };
    } catch (error) {
      await logger.error("Failed to get performance metrics", {
        error: error instanceof Error ? error.message : String(error),
        timeRange
      });
      throw error;
    }
  }

  /**
   * Log task completion with status and optional error
   */
  async logTaskCompletion(task: any, status: string, error?: string): Promise<void> {
    if (status === 'completed') {
      // Calculate duration if possible
      const duration = task.finished_at && task.started_at
        ? new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()
        : undefined;

      await this.logTaskComplete(task, duration || 0);
    } else if (status === 'error') {
      const duration = task.finished_at && task.started_at
        ? new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()
        : undefined;

      await this.logTaskError(task, error || 'Unknown error', duration);
    }
  }
}

// Export singleton instance
export const analyticsLogger = new AnalyticsLogger();
