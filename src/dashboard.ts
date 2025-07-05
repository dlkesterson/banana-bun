import { getDatabase } from './db';
import { config } from './config';
import { writeFile, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from './utils/logger';
import type { DatabaseTask } from './types';
import { reviewService } from './services/review-service';
import { plannerService } from './services/planner-service';

// HTML escaping function to prevent XSS
function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    blocked: 'bg-gray-100 text-gray-800',
    skipped: 'bg-gray-100 text-gray-800',
    retrying: 'bg-orange-100 text-orange-800'
};

async function getTaskHierarchy(taskId: number, db: any): Promise<DatabaseTask[]> {
    const tasks: DatabaseTask[] = [];
    let currentId: number | null = taskId;

    while (currentId !== null) {
        const task = db.query('SELECT * FROM tasks WHERE id = ?').get(currentId) as DatabaseTask;
        if (!task) break;
        tasks.unshift(task);
        currentId = task.parent_id;
    }

    return tasks;
}

async function getTaskDependents(taskId: number, db: any): Promise<DatabaseTask[]> {
    return db.query('SELECT * FROM tasks WHERE parent_id = ?').all(taskId) as DatabaseTask[];
}

async function getRecentLogs(taskId: number): Promise<string[]> {
    try {
        const logPath = join(config.paths.logs, `task-${taskId}.log`);
        const content = await readFile(logPath, 'utf-8');
        return content.split('\n').slice(-50); // Get last 50 lines
    } catch {
        return [];
    }
}

async function generateTaskDetailPage(taskId: number): Promise<string> {
    const db = getDatabase();
    const task = db.query('SELECT * FROM tasks WHERE id = ?').get(taskId) as DatabaseTask;
    if (!task) {
        throw new Error(`Task ${taskId} not found`);
    }

    const hierarchy = await getTaskHierarchy(taskId, db);
    const dependents = await getTaskDependents(taskId, db);
    const logs = await getRecentLogs(taskId);

    // Phase 3: Get review and planner data
    const reviewSummary = reviewService.getTaskReviewSummary(taskId);
    const plannerResult = plannerService.getPlannerResultForTask(taskId);

    const hierarchyHtml = hierarchy.map(t => `
        <div class="flex items-center">
            <span class="text-sm ${t.id === taskId ? 'font-bold' : ''}">${t.description}</span>
            <span class="mx-2 text-gray-400">→</span>
        </div>
    `).join('');

    const dependentsHtml = dependents.map(t => `
        <tr>
            <td class="px-2 py-1 text-xs">${t.id}</td>
            <td class="px-2 py-1 text-xs">${t.description}</td>
            <td class="px-2 py-1 text-xs"><span class="rounded px-2 py-1 ${statusColors[t.status] || ''}">${t.status}</span></td>
            <td class="px-2 py-1 text-xs">${t.created_at}</td>
        </tr>
    `).join('');

    const logsHtml = logs.map(log => `<div class="text-xs font-mono">${log}</div>`).join('');

    // Try to read task result file if it exists
    let resultPreview = '';
    try {
        const resultPath = join(config.paths.outputs, `task-${taskId}.json`);
        const result = await readFile(resultPath, 'utf-8');
        resultPreview = `<pre class="text-xs font-mono bg-gray-50 p-2 rounded">${result}</pre>`;
    } catch {
        resultPreview = '<div class="text-gray-500">No result file available</div>';
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task ${taskId} Details</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50">
    <div class="container mx-auto py-8">
        <div class="mb-4">
            <a href="/" class="text-blue-600 hover:underline">← Back to Dashboard</a>
        </div>

        <div class="bg-white rounded-lg shadow p-6 mb-6">
            <h1 class="text-2xl font-bold mb-4">Task ${taskId}</h1>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <p class="text-sm"><span class="font-semibold">Description:</span> ${escapeHtml(task.description)}</p>
                    <p class="text-sm"><span class="font-semibold">Type:</span> ${task.type}</p>
                    <p class="text-sm"><span class="font-semibold">Status:</span> <span class="rounded px-2 py-1 ${statusColors[task.status] || ''}">${task.status}</span></p>
                    <p class="text-sm"><span class="font-semibold">Created:</span> ${task.created_at}</p>
                    <p class="text-sm"><span class="font-semibold">Started:</span> ${task.started_at || 'N/A'}</p>
                    <p class="text-sm"><span class="font-semibold">Finished:</span> ${task.finished_at || 'N/A'}</p>
                </div>
                <div>
                    <p class="text-sm"><span class="font-semibold">File:</span> ${task.filename}</p>
                    <p class="text-sm"><span class="font-semibold">Dependencies:</span> ${task.dependencies || 'None'}</p>
                    <p class="text-sm"><span class="font-semibold">Error:</span> ${task.error_message || 'None'}</p>
                    ${reviewSummary.latest_review ? `
                        <p class="text-sm"><span class="font-semibold">Review:</span> ${reviewService.getPassFailBadge(reviewSummary.latest_review.passed)} ${reviewService.getScoreBadge(reviewSummary.latest_review.score)}</p>
                    ` : ''}
                    ${plannerResult ? `
                        <p class="text-sm"><span class="font-semibold">Plan Context:</span> ${plannerService.getContextUsageBadge(plannerResult.similar_tasks_used)} ${plannerService.getSubtaskCountBadge(plannerResult.subtask_count)}</p>
                    ` : ''}
                </div>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-6">
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-lg font-semibold mb-4">Task Hierarchy</h2>
                <div class="flex flex-col">
                    ${hierarchyHtml}
                </div>
            </div>

            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-lg font-semibold mb-4">Dependent Tasks</h2>
                <table class="min-w-full">
                    <thead>
                        <tr>
                            <th class="px-2 py-1 text-xs text-left">ID</th>
                            <th class="px-2 py-1 text-xs text-left">Description</th>
                            <th class="px-2 py-1 text-xs text-left">Status</th>
                            <th class="px-2 py-1 text-xs text-left">Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dependentsHtml}
                    </tbody>
                </table>
            </div>

            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-lg font-semibold mb-4">Recent Logs</h2>
                <div class="h-64 overflow-y-auto bg-gray-50 p-2 rounded">
                    ${logsHtml}
                </div>
            </div>

            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-lg font-semibold mb-4">Task Result</h2>
                <div class="h-64 overflow-y-auto">
                    ${resultPreview}
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
}

export async function generateDashboard() {
    const db = getDatabase();
    const tasks = db.query('SELECT * FROM tasks ORDER BY created_at DESC').all() as DatabaseTask[];

    // Phase 3: Get metrics for dashboard
    const reviewMetrics = reviewService.getReviewMetrics();
    const plannerMetrics = plannerService.getPlannerMetrics();

    const rows = tasks.map(task => {
        // Phase 3: Get review and planner data for each task
        const reviewSummary = reviewService.getTaskReviewSummary(task.id);
        const plannerResult = plannerService.getPlannerResultForTask(task.id);

        return `
        <tr class="hover:bg-gray-50 cursor-pointer" onclick="window.location.href='/task/${task.id}'">
            <td class="px-2 py-1 text-xs">${task.id}</td>
            <td class="px-2 py-1 text-xs">${task.type}</td>
            <td class="px-2 py-1 text-xs">${escapeHtml(task.description)}</td>
            <td class="px-2 py-1 text-xs"><span class="rounded px-2 py-1 ${statusColors[task.status] || ''}">${task.status}</span></td>
            <td class="px-2 py-1 text-xs">${reviewSummary.latest_review ? reviewService.getPassFailBadge(reviewSummary.latest_review.passed) : ''}</td>
            <td class="px-2 py-1 text-xs">${reviewSummary.latest_review ? reviewService.getScoreBadge(reviewSummary.latest_review.score) : ''}</td>
            <td class="px-2 py-1 text-xs">${plannerResult ? plannerService.getContextUsageBadge(plannerResult.similar_tasks_used) : ''}</td>
            <td class="px-2 py-1 text-xs">${task.created_at}</td>
            <td class="px-2 py-1 text-xs">${task.started_at || ''}</td>
            <td class="px-2 py-1 text-xs">${task.finished_at || ''}</td>
            <td class="px-2 py-1 text-xs">${task.error_message || ''}</td>
        </tr>
        `;
    }).join('');

    // List files in incoming folder
    let incomingFiles: string[] = [];
    try {
        incomingFiles = await readdir(config.paths.incoming);
    } catch (e) {
        incomingFiles = ['(Error reading incoming folder)'];
    }
    const inboxSection = `
        <div class="mb-6">
            <h2 class="text-lg font-semibold mb-2">Inbox (incoming/)</h2>
            <ul class="list-disc ml-6">
                ${incomingFiles.length === 0 ? '<li class="text-green-600">Inbox is empty! 🎉</li>' : incomingFiles.map(f => `<li>${f}</li>`).join('')}
            </ul>
        </div>
    `;

    // Phase 3: Metrics section
    const metricsSection = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-lg font-semibold mb-4">📊 Review Metrics</h2>
                <div class="grid grid-cols-2 gap-4">
                    <div class="text-center">
                        <div class="text-2xl font-bold text-green-600">${reviewMetrics.passed_reviews}</div>
                        <div class="text-sm text-gray-600">Passed Reviews</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-red-600">${reviewMetrics.failed_reviews}</div>
                        <div class="text-sm text-gray-600">Failed Reviews</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-blue-600">${reviewMetrics.average_score.toFixed(1)}</div>
                        <div class="text-sm text-gray-600">Avg Score</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-purple-600">${reviewMetrics.total_reviews}</div>
                        <div class="text-sm text-gray-600">Total Reviews</div>
                    </div>
                </div>
                <div class="mt-4">
                    <div class="text-sm font-semibold mb-2">Score Distribution:</div>
                    <div class="flex space-x-2">
                        <span class="px-2 py-1 text-xs bg-green-500 text-white rounded">Excellent: ${reviewMetrics.score_distribution.excellent}</span>
                        <span class="px-2 py-1 text-xs bg-blue-500 text-white rounded">Good: ${reviewMetrics.score_distribution.good}</span>
                        <span class="px-2 py-1 text-xs bg-yellow-500 text-white rounded">Fair: ${reviewMetrics.score_distribution.fair}</span>
                        <span class="px-2 py-1 text-xs bg-red-500 text-white rounded">Poor: ${reviewMetrics.score_distribution.poor}</span>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-lg font-semibold mb-4">🧠 Planner Metrics</h2>
                <div class="grid grid-cols-2 gap-4">
                    <div class="text-center">
                        <div class="text-2xl font-bold text-blue-600">${plannerMetrics.total_plans}</div>
                        <div class="text-sm text-gray-600">Total Plans</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-green-600">${plannerMetrics.average_subtasks.toFixed(1)}</div>
                        <div class="text-sm text-gray-600">Avg Subtasks</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-purple-600">${plannerMetrics.success_rate_by_context.with_similar_tasks}%</div>
                        <div class="text-sm text-gray-600">Success w/ Context</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-orange-600">${plannerMetrics.success_rate_by_context.without_similar_tasks}%</div>
                        <div class="text-sm text-gray-600">Success w/o Context</div>
                    </div>
                </div>
                <div class="mt-4">
                    <div class="text-sm font-semibold mb-2">Common Patterns:</div>
                    <div class="flex flex-wrap gap-1">
                        ${plannerMetrics.most_common_patterns.map(pattern =>
        `<span class="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded">${pattern}</span>`
    ).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50">
    <div class="container mx-auto py-8">
        <h1 class="text-2xl font-bold mb-4">🎯 Task Dashboard - Phase 3 Enhanced</h1>
        ${inboxSection}
        ${metricsSection}
        <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200">
                <h2 class="text-lg font-semibold">📋 Task List</h2>
            </div>
            <table class="min-w-full">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-2 py-1 text-xs text-left">ID</th>
                        <th class="px-2 py-1 text-xs text-left">Type</th>
                        <th class="px-2 py-1 text-xs text-left">Description</th>
                        <th class="px-2 py-1 text-xs text-left">Status</th>
                        <th class="px-2 py-1 text-xs text-left">Review</th>
                        <th class="px-2 py-1 text-xs text-left">Score</th>
                        <th class="px-2 py-1 text-xs text-left">Context</th>
                        <th class="px-2 py-1 text-xs text-left">Created</th>
                        <th class="px-2 py-1 text-xs text-left">Started</th>
                        <th class="px-2 py-1 text-xs text-left">Finished</th>
                        <th class="px-2 py-1 text-xs text-left">Error</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;

    // Generate main dashboard
    const outPath = join(config.paths.dashboard, 'index.html');
    await writeFile(outPath, html, 'utf-8');

    // Generate task detail pages
    for (const task of tasks) {
        try {
            const detailHtml = await generateTaskDetailPage(task.id);
            const detailPath = join(config.paths.dashboard, `task-${task.id}.html`);
            await writeFile(detailPath, detailHtml, 'utf-8');
        } catch (error) {
            await logger.error('Failed to generate task detail page', {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
} 
