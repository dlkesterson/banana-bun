import { spawn } from "bun";
import { join, dirname } from "path";
import { mkdir } from "fs/promises";
import { config } from "../config";
import type { MediaDownloadTask } from "../types/task";
import type { ExecutionResult } from "./dispatcher";
import { logger } from "../utils/logger";
import { getDatabase } from "../db";
// Removed arr-integrations import for Banana Bun

export async function executeMediaDownloadTask(
  task: MediaDownloadTask
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    await logger.info("Starting media download task", {
      taskId: task.id,
      source: task.source,
      url: task.url,
      query: task.query,
      mediaType: task.media_type,
    });

    let result: ExecutionResult;

    switch (task.source) {
      case "youtube":
        result = await downloadFromYoutube(task);
        break;
      case "torrent":
        result = {
          success: false,
          error: "Torrent downloads not supported in Banana Bun",
        };
        break;
      case "nzb":
        result = await downloadFromNzb(task);
        break;
      case "rss":
        result = await downloadFromRss(task);
        break;
      default:
        const error = `Unsupported download source: ${task.source}`;
        await logger.error(error, { taskId: task.id });
        return { success: false, error };
    }

    if (result.success && result.filePath) {
      // Create follow-up media ingest task
      await createMediaIngestTask(result.filePath, task.id);
    }

    const totalTime = Date.now() - startTime;
    await logger.info("Media download task completed", {
      taskId: task.id,
      source: task.source,
      success: result.success,
      filePath: result.filePath,
      totalTimeMs: totalTime,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logger.error("Media download task failed", {
      taskId: task.id,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

async function downloadFromYoutube(
  task: MediaDownloadTask
): Promise<ExecutionResult> {
  if (!task.url) {
    return { success: false, error: "YouTube download requires URL" };
  }

  try {
    // Determine output directory
    const outputDir = task.destination_path || config.paths.media;
    await mkdir(outputDir, { recursive: true });

    // Get video metadata first
    const metaProc = spawn({
      cmd: [config.downloaders.ytdlp.path, "--dump-json", task.url],
      stdout: "pipe",
      stderr: "pipe",
    });

    const metaStdout = await new Response(metaProc.stdout).text();
    const metaExitCode = await metaProc.exited;

    if (metaExitCode !== 0) {
      const metaStderr = await new Response(metaProc.stderr).text();
      return {
        success: false,
        error: `Failed to get video metadata: ${metaStderr}`,
      };
    }

    const meta = JSON.parse(metaStdout);
    const videoId = meta.id;

    // Check for duplicate in database
    const db = getDatabase();
    const existing = db
      .prepare("SELECT id, file_path FROM media WHERE video_id = ?")
      .get(videoId) as { id: number; file_path: string } | undefined;
    if (existing) {
      await logger.info("YouTube video already downloaded", {
        videoId,
        filePath: existing.file_path,
      });
      return { success: true, filePath: existing.file_path };
    }

    // Prepare download command
    const format = task.format || config.downloaders.ytdlp.defaultFormat;
    const outputTemplate = join(
      outputDir,
      config.downloaders.ytdlp.outputTemplate
    );

    const downloadProc = spawn({
      cmd: [
        config.downloaders.ytdlp.path,
        "-f",
        format,
        "-o",
        outputTemplate,
        task.url,
      ],
      stdout: "pipe",
      stderr: "pipe",
    });

    const downloadStderr = await new Response(downloadProc.stderr).text();
    const downloadExitCode = await downloadProc.exited;

    if (downloadExitCode !== 0) {
      return {
        success: false,
        error: `YouTube download failed: ${downloadStderr}`,
      };
    }

    // Determine the actual file path
    const ext = meta.ext || "mp4";
    const filePath = join(outputDir, `${meta.title} [${meta.id}].${ext}`);

    // Store metadata in database
    db.run(
      "INSERT OR REPLACE INTO media (video_id, title, channel, file_path) VALUES (?, ?, ?, ?)",
      [meta.id, meta.title, meta.channel || meta.uploader, filePath]
    );

    return { success: true, filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// downloadFromTorrent function removed for Banana Bun - torrent functionality not supported

async function downloadFromNzb(
  task: MediaDownloadTask
): Promise<ExecutionResult> {
  // Similar to torrent but for NZB/Usenet
  return { success: false, error: "NZB downloads not yet implemented" };
}

async function downloadFromRss(
  task: MediaDownloadTask
): Promise<ExecutionResult> {
  if (!task.url) {
    return { success: false, error: "RSS download requires URL" };
  }

  try {
    // For RSS downloads, the URL is typically a direct media file URL
    // This is different from RSS feed monitoring which is handled by the RSS watcher

    // Determine output directory
    const outputDir = task.destination_path || config.paths.media;
    await mkdir(outputDir, { recursive: true });

    // Extract filename from URL
    const urlParts = task.url.split("/");
    const filename = urlParts[urlParts.length - 1] || "rss-download";
    const filePath = join(outputDir, filename);

    // Download the file
    const response = await fetch(task.url);
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to download from RSS: ${response.statusText}`,
      };
    }

    // Save the file
    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(filePath, arrayBuffer);

    logger.info("RSS download completed", {
      url: task.url,
      filePath,
      size: arrayBuffer.byteLength,
    });

    return {
      success: true,
      filePath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function createMediaIngestTask(
  filePath: string,
  parentTaskId: number | string
): Promise<void> {
  try {
    const db = getDatabase();
    const filename = filePath.split(/[/\\]/).pop() || "unknown";

    const taskData = {
      type: "media_ingest",
      description: `Auto-ingest downloaded media: ${filename}`,
      status: "pending",
      parent_id: parentTaskId,
      args: JSON.stringify({
        file_path: filePath,
      }),
    };

    db.run(
      `INSERT INTO tasks (type, description, status, parent_id, args)
             VALUES (?, ?, ?, ?, ?)`,
      [
        taskData.type,
        taskData.description,
        taskData.status,
        taskData.parent_id,
        taskData.args,
      ]
    );

    await logger.info("Created follow-up media ingest task", {
      parentTaskId,
      filePath,
      filename,
    });
  } catch (error) {
    await logger.error("Failed to create media ingest task", {
      parentTaskId,
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
