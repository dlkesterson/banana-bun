#!/usr/bin/env bun
/**
 * Cross-platform script runner for Banana Bun
 * Replaces Node.js-based cross-platform execution with Bun
 */

import { spawn } from 'bun';
import { join } from 'path';

const isWindows = process.platform === 'win32';

async function runScript(scriptType: string): Promise<void> {
    let command: string[];
    let scriptPath: string;

    switch (scriptType) {
        case 'setup':
            if (isWindows) {
                command = ['cmd', '/c'];
                scriptPath = 'setup.bat';
            } else {
                command = ['bash'];
                scriptPath = 'setup.sh';
            }
            break;

        case 'start-services':
            if (isWindows) {
                command = ['cmd', '/c'];
                scriptPath = 'start-services.bat';
            } else {
                command = ['bash'];
                scriptPath = 'start-services.sh';
            }
            break;

        case 'stop-services':
            if (isWindows) {
                command = ['cmd', '/c'];
                scriptPath = 'stop-services.bat';
            } else {
                command = ['bash'];
                scriptPath = 'stop-services.sh';
            }
            break;

        case 'check-coverage':
            if (isWindows) {
                command = ['powershell', '-ExecutionPolicy', 'Bypass', '-File'];
                scriptPath = 'check-coverage.ps1';
            } else {
                command = ['bash'];
                scriptPath = 'check-coverage.sh';
            }
            break;

        default:
            console.error(`Unknown script type: ${scriptType}`);
            process.exit(1);
    }

    try {
        const fullScriptPath = join(process.cwd(), 'scripts', scriptPath);
        const proc = spawn({
            cmd: [...command, fullScriptPath],
            stdio: ['inherit', 'inherit', 'inherit'],
            cwd: process.cwd()
        });

        const exitCode = await proc.exited;
        if (exitCode !== 0) {
            console.error(`Script ${scriptType} failed with exit code ${exitCode}`);
            process.exit(exitCode);
        }
    } catch (error) {
        console.error(`Failed to run script ${scriptType}:`, error);
        process.exit(1);
    }
}

// Get script type from command line arguments
const scriptType = process.argv[2];

if (!scriptType) {
    console.error('Usage: bun run scripts/cross-platform-runner.ts <script-type>');
    console.error('Available script types: setup, start-services, stop-services');
    process.exit(1);
}

// Run the script
runScript(scriptType).catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
