// Test setup file for Bun test runner
// This file is loaded before running tests

import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Set up global test environment
process.env.NODE_ENV = 'test';

// Create a unique temporary directory for this test run
const testBasePath = mkdtempSync(join(tmpdir(), 'banana-bun-test-'));
process.env.BASE_PATH = testBasePath;

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

console.log(`Test setup completed with BASE_PATH: ${testBasePath}`);
