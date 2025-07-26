import { ethers, BigNumber } from 'ethers';
import { 
  SystemConfig, 
  NetworkConfig,
  SlippageConfig,
  MEVConfig,
  GasConfig,
  RiskConfig,
  MonitoringConfig
} from '../types';
import { DeFiSystem } from './DeFiSystem';
import { SystemError } from '../utils/errors';
import logger from '../utils/logger';

interface LauncherConfig {
  environment: 'development' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableMetrics: boolean;
  enableAlerts: boolean;
  gracefulShutdownTimeout: number;
}

interface PerformanceMetrics {
  startupTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  systemUptime: number;
  lastHealthCheck: number;
}

export class SystemLauncher {
  private system: DeFiSystem | null = null;
  private config: LauncherConfig;
  private performanceMetrics: PerformanceMetrics;
  private isShuttingDown: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<LauncherConfig>) {
    this.config = {
      environment: 'development',
      logLevel: 'info',
      enableMetrics: true,
      enableAlerts: true,
      gracefulShutdownTimeout: 30000,
      ...config
    };

    this.performanceMetrics = {
      startupTime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      systemUptime: 0,
      lastHealthCheck: 0
    };

    this.setupProcessHandlers();
    logger.info('SystemLauncher initialized', { config: this.config });
  }

  /**
   * Launch the DeFi system with full configuration
   */
  async launch(): Promise<DeFiSystem> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting DeFi system launch...');

      // Create system configuration
      const systemConfig = this.createSystemConfig();

      // Initialize the DeFi system
      this.system = new DeFiSystem(systemConfig);
      await this.system.initialize();

      // Start monitoring if enabled
      if (this.config.enableMetrics) {
        this.startPerformanceMonitoring();
      }

      if (this.config.enableAlerts) {
        this.startHealthMonitoring();
      }

      this.performanceMetrics.startupTime = Date.now() - startTime;
      this.performanceMetrics.systemUptime = Date.now();

      logger.info('DeFi system launched successfully', {
        startupTime: this.performanceMetrics.startupTime,
        environment: this.config.environment
      });

      return this.system;
    } catch (error) {
      logger.error('Failed to launch DeFi system', { error });
      throw new SystemError('System launch failed', { error });
    }
  }

  /**
   * Get system performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return {
      ...this.performanceMetrics,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      systemUptime: this.performanceMetrics.systemUptime > 0 
        ? Date.now() - this.performanceMetrics.systemUptime 
        : 0,
      lastHealthCheck: this.performanceMetrics.lastHealthCheck
    };
  }

  /**
   * Get system health report
   */
  async getHealthReport(): Promise<{
    system: any;
    performance: PerformanceMetrics;
    environment: string;
    uptime: number;
  }> {
    if (!this.system) {
      throw new SystemError('System not launched');
    }

    const systemHealth = await this.system.getHealthSummary();
    const performance = this.getPerformanceMetrics();

    return {
      system: systemHealth,
      performance,
      environment: this.config.environment,
      uptime: performance.systemUptime
    };
  }

  /**
   * Gracefully shutdown the system
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    try {
      // Stop monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
        this.metricsInterval = null;
      }

      // Shutdown system with timeout
      if (this.system) {
        const shutdownPromise = this.system.shutdown();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Shutdown timeout')), this.config.gracefulShutdownTimeout)
        );

        await Promise.race([shutdownPromise, timeoutPromise]);
        this.system = null;
      }

      logger.info('Graceful shutdown completed');
    } catch (error) {
      logger.error('Error during shutdown', { error });
      throw new SystemError('Shutdown failed', { error });
    }
  }

  /**
   * Restart the system
   */
  async restart(): Promise<DeFiSystem> {
    logger.info('Restarting system...');
    
    if (this.system) {
      await this.shutdown();
    }

    return this.launch();
  }

  /**
   * Update system configuration and restart if needed
   */
  async updateConfiguration(newConfig: Partial<SystemConfig>): Promise<void> {
    if (!this.system) {
      throw new SystemError('System not launched');
    }

    try {
      // Try to update configuration without restart
      this.system.updateConfig(newConfig);
      logger.info('Configuration updated successfully');
    } catch (error) {
      logger.warn('Configuration update requires restart', { error });
      await this.restart();
    }
  }

  // Private helper methods

  private createSystemConfig(): SystemConfig {
    const networks = this.createNetworkConfigs();
    const slippage = this.createSlippageConfig();
    const mev = this.createMEVConfig();
    const gas = this.createGasConfig();
    const risk = this.createRiskConfig();
    const monitoring = this.createMonitoringConfig();

    return {
      networks,
      slippage,
      mev,
      gas,
      risk,
      monitoring
    };
  }

  private createNetworkConfigs(): NetworkConfig[] {
    const baseConfigs: NetworkConfig[] = [
      {
        chainId: 1,
        name: 'Ethereum Mainnet',
        rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.alchemyapi.io/v2/demo',
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18
        },
        blockExplorer: 'https://etherscan.io',
        gasMultiplier: this.config.environment === 'production' ? 1.2 : 1.1,
        maxGasPrice: ethers.utils.parseUnits('100', 'gwei'),
        initialBalance: ethers.utils.parseEther('0.02'), // ~$50 USD
        supportedDEXs: ['uniswap', '1inch', '0x'],
        supportedTokens: ['USDC', 'USDT', 'DAI', 'WETH']
      },
      {
        chainId: 137,
        name: 'Polygon',
        rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
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
        rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
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
        rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
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

    // Adjust configurations based on environment
    if (this.config.environment === 'development') {
      // Use testnets or reduce limits for development
      return baseConfigs.map(config => ({
        ...config,
        initialBalance: config.initialBalance.div(10), // Reduce balance for testing
        maxGasPrice: config.maxGasPrice.div(2) // Lower gas limits
      }));
    }

    return baseConfigs;
  }

  private createSlippageConfig(): SlippageConfig {
    const baseConfig = {
      tolerance: 0.5,
      maxTolerance: 2.0,
      safetyBuffer: 0.1,
      deadline: 300
    };

    if (this.config.environment === 'production') {
      return {
        ...baseConfig,
        tolerance: 0.3, // Tighter slippage in production
        safetyBuffer: 0.2 // Higher safety buffer
      };
    }

    return baseConfig;
  }

  private createMEVConfig(): MEVConfig {
    return {
      usePrivateMempool: this.config.environment === 'production',
      bundleDelay: 2,
      maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei'),
      gasLimit: BigNumber.from(500000),
      enableBackrunProtection: true,
      simulationRequired: true
    };
  }

  private createGasConfig(): GasConfig {
    const baseConfig = {
      baseFeeMultiplier: 1.125,
      priorityFeeMultiplier: 1.2,
      gasLimitBuffer: 20,
      cacheTimeout: 60,
      maxGasPrice: ethers.utils.parseUnits('100', 'gwei')
    };

    if (this.config.environment === 'production') {
      return {
        ...baseConfig,
        baseFeeMultiplier: 1.2, // Higher multiplier for production
        priorityFeeMultiplier: 1.3,
        gasLimitBuffer: 25 // Higher buffer for safety
      };
    }

    return baseConfig;
  }

  private createRiskConfig(): RiskConfig {
    const baseConfig = {
      maxPositionSize: ethers.utils.parseEther('10'),
      maxDailyLoss: ethers.utils.parseEther('5'),
      maxDrawdown: 20,
      maxLeverage: 1,
      stopLossThreshold: 10,
      riskFreeRate: 2,
      volatilityWindow: 100,
      correlationThreshold: 0.7
    };

    if (this.config.environment === 'production') {
      return {
        ...baseConfig,
        maxPositionSize: ethers.utils.parseEther('50'), // Higher limits for production
        maxDailyLoss: ethers.utils.parseEther('25'),
        maxDrawdown: 15, // Stricter drawdown limit
        stopLossThreshold: 8 // Tighter stop loss
      };
    } else if (this.config.environment === 'development') {
      return {
        ...baseConfig,
        maxPositionSize: ethers.utils.parseEther('1'), // Lower limits for testing
        maxDailyLoss: ethers.utils.parseEther('0.5'),
        maxDrawdown: 30 // More lenient for testing
      };
    }

    return baseConfig;
  }

  private createMonitoringConfig(): MonitoringConfig {
    return {
      alertThresholds: {
        errorRate: this.config.environment === 'production' ? 5 : 10, // 5% error rate in prod
        latency: 5000, // 5 second latency threshold
        gasPrice: ethers.utils.parseUnits('50', 'gwei'),
        slippage: 3, // 3% slippage threshold
        profitMargin: 0.1 // 0.1% minimum profit margin
      },
      notifications: {
        ...(process.env.ALERT_EMAIL && { email: [process.env.ALERT_EMAIL] }),
        ...(process.env.ALERT_WEBHOOK && { webhook: process.env.ALERT_WEBHOOK }),
        ...(process.env.SLACK_WEBHOOK && { slack: process.env.SLACK_WEBHOOK })
      },
      metricsRetention: this.config.environment === 'production' ? 30 : 7, // days
      healthCheckInterval: 30 // seconds
    };
  }

  private setupProcessHandlers(): void {
    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, starting graceful shutdown...');
      try {
        await this.shutdown();
        process.exit(0);
      } catch (error) {
        logger.error('Error during SIGTERM shutdown', { error });
        process.exit(1);
      }
    });

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, starting graceful shutdown...');
      try {
        await this.shutdown();
        process.exit(0);
      } catch (error) {
        logger.error('Error during SIGINT shutdown', { error });
        process.exit(1);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      
      // Try graceful shutdown
      this.shutdown().finally(() => {
        process.exit(1);
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason, promise });
      
      // Try graceful shutdown
      this.shutdown().finally(() => {
        process.exit(1);
      });
    });
  }

  private startPerformanceMonitoring(): void {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getPerformanceMetrics();
      
      // Log performance metrics
      logger.debug('Performance metrics', {
        memoryUsage: {
          rss: Math.round(metrics.memoryUsage.rss / 1024 / 1024) + 'MB',
          heapUsed: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024) + 'MB'
        },
        uptime: Math.round(metrics.systemUptime / 1000) + 's'
      });

      // Check for memory leaks
      if (metrics.memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
        logger.warn('High memory usage detected', {
          heapUsed: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024) + 'MB'
        });
      }

    }, 60000); // Every minute
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        if (this.system) {
          const healthReport = await this.getHealthReport();
          this.performanceMetrics.lastHealthCheck = Date.now();

          // Log health status
          if (healthReport.system.overall !== 'healthy') {
            logger.warn('System health degraded', {
              overall: healthReport.system.overall,
              networks: healthReport.system.networks,
              services: healthReport.system.services,
              alerts: healthReport.system.alerts
            });
          }

          // Check for critical issues
          if (healthReport.system.overall === 'unhealthy') {
            logger.error('System is unhealthy - immediate attention required');
          }
        }
      } catch (error) {
        logger.error('Health monitoring failed', { error });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Get launcher configuration
   */
  getConfig(): LauncherConfig {
    return { ...this.config };
  }

  /**
   * Check if system is running
   */
  isRunning(): boolean {
    return this.system !== null && !this.isShuttingDown;
  }

  /**
   * Get system instance (if running)
   */
  getSystem(): DeFiSystem | null {
    return this.system;
  }
}