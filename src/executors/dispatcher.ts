import type { BaseTask, ShellTask, LlmTask, PlannerTask, CodeTask, ReviewTask, RunCodeTask, BatchTask, ToolTask, YoutubeTask, MediaIngestTask, MediaOrganizeTask, MediaTranscribeTask, MediaTagTask, IndexMeiliTask, IndexChromaTask, MediaSummarizeTask, MediaRecommendTask, VideoSceneDetectTask, VideoObjectDetectTask, AudioAnalyzeTask, MediaDownloadTask } from '../types';
import { executeShellTask } from './shell';
import { executeLlmTask } from './llm';
import { executePlannerTask } from './planner';
import { executeCodeTask } from './code';
import { executeReviewTask } from './review';
import { executeRunCodeTask } from './run_code';
import { executeBatchTask } from './batch';
import { executeToolTask } from './tool';
import { executeYoutubeTask } from './youtube';
import { executeMediaIngestTask, executeMediaOrganizeTask } from './media';
import { executeMediaTranscribeTask } from './transcribe';
import { executeMediaTagTask } from './tag';
import { executeIndexMeiliTask, executeIndexChromaTask } from './index';
import { executeMediaSummarizeTask } from './summarize';
import { executeMediaRecommendTask } from './recommend';
import { executeVideoSceneDetectTask, executeVideoObjectDetectTask } from './scene-detect';
import { executeAudioAnalyzeTask } from './audio-analyze';
import { executeMediaDownloadTask } from './download';
import { analyticsLogger } from '../analytics/logger';

// Execution result type
export interface ExecutionResult {
    success: boolean;
    outputPath?: string;
    filePath?: string;
    subtaskIds?: number[];
    error?: string;
}

// Task executor dispatcher map with strongly typed functions
export const taskExecutors = {
    shell: (task: ShellTask): Promise<ExecutionResult> => executeShellTask(task),
    llm: (task: LlmTask): Promise<ExecutionResult> => executeLlmTask(task),
    planner: (task: PlannerTask): Promise<ExecutionResult> => executePlannerTask(task),
    code: (task: CodeTask): Promise<ExecutionResult> => executeCodeTask(task),
    review: (task: ReviewTask): Promise<ExecutionResult> => executeReviewTask(task),
    run_code: (task: RunCodeTask): Promise<ExecutionResult> => executeRunCodeTask(task),
    batch: (task: BatchTask): Promise<ExecutionResult> => executeBatchTask(task),
    tool: (task: ToolTask): Promise<ExecutionResult> => executeToolTask(task),
    youtube: (task: YoutubeTask): Promise<ExecutionResult> => executeYoutubeTask(task),
    media_ingest: (task: MediaIngestTask): Promise<ExecutionResult> => executeMediaIngestTask(task),
    media_organize: (task: MediaOrganizeTask): Promise<ExecutionResult> => executeMediaOrganizeTask(task),
    media_transcribe: (task: MediaTranscribeTask): Promise<ExecutionResult> => executeMediaTranscribeTask(task),
    media_tag: (task: MediaTagTask): Promise<ExecutionResult> => executeMediaTagTask(task),
    index_meili: (task: IndexMeiliTask): Promise<ExecutionResult> => executeIndexMeiliTask(task),
    index_chroma: (task: IndexChromaTask): Promise<ExecutionResult> => executeIndexChromaTask(task),
    media_summarize: (task: MediaSummarizeTask): Promise<ExecutionResult> => executeMediaSummarizeTask(task),
    media_recommend: (task: MediaRecommendTask): Promise<ExecutionResult> => executeMediaRecommendTask(task),
    video_scene_detect: (task: VideoSceneDetectTask): Promise<ExecutionResult> => executeVideoSceneDetectTask(task),
    video_object_detect: (task: VideoObjectDetectTask): Promise<ExecutionResult> => executeVideoObjectDetectTask(task),
    audio_analyze: (task: AudioAnalyzeTask): Promise<ExecutionResult> => executeAudioAnalyzeTask(task),
    media_download: (task: MediaDownloadTask): Promise<ExecutionResult> => executeMediaDownloadTask(task)
} as const;

// Type-safe task executor function with analytics logging
export async function executeTask(task: BaseTask): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Log task start
    await analyticsLogger.logTaskStart(task);

    try {
        let result: ExecutionResult;

        switch (task.type) {
            case 'shell':
                result = await taskExecutors.shell(task);
                break;
            case 'llm':
                result = await taskExecutors.llm(task);
                break;
            case 'planner':
                result = await taskExecutors.planner(task);
                break;
            case 'code':
                result = await taskExecutors.code(task);
                break;
            case 'review':
                result = await taskExecutors.review(task);
                break;
            case 'run_code':
                result = await taskExecutors.run_code(task);
                break;
            case 'batch':
                result = await taskExecutors.batch(task);
                break;
            case 'tool':
                result = await taskExecutors.tool(task);
                break;
            case 'youtube':
                result = await taskExecutors.youtube(task);
                break;
            case 'media_ingest':
                result = await taskExecutors.media_ingest(task);
                break;
            case 'media_organize':
                result = await taskExecutors.media_organize(task);
                break;
            case 'media_transcribe':
                result = await taskExecutors.media_transcribe(task);
                break;
            case 'media_tag':
                result = await taskExecutors.media_tag(task);
                break;
            case 'index_meili':
                result = await taskExecutors.index_meili(task);
                break;
            case 'index_chroma':
                result = await taskExecutors.index_chroma(task);
                break;
            case 'media_summarize':
                result = await taskExecutors.media_summarize(task);
                break;
            case 'media_recommend':
                result = await taskExecutors.media_recommend(task);
                break;
            case 'video_scene_detect':
                result = await taskExecutors.video_scene_detect(task);
                break;
            case 'video_object_detect':
                result = await taskExecutors.video_object_detect(task);
                break;
            case 'audio_analyze':
                result = await taskExecutors.audio_analyze(task);
                break;
            case 'media_download':
                result = await taskExecutors.media_download(task);
                break;
            default:
                // TypeScript will ensure this is never reached if all cases are handled
                const exhaustiveCheck: never = task;
                throw new Error(`Unknown task type: ${(exhaustiveCheck as any).type}`);
        }

        const duration = Date.now() - startTime;

        // Log task completion or error
        if (result.success) {
            await analyticsLogger.logTaskComplete(task, duration);
        } else {
            await analyticsLogger.logTaskError(task, result.error || 'Unknown error', duration);
        }

        return result;

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        await analyticsLogger.logTaskError(task, errorMessage, duration);

        return {
            success: false,
            error: errorMessage
        };
    }
}
