import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    getDefaultBasePath,
    normalizePath,
    resolveEnvironmentVariables,
    validatePath,
    getExecutableExtension
} from '../src/utils/cross-platform-paths';

let originalEnv: NodeJS.ProcessEnv;

describe('Cross Platform Path Utilities', () => {
    beforeEach(() => {
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('getDefaultBasePath uses BASE_PATH env variable', () => {
        process.env.BASE_PATH = '/tmp/custom-base';
        expect(getDefaultBasePath()).toBe('/tmp/custom-base');
    });

    it('normalizePath converts backslashes to slashes', () => {
        const input = 'C:\\Users\\test\\file.txt';
        expect(normalizePath(input)).toBe('C:/Users/test/file.txt');
    });

    it('resolveEnvironmentVariables replaces env vars', () => {
        process.env.FOO = 'bar';
        process.env.USERNAME = 'tester';
        const resolved = resolveEnvironmentVariables('/home/$FOO/%USERNAME%/file');
        expect(resolved).toBe('/home/bar/tester/file');
    });

    it('validatePath detects invalid patterns', () => {
        expect(validatePath('/tmp/file.txt')).toBe(true);
        expect(validatePath('/tmp/../../../../etc/passwd')).toBe(false);
        expect(validatePath('bad\0path')).toBe(false);
    });

    it('getExecutableExtension matches platform', () => {
        if (process.platform === 'win32') {
            expect(getExecutableExtension()).toBe('.exe');
        } else {
            expect(getExecutableExtension()).toBe('');
        }
    });
});
