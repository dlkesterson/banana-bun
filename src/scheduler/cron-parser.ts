/**
 * Cron Expression Parser - Native implementation without external dependencies
 * Supports standard 5-field cron expressions: minute hour day month dayOfWeek
 */

import type { CronComponents, CronValidationResult } from '../types/periodic';
import { logger } from '../utils/logger';

export class CronParser {
    private static readonly MINUTE_RANGE = [0, 59];
    private static readonly HOUR_RANGE = [0, 23];
    private static readonly DAY_RANGE = [1, 31];
    private static readonly MONTH_RANGE = [1, 12];
    private static readonly DOW_RANGE = [0, 6]; // 0 = Sunday

    private static readonly MONTH_NAMES = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
    };

    private static readonly DOW_NAMES = {
        'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6
    };

    /**
     * Parse and validate a cron expression
     */
    static parse(cronExpression: string): CronValidationResult {
        try {
            const trimmed = cronExpression.trim();
            if (!trimmed) {
                return { valid: false, errors: ['Cron expression cannot be empty'] };
            }

            const parts = trimmed.split(/\s+/);
            if (parts.length !== 5) {
                return { 
                    valid: false, 
                    errors: [`Cron expression must have exactly 5 fields, got ${parts.length}`] 
                };
            }

            const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

            // Ensure all parts are defined
            if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
                return {
                    valid: false,
                    errors: ['All cron fields must be defined']
                };
            }

            const components: CronComponents = { minute, hour, dayOfMonth, month, dayOfWeek };

            const errors: string[] = [];

            // Validate each component
            this.validateField(minute!, 'minute', this.MINUTE_RANGE, errors);
            this.validateField(hour!, 'hour', this.HOUR_RANGE, errors);
            this.validateField(dayOfMonth!, 'day', this.DAY_RANGE, errors);
            this.validateField(month!, 'month', this.MONTH_RANGE, errors, this.MONTH_NAMES);
            this.validateField(dayOfWeek!, 'dayOfWeek', this.DOW_RANGE, errors, this.DOW_NAMES);

            if (errors.length > 0) {
                return { valid: false, errors };
            }

            // Generate next few runs to verify the expression works
            const nextRuns = this.getNextRuns(components, new Date(), 3);

            return { valid: true, errors: [], nextRuns };
        } catch (error) {
            return { 
                valid: false, 
                errors: [`Failed to parse cron expression: ${error instanceof Error ? error.message : String(error)}`] 
            };
        }
    }

    /**
     * Get the next execution time for a cron expression
     */
    static getNextExecution(cronExpression: string, fromDate: Date = new Date(), timezone: string = 'UTC'): Date | null {
        const parseResult = this.parse(cronExpression);
        if (!parseResult.valid) {
            logger.warn('Invalid cron expression', { cronExpression, errors: parseResult.errors });
            return null;
        }

        const parts = cronExpression.trim().split(/\s+/);
        if (parts.length !== 5) {
            logger.warn('Invalid cron expression format', { cronExpression });
            return null;
        }

        const components: CronComponents = {
            minute: parts[0]!,
            hour: parts[1]!,
            dayOfMonth: parts[2]!,
            month: parts[3]!,
            dayOfWeek: parts[4]!
        };

        return this.calculateNextRun(components, fromDate, timezone);
    }

    /**
     * Get multiple next execution times
     */
    static getNextRuns(components: CronComponents, fromDate: Date, count: number = 5): Date[] {
        const runs: Date[] = [];
        let currentDate = new Date(fromDate);

        for (let i = 0; i < count; i++) {
            const nextRun = this.calculateNextRun(components, currentDate);
            if (!nextRun) break;
            
            runs.push(nextRun);
            currentDate = new Date(nextRun.getTime() + 60000); // Add 1 minute to avoid same result
        }

        return runs;
    }

    /**
     * Calculate the next run time for given cron components
     */
    private static calculateNextRun(components: CronComponents, fromDate: Date, timezone: string = 'UTC'): Date | null {
        // Start from the next minute to avoid immediate execution
        const startDate = new Date(fromDate);
        startDate.setSeconds(0, 0);
        startDate.setMinutes(startDate.getMinutes() + 1);

        // Try up to 4 years in the future to find a match
        const maxDate = new Date(startDate);
        maxDate.setFullYear(maxDate.getFullYear() + 4);

        let current = new Date(startDate);

        while (current <= maxDate) {
            if (this.matchesSchedule(current, components)) {
                return current;
            }
            current.setMinutes(current.getMinutes() + 1);
        }

        return null; // No match found within reasonable timeframe
    }

    /**
     * Check if a date matches the cron schedule
     */
    private static matchesSchedule(date: Date, components: CronComponents): boolean {
        const minute = date.getMinutes();
        const hour = date.getHours();
        const dayOfMonth = date.getDate();
        const month = date.getMonth() + 1; // JavaScript months are 0-based
        const dayOfWeek = date.getDay();

        return (
            this.matchesField(minute, components.minute, this.MINUTE_RANGE) &&
            this.matchesField(hour, components.hour, this.HOUR_RANGE) &&
            this.matchesField(month, components.month, this.MONTH_RANGE, this.MONTH_NAMES) &&
            this.matchesDayFields(dayOfMonth, dayOfWeek, components.dayOfMonth, components.dayOfWeek)
        );
    }

    /**
     * Handle day of month and day of week matching (special case)
     */
    private static matchesDayFields(dayOfMonth: number, dayOfWeek: number, domField: string, dowField: string): boolean {
        const domMatches = this.matchesField(dayOfMonth, domField, this.DAY_RANGE);
        const dowMatches = this.matchesField(dayOfWeek, dowField, this.DOW_RANGE, this.DOW_NAMES);

        // If both are wildcards, match
        if (domField === '*' && dowField === '*') {
            return true;
        }

        // If one is wildcard and other matches, match
        if (domField === '*') {
            return dowMatches;
        }
        if (dowField === '*') {
            return domMatches;
        }

        // If both are specified, either can match (OR logic)
        return domMatches || dowMatches;
    }

    /**
     * Check if a value matches a cron field
     */
    private static matchesField(value: number, field: string, range: number[], nameMap?: Record<string, number>): boolean {
        // Handle wildcards
        if (field === '*') {
            return true;
        }

        // Convert named values to numbers
        let normalizedField = field.toLowerCase();
        if (nameMap) {
            for (const [name, num] of Object.entries(nameMap)) {
                normalizedField = normalizedField.replace(new RegExp(name, 'g'), String(num));
            }
        }

        // Handle lists (comma-separated)
        if (normalizedField.includes(',')) {
            const values = normalizedField.split(',');
            return values.some(v => this.matchesField(value, v.trim(), range));
        }

        // Handle ranges
        if (normalizedField.includes('-')) {
            const parts = normalizedField.split('-').map(v => parseInt(v.trim()));
            const start = parts[0];
            const end = parts[1];
            if (parts.length !== 2 || isNaN(start!) || isNaN(end!)) {
                return false;
            }
            return value >= start! && value <= end!;
        }

        // Handle steps
        if (normalizedField.includes('/')) {
            const stepParts = normalizedField.split('/');
            const rangeOrWildcard = stepParts[0];
            const step = stepParts[1];

            if (!rangeOrWildcard || !step) {
                return false;
            }

            const stepValue = parseInt(step);
            if (isNaN(stepValue) || stepValue <= 0) {
                return false;
            }

            if (rangeOrWildcard === '*') {
                return (value - range[0]!) % stepValue === 0;
            } else if (rangeOrWildcard.includes('-')) {
                const rangeParts = rangeOrWildcard.split('-').map(v => parseInt(v.trim()));
                const start = rangeParts[0];
                const end = rangeParts[1];
                if (rangeParts.length !== 2 || isNaN(start!) || isNaN(end!)) {
                    return false;
                }
                return value >= start! && value <= end! && (value - start!) % stepValue === 0;
            } else {
                const start = parseInt(rangeOrWildcard);
                if (isNaN(start)) {
                    return false;
                }
                return (value - start) % stepValue === 0 && value >= start;
            }
        }

        // Handle exact match
        const numValue = parseInt(normalizedField);
        return value === numValue;
    }

    /**
     * Validate a single cron field
     */
    private static validateField(
        field: string, 
        fieldName: string, 
        range: number[], 
        errors: string[], 
        nameMap?: Record<string, number>
    ): void {
        if (!field || field.trim() === '') {
            errors.push(`${fieldName} field cannot be empty`);
            return;
        }

        const trimmed = field.trim();

        // Check for invalid characters
        if (!/^[0-9*,\-\/a-zA-Z]+$/.test(trimmed)) {
            errors.push(`${fieldName} field contains invalid characters: ${trimmed}`);
            return;
        }

        try {
            this.validateFieldValue(trimmed, fieldName, range, nameMap, errors);
        } catch (error) {
            errors.push(`${fieldName} field validation error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Validate field value ranges and syntax
     */
    private static validateFieldValue(
        field: string, 
        fieldName: string, 
        range: number[], 
        nameMap: Record<string, number> | undefined, 
        errors: string[]
    ): void {
        if (field === '*') {
            return; // Wildcard is always valid
        }

        // Handle lists
        if (field.includes(',')) {
            const values = field.split(',');
            for (const value of values) {
                this.validateFieldValue(value.trim(), fieldName, range, nameMap, errors);
            }
            return;
        }

        // Handle steps
        if (field.includes('/')) {
            const stepParts = field.split('/');
            const rangeOrWildcard = stepParts[0];
            const step = stepParts[1];

            if (!rangeOrWildcard || !step) {
                errors.push(`${fieldName} invalid step format: ${field}`);
                return;
            }

            const stepValue = parseInt(step);
            if (isNaN(stepValue) || stepValue <= 0) {
                errors.push(`${fieldName} step value must be a positive integer: ${step}`);
                return;
            }

            if (rangeOrWildcard !== '*') {
                this.validateFieldValue(rangeOrWildcard, fieldName, range, nameMap, errors);
            }
            return;
        }

        // Handle ranges
        if (field.includes('-')) {
            const rangeParts = field.split('-');
            const start = rangeParts[0];
            const end = rangeParts[1];

            if (!start || !end) {
                errors.push(`${fieldName} invalid range format: ${field}`);
                return;
            }

            this.validateSingleValue(start.trim(), fieldName, range, nameMap, errors);
            this.validateSingleValue(end.trim(), fieldName, range, nameMap, errors);

            const startNum = this.parseValue(start.trim(), nameMap);
            const endNum = this.parseValue(end.trim(), nameMap);

            if (startNum !== null && endNum !== null && startNum > endNum) {
                errors.push(`${fieldName} range start (${startNum}) cannot be greater than end (${endNum})`);
            }
            return;
        }

        // Handle single value
        this.validateSingleValue(field, fieldName, range, nameMap, errors);
    }

    /**
     * Validate a single numeric or named value
     */
    private static validateSingleValue(
        value: string, 
        fieldName: string, 
        range: number[], 
        nameMap: Record<string, number> | undefined, 
        errors: string[]
    ): void {
        const numValue = this.parseValue(value, nameMap);
        
        if (numValue === null) {
            errors.push(`${fieldName} invalid value: ${value}`);
            return;
        }

        if (numValue < range[0]! || numValue > range[1]!) {
            errors.push(`${fieldName} value ${numValue} is out of range [${range[0]}-${range[1]}]`);
        }
    }

    /**
     * Parse a value (numeric or named) to number
     */
    private static parseValue(value: string, nameMap?: Record<string, number>): number | null {
        // Try named value first
        if (nameMap && nameMap[value.toLowerCase()]) {
            return nameMap[value.toLowerCase()] ?? null;
        }

        // Try numeric value
        const numValue = parseInt(value);
        if (isNaN(numValue)) {
            return null;
        }

        return numValue;
    }
}
