import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';
import { watch } from 'fs';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// Types for search logs functionality
export interface SearchMatch {
    file: string;
    line: string;
    lineNumber: number;
    timestamp?: string;
    level?: string;
    context?: {
        before: string[];
        after: string[];
    };
}

export interface SearchOptions {
    caseSensitive?: boolean;
    useRegex?: boolean;
    limit?: number;
    files?: string[];
    level?: string;
    startTime?: Date;
    endTime?: Date;
    contextLines?: number;
}

export interface SearchResult {
    success: boolean;
    matches: SearchMatch[];
    totalMatches?: number;
    filesSearched?: number;
    error?: string;
    searchTime?: number;
    warnings?: string[];
}

export interface AggregatedResult {
    success: boolean;
    summary: {
        total_matches: number;
        files_searched: number;
        by_level: Record<string, number>;
        by_file: Record<string, number>;
        time_range?: {
            start: string;
            end: string;
        };
    };
    matches: SearchMatch[];
    error?: string;
}

export interface AdvancedSearchCriteria {
    text: string;
    level?: string;
    startTime?: Date;
    endTime?: Date;
    files?: string[];
    contextLines?: number;
    limit?: number;
}

export interface SearchStatistics {
    total_searches: number;
    most_searched_terms: Array<{ term: string; count: number }>;
    average_response_time: number;
    cache_hit_rate?: number;
}

export interface LogWatcher {
    stop: () => void;
}

// Cache for frequent searches
const searchCache = new Map<string, { result: SearchResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Statistics tracking
const searchStats = {
    totalSearches: 0,
    searchTerms: new Map<string, number>(),
    responseTimes: [] as number[],
    cacheHits: 0
};

class SearchLogsService extends EventEmitter {
    private logsPath: string;

    constructor(logsPath?: string) {
        super();
        this.logsPath = logsPath || config.paths?.logs || '/tmp/logs';
    }

    // Method to update logs path (useful for testing)
    setLogsPath(path: string): void {
        this.logsPath = path;
    }

    async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
        const startTime = Date.now();

        try {
            // Validate regex if useRegex is true
            if (options.useRegex && query !== '') {
                try {
                    new RegExp(query);
                } catch (regexError) {
                    return {
                        success: false,
                        matches: [],
                        error: `Invalid regex pattern: ${query}`,
                        searchTime: Date.now() - startTime
                    };
                }
            }

            // Check cache first
            const cacheKey = JSON.stringify({ query, options });
            const cached = searchCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                searchStats.cacheHits++;
                return cached.result;
            }

            // Update statistics
            searchStats.totalSearches++;
            searchStats.searchTerms.set(query, (searchStats.searchTerms.get(query) || 0) + 1);

            const matches: SearchMatch[] = [];
            const warnings: string[] = [];
            let filesSearched = 0;

            // Get log files to search
            const logFiles = await this.getLogFiles(options.files);

            for (const file of logFiles) {
                try {
                    const fileMatches = await this.searchInFile(file, query, options);
                    matches.push(...fileMatches);
                    filesSearched++;

                    // Apply limit if specified
                    if (options.limit && matches.length >= options.limit) {
                        matches.splice(options.limit);
                        break;
                    }
                } catch (error) {
                    const warningMsg = `Failed to search in file ${file}: ${error instanceof Error ? error.message : String(error)}`;
                    warnings.push(warningMsg);
                    await logger.warn('Failed to search in file', { file, error });
                }
            }

            const searchTime = Date.now() - startTime;
            searchStats.responseTimes.push(searchTime);

            const result: SearchResult = {
                success: true,
                matches,
                totalMatches: matches.length,
                filesSearched,
                searchTime,
                warnings: warnings.length > 0 ? warnings : undefined
            };

            // Cache the result
            searchCache.set(cacheKey, { result, timestamp: Date.now() });

            return result;
        } catch (error) {
            const searchTime = Date.now() - startTime;
            searchStats.responseTimes.push(searchTime);

            return {
                success: false,
                matches: [],
                error: error instanceof Error ? error.message : String(error),
                searchTime
            };
        }
    }

    async searchByTaskId(taskId: number): Promise<SearchResult> {
        return this.search(`Task ${taskId}`, {
            useRegex: false,
            caseSensitive: false
        });
    }

    async searchByLevel(level: string): Promise<SearchResult> {
        return this.search('', {
            level: level.toUpperCase(),
            useRegex: false,
            caseSensitive: false
        });
    }

    async searchByTimeRange(startTime: Date, endTime: Date): Promise<SearchResult> {
        return this.search('', {
            startTime,
            endTime,
            useRegex: false,
            caseSensitive: false
        });
    }

    async aggregateResults(query: string, options: SearchOptions = {}): Promise<AggregatedResult> {
        try {
            const searchResult = await this.search(query, { ...options, limit: undefined });

            if (!searchResult.success) {
                return {
                    success: false,
                    summary: {
                        total_matches: 0,
                        files_searched: 0,
                        by_level: {},
                        by_file: {}
                    },
                    matches: [],
                    error: searchResult.error
                };
            }

            // Aggregate by level
            const byLevel: Record<string, number> = {};
            const byFile: Record<string, number> = {};
            let earliestTime: string | undefined;
            let latestTime: string | undefined;

            for (const match of searchResult.matches) {
                // Count by level
                if (match.level) {
                    byLevel[match.level] = (byLevel[match.level] || 0) + 1;
                }

                // Count by file
                byFile[match.file] = (byFile[match.file] || 0) + 1;

                // Track time range
                if (match.timestamp) {
                    if (!earliestTime || match.timestamp < earliestTime) {
                        earliestTime = match.timestamp;
                    }
                    if (!latestTime || match.timestamp > latestTime) {
                        latestTime = match.timestamp;
                    }
                }
            }

            return {
                success: true,
                summary: {
                    total_matches: searchResult.matches.length,
                    files_searched: searchResult.filesSearched || 0,
                    by_level: byLevel,
                    by_file: byFile,
                    time_range: earliestTime && latestTime ? {
                        start: earliestTime,
                        end: latestTime
                    } : undefined
                },
                matches: searchResult.matches
            };
        } catch (error) {
            return {
                success: false,
                summary: {
                    total_matches: 0,
                    files_searched: 0,
                    by_level: {},
                    by_file: {}
                },
                matches: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async advancedSearch(criteria: AdvancedSearchCriteria): Promise<SearchResult> {
        const options: SearchOptions = {
            level: criteria.level,
            startTime: criteria.startTime,
            endTime: criteria.endTime,
            files: criteria.files,
            contextLines: criteria.contextLines,
            limit: criteria.limit
        };

        return this.search(criteria.text, options);
    }

    async exportResults(matches: SearchMatch[], format: 'json' | 'csv' = 'json'): Promise<{ success: boolean; data: string; error?: string }> {
        try {
            if (format === 'csv') {
                const headers = ['File', 'Line Number', 'Timestamp', 'Level', 'Content'];
                const rows = matches.map(match => [
                    match.file,
                    match.lineNumber.toString(),
                    match.timestamp || '',
                    match.level || '',
                    match.line.replace(/"/g, '""') // Escape quotes for CSV
                ]);

                const csvData = [headers, ...rows].map(row =>
                    row.map(cell => `"${cell}"`).join(',')
                ).join('\n');

                return {
                    success: true,
                    data: csvData
                };
            }

            return {
                success: true,
                data: JSON.stringify(matches, null, 2)
            };
        } catch (error) {
            return {
                success: false,
                data: '',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async streamSearch(query: string, callback: (match: SearchMatch) => void, options: SearchOptions = {}): Promise<void> {
        try {
            const logFiles = await this.getLogFiles(options.files);

            for (const file of logFiles) {
                await this.streamSearchInFile(file, query, callback, options);
            }
        } catch (error) {
            await logger.error('Stream search failed', { error });
            throw error;
        }
    }

    async watchLogs(query: string, callback?: (match: SearchMatch) => void): Promise<LogWatcher> {
        const logFiles = await this.getLogFiles();
        const watchers: any[] = [];

        for (const file of logFiles) {
            try {
                const watcher = watch(join(this.logsPath, file), async (eventType) => {
                    if (eventType === 'change') {
                        // Search new content in the file
                        const matches = await this.searchInFile(file, query, {});
                        if (callback && matches.length > 0) {
                            matches.forEach(callback);
                        }
                    }
                });
                watchers.push(watcher);
            } catch (error) {
                await logger.warn('Failed to watch file', { file, error });
            }
        }

        return {
            stop: () => {
                watchers.forEach(watcher => {
                    try {
                        watcher.close();
                    } catch (error) {
                        // Ignore close errors
                    }
                });
            }
        };
    }

    async handleToolCall(toolRequest: any): Promise<SearchResult> {
        const { method, params } = toolRequest;

        if (method !== 'search_logs') {
            return {
                success: false,
                matches: [],
                error: `Unsupported method: ${method}`
            };
        }

        const { query, level, limit, files, caseSensitive, useRegex } = params;

        return this.search(query, {
            level,
            limit,
            files,
            caseSensitive,
            useRegex
        });
    }

    async getSearchStatistics(): Promise<SearchStatistics> {
        const avgResponseTime = searchStats.responseTimes.length > 0
            ? searchStats.responseTimes.reduce((a, b) => a + b, 0) / searchStats.responseTimes.length
            : 0;

        const mostSearchedTerms = Array.from(searchStats.searchTerms.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([term, count]) => ({ term, count }));

        const cacheHitRate = searchStats.totalSearches > 0
            ? (searchStats.cacheHits / searchStats.totalSearches) * 100
            : 0;

        return {
            total_searches: searchStats.totalSearches,
            most_searched_terms: mostSearchedTerms,
            average_response_time: avgResponseTime,
            cache_hit_rate: cacheHitRate
        };
    }

    // Method to reset statistics (useful for testing)
    resetStatistics(): void {
        searchStats.totalSearches = 0;
        searchStats.searchTerms.clear();
        searchStats.responseTimes = [];
        searchStats.cacheHits = 0;
        searchCache.clear();
    }

    // Helper methods
    private async getLogFiles(specificFiles?: string[]): Promise<string[]> {
        try {
            // Check if logs directory exists
            try {
                await fs.access(this.logsPath);
            } catch {
                throw new Error(`Logs directory not found: ${this.logsPath}`);
            }

            if (specificFiles) {
                // Validate that specified files exist
                const validFiles: string[] = [];
                for (const file of specificFiles) {
                    try {
                        await fs.access(join(this.logsPath, file));
                        validFiles.push(file);
                    } catch {
                        await logger.warn('Specified log file not found', { file });
                    }
                }
                return validFiles;
            }

            // Get all .log files
            const files = await fs.readdir(this.logsPath);
            return files.filter(file => file.endsWith('.log'));
        } catch (error) {
            await logger.error('Failed to get log files', { error });
            throw error;
        }
    }

    private async searchInFile(filename: string, query: string, options: SearchOptions): Promise<SearchMatch[]> {
        const matches: SearchMatch[] = [];
        const filePath = join(this.logsPath, filename);

        try {
            // Check if file appears to be binary
            const buffer = Buffer.alloc(512);
            const fileHandle = await fs.open(filePath, 'r');
            const { bytesRead } = await fileHandle.read(buffer, 0, 512, 0);
            await fileHandle.close();

            // Simple binary detection: check for null bytes or high percentage of non-printable chars
            const nullBytes = buffer.subarray(0, bytesRead).indexOf(0);
            if (nullBytes !== -1) {
                throw new Error(`File appears to be binary (contains null bytes)`);
            }

            const fileStream = createReadStream(filePath);
            const rl = createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            let lineNumber = 0;
            const lines: string[] = [];

            for await (const line of rl) {
                lineNumber++;
                lines.push(line);

                // Check if line matches search criteria
                const textMatches = query === '' || this.lineMatches(line, query, options);
                if (textMatches) {
                    const match = this.createSearchMatch(filename, line, lineNumber, options, lines);
                    if (match && this.matchesFilters(match, options)) {
                        matches.push(match);
                    }
                }

                // Apply limit if specified
                if (options.limit && matches.length >= options.limit) {
                    break;
                }
            }

            return matches;
        } catch (error) {
            await logger.error('Failed to search in file', { filename, error });
            throw error;
        }
    }

    private async streamSearchInFile(filename: string, query: string, callback: (match: SearchMatch) => void, options: SearchOptions): Promise<void> {
        const filePath = join(this.logsPath, filename);

        try {
            const fileStream = createReadStream(filePath);
            const rl = createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            let lineNumber = 0;
            const lines: string[] = [];

            for await (const line of rl) {
                lineNumber++;
                lines.push(line);

                const textMatches = query === '' || this.lineMatches(line, query, options);
                if (textMatches) {
                    const match = this.createSearchMatch(filename, line, lineNumber, options, lines);
                    if (match && this.matchesFilters(match, options)) {
                        callback(match);
                    }
                }
            }
        } catch (error) {
            await logger.error('Failed to stream search in file', { filename, error });
            throw error;
        }
    }

    private lineMatches(line: string, query: string, options: SearchOptions): boolean {
        try {
            if (options.useRegex) {
                const flags = options.caseSensitive ? 'g' : 'gi';
                const regex = new RegExp(query, flags);
                return regex.test(line);
            } else {
                const searchLine = options.caseSensitive ? line : line.toLowerCase();
                const searchQuery = options.caseSensitive ? query : query.toLowerCase();
                return searchLine.includes(searchQuery);
            }
        } catch (error) {
            // Invalid regex
            return false;
        }
    }

    private createSearchMatch(filename: string, line: string, lineNumber: number, options: SearchOptions, allLines: string[]): SearchMatch | null {
        try {
            // Parse log line to extract timestamp and level
            const { timestamp, level } = this.parseLogLine(line);

            const match: SearchMatch = {
                file: filename,
                line,
                lineNumber,
                timestamp,
                level
            };

            // Add context lines if requested
            if (options.contextLines && options.contextLines > 0) {
                const contextBefore: string[] = [];
                const contextAfter: string[] = [];

                // Get context before
                for (let i = Math.max(0, lineNumber - options.contextLines - 1); i < lineNumber - 1; i++) {
                    if (allLines[i]) {
                        contextBefore.push(allLines[i]);
                    }
                }

                // Get context after (we might not have all lines yet in streaming)
                for (let i = lineNumber; i < Math.min(allLines.length, lineNumber + options.contextLines); i++) {
                    if (allLines[i]) {
                        contextAfter.push(allLines[i]);
                    }
                }

                match.context = {
                    before: contextBefore,
                    after: contextAfter
                };
            }

            return match;
        } catch (error) {
            return null;
        }
    }

    private parseLogLine(line: string): { timestamp?: string; level?: string } {
        // Try to parse common log formats
        // Format 1: "2024-01-01 10:00:00 INFO Message"
        const format1 = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(\w+)\s+/;
        const match1 = line.match(format1);
        if (match1) {
            return {
                timestamp: match1[1],
                level: match1[2]
            };
        }

        // Format 2: "[2024-01-01T10:00:00Z] INFO: Message"
        const format2 = /^\[([^\]]+)\]\s+(\w+):/;
        const match2 = line.match(format2);
        if (match2) {
            return {
                timestamp: match2[1],
                level: match2[2]
            };
        }

        // Format 3: Look for common log levels anywhere in the line
        const levelMatch = line.match(/\b(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|TRACE)\b/i);
        if (levelMatch) {
            return {
                level: levelMatch[1].toUpperCase()
            };
        }

        return {};
    }

    private matchesFilters(match: SearchMatch, options: SearchOptions): boolean {
        // Filter by log level
        if (options.level && match.level !== options.level.toUpperCase()) {
            return false;
        }

        // Filter by time range
        if (options.startTime || options.endTime) {
            if (!match.timestamp) {
                return false; // Can't filter by time without timestamp
            }

            const matchTime = new Date(match.timestamp);
            if (options.startTime && matchTime < options.startTime) {
                return false;
            }
            if (options.endTime && matchTime > options.endTime) {
                return false;
            }
        }

        return true;
    }
}

// Create singleton instance
const searchLogsService = new SearchLogsService();

// Export the service instance
export const searchLogs = searchLogsService;

// Also export for backward compatibility
export { searchLogsService as searchTaskLogs };

// Run if called directly
if (import.meta.main) {
    // Example usage
    searchLogs.search('ERROR').then(results => {
        console.log('Search results:', results);
    }).catch(console.error);
}