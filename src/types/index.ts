// Re-export all types from their respective modules
export * from './task';
export * from './embedding';
export * from './media';

// Define logging types
export interface LogEntry {
    time: string;
    event: string;
    data?: any;
}
