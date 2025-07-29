"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeFiSystem = void 0;
const ethers_1 = require("ethers");
const SlippageProtection_1 = require("../SlippageProtection");
const MEVProtection_1 = require("../MEVProtection");
const GasOptimizer_1 = require("../GasOptimizer");
const NetworkManager_1 = require("./NetworkManager");
const LiquidityAggregator_1 = require("./LiquidityAggregator");
const RiskManager_1 = require("./RiskManager");
const cache_1 = require("../utils/cache");
const errors_1 = require("../utils/errors");
const logger_1 = __importDefault(require("../utils/logger"));
class DeFiSystem {
    constructor(config) {
        this.isInitialized = false;
        this.alerts = [];
        this.healthCheckInterval = null;
        this.config = config;
        this.startTime = Date.now();
        this.cache = new cache_1.CacheManager(300); // 5 minute cache
        // Initialize metrics
        this.metrics = {
            totalTrades: 0,
            successfulTrades: 0,
            totalVolume: ethers_1.BigNumber.from(0),
            totalProfit: ethers_1.BigNumber.from(0),
            averageGasUsed: ethers_1.BigNumber.from(0),
            averageSlippage: 0,
            uptime: 0
        };
        // Initialize core components
        this.networkManager = new NetworkManager_1.NetworkManager();
        this.liquidityAggregator = new LiquidityAggregator_1.LiquidityAggregator();
        this.riskManager = new RiskManager_1.RiskManager(config.risk);
        logger_1.default.info('DeFiSystem constructor completed');
    }
    /**
     * Initialize the DeFi system
     */
    async initialize() {
        try {
            logger_1.default.info('Initializing DeFi system...');
            // Add configured networks
            for (const networkConfig of this.config.networks) {
                this.networkManager.addNetwork(networkConfig);
            }
            // Wait for at least one network to be healthy
            await this.waitForHealthyNetwork();
            // Initialize service components with first healthy network
            const healthyNetworks = await this.networkManager.getHealthyNetworks();
            if (healthyNetworks.length === 0) {
                throw new errors_1.SystemError('No healthy networks available');
            }
            const primaryNetworkId = healthyNetworks[0];
            const provider = this.networkManager.getProvider(primaryNetworkId);
            if (!provider) {
                throw new errors_1.SystemError(`Provider not found for network ${primaryNetworkId}`);
            }
            // Initialize protection services
            this.slippageProtection = new SlippageProtection_1.SlippageProtection(provider, this.config.slippage);
            this.mevProtection = new MEVProtection_1.MEVProtection(provider, undefined, this.config.mev);
            this.gasOptimizer = new GasOptimizer_1.GasOptimizer(provider, this.config.gas);
            // Start health monitoring
            this.startHealthMonitoring();
            this.isInitialized = true;
            logger_1.default.info('DeFi system initialized successfully', {
                networksCount: this.config.networks.length,
                healthyNetworks: healthyNetworks.length,
                primaryNetwork: primaryNetworkId
            });
        }
        catch (error) {
            logger_1.default.error('Failed to initialize DeFi system', { error });
            throw new errors_1.SystemError('System initialization failed', { error });
        }
    }
    /**
     * Execute a trade with full protection suite
     */
    async executeTrade(request) {
        var _a, _b, _c;
        if (!this.isInitialized) {
            throw new errors_1.SystemError('System not initialized');
        }
        const startTime = Date.now();
        let result;
        try {
            logger_1.default.info('Starting trade execution', {
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
                throw new errors_1.ExecutionError(`Network ${request.networkId} is not healthy`);
            }
            // Get execution context
            const context = await this.getExecutionContext(request.networkId);
            // Risk assessment
            const networkConditions = await this.gasOptimizer.getNetworkConditions();
            const riskAssessment = await this.riskManager.assessTradeRisk(request, networkConditions);
            if (!riskAssessment.shouldProceed) {
                throw new errors_1.ExecutionError('Trade blocked by risk management', {
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
            const tradeParams = await this.slippageProtection.createTradeParams(adjustedRequest.tokenIn, adjustedRequest.tokenOut, adjustedRequest.amountIn, adjustedRequest.slippageTolerance);
            // Optimize gas parameters
            const provider = this.networkManager.getProvider(request.networkId);
            const gasEstimate = await this.gasOptimizer.getOptimizedGasEstimate({
                to: ((_a = aggregatedQuote.bestQuote.route[0]) === null || _a === void 0 ? void 0 : _a.pool) || request.tokenOut,
                data: '0x',
                value: ethers_1.BigNumber.from(0)
            }, request.priority);
            // Execute trade with MEV protection if enabled
            if (request.mevProtection) {
                result = await this.executeWithMEVProtection(adjustedRequest, tradeParams, gasEstimate, context);
            }
            else {
                result = await this.executeDirectTrade(adjustedRequest, tradeParams, gasEstimate, context);
            }
            // Record trade for risk management
            this.riskManager.recordTrade(adjustedRequest, result.amountOut || ethers_1.BigNumber.from(0), result.gasUsed || ethers_1.BigNumber.from(0), result.success);
            // Update metrics
            this.updateMetrics(result, adjustedRequest.amountIn);
            const executionTime = Date.now() - startTime;
            logger_1.default.info('Trade execution completed', {
                success: result.success,
                executionTime,
                gasUsed: (_b = result.gasUsed) === null || _b === void 0 ? void 0 : _b.toString(),
                amountOut: (_c = result.amountOut) === null || _c === void 0 ? void 0 : _c.toString()
            });
            return {
                ...result,
                executionTime,
                route: aggregatedQuote.bestQuote.route
            };
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            result = {
                success: false,
                executionTime,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
            // Record failed trade
            this.riskManager.recordTrade(request, ethers_1.BigNumber.from(0), ethers_1.BigNumber.from(0), false);
            this.updateMetrics(result, request.amountIn);
            logger_1.default.error('Trade execution failed', { error, request, executionTime });
            return result;
        }
    }
    /**
     * Get current system status
     */
    async getSystemStatus() {
        try {
            const networkStatuses = this.networkManager.getAllNetworkStatuses();
            const serviceStatuses = await this.getServiceStatuses();
            // Update uptime
            this.metrics.uptime = Date.now() - this.startTime;
            const isHealthy = this.isSystemHealthy(networkStatuses, serviceStatuses);
            const status = {
                isHealthy,
                networks: networkStatuses,
                services: serviceStatuses,
                metrics: { ...this.metrics },
                lastUpdate: Date.now()
            };
            return status;
        }
        catch (error) {
            logger_1.default.error('Failed to get system status', { error });
            throw new errors_1.SystemError('Failed to get system status', { error });
        }
    }
    /**
     * Get system health summary
     */
    async getHealthSummary() {
        const status = await this.getSystemStatus();
        const healthyNetworks = Array.from(status.networks.values())
            .filter(n => n.isHealthy).length;
        const healthyServices = Array.from(status.services.values())
            .filter(s => s.isHealthy).length;
        let overall = 'healthy';
        if (!status.isHealthy) {
            overall = 'unhealthy';
        }
        else if (healthyNetworks < status.networks.size || healthyServices < status.services.size) {
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
    getRecentAlerts(limit = 10) {
        return this.alerts
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }
    /**
     * Resolve an alert
     */
    resolveAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert && !alert.resolved) {
            alert.resolved = true;
            alert.resolvedAt = Date.now();
            logger_1.default.info(`Alert resolved: ${alertId}`);
            return true;
        }
        return false;
    }
    /**
     * Update system configuration
     */
    updateConfig(newConfig) {
        var _a, _b, _c, _d;
        this.config = { ...this.config, ...newConfig };
        // Update component configurations
        if (newConfig.slippage) {
            (_a = this.slippageProtection) === null || _a === void 0 ? void 0 : _a.updateConfig(newConfig.slippage);
        }
        if (newConfig.mev) {
            (_b = this.mevProtection) === null || _b === void 0 ? void 0 : _b.updateConfig(newConfig.mev);
        }
        if (newConfig.gas) {
            (_c = this.gasOptimizer) === null || _c === void 0 ? void 0 : _c.updateConfig(newConfig.gas);
        }
        if (newConfig.risk) {
            (_d = this.riskManager) === null || _d === void 0 ? void 0 : _d.updateConfig(newConfig.risk);
        }
        logger_1.default.info('System configuration updated');
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        var _a, _b, _c;
        try {
            logger_1.default.info('Shutting down DeFi system...');
            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            // Cleanup components
            (_a = this.networkManager) === null || _a === void 0 ? void 0 : _a.destroy();
            (_b = this.liquidityAggregator) === null || _b === void 0 ? void 0 : _b.destroy();
            (_c = this.riskManager) === null || _c === void 0 ? void 0 : _c.destroy();
            this.isInitialized = false;
            logger_1.default.info('DeFi system shutdown completed');
        }
        catch (error) {
            logger_1.default.error('Error during system shutdown', { error });
            throw new errors_1.SystemError('System shutdown failed', { error });
        }
    }
    // Private helper methods
    async validateTradeRequest(request) {
        const errors = [];
        if (!ethers_1.ethers.utils.isAddress(request.tokenIn)) {
            errors.push('Invalid tokenIn address');
        }
        if (!ethers_1.ethers.utils.isAddress(request.tokenOut)) {
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
            throw new errors_1.ValidationError('Invalid trade request', { errors });
        }
    }
    async getExecutionContext(networkId) {
        const provider = this.networkManager.getProvider(networkId);
        if (!provider) {
            throw new errors_1.SystemError(`Provider not found for network ${networkId}`);
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
    async executeWithMEVProtection(request, tradeParams, gasEstimate, context) {
        // Simplified MEV-protected execution
        // In practice, this would create and submit a bundle
        logger_1.default.info('Executing trade with MEV protection');
        // For now, fall back to direct execution
        return this.executeDirectTrade(request, tradeParams, gasEstimate, context);
    }
    async executeDirectTrade(request, tradeParams, gasEstimate, context) {
        // Simplified direct trade execution
        // In practice, this would interact with DEX contracts
        logger_1.default.info('Executing direct trade');
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
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Execution failed',
                executionTime: 0
            };
        }
    }
    async waitForHealthyNetwork(timeout = 30000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const healthyNetworks = await this.networkManager.getHealthyNetworks();
            if (healthyNetworks.length > 0) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw new errors_1.SystemError('No healthy networks available within timeout');
    }
    async getServiceStatuses() {
        const services = new Map();
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
            isHealthy: riskMetrics.drawdown < 15,
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
    isSystemHealthy(networkStatuses, serviceStatuses) {
        // At least one network must be healthy
        const hasHealthyNetwork = Array.from(networkStatuses.values()).some(n => n.isHealthy);
        // All critical services must be healthy
        const allServicesHealthy = Array.from(serviceStatuses.values()).every(s => s.isHealthy);
        return hasHealthyNetwork && allServicesHealthy;
    }
    updateMetrics(result, amountIn) {
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
    startHealthMonitoring() {
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
            }
            catch (error) {
                logger_1.default.error('Health monitoring failed', { error });
            }
        }, 30000); // Check every 30 seconds
    }
    createAlert(type, severity, message, details) {
        const alert = {
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
        logger_1.default.warn(`Alert created: ${message}`, { alert });
    }
}
exports.DeFiSystem = DeFiSystem;
//# sourceMappingURL=DeFiSystem.js.map