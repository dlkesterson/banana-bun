import { describe, it, expect } from 'bun:test';

describe('Debug Import Test', () => {
    it('should be able to import config module', async () => {
        try {
            const configModule = await import('../src/config');
            console.log('✅ Successfully imported config module');
            console.log('Available config exports:', Object.keys(configModule));
            expect(configModule).toBeDefined();
        } catch (error) {
            console.error('❌ Failed to import config module:', error);
            throw error;
        }
    });

    it('should be able to import cross-platform-paths module', async () => {
        try {
            const pathsModule = await import('../src/utils/cross-platform-paths');
            console.log('✅ Successfully imported cross-platform-paths module');
            console.log('Available paths exports:', Object.keys(pathsModule));
            expect(pathsModule).toBeDefined();
        } catch (error) {
            console.error('❌ Failed to import cross-platform-paths module:', error);
            throw error;
        }
    });

    it('should be able to import initDatabase from src/db', async () => {
        try {
            const { initDatabase } = await import('../src/db');
            expect(typeof initDatabase).toBe('function');
            console.log('✅ Successfully imported initDatabase');
        } catch (error) {
            console.error('❌ Failed to import initDatabase:', error);
            console.error('Error details:', error.message);
            console.error('Error stack:', error.stack);
            throw error;
        }
    });

    it('should be able to import the entire db module', async () => {
        try {
            const dbModule = await import('../src/db');
            console.log('✅ Successfully imported db module');
            console.log('Available exports:', Object.keys(dbModule));
            expect(dbModule).toBeDefined();
        } catch (error) {
            console.error('❌ Failed to import db module:', error);
            console.error('Error details:', error.message);
            console.error('Error stack:', error.stack);
            throw error;
        }
    });

    it('should be able to import CLI module', async () => {
        try {
            const cliModule = await import('../src/cli/banana-summarize');
            console.log('✅ Successfully imported CLI module');
            console.log('Available CLI exports:', Object.keys(cliModule));
            expect(cliModule).toBeDefined();
        } catch (error) {
            console.error('❌ Failed to import CLI module:', error);
            console.error('Error details:', error.message);
            console.error('Error stack:', error.stack);
            throw error;
        }
    });
});
