import {
  getDefaultBasePath,
  getDefaultMediaPath,
  getDefaultMediaTypePaths,
  getDefaultS3Paths,
  getStandardDirectoryStructure,
} from "./utils/cross-platform-paths.js";

// Cross-platform configuration using utility functions with reactive getters
export function getBasePath(): string {
  return getDefaultBasePath();
}

export function getMediaCollectionPath(): string {
  return getDefaultMediaPath();
}

// Factory function to create fresh config - immune to module mocking
export function createFreshConfig() {
  try {
    const basePath = getDefaultBasePath();
    if (!basePath) {
      throw new Error('Base path is undefined');
    }
    const standardDirs = getStandardDirectoryStructure(basePath);
    if (!standardDirs || !standardDirs.outputs) {
      throw new Error('Standard directories not properly initialized');
    }
    return {
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
      ollama: {
        url: process.env.OLLAMA_URL || "http://localhost:11434",
        model: process.env.OLLAMA_MODEL || "qwen3:8b",
        fastModel: process.env.OLLAMA_FAST_MODEL || "qwen3:8b",
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || "",
        model: "gpt-4",
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
      s3: (() => {
        const s3Paths = getDefaultS3Paths();
        return {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_DEFAULT_REGION,
          endpoint: process.env.S3_ENDPOINT,
          defaultBucket: process.env.S3_DEFAULT_BUCKET,
          defaultDownloadPath: s3Paths.downloadPath,
          syncLogPath: s3Paths.syncLogPath,
        };
      })(),
      media: (() => {
        const mediaTypePaths = getDefaultMediaTypePaths();
        return {
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
        };
      })(),
      downloaders: {
        ytdlp: {
          path: process.env.YTDLP_PATH || "yt-dlp",
          defaultFormat: process.env.YTDLP_DEFAULT_FORMAT || "best[height<=1080]",
          defaultQuality: process.env.YTDLP_DEFAULT_QUALITY || "720p",
          outputTemplate:
            process.env.YTDLP_OUTPUT_TEMPLATE || "%(title)s [%(id)s].%(ext)s",
        },
        rss: {
          enabled: process.env.RSS_ENABLED === "true",
          checkInterval: parseInt(process.env.RSS_CHECK_INTERVAL || "3600"),
          feeds: process.env.RSS_FEEDS ? process.env.RSS_FEEDS.split(",") : [],
        },
      },
    };
  } catch (error) {
    // Fallback for when module mocking interferes
    const fallbackBase = process.env.BASE_PATH || '/tmp/banana-bun-fallback';
    return {
      paths: {
        incoming: `${fallbackBase}/incoming`,
        processing: `${fallbackBase}/processing`,
        archive: `${fallbackBase}/archive`,
        error: `${fallbackBase}/error`,
        tasks: `${fallbackBase}/tasks`,
        outputs: `${fallbackBase}/outputs`,
        logs: `${fallbackBase}/logs`,
        dashboard: `${fallbackBase}/dashboard`,
        database: `${fallbackBase}/banana-bun.db`,
        media: `${fallbackBase}/media`,
        chroma: {
          host: "localhost",
          port: 8000,
          ssl: false,
        },
      },
      ollama: {
        url: process.env.OLLAMA_URL || "http://localhost:11434",
        model: process.env.OLLAMA_MODEL || "qwen3:8b",
        fastModel: process.env.OLLAMA_FAST_MODEL || "qwen3:8b",
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || "",
        model: "gpt-4",
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
        defaultDownloadPath: `${fallbackBase}/s3-downloads`,
        syncLogPath: `${fallbackBase}/s3-sync.log`,
      },
      media: {
        collectionTv: `${fallbackBase}/tv`,
        collectionMovies: `${fallbackBase}/movies`,
        collectionYouTube: `${fallbackBase}/youtube`,
        collectionCatchAll: `${fallbackBase}/catchall`,
        tools: {
          ffprobe: process.env.FFPROBE_PATH || "ffprobe",
          mediainfo: process.env.MEDIAINFO_PATH || "mediainfo",
          preferred: "ffprobe" as "ffprobe" | "mediainfo" | "auto",
        },
        extensions: {
          video: [".mp4", ".mkv"],
          audio: [".mp3", ".wav"],
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
              pattern: "{series}/Season {season:02d}/{series} - S{season:02d}E{episode:02d} - {title}",
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
          outputTemplate: process.env.YTDLP_OUTPUT_TEMPLATE || "%(title)s [%(id)s].%(ext)s",
        },
        rss: {
          enabled: process.env.RSS_ENABLED === "true",
          checkInterval: parseInt(process.env.RSS_CHECK_INTERVAL || "3600"),
          feeds: process.env.RSS_FEEDS ? process.env.RSS_FEEDS.split(",") : [],
        },
      },
    };
  }
}

export const config = {
  get paths() {
    try {
      const basePath = getDefaultBasePath();
      if (!basePath) {
        throw new Error('Base path is undefined');
      }
      const standardDirs = getStandardDirectoryStructure(basePath);
      if (!standardDirs || !standardDirs.outputs) {
        throw new Error('Standard directories not properly initialized');
      }
      return {
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
      };
    } catch (error) {
      // Fallback for when module mocking interferes
      const fallbackBase = process.env.BASE_PATH || '/tmp/banana-bun-fallback';
      return {
        incoming: `${fallbackBase}/incoming`,
        processing: `${fallbackBase}/processing`,
        archive: `${fallbackBase}/archive`,
        error: `${fallbackBase}/error`,
        tasks: `${fallbackBase}/tasks`,
        outputs: `${fallbackBase}/outputs`,
        logs: `${fallbackBase}/logs`,
        dashboard: `${fallbackBase}/dashboard`,
        database: `${fallbackBase}/banana-bun.db`,
        media: `${fallbackBase}/media`,
        chroma: {
          host: "localhost",
          port: 8000,
          ssl: false,
        },
      };
    }
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: "gpt-4",
  },
  get ollama() {
    return {
      url: process.env.OLLAMA_URL || "http://localhost:11434",
      model: process.env.OLLAMA_MODEL || "qwen3:8b",
      fastModel: process.env.OLLAMA_FAST_MODEL || "qwen3:8b",
    };
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
  get s3() {
    const s3Paths = getDefaultS3Paths();
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_DEFAULT_REGION,
      endpoint: process.env.S3_ENDPOINT,
      defaultBucket: process.env.S3_DEFAULT_BUCKET,
      defaultDownloadPath: s3Paths.downloadPath,
      syncLogPath: s3Paths.syncLogPath,
    };
  },
  get media() {
    const mediaTypePaths = getDefaultMediaTypePaths();
    return {
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
    };
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

// For backward compatibility, we'll need to update code that uses these constants
// to call the functions instead. For now, export the current values but they won't be reactive.
export const BASE_PATH = getDefaultBasePath();
export const MEDIA_COLLECTION_PATH = getDefaultMediaPath();
