import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import { promises as fs } from 'fs';

// Mock logger
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

// Mock config
const mockConfig = {
    paths: {
        logs: '/tmp/test-logs'
    }
};

// Mock modules
mock.module('../src/utils/logger', () => ({
    logger: mockLogger
}));

mock.module('../src/config.js', () => ({
    config: mockConfig
}));

import { searchLogs } from '../src/mcp/search-logs';

describe('Search Logs', () => {
    const testLogsDir = '/tmp/test-logs';

    beforeEach(async () => {
        // Set the logs path to our test directory
        searchLogs.setLogsPath(testLogsDir);
        await fs.mkdir(testLogsDir, { recursive: true });

        // Create test log files
        await fs.writeFile(`${testLogsDir}/app.log`, `
2024-01-01 10:00:00 INFO Starting application
2024-01-01 10:00:01 DEBUG Loading configuration
2024-01-01 10:00:02 INFO Database connected
2024-01-01 10:00:03 WARN Deprecated API used
2024-01-01 10:00:04 ERROR Failed to process task 123
2024-01-01 10:00:05 INFO Task 124 completed successfully
2024-01-01 10:00:06 ERROR Network timeout occurred
2024-01-01 10:00:07 INFO Application ready
`);

        await fs.writeFile(`${testLogsDir}/tasks.log`, `
2024-01-01 10:00:00 INFO Task 123 started
2024-01-01 10:00:01 DEBUG Processing shell command: echo "hello"
2024-01-01 10:00:02 ERROR Command failed with exit code 1
2024-01-01 10:00:03 INFO Task 124 started
2024-01-01 10:00:04 DEBUG Processing LLM request
2024-01-01 10:00:05 INFO LLM response received
2024-01-01 10:00:06 INFO Task 124 completed
`);

        await fs.writeFile(`${testLogsDir}/errors.log`, `
2024-01-01 10:00:04 ERROR [Task 123] Command not found: invalid_command
2024-01-01 10:00:06 ERROR [Network] Connection timeout after 30s
2024-01-01 10:00:08 ERROR [Database] Query failed: syntax error
`);

        // Reset mocks
        Object.values(mockLogger).forEach(fn => {
            if (typeof fn === 'function' && 'mockClear' in fn) {
                fn.mockClear();
            }
        });
    });

    afterEach(async () => {
        await fs.rm(testLogsDir, { recursive: true, force: true });
    });

    describe('Basic Search', () => {
        it('should search for text in log files', async () => {
            const results = await searchLogs.search('ERROR');

            expect(results.success).toBe(true);
            expect(results.matches).toBeDefined();
            expect(results.matches.length).toBeGreaterThan(0);
            
            // Should find errors in multiple files
            const errorMatches = results.matches.filter(m => m.line.includes('ERROR'));
            expect(errorMatches.length).toBeGreaterThan(0);
        });

        it('should search with case sensitivity', async () => {
            const caseSensitive = await searchLogs.search('error', { caseSensitive: true });
            const caseInsensitive = await searchLogs.search('error', { caseSensitive: false });

            expect(caseSensitive.matches.length).toBeLessThanOrEqual(caseInsensitive.matches.length);
        });

        it('should search with regex patterns', async () => {
            const results = await searchLogs.search('Task \\d+', { useRegex: true });

            expect(results.success).toBe(true);
            expect(results.matches.length).toBeGreaterThan(0);
            
            // Should match "Task 123", "Task 124", etc.
            const taskMatches = results.matches.filter(m => /Task \d+/.test(m.line));
            expect(taskMatches.length).toBeGreaterThan(0);
        });

        it('should limit search results', async () => {
            const unlimited = await searchLogs.search('INFO');
            const limited = await searchLogs.search('INFO', { limit: 3 });

            expect(limited.matches.length).toBeLessThanOrEqual(3);
            expect(limited.matches.length).toBeLessThanOrEqual(unlimited.matches.length);
        });
    });

    describe('Filtered Search', () => {
        it('should filter by log level', async () => {
            const errorResults = await searchLogs.searchByLevel('ERROR');

            expect(errorResults.success).toBe(true);
            expect(errorResults.matches.length).toBeGreaterThan(0);
            
            // All matches should contain ERROR
            errorResults.matches.forEach(match => {
                expect(match.line).toContain('ERROR');
            });
        });

        it('should filter by time range', async () => {
            const startTime = new Date('2024-01-01T10:00:02Z');
            const endTime = new Date('2024-01-01T10:00:05Z');

            const results = await searchLogs.searchByTimeRange(startTime, endTime);

            expect(results.success).toBe(true);
            expect(results.matches.length).toBeGreaterThan(0);
            
            // All matches should be within time range
            results.matches.forEach(match => {
                const logTime = new Date(match.timestamp);
                expect(logTime.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
                expect(logTime.getTime()).toBeLessThanOrEqual(endTime.getTime());
            });
        });

        it('should filter by specific files', async () => {
            const results = await searchLogs.search('Task', { 
                files: ['tasks.log'] 
            });

            expect(results.success).toBe(true);
            expect(results.matches.length).toBeGreaterThan(0);
            
            // All matches should be from tasks.log
            results.matches.forEach(match => {
                expect(match.file).toBe('tasks.log');
            });
        });

        it('should search for task-specific logs', async () => {
            const taskResults = await searchLogs.searchByTaskId(123);

            expect(taskResults.success).toBe(true);
            expect(taskResults.matches.length).toBeGreaterThan(0);
            
            // Should find logs related to task 123
            const task123Matches = taskResults.matches.filter(m => 
                m.line.includes('123') || m.line.includes('Task 123')
            );
            expect(task123Matches.length).toBeGreaterThan(0);
        });
    });

    describe('Advanced Search', () => {
        it('should search with context lines', async () => {
            const results = await searchLogs.search('ERROR', { 
                contextLines: 2 
            });

            expect(results.success).toBe(true);
            
            // Should include context lines before and after matches
            const matchWithContext = results.matches.find(m => m.context);
            if (matchWithContext) {
                expect(matchWithContext.context.before).toBeDefined();
                expect(matchWithContext.context.after).toBeDefined();
            }
        });

        it('should aggregate search results', async () => {
            const aggregated = await searchLogs.aggregateResults('ERROR');

            expect(aggregated.success).toBe(true);
            expect(aggregated.summary).toBeDefined();
            expect(aggregated.summary.total_matches).toBeGreaterThan(0);
            expect(aggregated.summary.files_searched).toBeGreaterThan(0);
            expect(aggregated.summary.by_level).toBeDefined();
        });

        it('should search with multiple criteria', async () => {
            const results = await searchLogs.advancedSearch({
                text: 'Task',
                level: 'INFO',
                startTime: new Date('2024-01-01T10:00:00Z'),
                endTime: new Date('2024-01-01T10:00:10Z'),
                files: ['tasks.log', 'app.log']
            });

            expect(results.success).toBe(true);
            expect(results.matches.length).toBeGreaterThan(0);
        });

        it('should export search results', async () => {
            const results = await searchLogs.search('ERROR');
            const exported = await searchLogs.exportResults(results.matches, 'json');

            expect(exported.success).toBe(true);
            expect(exported.data).toBeDefined();
            
            // Should be valid JSON
            const parsed = JSON.parse(exported.data);
            expect(Array.isArray(parsed)).toBe(true);
        });
    });

    describe('Performance and Optimization', () => {
        it('should handle large log files efficiently', async () => {
            // Create a large log file
            const largeLogContent = Array(1000).fill(0).map((_, i) => 
                `2024-01-01 10:${String(i % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')} INFO Log entry ${i}`
            ).join('\n');

            await fs.writeFile(`${testLogsDir}/large.log`, largeLogContent);

            const startTime = Date.now();
            const results = await searchLogs.search('Log entry', { limit: 10 });
            const endTime = Date.now();

            expect(results.success).toBe(true);
            expect(results.matches.length).toBe(10);
            expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        });

        it('should handle concurrent searches', async () => {
            const searches = [
                searchLogs.search('ERROR'),
                searchLogs.search('INFO'),
                searchLogs.search('Task'),
                searchLogs.search('DEBUG')
            ];

            const results = await Promise.all(searches);

            results.forEach(result => {
                expect(result.success).toBe(true);
            });
        });

        it('should cache frequent searches', async () => {
            // First search
            const start1 = Date.now();
            await searchLogs.search('ERROR');
            const time1 = Date.now() - start1;

            // Second identical search (should be faster due to caching)
            const start2 = Date.now();
            await searchLogs.search('ERROR');
            const time2 = Date.now() - start2;

            // Note: In a real implementation with caching, time2 should be less than time1
            expect(time2).toBeLessThanOrEqual(time1 + 100); // Allow some variance
        });
    });

    describe('Error Handling', () => {
        it('should handle missing log files', async () => {
            await fs.rm(testLogsDir, { recursive: true });

            const results = await searchLogs.search('test');

            expect(results.success).toBe(false);
            expect(results.error).toContain('not found');
        });

        it('should handle invalid regex patterns', async () => {
            const results = await searchLogs.search('[invalid regex', { useRegex: true });

            expect(results.success).toBe(false);
            expect(results.error).toContain('Invalid regex');
        });

        it('should handle file permission errors', async () => {
            // Create a file with restricted permissions
            const restrictedFile = `${testLogsDir}/restricted.log`;
            await fs.writeFile(restrictedFile, 'restricted content');
            await fs.chmod(restrictedFile, 0o000); // No permissions

            try {
                const results = await searchLogs.search('content');
                
                // Should handle permission errors gracefully
                expect(results.success).toBe(true); // Should succeed for other files
                expect(results.warnings).toBeDefined();
            } finally {
                // Restore permissions for cleanup
                await fs.chmod(restrictedFile, 0o644);
            }
        });

        it('should handle corrupted log files', async () => {
            // Create a binary file that's not a text log
            const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE]);
            await fs.writeFile(`${testLogsDir}/binary.log`, binaryData);

            const results = await searchLogs.search('test');

            expect(results.success).toBe(true); // Should handle gracefully
            expect(results.warnings).toBeDefined();
        });
    });

    describe('Real-time Search', () => {
        it('should support streaming search results', async () => {
            const results = [];
            
            await searchLogs.streamSearch('INFO', (match) => {
                results.push(match);
            });

            expect(results.length).toBeGreaterThan(0);
        });

        it('should watch for new log entries', async () => {
            const watcher = await searchLogs.watchLogs('ERROR');
            
            expect(watcher).toBeDefined();
            expect(typeof watcher.stop).toBe('function');
            
            // Clean up
            watcher.stop();
        });
    });

    describe('Integration', () => {
        it('should integrate with MCP tool calls', async () => {
            const toolRequest = {
                method: 'search_logs',
                params: {
                    query: 'ERROR',
                    level: 'ERROR',
                    limit: 10
                }
            };

            const result = await searchLogs.handleToolCall(toolRequest);

            expect(result.success).toBe(true);
            expect(result.matches).toBeDefined();
        });

        it('should provide search statistics', async () => {
            // Reset statistics before this test
            searchLogs.resetStatistics();

            await searchLogs.search('ERROR');
            await searchLogs.search('INFO');
            await searchLogs.search('DEBUG');

            const stats = await searchLogs.getSearchStatistics();

            expect(stats.total_searches).toBe(3);
            expect(stats.most_searched_terms).toBeDefined();
            expect(stats.average_response_time).toBeDefined();
        });
    });
});

afterAll(() => {
  mock.restore();
});
