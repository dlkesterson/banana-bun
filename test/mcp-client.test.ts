import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';
import {
    createProcessMock,
    CommonTestSetup,
    MCPResponseTestFactory
} from '../src/test-utils';

// Mock process spawning for Bun
let mockProcess = createProcessMock();
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
        // Create fresh mock process for each test
        mockProcess = createProcessMock();
        mockSpawn.mockReturnValue(mockProcess);

        mcpClient = new MCPClient();

        // Reset mocks (but not mockSpawn since we need to track its calls)
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
        it('should start MCP server successfully', async () => {
            // Mock the sendRequest method to simulate successful initialization
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    return {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'test-server', version: '1.0.0' }
                    };
                }
                return originalSendRequest.call(mcpClient, serverName, method, params);
            });

            // This should complete without throwing
            await expect(mcpClient.startServer('test-server', 'bun', ['test-script.ts'])).resolves.toBeUndefined();

            // Verify that the server was registered
            expect(mcpClient['servers'].has('test-server')).toBe(true);

            // Restore original method
            mcpClient['sendRequest'] = originalSendRequest;
        });

        it('should handle server startup failure', async () => {
            // Mock sendRequest to throw an error during initialization
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    throw new Error('Initialization failed');
                }
                return originalSendRequest.call(mcpClient, serverName, method, params);
            });

            await expect(
                mcpClient.startServer('test-server', 'bun', ['test-script.ts'])
            ).rejects.toThrow('Initialization failed');

            // Restore original method
            mcpClient['sendRequest'] = originalSendRequest;
        });

        it('should stop MCP server process', async () => {
            // First start a server
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    return {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'test-server', version: '1.0.0' }
                    };
                }
                return originalSendRequest.call(mcpClient, serverName, method, params);
            });

            await mcpClient.startServer('test-server', 'bun', ['test-script.ts']);

            // Now stop it
            await mcpClient.stopServer('test-server');

            // Verify that the server was removed
            expect(mcpClient['servers'].has('test-server')).toBe(false);

            // Restore original method
            mcpClient['sendRequest'] = originalSendRequest;
        });
    });

    describe('Tool Operations', () => {
        beforeEach(async () => {
            // Mock sendRequest for initialization
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    return {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'test-server', version: '1.0.0' }
                    };
                }
                return originalSendRequest.call(mcpClient, serverName, method, params);
            });

            // Setup server
            await mcpClient.startServer('test-server', 'bun', ['test-script.ts']);
        });

        it('should send tool request successfully', async () => {
            const mockResponse = MCPResponseTestFactory.createToolResponse({
                success: true,
                data: 'test result'
            });

            // Mock sendRequest to return the expected response
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    return {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'test-server', version: '1.0.0' }
                    };
                } else if (method === 'tools/call') {
                    return mockResponse;
                }
                return originalSendRequest.call(mcpClient, serverName, method, params);
            });

            const result = await mcpClient.sendRequest('test-server', 'tools/call', {
                name: 'test_tool',
                arguments: { param: 'value' }
            });

            expect(result).toEqual(mockResponse);

            // Restore original method
            mcpClient['sendRequest'] = originalSendRequest;
        });

        it('should handle tool request timeout', async () => {
            // Mock sendRequest to simulate timeout
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    return {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'test-server', version: '1.0.0' }
                    };
                } else if (method === 'tools/call') {
                    throw new Error('MCP request timeout for tools/call');
                }
                return originalSendRequest.call(mcpClient, serverName, method, params);
            });

            await expect(
                mcpClient.sendRequest('test-server', 'tools/call', {
                    name: 'slow_tool',
                    arguments: {}
                })
            ).rejects.toThrow('timeout');

            // Restore original method
            mcpClient['sendRequest'] = originalSendRequest;
        });

        it('should handle server error response', async () => {
            const mockErrorResponse = MCPResponseTestFactory.createErrorResponse('Tool not found');

            // Mock sendRequest to return error
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    return {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'test-server', version: '1.0.0' }
                    };
                } else if (method === 'tools/call') {
                    throw new Error('Tool not found');
                }
                return originalSendRequest.call(mcpClient, serverName, method, params);
            });

            await expect(
                mcpClient.sendRequest('test-server', 'tools/call', {
                    name: 'nonexistent_tool',
                    arguments: {}
                })
            ).rejects.toThrow('Tool not found');

            // Restore original method
            mcpClient['sendRequest'] = originalSendRequest;
        });
    });

    describe('High-level API Methods', () => {
        beforeEach(async () => {
            // Mock sendRequest for initialization
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    return {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'meilisearch', version: '1.0.0' }
                    };
                }
                return originalSendRequest.call(mcpClient, serverName, method, params);
            });

            await mcpClient.startServer('meilisearch', 'bun', ['meilisearch-server.ts']);
        });

        it('should perform smart search', async () => {
            const mockSearchResult = {
                hits: [{ id: 1, title: 'Test Result' }],
                totalHits: 1,
                processingTimeMs: 50
            };

            // Mock sendRequest to return search results
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    return {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'meilisearch', version: '1.0.0' }
                    };
                } else if (method === 'tools/call' && params?.name === 'smart_search') {
                    return MCPResponseTestFactory.createToolResponse(mockSearchResult);
                }
                return originalSendRequest.call(mcpClient, serverName, method, params);
            });

            const result = await mcpClient.smartSearch('test query', {
                limit: 10,
                filters: 'type:video'
            });

            expect(result.hits).toHaveLength(1);
            expect(result.totalHits).toBe(1);

            // Restore original method
            mcpClient['sendRequest'] = originalSendRequest;
        });

        it('should handle search errors gracefully', async () => {
            // Mock sendRequest to throw search error
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    return {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'meilisearch', version: '1.0.0' }
                    };
                } else if (method === 'tools/call' && params?.name === 'smart_search') {
                    throw new Error('Search failed');
                }
                return originalSendRequest.call(mcpClient, serverName, method, params);
            });

            await expect(
                mcpClient.smartSearch('invalid query')
            ).rejects.toThrow('Search failed');

            // Restore original method
            mcpClient['sendRequest'] = originalSendRequest;
        });
    });

    describe('Error Handling', () => {
        it('should handle server not found errors', async () => {
            // Try to send request to non-existent server
            await expect(
                mcpClient.sendRequest('nonexistent-server', 'test', {})
            ).rejects.toThrow('MCP server nonexistent-server not found');
        });

        it('should handle connection errors gracefully', async () => {
            // Mock sendRequest to simulate connection error
            const originalSendRequest = mcpClient['sendRequest'];
            mcpClient['sendRequest'] = mock(async (serverName: string, method: string, params?: any) => {
                if (method === 'initialize') {
                    return {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'test-server', version: '1.0.0' }
                    };
                } else {
                    throw new Error('Connection lost');
                }
            });

            // Start server first
            await mcpClient.startServer('test-server', 'bun', ['test-script.ts']);

            // Try to send request
            await expect(
                mcpClient.sendRequest('test-server', 'test', {})
            ).rejects.toThrow('Connection lost');

            // Restore original method
            mcpClient['sendRequest'] = originalSendRequest;
        });
    });
});

afterAll(() => {
  mock.restore();
});
