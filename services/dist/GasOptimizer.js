"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GasOptimizer = void 0;
const ethers_1 = require("ethers");
const cache_1 = require("./utils/cache");
const errors_1 = require("./utils/errors");
const logger_1 = __importDefault(require("./utils/logger"));
class GasOptimizer {
    constructor(provider, config) {
        this.maxHistorySize = 100;
        this.provider = provider;
        this.config = {
            baseFeeMultiplier: 1.125,
            priorityFeeMultiplier: 1.2,
            gasLimitBuffer: 20,
            cacheTimeout: 60,
            maxGasPrice: ethers_1.ethers.utils.parseUnits('100', 'gwei'),
            ...config
        };
        this.cache = new cache_1.CacheManager(this.config.cacheTimeout);
        this.feeHistory = [];
        this.validateConfig();
        this.startFeeHistoryCollection();
        logger_1.default.info('GasOptimizer initialized', { config: this.config });
    }
    /**
     * Get optimized gas estimate for a transaction
     */
    async getOptimizedGasEstimate(transaction, priority = 'medium') {
        try {
            const cacheKey = `gas_estimate_${JSON.stringify(transaction)}_${priority}`;
            const cached = this.cache.get(cacheKey);
            if (cached && this.isEstimateValid(cached)) {
                logger_1.default.debug('Using cached gas estimate', { cacheKey });
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
            const estimate = {
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
            logger_1.default.debug('Gas estimate calculated', {
                gasLimit: gasLimit.toString(),
                maxFeePerGas: ethers_1.ethers.utils.formatUnits(feeData.maxFeePerGas, 'gwei'),
                maxPriorityFeePerGas: ethers_1.ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, 'gwei'),
                estimatedCost: ethers_1.ethers.utils.formatEther(estimatedCost),
                confidence,
                priority
            });
            return estimate;
        }
        catch (error) {
            logger_1.default.error('Failed to get optimized gas estimate', { error, transaction });
            throw new errors_1.GasEstimationError('Failed to get optimized gas estimate', { error });
        }
    }
    /**
     * Get EIP-1559 optimized fee data
     */
    async getOptimizedFees(priority = 'medium') {
        try {
            const cacheKey = `optimized_fees_${priority}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
            // Get current network conditions
            const networkConditions = await this.getNetworkConditions();
            const historicalData = this.getRecentFeeHistory(20); // Last 20 blocks
            // Calculate base fee prediction for next block
            const predictedBaseFee = this.predictNextBaseFee(networkConditions);
            // Calculate optimal priority fee based on priority level and historical data
            const optimalPriorityFee = this.calculateOptimalPriorityFee(historicalData, priority, networkConditions);
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
                logger_1.default.warn('Calculated fees exceed maximum, capping', {
                    calculated: ethers_1.ethers.utils.formatUnits(fees.maxFeePerGas, 'gwei'),
                    maximum: ethers_1.ethers.utils.formatUnits(this.config.maxGasPrice, 'gwei')
                });
                fees.maxFeePerGas = this.config.maxGasPrice;
                fees.maxPriorityFeePerGas = this.config.maxGasPrice.sub(predictedBaseFee);
            }
            this.cache.set(cacheKey, fees, 30); // Cache for 30 seconds
            return fees;
        }
        catch (error) {
            logger_1.default.error('Failed to get optimized fees', { error, priority });
            throw new errors_1.GasEstimationError('Failed to get optimized fees', { error });
        }
    }
    /**
     * Estimate gas limit with buffer
     */
    async estimateGasLimit(transaction) {
        try {
            const cacheKey = `gas_limit_${JSON.stringify(transaction)}`;
            const cached = this.cache.get(cacheKey);
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
            logger_1.default.debug('Gas limit estimated', {
                baseEstimate: baseEstimate.toString(),
                withBuffer: gasLimitWithBuffer.toString(),
                buffer: `${this.config.gasLimitBuffer}%`
            });
            return gasLimitWithBuffer;
        }
        catch (error) {
            logger_1.default.error('Failed to estimate gas limit', { error, transaction });
            throw new errors_1.GasEstimationError('Failed to estimate gas limit', { error });
        }
    }
    /**
     * Get current network conditions for gas optimization
     */
    async getNetworkConditions() {
        const cacheKey = 'network_conditions';
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const [block, feeData] = await Promise.all([
                this.provider.getBlock('latest'),
                this.provider.getFeeData()
            ]);
            const gasUsedPercentage = (block.gasUsed.toNumber() / block.gasLimit.toNumber()) * 100;
            let congestionLevel = 'low';
            if (gasUsedPercentage > 80) {
                congestionLevel = 'high';
            }
            else if (gasUsedPercentage > 50) {
                congestionLevel = 'medium';
            }
            const conditions = {
                baseFee: feeData.lastBaseFeePerGas || ethers_1.BigNumber.from(0),
                priorityFee: feeData.maxPriorityFeePerGas || ethers_1.BigNumber.from(0),
                gasUsed: block.gasUsed.toNumber(),
                gasLimit: block.gasLimit.toNumber(),
                blockNumber: block.number,
                timestamp: block.timestamp,
                congestionLevel
            };
            this.cache.set(cacheKey, conditions, 15); // Cache for 15 seconds
            return conditions;
        }
        catch (error) {
            throw new errors_1.NetworkError('Failed to get network conditions', { error });
        }
    }
    /**
     * Get fee history for analysis
     */
    async getFeeHistory(blockCount = 20) {
        try {
            const cacheKey = `fee_history_${blockCount}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
            // Get fee history from provider (if supported)
            const latestBlock = await this.provider.getBlockNumber();
            const feeHistory = await this.provider.send('eth_feeHistory', [
                `0x${blockCount.toString(16)}`,
                `0x${latestBlock.toString(16)}`,
                [25, 50, 75] // 25th, 50th, 75th percentiles
            ]);
            this.cache.set(cacheKey, feeHistory, 60); // Cache for 1 minute
            return feeHistory;
        }
        catch (error) {
            logger_1.default.warn('Fee history not available, using fallback', { error });
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
    async analyzeGasTrends() {
        try {
            const recentHistory = this.getRecentFeeHistory(50);
            if (recentHistory.length < 10) {
                return {
                    trend: 'stable',
                    volatility: 'low',
                    recommendation: 'Use standard gas settings',
                    averageBaseFee: ethers_1.BigNumber.from(0),
                    averagePriorityFee: ethers_1.BigNumber.from(0)
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
            let trend = 'stable';
            const changePercent = recentAvgBase.sub(olderAvgBase).mul(100).div(olderAvgBase).toNumber();
            if (changePercent > 10) {
                trend = 'increasing';
            }
            else if (changePercent < -10) {
                trend = 'decreasing';
            }
            // Calculate volatility
            const baseFeeVariance = this.calculateVariance(recentHistory.map(h => h.baseFee));
            let volatility = 'low';
            if (baseFeeVariance > avgBaseFee.div(4)) {
                volatility = 'high';
            }
            else if (baseFeeVariance > avgBaseFee.div(10)) {
                volatility = 'medium';
            }
            // Generate recommendation
            let recommendation = 'Use standard gas settings';
            if (trend === 'increasing' && volatility === 'high') {
                recommendation = 'Consider higher gas fees or delay transaction';
            }
            else if (trend === 'decreasing') {
                recommendation = 'Good time for transactions, fees are declining';
            }
            else if (volatility === 'high') {
                recommendation = 'Wait for more stable conditions or use higher fees';
            }
            logger_1.default.debug('Gas trend analysis completed', {
                trend,
                volatility,
                changePercent,
                avgBaseFee: ethers_1.ethers.utils.formatUnits(avgBaseFee, 'gwei'),
                avgPriorityFee: ethers_1.ethers.utils.formatUnits(avgPriorityFee, 'gwei')
            });
            return {
                trend,
                volatility,
                recommendation,
                averageBaseFee: avgBaseFee,
                averagePriorityFee: avgPriorityFee
            };
        }
        catch (error) {
            logger_1.default.error('Failed to analyze gas trends', { error });
            throw new errors_1.GasEstimationError('Failed to analyze gas trends', { error });
        }
    }
    /**
     * Update gas optimization configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.validateConfig();
        logger_1.default.info('Gas optimizer configuration updated', { config: this.config });
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Get fee history statistics
     */
    getFeeHistoryStats() {
        var _a, _b;
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
            oldestEntry: ((_a = this.feeHistory[0]) === null || _a === void 0 ? void 0 : _a.timestamp) || 0,
            newestEntry: ((_b = this.feeHistory[this.feeHistory.length - 1]) === null || _b === void 0 ? void 0 : _b.timestamp) || 0,
            averageBaseFee: ethers_1.ethers.utils.formatUnits(avgBaseFee, 'gwei'),
            averagePriorityFee: ethers_1.ethers.utils.formatUnits(avgPriorityFee, 'gwei')
        };
    }
    // Private helper methods
    validateConfig() {
        if (this.config.baseFeeMultiplier < 1 || this.config.baseFeeMultiplier > 3) {
            throw new errors_1.ValidationError('Base fee multiplier must be between 1 and 3');
        }
        if (this.config.priorityFeeMultiplier < 1 || this.config.priorityFeeMultiplier > 5) {
            throw new errors_1.ValidationError('Priority fee multiplier must be between 1 and 5');
        }
        if (this.config.gasLimitBuffer < 0 || this.config.gasLimitBuffer > 100) {
            throw new errors_1.ValidationError('Gas limit buffer must be between 0% and 100%');
        }
        if (this.config.cacheTimeout < 10 || this.config.cacheTimeout > 300) {
            throw new errors_1.ValidationError('Cache timeout must be between 10 and 300 seconds');
        }
    }
    isEstimateValid(estimate) {
        const age = Date.now() - estimate.timestamp;
        return age < this.config.cacheTimeout * 1000;
    }
    validateGasEstimate(estimate) {
        if (estimate.maxFeePerGas.gt(this.config.maxGasPrice)) {
            throw new errors_1.GasEstimationError('Gas estimate exceeds maximum allowed price');
        }
        if (estimate.gasLimit.lt(21000)) {
            throw new errors_1.GasEstimationError('Gas limit too low');
        }
    }
    async calculateConfidence() {
        try {
            const networkConditions = await this.getNetworkConditions();
            const historySize = this.feeHistory.length;
            let confidence = 50; // Base confidence
            // Increase confidence with more historical data
            if (historySize > 50)
                confidence += 20;
            else if (historySize > 20)
                confidence += 10;
            // Adjust based on network conditions
            if (networkConditions.congestionLevel === 'low') {
                confidence += 20;
            }
            else if (networkConditions.congestionLevel === 'high') {
                confidence -= 20;
            }
            return Math.max(10, Math.min(95, confidence));
        }
        catch (error) {
            return 50; // Default confidence
        }
    }
    predictNextBaseFee(conditions) {
        // EIP-1559 base fee calculation
        const currentBaseFee = conditions.baseFee;
        const gasUsedRatio = conditions.gasUsed / conditions.gasLimit;
        if (gasUsedRatio > 0.5) {
            // Increase base fee
            const increase = currentBaseFee.mul(Math.floor((gasUsedRatio - 0.5) * 2 * 125)).div(1000);
            return currentBaseFee.add(increase);
        }
        else {
            // Decrease base fee
            const decrease = currentBaseFee.mul(Math.floor((0.5 - gasUsedRatio) * 2 * 125)).div(1000);
            return currentBaseFee.sub(decrease);
        }
    }
    calculateOptimalPriorityFee(history, priority, conditions) {
        if (history.length === 0) {
            // Fallback to current network priority fee
            return conditions.priorityFee.mul(Math.floor(this.config.priorityFeeMultiplier * 100)).div(100);
        }
        // Calculate percentiles from historical data
        const priorityFees = history.map(h => h.priorityFee).sort((a, b) => a.sub(b).toNumber());
        let targetPercentile;
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
        }
        else if (conditions.congestionLevel === 'low') {
            multiplier *= 0.8;
        }
        return basePriorityFee.mul(Math.floor(multiplier * 100)).div(100);
    }
    getRecentFeeHistory(count) {
        return this.feeHistory.slice(-count);
    }
    calculateAverage(values) {
        if (values.length === 0)
            return ethers_1.BigNumber.from(0);
        const sum = values.reduce((acc, val) => acc.add(val), ethers_1.BigNumber.from(0));
        return sum.div(values.length);
    }
    calculateVariance(values) {
        if (values.length < 2)
            return ethers_1.BigNumber.from(0);
        const mean = this.calculateAverage(values);
        const squaredDiffs = values.map(val => {
            const diff = val.sub(mean);
            return diff.mul(diff);
        });
        return this.calculateAverage(squaredDiffs);
    }
    startFeeHistoryCollection() {
        // Collect fee history every 15 seconds
        setInterval(async () => {
            try {
                const conditions = await this.getNetworkConditions();
                const historyEntry = {
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
            }
            catch (error) {
                logger_1.default.warn('Failed to collect fee history', { error });
            }
        }, 15000);
    }
}
exports.GasOptimizer = GasOptimizer;
//# sourceMappingURL=GasOptimizer.js.map