/**
 * Standard mock configuration for tests using Module Mocking Pattern
 * This ensures all tests have a complete, consistent mock config that won't interfere with each other
 */

export const standardMockConfig = {
    paths: {
        database: ':memory:',
        outputs: '/tmp/test-outputs',
        logs: '/tmp/test-logs',
        incoming: '/tmp/test-incoming',
        processing: '/tmp/test-processing',
        archive: '/tmp/test-archive',
        error: '/tmp/test-error',
        tasks: '/tmp/test-tasks',
        dashboard: '/tmp/test-dashboard',
        media: '/tmp/test-media',
        chroma: { host: 'localhost', port: 8000, ssl: false }
    },
    ollama: { 
        model: 'test-model', 
        url: 'http://localhost:11434', 
        fastModel: 'test-model' 
    },
    openai: { 
        apiKey: '', 
        model: 'gpt-4' 
    },
    chromadb: { 
        url: undefined, 
        tenant: undefined 
    },
    meilisearch: { 
        url: 'http://localhost:7700', 
        masterKey: undefined, 
        indexName: 'media_index' 
    },
    whisper: { 
        model: 'turbo', 
        device: 'cpu', 
        language: 'auto', 
        chunkDuration: 30 
    },
    vision: { 
        model: 'openai/clip-vit-base-patch32', 
        frameExtraction: { 
            interval: 10, 
            maxFrames: 50, 
            sceneDetection: false 
        } 
    },
    s3: { 
        accessKeyId: undefined, 
        secretAccessKey: undefined, 
        region: undefined, 
        endpoint: undefined, 
        defaultBucket: undefined, 
        defaultDownloadPath: '/tmp/s3-downloads', 
        syncLogPath: '/tmp/s3-sync.log' 
    },
    media: { 
        collectionTv: '/tmp/tv', 
        collectionMovies: '/tmp/movies', 
        collectionYouTube: '/tmp/youtube', 
        collectionCatchAll: '/tmp/catchall', 
        tools: { 
            ffprobe: 'ffprobe', 
            mediainfo: 'mediainfo', 
            preferred: 'ffprobe' as 'ffprobe' | 'mediainfo' | 'auto'
        }, 
        extensions: { 
            video: ['.mp4', '.mkv'], 
            audio: ['.mp3', '.wav'] 
        }, 
        extraction: { 
            timeout_ms: 30000, 
            max_file_size_mb: 10000, 
            enable_deduplication: true 
        }, 
        organize: { 
            enabled: true, 
            auto_organize_after_ingest: true, 
            categorization: { 
                useMetadataType: true, 
                fallbackToFilename: true, 
                defaultCategory: 'catchall' as 'tv' | 'movies' | 'youtube' | 'catchall'
            }, 
            folderStructure: { 
                movies: { 
                    pattern: '{title} ({year})', 
                    groupByYear: false, 
                    groupByGenre: false 
                }, 
                tv: { 
                    pattern: '{series}/Season {season:02d}/{series} - S{season:02d}E{episode:02d} - {title}', 
                    groupBySeries: true 
                }, 
                youtube: { 
                    pattern: '{channel}/{title}', 
                    groupByChannel: true 
                } 
            }, 
            filenameNormalization: { 
                maxLength: 180, 
                case: 'title' as 'title' | 'lower' | 'upper', 
                replaceSpaces: false, 
                sanitizeChars: true 
            } 
        } 
    },
    downloaders: {
        ytdlp: {
            path: 'yt-dlp',
            defaultFormat: 'best[height<=1080]',
            defaultQuality: '720p',
            outputTemplate: '%(title)s [%(id)s].%(ext)s'
        },
        rss: {
            enabled: false,
            checkInterval: 3600,
            feeds: [] as string[]
        }
    },
    services: {
        chromadb: {
            url: 'http://localhost:8000'
        }
    }
};
