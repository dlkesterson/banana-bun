import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';
import type { LogEntry } from '../types';

interface LogData {
    [key: string]: any;
}

export const logger = {
    async info(message: string, data?: LogData) {
        await this._log('INFO', message, data);
    },

    async error(message: string, data?: LogData) {
        await this._log('ERROR', message, data);
    },

    async warn(message: string, data?: LogData) {
        await this._log('WARN', message, data);
    },

    async debug(message: string, data?: LogData) {
        await this._log('DEBUG', message, data);
    },

    async taskStart(taskId: string, tool: string, data?: LogData) {
        await this._log('TASK_START', `Task ${taskId} started`, {
            taskId,
            tool,
            ...data
        });
    },

    async taskComplete(taskId: string, result: any) {
        await this._log('TASK_COMPLETE', `Task ${taskId} completed`, {
            taskId,
            result
        });
    },

    async taskError(taskId: string, error: any) {
        await this._log('TASK_ERROR', `Task ${taskId} failed`, {
            taskId,
            error: error instanceof Error ? error.message : String(error)
        });
    },

    async _log(level: string, message: string, data?: LogData) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            time: timestamp,
            level,
            message,
            ...data
        };

        // Ensure logs directory exists
        await mkdir(config.paths.logs, { recursive: true });

        // Write to log file
        const logPath = join(config.paths.logs, `${new Date().toISOString().split('T')[0]}.log`);
        await appendFile(logPath, JSON.stringify(logEntry) + '\n', 'utf-8');

        // Also log to console
        console.log(`[${timestamp}] ${level}: ${message}`, data ? data : '');
    }
};
