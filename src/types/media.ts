/**
 * Phase 4: Media Metadata Types
 */

export interface MediaMetadata {
    // File Information
    filename: string;
    filepath: string;
    filesize: number;
    file_hash: string;

    // Technical Metadata
    format: string;           // Container format (mp4, mkv, etc.)
    duration: number;         // Duration in seconds
    bitrate: number;          // Overall bitrate

    // Video Streams (if present)
    video?: {
        codec: string;          // H.264, H.265, VP9, etc.
        resolution: string;     // "1920x1080"
        width: number;
        height: number;
        fps: number;
        bitrate: number;
    }[];

    // Audio Streams
    audio?: {
        codec: string;          // AAC, MP3, FLAC, etc.
        channels: number;       // 2, 5.1, 7.1, etc.
        sample_rate: number;    // 44100, 48000, etc.
        bitrate: number;
        language?: string;      // ISO language code
    }[];

    // Subtitle Streams
    subtitles?: {
        codec: string;          // SRT, ASS, VTT, etc.
        language?: string;      // ISO language code
        forced: boolean;
    }[];

    // Embedded Metadata
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    genre?: string;
    description?: string;

    // Content Analysis (Phase 4 foundation)
    guessed_type?: 'movie' | 'tv_episode' | 'music' | 'podcast' | 'other';
    confidence?: number;      // 0-1 confidence in guessed_type

    // AI-Generated Content (PRD Part 2)
    tags?: string[];          // AI-generated descriptive tags
    tag_explanations?: { [tag: string]: string }; // LLM reasoning for each tag
    summary?: string;         // AI-generated content summary
    transcript?: string;      // Full transcript from Whisper
    transcript_chunks?: {     // Chunked transcript with timestamps
        start_time: number;
        end_time: number;
        text: string;
    }[];
    language?: string;        // Detected language from ASR

    // Visual Analysis
    key_frames?: {
        timestamp: number;
        frame_path?: string;
        visual_features?: string[]; // CLIP-detected features
        description?: string;
    }[];

    // Audio Analysis
    audio_features?: {
        tempo?: number;
        key?: string;
        mood?: string[];
        sound_events?: string[];
    };

    // Indexing Status
    indexed_in_meili?: boolean;
    indexed_in_chroma?: boolean;
    meili_document_id?: string;
    chroma_embedding_id?: string;
}

export interface MediaExtractionResult {
    success: boolean;
    metadata?: MediaMetadata;
    tool_used: 'ffprobe' | 'mediainfo';
    extraction_time_ms: number;
    error?: string;
    raw_output?: string;
}

export interface DatabaseMediaMetadata {
    id: number;
    task_id: number;
    file_path: string;
    file_hash: string;
    metadata_json: string; // JSON string of MediaMetadata
    extracted_at: string;
    tool_used: string;
}
