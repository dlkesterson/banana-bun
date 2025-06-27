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
            expect(config.paths.incoming).toBe(`${BASE_PATH}/incoming`);
            expect(config.paths.processing).toBe(`${BASE_PATH}/processing`);
            expect(config.paths.archive).toBe(`${BASE_PATH}/archive`);
            expect(config.paths.database).toBe(`${BASE_PATH}/tasks.sqlite`);
        });
    });

    describe('OpenAI Configuration', () => {
        it('should have openai configuration', () => {
            expect(config.openai).toBeDefined();
            expect(config.openai.model).toBe('gpt-4');
        });

        it('should use environment variable for API key', () => {
            process.env.OPENAI_API_KEY = 'test-api-key';
            
            // Re-import to get updated config
            delete require.cache[require.resolve('../src/config')];
            const { config: updatedConfig } = require('../src/config');
            
            expect(updatedConfig.openai.apiKey).toBe('test-api-key');
        });

        it('should default to empty string when no API key is set', () => {
            delete process.env.OPENAI_API_KEY;
            
            // Re-import to get updated config
            delete require.cache[require.resolve('../src/config')];
            const { config: updatedConfig } = require('../src/config');
            
            expect(updatedConfig.openai.apiKey).toBe('');
        });
    });

    describe('Ollama Configuration', () => {
        it('should have ollama configuration with defaults', () => {
            expect(config.ollama).toBeDefined();
            expect(config.ollama.url).toBe('http://localhost:11434');
            expect(config.ollama.model).toBe('qwen3:8b');
            expect(config.ollama.fastModel).toBe("qwen3:8b");
        });

        it('should use environment variables when provided', () => {
            process.env.OLLAMA_URL = 'http://custom-host:8080';
            process.env.OLLAMA_MODEL = 'custom-model';
            process.env.OLLAMA_FAST_MODEL = 'custom-fast-model';
            
            // Re-import to get updated config
            delete require.cache[require.resolve('../src/config')];
            const { config: updatedConfig } = require('../src/config');
            
            expect(updatedConfig.ollama.url).toBe('http://custom-host:8080');
            expect(updatedConfig.ollama.model).toBe('custom-model');
            expect(updatedConfig.ollama.fastModel).toBe('custom-fast-model');
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
