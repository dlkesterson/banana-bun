/**
 * Test utilities and helpers
 * Addresses PRD 4: Test Infrastructure Modernization - Phase 3
 */

import { Database } from 'bun:sqlite';
import { mock } from 'bun:test';
import { createDatabaseMock, createLoggerMock, createConfigMock } from './mock-factories';
import { TaskTestFactory, DatabaseTestFactory } from './test-data-factories';

// Database Test Setup
export class TestDatabaseSetup {
    static async createTestDatabase(): Promise<Database> {
        const db = new Database(':memory:');
        await this.createTestTables(db);
        return db;
    }

    static async createTestTables(db: Database): Promise<void> {
        // Create main tasks table
        db.run(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT,
                file_hash TEXT,
                parent_id INTEGER,
                description TEXT,
                type TEXT,
                status TEXT,
                dependencies TEXT,
                result_summary TEXT,
                shell_command TEXT,
                error_message TEXT,
                args TEXT,
                generator TEXT,
                tool TEXT,
                validation_errors TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                finished_at DATETIME
            )
        `);

        // Create media table
        db.run(`
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT UNIQUE,
                title TEXT,
                channel TEXT,
                file_path TEXT,
                downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create task_dependencies table
        db.run(`
            CREATE TABLE IF NOT EXISTS task_dependencies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                depends_on_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id),
                FOREIGN KEY (depends_on_id) REFERENCES tasks(id)
            )
        `);

        // Create retry tables
        db.run(`
            CREATE TABLE IF NOT EXISTS retry_policies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_type TEXT NOT NULL,
                max_retries INTEGER NOT NULL DEFAULT 3,
                backoff_strategy TEXT NOT NULL DEFAULT 'exponential',
                base_delay_ms INTEGER NOT NULL DEFAULT 1000,
                max_delay_ms INTEGER NOT NULL DEFAULT 30000,
                retry_multiplier REAL NOT NULL DEFAULT 2.0,
                retryable_errors TEXT,
                non_retryable_errors TEXT,
                enabled BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS retry_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                attempt_number INTEGER NOT NULL,
                attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                error_message TEXT,
                error_type TEXT,
                delay_ms INTEGER,
                success BOOLEAN NOT NULL DEFAULT 0,
                execution_time_ms INTEGER,
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            )
        `);

        // Create scheduling tables
        db.run(`
            CREATE TABLE IF NOT EXISTS task_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_task_id INTEGER NOT NULL,
                cron_expression TEXT NOT NULL,
                timezone TEXT NOT NULL DEFAULT 'UTC',
                enabled BOOLEAN NOT NULL DEFAULT 1,
                next_run_at DATETIME NOT NULL,
                last_run_at DATETIME,
                run_count INTEGER NOT NULL DEFAULT 0,
                max_instances INTEGER NOT NULL DEFAULT 1,
                overlap_policy TEXT NOT NULL DEFAULT 'skip',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (template_task_id) REFERENCES tasks(id)
            )
        `);

        // Create media metadata table
        db.run(`
            CREATE TABLE IF NOT EXISTS media_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                file_hash TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                tool_used TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id)
            )
        `);

        // Create user interactions table for MCP servers
        db.run(`
            CREATE TABLE IF NOT EXISTS user_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                session_id TEXT,
                interaction_type TEXT NOT NULL,
                content_type TEXT,
                query_text TEXT,
                results_count INTEGER,
                interaction_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes
        db.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
        db.run('CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type)');
        db.run('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_id)');
    }

    static async seedTestData(db: Database): Promise<void> {
        // Insert test tasks
        const shellTask = TaskTestFactory.createDatabaseTask({
            type: 'shell',
            description: 'Test shell task',
            shell_command: 'echo "test"'
        });

        const llmTask = TaskTestFactory.createDatabaseTask({
            id: 2,
            type: 'llm',
            description: 'Test LLM task',
            args: JSON.stringify({ prompt: 'Test prompt', model: 'gpt-4' })
        });

        db.run(`
            INSERT INTO tasks (type, description, status, shell_command, args)
            VALUES (?, ?, ?, ?, ?)
        `, [shellTask.type, shellTask.description, shellTask.status, shellTask.shell_command, shellTask.args]);

        db.run(`
            INSERT INTO tasks (type, description, status, args)
            VALUES (?, ?, ?, ?)
        `, [llmTask.type, llmTask.description, llmTask.status, llmTask.args]);

        // Insert test retry policy
        const retryPolicy = DatabaseTestFactory.createRetryPolicy();
        db.run(`
            INSERT INTO retry_policies (task_type, max_retries, backoff_strategy, base_delay_ms, max_delay_ms, retry_multiplier, retryable_errors, non_retryable_errors, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            retryPolicy.task_type,
            retryPolicy.max_retries,
            retryPolicy.backoff_strategy,
            retryPolicy.base_delay_ms,
            retryPolicy.max_delay_ms,
            retryPolicy.retry_multiplier,
            retryPolicy.retryable_errors,
            retryPolicy.non_retryable_errors,
            retryPolicy.enabled ? 1 : 0
        ]);
    }

    static async cleanupTestData(db: Database): Promise<void> {
        // Clean up in reverse order of dependencies
        db.run('DELETE FROM retry_history');
        db.run('DELETE FROM retry_policies');
        db.run('DELETE FROM task_dependencies');
        db.run('DELETE FROM media_metadata');
        db.run('DELETE FROM user_interactions');
        db.run('DELETE FROM task_schedules');
        db.run('DELETE FROM media');
        db.run('DELETE FROM tasks');
    }
}

// MCP Server Test Utilities
export class MCPServerTestUtils {
    static createMockMCPClient() {
        return {
            connect: mock(() => Promise.resolve()),
            disconnect: mock(() => Promise.resolve()),
            isConnected: mock(() => true),
            callTool: mock(() => Promise.resolve({
                content: [{ type: 'text', text: '{}' }]
            })),
            listTools: mock(() => Promise.resolve({
                tools: []
            })),
            sendRequest: mock(() => Promise.resolve({}))
        };
    }

    static createMockMCPServer() {
        return {
            setRequestHandler: mock(() => {}),
            connect: mock(() => Promise.resolve()),
            close: mock(() => Promise.resolve()),
            notification: mock(() => {}),
            request: mock(() => Promise.resolve({}))
        };
    }

    static validateMCPResponse(response: any): boolean {
        if (!response) return false;
        
        // Check for error response
        if (response.error) {
            return typeof response.error.code === 'number' && 
                   typeof response.error.message === 'string';
        }
        
        // Check for success response
        if (response.content) {
            return Array.isArray(response.content) &&
                   response.content.every((item: any) => 
                       item.type && typeof item.text === 'string'
                   );
        }
        
        return true; // Allow other response formats
    }

    static createMockToolHandler(toolName: string, response: any = {}) {
        return mock((request: any) => {
            if (request.params?.name === toolName) {
                return Promise.resolve({
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(response)
                        }
                    ]
                });
            }
            throw new Error(`Unknown tool: ${request.params?.name}`);
        });
    }
}

// Common Test Setup Utilities
export class CommonTestSetup {
    static setupMockModules() {
        const mockLogger = createLoggerMock();
        const mockConfig = createConfigMock();
        const mockDb = createDatabaseMock();

        // Mock common modules
        mock.module('../src/utils/logger', () => ({
            logger: mockLogger
        }));

        mock.module('../src/config', () => ({
            config: mockConfig
        }));

        mock.module('../src/db', () => ({
            getDatabase: mock(() => mockDb),
            initDatabase: mock(() => Promise.resolve()),
            getDependencyHelper: mock(() => ({}))
        }));

        return { mockLogger, mockConfig, mockDb };
    }

    static setupMCPMocks() {
        const mockServer = {
            setRequestHandler: mock(() => {}),
            connect: mock(() => Promise.resolve())
        };

        mock.module('@modelcontextprotocol/sdk/server/index.js', () => ({
            Server: mock(() => mockServer)
        }));

        mock.module('@modelcontextprotocol/sdk/server/stdio.js', () => ({
            StdioServerTransport: mock(() => ({}))
        }));

        mock.module('@modelcontextprotocol/sdk/types.js', () => ({
            CallToolRequestSchema: 'call_tool',
            ListToolsRequestSchema: 'list_tools'
        }));

        return { mockServer };
    }

    static async waitForAsync(ms: number = 10): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static expectValidTaskResult(result: any) {
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        if (!result.success) {
            expect(typeof result.error).toBe('string');
        }
    }

    static expectValidMCPResponse(response: any) {
        expect(MCPServerTestUtils.validateMCPResponse(response)).toBe(true);
    }
}

// Type-safe assertion helpers
export function assertIsString(value: unknown): asserts value is string {
    if (typeof value !== 'string') {
        throw new Error(`Expected string, got ${typeof value}`);
    }
}

export function assertIsNumber(value: unknown): asserts value is number {
    if (typeof value !== 'number') {
        throw new Error(`Expected number, got ${typeof value}`);
    }
}

export function assertIsArray<T>(value: unknown): asserts value is T[] {
    if (!Array.isArray(value)) {
        throw new Error(`Expected array, got ${typeof value}`);
    }
}

export function assertIsObject(value: unknown): asserts value is object {
    if (typeof value !== 'object' || value === null) {
        throw new Error(`Expected object, got ${typeof value}`);
    }
}
