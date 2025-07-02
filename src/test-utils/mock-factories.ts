/**
 * Type-safe mock factories for test infrastructure
 * Addresses PRD 4: Test Infrastructure Modernization
 */

import { mock } from 'bun:test';
import type { Database } from 'bun:sqlite';

// Generic type-safe mock factory
export function createMock<T>(partial: Partial<T> = {}): T {
    return partial as T;
}

// Database mock with proper interface implementation
export function createDatabaseMock(): Database {
    const mockQuery = mock(() => ({
        all: mock(() => []),
        get: mock(() => undefined),
        values: mock(() => []),
        run: mock(() => ({ changes: 0, lastInsertRowid: 0 }))
    }));

    const mockPrepare = mock(() => ({
        all: mock(() => []),
        get: mock(() => undefined),
        values: mock(() => []),
        run: mock(() => ({ changes: 0, lastInsertRowid: 0 })),
        finalize: mock(() => {}),
        bind: mock(() => ({}))
    }));

    return {
        query: mockQuery,
        prepare: mockPrepare,
        run: mock(() => ({ changes: 0, lastInsertRowid: 0 })),
        exec: mock(() => {}),
        close: mock(() => {}),
        serialize: mock(() => new Uint8Array()),
        deserialize: mock(() => {}),
        loadExtension: mock(() => {}),
        filename: ':memory:',
        inTransaction: false,
        readonly: false,
        transaction: mock(() => ({})),
        [Symbol.dispose]: mock(() => {})
    } as Database;
}

// Logger mock factory
export function createLoggerMock() {
    return {
        info: mock(() => Promise.resolve()),
        error: mock(() => Promise.resolve()),
        warn: mock(() => Promise.resolve()),
        debug: mock(() => Promise.resolve()),
        trace: mock(() => Promise.resolve())
    };
}

// Config mock factory
export function createConfigMock(overrides: any = {}) {
    return {
        paths: {
            incoming: '/tmp/test-incoming',
            processing: '/tmp/test-processing',
            archive: '/tmp/test-archive',
            error: '/tmp/test-error',
            tasks: '/tmp/test-tasks',
            outputs: '/tmp/test-outputs',
            logs: '/tmp/test-logs',
            dashboard: '/tmp/test-dashboard',
            database: ':memory:',
            media: '/tmp/test-media',
            chroma: {
                host: 'localhost',
                port: 8000,
                ssl: false
            },
            ...overrides.paths
        },
        openai: {
            apiKey: 'test-api-key',
            model: 'gpt-4',
            ...overrides.openai
        },
        ollama: {
            url: 'http://localhost:11434',
            model: 'qwen3:8b',
            fastModel: 'qwen3:8b',
            ...overrides.ollama
        },
        chromadb: {
            url: 'http://localhost:8000',
            tenant: 'default_tenant',
            ...overrides.chromadb
        },
        meilisearch: {
            url: 'http://localhost:7700',
            masterKey: 'test-master-key',
            indexName: 'test-media-index',
            ...overrides.meilisearch
        },
        whisper: {
            model: 'turbo',
            device: 'cpu',
            language: 'auto',
            chunkDuration: 30,
            ...overrides.whisper
        },
        vision: {
            model: 'openai/clip-vit-base-patch32',
            frameExtraction: {
                interval: 10,
                maxFrames: 50,
                sceneDetection: false
            },
            ...overrides.vision
        },
        s3: {
            accessKeyId: 'test-access-key',
            secretAccessKey: 'test-secret-key',
            region: 'us-east-1',
            endpoint: undefined,
            defaultBucket: 'test-bucket',
            defaultDownloadPath: '/tmp/test-s3-downloads',
            syncLogPath: '/tmp/test-s3-sync-logs',
            ...overrides.s3
        },
        media: {
            collectionTv: '/tmp/test-media/TV',
            collectionMovies: '/tmp/test-media/Movies',
            collectionYouTube: '/tmp/test-media/YouTube',
            collectionCatchAll: '/tmp/test-media/Downloads',
            tools: {
                ffprobe: 'ffprobe',
                mediainfo: 'mediainfo',
                preferred: 'ffprobe' as 'ffprobe' | 'mediainfo' | 'auto'
            },
            extensions: {
                video: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'],
                audio: ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.wma', '.opus']
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
            },
            ...overrides.media
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
                feeds: []
            },
            ...overrides.downloaders
        },
        ...overrides
    };
}

// MCP Server mock factory
export function createMCPServerMock() {
    return {
        setRequestHandler: mock(() => {}),
        connect: mock(() => Promise.resolve()),
        close: mock(() => Promise.resolve()),
        notification: mock(() => {}),
        request: mock(() => Promise.resolve({}))
    };
}

// MCP Client mock factory
export function createMCPClientMock() {
    return {
        connect: mock(() => Promise.resolve()),
        disconnect: mock(() => Promise.resolve()),
        isConnected: mock(() => true),
        callTool: mock(() => Promise.resolve({ content: [{ type: 'text', text: '{}' }] })),
        listTools: mock(() => Promise.resolve({ tools: [] })),
        sendRequest: mock(() => Promise.resolve({})),
        smartSearch: mock(() => Promise.resolve({ hits: [], totalHits: 0 })),
        indexDocument: mock(() => Promise.resolve()),
        transcribeAudio: mock(() => Promise.resolve({ text: 'test transcription' })),
        analyzeContent: mock(() => Promise.resolve({ insights: [] })),
        sendCustomRequest: mock(() => Promise.resolve({}))
    };
}

// WebSocket mock factory
export function createWebSocketMock() {
    return {
        send: mock(() => {}),
        close: mock(() => {}),
        addEventListener: mock(() => {}),
        removeEventListener: mock(() => {}),
        readyState: 1, // OPEN
        CONNECTING: 0,
        OPEN: 1,
        CLOSING: 2,
        CLOSED: 3,
        url: 'ws://localhost:8080',
        protocol: '',
        extensions: '',
        bufferedAmount: 0,
        binaryType: 'blob' as BinaryType,
        onopen: null,
        onclose: null,
        onmessage: null,
        onerror: null,
        dispatchEvent: mock(() => true)
    };
}

// WebSocket Server mock factory
export function createWebSocketServerMock() {
    return {
        on: mock(() => {}),
        close: mock(() => {}),
        clients: new Set(),
        address: mock(() => ({ address: '127.0.0.1', family: 'IPv4', port: 8080 })),
        handleUpgrade: mock(() => {}),
        shouldHandle: mock(() => true)
    };
}

// Fetch mock factory
export function createFetchMock(defaultResponse: any = { ok: true, json: () => Promise.resolve({}) }) {
    const fetchMock = mock(() => Promise.resolve(defaultResponse));
    
    // Add preconnect property to satisfy fetch interface
    (fetchMock as any).preconnect = mock(() => {});
    
    return fetchMock;
}

// File system mock factory
export function createFileSystemMock() {
    return {
        readFile: mock(() => Promise.resolve('test content')),
        writeFile: mock(() => Promise.resolve()),
        mkdir: mock(() => Promise.resolve()),
        rmdir: mock(() => Promise.resolve()),
        unlink: mock(() => Promise.resolve()),
        stat: mock(() => Promise.resolve({ 
            isFile: () => true, 
            isDirectory: () => false,
            size: 1024,
            mtime: new Date()
        })),
        access: mock(() => Promise.resolve()),
        readdir: mock(() => Promise.resolve([]))
    };
}

// Process mock factory for spawn operations
export function createProcessMock() {
    let responseQueue: string[] = [];
    let isIterating = false;
    let pendingRequests: Map<number, any> = new Map();

    const mockStdin = {
        write: mock((data: string) => {
            // Parse the request to auto-respond
            try {
                const request = JSON.parse(data.trim());

                // Auto-respond to initialize request immediately
                if (request.method === 'initialize') {
                    const initResponse = JSON.stringify({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: {
                            protocolVersion: '2024-11-05',
                            capabilities: {
                                tools: {}
                            },
                            serverInfo: {
                                name: 'test-server',
                                version: '1.0.0'
                            }
                        }
                    });
                    // Add response immediately to the front of the queue
                    responseQueue.unshift(initResponse);
                } else {
                    // Store other requests for manual response
                    pendingRequests.set(request.id, request);
                }
            } catch (e) {
                // Ignore parsing errors
            }
            return true;
        }),
        end: mock(() => {})
    };

    const mockStdout = {
        on: mock(() => {}),
        pipe: mock(() => {}),
        [Symbol.asyncIterator]: async function* () {
            isIterating = true;

            // Keep yielding responses as they come
            while (isIterating) {
                if (responseQueue.length > 0) {
                    const response = responseQueue.shift();
                    if (response) {
                        yield Buffer.from(response + '\n');
                        // Small delay after yielding
                        await new Promise(resolve => setTimeout(resolve, 5));
                    }
                } else {
                    // Wait a bit before checking again
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
        },
        // Helper method to add responses to the queue
        addResponse: (response: string) => {
            responseQueue.push(response);
        },
        // Helper method to respond to pending requests
        respondToRequest: (id: number, result: any) => {
            if (pendingRequests.has(id)) {
                const response = JSON.stringify({
                    jsonrpc: '2.0',
                    id,
                    result
                });
                responseQueue.push(response);
                pendingRequests.delete(id);
            }
        },
        // Helper method to stop the iterator
        stopIterator: () => {
            isIterating = false;
        }
    };

    const mockStderr = {
        on: mock(() => {}),
        pipe: mock(() => {}),
        [Symbol.asyncIterator]: async function* () {
            // Empty stderr stream that doesn't block
            return;
        }
    };

    return {
        stdin: mockStdin,
        stdout: mockStdout,
        stderr: mockStderr,
        on: mock(() => {}),
        kill: mock(() => {
            isIterating = false;
            return true;
        }),
        pid: 12345,
        exitCode: null,
        signalCode: null,
        spawnargs: [],
        spawnfile: 'test'
    };
}

// Service mock templates
export function createMeilisearchServiceMock() {
    return {
        indexDocument: mock(() => Promise.resolve()),
        indexDocuments: mock(() => Promise.resolve()),
        search: mock(() => Promise.resolve({ hits: [], totalHits: 0 })),
        deleteDocument: mock(() => Promise.resolve()),
        getIndex: mock(() => Promise.resolve({})),
        createIndex: mock(() => Promise.resolve()),
        updateSettings: mock(() => Promise.resolve()),
        getSettings: mock(() => Promise.resolve({})),
        getStats: mock(() => Promise.resolve({}))
    };
}

export function createChromaDBServiceMock() {
    return {
        createCollection: mock(() => Promise.resolve()),
        getCollection: mock(() => Promise.resolve({
            add: mock(() => Promise.resolve()),
            query: mock(() => Promise.resolve({ documents: [], metadatas: [], distances: [] })),
            get: mock(() => Promise.resolve({ documents: [], metadatas: [] })),
            delete: mock(() => Promise.resolve()),
            count: mock(() => Promise.resolve(0))
        })),
        deleteCollection: mock(() => Promise.resolve()),
        listCollections: mock(() => Promise.resolve([])),
        addEmbeddings: mock(() => Promise.resolve()),
        queryEmbeddings: mock(() => Promise.resolve({ documents: [], metadatas: [], distances: [] }))
    };
}

export function createWhisperServiceMock() {
    return {
        transcribe: mock(() => Promise.resolve({ text: 'test transcription', segments: [] })),
        detectLanguage: mock(() => Promise.resolve('en')),
        translateToEnglish: mock(() => Promise.resolve({ text: 'translated text' })),
        getModels: mock(() => Promise.resolve(['base', 'small', 'medium', 'large']))
    };
}

// Reset all mocks utility
export function resetAllMocks() {
    // This would reset all mocks created by the factories
    // Implementation depends on the specific mocking framework
}
