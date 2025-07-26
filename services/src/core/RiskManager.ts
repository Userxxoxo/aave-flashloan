import { ethers, BigNumber } from 'ethers';
import { 
  RiskConfig, 
  RiskMetrics, 
  RiskAssessment, 
  RiskFactor,
  TradeRequest,
  NetworkConditions 
} from '../types';
import { CacheManager } from '../utils/cache';
import { RiskError, ValidationError } from '../utils/errors';
import logger from '../utils/logger';

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

export class RiskManager {
  private config: RiskConfig;
  private cache: CacheManager;
  private positions: Map<string, PositionData>;
  private tradeHistory: TradeHistory[];
  private dailyPnL: Map<string, BigNumber>; // date -> PnL
  private maxHistorySize: number = 1000;

  constructor(config?: Partial<RiskConfig>) {
    this.config = {
      maxPositionSize: ethers.utils.parseEther('10'), // $10 max position
      maxDailyLoss: ethers.utils.parseEther('5'), // $5 max daily loss
      maxDrawdown: 20, // 20% max drawdown
      maxLeverage: 1, // No leverage for safety
      stopLossThreshold: 10, // 10% stop loss
      riskFreeRate: 2, // 2% annual risk-free rate
      volatilityWindow: 100, // 100 blocks for volatility calculation
      correlationThreshold: 0.7, // 70% correlation threshold
      ...config
    };
    
    this.cache = new CacheManager(300); // 5 minute cache
    this.positions = new Map();
    this.tradeHistory = [];
    this.dailyPnL = new Map();
    
    this.validateConfig();
    logger.info('RiskManager initialized', { config: this.config });
  }

  /**
   * Assess risk for a trade request
   */
  async assessTradeRisk(
    request: TradeRequest,
    networkConditions: NetworkConditions
  ): Promise<RiskAssessment> {
    try {
      const factors: RiskFactor[] = [];
      let totalScore = 0;
      let maxAllowedSize = request.amountIn;

      // Position size risk
      const positionSizeFactor = this.assessPositionSizeRisk(request.amountIn);
      factors.push(positionSizeFactor);
      totalScore += this.getFactorScore(positionSizeFactor);

      // Daily loss risk
      const dailyLossFactor = await this.assessDailyLossRisk(request.amountIn);
      factors.push(dailyLossFactor);
      totalScore += this.getFactorScore(dailyLossFactor);

      // Drawdown risk
      const drawdownFactor = await this.assessDrawdownRisk();
      factors.push(drawdownFactor);
      totalScore += this.getFactorScore(drawdownFactor);

      // Market volatility risk
      const volatilityFactor = await this.assessVolatilityRisk(
        request.tokenIn,
        request.tokenOut,
        networkConditions
      );
      factors.push(volatilityFactor);
      totalScore += this.getFactorScore(volatilityFactor);

      // Slippage risk
      const slippageFactor = this.assessSlippageRisk(request.slippageTolerance || 1);
      factors.push(slippageFactor);
      totalScore += this.getFactorScore(slippageFactor);

      // Network risk
      const networkFactor = this.assessNetworkRisk(networkConditions);
      factors.push(networkFactor);
      totalScore += this.getFactorScore(networkFactor);

      // Calculate overall risk level
      const averageScore = totalScore / factors.length;
      const riskLevel = this.calculateRiskLevel(averageScore);

      // Determine if trade should proceed
      const shouldProceed = this.shouldProceedWithTrade(riskLevel, factors);

      // Calculate maximum allowed size
      if (!shouldProceed) {
        maxAllowedSize = BigNumber.from(0);
      } else {
        maxAllowedSize = this.calculateMaxAllowedSize(request.amountIn, factors);
      }

      // Generate recommendations
      const recommendations = this.generateRiskRecommendations(factors, riskLevel);

      const assessment: RiskAssessment = {
        riskLevel,
        score: averageScore,
        factors,
        recommendations,
        shouldProceed,
        maxAllowedSize
      };

      logger.info('Risk assessment completed', {
        riskLevel,
        score: averageScore,
        shouldProceed,
        factorsCount: factors.length
      });

      return assessment;
    } catch (error) {
      logger.error('Risk assessment failed', { error, request });
      throw new RiskError('Failed to assess trade risk', { error });
    }
  }

  /**
   * Calculate current risk metrics
   */
  async calculateRiskMetrics(): Promise<RiskMetrics> {
    try {
      const currentExposure = this.calculateCurrentExposure();
      const dailyPnL = this.calculateDailyPnL();
      const drawdown = await this.calculateCurrentDrawdown();
      const sharpeRatio = this.calculateSharpeRatio();
      const volatility = this.calculateVolatility();
      const var95 = this.calculateValueAtRisk(0.95);
      const maxDrawdown = this.calculateMaxDrawdown();
      const winRate = this.calculateWinRate();

      const metrics: RiskMetrics = {
        currentExposure,
        dailyPnL,
        drawdown,
        sharpeRatio,
        volatility,
        var95,
        maxDrawdown,
        winRate
      };

      logger.debug('Risk metrics calculated', {
        currentExposure: currentExposure.toString(),
        dailyPnL: dailyPnL.toString(),
        drawdown,
        sharpeRatio,
        winRate
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to calculate risk metrics', { error });
      throw new RiskError('Failed to calculate risk metrics', { error });
    }
  }

  /**
   * Record a completed trade
   */
  recordTrade(
    request: TradeRequest,
    amountOut: BigNumber,
    gasUsed: BigNumber,
    success: boolean
  ): void {
    try {
      const profit = success 
        ? amountOut.sub(request.amountIn) 
        : request.amountIn.mul(-1);

      const trade: TradeHistory = {
        timestamp: Date.now(),
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        amountIn: request.amountIn,
        amountOut,
        profit,
        gasUsed,
        networkId: request.networkId,
        success
      };

      this.tradeHistory.push(trade);

      // Update daily PnL
      const dateKey = new Date().toISOString().split('T')[0] as string;
      const existingPnL = this.dailyPnL.get(dateKey);
      const currentDailyPnL = existingPnL ? existingPnL : BigNumber.from(0);
      this.dailyPnL.set(dateKey, currentDailyPnL.add(profit));

      // Keep history size manageable
      if (this.tradeHistory.length > this.maxHistorySize) {
        this.tradeHistory = this.tradeHistory.slice(-this.maxHistorySize);
      }

      logger.debug('Trade recorded', {
        profit: profit.toString(),
        success,
        totalTrades: this.tradeHistory.length
      });
    } catch (error) {
      logger.error('Failed to record trade', { error });
    }
  }

  /**
   * Check if position limits are exceeded
   */
  checkPositionLimits(tokenAddress: string, additionalAmount: BigNumber): boolean {
    const currentPosition = this.positions.get(tokenAddress);
    const currentAmount = currentPosition?.amount || BigNumber.from(0);
    const totalAmount = currentAmount.add(additionalAmount);

    return totalAmount.lte(this.config.maxPositionSize);
  }

  /**
   * Update position data
   */
  updatePosition(
    tokenAddress: string,
    amount: BigNumber,
    price: BigNumber,
    networkId: number
  ): void {
    this.positions.set(tokenAddress, {
      tokenAddress,
      amount,
      entryPrice: price,
      timestamp: Date.now(),
      networkId
    });

    logger.debug('Position updated', {
      tokenAddress,
      amount: amount.toString(),
      price: price.toString()
    });
  }

  /**
   * Get current positions
   */
  getCurrentPositions(): Map<string, PositionData> {
    return new Map(this.positions);
  }

  /**
   * Get trade history
   */
  getTradeHistory(limit?: number): TradeHistory[] {
    const history = [...this.tradeHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  // Private risk assessment methods

  private assessPositionSizeRisk(amount: BigNumber): RiskFactor {
    const sizeRatio = amount.mul(100).div(this.config.maxPositionSize).toNumber();
    
    let impact: 'low' | 'medium' | 'high' = 'low';
    let value = sizeRatio;
    
    if (sizeRatio > 80) {
      impact = 'high';
    } else if (sizeRatio > 50) {
      impact = 'medium';
    }

    return {
      name: 'Position Size',
      impact,
      description: `Trade size is ${sizeRatio.toFixed(1)}% of maximum allowed`,
      value,
      threshold: 100
    };
  }

  private async assessDailyLossRisk(amount: BigNumber): Promise<RiskFactor> {
    const today = new Date().toISOString().split('T')[0] as string;
    const existingPnL = this.dailyPnL.get(today);
    const currentDailyPnL = existingPnL ? existingPnL : BigNumber.from(0);
    
    // Assume worst case scenario for this trade
    const potentialLoss = currentDailyPnL.sub(amount);
    const lossRatio = potentialLoss.abs().mul(100).div(this.config.maxDailyLoss).toNumber();
    
    let impact: 'low' | 'medium' | 'high' = 'low';
    if (lossRatio > 80) {
      impact = 'high';
    } else if (lossRatio > 50) {
      impact = 'medium';
    }

    return {
      name: 'Daily Loss Limit',
      impact,
      description: `Potential daily loss is ${lossRatio.toFixed(1)}% of limit`,
      value: lossRatio,
      threshold: 100
    };
  }

  private async assessDrawdownRisk(): Promise<RiskFactor> {
    const currentDrawdown = await this.calculateCurrentDrawdown();
    const drawdownRatio = (currentDrawdown / this.config.maxDrawdown) * 100;
    
    let impact: 'low' | 'medium' | 'high' = 'low';
    if (drawdownRatio > 80) {
      impact = 'high';
    } else if (drawdownRatio > 50) {
      impact = 'medium';
    }

    return {
      name: 'Drawdown',
      impact,
      description: `Current drawdown is ${currentDrawdown.toFixed(1)}% (${drawdownRatio.toFixed(1)}% of limit)`,
      value: drawdownRatio,
      threshold: 100
    };
  }

  private async assessVolatilityRisk(
    tokenIn: string,
    tokenOut: string,
    networkConditions: NetworkConditions
  ): Promise<RiskFactor> {
    // Simplified volatility assessment based on network conditions
    let volatilityScore = 0;
    
    if (networkConditions.congestionLevel === 'high') {
      volatilityScore += 30;
    } else if (networkConditions.congestionLevel === 'medium') {
      volatilityScore += 15;
    }

    // Add volatility based on recent trade history
    const recentTrades = this.tradeHistory.slice(-20);
    if (recentTrades.length > 5) {
      const profitVariance = this.calculateProfitVariance(recentTrades);
      volatilityScore += Math.min(50, profitVariance * 10);
    }

    let impact: 'low' | 'medium' | 'high' = 'low';
    if (volatilityScore > 60) {
      impact = 'high';
    } else if (volatilityScore > 30) {
      impact = 'medium';
    }

    return {
      name: 'Market Volatility',
      impact,
      description: `Market volatility score: ${volatilityScore.toFixed(1)}`,
      value: volatilityScore,
      threshold: 80
    };
  }

  private assessSlippageRisk(slippageTolerance: number): RiskFactor {
    let impact: 'low' | 'medium' | 'high' = 'low';
    if (slippageTolerance > 3) {
      impact = 'high';
    } else if (slippageTolerance > 1) {
      impact = 'medium';
    }

    return {
      name: 'Slippage Risk',
      impact,
      description: `Slippage tolerance: ${slippageTolerance}%`,
      value: slippageTolerance,
      threshold: 5
    };
  }

  private assessNetworkRisk(networkConditions: NetworkConditions): RiskFactor {
    let riskScore = 0;
    
    if (networkConditions.congestionLevel === 'high') {
      riskScore = 80;
    } else if (networkConditions.congestionLevel === 'medium') {
      riskScore = 40;
    } else {
      riskScore = 10;
    }

    let impact: 'low' | 'medium' | 'high' = 'low';
    if (riskScore > 60) {
      impact = 'high';
    } else if (riskScore > 30) {
      impact = 'medium';
    }

    return {
      name: 'Network Congestion',
      impact,
      description: `Network congestion level: ${networkConditions.congestionLevel}`,
      value: riskScore,
      threshold: 80
    };
  }

  private getFactorScore(factor: RiskFactor): number {
    const impactMultiplier = {
      'low': 1,
      'medium': 2,
      'high': 3
    };

    return Math.min(100, factor.value * impactMultiplier[factor.impact]);
  }

  private calculateRiskLevel(averageScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (averageScore > 80) return 'critical';
    if (averageScore > 60) return 'high';
    if (averageScore > 30) return 'medium';
    return 'low';
  }

  private shouldProceedWithTrade(
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    factors: RiskFactor[]
  ): boolean {
    // Never proceed with critical risk
    if (riskLevel === 'critical') return false;

    // Check for any high-impact factors that should block the trade
    const highImpactFactors = factors.filter(f => f.impact === 'high');
    if (highImpactFactors.length > 1) return false;

    // Check specific blocking conditions
    const positionSizeFactor = factors.find(f => f.name === 'Position Size');
    if (positionSizeFactor && positionSizeFactor.value >= positionSizeFactor.threshold) {
      return false;
    }

    const dailyLossFactor = factors.find(f => f.name === 'Daily Loss Limit');
    if (dailyLossFactor && dailyLossFactor.value >= dailyLossFactor.threshold) {
      return false;
    }

    return riskLevel !== 'high' || highImpactFactors.length === 0;
  }

  private calculateMaxAllowedSize(
    requestedAmount: BigNumber,
    factors: RiskFactor[]
  ): BigNumber {
    let maxSize = requestedAmount;

    // Apply position size limit
    const positionSizeFactor = factors.find(f => f.name === 'Position Size');
    if (positionSizeFactor && positionSizeFactor.value > 50) {
      const reduction = (positionSizeFactor.value - 50) / 100;
      maxSize = maxSize.mul(Math.floor((1 - reduction) * 100)).div(100);
    }

    // Apply daily loss limit
    const dailyLossFactor = factors.find(f => f.name === 'Daily Loss Limit');
    if (dailyLossFactor && dailyLossFactor.value > 50) {
      const reduction = (dailyLossFactor.value - 50) / 100;
      maxSize = maxSize.mul(Math.floor((1 - reduction) * 100)).div(100);
    }

    // Ensure minimum viable trade size
    const minTradeSize = ethers.utils.parseEther('0.001');
    return maxSize.lt(minTradeSize) ? BigNumber.from(0) : maxSize;
  }

  private generateRiskRecommendations(
    factors: RiskFactor[],
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'critical') {
      recommendations.push('CRITICAL: Do not execute this trade');
      recommendations.push('Wait for better market conditions');
    } else if (riskLevel === 'high') {
      recommendations.push('HIGH RISK: Consider reducing trade size');
      recommendations.push('Monitor position closely if executed');
    }

    // Specific factor recommendations
    factors.forEach(factor => {
      if (factor.impact === 'high') {
        switch (factor.name) {
          case 'Position Size':
            recommendations.push('Reduce trade size to stay within limits');
            break;
          case 'Daily Loss Limit':
            recommendations.push('Consider waiting until tomorrow to reset daily limits');
            break;
          case 'Market Volatility':
            recommendations.push('Wait for lower volatility or use tighter slippage');
            break;
          case 'Network Congestion':
            recommendations.push('Wait for network congestion to decrease');
            break;
          case 'Slippage Risk':
            recommendations.push('Reduce slippage tolerance or trade size');
            break;
        }
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Risk levels acceptable for trade execution');
    }

    return recommendations;
  }

  // Risk calculation methods

  private calculateCurrentExposure(): BigNumber {
    return Array.from(this.positions.values())
      .reduce((total, position) => total.add(position.amount), BigNumber.from(0));
  }

  private calculateDailyPnL(): BigNumber {
    const today = new Date().toISOString().split('T')[0] as string;
    const existingPnL = this.dailyPnL.get(today);
    return existingPnL ? existingPnL : BigNumber.from(0);
  }

  private async calculateCurrentDrawdown(): Promise<number> {
    if (this.tradeHistory.length < 10) return 0;

    const recentTrades = this.tradeHistory.slice(-50);
    let peak = BigNumber.from(0);
    let maxDrawdown = 0;
    let runningPnL = BigNumber.from(0);

    for (const trade of recentTrades) {
      runningPnL = runningPnL.add(trade.profit);
      
      if (runningPnL.gt(peak)) {
        peak = runningPnL;
      }
      
      if (peak.gt(0)) {
        const drawdown = peak.sub(runningPnL).mul(100).div(peak).toNumber();
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return maxDrawdown;
  }

  private calculateSharpeRatio(): number {
    if (this.tradeHistory.length < 10) return 0;

    const returns = this.tradeHistory.map(trade => 
      trade.profit.mul(100).div(trade.amountIn).toNumber()
    );

    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? (avgReturn - this.config.riskFreeRate) / stdDev : 0;
  }

  private calculateVolatility(): number {
    if (this.tradeHistory.length < 10) return 0;

    const returns = this.tradeHistory.slice(-30).map(trade => 
      trade.profit.mul(100).div(trade.amountIn).toNumber()
    );

    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }

  private calculateValueAtRisk(confidence: number): BigNumber {
    if (this.tradeHistory.length < 20) return BigNumber.from(0);

    const losses = this.tradeHistory
      .filter(trade => trade.profit.lt(0))
      .map(trade => trade.profit.abs())
      .sort((a, b) => b.sub(a).toNumber());

    if (losses.length === 0) return BigNumber.from(0);

    const index = Math.floor((1 - confidence) * losses.length);
    return losses[index] || BigNumber.from(0);
  }

  private calculateMaxDrawdown(): number {
    if (this.tradeHistory.length < 10) return 0;

    let peak = BigNumber.from(0);
    let maxDrawdown = 0;
    let runningPnL = BigNumber.from(0);

    for (const trade of this.tradeHistory) {
      runningPnL = runningPnL.add(trade.profit);
      
      if (runningPnL.gt(peak)) {
        peak = runningPnL;
      }
      
      if (peak.gt(0)) {
        const drawdown = peak.sub(runningPnL).mul(100).div(peak).toNumber();
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return maxDrawdown;
  }

  private calculateWinRate(): number {
    if (this.tradeHistory.length === 0) return 0;

    const winningTrades = this.tradeHistory.filter(trade => 
      trade.success && trade.profit.gt(0)
    ).length;

    return (winningTrades / this.tradeHistory.length) * 100;
  }

  private calculateProfitVariance(trades: TradeHistory[]): number {
    if (trades.length < 2) return 0;

    const profits = trades.map(trade => 
      trade.profit.mul(100).div(trade.amountIn).toNumber()
    );

    const avgProfit = profits.reduce((sum, profit) => sum + profit, 0) / profits.length;
    const variance = profits.reduce((sum, profit) => 
      sum + Math.pow(profit - avgProfit, 2), 0
    ) / profits.length;

    return Math.sqrt(variance);
  }

  private validateConfig(): void {
    if (this.config.maxPositionSize.lte(0)) {
      throw new ValidationError('Max position size must be greater than 0');
    }
    if (this.config.maxDailyLoss.lte(0)) {
      throw new ValidationError('Max daily loss must be greater than 0');
    }
    if (this.config.maxDrawdown <= 0 || this.config.maxDrawdown > 100) {
      throw new ValidationError('Max drawdown must be between 0 and 100');
    }
    if (this.config.maxLeverage < 1 || this.config.maxLeverage > 10) {
      throw new ValidationError('Max leverage must be between 1 and 10');
    }
  }

  /**
   * Update risk configuration
   */
  updateConfig(newConfig: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
    logger.info('Risk configuration updated', { config: this.config });
  }

  /**
   * Get current configuration
   */
  getConfig(): RiskConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.positions.clear();
    this.tradeHistory.length = 0;
    this.dailyPnL.clear();
    logger.info('RiskManager destroyed');
  }
}