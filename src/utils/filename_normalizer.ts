import { config } from '../config';
import { existsSync } from 'fs';
import { join } from 'path';

export interface NormalizationOptions {
    maxLength?: number;
    case?: 'title' | 'lower' | 'upper';
    replaceSpaces?: boolean;
    sanitizeChars?: boolean;
    preserveExtension?: boolean;
}

/**
 * Normalizes a filename according to configuration and options
 */
export function normalizeFilename(
    filename: string,
    options: NormalizationOptions = {}
): string {
    const opts = {
        maxLength: options.maxLength || config.media.organize.filenameNormalization.maxLength,
        case: options.case || config.media.organize.filenameNormalization.case,
        replaceSpaces: options.replaceSpaces ?? config.media.organize.filenameNormalization.replaceSpaces,
        sanitizeChars: options.sanitizeChars ?? config.media.organize.filenameNormalization.sanitizeChars,
        preserveExtension: options.preserveExtension ?? true
    };

    let normalized = filename;
    let extension = '';

    // Extract and preserve extension if requested
    if (opts.preserveExtension) {
        const lastDotIndex = normalized.lastIndexOf('.');
        if (lastDotIndex > 0) {
            extension = normalized.substring(lastDotIndex);
            normalized = normalized.substring(0, lastDotIndex);
        }
    }

    // Sanitize illegal characters for filesystem
    if (opts.sanitizeChars) {
        normalized = sanitizeForFilesystem(normalized);
    }

    // Apply case transformation
    switch (opts.case) {
        case 'lower':
            normalized = normalized.toLowerCase();
            break;
        case 'upper':
            normalized = normalized.toUpperCase();
            break;
        case 'title':
            normalized = toTitleCase(normalized);
            break;
    }

    // Replace spaces if requested
    if (opts.replaceSpaces) {
        normalized = normalized.replace(/\s+/g, '.');
    }

    // Truncate if too long (accounting for extension)
    const maxContentLength = opts.maxLength - extension.length;
    if (normalized.length > maxContentLength) {
        normalized = normalized.substring(0, maxContentLength).trim();
        // Ensure we don't end with a space or special character
        normalized = normalized.replace(/[.\-_\s]+$/, '');
    }

    // Remove trailing dots (Windows compatibility)
    normalized = normalized.replace(/\.+$/, '');

    return normalized + extension;
}

/**
 * Sanitizes a string for filesystem compatibility
 */
export function sanitizeForFilesystem(input: string): string {
    // Remove or replace illegal characters for Windows/Unix filesystems
    return input
        // Replace illegal characters with safe alternatives
        .replace(/[<>:"/\\|?*]/g, '')
        // Replace multiple spaces with single space
        .replace(/\s+/g, ' ')
        // Remove control characters
        .replace(/[\x00-\x1f\x80-\x9f]/g, '')
        // Trim whitespace
        .trim();
}

/**
 * Converts string to title case
 */
export function toTitleCase(input: string): string {
    // Articles, conjunctions, and prepositions to keep lowercase (unless first/last word)
    const lowercaseWords = new Set([
        'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'is',
        'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet'
    ]);

    return input
        .toLowerCase()
        .split(/\s+/)
        .map((word, index, words) => {
            // Always capitalize first and last word
            if (index === 0 || index === words.length - 1) {
                return capitalizeWord(word);
            }
            
            // Keep articles/prepositions lowercase unless they're the first/last word
            if (lowercaseWords.has(word)) {
                return word;
            }
            
            return capitalizeWord(word);
        })
        .join(' ');
}

/**
 * Capitalizes the first letter of a word
 */
function capitalizeWord(word: string): string {
    if (word.length === 0) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Generates a safe filename by handling collisions
 */
export function generateSafeFilename(
    basePath: string,
    filename: string,
    extension: string = ''
): string {
    let counter = 1;
    let candidateFilename = filename + extension;
    let fullPath = join(basePath, candidateFilename);

    // Check if file exists and generate alternative names
    while (existsSync(fullPath)) {
        counter++;
        candidateFilename = `${filename} (${counter})${extension}`;
        fullPath = join(basePath, candidateFilename);

        // Safety check to prevent infinite loops
        if (counter > 1000) {
            // Use timestamp as fallback
            const timestamp = Date.now();
            candidateFilename = `${filename}_${timestamp}${extension}`;
            break;
        }
    }

    return candidateFilename;
}

/**
 * Formats a template string with provided variables
 */
export function formatTemplate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{(\w+)(?::([^}]+))?\}/g, (match, key, format) => {
        const value = variables[key];
        
        if (value === undefined || value === null) {
            return '';
        }

        // Handle formatting options
        if (format) {
            if (format.includes('d') && typeof value === 'number') {
                // Pad with zeros (e.g., :02d for 01, 02, etc.)
                const padLength = parseInt(format.replace(/\D/g, '')) || 2;
                return value.toString().padStart(padLength, '0');
            }
        }

        return String(value);
    });
}

/**
 * Validates that a filename is safe for the filesystem
 */
export function validateFilename(filename: string): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // Check for empty filename
    if (!filename || filename.trim().length === 0) {
        errors.push('Filename cannot be empty');
    }

    // Check for illegal characters
    const illegalChars = /[<>:"/\\|?*\x00-\x1f\x80-\x9f]/;
    if (illegalChars.test(filename)) {
        errors.push('Filename contains illegal characters');
    }

    // Check for reserved names (Windows)
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    if (reservedNames.test(filename)) {
        errors.push('Filename uses a reserved system name');
    }

    // Check for trailing dots or spaces
    if (filename.endsWith('.') || filename.endsWith(' ')) {
        errors.push('Filename cannot end with a dot or space');
    }

    // Check length
    if (filename.length > 255) {
        errors.push('Filename is too long (max 255 characters)');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}
