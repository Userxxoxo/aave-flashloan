import { ethers, BigNumber } from 'ethers';
import { 
  SlippageConfig, 
  PriceData, 
  TradeParams, 
  ValidationResult,
  PriceOracle 
} from './types';
import { CacheManager } from './utils/cache';
import { SlippageError, PriceOracleError, ValidationError } from './utils/errors';
import logger from './utils/logger';

export class SlippageProtection {
  private config: SlippageConfig;
  private cache: CacheManager;
  private priceOracles: Map<string, PriceOracle>;
  private provider: ethers.providers.Provider;

  constructor(
    provider: ethers.providers.Provider,
    config?: Partial<SlippageConfig>
  ) {
    this.provider = provider;
    this.config = {
      tolerance: 0.5, // 0.5%
      maxTolerance: 2.0, // 2%
      safetyBuffer: 0.1, // 0.1%
      deadline: 300, // 5 minutes
      ...config
    };
    
    this.cache = new CacheManager(60); // 1 minute cache
    this.priceOracles = new Map();
    
    this.validateConfig();
    logger.info('SlippageProtection initialized', { config: this.config });
  }

  /**
   * Add a price oracle for token price validation
   */
  addPriceOracle(name: string, oracle: PriceOracle): void {
    this.priceOracles.set(name, oracle);
    logger.info(`Price oracle added: ${name}`);
  }

  /**
   * Calculate minimum output amount with slippage protection
   */
  async calculateMinOutput(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    customTolerance?: number
  ): Promise<BigNumber> {
    try {
      const tolerance = customTolerance || this.config.tolerance;
      this.validateTolerance(tolerance);

      // Get current market price
      const priceData = await this.getTokenPrice(tokenIn, tokenOut);
      
      // Calculate expected output based on current price
      const expectedOutput = this.calculateExpectedOutput(amountIn, priceData.price);
      
      // Apply slippage tolerance and safety buffer
      const totalSlippage = tolerance + this.config.safetyBuffer;
      const slippageMultiplier = (100 - totalSlippage) / 100;
      const minOutput = expectedOutput.mul(Math.floor(slippageMultiplier * 10000)).div(10000);

      logger.debug('Minimum output calculated', {
        tokenIn,
        tokenOut,
        amountIn: amountIn.toString(),
        expectedOutput: expectedOutput.toString(),
        minOutput: minOutput.toString(),
        tolerance,
        safetyBuffer: this.config.safetyBuffer
      });

      return minOutput;
    } catch (error) {
      logger.error('Failed to calculate minimum output', { error, tokenIn, tokenOut });
      throw new SlippageError('Failed to calculate minimum output', { tokenIn, tokenOut, error });
    }
  }

  /**
   * Validate trade parameters before execution
   */
  async validateTrade(params: TradeParams): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate addresses
      if (!ethers.utils.isAddress(params.tokenIn)) {
        errors.push('Invalid tokenIn address');
      }
      if (!ethers.utils.isAddress(params.tokenOut)) {
        errors.push('Invalid tokenOut address');
      }

      // Validate amounts
      if (params.amountIn.lte(0)) {
        errors.push('Amount in must be greater than 0');
      }
      if (params.minAmountOut.lte(0)) {
        errors.push('Minimum amount out must be greater than 0');
      }

      // Validate slippage tolerance
      if (params.slippageTolerance > this.config.maxTolerance) {
        errors.push(`Slippage tolerance exceeds maximum (${this.config.maxTolerance}%)`);
      }
      if (params.slippageTolerance > 1.0) {
        warnings.push('High slippage tolerance detected');
      }

      // Validate deadline
      const currentTime = Math.floor(Date.now() / 1000);
      if (params.deadline <= currentTime) {
        errors.push('Trade deadline has passed');
      }
      if (params.deadline - currentTime > 3600) { // 1 hour
        warnings.push('Trade deadline is more than 1 hour in the future');
      }

      // Validate price impact
      const priceImpact = await this.calculatePriceImpact(
        params.tokenIn,
        params.tokenOut,
        params.amountIn,
        params.minAmountOut
      );
      
      if (priceImpact > 5.0) {
        errors.push('Price impact too high (>5%)');
      } else if (priceImpact > 2.0) {
        warnings.push('High price impact detected');
      }

      logger.debug('Trade validation completed', {
        params,
        errors,
        warnings,
        priceImpact
      });

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      logger.error('Trade validation failed', { error, params });
      return {
        isValid: false,
        errors: ['Validation failed due to internal error'],
        warnings: []
      };
    }
  }

  /**
   * Check if trade execution should proceed based on current conditions
   */
  async shouldExecuteTrade(params: TradeParams): Promise<boolean> {
    try {
      // Validate trade parameters
      const validation = await this.validateTrade(params);
      if (!validation.isValid) {
        logger.warn('Trade validation failed', { errors: validation.errors });
        return false;
      }

      // Check if deadline is approaching (within 30 seconds)
      const currentTime = Math.floor(Date.now() / 1000);
      if (params.deadline - currentTime < 30) {
        logger.warn('Trade deadline approaching', { 
          deadline: params.deadline, 
          currentTime,
          remaining: params.deadline - currentTime 
        });
        return false;
      }

      // Verify current price hasn't moved significantly
      const currentPrice = await this.getTokenPrice(params.tokenIn, params.tokenOut);
      const expectedOutput = this.calculateExpectedOutput(params.amountIn, currentPrice.price);
      
      if (expectedOutput.lt(params.minAmountOut)) {
        logger.warn('Current price would not meet minimum output', {
          expectedOutput: expectedOutput.toString(),
          minAmountOut: params.minAmountOut.toString()
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to check trade execution conditions', { error, params });
      return false;
    }
  }

  /**
   * Create trade parameters with slippage protection
   */
  async createTradeParams(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    customTolerance?: number
  ): Promise<TradeParams> {
    try {
      const minAmountOut = await this.calculateMinOutput(
        tokenIn,
        tokenOut,
        amountIn,
        customTolerance
      );

      const deadline = Math.floor(Date.now() / 1000) + this.config.deadline;
      const tolerance = customTolerance || this.config.tolerance;

      const params: TradeParams = {
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut,
        deadline,
        slippageTolerance: tolerance
      };

      logger.info('Trade parameters created', params);
      return params;
    } catch (error) {
      logger.error('Failed to create trade parameters', { error, tokenIn, tokenOut });
      throw new SlippageError('Failed to create trade parameters', { tokenIn, tokenOut, error });
    }
  }

  /**
   * Update slippage configuration
   */
  updateConfig(newConfig: Partial<SlippageConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
    logger.info('Slippage configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   */
  getConfig(): SlippageConfig {
    return { ...this.config };
  }

  // Private helper methods

  private validateConfig(): void {
    if (this.config.tolerance < 0 || this.config.tolerance > this.config.maxTolerance) {
      throw new ValidationError('Invalid tolerance configuration');
    }
    if (this.config.maxTolerance > 10) {
      throw new ValidationError('Maximum tolerance cannot exceed 10%');
    }
    if (this.config.safetyBuffer < 0 || this.config.safetyBuffer > 1) {
      throw new ValidationError('Safety buffer must be between 0% and 1%');
    }
    if (this.config.deadline < 60 || this.config.deadline > 3600) {
      throw new ValidationError('Deadline must be between 1 minute and 1 hour');
    }
  }

  private validateTolerance(tolerance: number): void {
    if (tolerance < 0 || tolerance > this.config.maxTolerance) {
      throw new ValidationError(`Tolerance must be between 0% and ${this.config.maxTolerance}%`);
    }
  }

  private async getTokenPrice(tokenIn: string, tokenOut: string): Promise<PriceData> {
    const cacheKey = `price_${tokenIn}_${tokenOut}`;
    const cached = this.cache.get<PriceData>(cacheKey);
    
    if (cached) {
      return cached;
    }

    // Try each oracle until we get a valid price
    for (const [name, oracle] of this.priceOracles) {
      try {
        const priceData = await oracle.getPrice(`${tokenIn}/${tokenOut}`);
        this.cache.set(cacheKey, priceData, 30); // Cache for 30 seconds
        return priceData;
      } catch (error) {
        logger.warn(`Oracle ${name} failed to provide price`, { error, tokenIn, tokenOut });
      }
    }

    throw new PriceOracleError('No oracle could provide price data', { tokenIn, tokenOut });
  }

  private calculateExpectedOutput(amountIn: BigNumber, price: BigNumber): BigNumber {
    // Simple calculation: amountIn * price
    // In practice, this would use more sophisticated pricing models
    return amountIn.mul(price).div(ethers.utils.parseEther('1'));
  }

  private async calculatePriceImpact(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    minAmountOut: BigNumber
  ): Promise<number> {
    try {
      const priceData = await this.getTokenPrice(tokenIn, tokenOut);
      const expectedOutput = this.calculateExpectedOutput(amountIn, priceData.price);
      
      if (expectedOutput.eq(0)) return 0;
      
      const impact = expectedOutput.sub(minAmountOut).mul(10000).div(expectedOutput);
      return impact.toNumber() / 100; // Convert to percentage
    } catch (error) {
      logger.warn('Failed to calculate price impact', { error });
      return 0;
    }
  }
}