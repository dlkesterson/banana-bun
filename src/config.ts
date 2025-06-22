import {
  getDefaultBasePath,
  getDefaultMediaPath,
  getDefaultMediaTypePaths,
  getDefaultS3Paths,
  getStandardDirectoryStructure,
} from "./utils/cross-platform-paths.js";

// Cross-platform configuration using utility functions
export const BASE_PATH = getDefaultBasePath();
export const MEDIA_COLLECTION_PATH = getDefaultMediaPath();

// Get cross-platform media type paths
const mediaTypePaths = getDefaultMediaTypePaths();
const s3Paths = getDefaultS3Paths();
const standardDirs = getStandardDirectoryStructure(BASE_PATH);

export const config = {
  paths: {
    incoming: standardDirs.incoming,
    processing: standardDirs.processing,
    archive: standardDirs.archive,
    error: standardDirs.error,
    tasks: standardDirs.tasks,
    outputs: standardDirs.outputs,
    logs: standardDirs.logs,
    dashboard: standardDirs.dashboard,
    database: standardDirs.database,
    media: standardDirs.media,
    chroma: {
      host: "localhost",
      port: 8000,
      ssl: false,
    },
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: "gpt-4",
  },
  ollama: {
    url: process.env.OLLAMA_URL || "http://localhost:11434",
    model: process.env.OLLAMA_MODEL || "qwen3:8b",
    fastModel: process.env.OLLAMA_FAST_MODEL || "qwen3:8b",
  },
  chromadb: {
    url: process.env.CHROMA_URL,
    tenant: process.env.CHROMA_TENANT,
  },
  meilisearch: {
    url: process.env.MEILISEARCH_URL || "http://localhost:7700",
    masterKey: process.env.MEILISEARCH_MASTER_KEY,
    indexName: process.env.MEILISEARCH_INDEX_NAME || "media_index",
  },
  whisper: {
    model: process.env.WHISPER_MODEL || "turbo",
    device: process.env.WHISPER_DEVICE || "cpu",
    language: process.env.WHISPER_LANGUAGE || "auto",
    chunkDuration: parseInt(process.env.WHISPER_CHUNK_DURATION || "30"),
  },
  vision: {
    model: process.env.VISION_MODEL || "openai/clip-vit-base-patch32",
    frameExtraction: {
      interval: parseInt(process.env.FRAME_INTERVAL_SECONDS || "10"),
      maxFrames: parseInt(process.env.MAX_FRAMES_PER_VIDEO || "50"),
      sceneDetection: process.env.ENABLE_SCENE_DETECTION === "true",
    },
  },
  s3: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_DEFAULT_REGION,
    endpoint: process.env.S3_ENDPOINT,
    defaultBucket: process.env.S3_DEFAULT_BUCKET,
    defaultDownloadPath: s3Paths.downloadPath,
    syncLogPath: s3Paths.syncLogPath,
  },
  media: {
    collectionTv: mediaTypePaths.tv,
    collectionMovies: mediaTypePaths.movies,
    collectionYouTube: mediaTypePaths.youtube,
    collectionCatchAll: mediaTypePaths.catchall,
    tools: {
      ffprobe: process.env.FFPROBE_PATH || "ffprobe",
      mediainfo: process.env.MEDIAINFO_PATH || "mediainfo",
      preferred: "ffprobe" as "ffprobe" | "mediainfo" | "auto",
    },
    extensions: {
      video: [
        ".mp4",
        ".mkv",
        ".avi",
        ".mov",
        ".wmv",
        ".flv",
        ".webm",
        ".m4v",
        ".3gp",
      ],
      audio: [".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".wma", ".opus"],
    },
    extraction: {
      timeout_ms: 30000,
      max_file_size_mb: 10000,
      enable_deduplication: true,
    },
    organize: {
      enabled: true,
      auto_organize_after_ingest: true,
      categorization: {
        useMetadataType: true,
        fallbackToFilename: true,
        defaultCategory: "catchall" as "tv" | "movies" | "youtube" | "catchall",
      },
      folderStructure: {
        movies: {
          pattern: "{title} ({year})",
          groupByYear: false,
          groupByGenre: false,
        },
        tv: {
          pattern:
            "{series}/Season {season:02d}/{series} - S{season:02d}E{episode:02d} - {title}",
          groupBySeries: true,
        },
        youtube: {
          pattern: "{channel}/{title}",
          groupByChannel: true,
        },
      },
      filenameNormalization: {
        maxLength: 180,
        case: "title" as "title" | "lower" | "upper",
        replaceSpaces: false,
        sanitizeChars: true,
      },
    },
  },
  downloaders: {
    ytdlp: {
      path: process.env.YTDLP_PATH || "yt-dlp",
      defaultFormat: process.env.YTDLP_DEFAULT_FORMAT || "best[height<=1080]",
      defaultQuality: process.env.YTDLP_DEFAULT_QUALITY || "720p",
      outputTemplate:
        process.env.YTDLP_OUTPUT_TEMPLATE || "%(title)s [%(id)s].%(ext)s",
    },
    // Torrent-related configurations removed for Banana Bun
    rss: {
      enabled: process.env.RSS_ENABLED === "true",
      checkInterval: parseInt(process.env.RSS_CHECK_INTERVAL || "3600"), // seconds
      feeds: process.env.RSS_FEEDS ? process.env.RSS_FEEDS.split(",") : [],
    },
  },
};
