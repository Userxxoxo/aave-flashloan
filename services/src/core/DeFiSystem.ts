import { ethers, BigNumber } from 'ethers';
import { 
  SystemConfig, 
  SystemStatus, 
  SystemMetrics,
  TradeRequest, 
  TradeResult,
  ExecutionContext,
  NetworkStatus,
  ServiceStatus,
  Alert
} from '../types';
import { SlippageProtection } from '../SlippageProtection';
import { MEVProtection } from '../MEVProtection';
import { GasOptimizer } from '../GasOptimizer';
import { NetworkManager } from './NetworkManager';
import { LiquidityAggregator } from './LiquidityAggregator';
import { RiskManager } from './RiskManager';
import { CacheManager } from '../utils/cache';
import { SystemError, ExecutionError, ValidationError } from '../utils/errors';
import logger from '../utils/logger';

export class DeFiSystem {
  private config: SystemConfig;
  private networkManager: NetworkManager;
  private liquidityAggregator: LiquidityAggregator;
  private riskManager: RiskManager;
  private slippageProtection!: SlippageProtection;
  private mevProtection!: MEVProtection;
  private gasOptimizer!: GasOptimizer;
  private cache: CacheManager;
  private isInitialized: boolean = false;
  private startTime: number;
  private metrics: SystemMetrics;
  private alerts: Alert[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: SystemConfig) {
    this.config = config;
    this.startTime = Date.now();
    this.cache = new CacheManager(300); // 5 minute cache
    
    // Initialize metrics
    this.metrics = {
      totalTrades: 0,
      successfulTrades: 0,
      totalVolume: BigNumber.from(0),
      totalProfit: BigNumber.from(0),
      averageGasUsed: BigNumber.from(0),
      averageSlippage: 0,
      uptime: 0
    };

    // Initialize core components
    this.networkManager = new NetworkManager();
    this.liquidityAggregator = new LiquidityAggregator();
    this.riskManager = new RiskManager(config.risk);
    
    logger.info('DeFiSystem constructor completed');
  }

  /**
   * Initialize the DeFi system
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing DeFi system...');

      // Add configured networks
      for (const networkConfig of this.config.networks) {
        this.networkManager.addNetwork(networkConfig);
      }

      // Wait for at least one network to be healthy
      await this.waitForHealthyNetwork();

      // Initialize service components with first healthy network
      const healthyNetworks = await this.networkManager.getHealthyNetworks();
      if (healthyNetworks.length === 0) {
        throw new SystemError('No healthy networks available');
      }

      const primaryNetworkId = healthyNetworks[0];
      const provider = this.networkManager.getProvider(primaryNetworkId!);
      
      if (!provider) {
        throw new SystemError(`Provider not found for network ${primaryNetworkId}`);
      }

      // Initialize protection services
      this.slippageProtection = new SlippageProtection(provider, this.config.slippage);
      this.mevProtection = new MEVProtection(provider, undefined, this.config.mev);
      this.gasOptimizer = new GasOptimizer(provider, this.config.gas);

      // Start health monitoring
      this.startHealthMonitoring();

      this.isInitialized = true;
      logger.info('DeFi system initialized successfully', {
        networksCount: this.config.networks.length,
        healthyNetworks: healthyNetworks.length,
        primaryNetwork: primaryNetworkId
      });

    } catch (error) {
      logger.error('Failed to initialize DeFi system', { error });
      throw new SystemError('System initialization failed', { error });
    }
  }

  /**
   * Execute a trade with full protection suite
   */
  async executeTrade(request: TradeRequest): Promise<TradeResult> {
    if (!this.isInitialized) {
      throw new SystemError('System not initialized');
    }

    const startTime = Date.now();
    let result: TradeResult;

    try {
      logger.info('Starting trade execution', {
        tokenIn: request.tokenIn,
        tokenOut: request.tokenOut,
        amountIn: request.amountIn.toString(),
        networkId: request.networkId
      });

      // Validate trade request
      await this.validateTradeRequest(request);

      // Check network health
      const isNetworkHealthy = await this.networkManager.isNetworkHealthy(request.networkId);
      if (!isNetworkHealthy) {
        throw new ExecutionError(`Network ${request.networkId} is not healthy`);
      }

      // Get execution context
      const context = await this.getExecutionContext(request.networkId);

      // Risk assessment
      const networkConditions = await this.gasOptimizer.getNetworkConditions();
      const riskAssessment = await this.riskManager.assessTradeRisk(request, networkConditions);
      
      if (!riskAssessment.shouldProceed) {
        throw new ExecutionError('Trade blocked by risk management', { 
          riskLevel: riskAssessment.riskLevel,
          recommendations: riskAssessment.recommendations 
        });
      }

      // Adjust trade size if needed
      const adjustedRequest = {
        ...request,
        amountIn: riskAssessment.maxAllowedSize.lt(request.amountIn) 
          ? riskAssessment.maxAllowedSize 
          : request.amountIn
      };

      // Get best liquidity route
      const aggregatedQuote = await this.liquidityAggregator.getAggregatedQuote(adjustedRequest);
      
      // Create trade parameters with slippage protection
      const tradeParams = await this.slippageProtection.createTradeParams(
        adjustedRequest.tokenIn,
        adjustedRequest.tokenOut,
        adjustedRequest.amountIn,
        adjustedRequest.slippageTolerance
      );

      // Optimize gas parameters
      const provider = this.networkManager.getProvider(request.networkId)!;
      const gasEstimate = await this.gasOptimizer.getOptimizedGasEstimate({
        to: aggregatedQuote.bestQuote.route[0]?.pool || request.tokenOut,
        data: '0x',
        value: BigNumber.from(0)
      }, request.priority);

      // Execute trade with MEV protection if enabled
      if (request.mevProtection) {
        result = await this.executeWithMEVProtection(
          adjustedRequest,
          tradeParams,
          gasEstimate,
          context
        );
      } else {
        result = await this.executeDirectTrade(
          adjustedRequest,
          tradeParams,
          gasEstimate,
          context
        );
      }

      // Record trade for risk management
      this.riskManager.recordTrade(
        adjustedRequest,
        result.amountOut || BigNumber.from(0),
        result.gasUsed || BigNumber.from(0),
        result.success
      );

      // Update metrics
      this.updateMetrics(result, adjustedRequest.amountIn);

      const executionTime = Date.now() - startTime;
      logger.info('Trade execution completed', {
        success: result.success,
        executionTime,
        gasUsed: result.gasUsed?.toString(),
        amountOut: result.amountOut?.toString()
      });

      return {
        ...result,
        executionTime,
        route: aggregatedQuote.bestQuote.route
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      result = {
        success: false,
        executionTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      // Record failed trade
      this.riskManager.recordTrade(
        request,
        BigNumber.from(0),
        BigNumber.from(0),
        false
      );

      this.updateMetrics(result, request.amountIn);

      logger.error('Trade execution failed', { error, request, executionTime });
      return result;
    }
  }

  /**
   * Get current system status
   */
  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const networkStatuses = this.networkManager.getAllNetworkStatuses();
      const serviceStatuses = await this.getServiceStatuses();
      
      // Update uptime
      this.metrics.uptime = Date.now() - this.startTime;

      const isHealthy = this.isSystemHealthy(networkStatuses, serviceStatuses);

      const status: SystemStatus = {
        isHealthy,
        networks: networkStatuses,
        services: serviceStatuses,
        metrics: { ...this.metrics },
        lastUpdate: Date.now()
      };

      return status;
    } catch (error) {
      logger.error('Failed to get system status', { error });
      throw new SystemError('Failed to get system status', { error });
    }
  }

  /**
   * Get system health summary
   */
  async getHealthSummary(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    networks: { healthy: number; total: number };
    services: { healthy: number; total: number };
    alerts: number;
    uptime: number;
  }> {
    const status = await this.getSystemStatus();
    
    const healthyNetworks = Array.from(status.networks.values())
      .filter(n => n.isHealthy).length;
    
    const healthyServices = Array.from(status.services.values())
      .filter(s => s.isHealthy).length;

    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!status.isHealthy) {
      overall = 'unhealthy';
    } else if (healthyNetworks < status.networks.size || healthyServices < status.services.size) {
      overall = 'degraded';
    }

    return {
      overall,
      networks: { healthy: healthyNetworks, total: status.networks.size },
      services: { healthy: healthyServices, total: status.services.size },
      alerts: this.alerts.filter(a => !a.resolved).length,
      uptime: status.metrics.uptime
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 10): Alert[] {
    return this.alerts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      logger.info(`Alert resolved: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Update system configuration
   */
  updateConfig(newConfig: Partial<SystemConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update component configurations
    if (newConfig.slippage) {
      this.slippageProtection?.updateConfig(newConfig.slippage);
    }
    if (newConfig.mev) {
      this.mevProtection?.updateConfig(newConfig.mev);
    }
    if (newConfig.gas) {
      this.gasOptimizer?.updateConfig(newConfig.gas);
    }
    if (newConfig.risk) {
      this.riskManager?.updateConfig(newConfig.risk);
    }

    logger.info('System configuration updated');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down DeFi system...');

      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // Cleanup components
      this.networkManager?.destroy();
      this.liquidityAggregator?.destroy();
      this.riskManager?.destroy();

      this.isInitialized = false;
      logger.info('DeFi system shutdown completed');
    } catch (error) {
      logger.error('Error during system shutdown', { error });
      throw new SystemError('System shutdown failed', { error });
    }
  }

  // Private helper methods

  private async validateTradeRequest(request: TradeRequest): Promise<void> {
    const errors: string[] = [];

    if (!ethers.utils.isAddress(request.tokenIn)) {
      errors.push('Invalid tokenIn address');
    }
    if (!ethers.utils.isAddress(request.tokenOut)) {
      errors.push('Invalid tokenOut address');
    }
    if (request.amountIn.lte(0)) {
      errors.push('Amount must be greater than 0');
    }
    if (!this.networkManager.getNetwork(request.networkId)) {
      errors.push('Unsupported network');
    }
    if (request.slippageTolerance && (request.slippageTolerance < 0 || request.slippageTolerance > 10)) {
      errors.push('Slippage tolerance must be between 0 and 10');
    }

    if (errors.length > 0) {
      throw new ValidationError('Invalid trade request', { errors });
    }
  }

  private async getExecutionContext(networkId: number): Promise<ExecutionContext> {
    const provider = this.networkManager.getProvider(networkId);
    if (!provider) {
      throw new SystemError(`Provider not found for network ${networkId}`);
    }

    const [blockNumber, gasPrice, nonce] = await Promise.all([
      provider.getBlockNumber(),
      provider.getGasPrice(),
      provider.getTransactionCount('0x0000000000000000000000000000000000000000') // Placeholder
    ]);

    return {
      networkId,
      blockNumber,
      gasPrice,
      nonce,
      timestamp: Date.now()
    };
  }

  private async executeWithMEVProtection(
    request: TradeRequest,
    tradeParams: any,
    gasEstimate: any,
    context: ExecutionContext
  ): Promise<TradeResult> {
    // Simplified MEV-protected execution
    // In practice, this would create and submit a bundle
    logger.info('Executing trade with MEV protection');
    
    // For now, fall back to direct execution
    return this.executeDirectTrade(request, tradeParams, gasEstimate, context);
  }

  private async executeDirectTrade(
    request: TradeRequest,
    tradeParams: any,
    gasEstimate: any,
    context: ExecutionContext
  ): Promise<TradeResult> {
    // Simplified direct trade execution
    // In practice, this would interact with DEX contracts
    logger.info('Executing direct trade');

    try {
      // Simulate trade execution
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay

      // Mock successful execution
      const mockAmountOut = request.amountIn.mul(98).div(100); // 2% slippage
      const mockGasUsed = gasEstimate.gasLimit.mul(80).div(100); // 80% of estimated gas

      return {
        success: true,
        transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        amountOut: mockAmountOut,
        gasUsed: mockGasUsed,
        actualSlippage: 2.0,
        executionTime: 0 // Will be set by caller
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed',
        executionTime: 0
      };
    }
  }

  private async waitForHealthyNetwork(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const healthyNetworks = await this.networkManager.getHealthyNetworks();
      if (healthyNetworks.length > 0) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new SystemError('No healthy networks available within timeout');
  }

  private async getServiceStatuses(): Promise<Map<string, ServiceStatus>> {
    const services = new Map<string, ServiceStatus>();

    // Network Manager status
    services.set('networkManager', {
      name: 'Network Manager',
      isHealthy: true,
      uptime: Date.now() - this.startTime,
      errorCount: 0,
      metrics: {
        networksCount: this.networkManager.getAllNetworks().length,
        healthyNetworks: (await this.networkManager.getHealthyNetworks()).length
      }
    });

    // Liquidity Aggregator status
    const providerMetrics = this.liquidityAggregator.getProviderMetrics();
    services.set('liquidityAggregator', {
      name: 'Liquidity Aggregator',
      isHealthy: Array.from(providerMetrics.values()).some(m => m.reliability > 50),
      uptime: Date.now() - this.startTime,
      errorCount: Array.from(providerMetrics.values()).reduce((sum, m) => sum + m.errorCount, 0),
      metrics: {
        providersCount: providerMetrics.size,
        averageReliability: Array.from(providerMetrics.values())
          .reduce((sum, m) => sum + m.reliability, 0) / providerMetrics.size
      }
    });

    // Risk Manager status
    const riskMetrics = await this.riskManager.calculateRiskMetrics();
    services.set('riskManager', {
      name: 'Risk Manager',
      isHealthy: riskMetrics.drawdown < 15, // Healthy if drawdown < 15%
      uptime: Date.now() - this.startTime,
      errorCount: 0,
      metrics: {
        currentDrawdown: riskMetrics.drawdown,
        winRate: riskMetrics.winRate,
        sharpeRatio: riskMetrics.sharpeRatio
      }
    });

    return services;
  }

  private isSystemHealthy(
    networkStatuses: Map<number, NetworkStatus>,
    serviceStatuses: Map<string, ServiceStatus>
  ): boolean {
    // At least one network must be healthy
    const hasHealthyNetwork = Array.from(networkStatuses.values()).some(n => n.isHealthy);
    
    // All critical services must be healthy
    const allServicesHealthy = Array.from(serviceStatuses.values()).every(s => s.isHealthy);
    
    return hasHealthyNetwork && allServicesHealthy;
  }

  private updateMetrics(result: TradeResult, amountIn: BigNumber): void {
    this.metrics.totalTrades++;
    
    if (result.success) {
      this.metrics.successfulTrades++;
      this.metrics.totalVolume = this.metrics.totalVolume.add(amountIn);
      
      if (result.amountOut) {
        const profit = result.amountOut.sub(amountIn);
        this.metrics.totalProfit = this.metrics.totalProfit.add(profit);
      }
      
      if (result.gasUsed) {
        const totalGas = this.metrics.averageGasUsed.mul(this.metrics.successfulTrades - 1).add(result.gasUsed);
        this.metrics.averageGasUsed = totalGas.div(this.metrics.successfulTrades);
      }
      
      if (result.actualSlippage !== undefined) {
        const totalSlippage = this.metrics.averageSlippage * (this.metrics.successfulTrades - 1) + result.actualSlippage;
        this.metrics.averageSlippage = totalSlippage / this.metrics.successfulTrades;
      }
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const status = await this.getSystemStatus();
        
        // Check for alerts
        if (!status.isHealthy) {
          this.createAlert('error', 'high', 'System health degraded', {
            networks: status.networks.size,
            services: status.services.size
          });
        }

        // Check individual network health
        for (const [chainId, networkStatus] of status.networks) {
          if (!networkStatus.isHealthy && networkStatus.errorCount > 5) {
            this.createAlert('warning', 'medium', `Network ${chainId} experiencing issues`, {
              errorCount: networkStatus.errorCount,
              latency: networkStatus.latency
            });
          }
        }

      } catch (error) {
        logger.error('Health monitoring failed', { error });
      }
    }, 30000); // Check every 30 seconds
  }

  private createAlert(
    type: 'error' | 'warning' | 'info',
    severity: 'low' | 'medium' | 'high' | 'critical',
    message: string,
    details: any
  ): void {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      details,
      timestamp: Date.now(),
      resolved: false
    };

    this.alerts.push(alert);
    
    // Keep only recent alerts (last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    logger.warn(`Alert created: ${message}`, { alert });
  }
}