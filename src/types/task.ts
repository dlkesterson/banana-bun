import type { ToolName } from '../tools/tool_runner';

export interface TaskMetadata {
    created_by?: string;
    priority?: number;
    tags?: string[];
    source_file?: string;
    retry?: boolean;
    markdown_content?: string;
    batch_id?: string;
    retry_count?: number;
    max_retries?: number;
    shell_command?: string;
    result_summary?: string;
    error_message?: string;
    assertions?: TaskAssertion[]; // Phase 3: Postconditions for validation
}

// Phase 3: Task Assertion System
export interface TaskAssertion {
    id?: string;
    type: 'output_contains' | 'output_not_contains' | 'file_exists' | 'file_not_exists' | 'custom_script' | 'json_schema' | 'regex_match';
    description: string;
    condition: any; // The specific condition to check
    severity: 'error' | 'warning' | 'info';
    message?: string; // Custom message when assertion fails
}

export interface AssertionResult {
    assertion_id: string;
    passed: boolean;
    message: string;
    severity: 'error' | 'warning' | 'info';
    actual_value?: any;
    expected_value?: any;
}

// Base interface with common fields - result is optional for pending tasks
interface BaseTaskFields {
    id: string | number;
    status: TaskStatus;
    result?: any; // Optional - only required for completed tasks
    error?: string;
    dependencies?: string[];
    dependents?: string[];
    parent_id?: string | number;
    filename?: string;
    file_hash?: string;
    started_at?: string;
    finished_at?: string;
    result_summary?: string;
    error_message?: string;
    metadata?: TaskMetadata;
}

// Task creation input - minimal required fields for creating new tasks
export interface TaskCreationInput {
    type: TaskType;
    description?: string;
    status?: TaskStatus; // Defaults to 'pending'
    dependencies?: string[];
    parent_id?: string | number;
    filename?: string;
    file_hash?: string;
    metadata?: TaskMetadata;
}

// Task runtime state - includes execution context
export interface TaskRuntime extends BaseTaskFields {
    status: 'running' | 'pending';
    started_at?: string;
}

// Completed task state - includes results
export interface TaskComplete extends BaseTaskFields {
    status: 'completed' | 'error' | 'cancelled';
    result: any; // Required for completed tasks
    finished_at: string; // Required for completed tasks
}

// Task-specific interfaces
export interface ShellTask extends BaseTaskFields {
    type: 'shell';
    shell_command?: string; // Optional for creation, required for execution
    description?: string;
}

export interface LlmTask extends BaseTaskFields {
    type: 'llm';
    description?: string; // Optional for creation, can be derived from context
    context?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
}

export interface PlannerTask extends BaseTaskFields {
    type: 'planner';
    description?: string; // Optional for creation
    goal?: string; // Optional for creation
    context?: Record<string, any>;
}

export interface CodeTask extends BaseTaskFields {
    type: 'code';
    description?: string; // Optional for creation
    language?: string;
    requirements?: string[];
}

export interface ReviewTask extends BaseTaskFields {
    type: 'review';
    description?: string; // Optional for creation
    target_task_id?: number;
    criteria?: string[];
}

export interface RunCodeTask extends BaseTaskFields {
    type: 'run_code';
    description?: string; // Optional for creation
    language?: string; // Optional for creation
    code?: string; // Optional for creation
}

export interface BatchTask extends BaseTaskFields {
    type: 'batch';
    description?: string; // Optional for creation
    subtasks?: BaseTask[];
    tasks?: BaseTask[]; // Legacy support
    generator?: {
        type: string;
        [key: string]: any;
    };
}

export interface ToolTask extends BaseTaskFields {
    type: 'tool';
    tool?: ToolName; // Optional for creation
    args?: Record<string, any>; // Optional for creation
    description?: string;
}

export interface YoutubeTask extends BaseTaskFields {
    type: 'youtube';
    description?: string; // Optional for creation
    url?: string;
    shell_command?: string; // Legacy support - URL can be in shell_command
    format?: string;
    quality?: string;
}

export interface MediaIngestTask extends BaseTaskFields {
    type: 'media_ingest';
    description?: string;        // Optional for creation - can be auto-generated
    file_path?: string;         // Optional for creation
    force?: boolean;           // Skip deduplication if true
    tool_preference?: 'ffprobe' | 'mediainfo' | 'auto';
}

export interface MediaOrganizeTask extends BaseTaskFields {
    type: 'media_organize';
    description?: string;        // Optional for creation - can be auto-generated
    file_path?: string;         // Single file path (optional if batch)
    file_paths?: string[];      // Multiple file paths for batch organization
    target_collection?: 'tv' | 'movies' | 'youtube' | 'catchall'; // Force specific collection
    force?: boolean;            // Override existing files if true
    dry_run?: boolean;          // Simulate organization without moving files
    metadata?: {                // Optional metadata to use instead of looking up
        [key: string]: any;     // Can include title, year, series, etc.
    };
}

export interface MediaTranscribeTask extends BaseTaskFields {
    type: 'media_transcribe';
    description?: string; // Optional for creation
    file_path?: string; // Optional for creation
    whisper_model?: string;
    language?: string;
    chunk_duration?: number; // seconds
    force?: boolean;
}

export interface MediaTagTask extends BaseTaskFields {
    type: 'media_tag';
    description?: string; // Optional for creation
    file_path?: string; // Optional for creation
    transcript?: string;
    frame_analysis?: any;
    audio_features?: any;
    force?: boolean;
    explain_reasoning?: boolean;
}

export interface IndexMeiliTask extends BaseTaskFields {
    type: 'index_meili';
    description?: string; // Optional for creation
    media_id?: number; // Optional for creation
    force?: boolean;
}

export interface IndexChromaTask extends BaseTaskFields {
    type: 'index_chroma';
    description?: string; // Optional for creation
    media_id?: number; // Optional for creation
    force?: boolean;
}

export interface MediaSummarizeTask extends BaseTaskFields {
    type: 'media_summarize';
    description?: string; // Optional for creation
    media_id?: number; // Optional for creation
    transcript_id?: number;
    style?: 'bullet' | 'paragraph' | 'key_points';
    model?: string;
    force?: boolean;
}

export interface MediaRecommendTask extends BaseTaskFields {
    type: 'media_recommend';
    description?: string; // Optional for creation
    media_id?: number;
    user_id?: string;
    top_k?: number;
    recommendation_type?: 'similar' | 'user_based' | 'hybrid'; // Optional for creation
}

export interface VideoSceneDetectTask extends BaseTaskFields {
    type: 'video_scene_detect';
    description?: string; // Optional for creation
    media_id?: number; // Optional for creation
    threshold?: number;
    force?: boolean;
}

export interface VideoObjectDetectTask extends BaseTaskFields {
    type: 'video_object_detect';
    description?: string; // Optional for creation
    scene_id?: number; // Optional for creation
    confidence_threshold?: number;
    force?: boolean;
}

export interface AudioAnalyzeTask extends BaseTaskFields {
    type: 'audio_analyze';
    description?: string; // Optional for creation
    media_id?: number; // Optional for creation
    analysis_type?: 'full' | 'classification' | 'features';
    force?: boolean;
}

export interface MediaDownloadTask extends BaseTaskFields {
    type: 'media_download';
    description?: string; // Optional for creation
    source?: 'torrent' | 'nzb' | 'youtube' | 'rss'; // Optional for creation
    url?: string;
    query?: string;
    media_type?: 'movie' | 'tv' | 'music' | 'video';
    destination_path?: string;
    quality?: string;
    format?: string;
}

// Discriminated union of all task types
export type BaseTask =
    | ShellTask
    | LlmTask
    | PlannerTask
    | CodeTask
    | ReviewTask
    | RunCodeTask
    | BatchTask
    | ToolTask
    | YoutubeTask
    | MediaIngestTask
    | MediaOrganizeTask
    | MediaTranscribeTask
    | MediaTagTask
    | IndexMeiliTask
    | IndexChromaTask
    | MediaSummarizeTask
    | MediaRecommendTask
    | VideoSceneDetectTask
    | VideoObjectDetectTask
    | AudioAnalyzeTask
    | MediaDownloadTask;

// Task type and status constants with as const for literal types
export const TASK_TYPES = [
    'shell',
    'llm',
    'planner',
    'code',
    'review',
    'run_code',
    'batch',
    'tool',
    'youtube',
    'media_ingest',
    'media_organize',
    'media_transcribe',
    'media_tag',
    'index_meili',
    'index_chroma',
    'media_summarize',
    'media_recommend',
    'video_scene_detect',
    'video_object_detect',
    'audio_analyze',
    'media_download'
] as const;

export const TASK_STATUSES = [
    'pending',
    'running',
    'completed',
    'error',
    'cancelled'
] as const;

export type TaskType = typeof TASK_TYPES[number];
export type TaskStatus = typeof TASK_STATUSES[number];

// Utility types for better type safety
export type PendingTask = BaseTask & { status: 'pending' };
export type RunningTask = BaseTask & { status: 'running'; started_at: string };
export type CompletedTask = BaseTask & { status: 'completed'; result: any; finished_at: string };
export type ErrorTask = BaseTask & { status: 'error'; error_message: string; finished_at: string };
export type CancelledTask = BaseTask & { status: 'cancelled'; finished_at: string };

// Task creation helpers - minimal required fields for each task type
export interface ShellTaskCreation extends TaskCreationInput {
    type: 'shell';
    shell_command?: string;
}

export interface LlmTaskCreation extends TaskCreationInput {
    type: 'llm';
    context?: string;
    model?: string;
}

export interface ToolTaskCreation extends TaskCreationInput {
    type: 'tool';
    tool?: ToolName;
    args?: Record<string, any>;
}

// Type guards for task states
export function isPendingTask(task: BaseTask): task is PendingTask {
    return task.status === 'pending';
}

export function isRunningTask(task: BaseTask): task is RunningTask {
    return task.status === 'running' && !!task.started_at;
}

export function isCompletedTask(task: BaseTask): task is CompletedTask {
    return task.status === 'completed' && task.result !== undefined && !!task.finished_at;
}

export function isErrorTask(task: BaseTask): task is ErrorTask {
    return task.status === 'error' && !!task.finished_at;
}

export function isCancelledTask(task: BaseTask): task is CancelledTask {
    return task.status === 'cancelled' && !!task.finished_at;
}

// Enhanced DatabaseTask interface that matches the actual SQLite schema exactly
export interface DatabaseTask {
    id: number;
    filename: string | null;
    file_hash: string | null;
    parent_id: number | null;
    description: string | null;
    type: TaskType;
    status: TaskStatus;
    dependencies: string | null; // JSON string or null
    result_summary: string | null;
    shell_command: string | null;
    error_message: string | null;
    args: string | null; // JSON string or null
    generator: string | null; // JSON string or null
    tool: string | null; // Tool name for tool tasks or null
    validation_errors: string | null; // JSON string of validation errors or null
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
}