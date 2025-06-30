import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { promises as fs } from 'fs';

// Mock config
const mockConfig = {
    paths: {
        outputs: '/tmp/test-outputs',
        logs: '/tmp/test-logs'
    }
};

// Mock logger
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

// Mock spawn function
const mockSpawn = mock(() => ({
    stdout: new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('Mock command output'));
            controller.close();
        }
    }),
    stderr: new ReadableStream({
        start(controller) {
            controller.close();
        }
    }),
    exited: Promise.resolve(0)
}));

// Mock modules
mock.module('../src/config', () => ({ config: mockConfig }));
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('bun', () => ({
    spawn: mockSpawn,
    file: (path: string) => ({
        exists: () => Promise.resolve(true),
        size: 1024
    })
}));

describe('ToolRunner', () => {
    let ToolRunner: any;
    let toolRunner: any;
    let tools: any;

    beforeEach(async () => {
        // Create test directories
        await fs.mkdir(mockConfig.paths.outputs, { recursive: true });
        await fs.mkdir(mockConfig.paths.logs, { recursive: true });

        // Import modules after mocking
        const module = await import('../src/tools/tool_runner');
        ToolRunner = module.ToolRunner;
        toolRunner = module.toolRunner;
        tools = module.tools;
    });

    afterEach(async () => {
        // Clean up test directories
        try {
            await fs.rm('/tmp/test-outputs', { recursive: true, force: true });
            await fs.rm('/tmp/test-logs', { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
        mockSpawn.mockClear();
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
    });

    describe('Tool Execution', () => {
        it('should execute shell commands', async () => {
            const result = await toolRunner.executeTool('shell', {
                command: 'echo "Hello World"'
            });

            expect(result.output).toContain('Mock command output');
            expect(mockSpawn).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Executing tool',
                expect.objectContaining({ tool: 'shell' })
            );
        });

        it('should handle unknown tools', async () => {
            await expect(
                toolRunner.executeTool('unknown_tool', {})
            ).rejects.toThrow('Unknown tool: unknown_tool');
        });

        it('should log tool execution', async () => {
            await toolRunner.executeTool('shell', { command: 'ls' });

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Executing tool',
                expect.objectContaining({ tool: 'shell' })
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Tool execution completed',
                expect.objectContaining({ tool: 'shell' })
            );
        });

        it('should handle tool execution errors', async () => {
            mockSpawn.mockImplementationOnce(() => {
                throw new Error('Command failed');
            });

            await expect(
                toolRunner.executeTool('shell', { command: 'invalid_command' })
            ).rejects.toThrow('Command failed');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Tool execution failed',
                expect.objectContaining({ tool: 'shell' })
            );
        });
    });

    describe('Individual Tools', () => {
        describe('shell tool', () => {
            it('should execute shell commands', async () => {
                const result = await tools.shell({ command: 'echo test' });

                expect(result.output).toBeDefined();
                expect(mockSpawn).toHaveBeenCalledWith(
                    expect.objectContaining({
                        cmd: ['bash', '-c', 'echo test']
                    })
                );
            });

            it('should handle command errors', async () => {
                mockSpawn.mockImplementationOnce(() => ({
                    stdout: new ReadableStream({
                        start(controller) { controller.close(); }
                    }),
                    stderr: new ReadableStream({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode('Command not found'));
                            controller.close();
                        }
                    }),
                    exited: Promise.resolve(1)
                }));

                await expect(
                    tools.shell({ command: 'invalid_command' })
                ).rejects.toThrow('Command not found');
            });
        });

        describe('file_read tool', () => {
            it('should read files', async () => {
                const testFile = `${mockConfig.paths.outputs}/test.txt`;
                await fs.writeFile(testFile, 'Test content');

                const result = await tools.file_read({ path: testFile });

                expect(result.content).toBe('Test content');
            });

            it('should handle missing files', async () => {
                await expect(
                    tools.file_read({ path: '/nonexistent/file.txt' })
                ).rejects.toThrow();
            });
        });

        describe('file_write tool', () => {
            it('should write files', async () => {
                const testFile = `${mockConfig.paths.outputs}/write_test.txt`;
                const content = 'Test write content';

                const result = await tools.file_write({
                    path: testFile,
                    content: content
                });

                expect(result.success).toBe(true);
                expect(result.path).toBe(testFile);

                // Verify file was written
                const written = await fs.readFile(testFile, 'utf-8');
                expect(written).toBe(content);
            });

            it('should create directories if needed', async () => {
                const testFile = `${mockConfig.paths.outputs}/subdir/test.txt`;

                const result = await tools.file_write({
                    path: testFile,
                    content: 'test'
                });

                expect(result.success).toBe(true);
                
                // Verify directory was created
                const stats = await fs.stat(`${mockConfig.paths.outputs}/subdir`);
                expect(stats.isDirectory()).toBe(true);
            });
        });

        describe('file_list tool', () => {
            it('should list directory contents', async () => {
                // Create test files
                await fs.writeFile(`${mockConfig.paths.outputs}/file1.txt`, 'content1');
                await fs.writeFile(`${mockConfig.paths.outputs}/file2.txt`, 'content2');

                const result = await tools.file_list({
                    path: mockConfig.paths.outputs
                });

                expect(result.files).toContain('file1.txt');
                expect(result.files).toContain('file2.txt');
            });

            it('should handle empty directories', async () => {
                const emptyDir = `${mockConfig.paths.outputs}/empty`;
                await fs.mkdir(emptyDir, { recursive: true });

                const result = await tools.file_list({ path: emptyDir });

                expect(result.files).toHaveLength(0);
            });
        });

        describe('run_script tool', () => {
            it('should execute scripts', async () => {
                // Create test script
                const scriptDir = `${mockConfig.paths.outputs}/scripts`;
                await fs.mkdir(scriptDir, { recursive: true });
                const scriptPath = `${scriptDir}/test.sh`;
                await fs.writeFile(scriptPath, '#!/bin/bash\necho "Script output"');
                await fs.chmod(scriptPath, 0o755);

                const result = await tools.run_script({
                    script_name: 'test.sh',
                    args: []
                });

                expect(result.output).toContain('Mock command output');
                expect(mockSpawn).toHaveBeenCalledWith(
                    expect.objectContaining({
                        cmd: ['bash', scriptPath]
                    })
                );
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle file system errors', async () => {
            await expect(
                tools.file_read({ path: '/root/protected_file.txt' })
            ).rejects.toThrow();
        });

        it('should handle invalid tool arguments', async () => {
            await expect(
                tools.shell({}) // Missing required command
            ).rejects.toThrow();
        });

        it('should handle spawn errors', async () => {
            mockSpawn.mockImplementationOnce(() => {
                throw new Error('Spawn failed');
            });

            await expect(
                tools.shell({ command: 'test' })
            ).rejects.toThrow('Spawn failed');
        });
    });

    describe('Tool Registration', () => {
        it('should have all expected tools registered', () => {
            const expectedTools = [
                'shell',
                'file_read',
                'file_write',
                'file_list',
                'run_script'
            ];

            expectedTools.forEach(toolName => {
                expect(tools).toHaveProperty(toolName);
                expect(typeof tools[toolName]).toBe('function');
            });
        });

        it('should validate tool function signatures', () => {
            // Each tool should be a function that accepts an object parameter
            Object.values(tools).forEach(tool => {
                expect(typeof tool).toBe('function');
                expect(tool.length).toBe(1); // Should accept one parameter
            });
        });
    });

    describe('Integration', () => {
        it('should handle complex workflow', async () => {
            // Write a file, read it back, and list directory
            const testFile = `${mockConfig.paths.outputs}/workflow_test.txt`;
            const content = 'Workflow test content';

            // Write file
            await toolRunner.executeTool('file_write', {
                path: testFile,
                content: content
            });

            // Read file back
            const readResult = await toolRunner.executeTool('file_read', {
                path: testFile
            });

            expect(readResult.content).toBe(content);

            // List directory
            const listResult = await toolRunner.executeTool('file_list', {
                path: mockConfig.paths.outputs
            });

            expect(listResult.files).toContain('workflow_test.txt');
        });

        it('should maintain tool execution logs', async () => {
            await toolRunner.executeTool('shell', { command: 'echo test1' });
            await toolRunner.executeTool('shell', { command: 'echo test2' });

            // Should have logged both executions
            expect(mockLogger.info).toHaveBeenCalledTimes(4); // 2 start + 2 complete
        });
    });
});
