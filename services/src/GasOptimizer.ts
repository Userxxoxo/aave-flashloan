import { ethers, BigNumber } from 'ethers';
import { 
  GasConfig, 
  GasEstimate, 
  NetworkConditions 
} from './types';
import { CacheManager } from './utils/cache';
import { GasEstimationError, NetworkError, ValidationError } from './utils/errors';
import logger from './utils/logger';

interface HistoricalFeeData {
  baseFee: BigNumber;
  priorityFee: BigNumber;
  gasUsed: number;
  timestamp: number;
  blockNumber: number;
}

interface FeeHistory {
  baseFeePerGas: string[];
  gasUsedRatio: number[];
  reward: string[][];
  oldestBlock: number;
}

export class GasOptimizer {
  private config: GasConfig;
  private cache: CacheManager;
  private provider: ethers.providers.Provider;
  private feeHistory: HistoricalFeeData[];
  private maxHistorySize: number = 100;

  constructor(
    provider: ethers.providers.Provider,
    config?: Partial<GasConfig>
  ) {
    this.provider = provider;
    this.config = {
      baseFeeMultiplier: 1.125, // 12.5% above base fee
      priorityFeeMultiplier: 1.2, // 20% above median priority fee
      gasLimitBuffer: 20, // 20% buffer
      cacheTimeout: 60, // 1 minute cache
      maxGasPrice: ethers.utils.parseUnits('100', 'gwei'),
      ...config
    };
    
    this.cache = new CacheManager(this.config.cacheTimeout);
    this.feeHistory = [];
    
    this.validateConfig();
    this.startFeeHistoryCollection();
    
    logger.info('GasOptimizer initialized', { config: this.config });
  }

  /**
   * Get optimized gas estimate for a transaction
   */
  async getOptimizedGasEstimate(
    transaction: ethers.providers.TransactionRequest,
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<GasEstimate> {
    try {
      const cacheKey = `gas_estimate_${JSON.stringify(transaction)}_${priority}`;
      const cached = this.cache.get<GasEstimate>(cacheKey);
      
      if (cached && this.isEstimateValid(cached)) {
        logger.debug('Using cached gas estimate', { cacheKey });
        return cached;
      }

      // Get base gas estimate
      const gasLimit = await this.estimateGasLimit(transaction);
      
      // Get optimized fees
      const feeData = await this.getOptimizedFees(priority);
      
      // Calculate total estimated cost
      const estimatedCost = gasLimit.mul(feeData.maxFeePerGas);
      
      // Determine confidence based on network conditions
      const confidence = await this.calculateConfidence();

      const estimate: GasEstimate = {
        gasLimit,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        baseFee: feeData.baseFee,
        estimatedCost,
        confidence,
        timestamp: Date.now()
      };

      // Validate estimate doesn't exceed maximum
      this.validateGasEstimate(estimate);

      // Cache the estimate
      this.cache.set(cacheKey, estimate, this.config.cacheTimeout);

      logger.debug('Gas estimate calculated', {
        gasLimit: gasLimit.toString(),
        maxFeePerGas: ethers.utils.formatUnits(feeData.maxFeePerGas, 'gwei'),
        maxPriorityFeePerGas: ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, 'gwei'),
        estimatedCost: ethers.utils.formatEther(estimatedCost),
        confidence,
        priority
      });

      return estimate;
    } catch (error) {
      logger.error('Failed to get optimized gas estimate', { error, transaction });
      throw new GasEstimationError('Failed to get optimized gas estimate', { error });
    }
  }

  /**
   * Get EIP-1559 optimized fee data
   */
  async getOptimizedFees(priority: 'low' | 'medium' | 'high' = 'medium'): Promise<{
    maxFeePerGas: BigNumber;
    maxPriorityFeePerGas: BigNumber;
    baseFee: BigNumber;
  }> {
    try {
      const cacheKey = `optimized_fees_${priority}`;
      const cached = this.cache.get<any>(cacheKey);
      
      if (cached) {
        return cached;
      }

      // Get current network conditions
      const networkConditions = await this.getNetworkConditions();
      const historicalData = this.getRecentFeeHistory(20); // Last 20 blocks

      // Calculate base fee prediction for next block
      const predictedBaseFee = this.predictNextBaseFee(networkConditions);
      
      // Calculate optimal priority fee based on priority level and historical data
      const optimalPriorityFee = this.calculateOptimalPriorityFee(
        historicalData,
        priority,
        networkConditions
      );

      // Calculate max fee per gas (base fee + priority fee with buffer)
      const maxFeePerGas = predictedBaseFee
        .mul(Math.floor(this.config.baseFeeMultiplier * 1000))
        .div(1000)
        .add(optimalPriorityFee);

      const fees = {
        maxFeePerGas,
        maxPriorityFeePerGas: optimalPriorityFee,
        baseFee: predictedBaseFee
      };

      // Ensure fees don't exceed maximum
      if (fees.maxFeePerGas.gt(this.config.maxGasPrice)) {
        logger.warn('Calculated fees exceed maximum, capping', {
          calculated: ethers.utils.formatUnits(fees.maxFeePerGas, 'gwei'),
          maximum: ethers.utils.formatUnits(this.config.maxGasPrice, 'gwei')
        });
        
        fees.maxFeePerGas = this.config.maxGasPrice;
        fees.maxPriorityFeePerGas = this.config.maxGasPrice.sub(predictedBaseFee);
      }

      this.cache.set(cacheKey, fees, 30); // Cache for 30 seconds
      return fees;
    } catch (error) {
      logger.error('Failed to get optimized fees', { error, priority });
      throw new GasEstimationError('Failed to get optimized fees', { error });
    }
  }

  /**
   * Estimate gas limit with buffer
   */
  async estimateGasLimit(
    transaction: ethers.providers.TransactionRequest
  ): Promise<BigNumber> {
    try {
      const cacheKey = `gas_limit_${JSON.stringify(transaction)}`;
      const cached = this.cache.get<BigNumber>(cacheKey);
      
      if (cached) {
        return cached;
      }

      // Get base gas estimate from provider
      const baseEstimate = await this.provider.estimateGas(transaction);
      
      // Apply safety buffer
      const bufferMultiplier = (100 + this.config.gasLimitBuffer) / 100;
      const gasLimitWithBuffer = baseEstimate
        .mul(Math.floor(bufferMultiplier * 1000))
        .div(1000);

      this.cache.set(cacheKey, gasLimitWithBuffer, this.config.cacheTimeout);

      logger.debug('Gas limit estimated', {
        baseEstimate: baseEstimate.toString(),
        withBuffer: gasLimitWithBuffer.toString(),
        buffer: `${this.config.gasLimitBuffer}%`
      });

      return gasLimitWithBuffer;
    } catch (error) {
      logger.error('Failed to estimate gas limit', { error, transaction });
      throw new GasEstimationError('Failed to estimate gas limit', { error });
    }
  }

  /**
   * Get current network conditions for gas optimization
   */
  async getNetworkConditions(): Promise<NetworkConditions> {
    const cacheKey = 'network_conditions';
    const cached = this.cache.get<NetworkConditions>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const [block, feeData] = await Promise.all([
        this.provider.getBlock('latest'),
        this.provider.getFeeData()
      ]);

      const gasUsedPercentage = (block.gasUsed.toNumber() / block.gasLimit.toNumber()) * 100;
      
      let congestionLevel: 'low' | 'medium' | 'high' = 'low';
      if (gasUsedPercentage > 80) {
        congestionLevel = 'high';
      } else if (gasUsedPercentage > 50) {
        congestionLevel = 'medium';
      }

      const conditions: NetworkConditions = {
        baseFee: feeData.lastBaseFeePerGas || BigNumber.from(0),
        priorityFee: feeData.maxPriorityFeePerGas || BigNumber.from(0),
        gasUsed: block.gasUsed.toNumber(),
        gasLimit: block.gasLimit.toNumber(),
        blockNumber: block.number,
        timestamp: block.timestamp,
        congestionLevel
      };

      this.cache.set(cacheKey, conditions, 15); // Cache for 15 seconds
      return conditions;
    } catch (error) {
      throw new NetworkError('Failed to get network conditions', { error });
    }
  }

  /**
   * Get fee history for analysis
   */
  async getFeeHistory(blockCount: number = 20): Promise<FeeHistory> {
    try {
      const cacheKey = `fee_history_${blockCount}`;
      const cached = this.cache.get<FeeHistory>(cacheKey);
      
      if (cached) {
        return cached;
      }

      // Get fee history from provider (if supported)
      const latestBlock = await this.provider.getBlockNumber();
      const feeHistory = await (this.provider as any).send('eth_feeHistory', [
        `0x${blockCount.toString(16)}`,
        `0x${latestBlock.toString(16)}`,
        [25, 50, 75] // 25th, 50th, 75th percentiles
      ]);

      this.cache.set(cacheKey, feeHistory, 60); // Cache for 1 minute
      return feeHistory;
    } catch (error) {
      logger.warn('Fee history not available, using fallback', { error });
      // Return empty fee history as fallback
      return {
        baseFeePerGas: [],
        gasUsedRatio: [],
        reward: [],
        oldestBlock: 0
      };
    }
  }

  /**
   * Analyze gas price trends
   */
  async analyzeGasTrends(): Promise<{
    trend: 'increasing' | 'decreasing' | 'stable';
    volatility: 'low' | 'medium' | 'high';
    recommendation: string;
    averageBaseFee: BigNumber;
    averagePriorityFee: BigNumber;
  }> {
    try {
      const recentHistory = this.getRecentFeeHistory(50);
      
      if (recentHistory.length < 10) {
        return {
          trend: 'stable',
          volatility: 'low',
          recommendation: 'Use standard gas settings',
          averageBaseFee: BigNumber.from(0),
          averagePriorityFee: BigNumber.from(0)
        };
      }

      // Calculate averages
      const avgBaseFee = this.calculateAverage(recentHistory.map(h => h.baseFee));
      const avgPriorityFee = this.calculateAverage(recentHistory.map(h => h.priorityFee));

      // Analyze trend
      const recent = recentHistory.slice(-10);
      const older = recentHistory.slice(-20, -10);
      
      const recentAvgBase = this.calculateAverage(recent.map(h => h.baseFee));
      const olderAvgBase = this.calculateAverage(older.map(h => h.baseFee));

      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      const changePercent = recentAvgBase.sub(olderAvgBase).mul(100).div(olderAvgBase).toNumber();
      
      if (changePercent > 10) {
        trend = 'increasing';
      } else if (changePercent < -10) {
        trend = 'decreasing';
      }

      // Calculate volatility
      const baseFeeVariance = this.calculateVariance(recentHistory.map(h => h.baseFee));
      let volatility: 'low' | 'medium' | 'high' = 'low';
      
      if (baseFeeVariance > avgBaseFee.div(4)) {
        volatility = 'high';
      } else if (baseFeeVariance > avgBaseFee.div(10)) {
        volatility = 'medium';
      }

      // Generate recommendation
      let recommendation = 'Use standard gas settings';
      if (trend === 'increasing' && volatility === 'high') {
        recommendation = 'Consider higher gas fees or delay transaction';
      } else if (trend === 'decreasing') {
        recommendation = 'Good time for transactions, fees are declining';
      } else if (volatility === 'high') {
        recommendation = 'Wait for more stable conditions or use higher fees';
      }

      logger.debug('Gas trend analysis completed', {
        trend,
        volatility,
        changePercent,
        avgBaseFee: ethers.utils.formatUnits(avgBaseFee, 'gwei'),
        avgPriorityFee: ethers.utils.formatUnits(avgPriorityFee, 'gwei')
      });

      return {
        trend,
        volatility,
        recommendation,
        averageBaseFee: avgBaseFee,
        averagePriorityFee: avgPriorityFee
      };
    } catch (error) {
      logger.error('Failed to analyze gas trends', { error });
      throw new GasEstimationError('Failed to analyze gas trends', { error });
    }
  }

  /**
   * Update gas optimization configuration
   */
  updateConfig(newConfig: Partial<GasConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
    logger.info('Gas optimizer configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   */
  getConfig(): GasConfig {
    return { ...this.config };
  }

  /**
   * Get fee history statistics
   */
  getFeeHistoryStats(): {
    totalEntries: number;
    oldestEntry: number;
    newestEntry: number;
    averageBaseFee: string;
    averagePriorityFee: string;
  } {
    if (this.feeHistory.length === 0) {
      return {
        totalEntries: 0,
        oldestEntry: 0,
        newestEntry: 0,
        averageBaseFee: '0',
        averagePriorityFee: '0'
      };
    }

    const avgBaseFee = this.calculateAverage(this.feeHistory.map(h => h.baseFee));
    const avgPriorityFee = this.calculateAverage(this.feeHistory.map(h => h.priorityFee));

    return {
      totalEntries: this.feeHistory.length,
      oldestEntry: this.feeHistory[0]?.timestamp || 0,
      newestEntry: this.feeHistory[this.feeHistory.length - 1]?.timestamp || 0,
      averageBaseFee: ethers.utils.formatUnits(avgBaseFee, 'gwei'),
      averagePriorityFee: ethers.utils.formatUnits(avgPriorityFee, 'gwei')
    };
  }

  // Private helper methods

  private validateConfig(): void {
    if (this.config.baseFeeMultiplier < 1 || this.config.baseFeeMultiplier > 3) {
      throw new ValidationError('Base fee multiplier must be between 1 and 3');
    }
    if (this.config.priorityFeeMultiplier < 1 || this.config.priorityFeeMultiplier > 5) {
      throw new ValidationError('Priority fee multiplier must be between 1 and 5');
    }
    if (this.config.gasLimitBuffer < 0 || this.config.gasLimitBuffer > 100) {
      throw new ValidationError('Gas limit buffer must be between 0% and 100%');
    }
    if (this.config.cacheTimeout < 10 || this.config.cacheTimeout > 300) {
      throw new ValidationError('Cache timeout must be between 10 and 300 seconds');
    }
  }

  private isEstimateValid(estimate: GasEstimate): boolean {
    const age = Date.now() - estimate.timestamp;
    return age < this.config.cacheTimeout * 1000;
  }

  private validateGasEstimate(estimate: GasEstimate): void {
    if (estimate.maxFeePerGas.gt(this.config.maxGasPrice)) {
      throw new GasEstimationError('Gas estimate exceeds maximum allowed price');
    }
    if (estimate.gasLimit.lt(21000)) {
      throw new GasEstimationError('Gas limit too low');
    }
  }

  private async calculateConfidence(): Promise<number> {
    try {
      const networkConditions = await this.getNetworkConditions();
      const historySize = this.feeHistory.length;
      
      let confidence = 50; // Base confidence
      
      // Increase confidence with more historical data
      if (historySize > 50) confidence += 20;
      else if (historySize > 20) confidence += 10;
      
      // Adjust based on network conditions
      if (networkConditions.congestionLevel === 'low') {
        confidence += 20;
      } else if (networkConditions.congestionLevel === 'high') {
        confidence -= 20;
      }
      
      return Math.max(10, Math.min(95, confidence));
    } catch (error) {
      return 50; // Default confidence
    }
  }

  private predictNextBaseFee(conditions: NetworkConditions): BigNumber {
    // EIP-1559 base fee calculation
    const currentBaseFee = conditions.baseFee;
    const gasUsedRatio = conditions.gasUsed / conditions.gasLimit;
    
    if (gasUsedRatio > 0.5) {
      // Increase base fee
      const increase = currentBaseFee.mul(Math.floor((gasUsedRatio - 0.5) * 2 * 125)).div(1000);
      return currentBaseFee.add(increase);
    } else {
      // Decrease base fee
      const decrease = currentBaseFee.mul(Math.floor((0.5 - gasUsedRatio) * 2 * 125)).div(1000);
      return currentBaseFee.sub(decrease);
    }
  }

  private calculateOptimalPriorityFee(
    history: HistoricalFeeData[],
    priority: 'low' | 'medium' | 'high',
    conditions: NetworkConditions
  ): BigNumber {
    if (history.length === 0) {
      // Fallback to current network priority fee
      return conditions.priorityFee.mul(Math.floor(this.config.priorityFeeMultiplier * 100)).div(100);
    }

    // Calculate percentiles from historical data
    const priorityFees = history.map(h => h.priorityFee).sort((a, b) => a.sub(b).toNumber());
    
    let targetPercentile: number;
    switch (priority) {
      case 'low':
        targetPercentile = 25;
        break;
      case 'high':
        targetPercentile = 90;
        break;
      default:
        targetPercentile = 50;
    }

    const index = Math.floor((targetPercentile / 100) * (priorityFees.length - 1));
    const basePriorityFee = priorityFees[index] || conditions.priorityFee;

    // Apply multiplier and adjust for network conditions
    let multiplier = this.config.priorityFeeMultiplier;
    if (conditions.congestionLevel === 'high') {
      multiplier *= 1.5;
    } else if (conditions.congestionLevel === 'low') {
      multiplier *= 0.8;
    }

    return basePriorityFee.mul(Math.floor(multiplier * 100)).div(100);
  }

  private getRecentFeeHistory(count: number): HistoricalFeeData[] {
    return this.feeHistory.slice(-count);
  }

  private calculateAverage(values: BigNumber[]): BigNumber {
    if (values.length === 0) return BigNumber.from(0);
    
    const sum = values.reduce((acc, val) => acc.add(val), BigNumber.from(0));
    return sum.div(values.length);
  }

  private calculateVariance(values: BigNumber[]): BigNumber {
    if (values.length < 2) return BigNumber.from(0);
    
    const mean = this.calculateAverage(values);
    const squaredDiffs = values.map(val => {
      const diff = val.sub(mean);
      return diff.mul(diff);
    });
    
    return this.calculateAverage(squaredDiffs);
  }

  private startFeeHistoryCollection(): void {
    // Collect fee history every 15 seconds
    setInterval(async () => {
      try {
        const conditions = await this.getNetworkConditions();
        
        const historyEntry: HistoricalFeeData = {
          baseFee: conditions.baseFee,
          priorityFee: conditions.priorityFee,
          gasUsed: conditions.gasUsed,
          timestamp: Date.now(),
          blockNumber: conditions.blockNumber
        };

        this.feeHistory.push(historyEntry);
        
        // Keep only recent history
        if (this.feeHistory.length > this.maxHistorySize) {
          this.feeHistory = this.feeHistory.slice(-this.maxHistorySize);
        }
      } catch (error) {
        logger.warn('Failed to collect fee history', { error });
      }
    }, 15000);
  }
}