import { ethers, BigNumber } from 'ethers';
import { MEVConfig, BundleTransaction, MEVBundle, NetworkConditions } from './types';
export declare class MEVProtection {
    private config;
    private cache;
    private provider;
    private flashbotsRelay;
    private bundleHistory;
    constructor(provider: ethers.providers.Provider, flashbotsRelay?: string, config?: Partial<MEVConfig>);
    /**
     * Create a MEV-protected transaction bundle
     */
    createProtectedBundle(transactions: BundleTransaction[], targetBlockOffset?: number): Promise<MEVBundle>;
    /**
     * Submit bundle to private mempool (Flashbots-style)
     */
    submitBundle(bundle: MEVBundle, signerWallet: ethers.Wallet): Promise<string>;
    /**
     * Check bundle inclusion status
     */
    checkBundleStatus(bundleId: string): Promise<{
        included: boolean;
        blockNumber?: number;
        transactionHashes?: string[];
        error?: string;
    }>;
    /**
     * Analyze MEV exposure for a transaction
     */
    analyzeMEVExposure(transaction: BundleTransaction): Promise<{
        riskLevel: 'low' | 'medium' | 'high';
        vulnerabilities: string[];
        recommendations: string[];
        estimatedMEVValue: BigNumber;
    }>;
    /**
     * Get optimal MEV protection parameters
     */
    getOptimalProtectionParams(networkConditions: NetworkConditions): Promise<{
        priorityFee: BigNumber;
        gasLimit: BigNumber;
        bundleDelay: number;
        usePrivateMempool: boolean;
    }>;
    /**
     * Update MEV protection configuration
     */
    updateConfig(newConfig: Partial<MEVConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): MEVConfig;
    private validateConfig;
    private validateTransactions;
    private applyMEVProtection;
    private simulateBundle;
    private generateBundleId;
    private prepareBundleSubmission;
    private submitToFlashbots;
    private getNetworkConditions;
    private isDEXTransaction;
    private isLiquidationTransaction;
    private estimateDEXMEVValue;
}
//# sourceMappingURL=MEVProtection.d.ts.map