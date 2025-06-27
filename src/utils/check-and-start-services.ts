#!/usr/bin/env bun

import { spawn } from 'child_process';
import { checkBananaBunServicesHealth, logServiceHealthStatus } from './service-health';

/**
 * Check if services are running and start them if needed
 */
async function checkAndStartServices(): Promise<void> {
    console.log('🔍 Checking service health...');

    const statuses = await checkBananaBunServicesHealth();
    await logServiceHealthStatus(statuses);

    const unhealthyServices = statuses.filter(s => !s.healthy);

    if (unhealthyServices.length === 0) {
        console.log('✅ All services are already running!');
        return;
    }

    console.log(`❌ ${unhealthyServices.length} services are not running:`);
    unhealthyServices.forEach(service => {
        console.log(`   - ${service.name}: ${service.error}`);
    });

    console.log('');
    console.log('🚀 Starting services automatically...');

    // Determine the correct script to run based on platform
    const isWindows = process.platform === 'win32';
    const scriptPath = isWindows ? './scripts/windows/start-services-windows.ps1' : './scripts/linux/start-services-linux.sh';

    if (isWindows) {
        // Run PowerShell script on Windows
        const powershell = spawn('powershell', [
            '-ExecutionPolicy', 'Bypass',
            '-File', scriptPath
        ], {
            stdio: 'inherit',
            shell: true
        });

        return new Promise((resolve, reject) => {
            powershell.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Services started successfully!');
                    resolve();
                } else {
                    console.log(`❌ Service startup failed with code ${code}`);
                    console.log('💡 You can manually start services with:');
                    console.log('   bun run dev:services');
                    reject(new Error(`Service startup failed with code ${code}`));
                }
            });

            powershell.on('error', (error) => {
                console.error('❌ Failed to start services:', error.message);
                console.log('💡 You can manually start services with:');
                console.log('   bun run dev:services');
                reject(error);
            });
        });
    } else {
        // Run bash script on Linux/macOS
        const bash = spawn('bash', [scriptPath], {
            stdio: 'inherit',
            shell: true
        });

        return new Promise((resolve, reject) => {
            bash.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Services started successfully!');
                    resolve();
                } else {
                    console.log(`❌ Service startup failed with code ${code}`);
                    console.log('💡 You can manually start services with:');
                    console.log('   ./start-services-linux.sh');
                    reject(new Error(`Service startup failed with code ${code}`));
                }
            });

            bash.on('error', (error) => {
                console.error('❌ Failed to start services:', error.message);
                console.log('💡 You can manually start services with:');
                console.log('   ./scripts/linux/start-services-linux.sh');
                reject(error);
            });
        });
    }
}

/**
 * Main function
 */
async function main(): Promise<void> {
    try {
        await checkAndStartServices();
        console.log('');
        console.log('🎉 Service check completed! Starting application...');
        console.log('');
    } catch (error) {
        console.error('❌ Service check failed:', error instanceof Error ? error.message : String(error));
        console.log('');
        console.log('⚠️ Continuing anyway - some functionality may be limited');
        console.log('');
        // Don't exit with error code to allow the main app to start
        // process.exit(1);
    }
}

// Run if this script is executed directly
if (import.meta.main) {
    main();
}
