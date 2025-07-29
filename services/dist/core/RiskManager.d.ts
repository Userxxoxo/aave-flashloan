import { BigNumber } from 'ethers';
import { RiskConfig, RiskMetrics, RiskAssessment, TradeRequest, NetworkConditions } from '../types';
interface PositionData {
    tokenAddress: string;
    amount: BigNumber;
    entryPrice: BigNumber;
    timestamp: number;
    networkId: number;
}
interface TradeHistory {
    timestamp: number;
    tokenIn: string;
    tokenOut: string;
    amountIn: BigNumber;
    amountOut: BigNumber;
    profit: BigNumber;
    gasUsed: BigNumber;
    networkId: number;
    success: boolean;
}
export declare class RiskManager {
    private config;
    private cache;
    private positions;
    private tradeHistory;
    private dailyPnL;
    private maxHistorySize;
    constructor(config?: Partial<RiskConfig>);
    /**
     * Assess risk for a trade request
     */
    assessTradeRisk(request: TradeRequest, networkConditions: NetworkConditions): Promise<RiskAssessment>;
    /**
     * Calculate current risk metrics
     */
    calculateRiskMetrics(): Promise<RiskMetrics>;
    /**
     * Record a completed trade
     */
    recordTrade(request: TradeRequest, amountOut: BigNumber, gasUsed: BigNumber, success: boolean): void;
    /**
     * Check if position limits are exceeded
     */
    checkPositionLimits(tokenAddress: string, additionalAmount: BigNumber): boolean;
    /**
     * Update position data
     */
    updatePosition(tokenAddress: string, amount: BigNumber, price: BigNumber, networkId: number): void;
    /**
     * Get current positions
     */
    getCurrentPositions(): Map<string, PositionData>;
    /**
     * Get trade history
     */
    getTradeHistory(limit?: number): TradeHistory[];
    private assessPositionSizeRisk;
    private assessDailyLossRisk;
    private assessDrawdownRisk;
    private assessVolatilityRisk;
    private assessSlippageRisk;
    private assessNetworkRisk;
    private getFactorScore;
    private calculateRiskLevel;
    private shouldProceedWithTrade;
    private calculateMaxAllowedSize;
    private generateRiskRecommendations;
    private calculateCurrentExposure;
    private calculateDailyPnL;
    private calculateCurrentDrawdown;
    private calculateSharpeRatio;
    private calculateVolatility;
    private calculateValueAtRisk;
    private calculateMaxDrawdown;
    private calculateWinRate;
    private calculateProfitVariance;
    private validateConfig;
    /**
     * Update risk configuration
     */
    updateConfig(newConfig: Partial<RiskConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): RiskConfig;
    /**
     * Cleanup resources
     */
    destroy(): void;
}
export {};
//# sourceMappingURL=RiskManager.d.ts.map