// Test setup file for Bun test runner
// This file is loaded before running tests

import { mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set up global test environment
process.env.NODE_ENV = 'test';

// Create a temporary directory for test data
const testBaseDir = join(tmpdir(), 'banana-bun-test-' + Date.now());
mkdirSync(testBaseDir, { recursive: true });

// Create all necessary subdirectories
const subdirs = ['incoming', 'processing', 'archive', 'error', 'tasks', 'outputs', 'logs', 'dashboard', 'media'];
for (const subdir of subdirs) {
    mkdirSync(join(testBaseDir, subdir), { recursive: true });
}

// Also create the standard test directories that some tests expect
const standardTestDirs = [
    '/tmp/test-logs',
    '/tmp/test-tasks',
    '/tmp/test-outputs',
    '/tmp/test-incoming',
    '/tmp/test-processing',
    '/tmp/test-archive',
    '/tmp/test-error',
    '/tmp/test-dashboard',
    '/tmp/test-media'
];
for (const dir of standardTestDirs) {
    try {
        mkdirSync(dir, { recursive: true });
    } catch (error) {
        // Ignore errors if directories already exist
    }
}

// Set up test paths - consistent across all tests
process.env.BASE_PATH = testBaseDir;
process.env.TEST_DATABASE_PATH = ':memory:';

console.log('Global test BASE_PATH set to:', testBaseDir);

// Mock environment variables for testing
process.env.OLLAMA_URL = 'http://localhost:11434';
process.env.OLLAMA_MODEL = 'test-model';
process.env.OLLAMA_FAST_MODEL = 'test-fast-model';
process.env.CHROMA_URL = 'http://localhost:8000';
process.env.CHROMA_TENANT = 'test-tenant';
process.env.MEILISEARCH_URL = 'http://localhost:7700';
process.env.MEILISEARCH_MASTER_KEY = 'test-key';
process.env.MEILISEARCH_INDEX_NAME = 'test_media_index';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.WHISPER_MODEL = 'test-whisper';
process.env.WHISPER_DEVICE = 'cpu';
process.env.WHISPER_LANGUAGE = 'auto';

// Mock console methods to reduce noise during testing
const originalConsole = { ...console };

// Restore console after tests if needed
globalThis.restoreConsole = () => {
  Object.assign(console, originalConsole);
};

console.log('Test setup completed');
