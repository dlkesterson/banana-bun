import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname, relative } from 'path';
import { gzipSync } from 'zlib';

// Configuration
const DEFAULT_DIRS = ['src', 'test', 'examples', 'scripts', 'docs'];
const INCLUDED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.yaml', '.yml', '.toml'];
const EXCLUDED_PATTERNS = [
    /node_modules/,
    /\.git/,
    /coverage/,
    /dist/,
    /build/,
    /\.next/,
    /\.cache/,
    /\.vscode/,
    /\.idea/,
    /\.DS_Store/,
    /thumbs\.db/i,
    /\.log$/,
    /\.lock$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /bun\.lock$/
];

interface FileEntry {
    path: string;
    content: string;
    size: number;
}

interface CompressionStats {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    fileCount: number;
}

// Parse command line arguments
const args = process.argv.slice(2);
const compress = args.includes('--compress') || args.includes('-c');
const verbose = args.includes('--verbose') || args.includes('-v');
const help = args.includes('--help') || args.includes('-h');

if (help) {
    console.log(`
Usage: bun run flatten.ts [options] [directories...] [output-file]

Options:
  --compress, -c    Compress output using gzip
  --verbose, -v     Show detailed processing information
  --help, -h        Show this help message

Examples:
  bun run flatten.ts                           # Flatten default directories to flattened.txt
  bun run flatten.ts src test                  # Flatten only src and test directories
  bun run flatten.ts --compress output.txt.gz  # Compress output
  bun run flatten.ts --verbose src docs        # Verbose output for src and docs
`);
    process.exit(0);
}

// Extract directories and output file from arguments
const nonFlagArgs = args.filter(arg => !arg.startsWith('-'));
let targetDirs: string[];
let outputFile: string;

if (nonFlagArgs.length === 0) {
    targetDirs = DEFAULT_DIRS;
    outputFile = compress ? 'flattened.txt.gz' : 'flattened.txt';
} else if (nonFlagArgs.length === 1) {
    // Could be either a single directory or output file
    const arg = nonFlagArgs[0]!; // We know it exists since length === 1
    if (arg.includes('.')) {
        // Likely an output file
        targetDirs = DEFAULT_DIRS;
        outputFile = arg;
    } else {
        // Likely a directory
        targetDirs = [arg];
        outputFile = compress ? 'flattened.txt.gz' : 'flattened.txt';
    }
} else {
    // Multiple arguments - last one is output file if it has extension
    const lastArg = nonFlagArgs[nonFlagArgs.length - 1]!; // We know it exists since length > 1
    if (lastArg.includes('.')) {
        targetDirs = nonFlagArgs.slice(0, -1);
        outputFile = lastArg;
    } else {
        targetDirs = nonFlagArgs;
        outputFile = compress ? 'flattened.txt.gz' : 'flattened.txt';
    }
}

function shouldExclude(filePath: string): boolean {
    return EXCLUDED_PATTERNS.some(pattern => pattern.test(filePath));
}

function removeComments(content: string, extension: string): string {
    switch (extension) {
        case '.ts':
        case '.tsx':
        case '.js':
        case '.jsx':
            // Remove single-line comments and multi-line comments
            return content
                .replace(/\/\*[\s\S]*?\*\//g, '') // Multi-line comments
                .replace(/\/\/.*$/gm, '') // Single-line comments
                .replace(/^\s*$/gm, '') // Empty lines
                .replace(/\n{3,}/g, '\n\n'); // Multiple consecutive newlines
        case '.json':
            // JSON doesn't have comments in standard, but some tools support them
            return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        default:
            return content;
    }
}

function minifyContent(content: string, extension: string): string {
    const withoutComments = removeComments(content, extension);

    switch (extension) {
        case '.ts':
        case '.tsx':
        case '.js':
        case '.jsx':
            // Basic minification: remove extra whitespace but keep readability
            return withoutComments
                .replace(/\s+/g, ' ') // Multiple spaces to single space
                .replace(/;\s+/g, ';\n') // Keep statements on separate lines
                .replace(/{\s+/g, '{\n') // Keep braces readable
                .replace(/\s+}/g, '\n}')
                .trim();
        case '.json':
            try {
                return JSON.stringify(JSON.parse(withoutComments));
            } catch {
                return withoutComments;
            }
        default:
            return withoutComments.replace(/\s+$/gm, '').replace(/\n{3,}/g, '\n\n');
    }
}

async function flattenDir(dir: string, files: FileEntry[], basePath: string = ''): Promise<void> {
    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = relative(basePath || dir, fullPath);

            if (shouldExclude(fullPath)) {
                if (verbose) console.log(`Skipping excluded: ${relativePath}`);
                continue;
            }

            if (entry.isDirectory()) {
                await flattenDir(fullPath, files, basePath || dir);
            } else if (INCLUDED_EXTENSIONS.includes(extname(entry.name))) {
                try {
                    const content = await readFile(fullPath, 'utf-8');
                    const minifiedContent = minifyContent(content, extname(entry.name));

                    files.push({
                        path: relativePath,
                        content: minifiedContent,
                        size: Buffer.byteLength(minifiedContent, 'utf-8')
                    });

                    if (verbose) {
                        console.log(`Processed: ${relativePath} (${minifiedContent.length} chars)`);
                    }
                } catch (error) {
                    console.warn(`Warning: Could not read ${relativePath}: ${error}`);
                }
            }
        }
    } catch (error) {
        console.warn(`Warning: Could not access directory ${dir}: ${error}`);
    }
}

function formatOutput(files: FileEntry[]): string {
    // Sort files by directory and then by name for better organization
    files.sort((a, b) => {
        const aDirDepth = a.path.split('/').length;
        const bDirDepth = b.path.split('/').length;
        if (aDirDepth !== bDirDepth) return aDirDepth - bDirDepth;
        return a.path.localeCompare(b.path);
    });

    const sections = files.map(file =>
        `\n// === ${file.path} ===\n${file.content}`
    );

    return sections.join('\n\n');
}

async function writeOutput(content: string, outputPath: string, shouldCompress: boolean): Promise<CompressionStats> {
    const originalSize = Buffer.byteLength(content, 'utf-8');

    if (shouldCompress) {
        const compressed = gzipSync(content);
        await writeFile(outputPath, compressed);
        return {
            originalSize,
            compressedSize: compressed.length,
            compressionRatio: compressed.length / originalSize,
            fileCount: 0 // Will be set by caller
        };
    } else {
        await writeFile(outputPath, content, 'utf-8');
        return {
            originalSize,
            compressedSize: originalSize,
            compressionRatio: 1,
            fileCount: 0 // Will be set by caller
        };
    }
}

(async () => {
    try {
        console.log(`Flattening directories: ${targetDirs.join(', ')}`);
        console.log(`Output file: ${outputFile}`);
        console.log(`Compression: ${compress ? 'enabled' : 'disabled'}`);
        console.log('');

        const allFiles: FileEntry[] = [];

        // Process each target directory
        for (const dir of targetDirs) {
            if (verbose) console.log(`\nProcessing directory: ${dir}`);
            await flattenDir(dir, allFiles);
        }

        if (allFiles.length === 0) {
            console.log('No files found to process.');
            process.exit(1);
        }

        // Format and write output
        const formattedContent = formatOutput(allFiles);
        const stats = await writeOutput(formattedContent, outputFile, compress);
        stats.fileCount = allFiles.length;

        // Display results
        console.log(`\nFlattening complete!`);
        console.log(`Files processed: ${stats.fileCount}`);
        console.log(`Original size: ${(stats.originalSize / 1024).toFixed(2)} KB`);

        if (compress) {
            console.log(`Compressed size: ${(stats.compressedSize / 1024).toFixed(2)} KB`);
            console.log(`Compression ratio: ${(stats.compressionRatio * 100).toFixed(1)}%`);
            console.log(`Space saved: ${((1 - stats.compressionRatio) * 100).toFixed(1)}%`);
        }

        console.log(`Output written to: ${outputFile}`);

        // LLM context optimization tips
        if (stats.originalSize > 1024 * 1024) { // > 1MB
            console.log('\n💡 Tips for LLM context optimization:');
            console.log('   • Consider using --compress flag for better token efficiency');
            console.log('   • Large codebases may exceed LLM context limits');
            console.log('   • Consider processing specific directories only');
        }

    } catch (error) {
        console.error('Error during flattening:', error);
        process.exit(1);
    }
})();