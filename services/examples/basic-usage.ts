#!/usr/bin/env ts-node

/**
 * Basic usage example of the DeFi System
 * 
 * This example demonstrates how to:
 * 1. Initialize the system
 * 2. Execute trades with full protection
 * 3. Monitor system health
 * 4. Handle graceful shutdown
 */

import { ethers } from 'ethers';
import { SystemLauncher, TradeRequest, logger } from '../src/index';

async function main() {
  let launcher: SystemLauncher | null = null;

  try {
    console.log('🚀 Starting DeFi System Example...\n');

    // 1. Initialize the system launcher
    launcher = new SystemLauncher({
      environment: 'development',
      logLevel: 'info',
      enableMetrics: true,
      enableAlerts: true,
      gracefulShutdownTimeout: 10000
    });

    // 2. Launch the DeFi system
    console.log('📡 Launching DeFi system...');
    const system = await launcher.launch();
    console.log('✅ System launched successfully!\n');

    // 3. Check system health
    console.log('🏥 Checking system health...');
    const healthSummary = await system.getHealthSummary();
    console.log(`Overall health: ${healthSummary.overall}`);
    console.log(`Networks: ${healthSummary.networks.healthy}/${healthSummary.networks.total} healthy`);
    console.log(`Services: ${healthSummary.services.healthy}/${healthSummary.services.total} healthy`);
    console.log(`Uptime: ${Math.round(healthSummary.uptime / 1000)}s\n`);

    // 4. Get system status
    console.log('📊 System status:');
    const status = await system.getSystemStatus();
    console.log(`Total trades: ${status.metrics.totalTrades}`);
    console.log(`Successful trades: ${status.metrics.successfulTrades}`);
    console.log(`Total volume: ${ethers.utils.formatEther(status.metrics.totalVolume)} ETH`);
    console.log(`Total profit: ${ethers.utils.formatEther(status.metrics.totalProfit)} ETH\n`);

    // 5. Example trade execution
    console.log('💱 Executing example trade...');
    const tradeRequest: TradeRequest = {
      tokenIn: '0xA0b86a33E6441b8435b662303c0f098C8c8c30c1', // Example token
      tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      amountIn: ethers.utils.parseEther('0.1'), // 0.1 ETH worth
      networkId: 1, // Ethereum mainnet
      priority: 'medium',
      mevProtection: true,
      slippageTolerance: 1.0 // 1% slippage tolerance
    };

    const tradeResult = await system.executeTrade(tradeRequest);
    
    if (tradeResult.success) {
      console.log('✅ Trade executed successfully!');
      console.log(`Transaction hash: ${tradeResult.transactionHash}`);
      console.log(`Amount out: ${ethers.utils.formatEther(tradeResult.amountOut || '0')} tokens`);
      console.log(`Gas used: ${tradeResult.gasUsed?.toString()} units`);
      console.log(`Actual slippage: ${tradeResult.actualSlippage?.toFixed(2)}%`);
      console.log(`Execution time: ${tradeResult.executionTime}ms`);
    } else {
      console.log('❌ Trade failed:');
      console.log(`Error: ${tradeResult.error}`);
      console.log(`Execution time: ${tradeResult.executionTime}ms`);
    }

    console.log('\n📈 Performance metrics:');
    const performanceMetrics = launcher.getPerformanceMetrics();
    console.log(`Startup time: ${performanceMetrics.startupTime}ms`);
    console.log(`Memory usage: ${Math.round(performanceMetrics.memoryUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`System uptime: ${Math.round(performanceMetrics.systemUptime / 1000)}s`);

    // 6. Monitor for a short period
    console.log('\n⏱️  Monitoring system for 30 seconds...');
    await monitorSystem(system, 30000);

    // 7. Demonstrate configuration update
    console.log('\n⚙️  Updating system configuration...');
    system.updateConfig({
      slippage: {
        tolerance: 0.8,
        maxTolerance: 2.5,
        safetyBuffer: 0.2,
        deadline: 600
      }
    });
    console.log('✅ Configuration updated successfully!');

    console.log('\n🎉 Example completed successfully!');

  } catch (error) {
    console.error('❌ Error in example:', error);
    process.exit(1);
  } finally {
    // 8. Graceful shutdown
    if (launcher) {
      console.log('\n🛑 Shutting down system...');
      await launcher.shutdown();
      console.log('✅ System shutdown completed!');
    }
  }
}

async function monitorSystem(system: any, duration: number) {
  const startTime = Date.now();
  const interval = 5000; // Check every 5 seconds

  while (Date.now() - startTime < duration) {
    try {
      const healthSummary = await system.getHealthSummary();
      const alerts = system.getRecentAlerts(3);
      
      console.log(`[${new Date().toISOString()}] Health: ${healthSummary.overall}, Alerts: ${alerts.length}`);
      
      // Log any new alerts
      alerts.forEach((alert: any) => {
        if (!alert.resolved) {
          console.log(`  🚨 ${alert.severity.toUpperCase()}: ${alert.message}`);
        }
      });

    } catch (error) {
      console.error('Monitoring error:', error);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the example
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };