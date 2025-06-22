import { promises as fs } from 'fs';
import { join } from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { spawn } from 'bun';

// Define available tools
export type ToolName =
    | 'read_file'
    | 'write_file'
    | 'rename_item'
    | 'yt_watch'
    | 'yt_download'
    | 's3_sync'
    | 'run_script'
    | 'ollama_chat'
    | 'generate_code'
    | 'summarize_file'
    | 'create_task'
    | 'review_output'
    | 'review_code'
    | 'review_text';

// Tool argument types
interface ReadFileArgs {
    path: string;
}

interface WriteFileArgs {
    path: string;
    content: string;
}

interface RenameItemArgs {
    current_path: string;
}

interface YtWatchArgs {
    channel_url: string;
}

interface YtDownloadArgs {
    url: string;
    audio_only?: boolean;
}

interface S3SyncArgs {
    direction: 'up' | 'down';
    bucket?: string;
    prefix?: string;
    local_path?: string;
    dry_run?: boolean;
    delete?: boolean;
    exclude?: string[];
    include?: string[];
}

interface RunScriptArgs {
    script_name: string;
    args?: string[];
}

interface OllamaChatArgs {
    prompt: string;
    system?: string;
}

interface GenerateCodeArgs {
    description: string;
    language: string;
    output_path: string;
}

interface SummarizeFileArgs {
    path: string;
    max_length?: number;
}

interface CreateTaskArgs {
    type: string;
    description: string;
    dependencies?: string[];
    metadata?: Record<string, any>;
}

interface OllamaResponse {
    response?: string;
    model: string;
    created_at: string;
    done: boolean;
}

interface ReviewOutputArgs {
    output: any;
    requirements: string;
    model?: string;
}

interface ReviewCodeArgs {
    code: string;
    requirements: string;
    language: string;
    model?: string;
}

interface ReviewTextArgs {
    text: string;
    requirements: string;
    model?: string;
}

// Tool implementations
const tools = {
    read_file: async ({ path }: ReadFileArgs) => {
        const content = await fs.readFile(path, 'utf-8');
        return { content };
    },

    write_file: async ({ path, content }: WriteFileArgs) => {
        await fs.writeFile(path, content, 'utf-8');
        return { path };
    },

    rename_item: async ({ current_path }: RenameItemArgs) => {
        const { dirname, basename, extname } = await import('path');

        // Check if current path exists
        try {
            await fs.access(current_path);
        } catch (error) {
            throw new Error(`Source path does not exist: ${current_path}`);
        }

        // Get the current filename/foldername
        const current_name = basename(current_path);
        const file_extension = extname(current_path);
        const name_without_extension = basename(current_path, file_extension);

        // Optimized system prompt for simple, clean names
        const defaultSystemPrompt = `Clean filename assistant. Rules:
1. Return ONLY the cleaned filename
2. No explanations, thinking, or extra text
3. Keep ONLY the main title and season/episode info
4. Use spaces between words (NOT underscores)
5. Remove ALL technical details (resolution, codec like x265/x264/h264, audio, release groups)
6. Remove brackets, parentheses, version numbers
7. NO file extensions or codec identifiers in response

Example:
Input: "Pinky.and.the.Brain.S01.1080p.UPSCALED.DD.5.1.x265-EDGE2020"
Output: "Pinky and the Brain S01"`;

        let cleaned_name: string;

        try {
            // Generate cleaned name using fast Ollama with stricter prompt
            const prompt = `${name_without_extension}`;
            const ollamaResult = await tools.fast_ollama_chat({
                prompt,
                system: defaultSystemPrompt
            });

            const responseText = ollamaResult.response;
            if (!responseText) {
                throw new Error('No response from Ollama');
            }

            // Clean up the Ollama response aggressively
            cleaned_name = responseText
                .trim()
                .replace(/[+_]/g, ' ')  // Replace + and _ with spaces
                .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
                .replace(/\s+/g, ' ')   // Normalize multiple spaces
                .trim();

            // Validate the response isn't empty or too long
            if (cleaned_name.length === 0) {
                throw new Error('Empty response from Ollama');
            }
            if (cleaned_name.length > 100) {
                // Truncate very long responses
                cleaned_name = cleaned_name.substring(0, 100).trim();
            }

        } catch (error) {
            // Fallback to simple rule-based cleaning if Ollama fails
            await logger.info('Ollama failed, using fallback cleaning', { error: error instanceof Error ? error.message : String(error) });

            cleaned_name = name_without_extension
                // Convert underscores and periods to spaces first
                .replace(/[._]/g, ' ')
                // Remove all technical information after season/episode info
                .replace(/\s+(1080p|720p|480p|4K|HD|x264|x265|HEVC|h264|h265).*$/gi, '')
                .replace(/\s+(AAC|MP3|FLAC|AC3|DTS|DD|DOLBY).*$/gi, '')
                .replace(/\s+(UPSCALED|REMASTERED|EXTENDED|UNCUT|DIRECTORS?\s*CUT).*$/gi, '')
                .replace(/\s+(WEB|BLURAY|DVDRIP|BRRIP|WEBRIP).*$/gi, '')
                .replace(/\s*-.*$/gi, '') // Remove everything after dash (release group)
                // Remove brackets and their contents  
                .replace(/[\[\](){}]/g, ' ')
                // Remove version numbers and extra technical stuff
                .replace(/\s+(v\d+|\d{4}|EDGE\d+|YIFY|RARBG|FGT).*$/gi, '')
                // Clean up multiple spaces and trim
                .replace(/\s+/g, ' ')
                .trim()
                // Ensure proper length and no trailing spaces
                .substring(0, 50)
                .trim();
        }

        // Final safety check - ensure we have a valid filename
        if (!cleaned_name || cleaned_name.trim().length === 0) {
            // Use a safe fallback only if completely empty
            cleaned_name = `cleaned_${Date.now()}`;
        }

        // Clean the file extension to remove codec identifiers
        let clean_extension = file_extension;
        if (file_extension) {
            // Remove codec identifiers from the extension part
            clean_extension = file_extension
                .replace(/\.x265/gi, '')
                .replace(/\.x264/gi, '')
                .replace(/\.h264/gi, '')
                .replace(/\.h265/gi, '')
                .replace(/\.hevc/gi, '')
                .replace(/-[A-Z0-9]+$/gi, ''); // Remove release group suffixes like -EDGE2020
        }

        // Add back the cleaned file extension if it's a file
        const new_name = clean_extension ? `${cleaned_name}${clean_extension}` : cleaned_name;

        // Get the directory of the current file/folder
        const parentDir = dirname(current_path);

        // Create the new full path
        const new_path = join(parentDir, new_name);

        // Check if new path already exists
        try {
            await fs.access(new_path);
            throw new Error(`Destination already exists: ${new_path}`);
        } catch (error) {
            // Good, new path doesn't exist (we want this)
            if (error instanceof Error && !error.message.includes('ENOENT')) {
                throw error;
            }
        }

        // Perform the rename
        await fs.rename(current_path, new_path);

        return {
            old_path: current_path,
            new_path: new_path,
            old_name: current_name,
            new_name: new_name,
            suggested_name: cleaned_name
        };
    },

    yt_watch: async ({ channel_url }: YtWatchArgs) => {
        const proc = spawn({
            cmd: ['yt-dlp', '--flat-playlist', '--print', 'id', channel_url],
            stdout: 'pipe',
            stderr: 'pipe'
        });
        const output = await new Response(proc.stdout).text();
        const videoIds = output.split('\n').filter(Boolean);
        return { video_ids: videoIds };
    },

    yt_download: async ({ url, audio_only = false }: YtDownloadArgs) => {
        const outputDir = join(config.paths.outputs, 'youtube');
        await fs.mkdir(outputDir, { recursive: true });

        const args = [
            ...(audio_only ? ['-x', '--audio-format', 'mp3'] : []),
            '-o', `${outputDir}/%(title)s.%(ext)s`,
            url
        ];

        const proc = spawn({
            cmd: ['yt-dlp', ...args],
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const output = await new Response(proc.stdout).text();
        const error = await new Response(proc.stderr).text();

        if (error) {
            throw new Error(`yt-dlp error: ${error}`);
        }

        return { output_path: outputDir };
    },

    s3_sync: async ({
        direction,
        bucket,
        prefix = '',
        local_path,
        dry_run = false,
        delete: deleteFlag = false,
        exclude = [],
        include = []
    }: S3SyncArgs) => {
        const { promises: fs } = await import('fs');
        const { join } = await import('path');

        // Use provided bucket or default from config
        const targetBucket = bucket || config.s3.defaultBucket;
        if (!targetBucket) {
            throw new Error('No bucket specified and no default bucket configured');
        }

        // Use provided local path or default from config
        const localPath = local_path || config.s3.defaultDownloadPath;
        if (!localPath) {
            throw new Error('No local path specified and no default download path configured');
        }

        // Ensure local directory exists for downloads
        if (direction === 'down') {
            await fs.mkdir(localPath, { recursive: true });
        }

        // Ensure log directory exists
        const logDir = config.s3.syncLogPath;
        await fs.mkdir(logDir, { recursive: true });

        // Create log file with timestamp (Windows-compatible)
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const logFile = join(logDir, `s3_sync_${targetBucket}_${timestamp}.log`);

        // Build S3 paths
        const s3Path = prefix ? `s3://${targetBucket}/${prefix}` : `s3://${targetBucket}`;

        // Build AWS CLI command with full path on Windows
        const awsExecutable = process.platform === 'win32'
            ? 'C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe'
            : 'aws';
        const awsCmd = [awsExecutable, 's3', 'sync'];

        // Add source and destination based on direction
        if (direction === 'up') {
            awsCmd.push(localPath, s3Path);
        } else {
            awsCmd.push(s3Path, localPath);
        }

        // Add endpoint if specified (for DigitalOcean Spaces, etc.)
        if (config.s3.endpoint) {
            awsCmd.push('--endpoint-url', config.s3.endpoint);
        }

        // Add optional flags
        if (dry_run) {
            awsCmd.push('--dryrun');
        }

        if (deleteFlag) {
            awsCmd.push('--delete');
        }

        // Add exclude patterns
        exclude.forEach(pattern => {
            awsCmd.push('--exclude', pattern);
        });

        // Add include patterns
        include.forEach(pattern => {
            awsCmd.push('--include', pattern);
        });

        // Set up environment variables for AWS CLI
        const env = {
            ...process.env,
            AWS_ACCESS_KEY_ID: config.s3.accessKeyId,
            AWS_SECRET_ACCESS_KEY: config.s3.secretAccessKey,
            AWS_DEFAULT_REGION: config.s3.region
        };

        // Validate AWS credentials
        if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
            throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file');
        }

        try {
            // Log the operation start
            const logEntry = `[${new Date().toISOString()}] Starting S3 sync: ${direction} - ${s3Path} <-> ${localPath}\n`;
            await fs.appendFile(logFile, logEntry);

            // Execute AWS CLI command
            const proc = spawn({
                cmd: awsCmd,
                env,
                stdout: 'pipe',
                stderr: 'pipe'
            });

            // Capture output and errors
            const stdout = await new Response(proc.stdout).text();
            const stderr = await new Response(proc.stderr).text();

            // Wait for process to complete
            if (proc.exited) {
                await proc.exited;
            }

            // Log the output
            const fullLog = `Command: ${awsCmd.join(' ')}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\n${'='.repeat(80)}\n\n`;
            await fs.appendFile(logFile, fullLog);

            // Check for errors
            if (proc.exitCode !== 0) {
                throw new Error(`AWS CLI command failed with exit code ${proc.exitCode}: ${stderr}`);
            }

            // Parse output for summary information
            const lines = stdout.split('\n').filter(line => line.trim());
            const summary = {
                direction,
                bucket: targetBucket,
                prefix,
                local_path: localPath,
                s3_path: s3Path,
                dry_run,
                delete: deleteFlag,
                log_file: logFile,
                files_processed: lines.length,
                output: stdout,
                timestamp: new Date().toISOString()
            };

            return summary;

        } catch (error) {
            // Log the error
            const errorLog = `[${new Date().toISOString()}] ERROR: ${error instanceof Error ? error.message : String(error)}\n`;
            await fs.appendFile(logFile, errorLog);

            throw new Error(`S3 sync failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    },

    run_script: async ({ script_name, args = [] }: RunScriptArgs) => {
        const scriptPath = join(config.paths.outputs, 'scripts', script_name);
        const proc = spawn({
            cmd: ['bash', scriptPath, ...args],
            stdout: 'pipe',
            stderr: 'pipe'
        });

        const output = await new Response(proc.stdout).text();
        const error = await new Response(proc.stderr).text();

        if (error) {
            throw new Error(`Script error: ${error}`);
        }

        return { output };
    },

    ollama_chat: async ({ prompt, system }: OllamaChatArgs) => {
        const response = await fetch(`${config.ollama.url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.ollama.model,
                prompt,
                system,
                stream: false,
                options: {
                    temperature: 0.1,        // Lower temperature for more deterministic outputs
                    top_p: 0.9,             // Reduce randomness
                    top_k: 10,              // Limit token choices
                    repeat_penalty: 1.1,    // Prevent repetitive text
                    num_predict: 50,        // Limit response length to 50 tokens max
                    stop: ['\n\n', '<think>', '</think>', 'Input:', 'Output:', 'Example:']  // Stop on common verbose patterns
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const result = await response.json() as OllamaResponse;
        return { response: result.response };
    },

    // Fast Ollama chat for simple tasks like filename cleaning
    fast_ollama_chat: async ({ prompt, system }: OllamaChatArgs) => {
        const response = await fetch(`${config.ollama.url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.ollama.fastModel, // Use faster model
                prompt,
                system,
                stream: false,
                options: {
                    temperature: 0.0,        // Zero temperature for maximum determinism
                    top_p: 0.8,
                    top_k: 5,               // Very limited token choices
                    repeat_penalty: 1.2,
                    num_predict: 30,        // Very short responses
                    stop: ['\n', '<', '>', 'think', 'Input:', 'Output:', 'Example:', 'Note:', 'Explanation:']
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const result = await response.json() as OllamaResponse;
        return { response: result.response || '' };
    },

    generate_code: async ({ description, language, output_path }: GenerateCodeArgs) => {
        const prompt = `Generate ${language} code for: ${description}`;
        const result = await tools.ollama_chat({
            prompt,
            system: 'You are a code generation assistant. Respond only with the code, no explanations.'
        });

        await fs.writeFile(output_path, result.response || '', 'utf-8');
        return { output_path };
    },

    summarize_file: async ({ path, max_length = 1000 }: SummarizeFileArgs) => {
        const content = await fs.readFile(path, 'utf-8');
        const result = await tools.ollama_chat({
            prompt: `Summarize this text in ${max_length} characters or less:\n\n${content}`,
            system: 'You are a summarization assistant. Be concise and clear.'
        });

        return { summary: result.response };
    },

    create_task: async ({ type, description, dependencies, metadata }: CreateTaskArgs) => {
        const task = {
            type,
            description,
            dependencies,
            metadata,
            status: 'pending',
            result: null
        };

        const taskPath = join(config.paths.incoming, `task-${Date.now()}.json`);
        await fs.writeFile(taskPath, JSON.stringify(task, null, 2), 'utf-8');

        return { task_path: taskPath };
    },

    review_output: async ({ output, requirements, model }: ReviewOutputArgs) => {
        const { reviewExecutor } = await import('../executors/review_executor');
        return reviewExecutor.reviewOutput(output, requirements, model);
    },

    review_code: async ({ code, requirements, language, model }: ReviewCodeArgs) => {
        const { reviewExecutor } = await import('../executors/review_executor');
        return reviewExecutor.reviewCode(code, requirements, language, model);
    },

    review_text: async ({ text, requirements, model }: ReviewTextArgs) => {
        const { reviewExecutor } = await import('../executors/review_executor');
        return reviewExecutor.reviewText(text, requirements, model);
    }
};

// Tool runner class
export class ToolRunner {
    async executeTool(toolName: ToolName, args: any): Promise<any> {
        const tool = tools[toolName];
        if (!tool) {
            throw new Error(`Unknown tool: ${toolName}`);
        }

        try {
            await logger.info('Executing tool', { tool: toolName, args });
            const result = await tool(args);
            await logger.info('Tool execution completed', { tool: toolName, result });
            return result;
        } catch (error) {
            await logger.error('Tool execution failed', {
                tool: toolName,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
}

// Export singleton instance
export const toolRunner = new ToolRunner(); 
