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

// Base interface with common fields
interface BaseTaskFields {
    id: string | number;
    status: TaskStatus;
    result: any;
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

// Task-specific interfaces
export interface ShellTask extends BaseTaskFields {
    type: 'shell';
    shell_command: string;
    description?: string;
}

export interface LlmTask extends BaseTaskFields {
    type: 'llm';
    description: string; // Required as prompt
    context?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
}

export interface PlannerTask extends BaseTaskFields {
    type: 'planner';
    description: string;
    goal: string;
    context?: Record<string, any>;
}

export interface CodeTask extends BaseTaskFields {
    type: 'code';
    description: string; // Required for code generation
    language?: string;
    requirements?: string[];
}

export interface ReviewTask extends BaseTaskFields {
    type: 'review';
    description: string;
    target_task_id?: number;
    criteria?: string[];
}

export interface RunCodeTask extends BaseTaskFields {
    type: 'run_code';
    description: string;
    language: string;
    code: string;
}

export interface BatchTask extends BaseTaskFields {
    type: 'batch';
    description: string;
    subtasks?: BaseTask[];
    tasks?: BaseTask[]; // Legacy support
    generator?: {
        type: string;
        [key: string]: any;
    };
}

export interface ToolTask extends BaseTaskFields {
    type: 'tool';
    tool: ToolName;
    args: Record<string, any>;
    description?: string;
}

export interface YoutubeTask extends BaseTaskFields {
    type: 'youtube';
    description: string;
    url?: string;
    shell_command?: string; // Legacy support - URL can be in shell_command
    format?: string;
    quality?: string;
}

export interface MediaIngestTask extends BaseTaskFields {
    type: 'media_ingest';
    description: string;        // Auto-generated: "Ingest metadata for {filename}"
    file_path: string;         // Full path to media file
    force?: boolean;           // Skip deduplication if true
    tool_preference?: 'ffprobe' | 'mediainfo' | 'auto';
}

export interface MediaOrganizeTask extends BaseTaskFields {
    type: 'media_organize';
    description: string;        // Auto-generated: "Organize media files for {filename}"
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
    description: string;
    file_path: string;
    whisper_model?: string;
    language?: string;
    chunk_duration?: number; // seconds
    force?: boolean;
}

export interface MediaTagTask extends BaseTaskFields {
    type: 'media_tag';
    description: string;
    file_path: string;
    transcript?: string;
    frame_analysis?: any;
    audio_features?: any;
    force?: boolean;
    explain_reasoning?: boolean;
}

export interface IndexMeiliTask extends BaseTaskFields {
    type: 'index_meili';
    description: string;
    media_id: number;
    force?: boolean;
}

export interface IndexChromaTask extends BaseTaskFields {
    type: 'index_chroma';
    description: string;
    media_id: number;
    force?: boolean;
}

export interface MediaSummarizeTask extends BaseTaskFields {
    type: 'media_summarize';
    description: string;
    media_id: number;
    transcript_id?: number;
    style?: 'bullet' | 'paragraph' | 'key_points';
    model?: string;
    force?: boolean;
}

export interface MediaRecommendTask extends BaseTaskFields {
    type: 'media_recommend';
    description: string;
    media_id?: number;
    user_id?: string;
    top_k?: number;
    recommendation_type: 'similar' | 'user_based' | 'hybrid';
}

export interface VideoSceneDetectTask extends BaseTaskFields {
    type: 'video_scene_detect';
    description: string;
    media_id: number;
    threshold?: number;
    force?: boolean;
}

export interface VideoObjectDetectTask extends BaseTaskFields {
    type: 'video_object_detect';
    description: string;
    scene_id: number;
    confidence_threshold?: number;
    force?: boolean;
}

export interface AudioAnalyzeTask extends BaseTaskFields {
    type: 'audio_analyze';
    description: string;
    media_id: number;
    analysis_type?: 'full' | 'classification' | 'features';
    force?: boolean;
}

export interface MediaDownloadTask extends BaseTaskFields {
    type: 'media_download';
    description: string;
    source: 'torrent' | 'nzb' | 'youtube' | 'rss';
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