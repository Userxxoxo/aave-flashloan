"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlippageProtection = void 0;
const ethers_1 = require("ethers");
const cache_1 = require("./utils/cache");
const errors_1 = require("./utils/errors");
const logger_1 = __importDefault(require("./utils/logger"));
class SlippageProtection {
    constructor(provider, config) {
        this.provider = provider;
        this.config = {
            tolerance: 0.5,
            maxTolerance: 2.0,
            safetyBuffer: 0.1,
            deadline: 300,
            ...config
        };
        this.cache = new cache_1.CacheManager(60); // 1 minute cache
        this.priceOracles = new Map();
        this.validateConfig();
        logger_1.default.info('SlippageProtection initialized', { config: this.config });
    }
    /**
     * Add a price oracle for token price validation
     */
    addPriceOracle(name, oracle) {
        this.priceOracles.set(name, oracle);
        logger_1.default.info(`Price oracle added: ${name}`);
    }
    /**
     * Calculate minimum output amount with slippage protection
     */
    async calculateMinOutput(tokenIn, tokenOut, amountIn, customTolerance) {
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
            logger_1.default.debug('Minimum output calculated', {
                tokenIn,
                tokenOut,
                amountIn: amountIn.toString(),
                expectedOutput: expectedOutput.toString(),
                minOutput: minOutput.toString(),
                tolerance,
                safetyBuffer: this.config.safetyBuffer
            });
            return minOutput;
        }
        catch (error) {
            logger_1.default.error('Failed to calculate minimum output', { error, tokenIn, tokenOut });
            throw new errors_1.SlippageError('Failed to calculate minimum output', { tokenIn, tokenOut, error });
        }
    }
    /**
     * Validate trade parameters before execution
     */
    async validateTrade(params) {
        const errors = [];
        const warnings = [];
        try {
            // Validate addresses
            if (!ethers_1.ethers.utils.isAddress(params.tokenIn)) {
                errors.push('Invalid tokenIn address');
            }
            if (!ethers_1.ethers.utils.isAddress(params.tokenOut)) {
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
            const priceImpact = await this.calculatePriceImpact(params.tokenIn, params.tokenOut, params.amountIn, params.minAmountOut);
            if (priceImpact > 5.0) {
                errors.push('Price impact too high (>5%)');
            }
            else if (priceImpact > 2.0) {
                warnings.push('High price impact detected');
            }
            logger_1.default.debug('Trade validation completed', {
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
        }
        catch (error) {
            logger_1.default.error('Trade validation failed', { error, params });
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
    async shouldExecuteTrade(params) {
        try {
            // Validate trade parameters
            const validation = await this.validateTrade(params);
            if (!validation.isValid) {
                logger_1.default.warn('Trade validation failed', { errors: validation.errors });
                return false;
            }
            // Check if deadline is approaching (within 30 seconds)
            const currentTime = Math.floor(Date.now() / 1000);
            if (params.deadline - currentTime < 30) {
                logger_1.default.warn('Trade deadline approaching', {
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
                logger_1.default.warn('Current price would not meet minimum output', {
                    expectedOutput: expectedOutput.toString(),
                    minAmountOut: params.minAmountOut.toString()
                });
                return false;
            }
            return true;
        }
        catch (error) {
            logger_1.default.error('Failed to check trade execution conditions', { error, params });
            return false;
        }
    }
    /**
     * Create trade parameters with slippage protection
     */
    async createTradeParams(tokenIn, tokenOut, amountIn, customTolerance) {
        try {
            const minAmountOut = await this.calculateMinOutput(tokenIn, tokenOut, amountIn, customTolerance);
            const deadline = Math.floor(Date.now() / 1000) + this.config.deadline;
            const tolerance = customTolerance || this.config.tolerance;
            const params = {
                tokenIn,
                tokenOut,
                amountIn,
                minAmountOut,
                deadline,
                slippageTolerance: tolerance
            };
            logger_1.default.info('Trade parameters created', params);
            return params;
        }
        catch (error) {
            logger_1.default.error('Failed to create trade parameters', { error, tokenIn, tokenOut });
            throw new errors_1.SlippageError('Failed to create trade parameters', { tokenIn, tokenOut, error });
        }
    }
    /**
     * Update slippage configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.validateConfig();
        logger_1.default.info('Slippage configuration updated', { config: this.config });
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    // Private helper methods
    validateConfig() {
        if (this.config.tolerance < 0 || this.config.tolerance > this.config.maxTolerance) {
            throw new errors_1.ValidationError('Invalid tolerance configuration');
        }
        if (this.config.maxTolerance > 10) {
            throw new errors_1.ValidationError('Maximum tolerance cannot exceed 10%');
        }
        if (this.config.safetyBuffer < 0 || this.config.safetyBuffer > 1) {
            throw new errors_1.ValidationError('Safety buffer must be between 0% and 1%');
        }
        if (this.config.deadline < 60 || this.config.deadline > 3600) {
            throw new errors_1.ValidationError('Deadline must be between 1 minute and 1 hour');
        }
    }
    validateTolerance(tolerance) {
        if (tolerance < 0 || tolerance > this.config.maxTolerance) {
            throw new errors_1.ValidationError(`Tolerance must be between 0% and ${this.config.maxTolerance}%`);
        }
    }
    async getTokenPrice(tokenIn, tokenOut) {
        const cacheKey = `price_${tokenIn}_${tokenOut}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        // Try each oracle until we get a valid price
        for (const [name, oracle] of this.priceOracles) {
            try {
                const priceData = await oracle.getPrice(`${tokenIn}/${tokenOut}`);
                this.cache.set(cacheKey, priceData, 30); // Cache for 30 seconds
                return priceData;
            }
            catch (error) {
                logger_1.default.warn(`Oracle ${name} failed to provide price`, { error, tokenIn, tokenOut });
            }
        }
        throw new errors_1.PriceOracleError('No oracle could provide price data', { tokenIn, tokenOut });
    }
    calculateExpectedOutput(amountIn, price) {
        // Simple calculation: amountIn * price
        // In practice, this would use more sophisticated pricing models
        return amountIn.mul(price).div(ethers_1.ethers.utils.parseEther('1'));
    }
    async calculatePriceImpact(tokenIn, tokenOut, amountIn, minAmountOut) {
        try {
            const priceData = await this.getTokenPrice(tokenIn, tokenOut);
            const expectedOutput = this.calculateExpectedOutput(amountIn, priceData.price);
            if (expectedOutput.eq(0))
                return 0;
            const impact = expectedOutput.sub(minAmountOut).mul(10000).div(expectedOutput);
            return impact.toNumber() / 100; // Convert to percentage
        }
        catch (error) {
            logger_1.default.warn('Failed to calculate price impact', { error });
            return 0;
        }
    }
}
exports.SlippageProtection = SlippageProtection;
//# sourceMappingURL=SlippageProtection.js.map