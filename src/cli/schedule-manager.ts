#!/usr/bin/env bun

/**
 * Schedule Manager CLI Tool
 * 
 * Usage: bun run src/cli/schedule-manager.ts [command] [options]
 * 
 * Commands:
 *   create <task-id> <cron> [options]  - Create a new schedule
 *   list [options]                     - List all schedules
 *   enable <schedule-id>               - Enable a schedule
 *   disable <schedule-id>              - Disable a schedule
 *   delete <schedule-id>               - Delete a schedule
 *   validate <cron>                    - Validate a cron expression
 *   metrics                            - Show scheduler metrics
 */

import { Database } from 'bun:sqlite';
import { config } from '../config';
import { TaskScheduler } from '../scheduler/task-scheduler';
import { CronParser } from '../scheduler/cron-parser';
import { logger } from '../utils/logger';
import type { COMMON_CRON_EXPRESSIONS, COMMON_TIMEZONES } from '../types/periodic';

class ScheduleManagerCLI {
    private db: Database;
    private scheduler: TaskScheduler;

    constructor() {
        this.db = new Database(config.paths.database);
        this.scheduler = new TaskScheduler(this.db);
    }

    async run(args: string[]): Promise<void> {
        const command = args[0];

        try {
            switch (command) {
                case 'create':
                    await this.createSchedule(args.slice(1));
                    break;
                case 'list':
                    await this.listSchedules(args.slice(1));
                    break;
                case 'enable':
                    if (!args[1]) {
                        throw new Error('Schedule ID is required for enable command');
                    }
                    await this.enableSchedule(args[1]);
                    break;
                case 'disable':
                    if (!args[1]) {
                        throw new Error('Schedule ID is required for disable command');
                    }
                    await this.disableSchedule(args[1]);
                    break;
                case 'delete':
                    if (!args[1]) {
                        throw new Error('Schedule ID is required for delete command');
                    }
                    await this.deleteSchedule(args[1]);
                    break;
                case 'validate':
                    if (!args[1]) {
                        throw new Error('Cron expression is required for validate command');
                    }
                    await this.validateCron(args[1]);
                    break;
                case 'metrics':
                    await this.showMetrics();
                    break;
                case 'help':
                case '--help':
                case '-h':
                    this.showHelp();
                    break;
                default:
                    console.error(`Unknown command: ${command}`);
                    this.showHelp();
                    process.exit(1);
            }
        } catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    }

    private async createSchedule(args: string[]): Promise<void> {
        if (args.length < 2) {
            console.error('Usage: create <task-id> <cron> [--timezone=UTC] [--disabled] [--max-instances=1] [--overlap=skip]');
            process.exit(1);
        }

        const taskId = parseInt(args[0]!);
        const cronExpression = args[1]!;

        // Parse options
        const options = this.parseOptions(args.slice(2));
        const timezone = options.timezone || 'UTC';
        const enabled = !options.disabled;
        const maxInstances = parseInt(options['max-instances'] || '1');
        const overlapPolicy = options.overlap || 'skip';

        if (isNaN(taskId)) {
            throw new Error('Task ID must be a number');
        }

        // Validate cron expression
        const validation = CronParser.parse(cronExpression);
        if (!validation.valid) {
            throw new Error(`Invalid cron expression: ${validation.errors.join(', ')}`);
        }

        // Get the task
        const task = this.db.query('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
        if (!task) {
            throw new Error(`Task with ID ${taskId} not found`);
        }

        // Create schedule
        const scheduleId = await this.scheduler.createSchedule(task, cronExpression, {
            timezone,
            enabled,
            maxInstances,
            overlapPolicy: overlapPolicy as 'skip' | 'queue' | 'replace'
        });

        console.log(`✅ Schedule created successfully`);
        console.log(`   Schedule ID: ${scheduleId}`);
        console.log(`   Task ID: ${taskId}`);
        console.log(`   Cron: ${cronExpression}`);
        console.log(`   Timezone: ${timezone}`);
        console.log(`   Enabled: ${enabled}`);
        console.log(`   Max Instances: ${maxInstances}`);
        console.log(`   Overlap Policy: ${overlapPolicy}`);

        if (validation.nextRuns && validation.nextRuns.length > 0) {
            console.log(`   Next runs:`);
            validation.nextRuns.slice(0, 3).forEach((run, i) => {
                console.log(`     ${i + 1}. ${run.toISOString()}`);
            });
        }
    }

    private async listSchedules(args: string[]): Promise<void> {
        const options = this.parseOptions(args);
        const showAll = options.all;

        let query = `
            SELECT 
                s.id,
                s.template_task_id,
                t.type,
                t.description,
                s.cron_expression,
                s.timezone,
                s.enabled,
                s.next_run_at,
                s.last_run_at,
                s.run_count,
                s.max_instances,
                s.overlap_policy
            FROM task_schedules s
            JOIN tasks t ON s.template_task_id = t.id
        `;

        if (!showAll) {
            query += ' WHERE s.enabled = TRUE';
        }

        query += ' ORDER BY s.next_run_at ASC';

        const schedules = this.db.query(query).all() as any[];

        if (schedules.length === 0) {
            console.log('No schedules found');
            return;
        }

        console.log(`📅 Found ${schedules.length} schedule(s):\n`);

        for (const schedule of schedules) {
            const status = schedule.enabled ? '🟢 Enabled' : '🔴 Disabled';
            console.log(`Schedule ID: ${schedule.id} ${status}`);
            console.log(`  Task: ${schedule.type} (ID: ${schedule.template_task_id})`);
            console.log(`  Description: ${schedule.description || 'No description'}`);
            console.log(`  Cron: ${schedule.cron_expression}`);
            console.log(`  Timezone: ${schedule.timezone}`);
            console.log(`  Next run: ${schedule.next_run_at}`);
            console.log(`  Last run: ${schedule.last_run_at || 'Never'}`);
            console.log(`  Run count: ${schedule.run_count}`);
            console.log(`  Max instances: ${schedule.max_instances}`);
            console.log(`  Overlap policy: ${schedule.overlap_policy}`);
            console.log('');
        }
    }

    private async enableSchedule(scheduleIdStr: string): Promise<void> {
        const scheduleId = parseInt(scheduleIdStr);
        if (isNaN(scheduleId)) {
            throw new Error('Schedule ID must be a number');
        }

        await this.scheduler.toggleSchedule(scheduleId, true);
        console.log(`✅ Schedule ${scheduleId} enabled`);
    }

    private async disableSchedule(scheduleIdStr: string): Promise<void> {
        const scheduleId = parseInt(scheduleIdStr);
        if (isNaN(scheduleId)) {
            throw new Error('Schedule ID must be a number');
        }

        await this.scheduler.toggleSchedule(scheduleId, false);
        console.log(`✅ Schedule ${scheduleId} disabled`);
    }

    private async deleteSchedule(scheduleIdStr: string): Promise<void> {
        const scheduleId = parseInt(scheduleIdStr);
        if (isNaN(scheduleId)) {
            throw new Error('Schedule ID must be a number');
        }

        // Confirm deletion
        console.log(`⚠️  This will permanently delete schedule ${scheduleId} and all its instances.`);
        console.log('Type "yes" to confirm:');
        
        // In a real CLI, you'd use readline, but for simplicity:
        const confirmation = process.argv.includes('--force') ? 'yes' : 'no';
        
        if (confirmation !== 'yes' && !process.argv.includes('--force')) {
            console.log('❌ Deletion cancelled. Use --force to skip confirmation.');
            return;
        }

        await this.scheduler.deleteSchedule(scheduleId);
        console.log(`✅ Schedule ${scheduleId} deleted`);
    }

    private async validateCron(cronExpression: string): Promise<void> {
        if (!cronExpression) {
            throw new Error('Cron expression is required');
        }

        const validation = CronParser.parse(cronExpression);
        
        if (validation.valid) {
            console.log(`✅ Cron expression is valid: ${cronExpression}`);
            
            if (validation.nextRuns && validation.nextRuns.length > 0) {
                console.log('\n📅 Next execution times:');
                validation.nextRuns.forEach((run, i) => {
                    console.log(`  ${i + 1}. ${run.toISOString()} (${run.toLocaleString()})`);
                });
            }
        } else {
            console.log(`❌ Cron expression is invalid: ${cronExpression}`);
            console.log('\nErrors:');
            validation.errors.forEach(error => {
                console.log(`  - ${error}`);
            });
        }

        // Show common examples
        console.log('\n💡 Common cron expressions:');
        console.log('  */5 * * * *     - Every 5 minutes');
        console.log('  0 * * * *       - Every hour');
        console.log('  0 0 * * *       - Daily at midnight');
        console.log('  0 12 * * *      - Daily at noon');
        console.log('  0 0 * * 0       - Weekly on Sunday');
        console.log('  0 0 1 * *       - Monthly on the 1st');
    }

    private async showMetrics(): Promise<void> {
        const metrics = await this.scheduler.getMetrics();

        console.log('📊 Scheduler Metrics\n');
        console.log(`Total schedules: ${metrics.totalSchedules}`);
        console.log(`Active schedules: ${metrics.activeSchedules}`);
        console.log(`Scheduled instances: ${metrics.scheduledInstances}`);
        console.log(`Running instances: ${metrics.runningInstances}`);
        console.log(`Completed today: ${metrics.completedToday}`);
        console.log(`Failed today: ${metrics.failedToday}`);

        if (metrics.upcomingRuns.length > 0) {
            console.log('\n📅 Upcoming runs:');
            metrics.upcomingRuns.slice(0, 5).forEach((run, i) => {
                console.log(`  ${i + 1}. Schedule ${run.scheduleId} at ${run.scheduledFor} (${run.cronExpression})`);
            });
        }
    }

    private parseOptions(args: string[]): Record<string, string> {
        const options: Record<string, string> = {};
        
        for (const arg of args) {
            if (arg.startsWith('--')) {
                const [key, value] = arg.slice(2).split('=');
                if (key) {
                    options[key] = value || 'true';
                }
            }
        }
        
        return options;
    }

    private showHelp(): void {
        console.log(`
Schedule Manager CLI

Usage: bun run src/cli/schedule-manager.ts [command] [options]

Commands:
  create <task-id> <cron> [options]  Create a new schedule
    Options:
      --timezone=UTC                   Set timezone (default: UTC)
      --disabled                       Create disabled schedule
      --max-instances=1                Maximum concurrent instances
      --overlap=skip                   Overlap policy (skip|queue|replace)

  list [options]                      List all schedules
    Options:
      --all                            Show disabled schedules too

  enable <schedule-id>                 Enable a schedule
  disable <schedule-id>                Disable a schedule
  delete <schedule-id>                 Delete a schedule
    Options:
      --force                          Skip confirmation

  validate <cron>                      Validate a cron expression
  metrics                              Show scheduler metrics
  help                                 Show this help message

Examples:
  # Create a daily schedule at 2 AM
  bun run src/cli/schedule-manager.ts create 123 "0 2 * * *"

  # Create a schedule every 15 minutes in EST
  bun run src/cli/schedule-manager.ts create 456 "*/15 * * * *" --timezone=America/New_York

  # List all schedules
  bun run src/cli/schedule-manager.ts list

  # Validate a cron expression
  bun run src/cli/schedule-manager.ts validate "0 */6 * * *"
        `);
    }
}

// CLI execution
if (import.meta.main) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('No command provided. Use --help for usage information.');
        process.exit(1);
    }

    const cli = new ScheduleManagerCLI();
    await cli.run(args);
}
