import { mock } from 'bun:test';

// Stub the chromadb package to prevent import errors
mock.module('chromadb', () => ({
    ChromaClient: class {
        async getOrCreateCollection() {
            return {
                add: async () => { },
                query: async () => ({ metadatas: [[]], ids: [[]] }),
                delete: async () => { },
                count: async () => 0,
                peek: async () => ({ ids: [], metadatas: [], documents: [] })
            };
        }
        async deleteCollection() { }
        async listCollections() { return []; }
        async heartbeat() { return 1; }
    }
}));

// Stub the embeddings module
mock.module('../src/memory/embeddings', () => ({
    embeddingManager: {
        initialize: mock(() => Promise.resolve()),
        findSimilarTasks: mock(() => Promise.resolve([])),
        addTaskEmbedding: mock(() => Promise.resolve()),
        shutdown: mock(() => Promise.resolve()),
        deleteTaskEmbedding: mock(() => Promise.resolve()),
        getCollectionStats: mock(() => Promise.resolve({ count: 0 })),
        clearAllEmbeddings: mock(() => Promise.resolve()),
        generateEmbedding: mock(() => Promise.resolve([0.1, 0.2, 0.3]))
    }
}));

// Stub the logger module
mock.module('../src/utils/logger', () => ({
    logger: {
        info: mock(() => { }),
        error: mock(() => { }),
        warn: mock(() => { }),
        debug: mock(() => { }),
        trace: mock(() => { })
    }
}));

// Stub the WebSocket module to prevent port conflicts
mock.module('ws', () => ({
    WebSocketServer: class {
        on() { }
        close() { }
        clients = new Set()
    }
}));

// Stub Ollama client to prevent network calls
mock.module('ollama', () => ({
    Ollama: class {
        async chat() {
            return {
                message: {
                    content: 'Mock response from Ollama'
                }
            };
        }
        async embeddings() {
            return {
                embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
            };
        }
    }
}));

// Stub MeiliSearch client
mock.module('meilisearch', () => ({
    MeiliSearch: class {
        async getIndex() {
            return {
                search: async () => ({ hits: [], estimatedTotalHits: 0 }),
                addDocuments: async () => ({ taskUid: 1 }),
                deleteDocument: async () => ({ taskUid: 1 }),
                updateSettings: async () => ({ taskUid: 1 }),
                getSettings: async () => ({}),
                getStats: async () => ({ numberOfDocuments: 0 })
            };
        }
        async createIndex() {
            return this.getIndex();
        }
        async getIndexes() {
            return { results: [] };
        }
    }
}));

// Mock the database module to prevent cross-test interference
mock.module('../src/db', () => ({
    initDatabase: mock(() => Promise.resolve()),
    getDatabase: mock(() => ({
        run: mock(() => { }),
        get: mock(() => ({})),
        all: mock(() => []),
        prepare: mock(() => ({
            run: mock(() => { }),
            get: mock(() => ({})),
            all: mock(() => []),
            finalize: mock(() => { })
        })),
        exec: mock(() => { }),
        close: mock(() => { })
    })),
    getDependencyHelper: mock(() => ({
        addDependency: mock(() => { }),
        getDependencies: mock(() => []),
        getDependents: mock(() => []),
        resolveDependencies: mock(() => []),
        areDependenciesMet: mock(() => true),
        removeDependencies: mock(() => { })
    }))
}));

// Mock process spawning to prevent actual subprocess creation
mock.module('bun', () => ({
    spawn: () => {
        // Return a dummy process object
        return {
            stdin: { write: () => { } },
            stdout: (async function* () { /* no output */ })(),
            stderr: (async function* () { /* no output */ })(),
            kill: () => { },
            exited: Promise.resolve(0)
        };
    },
    // Keep other Bun functionality
    file: (global as any).Bun?.file || (() => ({})),
    write: (global as any).Bun?.write || (() => Promise.resolve()),
    $: (global as any).Bun?.$ || (() => Promise.resolve({ text: () => '', exitCode: 0 }))
}));
