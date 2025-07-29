"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManager = void 0;
const ethers_1 = require("ethers");
const cache_1 = require("../utils/cache");
const errors_1 = require("../utils/errors");
const logger_1 = __importDefault(require("../utils/logger"));
class RiskManager {
    constructor(config) {
        this.maxHistorySize = 1000;
        this.config = {
            maxPositionSize: ethers_1.ethers.utils.parseEther('10'),
            maxDailyLoss: ethers_1.ethers.utils.parseEther('5'),
            maxDrawdown: 20,
            maxLeverage: 1,
            stopLossThreshold: 10,
            riskFreeRate: 2,
            volatilityWindow: 100,
            correlationThreshold: 0.7,
            ...config
        };
        this.cache = new cache_1.CacheManager(300); // 5 minute cache
        this.positions = new Map();
        this.tradeHistory = [];
        this.dailyPnL = new Map();
        this.validateConfig();
        logger_1.default.info('RiskManager initialized', { config: this.config });
    }
    /**
     * Assess risk for a trade request
     */
    async assessTradeRisk(request, networkConditions) {
        try {
            const factors = [];
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
            const volatilityFactor = await this.assessVolatilityRisk(request.tokenIn, request.tokenOut, networkConditions);
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
                maxAllowedSize = ethers_1.BigNumber.from(0);
            }
            else {
                maxAllowedSize = this.calculateMaxAllowedSize(request.amountIn, factors);
            }
            // Generate recommendations
            const recommendations = this.generateRiskRecommendations(factors, riskLevel);
            const assessment = {
                riskLevel,
                score: averageScore,
                factors,
                recommendations,
                shouldProceed,
                maxAllowedSize
            };
            logger_1.default.info('Risk assessment completed', {
                riskLevel,
                score: averageScore,
                shouldProceed,
                factorsCount: factors.length
            });
            return assessment;
        }
        catch (error) {
            logger_1.default.error('Risk assessment failed', { error, request });
            throw new errors_1.RiskError('Failed to assess trade risk', { error });
        }
    }
    /**
     * Calculate current risk metrics
     */
    async calculateRiskMetrics() {
        try {
            const currentExposure = this.calculateCurrentExposure();
            const dailyPnL = this.calculateDailyPnL();
            const drawdown = await this.calculateCurrentDrawdown();
            const sharpeRatio = this.calculateSharpeRatio();
            const volatility = this.calculateVolatility();
            const var95 = this.calculateValueAtRisk(0.95);
            const maxDrawdown = this.calculateMaxDrawdown();
            const winRate = this.calculateWinRate();
            const metrics = {
                currentExposure,
                dailyPnL,
                drawdown,
                sharpeRatio,
                volatility,
                var95,
                maxDrawdown,
                winRate
            };
            logger_1.default.debug('Risk metrics calculated', {
                currentExposure: currentExposure.toString(),
                dailyPnL: dailyPnL.toString(),
                drawdown,
                sharpeRatio,
                winRate
            });
            return metrics;
        }
        catch (error) {
            logger_1.default.error('Failed to calculate risk metrics', { error });
            throw new errors_1.RiskError('Failed to calculate risk metrics', { error });
        }
    }
    /**
     * Record a completed trade
     */
    recordTrade(request, amountOut, gasUsed, success) {
        try {
            const profit = success
                ? amountOut.sub(request.amountIn)
                : request.amountIn.mul(-1);
            const trade = {
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
            const dateKey = new Date().toISOString().split('T')[0];
            const existingPnL = this.dailyPnL.get(dateKey);
            const currentDailyPnL = existingPnL ? existingPnL : ethers_1.BigNumber.from(0);
            this.dailyPnL.set(dateKey, currentDailyPnL.add(profit));
            // Keep history size manageable
            if (this.tradeHistory.length > this.maxHistorySize) {
                this.tradeHistory = this.tradeHistory.slice(-this.maxHistorySize);
            }
            logger_1.default.debug('Trade recorded', {
                profit: profit.toString(),
                success,
                totalTrades: this.tradeHistory.length
            });
        }
        catch (error) {
            logger_1.default.error('Failed to record trade', { error });
        }
    }
    /**
     * Check if position limits are exceeded
     */
    checkPositionLimits(tokenAddress, additionalAmount) {
        const currentPosition = this.positions.get(tokenAddress);
        const currentAmount = (currentPosition === null || currentPosition === void 0 ? void 0 : currentPosition.amount) || ethers_1.BigNumber.from(0);
        const totalAmount = currentAmount.add(additionalAmount);
        return totalAmount.lte(this.config.maxPositionSize);
    }
    /**
     * Update position data
     */
    updatePosition(tokenAddress, amount, price, networkId) {
        this.positions.set(tokenAddress, {
            tokenAddress,
            amount,
            entryPrice: price,
            timestamp: Date.now(),
            networkId
        });
        logger_1.default.debug('Position updated', {
            tokenAddress,
            amount: amount.toString(),
            price: price.toString()
        });
    }
    /**
     * Get current positions
     */
    getCurrentPositions() {
        return new Map(this.positions);
    }
    /**
     * Get trade history
     */
    getTradeHistory(limit) {
        const history = [...this.tradeHistory].reverse();
        return limit ? history.slice(0, limit) : history;
    }
    // Private risk assessment methods
    assessPositionSizeRisk(amount) {
        const sizeRatio = amount.mul(100).div(this.config.maxPositionSize).toNumber();
        let impact = 'low';
        let value = sizeRatio;
        if (sizeRatio > 80) {
            impact = 'high';
        }
        else if (sizeRatio > 50) {
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
    async assessDailyLossRisk(amount) {
        const today = new Date().toISOString().split('T')[0];
        const existingPnL = this.dailyPnL.get(today);
        const currentDailyPnL = existingPnL ? existingPnL : ethers_1.BigNumber.from(0);
        // Assume worst case scenario for this trade
        const potentialLoss = currentDailyPnL.sub(amount);
        const lossRatio = potentialLoss.abs().mul(100).div(this.config.maxDailyLoss).toNumber();
        let impact = 'low';
        if (lossRatio > 80) {
            impact = 'high';
        }
        else if (lossRatio > 50) {
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
    async assessDrawdownRisk() {
        const currentDrawdown = await this.calculateCurrentDrawdown();
        const drawdownRatio = (currentDrawdown / this.config.maxDrawdown) * 100;
        let impact = 'low';
        if (drawdownRatio > 80) {
            impact = 'high';
        }
        else if (drawdownRatio > 50) {
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
    async assessVolatilityRisk(tokenIn, tokenOut, networkConditions) {
        // Simplified volatility assessment based on network conditions
        let volatilityScore = 0;
        if (networkConditions.congestionLevel === 'high') {
            volatilityScore += 30;
        }
        else if (networkConditions.congestionLevel === 'medium') {
            volatilityScore += 15;
        }
        // Add volatility based on recent trade history
        const recentTrades = this.tradeHistory.slice(-20);
        if (recentTrades.length > 5) {
            const profitVariance = this.calculateProfitVariance(recentTrades);
            volatilityScore += Math.min(50, profitVariance * 10);
        }
        let impact = 'low';
        if (volatilityScore > 60) {
            impact = 'high';
        }
        else if (volatilityScore > 30) {
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
    assessSlippageRisk(slippageTolerance) {
        let impact = 'low';
        if (slippageTolerance > 3) {
            impact = 'high';
        }
        else if (slippageTolerance > 1) {
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
    assessNetworkRisk(networkConditions) {
        let riskScore = 0;
        if (networkConditions.congestionLevel === 'high') {
            riskScore = 80;
        }
        else if (networkConditions.congestionLevel === 'medium') {
            riskScore = 40;
        }
        else {
            riskScore = 10;
        }
        let impact = 'low';
        if (riskScore > 60) {
            impact = 'high';
        }
        else if (riskScore > 30) {
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
    getFactorScore(factor) {
        const impactMultiplier = {
            'low': 1,
            'medium': 2,
            'high': 3
        };
        return Math.min(100, factor.value * impactMultiplier[factor.impact]);
    }
    calculateRiskLevel(averageScore) {
        if (averageScore > 80)
            return 'critical';
        if (averageScore > 60)
            return 'high';
        if (averageScore > 30)
            return 'medium';
        return 'low';
    }
    shouldProceedWithTrade(riskLevel, factors) {
        // Never proceed with critical risk
        if (riskLevel === 'critical')
            return false;
        // Check for any high-impact factors that should block the trade
        const highImpactFactors = factors.filter(f => f.impact === 'high');
        if (highImpactFactors.length > 1)
            return false;
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
    calculateMaxAllowedSize(requestedAmount, factors) {
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
        const minTradeSize = ethers_1.ethers.utils.parseEther('0.001');
        return maxSize.lt(minTradeSize) ? ethers_1.BigNumber.from(0) : maxSize;
    }
    generateRiskRecommendations(factors, riskLevel) {
        const recommendations = [];
        if (riskLevel === 'critical') {
            recommendations.push('CRITICAL: Do not execute this trade');
            recommendations.push('Wait for better market conditions');
        }
        else if (riskLevel === 'high') {
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
    calculateCurrentExposure() {
        return Array.from(this.positions.values())
            .reduce((total, position) => total.add(position.amount), ethers_1.BigNumber.from(0));
    }
    calculateDailyPnL() {
        const today = new Date().toISOString().split('T')[0];
        const existingPnL = this.dailyPnL.get(today);
        return existingPnL ? existingPnL : ethers_1.BigNumber.from(0);
    }
    async calculateCurrentDrawdown() {
        if (this.tradeHistory.length < 10)
            return 0;
        const recentTrades = this.tradeHistory.slice(-50);
        let peak = ethers_1.BigNumber.from(0);
        let maxDrawdown = 0;
        let runningPnL = ethers_1.BigNumber.from(0);
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
    calculateSharpeRatio() {
        if (this.tradeHistory.length < 10)
            return 0;
        const returns = this.tradeHistory.map(trade => trade.profit.mul(100).div(trade.amountIn).toNumber());
        const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        return stdDev > 0 ? (avgReturn - this.config.riskFreeRate) / stdDev : 0;
    }
    calculateVolatility() {
        if (this.tradeHistory.length < 10)
            return 0;
        const returns = this.tradeHistory.slice(-30).map(trade => trade.profit.mul(100).div(trade.amountIn).toNumber());
        const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
        return Math.sqrt(variance);
    }
    calculateValueAtRisk(confidence) {
        if (this.tradeHistory.length < 20)
            return ethers_1.BigNumber.from(0);
        const losses = this.tradeHistory
            .filter(trade => trade.profit.lt(0))
            .map(trade => trade.profit.abs())
            .sort((a, b) => b.sub(a).toNumber());
        if (losses.length === 0)
            return ethers_1.BigNumber.from(0);
        const index = Math.floor((1 - confidence) * losses.length);
        return losses[index] || ethers_1.BigNumber.from(0);
    }
    calculateMaxDrawdown() {
        if (this.tradeHistory.length < 10)
            return 0;
        let peak = ethers_1.BigNumber.from(0);
        let maxDrawdown = 0;
        let runningPnL = ethers_1.BigNumber.from(0);
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
    calculateWinRate() {
        if (this.tradeHistory.length === 0)
            return 0;
        const winningTrades = this.tradeHistory.filter(trade => trade.success && trade.profit.gt(0)).length;
        return (winningTrades / this.tradeHistory.length) * 100;
    }
    calculateProfitVariance(trades) {
        if (trades.length < 2)
            return 0;
        const profits = trades.map(trade => trade.profit.mul(100).div(trade.amountIn).toNumber());
        const avgProfit = profits.reduce((sum, profit) => sum + profit, 0) / profits.length;
        const variance = profits.reduce((sum, profit) => sum + Math.pow(profit - avgProfit, 2), 0) / profits.length;
        return Math.sqrt(variance);
    }
    validateConfig() {
        if (this.config.maxPositionSize.lte(0)) {
            throw new errors_1.ValidationError('Max position size must be greater than 0');
        }
        if (this.config.maxDailyLoss.lte(0)) {
            throw new errors_1.ValidationError('Max daily loss must be greater than 0');
        }
        if (this.config.maxDrawdown <= 0 || this.config.maxDrawdown > 100) {
            throw new errors_1.ValidationError('Max drawdown must be between 0 and 100');
        }
        if (this.config.maxLeverage < 1 || this.config.maxLeverage > 10) {
            throw new errors_1.ValidationError('Max leverage must be between 1 and 10');
        }
    }
    /**
     * Update risk configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.validateConfig();
        logger_1.default.info('Risk configuration updated', { config: this.config });
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Cleanup resources
     */
    destroy() {
        this.positions.clear();
        this.tradeHistory.length = 0;
        this.dailyPnL.clear();
        logger_1.default.info('RiskManager destroyed');
    }
}
exports.RiskManager = RiskManager;
//# sourceMappingURL=RiskManager.js.map