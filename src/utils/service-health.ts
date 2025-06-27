import { logger } from './logger';

export interface ServiceHealthStatus {
    name: string;
    url: string;
    healthy: boolean;
    responseTime?: number;
    error?: string;
    lastChecked: Date;
}

export interface ServiceHealthConfig {
    name: string;
    url: string;
    timeoutMs?: number;
    retries?: number;
    retryDelayMs?: number;
}

/**
 * Check if a service is healthy by making an HTTP request
 */
export async function checkServiceHealth(config: ServiceHealthConfig): Promise<ServiceHealthStatus> {
    const startTime = Date.now();
    const timeoutMs = config.timeoutMs || 5000;
    const retries = config.retries || 0;
    const retryDelayMs = config.retryDelayMs || 1000;

    let lastError: string | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(config.url, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Banana-Bun-Health-Check/1.0'
                }
            });

            clearTimeout(timeoutId);
            const responseTime = Date.now() - startTime;

            if (response.ok) {
                return {
                    name: config.name,
                    url: config.url,
                    healthy: true,
                    responseTime,
                    lastChecked: new Date()
                };
            } else {
                lastError = `HTTP ${response.status}: ${response.statusText}`;
            }
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    lastError = `Timeout after ${timeoutMs}ms`;
                } else {
                    lastError = error.message;
                }
            } else {
                lastError = String(error);
            }
        }

        // Wait before retry (except on last attempt)
        if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
    }

    return {
        name: config.name,
        url: config.url,
        healthy: false,
        error: lastError,
        lastChecked: new Date()
    };
}

/**
 * Check health of multiple services concurrently
 */
export async function checkMultipleServicesHealth(configs: ServiceHealthConfig[]): Promise<ServiceHealthStatus[]> {
    const promises = configs.map(config => checkServiceHealth(config));
    return Promise.all(promises);
}

/**
 * Default service configurations for Banana Bun
 */
export const DEFAULT_SERVICES: ServiceHealthConfig[] = [
    {
        name: 'Ollama',
        url: 'http://localhost:11434/api/tags',
        timeoutMs: 5000,
        retries: 2,
        retryDelayMs: 1000
    },
    {
        name: 'ChromaDB',
        url: 'http://localhost:8000/api/v1/heartbeat',
        timeoutMs: 5000,
        retries: 2,
        retryDelayMs: 1000
    },
    {
        name: 'MeiliSearch',
        url: 'http://localhost:7700/health',
        timeoutMs: 5000,
        retries: 2,
        retryDelayMs: 1000
    }
];

/**
 * Check health of all default Banana Bun services
 */
export async function checkBananaBunServicesHealth(): Promise<ServiceHealthStatus[]> {
    return checkMultipleServicesHealth(DEFAULT_SERVICES);
}

/**
 * Wait for a service to become healthy
 */
export async function waitForServiceHealth(
    config: ServiceHealthConfig,
    maxWaitMs: number = 60000,
    checkIntervalMs: number = 2000
): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
        const status = await checkServiceHealth(config);
        
        if (status.healthy) {
            await logger.info(`Service ${config.name} is now healthy`, {
                service: config.name,
                url: config.url,
                responseTime: status.responseTime
            });
            return true;
        }

        await logger.info(`Waiting for service ${config.name} to become healthy...`, {
            service: config.name,
            url: config.url,
            error: status.error,
            elapsed: Date.now() - startTime
        });

        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }

    await logger.error(`Service ${config.name} did not become healthy within timeout`, {
        service: config.name,
        url: config.url,
        timeoutMs: maxWaitMs
    });

    return false;
}

/**
 * Wait for multiple services to become healthy
 */
export async function waitForMultipleServicesHealth(
    configs: ServiceHealthConfig[],
    maxWaitMs: number = 60000,
    checkIntervalMs: number = 2000
): Promise<{ [serviceName: string]: boolean }> {
    const results: { [serviceName: string]: boolean } = {};
    
    const promises = configs.map(async (config) => {
        const healthy = await waitForServiceHealth(config, maxWaitMs, checkIntervalMs);
        results[config.name] = healthy;
        return { name: config.name, healthy };
    });

    await Promise.all(promises);
    return results;
}

/**
 * Get a summary of service health statuses
 */
export function getServiceHealthSummary(statuses: ServiceHealthStatus[]): {
    total: number;
    healthy: number;
    unhealthy: number;
    healthyServices: string[];
    unhealthyServices: string[];
} {
    const healthy = statuses.filter(s => s.healthy);
    const unhealthy = statuses.filter(s => !s.healthy);

    return {
        total: statuses.length,
        healthy: healthy.length,
        unhealthy: unhealthy.length,
        healthyServices: healthy.map(s => s.name),
        unhealthyServices: unhealthy.map(s => s.name)
    };
}

/**
 * Log service health status in a formatted way
 */
export async function logServiceHealthStatus(statuses: ServiceHealthStatus[]): Promise<void> {
    const summary = getServiceHealthSummary(statuses);
    
    await logger.info('Service health check completed', {
        total: summary.total,
        healthy: summary.healthy,
        unhealthy: summary.unhealthy
    });

    for (const status of statuses) {
        if (status.healthy) {
            await logger.info(`✅ ${status.name} is healthy`, {
                service: status.name,
                url: status.url,
                responseTime: status.responseTime
            });
        } else {
            await logger.error(`❌ ${status.name} is unhealthy`, {
                service: status.name,
                url: status.url,
                error: status.error
            });
        }
    }
}

/**
 * Check if all critical services are healthy
 */
export async function areAllCriticalServicesHealthy(
    criticalServices: string[] = ['Ollama', 'ChromaDB', 'MeiliSearch']
): Promise<boolean> {
    const statuses = await checkBananaBunServicesHealth();
    const criticalStatuses = statuses.filter(s => criticalServices.includes(s.name));
    
    return criticalStatuses.every(s => s.healthy);
}

/**
 * Startup health check - ensures all services are ready before starting the application
 */
export async function performStartupHealthCheck(): Promise<{
    success: boolean;
    healthyServices: string[];
    unhealthyServices: string[];
    message: string;
}> {
    await logger.info('🔍 Performing startup health check...');
    
    const statuses = await checkBananaBunServicesHealth();
    await logServiceHealthStatus(statuses);
    
    const summary = getServiceHealthSummary(statuses);
    
    if (summary.unhealthy === 0) {
        const message = `All ${summary.total} services are healthy and ready!`;
        await logger.info(`✅ ${message}`);
        return {
            success: true,
            healthyServices: summary.healthyServices,
            unhealthyServices: summary.unhealthyServices,
            message
        };
    } else {
        const message = `${summary.unhealthy} of ${summary.total} services are unhealthy. Please start missing services.`;
        await logger.warn(`⚠️ ${message}`, {
            unhealthyServices: summary.unhealthyServices
        });
        return {
            success: false,
            healthyServices: summary.healthyServices,
            unhealthyServices: summary.unhealthyServices,
            message
        };
    }
}
