import { ethers, BigNumber } from 'ethers';
import { 
  NetworkConfig, 
  NetworkStatus, 
  ValidationResult 
} from '../types';
import { CacheManager } from '../utils/cache';
import { NetworkError, ValidationError } from '../utils/errors';
import logger from '../utils/logger';

export class NetworkManager {
  private networks: Map<number, NetworkConfig>;
  private providers: Map<number, ethers.providers.JsonRpcProvider>;
  private networkStatus: Map<number, NetworkStatus>;
  private cache: CacheManager;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.networks = new Map();
    this.providers = new Map();
    this.networkStatus = new Map();
    this.cache = new CacheManager(300); // 5 minute cache
    
    this.initializeDefaultNetworks();
    this.startHealthMonitoring();
    
    logger.info('NetworkManager initialized');
  }

  /**
   * Add a network configuration
   */
  addNetwork(config: NetworkConfig): void {
    try {
      this.validateNetworkConfig(config);
      
      this.networks.set(config.chainId, config);
      
      // Initialize provider
      const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
      this.providers.set(config.chainId, provider);
      
      // Initialize status
      this.networkStatus.set(config.chainId, {
        chainId: config.chainId,
        isHealthy: false,
        latency: 0,
        blockNumber: 0,
        gasPrice: BigNumber.from(0),
        balance: BigNumber.from(0),
        lastUpdate: 0,
        errorCount: 0
      });

      logger.info(`Network added: ${config.name} (${config.chainId})`);
    } catch (error) {
      logger.error('Failed to add network', { error, config });
      throw new NetworkError('Failed to add network configuration', { error, config });
    }
  }

  /**
   * Get network configuration
   */
  getNetwork(chainId: number): NetworkConfig | undefined {
    return this.networks.get(chainId);
  }

  /**
   * Get all network configurations
   */
  getAllNetworks(): NetworkConfig[] {
    return Array.from(this.networks.values());
  }

  /**
   * Get network provider
   */
  getProvider(chainId: number): ethers.providers.JsonRpcProvider | undefined {
    return this.providers.get(chainId);
  }

  /**
   * Get network status
   */
  getNetworkStatus(chainId: number): NetworkStatus | undefined {
    return this.networkStatus.get(chainId);
  }

  /**
   * Get all network statuses
   */
  getAllNetworkStatuses(): Map<number, NetworkStatus> {
    return new Map(this.networkStatus);
  }

  /**
   * Check if network is healthy and available
   */
  async isNetworkHealthy(chainId: number): Promise<boolean> {
    try {
      const status = this.networkStatus.get(chainId);
      if (!status) return false;

      // Check if status is recent (within last 2 minutes)
      const isRecent = Date.now() - status.lastUpdate < 120000;
      
      return status.isHealthy && isRecent && status.errorCount < 5;
    } catch (error) {
      logger.warn(`Health check failed for network ${chainId}`, { error });
      return false;
    }
  }

  /**
   * Get healthy networks
   */
  async getHealthyNetworks(): Promise<number[]> {
    const healthyNetworks: number[] = [];
    
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
  async getBalance(chainId: number, address: string): Promise<BigNumber> {
    try {
      const provider = this.providers.get(chainId);
      if (!provider) {
        throw new NetworkError(`Provider not found for network ${chainId}`);
      }

      const cacheKey = `balance_${chainId}_${address}`;
      const cached = this.cache.get<BigNumber>(cacheKey);
      
      if (cached) {
        return cached;
      }

      const balance = await provider.getBalance(address);
      this.cache.set(cacheKey, balance, 30); // Cache for 30 seconds
      
      return balance;
    } catch (error) {
      logger.error(`Failed to get balance for network ${chainId}`, { error, address });
      throw new NetworkError('Failed to get network balance', { error, chainId, address });
    }
  }

  /**
   * Get current gas price for network
   */
  async getGasPrice(chainId: number): Promise<BigNumber> {
    try {
      const provider = this.providers.get(chainId);
      if (!provider) {
        throw new NetworkError(`Provider not found for network ${chainId}`);
      }

      const cacheKey = `gas_price_${chainId}`;
      const cached = this.cache.get<BigNumber>(cacheKey);
      
      if (cached) {
        return cached;
      }

      const gasPrice = await provider.getGasPrice();
      this.cache.set(cacheKey, gasPrice, 15); // Cache for 15 seconds
      
      return gasPrice;
    } catch (error) {
      logger.error(`Failed to get gas price for network ${chainId}`, { error });
      throw new NetworkError('Failed to get gas price', { error, chainId });
    }
  }

  /**
   * Get network latency
   */
  async measureLatency(chainId: number): Promise<number> {
    try {
      const provider = this.providers.get(chainId);
      if (!provider) {
        throw new NetworkError(`Provider not found for network ${chainId}`);
      }

      const startTime = Date.now();
      await provider.getBlockNumber();
      const endTime = Date.now();
      
      return endTime - startTime;
    } catch (error) {
      logger.warn(`Failed to measure latency for network ${chainId}`, { error });
      return 9999; // High latency indicates failure
    }
  }

  /**
   * Update network status
   */
  async updateNetworkStatus(chainId: number): Promise<void> {
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
        this.getGasPrice(chainId).catch(() => BigNumber.from(0)),
        this.measureLatency(chainId)
      ]);

      const isHealthy = blockNumber > 0 && latency < 5000; // 5 second timeout
      
      // Update status
      const updatedStatus: NetworkStatus = {
        ...currentStatus,
        isHealthy,
        latency,
        blockNumber,
        gasPrice,
        lastUpdate: Date.now(),
        errorCount: isHealthy ? Math.max(0, currentStatus.errorCount - 1) : currentStatus.errorCount + 1
      };

      this.networkStatus.set(chainId, updatedStatus);

      logger.debug(`Network status updated for ${chainId}`, {
        isHealthy,
        latency,
        blockNumber,
        errorCount: updatedStatus.errorCount
      });

    } catch (error) {
      const currentStatus = this.networkStatus.get(chainId);
      if (currentStatus) {
        this.networkStatus.set(chainId, {
          ...currentStatus,
          isHealthy: false,
          errorCount: currentStatus.errorCount + 1,
          lastUpdate: Date.now()
        });
      }
      
      logger.error(`Failed to update network status for ${chainId}`, { error });
    }
  }

  /**
   * Switch to best available network
   */
  async getBestNetwork(supportedNetworks?: number[]): Promise<number | null> {
    try {
      const networksToCheck = supportedNetworks || Array.from(this.networks.keys());
      let bestNetwork: number | null = null;
      let bestScore = -1;

      for (const chainId of networksToCheck) {
        const status = this.networkStatus.get(chainId);
        if (!status || !status.isHealthy) continue;

        // Calculate network score based on latency and error count
        const latencyScore = Math.max(0, 100 - (status.latency / 50)); // Lower latency = higher score
        const errorScore = Math.max(0, 100 - (status.errorCount * 10)); // Fewer errors = higher score
        const totalScore = (latencyScore + errorScore) / 2;

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestNetwork = chainId;
        }
      }

      logger.debug('Best network selected', { bestNetwork, bestScore });
      return bestNetwork;
    } catch (error) {
      logger.error('Failed to select best network', { error });
      return null;
    }
  }

  /**
   * Validate network configuration
   */
  validateNetworkConfig(config: NetworkConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

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
      throw new ValidationError('Invalid network configuration', { errors, warnings });
    }

    return result;
  }

  /**
   * Start health monitoring for all networks
   */
  private startHealthMonitoring(): void {
    // Update network status every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      const updatePromises = Array.from(this.networks.keys()).map(chainId => 
        this.updateNetworkStatus(chainId)
      );
      
      // Use Promise.all with error handling for Node.js 12 compatibility
      for (const promise of updatePromises) {
        try {
          await promise;
        } catch (error) {
          logger.debug('Network status update failed', { error: error instanceof Error ? error.message : String(error) });
        }
      }
    }, 30000);

    logger.info('Network health monitoring started');
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Network health monitoring stopped');
    }
  }

  /**
   * Initialize default network configurations
   */
  private initializeDefaultNetworks(): void {
    const defaultNetworks: NetworkConfig[] = [
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
        maxGasPrice: ethers.utils.parseUnits('100', 'gwei'),
        initialBalance: ethers.utils.parseEther('0.02'), // ~$50 USD
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
        maxGasPrice: ethers.utils.parseUnits('500', 'gwei'),
        initialBalance: ethers.utils.parseEther('50'), // ~$50 USD
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
        maxGasPrice: ethers.utils.parseUnits('10', 'gwei'),
        initialBalance: ethers.utils.parseEther('0.02'), // ~$50 USD
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
        maxGasPrice: ethers.utils.parseUnits('10', 'gwei'),
        initialBalance: ethers.utils.parseEther('0.02'), // ~$50 USD
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
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHealthMonitoring();
    this.networks.clear();
    this.providers.clear();
    this.networkStatus.clear();
    logger.info('NetworkManager destroyed');
  }
}