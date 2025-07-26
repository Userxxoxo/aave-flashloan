import { ethers, BigNumber } from 'ethers';
import { NetworkConfig, NetworkStatus, ValidationResult } from '../types';
export declare class NetworkManager {
    private networks;
    private providers;
    private networkStatus;
    private cache;
    private healthCheckInterval;
    constructor();
    /**
     * Add a network configuration
     */
    addNetwork(config: NetworkConfig): void;
    /**
     * Get network configuration
     */
    getNetwork(chainId: number): NetworkConfig | undefined;
    /**
     * Get all network configurations
     */
    getAllNetworks(): NetworkConfig[];
    /**
     * Get network provider
     */
    getProvider(chainId: number): ethers.providers.JsonRpcProvider | undefined;
    /**
     * Get network status
     */
    getNetworkStatus(chainId: number): NetworkStatus | undefined;
    /**
     * Get all network statuses
     */
    getAllNetworkStatuses(): Map<number, NetworkStatus>;
    /**
     * Check if network is healthy and available
     */
    isNetworkHealthy(chainId: number): Promise<boolean>;
    /**
     * Get healthy networks
     */
    getHealthyNetworks(): Promise<number[]>;
    /**
     * Get network balance for a specific address
     */
    getBalance(chainId: number, address: string): Promise<BigNumber>;
    /**
     * Get current gas price for network
     */
    getGasPrice(chainId: number): Promise<BigNumber>;
    /**
     * Get network latency
     */
    measureLatency(chainId: number): Promise<number>;
    /**
     * Update network status
     */
    updateNetworkStatus(chainId: number): Promise<void>;
    /**
     * Switch to best available network
     */
    getBestNetwork(supportedNetworks?: number[]): Promise<number | null>;
    /**
     * Validate network configuration
     */
    validateNetworkConfig(config: NetworkConfig): ValidationResult;
    /**
     * Start health monitoring for all networks
     */
    private startHealthMonitoring;
    /**
     * Stop health monitoring
     */
    stopHealthMonitoring(): void;
    /**
     * Initialize default network configurations
     */
    private initializeDefaultNetworks;
    /**
     * Validate URL format
     */
    private isValidUrl;
    /**
     * Cleanup resources
     */
    destroy(): void;
}
//# sourceMappingURL=NetworkManager.d.ts.map