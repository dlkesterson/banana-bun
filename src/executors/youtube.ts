import { spawn } from 'bun';
import { join } from 'path';
import { config } from '../config';
import type { YoutubeTask } from '../types';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';

export async function executeYoutubeTask(task: YoutubeTask): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const url = task.url || task.description;
    if (!url) {
        const error = 'No YouTube URL found in task';
        await logger.error(error, { task });
        return { success: false, error };
    }

    const db = getDatabase();
    let videoId = '';
    let meta: any = {};
    try {
        // Get metadata only (to check for duplicates)
        const metaProc = spawn({
            cmd: ["yt-dlp", "--dump-json", url],
            stdout: "pipe",
            stderr: "pipe"
        });
        const metaStdout = await new Response(metaProc.stdout).text();
        if (metaProc.exited) await metaProc.exited;
        meta = JSON.parse(metaStdout);
        videoId = meta.id;
        // Check for duplicate
        const exists = db.query('SELECT id, file_path FROM media WHERE video_id = ?').get(videoId) as { id: number, file_path: string } | undefined;
        if (exists) {
            await logger.info('YouTube video already downloaded', { videoId });
            return { success: true, filePath: exists.file_path };
        }
    } catch (err) {
        const error = 'Failed to fetch YouTube metadata';
        await logger.error(error, { url, err });
        return { success: false, error };
    }

    try {
        // Download video
        const mediaDir = config.paths.media;
        const outTemplate = join(mediaDir, '%(title)s [%(id)s].%(ext)s');
        const dlProc = spawn({
            cmd: ["yt-dlp", "-o", outTemplate, url],
            stdout: "pipe",
            stderr: "pipe"
        });
        const dlStderr = await new Response(dlProc.stderr).text();
        const exitCode = await dlProc.exited;
        if (exitCode !== 0) {
            await logger.error('yt-dlp failed', { url, dlStderr });
            return { success: false, error: dlStderr };
        }
        // Find the downloaded file path
        const ext = meta.ext || 'mp4';
        const filePath = join(mediaDir, `${meta.title} [${meta.id}].${ext}`);
        // Insert metadata
        db.run(
            'INSERT INTO media (video_id, title, channel, file_path) VALUES (?, ?, ?, ?)',
            [meta.id, meta.title, meta.channel || meta.uploader, filePath]
        );
        await logger.info('YouTube video downloaded', { videoId: meta.id, filePath });
        return { success: true, filePath };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await logger.error('Error downloading YouTube video', { url, error });
        return { success: false, error };
    }
} 