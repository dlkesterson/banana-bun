import { readFile } from 'fs/promises';

export async function hashFile(filePath: string): Promise<string> {
    const data = await readFile(filePath);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
} 