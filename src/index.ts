import { watch } from 'fs';
import { join, extname, basename } from 'path';
import { promises as fsPromises } from 'fs';
import { config } from './config';
import { logger } from './utils/logger';
import { initDatabase, getDatabase, getDependencyHelper } from './db';
import { parseTaskFile } from './utils/parser';
import type { BaseTask, DatabaseTask, MediaIngestTask } from './types';
import { executeTask } from './executors/dispatcher';
import { convertDatabaseTasksToBaseTasks } from './utils/task_converter';
import { hashFile } from './utils/hash';
import { generateDashboard } from './dashboard';
import { checkAndCompleteParentTask } from './utils/parent_task_utils';
import { enhancedTaskProcessor } from './mcp/enhanced-task-processor';
import { RetryManager } from './retry/retry-manager';
import type { RetryContext } from './types/retry';
import { TaskScheduler } from './scheduler/task-scheduler';
import { runAllMigrations } from './migrations/migrate-all';
import { meilisearchService } from './services/meilisearch-service';
import { rssWatcher } from './services/rss-watcher';

// Global retry manager instance
let retryManager: RetryManager;

// Global task scheduler instance
let taskScheduler: TaskScheduler;

async function ensureFoldersExist() {
    const folders = [
        config.paths.incoming,
        config.paths.processing,
        config.paths.archive,
        config.paths.error,
        config.paths.outputs,
        config.paths.logs,
        config.paths.dashboard,
        config.paths.media
    ];
    for (const folder of folders) {
        try {
            await fsPromises.mkdir(folder, { recursive: true });
            logger.info('Ensured folder exists', { folder });
        } catch (err) {
            logger.error('Failed to create folder', { folder, error: err instanceof Error ? err.message : String(err) });
            throw err;
        }
    }
}

async function processTaskFile(filePath: string): Promise<void> {
  const { basename, extname } = require("path");
  const fs = require("fs/promises");
  let origName = basename(filePath);
  const ext = extname(origName);
  const nameNoExt = origName.slice(0, -ext.length);
  // Check for filename collision in processing, archive, or error
  let uniqueName = origName;
  let counter = 0;
  while (
    (await fsPromises
      .stat(join(config.paths.processing, uniqueName))
      .catch(() => false)) ||
    (await fsPromises
      .stat(join(config.paths.archive, uniqueName))
      .catch(() => false)) ||
    (await fsPromises
      .stat(join(config.paths.error, uniqueName))
      .catch(() => false))
  ) {
    counter++;
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.]/g, "")
      .slice(0, 15);
    uniqueName = `${nameNoExt}_${timestamp}${
      counter > 1 ? "_" + counter : ""
    }${ext}`;
  }
  if (uniqueName !== origName) {
    const newPath = join(config.paths.incoming, uniqueName);
    await fs.rename(filePath, newPath);
    await logger.info("Renamed file to enforce uniqueness", {
      from: filePath,
      to: newPath,
    });
    filePath = newPath;
    origName = uniqueName;
  }
  const processingPath = join(config.paths.processing, origName);
  const archivePath = join(config.paths.archive, origName);
  const errorPath = join(config.paths.error, origName);
  try {
    // Move file to processing
    await fs.rename(filePath, processingPath);
    await logger.info("Moved file to processing", {
      from: filePath,
      to: processingPath,
    });
    // Compute file hash
    const file_hash = await hashFile(processingPath);
    // Check for duplicate by hash or filename
    const db = getDatabase();
    const existing = db
      .prepare("SELECT id FROM tasks WHERE file_hash = ? OR filename = ?")
      .get(file_hash, origName);
    if (existing) {
      await logger.info(
        "Duplicate file detected, moving to archive and skipping",
        { filename: origName, file_hash }
      );
      await fs.rename(processingPath, archivePath);
      return;
    }
    // Parse the task file
    const task = await parseTaskFile(processingPath);
    // Insert into database with filename and file_hash
    // Extract properties safely based on task type
    const shellCommand =
      task.type === "shell" ? (task as any).shell_command || null : null;
    const args =
      "args" in task && (task as any).args !== undefined
        ? JSON.stringify((task as any).args)
        : null;
    const generator =
      "generator" in task && (task as any).generator !== undefined
        ? JSON.stringify((task as any).generator)
        : null;
    const tool = task.type === "tool" ? (task as any).tool || null : null;
    const parentId = task.parent_id !== undefined ? task.parent_id : null;
    const dependencies =
      task.dependencies !== undefined && task.dependencies !== null
        ? Array.isArray(task.dependencies)
          ? JSON.stringify(task.dependencies)
          : task.dependencies
        : null;

    db.run(
      `INSERT INTO tasks (type, description, status, parent_id, dependencies, shell_command, args, generator, tool, filename, file_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.type || "",
        task.description || "",
        task.status || "pending",
        parentId,
        dependencies,
        shellCommand,
        args,
        generator,
        tool,
        origName,
        file_hash,
      ]
    );
    const result = db.query("SELECT last_insert_rowid() as id").get() as
      | { id: number }
      | undefined;
    const taskId = result?.id;
    if (typeof taskId !== "number") {
      throw new Error("Failed to insert task into database");
    }
    await logger.info("Task created successfully", {
      taskId,
      type: task.type,
      filename: origName,
      file_hash,
    });
    // Move file to archive
    await fs.rename(processingPath, archivePath);
    await logger.info("Moved file to archive", {
      from: processingPath,
      to: archivePath,
    });
  } catch (error) {
    await logger.error("Failed to process task file", {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    // Move file to error
    try {
      if (await fs.stat(processingPath).catch(() => false)) {
        await fs.rename(processingPath, errorPath);
        await logger.info("Moved file to error", {
          from: processingPath,
          to: errorPath,
        });
      } else if (await fs.stat(filePath).catch(() => false)) {
        await fs.rename(filePath, errorPath);
        await logger.info("Moved file to error", {
          from: filePath,
          to: errorPath,
        });
      }
    } catch (moveErr) {
      await logger.error("Failed to move file to error", {
        filePath,
        moveErr: moveErr instanceof Error ? moveErr.message : String(moveErr),
      });
    }
  }
}

function isMediaFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  const allMediaExtensions = [
    ...config.media.extensions.video,
    ...config.media.extensions.audio,
  ];
  return allMediaExtensions.includes(ext);
}

async function processMediaFile(filePath: string): Promise<void> {
  const filename = basename(filePath);

  try {
    await logger.info("Media file detected", { filePath, filename });

    // Check if file exists and get stats
    const fileStats = await fsPromises.stat(filePath);
    if (!fileStats.isFile()) {
      await logger.warn("Media path is not a file, skipping", { filePath });
      return;
    }

    // Calculate file hash for deduplication
    const fileHash = await hashFile(filePath);

    // Check for existing media_metadata entry (deduplication)
    const db = getDatabase();
    if (config.media.extraction.enable_deduplication) {
      const existing = db
        .prepare("SELECT id, task_id FROM media_metadata WHERE file_hash = ?")
        .get(fileHash) as { id: number; task_id: number } | undefined;
      if (existing) {
        await logger.info("Media file already processed, skipping", {
          filePath,
          existingTaskId: existing.task_id,
          fileHash,
        });
        return;
      }
    }

    // Create media_ingest task
    const description = `Ingest metadata for ${filename}`;
    const taskData: Partial<MediaIngestTask> = {
      type: "media_ingest",
      description,
      file_path: filePath,
      status: "pending",
      metadata: {
        created_by: "file_watcher",
        priority: 1,
        tags: ["media", "metadata_extraction", "auto_generated"],
      },
    };

    // Insert task into database
    const result = db.run(
      `INSERT INTO tasks (type, description, status, file_hash, args)
             VALUES (?, ?, ?, ?, ?)`,
      [
        taskData.type as string,
        taskData.description as string,
        taskData.status as string,
        fileHash,
        JSON.stringify({ file_path: filePath }),
      ]
    );

    const taskId = result.lastInsertRowid as number;

    await logger.info("Media ingestion task created successfully", {
      taskId,
      filePath,
      filename,
      fileHash,
    });
  } catch (error) {
    await logger.error("Failed to process media file", {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function areDependenciesMet(task: BaseTask): {
  ready: boolean;
  error: boolean;
  failedDepId?: string;
} {
  if (typeof task.id !== "number") {
    return { ready: true, error: false };
  }

  const dependencyHelper = getDependencyHelper();
  return dependencyHelper.areDependenciesMet(task.id);
}

async function propagateErrorToDependents(
  taskId: number,
  errorMessage: string
) {
  const db = getDatabase();
  const dependencyHelper = getDependencyHelper();
  const dependents = dependencyHelper.getTaskDependents(taskId);

  for (const depId of dependents) {
    db.run(
      `UPDATE tasks SET
                status = 'error',
                finished_at = CURRENT_TIMESTAMP,
                error_message = ?
            WHERE id = ?`,
      [`Dependency task ${taskId} failed: ${errorMessage}`, depId]
    );
    logger.error("Propagated error to dependent task", {
      fromTaskId: taskId,
      toTaskId: depId,
      error: errorMessage,
    });

    // Recursively propagate to dependent tasks
    await propagateErrorToDependents(depId, errorMessage);
  }
}

/**
 * Execute a task with retry logic
 */
async function executeTaskWithRetry(task: BaseTask): Promise<{
  success: boolean;
  error?: string;
  shouldRetry?: boolean;
  retryDelayMs?: number;
}> {
  const db = getDatabase();
  const startTime = Date.now();

  try {
    // Get current retry information
    const taskRow = db
      .query("SELECT retry_count, max_retries FROM tasks WHERE id = ?")
      .get(task.id) as { retry_count: number; max_retries: number } | null;
    const currentRetryCount = taskRow?.retry_count || 0;
    const maxRetries = taskRow?.max_retries || 3;

    // Get retry policy for this task type
    const retryPolicy = await retryManager.getRetryPolicy(task.type);

    // Create retry context
    const retryContext: RetryContext = {
      taskId: task.id as number,
      taskType: task.type,
      currentAttempt: currentRetryCount,
      maxRetries: Math.max(maxRetries, retryPolicy.maxRetries),
      policy: retryPolicy,
    };

    // Execute the task
    const result = await executeTask(task);
    const executionTime = Date.now() - startTime;

    if (result.success) {
      // Record successful retry attempt if this was a retry
      if (currentRetryCount > 0) {
        await retryManager.recordRetryAttempt({
          taskId: task.id as number,
          attemptNumber: currentRetryCount + 1,
          attemptedAt: new Date().toISOString(),
          delayMs: 0,
          success: true,
          executionTimeMs: executionTime,
        });
      }

      return { success: true };
    } else {
      // Task failed, determine if we should retry
      const error = new Error(result.error || "Unknown error");
      const retryDecision = await retryManager.shouldRetry(retryContext, error);

      // Record the failed attempt
      await retryManager.recordRetryAttempt({
        taskId: task.id as number,
        attemptNumber: currentRetryCount + 1,
        attemptedAt: new Date().toISOString(),
        errorMessage: error.message,
        errorType: "execution_failure",
        delayMs: retryDecision.delayMs,
        success: false,
        executionTimeMs: executionTime,
      });

      if (retryDecision.shouldRetry) {
        // Update task for retry
        const nextRetryAt = new Date(Date.now() + retryDecision.delayMs);
        await retryManager.updateTaskRetryInfo(
          task.id as number,
          currentRetryCount + 1,
          nextRetryAt,
          error.message
        );

        logger.info("Task scheduled for retry", {
          taskId: task.id,
          attemptNumber: currentRetryCount + 1,
          nextRetryAt: nextRetryAt.toISOString(),
          delayMs: retryDecision.delayMs,
          reason: retryDecision.reason,
        });

        return {
          success: false,
          error: error.message,
          shouldRetry: true,
          retryDelayMs: retryDecision.delayMs,
        };
      } else {
        logger.warn("Task will not be retried", {
          taskId: task.id,
          reason: retryDecision.reason,
          totalAttempts: currentRetryCount + 1,
        });

        return {
          success: false,
          error: error.message,
          shouldRetry: false,
        };
      }
    }
  } catch (err) {
    const executionTime = Date.now() - startTime;
    const error = err instanceof Error ? err : new Error(String(err));

    // Get retry context for exception handling
    const taskRow = db
      .query("SELECT retry_count, max_retries FROM tasks WHERE id = ?")
      .get(task.id) as { retry_count: number; max_retries: number } | null;
    const currentRetryCount = taskRow?.retry_count || 0;
    const maxRetries = taskRow?.max_retries || 3;
    const retryPolicy = await retryManager.getRetryPolicy(task.type);

    const retryContext: RetryContext = {
      taskId: task.id as number,
      taskType: task.type,
      currentAttempt: currentRetryCount,
      maxRetries: Math.max(maxRetries, retryPolicy.maxRetries),
      policy: retryPolicy,
    };

    // Determine if we should retry the exception
    const retryDecision = await retryManager.shouldRetry(retryContext, error);

    // Record the failed attempt
    await retryManager.recordRetryAttempt({
      taskId: task.id as number,
      attemptNumber: currentRetryCount + 1,
      attemptedAt: new Date().toISOString(),
      errorMessage: error.message,
      errorType: "exception",
      delayMs: retryDecision.delayMs,
      success: false,
      executionTimeMs: executionTime,
    });

    if (retryDecision.shouldRetry) {
      const nextRetryAt = new Date(Date.now() + retryDecision.delayMs);
      await retryManager.updateTaskRetryInfo(
        task.id as number,
        currentRetryCount + 1,
        nextRetryAt,
        error.message
      );

      return {
        success: false,
        error: error.message,
        shouldRetry: true,
        retryDelayMs: retryDecision.delayMs,
      };
    } else {
      return {
        success: false,
        error: error.message,
        shouldRetry: false,
      };
    }
  }
}

async function orchestratorLoop() {
  try {
    console.log("🔄 Orchestrator loop starting at", new Date().toISOString());
    logger.info("🔄 Orchestrator loop starting...");
    const db = getDatabase();

    // Get tasks ready for retry
    const retryTaskIds = await retryManager.getTasksReadyForRetry();
    if (retryTaskIds.length > 0) {
      logger.info("Processing retry tasks", {
        count: retryTaskIds.length,
        taskIds: retryTaskIds,
      });

      for (const taskId of retryTaskIds) {
        // Reset task status to pending for retry
        db.run('UPDATE tasks SET status = "pending" WHERE id = ?', [taskId]);
      }
    }

    // Get all pending tasks from database (including newly reset retry tasks)
    const pendingDbTasks = db
      .query('SELECT * FROM tasks WHERE status = "pending"')
      .all() as DatabaseTask[];

    // Convert database tasks to discriminated union types
    const pendingTasks = convertDatabaseTasksToBaseTasks(pendingDbTasks);

    // Task conversion is now handled in convertDatabaseTasksToBaseTasks
    for (const task of pendingTasks) {
      if (typeof task.id !== "number") {
        logger.error("Task missing id, skipping", { task });
        continue;
      }
      const depStatus = areDependenciesMet(task);
      if (depStatus.error) {
        const errorMessage = `Dependency task ${String(
          depStatus.failedDepId
        )} failed`;
        db.run(
          `UPDATE tasks SET status = 'error', finished_at = CURRENT_TIMESTAMP, error_message = ? WHERE id = ?`,
          [errorMessage, task.id]
        );
        logger.error("Task cannot run due to failed dependency", {
          taskId: task.id,
          failedDepId: depStatus.failedDepId,
        });

        // Propagate error to dependent tasks
        await propagateErrorToDependents(task.id, errorMessage);
        continue;
      }
      if (!depStatus.ready) {
        // Dependencies not yet met, skip for now
        continue;
      }
      // Dispatch by type
      try {
        db.run(
          `UPDATE tasks SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [task.id]
        );
        logger.info("Starting task", { taskId: task.id, type: task.type });

        // 🧠 Get MCP enhancements before processing
        try {
          const enhancements =
            await enhancedTaskProcessor.processTaskWithEnhancements({
              id: task.id,
              description: task.description || `${task.type} task`,
              type: task.type,
            });

          if (
            enhancements.recommendations &&
            enhancements.recommendations.length > 0
          ) {
            await logger.info("💡 MCP Recommendations received", {
              taskId: task.id,
              recommendations: enhancements.recommendations,
            });
          }

          if (
            enhancements.similarTasks &&
            enhancements.similarTasks.length > 0
          ) {
            await logger.info("🔍 Found similar successful tasks", {
              taskId: task.id,
              similarTasksCount: enhancements.similarTasks.length,
            });
          }
        } catch (mcpError) {
          await logger.warn("MCP enhancements failed, continuing without", {
            taskId: task.id,
            error:
              mcpError instanceof Error ? mcpError.message : String(mcpError),
          });
        }

        let result: any = { success: false };

        // Special handling for batch tasks - only dynamic ones should reach here
        if (task.type === "batch" && !task.generator) {
          throw new Error(
            "Static batch tasks should not reach the main orchestrator"
          );
        }

        // Execute task using the retry-aware dispatcher
        result = await executeTaskWithRetry(task);

        if (result.success) {
          db.run(
            `UPDATE tasks SET status = 'completed', finished_at = CURRENT_TIMESTAMP, result_summary = ?, error_message = NULL WHERE id = ?`,
            [
              result.outputPath || result.filePath || result.subtaskIds
                ? `Subtasks: ${result.subtaskIds?.join(", ")}`
                : "",
              task.id,
            ]
          );
          logger.info("Task completed", { taskId: task.id, type: task.type });

          // 🎯 Complete task with MCP enhancements (learning & notifications)
          try {
            await enhancedTaskProcessor.completeTaskWithEnhancements(
              {
                id: task.id,
                description: task.description || `${task.type} task`,
                type: task.type,
                metadata: {
                  outputPath: result.outputPath,
                  filePath: result.filePath,
                  subtaskIds: result.subtaskIds,
                },
              },
              result
            );
          } catch (mcpError) {
            await logger.warn("MCP completion failed, continuing", {
              taskId: task.id,
              error:
                mcpError instanceof Error ? mcpError.message : String(mcpError),
            });
          }

          // Check if this task completion should trigger parent task completion
          await checkAndCompleteParentTask(task.id);
        } else {
          // Handle task failure with retry logic
          if (result.shouldRetry) {
            // Task will be retried, set status to error but don't finalize
            db.run(
              `UPDATE tasks SET status = 'error', error_message = ? WHERE id = ?`,
              [result.error || "Unknown error", task.id]
            );
            logger.info("Task failed but will be retried", {
              taskId: task.id,
              type: task.type,
              error: result.error,
              retryDelayMs: result.retryDelayMs,
            });
          } else {
            // Task failed and will not be retried, finalize the failure
            db.run(
              `UPDATE tasks SET status = 'error', finished_at = CURRENT_TIMESTAMP, result_summary = ?, error_message = ? WHERE id = ?`,
              [result.error || "", result.error || "Unknown error", task.id]
            );
            logger.error("Task failed permanently", {
              taskId: task.id,
              type: task.type,
              error: result.error,
            });

            // 🚨 Complete failed task with MCP enhancements (learning from failures)
            try {
              await enhancedTaskProcessor.completeTaskWithEnhancements(
                {
                  id: task.id,
                  description: task.description || `${task.type} task`,
                  type: task.type,
                  metadata: {
                    error: result.error,
                    finalFailure: true,
                  },
                },
                { ...result, success: false }
              );
            } catch (mcpError) {
              await logger.warn("MCP failure completion failed, continuing", {
                taskId: task.id,
                error:
                  mcpError instanceof Error
                    ? mcpError.message
                    : String(mcpError),
              });
            }

            // Check if this task error should trigger parent task completion
            await checkAndCompleteParentTask(task.id);
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        db.run(
          `UPDATE tasks SET status = 'error', finished_at = CURRENT_TIMESTAMP, error_message = ? WHERE id = ?`,
          [errorMessage, task.id]
        );
        logger.error("Exception in orchestrator loop", {
          taskId: task.id,
          error: errorMessage,
        });

        // 💥 Complete exception task with MCP enhancements (learning from exceptions)
        try {
          await enhancedTaskProcessor.completeTaskWithEnhancements(
            {
              id: task.id,
              description: task.description || `${task.type} task`,
              type: task.type,
              metadata: {
                exception: errorMessage,
                exceptionType: "orchestrator_exception",
              },
            },
            { success: false, error: errorMessage }
          );
        } catch (mcpError) {
          await logger.warn("MCP exception completion failed, continuing", {
            taskId: task.id,
            error:
              mcpError instanceof Error ? mcpError.message : String(mcpError),
          });
        }

        // Check if this task error should trigger parent task completion
        await checkAndCompleteParentTask(task.id);
      }
    }
    // At the end, update the dashboard
    await generateDashboard();
    logger.info("✅ Orchestrator loop completed successfully");
  } catch (error) {
    logger.error("❌ Orchestrator loop failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

async function main() {
  try {
    console.log("🚀 Starting main function...");
    // Ensure required folders exist
    await ensureFoldersExist();
    console.log("✅ Folders ensured");
    // Initialize database
    await initDatabase();
    console.log("✅ Database initialized");

    // Run all database migrations
    console.log("🔄 Running database migrations...");
    logger.info("🔄 Running database migrations...");
    await runAllMigrations();
    console.log("✅ Database migrations completed");
    logger.info("✅ Database migrations completed");

    // Initialize Meilisearch service
    console.log("🔄 Initializing Meilisearch service...");
    try {
      await meilisearchService.initialize();
      console.log("✅ Meilisearch service initialized");
      logger.info("✅ Meilisearch service initialized");
    } catch (error) {
      console.log("❌ Failed to initialize Meilisearch service:", error);
      await logger.error("❌ Failed to initialize Meilisearch service", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue without Meilisearch for now
    }

    // Initialize retry manager
    console.log("🔄 Initializing retry manager...");
    const db = getDatabase();
    retryManager = new RetryManager(db);
    console.log("✅ Retry manager initialized");
    logger.info("✅ Retry manager initialized");

    // Initialize task scheduler
    console.log("🔄 Initializing task scheduler...");
    taskScheduler = new TaskScheduler(db, {
      checkInterval: 60000, // Check every minute
      maxConcurrentInstances: 10,
      defaultTimezone: "UTC",
    });
    console.log("🔄 Starting task scheduler...");
    taskScheduler.start();
    console.log("✅ Task scheduler initialized and started");
    logger.info("✅ Task scheduler initialized and started");

    // Initialize MCP Enhanced Task Processor for learning and monitoring
    console.log("🚀 Initializing MCP Enhanced Task Processor...");
    await logger.info("🚀 Initializing MCP Enhanced Task Processor...");
    try {
      await enhancedTaskProcessor.initialize();
      const dashboardInfo = enhancedTaskProcessor.getLiveDashboardInfo();
      console.log("✅ MCP Enhanced Task Processor initialized");
      await logger.info("✅ MCP Enhanced Task Processor initialized", {
        websocketUrl: dashboardInfo.websocketUrl,
        dashboardPath: dashboardInfo.dashboardPath,
      });
    } catch (error) {
      console.log(
        "❌ Failed to initialize MCP Enhanced Task Processor:",
        error
      );
      await logger.error(
        "❌ Failed to initialize MCP Enhanced Task Processor",
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      // Continue without MCP for now
    }

    // Start orchestrator loop (every 5 seconds)
    console.log("🔄 Starting orchestrator loop...");
    logger.info("🔄 Starting orchestrator loop...");

    // Test the orchestrator loop function directly first
    console.log("🧪 Testing orchestrator loop function directly...");
    try {
      await orchestratorLoop();
      console.log("✅ Direct orchestrator loop test completed");
    } catch (error) {
      console.error("❌ Direct orchestrator loop test failed:", error);
      logger.error("❌ Direct orchestrator loop test failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Start the interval
    const orchestratorInterval = setInterval(async () => {
      console.log(
        "🔄 Interval callback triggered at",
        new Date().toISOString()
      );
      try {
        await orchestratorLoop();
      } catch (error) {
        console.error("❌ Orchestrator loop error:", error);
        logger.error("❌ Orchestrator loop error", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 5000);

    console.log(
      "✅ Orchestrator loop started with interval ID:",
      orchestratorInterval
    );
    logger.info("✅ Orchestrator loop started");

    // Start watching the incoming directory
    const incomingDir = config.paths.incoming;
    logger.info("Starting file watcher", { directory: incomingDir });
    watch(incomingDir, async (eventType, filename) => {
      if (!filename) return;
      if (eventType === "rename" || eventType === "change") {
        const filePath = join(incomingDir, filename);
        logger.info("File event detected", { eventType, filename });
        // Only process if file exists (avoid double event on delete)
        try {
          const stat = await fsPromises.stat(filePath);
          if (stat.isFile()) {
            await processTaskFile(filePath);
          }
        } catch {}
      }
    });
    logger.info("File watcher started successfully");

    // Start watching the media directory for Phase 4 media ingestion
    const mediaDir = config.paths.media;
    logger.info("Starting media file watcher", { directory: mediaDir });

    // Function to recursively watch media directory
    async function watchMediaDirectory(dir: string) {
      try {
        watch(dir, { recursive: true }, async (eventType, filename) => {
          if (!filename) return;
          if (eventType === "rename" || eventType === "change") {
            const filePath = join(dir, filename);
            logger.info("Media file event detected", {
              eventType,
              filename,
              filePath,
            });

            // Only process if file exists and is a media file
            try {
              const stat = await fsPromises.stat(filePath);
              if (stat.isFile() && isMediaFile(filePath)) {
                await processMediaFile(filePath);
              }
            } catch (err) {
              // File might have been deleted or moved, ignore
            }
          }
        });
      } catch (error) {
        logger.warn("Failed to watch media directory", {
          directory: dir,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await watchMediaDirectory(mediaDir);
    logger.info("Media file watcher started successfully");

    // Start RSS watcher for automatic content discovery
    console.log("🔄 Starting RSS watcher...");
    try {
      rssWatcher.start();
      console.log("✅ RSS watcher started successfully");
      logger.info("✅ RSS watcher started successfully");
    } catch (error) {
      console.log("❌ Failed to start RSS watcher:", error);
      await logger.error("❌ Failed to start RSS watcher", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue without RSS watcher
    }

    // Setup graceful shutdown for MCP processor and scheduler
    process.on("SIGINT", async () => {
      await logger.info("🛑 Shutting down services...");
      taskScheduler?.stop();
      rssWatcher.stop();
      await enhancedTaskProcessor.shutdown();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await logger.info("🛑 Shutting down services...");
      taskScheduler?.stop();
      rssWatcher.stop();
      await enhancedTaskProcessor.shutdown();
      process.exit(0);
    });
  } catch (error) {
    logger.error("Failed to start application", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();
