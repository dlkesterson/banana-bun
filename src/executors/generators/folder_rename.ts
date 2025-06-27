import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { logger } from '../../utils/logger';

export interface FolderRenameGenerator {
    type: 'folder_rename';
    directory_path: string;
    recursive?: boolean;
}

export interface GeneratedSubtask {
    type: 'tool';
    tool: string;
    args: Record<string, any>;
    description: string;
}

export async function generateFolderRenameTasks(generator: FolderRenameGenerator): Promise<GeneratedSubtask[]> {
    const { directory_path, recursive = false } = generator;

    try {
        // Resolve and validate the directory path
        const resolvedPath = resolve(directory_path);

        // Check if directory exists
        try {
            const stat = await fs.stat(resolvedPath);
            if (!stat.isDirectory()) {
                throw new Error(`Path is not a directory: ${resolvedPath}`);
            }
        } catch (err) {
            throw new Error(`Directory does not exist or is not accessible: ${resolvedPath}`);
        }

        // Scan directory for folders
        const folders = await scanForFolders(resolvedPath, recursive);

        if (folders.length === 0) {
            await logger.info(`No folders found in directory: ${resolvedPath}`);
            return [];
        }

        await logger.info(`Found ${folders.length} folders to rename`, {
            directory: resolvedPath,
            folders: folders.map(f => ({ path: f, name: f.split(/[/\\]/).pop() }))
        });

        // Create subtasks for each folder
        const subtasks: GeneratedSubtask[] = [];

        for (const folderPath of folders) {
            const folderName = folderPath.split(/[/\\]/).pop() || 'unknown';
            const description = `Rename folder: ${folderName}`;

            subtasks.push({
                type: 'tool',
                tool: 'rename_item',
                args: { current_path: folderPath },
                description
            });
        }

        return subtasks;

    } catch (err) {
        await logger.error('Error generating folder rename tasks', {
            generator,
            error: err instanceof Error ? err.message : String(err)
        });
        throw err;
    }
}

async function scanForFolders(directoryPath: string, recursive: boolean): Promise<string[]> {
    const folders: string[] = [];

    try {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = join(directoryPath, entry.name);
                folders.push(fullPath);

                // If recursive, scan subdirectories too
                if (recursive) {
                    const subFolders = await scanForFolders(fullPath, true);
                    folders.push(...subFolders);
                }
            }
        }
    } catch (err) {
        await logger.error('Error scanning directory for folders', {
            directoryPath,
            error: err instanceof Error ? err.message : String(err)
        });
        throw err;
    }

    return folders;
} 