/**
 * Health Check Utility for TypeScript Services
 *
 * Provides comprehensive health monitoring capabilities for all services
 */
/// <reference types="node" />
import express from 'express';
export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    version: string;
    service: string;
    checks: HealthCheck[];
    metrics?: ServiceMetrics;
}
export interface HealthCheck {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    duration?: number;
    details?: any;
}
export interface ServiceMetrics {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
    lastRequestTime?: string | undefined;
}
export declare class HealthChecker {
    private serviceName;
    private version;
    private startTime;
    private checks;
    private metrics;
    private requestCount;
    private errorCount;
    private responseTimes;
    private lastRequestTime?;
    constructor(serviceName: string, version?: string);
    private registerDefaultChecks;
    addCheck(name: string, checkFunction: () => Promise<HealthCheck>): void;
    removeCheck(name: string): void;
    performHealthCheck(): Promise<HealthStatus>;
    private determineOverallStatus;
    private updateMetrics;
    private calculateAverageResponseTime;
    private formatUptime;
    trackRequest(): (req: express.Request, res: express.Response, next: express.NextFunction) => void;
    getHealthHandler(): (req: express.Request, res: express.Response) => Promise<void>;
    getMetricsHandler(): (req: express.Request, res: express.Response) => void;
    getCurrentStatus(): Partial<HealthStatus>;
}
export declare function createHealthApp(serviceName: string, version?: string, port?: number): express.Application;
export default HealthChecker;
//# sourceMappingURL=health-check.d.ts.map