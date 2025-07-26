import { SystemConfig, SystemStatus, TradeRequest, TradeResult, Alert } from '../types';
export declare class DeFiSystem {
    private config;
    private networkManager;
    private liquidityAggregator;
    private riskManager;
    private slippageProtection;
    private mevProtection;
    private gasOptimizer;
    private cache;
    private isInitialized;
    private startTime;
    private metrics;
    private alerts;
    private healthCheckInterval;
    constructor(config: SystemConfig);
    /**
     * Initialize the DeFi system
     */
    initialize(): Promise<void>;
    /**
     * Execute a trade with full protection suite
     */
    executeTrade(request: TradeRequest): Promise<TradeResult>;
    /**
     * Get current system status
     */
    getSystemStatus(): Promise<SystemStatus>;
    /**
     * Get system health summary
     */
    getHealthSummary(): Promise<{
        overall: 'healthy' | 'degraded' | 'unhealthy';
        networks: {
            healthy: number;
            total: number;
        };
        services: {
            healthy: number;
            total: number;
        };
        alerts: number;
        uptime: number;
    }>;
    /**
     * Get recent alerts
     */
    getRecentAlerts(limit?: number): Alert[];
    /**
     * Resolve an alert
     */
    resolveAlert(alertId: string): boolean;
    /**
     * Update system configuration
     */
    updateConfig(newConfig: Partial<SystemConfig>): void;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
    private validateTradeRequest;
    private getExecutionContext;
    private executeWithMEVProtection;
    private executeDirectTrade;
    private waitForHealthyNetwork;
    private getServiceStatuses;
    private isSystemHealthy;
    private updateMetrics;
    private startHealthMonitoring;
    private createAlert;
}
//# sourceMappingURL=DeFiSystem.d.ts.map