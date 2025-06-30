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
            database: ':memory:',
            tasks: '/tmp/test-tasks',
            logs: '/tmp/test-logs',
            media: '/tmp/test-media',
            ...overrides.paths
        },
        openai: {
            apiKey: 'test-api-key',
            model: 'gpt-4',
            ...overrides.openai
        },
        meilisearch: {
            host: 'http://localhost:7700',
            apiKey: 'test-key',
            ...overrides.meilisearch
        },
        chromadb: {
            host: 'http://localhost:8000',
            ...overrides.chromadb
        },
        whisper: {
            model: 'base',
            ...overrides.whisper
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
    return {
        stdin: {
            write: mock(() => true),
            end: mock(() => {})
        },
        stdout: {
            on: mock(() => {}),
            pipe: mock(() => {})
        },
        stderr: {
            on: mock(() => {}),
            pipe: mock(() => {})
        },
        on: mock(() => {}),
        kill: mock(() => true),
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
