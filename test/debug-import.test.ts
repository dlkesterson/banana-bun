import { describe, it, expect } from 'bun:test';

describe('Debug Import Test', () => {
    it('should be able to import initDatabase from src/db', async () => {
        try {
            const { initDatabase } = await import('../src/db');
            expect(typeof initDatabase).toBe('function');
            console.log('✅ Successfully imported initDatabase');
        } catch (error) {
            console.error('❌ Failed to import initDatabase:', error);
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
            throw error;
        }
    });
});
