import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';

// Mock fetch for LLM API calls
const mockFetch = mock(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
        response: JSON.stringify({
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
            ]
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

    // Create review_results table
    mockDb.run(`
        CREATE TABLE review_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            reviewer_type TEXT DEFAULT 'automated',
            model_used TEXT,
            passed BOOLEAN NOT NULL,
            score INTEGER,
            feedback TEXT,
            suggestions TEXT,
            review_criteria TEXT,
            reviewed_output TEXT,
            criteria_json TEXT,
            passed_criteria_json TEXT,
            failed_criteria_json TEXT,
            recommendations_json TEXT,
            quality_metrics_json TEXT,
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
describe('Service Integration', () => {
    it('should integrate planner and review services', async () => {
        // Plan a goal
        const planResult = await plannerService.decomposeGoal(
            'Create and test a simple script',
            { language: 'python' }
        );

        expect(planResult.success).toBe(true);

        // Simulate task execution and review
        if (planResult.tasks && planResult.tasks.length > 0) {
            const task = planResult.tasks[0];
            
            // Insert as completed task
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, result_summary)
                VALUES (1, ?, ?, 'completed', 'Task completed successfully')
            `, [task.type, task.description]);

            // Review the task
            const reviewResult = await reviewService.reviewTask(1, [
                'status === "completed"',
                'result_summary.includes("success")'
            ]);

            expect(reviewResult.success).toBe(true);
            expect(reviewResult.score).toBeGreaterThan(0);
        }
    });

    it('should handle service errors gracefully', async () => {
        // Test with invalid database
        mockGetDatabase.mockImplementationOnce(() => {
            throw new Error('Database error');
        });

        const result = await reviewService.reviewTask(1, ['test']);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Database error');
    });
});
