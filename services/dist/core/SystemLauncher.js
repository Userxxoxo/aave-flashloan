"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemLauncher = void 0;
const ethers_1 = require("ethers");
const DeFiSystem_1 = require("./DeFiSystem");
const errors_1 = require("../utils/errors");
const logger_1 = __importDefault(require("../utils/logger"));
class SystemLauncher {
    constructor(config) {
        this.system = null;
        this.isShuttingDown = false;
        this.healthCheckInterval = null;
        this.metricsInterval = null;
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
        logger_1.default.info('SystemLauncher initialized', { config: this.config });
    }
    /**
     * Launch the DeFi system with full configuration
     */
    async launch() {
        const startTime = Date.now();
        try {
            logger_1.default.info('Starting DeFi system launch...');
            // Create system configuration
            const systemConfig = this.createSystemConfig();
            // Initialize the DeFi system
            this.system = new DeFiSystem_1.DeFiSystem(systemConfig);
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
            logger_1.default.info('DeFi system launched successfully', {
                startupTime: this.performanceMetrics.startupTime,
                environment: this.config.environment
            });
            return this.system;
        }
        catch (error) {
            logger_1.default.error('Failed to launch DeFi system', { error });
            throw new errors_1.SystemError('System launch failed', { error });
        }
    }
    /**
     * Get system performance metrics
     */
    getPerformanceMetrics() {
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
    async getHealthReport() {
        if (!this.system) {
            throw new errors_1.SystemError('System not launched');
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
    async shutdown() {
        if (this.isShuttingDown) {
            logger_1.default.warn('Shutdown already in progress');
            return;
        }
        this.isShuttingDown = true;
        logger_1.default.info('Starting graceful shutdown...');
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
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), this.config.gracefulShutdownTimeout));
                await Promise.race([shutdownPromise, timeoutPromise]);
                this.system = null;
            }
            logger_1.default.info('Graceful shutdown completed');
        }
        catch (error) {
            logger_1.default.error('Error during shutdown', { error });
            throw new errors_1.SystemError('Shutdown failed', { error });
        }
    }
    /**
     * Restart the system
     */
    async restart() {
        logger_1.default.info('Restarting system...');
        if (this.system) {
            await this.shutdown();
        }
        return this.launch();
    }
    /**
     * Update system configuration and restart if needed
     */
    async updateConfiguration(newConfig) {
        if (!this.system) {
            throw new errors_1.SystemError('System not launched');
        }
        try {
            // Try to update configuration without restart
            this.system.updateConfig(newConfig);
            logger_1.default.info('Configuration updated successfully');
        }
        catch (error) {
            logger_1.default.warn('Configuration update requires restart', { error });
            await this.restart();
        }
    }
    // Private helper methods
    createSystemConfig() {
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
    createNetworkConfigs() {
        const baseConfigs = [
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
                maxGasPrice: ethers_1.ethers.utils.parseUnits('100', 'gwei'),
                initialBalance: ethers_1.ethers.utils.parseEther('0.02'),
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
                maxGasPrice: ethers_1.ethers.utils.parseUnits('500', 'gwei'),
                initialBalance: ethers_1.ethers.utils.parseEther('50'),
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
                maxGasPrice: ethers_1.ethers.utils.parseUnits('10', 'gwei'),
                initialBalance: ethers_1.ethers.utils.parseEther('0.02'),
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
                maxGasPrice: ethers_1.ethers.utils.parseUnits('10', 'gwei'),
                initialBalance: ethers_1.ethers.utils.parseEther('0.02'),
                supportedDEXs: ['uniswap', 'velodrome', '1inch'],
                supportedTokens: ['USDC', 'USDT', 'DAI', 'WETH']
            }
        ];
        // Adjust configurations based on environment
        if (this.config.environment === 'development') {
            // Use testnets or reduce limits for development
            return baseConfigs.map(config => ({
                ...config,
                initialBalance: config.initialBalance.div(10),
                maxGasPrice: config.maxGasPrice.div(2) // Lower gas limits
            }));
        }
        return baseConfigs;
    }
    createSlippageConfig() {
        const baseConfig = {
            tolerance: 0.5,
            maxTolerance: 2.0,
            safetyBuffer: 0.1,
            deadline: 300
        };
        if (this.config.environment === 'production') {
            return {
                ...baseConfig,
                tolerance: 0.3,
                safetyBuffer: 0.2 // Higher safety buffer
            };
        }
        return baseConfig;
    }
    createMEVConfig() {
        return {
            usePrivateMempool: this.config.environment === 'production',
            bundleDelay: 2,
            maxPriorityFeePerGas: ethers_1.ethers.utils.parseUnits('2', 'gwei'),
            gasLimit: ethers_1.BigNumber.from(500000),
            enableBackrunProtection: true,
            simulationRequired: true
        };
    }
    createGasConfig() {
        const baseConfig = {
            baseFeeMultiplier: 1.125,
            priorityFeeMultiplier: 1.2,
            gasLimitBuffer: 20,
            cacheTimeout: 60,
            maxGasPrice: ethers_1.ethers.utils.parseUnits('100', 'gwei')
        };
        if (this.config.environment === 'production') {
            return {
                ...baseConfig,
                baseFeeMultiplier: 1.2,
                priorityFeeMultiplier: 1.3,
                gasLimitBuffer: 25 // Higher buffer for safety
            };
        }
        return baseConfig;
    }
    createRiskConfig() {
        const baseConfig = {
            maxPositionSize: ethers_1.ethers.utils.parseEther('10'),
            maxDailyLoss: ethers_1.ethers.utils.parseEther('5'),
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
                maxPositionSize: ethers_1.ethers.utils.parseEther('50'),
                maxDailyLoss: ethers_1.ethers.utils.parseEther('25'),
                maxDrawdown: 15,
                stopLossThreshold: 8 // Tighter stop loss
            };
        }
        else if (this.config.environment === 'development') {
            return {
                ...baseConfig,
                maxPositionSize: ethers_1.ethers.utils.parseEther('1'),
                maxDailyLoss: ethers_1.ethers.utils.parseEther('0.5'),
                maxDrawdown: 30 // More lenient for testing
            };
        }
        return baseConfig;
    }
    createMonitoringConfig() {
        return {
            alertThresholds: {
                errorRate: this.config.environment === 'production' ? 5 : 10,
                latency: 5000,
                gasPrice: ethers_1.ethers.utils.parseUnits('50', 'gwei'),
                slippage: 3,
                profitMargin: 0.1 // 0.1% minimum profit margin
            },
            notifications: {
                ...(process.env.ALERT_EMAIL && { email: [process.env.ALERT_EMAIL] }),
                ...(process.env.ALERT_WEBHOOK && { webhook: process.env.ALERT_WEBHOOK }),
                ...(process.env.SLACK_WEBHOOK && { slack: process.env.SLACK_WEBHOOK })
            },
            metricsRetention: this.config.environment === 'production' ? 30 : 7,
            healthCheckInterval: 30 // seconds
        };
    }
    setupProcessHandlers() {
        // Graceful shutdown on SIGTERM
        process.on('SIGTERM', async () => {
            logger_1.default.info('Received SIGTERM, starting graceful shutdown...');
            try {
                await this.shutdown();
                process.exit(0);
            }
            catch (error) {
                logger_1.default.error('Error during SIGTERM shutdown', { error });
                process.exit(1);
            }
        });
        // Graceful shutdown on SIGINT (Ctrl+C)
        process.on('SIGINT', async () => {
            logger_1.default.info('Received SIGINT, starting graceful shutdown...');
            try {
                await this.shutdown();
                process.exit(0);
            }
            catch (error) {
                logger_1.default.error('Error during SIGINT shutdown', { error });
                process.exit(1);
            }
        });
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger_1.default.error('Uncaught exception', { error });
            // Try graceful shutdown
            this.shutdown().finally(() => {
                process.exit(1);
            });
        });
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger_1.default.error('Unhandled promise rejection', { reason, promise });
            // Try graceful shutdown
            this.shutdown().finally(() => {
                process.exit(1);
            });
        });
    }
    startPerformanceMonitoring() {
        this.metricsInterval = setInterval(() => {
            const metrics = this.getPerformanceMetrics();
            // Log performance metrics
            logger_1.default.debug('Performance metrics', {
                memoryUsage: {
                    rss: Math.round(metrics.memoryUsage.rss / 1024 / 1024) + 'MB',
                    heapUsed: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024) + 'MB',
                    heapTotal: Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024) + 'MB'
                },
                uptime: Math.round(metrics.systemUptime / 1000) + 's'
            });
            // Check for memory leaks
            if (metrics.memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
                logger_1.default.warn('High memory usage detected', {
                    heapUsed: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024) + 'MB'
                });
            }
        }, 60000); // Every minute
    }
    startHealthMonitoring() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                if (this.system) {
                    const healthReport = await this.getHealthReport();
                    this.performanceMetrics.lastHealthCheck = Date.now();
                    // Log health status
                    if (healthReport.system.overall !== 'healthy') {
                        logger_1.default.warn('System health degraded', {
                            overall: healthReport.system.overall,
                            networks: healthReport.system.networks,
                            services: healthReport.system.services,
                            alerts: healthReport.system.alerts
                        });
                    }
                    // Check for critical issues
                    if (healthReport.system.overall === 'unhealthy') {
                        logger_1.default.error('System is unhealthy - immediate attention required');
                    }
                }
            }
            catch (error) {
                logger_1.default.error('Health monitoring failed', { error });
            }
        }, 30000); // Every 30 seconds
    }
    /**
     * Get launcher configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Check if system is running
     */
    isRunning() {
        return this.system !== null && !this.isShuttingDown;
    }
    /**
     * Get system instance (if running)
     */
    getSystem() {
        return this.system;
    }
}
exports.SystemLauncher = SystemLauncher;
//# sourceMappingURL=SystemLauncher.js.map