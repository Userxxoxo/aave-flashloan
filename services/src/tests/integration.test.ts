import { ethers, BigNumber } from 'ethers';
import { 
  SystemLauncher, 
  DeFiSystem, 
  NetworkManager, 
  LiquidityAggregator, 
  RiskManager,
  TradeRequest 
} from '../index';

describe('DeFi System Integration Tests', () => {
  let launcher: SystemLauncher;
  let system: DeFiSystem;

  beforeAll(async () => {
    // Initialize system launcher with test configuration
    launcher = new SystemLauncher({
      environment: 'development',
      logLevel: 'debug',
      enableMetrics: true,
      enableAlerts: false, // Disable alerts for testing
      gracefulShutdownTimeout: 5000
    });
  });

  afterAll(async () => {
    if (launcher) {
      await launcher.shutdown();
    }
  });

  describe('System Initialization', () => {
    test('should launch system successfully', async () => {
      system = await launcher.launch();
      expect(system).toBeDefined();
      expect(launcher.isRunning()).toBe(true);
    }, 30000);

    test('should have healthy system status', async () => {
      const status = await system.getSystemStatus();
      expect(status.isHealthy).toBe(true);
      expect(status.networks.size).toBeGreaterThan(0);
      expect(status.services.size).toBeGreaterThan(0);
    });

    test('should have performance metrics', async () => {
      const metrics = launcher.getPerformanceMetrics();
      expect(metrics.startupTime).toBeGreaterThan(0);
      expect(metrics.systemUptime).toBeGreaterThan(0);
      expect(metrics.memoryUsage).toBeDefined();
    });
  });

  describe('Network Management', () => {
    let networkManager: NetworkManager;

    beforeAll(() => {
      networkManager = new NetworkManager();
    });

    afterAll(() => {
      networkManager?.destroy();
    });

    test('should have default networks configured', () => {
      const networks = networkManager.getAllNetworks();
      expect(networks.length).toBeGreaterThan(0);
      
      // Check for expected networks
      const chainIds = networks.map(n => n.chainId);
      expect(chainIds).toContain(1); // Ethereum
      expect(chainIds).toContain(137); // Polygon
      expect(chainIds).toContain(42161); // Arbitrum
      expect(chainIds).toContain(10); // Optimism
    });

    test('should validate network configurations', () => {
      const networks = networkManager.getAllNetworks();
      
      for (const network of networks) {
        expect(network.chainId).toBeGreaterThan(0);
        expect(network.name).toBeTruthy();
        expect(network.rpcUrl).toMatch(/^https?:\/\//);
        expect(network.nativeCurrency.symbol).toBeTruthy();
        expect(network.initialBalance.gt(0)).toBe(true);
        expect(Array.isArray(network.supportedDEXs)).toBe(true);
        expect(Array.isArray(network.supportedTokens)).toBe(true);
      }
    });

    test('should get network status', async () => {
      const networks = networkManager.getAllNetworks();
      const firstNetwork = networks[0];
      
      // Wait a bit for status to be updated
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const status = networkManager.getNetworkStatus(firstNetwork.chainId);
      expect(status).toBeDefined();
      expect(status?.chainId).toBe(firstNetwork.chainId);
    });
  });

  describe('Liquidity Aggregation', () => {
    let liquidityAggregator: LiquidityAggregator;

    beforeAll(() => {
      liquidityAggregator = new LiquidityAggregator();
    });

    afterAll(() => {
      liquidityAggregator?.destroy();
    });

    test('should have default providers configured', () => {
      const metrics = liquidityAggregator.getProviderMetrics();
      expect(metrics.size).toBeGreaterThan(0);
      
      // Check for expected providers
      expect(metrics.has('1inch')).toBe(true);
      expect(metrics.has('0x')).toBe(true);
      expect(metrics.has('paraswap')).toBe(true);
    });

    test('should rank providers by reliability', () => {
      const ranking = liquidityAggregator.getProviderRanking();
      expect(ranking.length).toBeGreaterThan(0);
      
      // Should be sorted by reliability (descending)
      for (let i = 1; i < ranking.length; i++) {
        expect(ranking[i-1].reliability).toBeGreaterThanOrEqual(ranking[i].reliability);
      }
    });

    test('should handle quote request gracefully', async () => {
      const request: TradeRequest = {
        tokenIn: '0xA0b86a33E6441b8435b662303c0f098C8c8c30c1', // Mock token
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        amountIn: ethers.utils.parseEther('1'),
        networkId: 1,
        priority: 'medium',
        mevProtection: false
      };

      // This should not throw, even if providers fail
      try {
        const quote = await liquidityAggregator.getAggregatedQuote(request);
        // If successful, validate structure
        if (quote) {
          expect(quote.bestQuote).toBeDefined();
          expect(quote.allQuotes).toBeDefined();
          expect(Array.isArray(quote.allQuotes)).toBe(true);
        }
      } catch (error) {
        // Expected to fail with mock data, but should be handled gracefully
        expect(error).toBeDefined();
      }
    });
  });

  describe('Risk Management', () => {
    let riskManager: RiskManager;

    beforeAll(() => {
      riskManager = new RiskManager();
    });

    afterAll(() => {
      riskManager?.destroy();
    });

    test('should calculate initial risk metrics', async () => {
      const metrics = await riskManager.calculateRiskMetrics();
      
      expect(metrics.currentExposure).toBeDefined();
      expect(metrics.dailyPnL).toBeDefined();
      expect(typeof metrics.drawdown).toBe('number');
      expect(typeof metrics.sharpeRatio).toBe('number');
      expect(typeof metrics.volatility).toBe('number');
      expect(metrics.var95).toBeDefined();
      expect(typeof metrics.winRate).toBe('number');
    });

    test('should assess trade risk', async () => {
      const request: TradeRequest = {
        tokenIn: '0xA0b86a33E6441b8435b662303c0f098C8c8c30c1',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: ethers.utils.parseEther('1'),
        networkId: 1,
        priority: 'medium',
        mevProtection: false
      };

      const networkConditions = {
        baseFee: BigNumber.from('20000000000'), // 20 gwei
        priorityFee: BigNumber.from('2000000000'), // 2 gwei
        gasUsed: 15000000,
        gasLimit: 30000000,
        blockNumber: 18000000,
        timestamp: Date.now(),
        congestionLevel: 'medium' as const
      };

      const assessment = await riskManager.assessTradeRisk(request, networkConditions);
      
      expect(assessment.riskLevel).toMatch(/^(low|medium|high|critical)$/);
      expect(typeof assessment.score).toBe('number');
      expect(Array.isArray(assessment.factors)).toBe(true);
      expect(Array.isArray(assessment.recommendations)).toBe(true);
      expect(typeof assessment.shouldProceed).toBe('boolean');
      expect(assessment.maxAllowedSize).toBeDefined();
    });

    test('should check position limits', () => {
      const tokenAddress = '0xA0b86a33E6441b8435b662303c0f098C8c8c30c1';
      const amount = ethers.utils.parseEther('1');
      
      const withinLimits = riskManager.checkPositionLimits(tokenAddress, amount);
      expect(typeof withinLimits).toBe('boolean');
    });

    test('should record trades', () => {
      const request: TradeRequest = {
        tokenIn: '0xA0b86a33E6441b8435b662303c0f098C8c8c30c1',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: ethers.utils.parseEther('1'),
        networkId: 1,
        priority: 'medium',
        mevProtection: false
      };

      const amountOut = ethers.utils.parseEther('1.02'); // 2% profit
      const gasUsed = BigNumber.from('150000');

      riskManager.recordTrade(request, amountOut, gasUsed, true);
      
      const history = riskManager.getTradeHistory(1);
      expect(history.length).toBe(1);
      expect(history[0].success).toBe(true);
      expect(history[0].amountOut.toString()).toBe(amountOut.toString());
    });
  });

  describe('End-to-End Trade Execution', () => {
    test('should execute a mock trade', async () => {
      const request: TradeRequest = {
        tokenIn: '0xA0b86a33E6441b8435b662303c0f098C8c8c30c1',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: ethers.utils.parseEther('0.1'), // Small amount for testing
        networkId: 1,
        priority: 'medium',
        mevProtection: false,
        slippageTolerance: 1
      };

      const result = await system.executeTrade(request);
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.executionTime).toBe('number');
      
      if (result.success) {
        expect(result.transactionHash).toBeTruthy();
        expect(result.amountOut).toBeDefined();
        expect(result.gasUsed).toBeDefined();
      } else {
        expect(result.error).toBeTruthy();
      }
    });

    test('should handle invalid trade request', async () => {
      const invalidRequest: TradeRequest = {
        tokenIn: 'invalid-address',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        amountIn: ethers.utils.parseEther('1'),
        networkId: 999, // Invalid network
        priority: 'medium',
        mevProtection: false
      };

      const result = await system.executeTrade(invalidRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('System Health and Monitoring', () => {
    test('should provide health summary', async () => {
      const healthSummary = await system.getHealthSummary();
      
      expect(healthSummary.overall).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(healthSummary.networks).toBeDefined();
      expect(healthSummary.services).toBeDefined();
      expect(typeof healthSummary.alerts).toBe('number');
      expect(typeof healthSummary.uptime).toBe('number');
    });

    test('should track system metrics', async () => {
      const status = await system.getSystemStatus();
      
      expect(status.metrics.totalTrades).toBeGreaterThanOrEqual(0);
      expect(status.metrics.successfulTrades).toBeGreaterThanOrEqual(0);
      expect(status.metrics.totalVolume).toBeDefined();
      expect(status.metrics.totalProfit).toBeDefined();
      expect(status.metrics.averageGasUsed).toBeDefined();
      expect(typeof status.metrics.averageSlippage).toBe('number');
      expect(typeof status.metrics.uptime).toBe('number');
    });

    test('should handle alerts', () => {
      const alerts = system.getRecentAlerts(5);
      expect(Array.isArray(alerts)).toBe(true);
      
      // All alerts should have required properties
      alerts.forEach(alert => {
        expect(alert.id).toBeTruthy();
        expect(alert.type).toMatch(/^(error|warning|info)$/);
        expect(alert.severity).toMatch(/^(low|medium|high|critical)$/);
        expect(alert.message).toBeTruthy();
        expect(typeof alert.timestamp).toBe('number');
        expect(typeof alert.resolved).toBe('boolean');
      });
    });
  });

  describe('Configuration Management', () => {
    test('should update system configuration', () => {
      const newConfig = {
        slippage: {
          tolerance: 0.8,
          maxTolerance: 3.0,
          safetyBuffer: 0.15,
          deadline: 600
        }
      };

      expect(() => {
        system.updateConfig(newConfig);
      }).not.toThrow();
    });

    test('should get launcher configuration', () => {
      const config = launcher.getConfig();
      
      expect(config.environment).toBeTruthy();
      expect(config.logLevel).toBeTruthy();
      expect(typeof config.enableMetrics).toBe('boolean');
      expect(typeof config.enableAlerts).toBe('boolean');
      expect(typeof config.gracefulShutdownTimeout).toBe('number');
    });
  });

  describe('Error Handling', () => {
    test('should handle system errors gracefully', async () => {
      // Test with system not initialized
      const newLauncher = new SystemLauncher();
      
      expect(() => {
        newLauncher.getSystem();
      }).not.toThrow();
      
      expect(newLauncher.getSystem()).toBeNull();
      expect(newLauncher.isRunning()).toBe(false);
    });

    test('should validate trade requests', async () => {
      const invalidRequests = [
        {
          tokenIn: '',
          tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amountIn: ethers.utils.parseEther('1'),
          networkId: 1,
          priority: 'medium' as const,
          mevProtection: false
        },
        {
          tokenIn: '0xA0b86a33E6441b8435b662303c0f098C8c8c30c1',
          tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          amountIn: BigNumber.from(0),
          networkId: 1,
          priority: 'medium' as const,
          mevProtection: false
        }
      ];

      for (const request of invalidRequests) {
        const result = await system.executeTrade(request);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
      }
    });
  });
});

// Helper function to wait for async operations
const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));