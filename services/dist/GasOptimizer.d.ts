import { ethers, BigNumber } from 'ethers';
import { GasConfig, GasEstimate, NetworkConditions } from './types';
interface FeeHistory {
    baseFeePerGas: string[];
    gasUsedRatio: number[];
    reward: string[][];
    oldestBlock: number;
}
export declare class GasOptimizer {
    private config;
    private cache;
    private provider;
    private feeHistory;
    private maxHistorySize;
    constructor(provider: ethers.providers.Provider, config?: Partial<GasConfig>);
    /**
     * Get optimized gas estimate for a transaction
     */
    getOptimizedGasEstimate(transaction: ethers.providers.TransactionRequest, priority?: 'low' | 'medium' | 'high'): Promise<GasEstimate>;
    /**
     * Get EIP-1559 optimized fee data
     */
    getOptimizedFees(priority?: 'low' | 'medium' | 'high'): Promise<{
        maxFeePerGas: BigNumber;
        maxPriorityFeePerGas: BigNumber;
        baseFee: BigNumber;
    }>;
    /**
     * Estimate gas limit with buffer
     */
    estimateGasLimit(transaction: ethers.providers.TransactionRequest): Promise<BigNumber>;
    /**
     * Get current network conditions for gas optimization
     */
    getNetworkConditions(): Promise<NetworkConditions>;
    /**
     * Get fee history for analysis
     */
    getFeeHistory(blockCount?: number): Promise<FeeHistory>;
    /**
     * Analyze gas price trends
     */
    analyzeGasTrends(): Promise<{
        trend: 'increasing' | 'decreasing' | 'stable';
        volatility: 'low' | 'medium' | 'high';
        recommendation: string;
        averageBaseFee: BigNumber;
        averagePriorityFee: BigNumber;
    }>;
    /**
     * Update gas optimization configuration
     */
    updateConfig(newConfig: Partial<GasConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): GasConfig;
    /**
     * Get fee history statistics
     */
    getFeeHistoryStats(): {
        totalEntries: number;
        oldestEntry: number;
        newestEntry: number;
        averageBaseFee: string;
        averagePriorityFee: string;
    };
    private validateConfig;
    private isEstimateValid;
    private validateGasEstimate;
    private calculateConfidence;
    private predictNextBaseFee;
    private calculateOptimalPriorityFee;
    private getRecentFeeHistory;
    private calculateAverage;
    private calculateVariance;
    private startFeeHistoryCollection;
}
export {};
//# sourceMappingURL=GasOptimizer.d.ts.map