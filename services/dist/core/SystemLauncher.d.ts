/// <reference types="node" />
import { SystemConfig } from '../types';
import { DeFiSystem } from './DeFiSystem';
interface LauncherConfig {
    environment: 'development' | 'staging' | 'production';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    enableMetrics: boolean;
    enableAlerts: boolean;
    gracefulShutdownTimeout: number;
}
interface PerformanceMetrics {
    startupTime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    systemUptime: number;
    lastHealthCheck: number;
}
export declare class SystemLauncher {
    private system;
    private config;
    private performanceMetrics;
    private isShuttingDown;
    private healthCheckInterval;
    private metricsInterval;
    constructor(config?: Partial<LauncherConfig>);
    /**
     * Launch the DeFi system with full configuration
     */
    launch(): Promise<DeFiSystem>;
    /**
     * Get system performance metrics
     */
    getPerformanceMetrics(): PerformanceMetrics;
    /**
     * Get system health report
     */
    getHealthReport(): Promise<{
        system: any;
        performance: PerformanceMetrics;
        environment: string;
        uptime: number;
    }>;
    /**
     * Gracefully shutdown the system
     */
    shutdown(): Promise<void>;
    /**
     * Restart the system
     */
    restart(): Promise<DeFiSystem>;
    /**
     * Update system configuration and restart if needed
     */
    updateConfiguration(newConfig: Partial<SystemConfig>): Promise<void>;
    private createSystemConfig;
    private createNetworkConfigs;
    private createSlippageConfig;
    private createMEVConfig;
    private createGasConfig;
    private createRiskConfig;
    private createMonitoringConfig;
    private setupProcessHandlers;
    private startPerformanceMonitoring;
    private startHealthMonitoring;
    /**
     * Get launcher configuration
     */
    getConfig(): LauncherConfig;
    /**
     * Check if system is running
     */
    isRunning(): boolean;
    /**
     * Get system instance (if running)
     */
    getSystem(): DeFiSystem | null;
}
export {};
//# sourceMappingURL=SystemLauncher.d.ts.map