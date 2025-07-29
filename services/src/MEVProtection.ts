import { ethers, BigNumber } from 'ethers';
import axios from 'axios';
import { 
  MEVConfig, 
  BundleTransaction, 
  MEVBundle, 
  NetworkConditions,
  ValidationResult 
} from './types';
import { CacheManager } from './utils/cache';
import { MEVError, NetworkError, ValidationError } from './utils/errors';
import logger from './utils/logger';

export class MEVProtection {
  private config: MEVConfig;
  private cache: CacheManager;
  private provider: ethers.providers.Provider;
  private flashbotsRelay: string;
  private bundleHistory: Map<string, MEVBundle>;

  constructor(
    provider: ethers.providers.Provider,
    flashbotsRelay: string = 'https://relay.flashbots.net',
    config?: Partial<MEVConfig>
  ) {
    this.provider = provider;
    this.flashbotsRelay = flashbotsRelay;
    this.config = {
      usePrivateMempool: true,
      bundleDelay: 2, // 2 blocks
      maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei'),
      gasLimit: BigNumber.from(500000),
      enableBackrunProtection: true,
      simulationRequired: true,
      ...config
    };
    
    this.cache = new CacheManager(300); // 5 minute cache
    this.bundleHistory = new Map();
    
    this.validateConfig();
    logger.info('MEVProtection initialized', { 
      config: this.config,
      flashbotsRelay: this.flashbotsRelay 
    });
  }

  /**
   * Create a MEV-protected transaction bundle
   */
  async createProtectedBundle(
    transactions: BundleTransaction[],
    targetBlockOffset: number = 2
  ): Promise<MEVBundle> {
    try {
      this.validateTransactions(transactions);

      const currentBlock = await this.provider.getBlockNumber();
      const targetBlock = currentBlock + targetBlockOffset;

      // Apply MEV protection parameters
      const protectedTransactions = await this.applyMEVProtection(transactions);

      const bundle: MEVBundle = {
        transactions: protectedTransactions,
        targetBlock,
        minTimestamp: Math.floor(Date.now() / 1000),
        maxTimestamp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
        revertingTxHashes: []
      };

      // Simulate bundle if required
      if (this.config.simulationRequired) {
        const simulationResult = await this.simulateBundle(bundle);
        if (!simulationResult.success) {
          throw new MEVError('Bundle simulation failed', simulationResult);
        }
      }

      const bundleId = this.generateBundleId(bundle);
      this.bundleHistory.set(bundleId, bundle);

      logger.info('MEV-protected bundle created', {
        bundleId,
        targetBlock,
        transactionCount: transactions.length
      });

      return bundle;
    } catch (error) {
      logger.error('Failed to create protected bundle', { error, transactions });
      throw new MEVError('Failed to create MEV-protected bundle', { error });
    }
  }

  /**
   * Submit bundle to private mempool (Flashbots-style)
   */
  async submitBundle(bundle: MEVBundle, signerWallet: ethers.Wallet): Promise<string> {
    try {
      if (!this.config.usePrivateMempool) {
        throw new MEVError('Private mempool not enabled');
      }

      // Prepare bundle for submission
      const bundleData = await this.prepareBundleSubmission(bundle, signerWallet);
      
      // Submit to Flashbots relay
      const response = await this.submitToFlashbots(bundleData);
      
      const bundleId = this.generateBundleId(bundle);
      
      // Cache submission details
      this.cache.set(`bundle_${bundleId}`, {
        bundle,
        submissionTime: Date.now(),
        response
      }, 600); // 10 minutes

      logger.info('Bundle submitted to private mempool', {
        bundleId,
        targetBlock: bundle.targetBlock,
        response
      });

      return bundleId;
    } catch (error) {
      logger.error('Failed to submit bundle', { error, bundle });
      throw new MEVError('Failed to submit bundle to private mempool', { error });
    }
  }

  /**
   * Check bundle inclusion status
   */
  async checkBundleStatus(bundleId: string): Promise<{
    included: boolean;
    blockNumber?: number;
    transactionHashes?: string[];
    error?: string;
  }> {
    try {
      const cachedData = this.cache.get<any>(`bundle_${bundleId}`);
      if (!cachedData) {
        throw new MEVError('Bundle not found', { bundleId });
      }

      const bundle = cachedData.bundle as MEVBundle;
      const currentBlock = await this.provider.getBlockNumber();

      // Check if target block has passed
      if (currentBlock > bundle.targetBlock + 5) {
        return {
          included: false,
          error: 'Bundle expired - target block passed'
        };
      }

      // Check if bundle was included in target block
      if (currentBlock >= bundle.targetBlock) {
        const blockData = await this.provider.getBlockWithTransactions(bundle.targetBlock);
        const bundleTxHashes = bundle.transactions.map(tx => 
          ethers.utils.keccak256(ethers.utils.serializeTransaction(tx))
        );

        const includedTxs = blockData.transactions.filter(tx => 
          bundleTxHashes.includes(tx.hash!)
        );

        if (includedTxs.length === bundle.transactions.length) {
          return {
            included: true,
            blockNumber: bundle.targetBlock,
            transactionHashes: includedTxs.map(tx => tx.hash!)
          };
        }
      }

      return {
        included: false,
        error: currentBlock < bundle.targetBlock ? 'Pending' : 'Not included'
      };
    } catch (error) {
      logger.error('Failed to check bundle status', { error, bundleId });
      throw new MEVError('Failed to check bundle status', { error, bundleId });
    }
  }

  /**
   * Analyze MEV exposure for a transaction
   */
  async analyzeMEVExposure(transaction: BundleTransaction): Promise<{
    riskLevel: 'low' | 'medium' | 'high';
    vulnerabilities: string[];
    recommendations: string[];
    estimatedMEVValue: BigNumber;
  }> {
    try {
      const vulnerabilities: string[] = [];
      const recommendations: string[] = [];
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      let estimatedMEVValue = BigNumber.from(0);

      // Analyze transaction data for MEV patterns
      const txData = transaction.data;
      
      // Check for DEX interactions
      if (this.isDEXTransaction(txData)) {
        vulnerabilities.push('DEX arbitrage opportunity');
        recommendations.push('Use private mempool');
        riskLevel = 'medium';
        estimatedMEVValue = await this.estimateDEXMEVValue(transaction);
      }

      // Check for liquidation transactions
      if (this.isLiquidationTransaction(txData)) {
        vulnerabilities.push('Liquidation frontrunning risk');
        recommendations.push('Use bundle with delay');
        riskLevel = 'high';
      }

      // Check for high-value transactions
      if (transaction.value.gt(ethers.utils.parseEther('10'))) {
        vulnerabilities.push('High-value transaction');
        recommendations.push('Consider MEV protection');
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      // Check gas price for sandwich attack potential
      if (transaction.maxPriorityFeePerGas.lt(ethers.utils.parseUnits('1', 'gwei'))) {
        vulnerabilities.push('Low priority fee - sandwich risk');
        recommendations.push('Increase priority fee');
      }

      logger.debug('MEV exposure analysis completed', {
        riskLevel,
        vulnerabilities,
        estimatedMEVValue: estimatedMEVValue.toString()
      });

      return {
        riskLevel,
        vulnerabilities,
        recommendations,
        estimatedMEVValue
      };
    } catch (error) {
      logger.error('MEV exposure analysis failed', { error, transaction });
      throw new MEVError('Failed to analyze MEV exposure', { error });
    }
  }

  /**
   * Get optimal MEV protection parameters
   */
  async getOptimalProtectionParams(
    networkConditions: NetworkConditions
  ): Promise<{
    priorityFee: BigNumber;
    gasLimit: BigNumber;
    bundleDelay: number;
    usePrivateMempool: boolean;
  }> {
    try {
      const basePriorityFee = networkConditions.priorityFee;
      
      // Calculate optimal priority fee based on network conditions
      let priorityFeeMultiplier = 1.2; // 20% above base
      
      if (networkConditions.congestionLevel === 'high') {
        priorityFeeMultiplier = 2.0; // 100% above base
      } else if (networkConditions.congestionLevel === 'medium') {
        priorityFeeMultiplier = 1.5; // 50% above base
      }

      const optimalPriorityFee = basePriorityFee.mul(
        Math.floor(priorityFeeMultiplier * 100)
      ).div(100);

      // Ensure we don't exceed configured maximum
      const finalPriorityFee = optimalPriorityFee.gt(this.config.maxPriorityFeePerGas)
        ? this.config.maxPriorityFeePerGas
        : optimalPriorityFee;

      // Adjust bundle delay based on network conditions
      let bundleDelay = this.config.bundleDelay;
      if (networkConditions.congestionLevel === 'high') {
        bundleDelay = Math.max(bundleDelay, 3);
      }

      const params = {
        priorityFee: finalPriorityFee,
        gasLimit: this.config.gasLimit,
        bundleDelay,
        usePrivateMempool: this.config.usePrivateMempool
      };

      logger.debug('Optimal MEV protection parameters calculated', {
        networkConditions,
        params
      });

      return params;
    } catch (error) {
      logger.error('Failed to calculate optimal protection parameters', { error });
      throw new MEVError('Failed to calculate optimal protection parameters', { error });
    }
  }

  /**
   * Update MEV protection configuration
   */
  updateConfig(newConfig: Partial<MEVConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
    logger.info('MEV protection configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   */
  getConfig(): MEVConfig {
    return { ...this.config };
  }

  // Private helper methods

  private validateConfig(): void {
    if (this.config.bundleDelay < 1 || this.config.bundleDelay > 10) {
      throw new ValidationError('Bundle delay must be between 1 and 10 blocks');
    }
    if (this.config.maxPriorityFeePerGas.lte(0)) {
      throw new ValidationError('Max priority fee must be greater than 0');
    }
    if (this.config.gasLimit.lt(21000)) {
      throw new ValidationError('Gas limit must be at least 21000');
    }
  }

  private validateTransactions(transactions: BundleTransaction[]): void {
    if (transactions.length === 0) {
      throw new ValidationError('Bundle must contain at least one transaction');
    }
    if (transactions.length > 10) {
      throw new ValidationError('Bundle cannot contain more than 10 transactions');
    }

    for (const tx of transactions) {
      if (!ethers.utils.isAddress(tx.to)) {
        throw new ValidationError('Invalid transaction recipient address');
      }
      if (tx.gasLimit.lt(21000)) {
        throw new ValidationError('Transaction gas limit too low');
      }
    }
  }

  private async applyMEVProtection(
    transactions: BundleTransaction[]
  ): Promise<BundleTransaction[]> {
    const networkConditions = await this.getNetworkConditions();
    const optimalParams = await this.getOptimalProtectionParams(networkConditions);

    return transactions.map(tx => ({
      ...tx,
      maxPriorityFeePerGas: optimalParams.priorityFee,
      gasLimit: tx.gasLimit.gt(optimalParams.gasLimit) ? tx.gasLimit : optimalParams.gasLimit
    }));
  }

  private async simulateBundle(bundle: MEVBundle): Promise<{
    success: boolean;
    gasUsed?: BigNumber;
    error?: string;
  }> {
    try {
      // Simulate each transaction in the bundle
      for (const tx of bundle.transactions) {
        const simulation = await this.provider.call({
          to: tx.to,
          data: tx.data,
          value: tx.value,
          gasLimit: tx.gasLimit
        });
        
        // Basic simulation - in practice would be more sophisticated
        if (!simulation) {
          return {
            success: false,
            error: 'Transaction simulation failed'
          };
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown simulation error'
      };
    }
  }

  private generateBundleId(bundle: MEVBundle): string {
    const bundleString = JSON.stringify({
      transactions: bundle.transactions.map(tx => ({
        to: tx.to,
        data: tx.data,
        value: tx.value.toString()
      })),
      targetBlock: bundle.targetBlock
    });
    
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(bundleString));
  }

  private async prepareBundleSubmission(
    bundle: MEVBundle,
    signer: ethers.Wallet
  ): Promise<any> {
    // Prepare bundle in Flashbots format
    const signedTransactions = await Promise.all(
      bundle.transactions.map(async (tx) => {
        const signedTx = await signer.signTransaction(tx);
        return signedTx;
      })
    );

    return {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendBundle',
      params: [{
        txs: signedTransactions,
        blockNumber: `0x${bundle.targetBlock.toString(16)}`,
        minTimestamp: bundle.minTimestamp,
        maxTimestamp: bundle.maxTimestamp
      }]
    };
  }

  private async submitToFlashbots(bundleData: any): Promise<any> {
    try {
      const response = await axios.post(this.flashbotsRelay, bundleData, {
        headers: {
          'Content-Type': 'application/json',
          'X-Flashbots-Signature': 'placeholder' // Would implement proper signature
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      throw new NetworkError('Failed to submit to Flashbots relay', { error });
    }
  }

  private async getNetworkConditions(): Promise<NetworkConditions> {
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

      this.cache.set(cacheKey, conditions, 30); // Cache for 30 seconds
      return conditions;
    } catch (error) {
      throw new NetworkError('Failed to get network conditions', { error });
    }
  }

  private isDEXTransaction(data: string): boolean {
    // Check for common DEX function selectors
    const dexSelectors = [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5'  // swapExactTokensForETH
    ];
    
    return dexSelectors.some(selector => data.startsWith(selector));
  }

  private isLiquidationTransaction(data: string): boolean {
    // Check for liquidation function selectors
    const liquidationSelectors = [
      '0x96cd4ddb', // liquidateBorrow (Compound)
      '0x00a718a9', // liquidationCall (Aave)
    ];
    
    return liquidationSelectors.some(selector => data.startsWith(selector));
  }

  private async estimateDEXMEVValue(transaction: BundleTransaction): Promise<BigNumber> {
    // Simplified MEV value estimation
    // In practice, this would involve complex arbitrage calculations
    return transaction.value.div(100); // Estimate 1% of transaction value
  }
}