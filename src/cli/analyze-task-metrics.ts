#!/usr/bin/env bun

/**
 * Banana Bun CLI tool for analyzing task metrics and performance
 * 
 * Usage:
 *   bun run src/cli/analyze-task-metrics.ts
 *   bun run src/cli/analyze-task-metrics.ts --hours 48
 *   bun run src/cli/analyze-task-metrics.ts --trends --days 14
 *   bun run src/cli/analyze-task-metrics.ts --bottlenecks --threshold 60000
 */

import { parseArgs } from 'util';
import { initDatabase } from '../db';
import { analyticsLogger } from '../analytics/logger';

interface CliOptions {
    hours?: number;
    trends?: boolean;
    days?: number;
    bottlenecks?: boolean;
    threshold?: number;
    cleanup?: boolean;
    keepDays?: number;
    help?: boolean;
}

function printUsage() {
    console.log(`
Banana Bun Task Metrics Analysis Tool

Usage: bun run src/cli/analyze-task-metrics.ts [options]

Options:
  --hours <number>          Analyze tasks from last N hours (default: 24)
  --trends                  Show task trends over time
  --days <number>           Number of days for trend analysis (default: 7)
  --bottlenecks             Detect performance bottlenecks
  --threshold <ms>          Threshold for slow tasks in milliseconds (default: 30000)
  --cleanup                 Clean up old task logs
  --keep-days <number>      Days to keep when cleaning up (default: 30)
  --help, -h                Show this help message

Examples:
  # Basic analytics for last 24 hours
  bun run src/cli/analyze-task-metrics.ts

  # Analyze last 48 hours
  bun run src/cli/analyze-task-metrics.ts --hours 48

  # Show trends for last 14 days
  bun run src/cli/analyze-task-metrics.ts --trends --days 14

  # Detect bottlenecks with 1-minute threshold
  bun run src/cli/analyze-task-metrics.ts --bottlenecks --threshold 60000

  # Clean up logs older than 30 days
  bun run src/cli/analyze-task-metrics.ts --cleanup --keep-days 30
`);
}

function parseCliArgs(): CliOptions {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            hours: { type: 'string' },
            trends: { type: 'boolean', default: false },
            days: { type: 'string' },
            bottlenecks: { type: 'boolean', default: false },
            threshold: { type: 'string' },
            cleanup: { type: 'boolean', default: false },
            'keep-days': { type: 'string' },
            help: { type: 'boolean', short: 'h', default: false }
        }
    });

    const options: CliOptions = {
        trends: values.trends,
        bottlenecks: values.bottlenecks,
        cleanup: values.cleanup,
        help: values.help
    };

    if (values.hours) {
        const hours = parseInt(values.hours, 10);
        if (isNaN(hours) || hours < 1 || hours > 168) { // Max 1 week
            throw new Error(`Invalid hours: ${values.hours}. Must be between 1 and 168`);
        }
        options.hours = hours;
    }

    if (values.days) {
        const days = parseInt(values.days, 10);
        if (isNaN(days) || days < 1 || days > 90) { // Max 3 months
            throw new Error(`Invalid days: ${values.days}. Must be between 1 and 90`);
        }
        options.days = days;
    }

    if (values.threshold) {
        const threshold = parseInt(values.threshold, 10);
        if (isNaN(threshold) || threshold < 1000) { // Min 1 second
            throw new Error(`Invalid threshold: ${values.threshold}. Must be at least 1000ms`);
        }
        options.threshold = threshold;
    }

    if (values['keep-days']) {
        const keepDays = parseInt(values['keep-days'], 10);
        if (isNaN(keepDays) || keepDays < 1 || keepDays > 365) {
            throw new Error(`Invalid keep-days: ${values['keep-days']}. Must be between 1 and 365`);
        }
        options.keepDays = keepDays;
    }

    return options;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
}

function formatPercentage(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

async function displayBasicAnalytics(hours: number): Promise<void> {
    console.log(`📊 Task Analytics (Last ${hours} hours)`);
    console.log('=' .repeat(60));

    const analytics = await analyticsLogger.getTaskAnalytics(hours);

    console.log(`\n📈 Overall Statistics:`);
    console.log(`   Total Tasks: ${analytics.total_tasks}`);
    console.log(`   Success Rate: ${formatPercentage(analytics.success_rate)}`);
    console.log(`   Average Duration: ${formatDuration(analytics.average_duration_ms)}`);

    if (analytics.most_common_failures.length > 0) {
        console.log(`\n❌ Most Common Failures:`);
        analytics.most_common_failures.forEach((failure, index) => {
            console.log(`   ${index + 1}. ${failure.error_reason} (${failure.count} times, ${formatPercentage(failure.percentage / 100)})`);
        });
    }

    if (analytics.task_type_stats.length > 0) {
        console.log(`\n🔧 Task Type Performance:`);
        analytics.task_type_stats.forEach(stat => {
            console.log(`   ${stat.task_type}:`);
            console.log(`      Count: ${stat.count}`);
            console.log(`      Success Rate: ${formatPercentage(stat.success_rate)}`);
            console.log(`      Avg Duration: ${formatDuration(stat.avg_duration_ms)}`);
        });
    }

    if (analytics.bottlenecks.length > 0) {
        console.log(`\n🐌 Performance Bottlenecks:`);
        analytics.bottlenecks.forEach(bottleneck => {
            console.log(`   ${bottleneck.task_type}:`);
            console.log(`      Slow Tasks: ${bottleneck.slow_task_count}`);
            console.log(`      Avg Duration: ${formatDuration(bottleneck.avg_duration_ms)}`);
            console.log(`      Max Duration: ${formatDuration(bottleneck.max_duration_ms)}`);
        });
    }
}

async function displayTrends(days: number): Promise<void> {
    console.log(`\n📈 Task Trends (Last ${days} days)`);
    console.log('=' .repeat(60));

    const trends = await analyticsLogger.getTaskTrends(days);

    if (trends.length === 0) {
        console.log('No trend data available.');
        return;
    }

    console.log(`\n📅 Daily Statistics:`);
    trends.forEach(trend => {
        const successRate = trend.total_tasks > 0 ? (trend.successful_tasks / trend.total_tasks) : 0;
        console.log(`   ${trend.date}:`);
        console.log(`      Total: ${trend.total_tasks}, Success: ${trend.successful_tasks}, Failed: ${trend.failed_tasks}`);
        console.log(`      Success Rate: ${formatPercentage(successRate)}`);
        console.log(`      Avg Duration: ${formatDuration(trend.avg_duration_ms)}`);
    });

    // Calculate overall trends
    if (trends.length >= 2) {
        const recent = trends[0];
        const older = trends[trends.length - 1];
        
        const taskTrend = recent.total_tasks - older.total_tasks;
        const durationTrend = recent.avg_duration_ms - older.avg_duration_ms;
        
        console.log(`\n📊 Trend Analysis:`);
        console.log(`   Task Volume: ${taskTrend > 0 ? '📈' : taskTrend < 0 ? '📉' : '➡️'} ${taskTrend > 0 ? '+' : ''}${taskTrend} tasks/day`);
        console.log(`   Performance: ${durationTrend < 0 ? '📈' : durationTrend > 0 ? '📉' : '➡️'} ${durationTrend > 0 ? '+' : ''}${formatDuration(Math.abs(durationTrend))} avg duration`);
    }
}

async function displayBottlenecks(threshold: number): Promise<void> {
    console.log(`\n🐌 Performance Bottleneck Analysis (>${formatDuration(threshold)})`);
    console.log('=' .repeat(60));

    const bottlenecks = await analyticsLogger.detectBottlenecks(threshold);

    if (bottlenecks.length === 0) {
        console.log('✅ No significant bottlenecks detected!');
        return;
    }

    console.log(`\n⚠️  Detected ${bottlenecks.length} bottlenecks:`);
    bottlenecks.forEach((bottleneck, index) => {
        console.log(`\n${index + 1}. ${bottleneck.task_type}:`);
        console.log(`   🐌 Slow Tasks: ${bottleneck.slow_tasks}`);
        console.log(`   ⏱️  Avg Duration: ${formatDuration(bottleneck.avg_duration_ms)}`);
        console.log(`   🔥 Max Duration: ${formatDuration(bottleneck.max_duration_ms)}`);
        console.log(`   💡 Recommendation: ${bottleneck.recommendation}`);
    });

    console.log(`\n🔧 General Recommendations:`);
    console.log(`   • Consider breaking long-running tasks into smaller chunks`);
    console.log(`   • Check for resource constraints (CPU, memory, I/O)`);
    console.log(`   • Review task dependencies and parallelization opportunities`);
    console.log(`   • Monitor external service response times`);
}

async function performCleanup(keepDays: number): Promise<void> {
    console.log(`\n🧹 Cleaning up task logs older than ${keepDays} days...`);
    
    const deletedRows = await analyticsLogger.cleanupOldLogs(keepDays);
    
    if (deletedRows > 0) {
        console.log(`✅ Cleaned up ${deletedRows} old log entries`);
    } else {
        console.log(`✅ No old logs to clean up`);
    }
}

async function main() {
    try {
        const options = parseCliArgs();

        if (options.help) {
            printUsage();
            process.exit(0);
        }

        console.log("📊 Banana Bun Task Metrics Analysis Tool");
        console.log('====================================');

        // Initialize database
        await initDatabase();
        console.log('✅ Database initialized');

        // Perform cleanup if requested
        if (options.cleanup) {
            await performCleanup(options.keepDays || 30);
            console.log();
        }

        // Show basic analytics unless only specific analysis requested
        if (!options.trends && !options.bottlenecks && !options.cleanup) {
            await displayBasicAnalytics(options.hours || 24);
        }

        // Show trends if requested
        if (options.trends) {
            await displayTrends(options.days || 7);
        }

        // Show bottlenecks if requested
        if (options.bottlenecks) {
            await displayBottlenecks(options.threshold || 30000);
        }

        console.log('\n' + '=' .repeat(60));
        console.log('📊 Analysis complete!');

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
