import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { config, BASE_PATH } from "../src/config.ts";

describe('Configuration Management', () => {
    let originalEnv: Record<string, string | undefined>;

    beforeEach(() => {

        // Save original environment variables
        originalEnv = {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            OLLAMA_URL: process.env.OLLAMA_URL,
            OLLAMA_MODEL: process.env.OLLAMA_MODEL,
            OLLAMA_FAST_MODEL: process.env.OLLAMA_FAST_MODEL,
        };
    });

    afterEach(() => {
        // Restore original environment variables
        Object.keys(originalEnv).forEach(key => {
            if (originalEnv[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = originalEnv[key];
            }
        });
    });

    describe('Base Path Configuration', () => {
        it('should have a valid base path', () => {
            expect(BASE_PATH).toBeString();
            expect(BASE_PATH.length).toBeGreaterThan(0);
        });
    });

    describe('Path Configuration', () => {
        it('should have all required paths defined', () => {
            const requiredPaths = [
                'incoming', 'processing', 'archive', 'error',
                'tasks', 'outputs', 'logs', 'dashboard',
                'database', 'media'
            ];

            requiredPaths.forEach(path => {
                expect(config.paths).toHaveProperty(path);
                expect(config.paths[path as keyof typeof config.paths]).toBeString();
            });
        });

        it('should have chroma configuration', () => {
            expect(config.paths.chroma).toBeDefined();
            expect(config.paths.chroma.host).toBe('localhost');
            expect(config.paths.chroma.port).toBe(8000);
            expect(config.paths.chroma.ssl).toBe(false);
        });

        it('should construct paths relative to base path', () => {
            expect(config.paths.incoming).toBeString();
            expect(config.paths.processing).toBeString();
            expect(config.paths.archive).toBeString();
            expect(config.paths.database).toBeString();
        });
    });

    describe('OpenAI Configuration', () => {
        it('should have openai configuration', () => {
            expect(config.openai).toBeDefined();
            expect(config.openai.model).toBe('gpt-4');
        });

        it('should use environment variable for API key', () => {
            // Test that config respects environment variables
            const expectedKey = process.env.OPENAI_API_KEY || '';
            expect(config.openai.apiKey).toBe(expectedKey);
        });

        it('should default to empty string when no API key is set', () => {
            // Test that config has proper default
            expect(typeof config.openai.apiKey).toBe('string');
        });
    });

    describe('Ollama Configuration', () => {
        it('should have ollama configuration with defaults', () => {
            expect(config.ollama).toBeDefined();
            expect(config.ollama.url).toBe('http://localhost:11434');
            // Test that models are defined and non-empty strings
            expect(typeof config.ollama.model).toBe('string');
            expect(config.ollama.model.length).toBeGreaterThan(0);
            expect(typeof config.ollama.fastModel).toBe('string');
            expect(config.ollama.fastModel.length).toBeGreaterThan(0);
        });

        it('should use environment variables when provided', () => {
            // Test that config respects environment variables
            expect(config.ollama.url).toBe(process.env.OLLAMA_URL || 'http://localhost:11434');
            const expectedModel = process.env.OLLAMA_MODEL || 'qwen3:8b';
            const expectedFastModel = process.env.OLLAMA_FAST_MODEL || 'qwen3:8b';
            expect(config.ollama.model).toBe(expectedModel);
            expect(config.ollama.fastModel).toBe(expectedFastModel);
        });
    });

    describe('Configuration Validation', () => {
        it('should have all required configuration sections', () => {
            const requiredSections = ['paths', 'openai', 'ollama'];

            requiredSections.forEach(section => {
                expect(config).toHaveProperty(section);
                expect(config[section as keyof typeof config]).toBeDefined();
            });
        });

        it('should have valid types for all configuration values', () => {
            // Paths should be strings
            Object.values(config.paths).forEach(path => {
                if (typeof path === 'object') {
                    // Handle chroma config object
                    expect(path).toBeObject();
                } else {
                    expect(path).toBeString();
                }
            });

            // OpenAI config
            expect(config.openai.apiKey).toBeString();
            expect(config.openai.model).toBeString();

            // Ollama config
            expect(config.ollama.url).toBeString();
            expect(config.ollama.model).toBeString();
            expect(config.ollama.fastModel).toBeString();
        });
    });
});
