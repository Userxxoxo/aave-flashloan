"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkManager = void 0;
const ethers_1 = require("ethers");
const cache_1 = require("../utils/cache");
const errors_1 = require("../utils/errors");
const logger_1 = __importDefault(require("../utils/logger"));
class NetworkManager {
    constructor() {
        this.healthCheckInterval = null;
        this.networks = new Map();
        this.providers = new Map();
        this.networkStatus = new Map();
        this.cache = new cache_1.CacheManager(300); // 5 minute cache
        this.initializeDefaultNetworks();
        this.startHealthMonitoring();
        logger_1.default.info('NetworkManager initialized');
    }
    /**
     * Add a network configuration
     */
    addNetwork(config) {
        try {
            this.validateNetworkConfig(config);
            this.networks.set(config.chainId, config);
            // Initialize provider
            const provider = new ethers_1.ethers.providers.JsonRpcProvider(config.rpcUrl);
            this.providers.set(config.chainId, provider);
            // Initialize status
            this.networkStatus.set(config.chainId, {
                chainId: config.chainId,
                isHealthy: false,
                latency: 0,
                blockNumber: 0,
                gasPrice: ethers_1.BigNumber.from(0),
                balance: ethers_1.BigNumber.from(0),
                lastUpdate: 0,
                errorCount: 0
            });
            logger_1.default.info(`Network added: ${config.name} (${config.chainId})`);
        }
        catch (error) {
            logger_1.default.error('Failed to add network', { error, config });
            throw new errors_1.NetworkError('Failed to add network configuration', { error, config });
        }
    }
    /**
     * Get network configuration
     */
    getNetwork(chainId) {
        return this.networks.get(chainId);
    }
    /**
     * Get all network configurations
     */
    getAllNetworks() {
        return Array.from(this.networks.values());
    }
    /**
     * Get network provider
     */
    getProvider(chainId) {
        return this.providers.get(chainId);
    }
    /**
     * Get network status
     */
    getNetworkStatus(chainId) {
        return this.networkStatus.get(chainId);
    }
    /**
     * Get all network statuses
     */
    getAllNetworkStatuses() {
        return new Map(this.networkStatus);
    }
    /**
     * Check if network is healthy and available
     */
    async isNetworkHealthy(chainId) {
        try {
            const status = this.networkStatus.get(chainId);
            if (!status)
                return false;
            // Check if status is recent (within last 2 minutes)
            const isRecent = Date.now() - status.lastUpdate < 120000;
            return status.isHealthy && isRecent && status.errorCount < 5;
        }
        catch (error) {
            logger_1.default.warn(`Health check failed for network ${chainId}`, { error });
            return false;
        }
    }
    /**
     * Get healthy networks
     */
    async getHealthyNetworks() {
        const healthyNetworks = [];
        for (const chainId of this.networks.keys()) {
            if (await this.isNetworkHealthy(chainId)) {
                healthyNetworks.push(chainId);
            }
        }
        return healthyNetworks;
    }
    /**
     * Get network balance for a specific address
     */
    async getBalance(chainId, address) {
        try {
            const provider = this.providers.get(chainId);
            if (!provider) {
                throw new errors_1.NetworkError(`Provider not found for network ${chainId}`);
            }
            const cacheKey = `balance_${chainId}_${address}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
            const balance = await provider.getBalance(address);
            this.cache.set(cacheKey, balance, 30); // Cache for 30 seconds
            return balance;
        }
        catch (error) {
            logger_1.default.error(`Failed to get balance for network ${chainId}`, { error, address });
            throw new errors_1.NetworkError('Failed to get network balance', { error, chainId, address });
        }
    }
    /**
     * Get current gas price for network
     */
    async getGasPrice(chainId) {
        try {
            const provider = this.providers.get(chainId);
            if (!provider) {
                throw new errors_1.NetworkError(`Provider not found for network ${chainId}`);
            }
            const cacheKey = `gas_price_${chainId}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
            const gasPrice = await provider.getGasPrice();
            this.cache.set(cacheKey, gasPrice, 15); // Cache for 15 seconds
            return gasPrice;
        }
        catch (error) {
            logger_1.default.error(`Failed to get gas price for network ${chainId}`, { error });
            throw new errors_1.NetworkError('Failed to get gas price', { error, chainId });
        }
    }
    /**
     * Get network latency
     */
    async measureLatency(chainId) {
        try {
            const provider = this.providers.get(chainId);
            if (!provider) {
                throw new errors_1.NetworkError(`Provider not found for network ${chainId}`);
            }
            const startTime = Date.now();
            await provider.getBlockNumber();
            const endTime = Date.now();
            return endTime - startTime;
        }
        catch (error) {
            logger_1.default.warn(`Failed to measure latency for network ${chainId}`, { error });
            return 9999; // High latency indicates failure
        }
    }
    /**
     * Update network status
     */
    async updateNetworkStatus(chainId) {
        try {
            const provider = this.providers.get(chainId);
            const currentStatus = this.networkStatus.get(chainId);
            if (!provider || !currentStatus) {
                return;
            }
            const startTime = Date.now();
            // Perform health checks
            const [blockNumber, gasPrice, latency] = await Promise.all([
                provider.getBlockNumber().catch(() => 0),
                this.getGasPrice(chainId).catch(() => ethers_1.BigNumber.from(0)),
                this.measureLatency(chainId)
            ]);
            const isHealthy = blockNumber > 0 && latency < 5000; // 5 second timeout
            // Update status
            const updatedStatus = {
                ...currentStatus,
                isHealthy,
                latency,
                blockNumber,
                gasPrice,
                lastUpdate: Date.now(),
                errorCount: isHealthy ? Math.max(0, currentStatus.errorCount - 1) : currentStatus.errorCount + 1
            };
            this.networkStatus.set(chainId, updatedStatus);
            logger_1.default.debug(`Network status updated for ${chainId}`, {
                isHealthy,
                latency,
                blockNumber,
                errorCount: updatedStatus.errorCount
            });
        }
        catch (error) {
            const currentStatus = this.networkStatus.get(chainId);
            if (currentStatus) {
                this.networkStatus.set(chainId, {
                    ...currentStatus,
                    isHealthy: false,
                    errorCount: currentStatus.errorCount + 1,
                    lastUpdate: Date.now()
                });
            }
            logger_1.default.error(`Failed to update network status for ${chainId}`, { error });
        }
    }
    /**
     * Switch to best available network
     */
    async getBestNetwork(supportedNetworks) {
        try {
            const networksToCheck = supportedNetworks || Array.from(this.networks.keys());
            let bestNetwork = null;
            let bestScore = -1;
            for (const chainId of networksToCheck) {
                const status = this.networkStatus.get(chainId);
                if (!status || !status.isHealthy)
                    continue;
                // Calculate network score based on latency and error count
                const latencyScore = Math.max(0, 100 - (status.latency / 50)); // Lower latency = higher score
                const errorScore = Math.max(0, 100 - (status.errorCount * 10)); // Fewer errors = higher score
                const totalScore = (latencyScore + errorScore) / 2;
                if (totalScore > bestScore) {
                    bestScore = totalScore;
                    bestNetwork = chainId;
                }
            }
            logger_1.default.debug('Best network selected', { bestNetwork, bestScore });
            return bestNetwork;
        }
        catch (error) {
            logger_1.default.error('Failed to select best network', { error });
            return null;
        }
    }
    /**
     * Validate network configuration
     */
    validateNetworkConfig(config) {
        const errors = [];
        const warnings = [];
        // Validate required fields
        if (!config.chainId || config.chainId <= 0) {
            errors.push('Invalid chain ID');
        }
        if (!config.name || config.name.trim().length === 0) {
            errors.push('Network name is required');
        }
        if (!config.rpcUrl || !this.isValidUrl(config.rpcUrl)) {
            errors.push('Invalid RPC URL');
        }
        if (!config.nativeCurrency || !config.nativeCurrency.symbol) {
            errors.push('Native currency configuration is required');
        }
        if (config.gasMultiplier <= 0 || config.gasMultiplier > 5) {
            errors.push('Gas multiplier must be between 0 and 5');
        }
        if (config.maxGasPrice.lte(0)) {
            errors.push('Max gas price must be greater than 0');
        }
        if (config.initialBalance.lte(0)) {
            errors.push('Initial balance must be greater than 0');
        }
        // Validate arrays
        if (!Array.isArray(config.supportedDEXs)) {
            errors.push('Supported DEXs must be an array');
        }
        if (!Array.isArray(config.supportedTokens)) {
            errors.push('Supported tokens must be an array');
        }
        // Warnings
        if (config.gasMultiplier > 2) {
            warnings.push('High gas multiplier may result in expensive transactions');
        }
        if (config.supportedDEXs.length === 0) {
            warnings.push('No supported DEXs configured');
        }
        const result = {
            isValid: errors.length === 0,
            errors,
            warnings
        };
        if (!result.isValid) {
            throw new errors_1.ValidationError('Invalid network configuration', { errors, warnings });
        }
        return result;
    }
    /**
     * Start health monitoring for all networks
     */
    startHealthMonitoring() {
        // Update network status every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            const updatePromises = Array.from(this.networks.keys()).map(chainId => this.updateNetworkStatus(chainId));
            // Use Promise.all with error handling for Node.js 12 compatibility
            for (const promise of updatePromises) {
                try {
                    await promise;
                }
                catch (error) {
                    logger_1.default.debug('Network status update failed', { error: error instanceof Error ? error.message : String(error) });
                }
            }
        }, 30000);
        logger_1.default.info('Network health monitoring started');
    }
    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger_1.default.info('Network health monitoring stopped');
        }
    }
    /**
     * Initialize default network configurations
     */
    initializeDefaultNetworks() {
        const defaultNetworks = [
            {
                chainId: 1,
                name: 'Ethereum Mainnet',
                rpcUrl: 'https://eth-mainnet.alchemyapi.io/v2/demo',
                nativeCurrency: {
                    name: 'Ether',
                    symbol: 'ETH',
                    decimals: 18
                },
                blockExplorer: 'https://etherscan.io',
                gasMultiplier: 1.2,
                maxGasPrice: ethers_1.ethers.utils.parseUnits('100', 'gwei'),
                initialBalance: ethers_1.ethers.utils.parseEther('0.02'),
                supportedDEXs: ['uniswap', '1inch', '0x'],
                supportedTokens: ['USDC', 'USDT', 'DAI', 'WETH']
            },
            {
                chainId: 137,
                name: 'Polygon',
                rpcUrl: 'https://polygon-rpc.com',
                nativeCurrency: {
                    name: 'MATIC',
                    symbol: 'MATIC',
                    decimals: 18
                },
                blockExplorer: 'https://polygonscan.com',
                gasMultiplier: 1.1,
                maxGasPrice: ethers_1.ethers.utils.parseUnits('500', 'gwei'),
                initialBalance: ethers_1.ethers.utils.parseEther('50'),
                supportedDEXs: ['quickswap', 'sushiswap', '1inch'],
                supportedTokens: ['USDC', 'USDT', 'DAI', 'WMATIC']
            },
            {
                chainId: 42161,
                name: 'Arbitrum One',
                rpcUrl: 'https://arb1.arbitrum.io/rpc',
                nativeCurrency: {
                    name: 'Ether',
                    symbol: 'ETH',
                    decimals: 18
                },
                blockExplorer: 'https://arbiscan.io',
                gasMultiplier: 1.1,
                maxGasPrice: ethers_1.ethers.utils.parseUnits('10', 'gwei'),
                initialBalance: ethers_1.ethers.utils.parseEther('0.02'),
                supportedDEXs: ['uniswap', 'sushiswap', '1inch'],
                supportedTokens: ['USDC', 'USDT', 'DAI', 'WETH']
            },
            {
                chainId: 10,
                name: 'Optimism',
                rpcUrl: 'https://mainnet.optimism.io',
                nativeCurrency: {
                    name: 'Ether',
                    symbol: 'ETH',
                    decimals: 18
                },
                blockExplorer: 'https://optimistic.etherscan.io',
                gasMultiplier: 1.1,
                maxGasPrice: ethers_1.ethers.utils.parseUnits('10', 'gwei'),
                initialBalance: ethers_1.ethers.utils.parseEther('0.02'),
                supportedDEXs: ['uniswap', 'velodrome', '1inch'],
                supportedTokens: ['USDC', 'USDT', 'DAI', 'WETH']
            }
        ];
        for (const config of defaultNetworks) {
            this.addNetwork(config);
        }
    }
    /**
     * Validate URL format
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    /**
     * Cleanup resources
     */
    destroy() {
        this.stopHealthMonitoring();
        this.networks.clear();
        this.providers.clear();
        this.networkStatus.clear();
        logger_1.default.info('NetworkManager destroyed');
    }
}
exports.NetworkManager = NetworkManager;
//# sourceMappingURL=NetworkManager.js.map