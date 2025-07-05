// Test setup file for Bun test runner
// This file is loaded before running tests

import { mock } from 'bun:test';

// Set up global test environment
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise during testing
const originalConsole = { ...console };

// Restore console after tests if needed
globalThis.restoreConsole = () => {
    Object.assign(console, originalConsole);
};

// Set up test database path
process.env.TEST_DATABASE_PATH = ':memory:';

// Mock environment variables for testing
process.env.OLLAMA_URL = 'http://localhost:11434';
process.env.OLLAMA_MODEL = 'test-model';
process.env.CHROMA_URL = 'http://localhost:8000';

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

// Stub the WebSocket module to prevent port conflicts
mock.module('ws', () => ({
    WebSocketServer: class {
        on() { }
        close() { }
        clients = new Set()
    }
}));

// Note: Database mocks are handled individually by test files to prevent conflicts

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

console.log('Test setup completed');
