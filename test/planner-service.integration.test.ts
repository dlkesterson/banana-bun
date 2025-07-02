import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';

// Mock fetch for LLM API calls
const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
        response: JSON.stringify({
            success: true,
            tasks: [
                {
                    type: 'shell',
                    description: 'Create directory structure',
                    shell_command: 'mkdir -p project/{src,tests,docs}'
                },
                {
                    type: 'code',
                    description: 'Generate main application file',
                    language: 'python',
                    requirements: ['Create main.py with basic structure']
                }
            ],
            plan_id: 'integration_test_plan',
            estimated_duration: 1800
        })
    })
}));

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
        outputs: '/tmp/test-outputs',
        tasks: '/tmp/test-tasks',
        database: ':memory:'
    },
    ollama: {
        url: 'http://localhost:11434',
        model: 'qwen3:8b'
    }
};

// Mock modules
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
mock.module('../src/config', () => ({ config: mockConfig }));

// Mock global fetch
global.fetch = mockFetch;

// Mock database functions
let mockDb: Database;
const mockGetDatabase = mock(() => mockDb);

mock.module('../src/db', () => ({
    getDatabase: mockGetDatabase
}));

import { plannerService } from '../src/services/planner-service';
import { reviewService } from '../src/services/review-service';
import type { PlannerTask, ReviewTask } from '../src/types';
beforeEach(async () => {
    // Create in-memory database for testing
    mockDb = new Database(':memory:');
    
    // Create tasks table
    mockDb.run(`
        CREATE TABLE tasks (
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
            tool TEXT,
            generator TEXT,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            finished_at DATETIME
        )
    `);

    // Create planner_results table
    mockDb.run(`
        CREATE TABLE planner_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id TEXT,
            goal TEXT NOT NULL,
            context TEXT,
            tasks_json TEXT NOT NULL,
            model_used TEXT NOT NULL,
            estimated_duration INTEGER DEFAULT 0,
            task_id INTEGER,
            goal_description TEXT,
            generated_plan TEXT,
            similar_tasks_used TEXT,
            context_embeddings TEXT,
            subtask_count INTEGER DEFAULT 0,
            plan_version INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
        )
    `);

    // Setup test directories
    await fs.mkdir(mockConfig.paths.outputs, { recursive: true });
    await fs.mkdir(mockConfig.paths.tasks, { recursive: true });

    // Reset mocks
    mockFetch.mockClear();
    Object.values(mockLogger).forEach(fn => {
        if (typeof fn === 'function' && 'mockClear' in fn) {
            fn.mockClear();
        }
    });
});

afterEach(async () => {
    mockDb?.close();
    await fs.rm(mockConfig.paths.outputs, { recursive: true, force: true });
    await fs.rm(mockConfig.paths.tasks, { recursive: true, force: true });
});
describe('Planner Service', () => {
    describe('Task Decomposition', () => {
        it('should decompose complex goal into subtasks', async () => {
            const goal = 'Create a Python web application with authentication';
            const context = {
                technology: 'Flask',
                database: 'SQLite',
                features: ['user registration', 'login', 'dashboard']
            };

            const result = await plannerService.decomposeGoal(goal, context);

            expect(result.success).toBe(true);
            expect(result.tasks).toBeDefined();
            expect(result.tasks.length).toBeGreaterThan(0);
            
            // Should have called LLM API
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('localhost:11434'),
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
            );
        });

        it('should handle LLM API errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('API unavailable'));

            const result = await plannerService.decomposeGoal('Test goal', {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('API unavailable');
        });

        it('should validate generated tasks', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    response: JSON.stringify({
                        success: true,
                        tasks: [
                            {
                                type: 'shell',
                                description: 'Valid task',
                                shell_command: 'echo "valid"'
                            },
                            {
                                type: 'invalid_type',
                                description: 'Invalid task'
                            }
                        ],
                        plan_id: 'validation_test_plan',
                        estimated_duration: 1200
                    })
                })
            });

            const result = await plannerService.decomposeGoal('Test goal', {});

            expect(result.success).toBe(true);
            expect(result.tasks.length).toBe(1); // Only valid task should be included
            expect(result.warnings).toContain('Invalid task type');
        });

        it('should handle malformed LLM responses', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    response: 'invalid json response'
                })
            });

            const result = await plannerService.decomposeGoal('Test goal', {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('parse');
        });
    });

    describe('Task Optimization', () => {
        it('should optimize task sequence for dependencies', async () => {
            const tasks = [
                {
                    id: 1,
                    type: 'shell',
                    description: 'Deploy application',
                    dependencies: ['2', '3']
                },
                {
                    id: 2,
                    type: 'shell',
                    description: 'Build application',
                    dependencies: ['3']
                },
                {
                    id: 3,
                    type: 'shell',
                    description: 'Install dependencies',
                    dependencies: []
                }
            ];

            const optimized = await plannerService.optimizeTaskSequence(tasks);

            expect(optimized.success).toBe(true);
            expect(optimized.sequence).toBeDefined();
            
            // Task 3 should come first (no dependencies)
            expect(optimized.sequence[0].id).toBe(3);
            // Task 2 should come before task 1
            const task2Index = optimized.sequence.findIndex(t => t.id === 2);
            const task1Index = optimized.sequence.findIndex(t => t.id === 1);
            expect(task2Index).toBeLessThan(task1Index);
        });

        it('should detect circular dependencies', async () => {
            const tasks = [
                {
                    id: 1,
                    type: 'shell',
                    description: 'Task 1',
                    dependencies: ['2']
                },
                {
                    id: 2,
                    type: 'shell',
                    description: 'Task 2',
                    dependencies: ['1']
                }
            ];

            const result = await plannerService.optimizeTaskSequence(tasks);

            expect(result.success).toBe(false);
            expect(result.error).toContain('circular dependency');
        });

        it('should suggest parallel execution opportunities', async () => {
            const tasks = [
                {
                    id: 1,
                    type: 'shell',
                    description: 'Independent task 1',
                    dependencies: []
                },
                {
                    id: 2,
                    type: 'shell',
                    description: 'Independent task 2',
                    dependencies: []
                },
                {
                    id: 3,
                    type: 'shell',
                    description: 'Dependent task',
                    dependencies: ['1', '2']
                }
            ];

            const result = await plannerService.optimizeTaskSequence(tasks);

            expect(result.success).toBe(true);
            expect(result.parallelGroups).toBeDefined();
            expect(result.parallelGroups.length).toBeGreaterThan(0);
        });
    });

    describe('Plan Persistence', () => {
        it('should save plan to database', async () => {
            const plan = {
                goal: 'Test goal',
                tasks: [
                    {
                        type: 'shell',
                        description: 'Test task',
                        shell_command: 'echo "test"'
                    }
                ],
                metadata: {
                    created_by: 'planner-service',
                    complexity: 'medium'
                }
            };

            const result = await plannerService.savePlan(plan);

            expect(result.success).toBe(true);
            expect(result.planId).toBeDefined();

            // Verify plan was saved
            const savedPlan = mockDb.query('SELECT * FROM tasks WHERE generator = ?').get('planner-service');
            expect(savedPlan).toBeDefined();
        });

        it('should load existing plan', async () => {
            // Insert test plan
            mockDb.run(`
                INSERT INTO tasks (id, type, description, generator, metadata)
                VALUES (1, 'batch', 'Test plan', 'planner-service', '{"goal": "Test goal"}')
            `);

            const result = await plannerService.loadPlan(1);

            expect(result.success).toBe(true);
            expect(result.plan).toBeDefined();
            expect(result.plan.goal).toBe('Test goal');
        });
    });
});
