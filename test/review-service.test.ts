import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { promises as fs } from 'fs';

// Mock config
const mockConfig = {
    paths: {
        database: ':memory:',
        outputs: '/tmp/test-outputs'
    }
};

// Mock logger
const mockLogger = {
    info: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve())
};

// Mock modules
mock.module('../src/config', () => ({ config: mockConfig }));
mock.module('../src/utils/logger', () => ({ logger: mockLogger }));

describe('ReviewService', () => {
    let db: Database;
    let ReviewService: any;
    let reviewService: any;

    beforeEach(async () => {
        // Create in-memory database
        db = new Database(':memory:');
        
        // Create required tables
        db.run(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                description TEXT,
                status TEXT,
                result_summary TEXT,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                finished_at DATETIME
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS review_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                criteria_json TEXT NOT NULL,
                passed_criteria_json TEXT NOT NULL,
                failed_criteria_json TEXT NOT NULL,
                score REAL NOT NULL,
                passed BOOLEAN NOT NULL,
                recommendations_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks (id)
            )
        `);

        // Create test output directory
        await fs.mkdir(mockConfig.paths.outputs, { recursive: true });

        // Mock database module
        mock.module('../src/db', () => ({
            getDatabase: () => db
        }));

        // Import ReviewService after mocking
        const module = await import('../src/services/review-service');
        ReviewService = module.ReviewService;
        reviewService = new ReviewService();
    });

    afterEach(async () => {
        if (db) {
            db.close();
        }
        // Clean up test files
        try {
            await fs.rm(mockConfig.paths.outputs, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
        mockLogger.info.mockClear();
        mockLogger.error.mockClear();
    });

    describe('Task Review', () => {
        beforeEach(() => {
            // Insert test task
            db.run(`
                INSERT INTO tasks (id, type, description, status, result_summary)
                VALUES (1, 'shell', 'Test task', 'completed', 'Task completed successfully')
            `);
        });

        it('should review completed task successfully', async () => {
            const criteria = [
                'status === "completed"',
                'result_summary.includes("successfully")',
                'type === "shell"'
            ];

            const result = await reviewService.reviewTask(1, criteria);

            expect(result.success).toBe(true);
            expect(result.score).toBeGreaterThan(0);
            expect(result.passed_criteria).toHaveLength(3);
            expect(result.failed_criteria).toHaveLength(0);
        });

        it('should handle missing task', async () => {
            const result = await reviewService.reviewTask(999, ['Task exists']);

            expect(result.success).toBe(false);
            expect(result.score).toBe(0);
            expect(result.error).toContain('not found');
        });

        it('should evaluate custom criteria correctly', async () => {
            const criteria = [
                'status === "completed"',
                'result_summary.includes("completed")',
                'result_summary.includes("error")', // This should fail
                'type === "shell"'
            ];

            const result = await reviewService.reviewTask(1, criteria);

            expect(result.success).toBe(true);
            expect(result.passed_criteria).toHaveLength(3);
            expect(result.failed_criteria).toHaveLength(1);
            expect(result.score).toBeCloseTo(0.75, 2); // 3/4 = 0.75
        });

        it('should check output file quality', async () => {
            // Create test output file
            const outputFile = `${mockConfig.paths.outputs}/task_1_output.txt`;
            await fs.writeFile(outputFile, 'Test output content that is longer than 50 bytes for testing purposes');

            const criteria = [
                'status === "completed"',
                'Output file exists',
                'Output file is valid Python',
                'File size > 50 bytes',
                'Contains function definition'
            ];

            const result = await reviewService.reviewTask(1, criteria);

            expect(result.success).toBe(true);
            expect(result.passed_criteria.length).toBeGreaterThan(0);
        });
    });

    describe('Batch Review', () => {
        beforeEach(() => {
            // Insert multiple test tasks
            db.run(`
                INSERT INTO tasks (id, type, description, status)
                VALUES 
                    (1, 'shell', 'Task 1', 'completed'),
                    (2, 'shell', 'Task 2', 'completed'),
                    (3, 'shell', 'Task 3', 'failed')
            `);
        });

        it('should review multiple tasks', async () => {
            const taskIds = [1, 2, 3];
            const criteria = ['status === "completed"'];

            const result = await reviewService.reviewBatch(taskIds, criteria);

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(3);
            expect(result.summary.total_tasks).toBe(3);
            expect(result.summary.passed_tasks).toBe(2);
            expect(result.summary.failed_tasks).toBe(1);
        });

        it('should generate summary report', async () => {
            const result = await reviewService.generateSummaryReport([1, 2, 3]);

            expect(result.success).toBe(true);
            expect(result.summary.total_tasks).toBe(3);
            expect(result.task_breakdown).toBeDefined();
            expect(result.recommendations).toBeDefined();
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

            expect(metrics.success).toBe(true);
            expect(metrics.line_count).toBeGreaterThan(0);
            expect(metrics.function_count).toBeGreaterThan(0);
            expect(metrics.complexity_score).toBeNumber();
            expect(metrics.quality_score).toBeNumber();
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

            expect(metrics.success).toBe(true);
            expect(metrics.line_count).toBeGreaterThan(0);
            expect(metrics.has_error_handling).toBe(true);
            expect(metrics.quality_score).toBeNumber();
        });
    });

    describe('Performance Analysis', () => {
        beforeEach(() => {
            // Insert task with timing data
            db.run(`
                INSERT INTO tasks (id, type, description, status, started_at, finished_at)
                VALUES (1, 'shell', 'Performance test', 'completed',
                       datetime('now', '-5 minutes'), datetime('now'))
            `);
        });

        it('should analyze task execution performance', async () => {
            const analysis = await reviewService.analyzePerformance(1);

            expect(analysis.success).toBe(true);
            expect(analysis.execution_time_minutes).toBeNumber();
            expect(analysis.performance_rating).toBeString();
            expect(analysis.recommendations).toBeDefined();
        });

        it('should compare performance against benchmarks', async () => {
            // Insert benchmark data
            db.run(`
                INSERT INTO tasks (type, description, status, started_at, finished_at)
                VALUES 
                    ('shell', 'Similar task 1', 'completed', datetime('now', '-10 minutes'), datetime('now', '-8 minutes')),
                    ('shell', 'Similar task 2', 'completed', datetime('now', '-15 minutes'), datetime('now', '-12 minutes')),
                    ('shell', 'Test task', 'completed', datetime('now', '-5 minutes'), datetime('now'))
            `);

            const comparison = await reviewService.comparePerformance('shell', 'Test task');

            expect(comparison.success).toBe(true);
            expect(comparison.current_performance).toBeDefined();
            expect(comparison.benchmark_average).toBeDefined();
            expect(comparison.performance_ratio).toBeNumber();
        });
    });

    describe('Review History', () => {
        beforeEach(() => {
            // Insert test review results
            db.run(`
                INSERT INTO review_results (task_id, criteria_json, passed_criteria_json, failed_criteria_json, score, passed)
                VALUES 
                    (1, '["criteria1"]', '["criteria1"]', '[]', 1.0, 1),
                    (1, '["criteria1", "criteria2"]', '["criteria1"]', '["criteria2"]', 0.5, 0)
            `);
        });

        it('should get task review summary', () => {
            const summary = reviewService.getTaskReviewSummary(1);

            expect(summary.task_id).toBe(1);
            expect(summary.total_reviews).toBe(2);
            expect(summary.latest_score).toBeDefined();
            expect(summary.average_score).toBeDefined();
            expect(summary.passed_reviews).toBeDefined();
            expect(summary.failed_reviews).toBeDefined();
        });

        it('should get task review history', () => {
            const reviews = reviewService.getTaskReviews(1);

            expect(reviews).toHaveLength(2);
            expect(reviews[0].task_id).toBe(1);
        });

        it('should get recent reviews', () => {
            const recent = reviewService.getRecentReviews(5);

            expect(recent.length).toBeGreaterThan(0);
            expect(recent.length).toBeLessThanOrEqual(5);
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors gracefully', async () => {
            // Close database to simulate error
            db.close();

            const result = await reviewService.reviewTask(1, ['test']);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle invalid criteria', async () => {
            db.run(`INSERT INTO tasks (id, type, status) VALUES (1, 'shell', 'completed')`);

            const result = await reviewService.reviewTask(1, ['invalid.syntax.here']);

            expect(result.success).toBe(true);
            expect(result.failed_criteria).toContain('invalid.syntax.here');
        });

        it('should handle missing output files', async () => {
            db.run(`INSERT INTO tasks (id, type, status) VALUES (1, 'shell', 'completed')`);

            const result = await reviewService.reviewTask(1, ['Output file exists']);

            expect(result.success).toBe(true);
            expect(result.failed_criteria).toContain('Output file exists');
        });
    });
});
