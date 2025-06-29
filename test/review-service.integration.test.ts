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
describe('Review Service', () => {
    describe('Task Review', () => {
        it('should review completed task', async () => {
            // Insert completed task
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, result_summary, finished_at)
                VALUES (1, 'shell', 'Test task', 'completed', 'Task completed successfully', datetime('now'))
            `);

            // Create output file
            const outputFile = `${mockConfig.paths.outputs}/task_1_output.txt`;
            await fs.writeFile(outputFile, 'Task output content');

            const criteria = [
                'Task completed successfully',
                'Output file exists',
                'No errors reported'
            ];

            const result = await reviewService.reviewTask(1, criteria);

            expect(result.success).toBe(true);
            expect(result.score).toBeGreaterThan(0);
            expect(result.passed_criteria).toBeDefined();
            expect(result.failed_criteria).toBeDefined();
        });

        it('should handle missing task', async () => {
            const result = await reviewService.reviewTask(999, ['Task exists']);

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should evaluate custom criteria', async () => {
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, result_summary)
                VALUES (1, 'shell', 'Test task', 'completed', 'Task completed with warnings')
            `);

            const criteria = [
                'status === "completed"',
                'result_summary.includes("completed")',
                'result_summary.includes("error")', // This should fail
                'type === "shell"'
            ];

            const result = await reviewService.reviewTask(1, criteria);

            expect(result.success).toBe(true);
            expect(result.passed_criteria.length).toBe(3);
            expect(result.failed_criteria.length).toBe(1);
            expect(result.score).toBe(0.75); // 3/4 criteria passed
        });

        it('should check output file quality', async () => {
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES (1, 'code', 'Generate Python script', 'completed')
            `);

            // Create Python output file
            const outputFile = `${mockConfig.paths.outputs}/task_1_output.py`;
            await fs.writeFile(outputFile, `
def hello_world():
print("Hello, World!")

if __name__ == "__main__":
hello_world()
`);

            const criteria = [
                'Output file is valid Python',
                'File size > 50 bytes',
                'Contains function definition'
            ];

            const result = await reviewService.reviewTask(1, criteria);

            expect(result.success).toBe(true);
            expect(result.score).toBeGreaterThan(0.5);
        });
    });

    describe('Batch Review', () => {
        it('should review multiple tasks', async () => {
            // Insert multiple tasks
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, result_summary)
                VALUES 
                    (1, 'shell', 'Task 1', 'completed', 'Success'),
                    (2, 'shell', 'Task 2', 'failed', 'Error occurred'),
                    (3, 'shell', 'Task 3', 'completed', 'Success')
            `);

            const taskIds = [1, 2, 3];
            const criteria = ['status === "completed"'];

            const result = await reviewService.reviewBatch(taskIds, criteria);

            expect(result.success).toBe(true);
            expect(result.reviews).toBeDefined();
            expect(result.reviews.length).toBe(3);
            expect(result.overall_score).toBeDefined();
            
            // Should have 2 passed and 1 failed
            const passedReviews = result.reviews.filter(r => r.score === 1);
            expect(passedReviews.length).toBe(2);
        });

        it('should generate summary report', async () => {
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES 
                    (1, 'shell', 'Task 1', 'completed'),
                    (2, 'shell', 'Task 2', 'completed'),
                    (3, 'shell', 'Task 3', 'failed')
            `);

            const result = await reviewService.generateSummaryReport([1, 2, 3]);

            expect(result.success).toBe(true);
            expect(result.summary).toBeDefined();
            expect(result.summary.total_tasks).toBe(3);
            expect(result.summary.completed_tasks).toBe(2);
            expect(result.summary.failed_tasks).toBe(1);
            expect(result.summary.success_rate).toBe(2/3);
        });
    });

    describe('Quality Metrics', () => {
        it('should calculate code quality metrics', async () => {
            const codeContent = `
def calculate_fibonacci(n):
if n <= 1:
    return n
return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)

# Test the function
for i in range(10):
print(f"F({i}) = {calculate_fibonacci(i)}")
`;

            const metrics = await reviewService.calculateCodeQuality(codeContent, 'python');

            expect(metrics.lines_of_code).toBeGreaterThan(0);
            expect(metrics.has_functions).toBe(true);
            expect(metrics.has_comments).toBe(true);
            expect(metrics.complexity_score).toBeDefined();
        });

        it('should analyze shell script quality', async () => {
            const shellContent = `#!/bin/bash
# Backup script with error handling

set -e  # Exit on error

BACKUP_DIR="/backup"
SOURCE_DIR="/data"

if [ ! -d "$BACKUP_DIR" ]; then
mkdir -p "$BACKUP_DIR"
fi

tar -czf "$BACKUP_DIR/backup_$(date +%Y%m%d).tar.gz" "$SOURCE_DIR"
echo "Backup completed successfully"
`;

            const metrics = await reviewService.calculateCodeQuality(shellContent, 'shell');

            expect(metrics.has_error_handling).toBe(true);
            expect(metrics.has_comments).toBe(true);
            expect(metrics.uses_variables).toBe(true);
        });
    });

    describe('Performance Analysis', () => {
        it('should analyze task execution performance', async () => {
            mockDb.run(`
                INSERT INTO tasks (id, type, description, status, started_at, finished_at)
                VALUES (1, 'shell', 'Performance test', 'completed', 
                       datetime('now', '-5 minutes'), datetime('now'))
            `);

            const analysis = await reviewService.analyzePerformance(1);

            expect(analysis.success).toBe(true);
            expect(analysis.execution_time).toBeGreaterThan(0);
            expect(analysis.performance_rating).toBeDefined();
        });

        it('should compare performance against benchmarks', async () => {
            // Insert benchmark data
            mockDb.run(`
                INSERT INTO tasks (type, description, status, started_at, finished_at)
                VALUES 
                    ('shell', 'Similar task 1', 'completed', datetime('now', '-10 minutes'), datetime('now', '-8 minutes')),
                    ('shell', 'Similar task 2', 'completed', datetime('now', '-15 minutes'), datetime('now', '-12 minutes')),
                    ('shell', 'Test task', 'completed', datetime('now', '-5 minutes'), datetime('now'))
            `);

            const comparison = await reviewService.comparePerformance('shell', 'Test task');

            expect(comparison.success).toBe(true);
            expect(comparison.average_time).toBeDefined();
            expect(comparison.percentile_rank).toBeDefined();
        });
    });
});
