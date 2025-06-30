import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
    createProcessMock,
    CommonTestSetup,
    MCPResponseTestFactory
} from '../src/test-utils';

// Mock process spawning for Bun
const mockProcess = createProcessMock();
const mockSpawn = mock(() => mockProcess);

// Mock Bun's spawn function
mock.module('bun', () => ({
    spawn: mockSpawn
}));

// Setup common mocks
const { mockLogger } = CommonTestSetup.setupMockModules();

import { MCPClient } from '../src/mcp/mcp-client';

describe('MCP Client', () => {
    let mcpClient: MCPClient;

    beforeEach(() => {
        mcpClient = new MCPClient();

        // Reset mocks
        mockSpawn.mockClear();
        mockProcess.stdin.write.mockClear();
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.debug.mockClear();
    });

    afterEach(() => {
        // Cleanup any spawned processes
        if (mockProcess.kill) {
            mockProcess.kill.mockClear();
        }
    });

    describe('Server Management', () => {
        it('should start MCP server process', async () => {
            // Mock successful process spawn
            mockSpawn.mockReturnValue(mockProcess);

            // Mock stdout data for initialization
            mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
                if (event === 'data') {
                    setTimeout(() => {
                        callback(Buffer.from(JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'initialized'
                        }) + '\n'));
                    }, 10);
                }
            });

            await mcpClient.startServer('test-server', 'bun', ['test-script.ts']);

            expect(mockSpawn).toHaveBeenCalledWith({
                cmd: ['bun', 'test-script.ts'],
                stdio: ['pipe', 'pipe', 'pipe']
            });
        });

        it('should handle server startup failure', async () => {
            // Mock process spawn failure
            mockSpawn.mockImplementation(() => {
                throw new Error('Failed to spawn process');
            });

            await expect(
                mcpClient.startServer('test-server', 'bun', ['test-script.ts'])
            ).rejects.toThrow('Failed to spawn process');
        });

        it('should stop MCP server process', async () => {
            // Start server first
            mockSpawn.mockReturnValue(mockProcess);
            await mcpClient.startServer('test-server', 'bun', ['test-script.ts']);

            // Stop server
            await mcpClient.stopServer('test-server');

            expect(mockProcess.kill).toHaveBeenCalled();
        });
    });

    describe('Tool Operations', () => {
        beforeEach(async () => {
            // Setup server
            mockSpawn.mockReturnValue(mockProcess);
            mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
                if (event === 'data') {
                    // Mock initialization response
                    setTimeout(() => {
                        callback(Buffer.from(JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'initialized'
                        }) + '\n'));
                    }, 10);
                }
            });

            await mcpClient.startServer('test-server', 'bun', ['test-script.ts']);
        });

        it('should send tool request successfully', async () => {
            const mockResponse = MCPResponseTestFactory.createToolResponse({
                success: true,
                data: 'test result'
            });

            // Mock response from server
            mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
                if (event === 'data') {
                    setTimeout(() => {
                        callback(Buffer.from(JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            result: mockResponse
                        }) + '\n'));
                    }, 10);
                }
            });

            const result = await mcpClient.sendRequest('test-server', 'tools/call', {
                name: 'test_tool',
                arguments: { param: 'value' }
            });

            expect(mockProcess.stdin.write).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it('should handle tool request timeout', async () => {
            // Don't mock any response to simulate timeout
            mockProcess.stdout.on.mockImplementation(() => {});

            await expect(
                mcpClient.sendRequest('test-server', 'tools/call', {
                    name: 'slow_tool',
                    arguments: {}
                })
            ).rejects.toThrow('timeout');
        });

        it('should handle server error response', async () => {
            const mockErrorResponse = MCPResponseTestFactory.createErrorResponse('Tool not found');

            mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
                if (event === 'data') {
                    setTimeout(() => {
                        callback(Buffer.from(JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            error: mockErrorResponse.error
                        }) + '\n'));
                    }, 10);
                }
            });

            await expect(
                mcpClient.sendRequest('test-server', 'tools/call', {
                    name: 'nonexistent_tool',
                    arguments: {}
                })
            ).rejects.toThrow('Tool not found');
        });
    });

    describe('High-level API Methods', () => {
        beforeEach(async () => {
            mockSpawn.mockReturnValue(mockProcess);
            await mcpClient.startServer('meilisearch', 'bun', ['meilisearch-server.ts']);
        });

        it('should perform smart search', async () => {
            const mockSearchResult = {
                hits: [{ id: 1, title: 'Test Result' }],
                totalHits: 1,
                processingTimeMs: 50
            };

            mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
                if (event === 'data') {
                    setTimeout(() => {
                        callback(Buffer.from(JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            result: MCPResponseTestFactory.createToolResponse(mockSearchResult)
                        }) + '\n'));
                    }, 10);
                }
            });

            const result = await mcpClient.smartSearch('test query', {
                limit: 10,
                filters: 'type:video'
            });

            expect(result.hits).toHaveLength(1);
            expect(result.totalHits).toBe(1);
        });

        it('should handle search errors gracefully', async () => {
            mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
                if (event === 'data') {
                    setTimeout(() => {
                        callback(Buffer.from(JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            error: { code: -1, message: 'Search failed' }
                        }) + '\n'));
                    }, 10);
                }
            });

            await expect(
                mcpClient.smartSearch('invalid query')
            ).rejects.toThrow('Search failed');
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed JSON responses', async () => {
            mockSpawn.mockReturnValue(mockProcess);
            await mcpClient.startServer('test-server', 'bun', ['test-script.ts']);

            mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
                if (event === 'data') {
                    setTimeout(() => {
                        callback(Buffer.from('invalid json\n'));
                    }, 10);
                }
            });

            // Should handle malformed JSON gracefully
            await mcpClient.sendRequest('test-server', 'test', {}).catch(() => {
                // Expected to fail
            });

            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle process stderr output', async () => {
            mockSpawn.mockReturnValue(mockProcess);

            mockProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
                if (event === 'data') {
                    setTimeout(() => {
                        callback(Buffer.from('Error: Something went wrong\n'));
                    }, 10);
                }
            });

            await mcpClient.startServer('test-server', 'bun', ['test-script.ts']);

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
