import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname, relative } from 'path';

const rootDir = process.argv[2] || 'src';
const outputFile = process.argv[3] || 'flattened.txt';
const includedExtensions = ['.ts', '.tsx', '.js', '.md', '.json'];

async function flattenDir(dir: string, out: string[]) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            await flattenDir(fullPath, out);
        } else if (includedExtensions.includes(extname(entry.name))) {
            const content = await readFile(fullPath, 'utf-8');
            out.push(`\n// === ${relative(rootDir, fullPath)} ===\n${content}`);
        }
    }
}

(async () => {
    const allFiles: string[] = [];
    await flattenDir(rootDir, allFiles);
    await writeFile(outputFile, allFiles.join('\n\n'));
    console.log(`Flattened source written to: ${outputFile}`);
})();