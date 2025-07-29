"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiquidityAggregator = void 0;
const ethers_1 = require("ethers");
const axios_1 = __importDefault(require("axios"));
const cache_1 = require("../utils/cache");
const errors_1 = require("../utils/errors");
const logger_1 = __importDefault(require("../utils/logger"));
class LiquidityAggregator {
    constructor() {
        this.timeout = 5000; // 5 second timeout
        this.providers = new Map();
        this.providerMetrics = new Map();
        this.cache = new cache_1.CacheManager(60); // 1 minute cache
        this.initializeProviders();
        logger_1.default.info('LiquidityAggregator initialized');
    }
    /**
     * Add a liquidity provider
     */
    addProvider(provider) {
        try {
            this.validateProvider(provider);
            this.providers.set(provider.name, provider);
            this.providerMetrics.set(provider.name, {
                totalQuotes: 0,
                successfulQuotes: 0,
                averageResponseTime: 0,
                errorCount: 0,
                reliability: 100
            });
            logger_1.default.info(`Liquidity provider added: ${provider.name}`);
        }
        catch (error) {
            logger_1.default.error('Failed to add liquidity provider', { error, provider });
            throw new errors_1.LiquidityError('Failed to add liquidity provider', { error, provider });
        }
    }
    /**
     * Get aggregated quote from multiple providers
     */
    async getAggregatedQuote(request) {
        try {
            const startTime = Date.now();
            // Get quotes from all available providers
            const quotes = await this.getAllQuotes(request);
            if (quotes.length === 0) {
                throw new errors_1.LiquidityError('No quotes available from any provider');
            }
            // Find the best quote
            const bestQuote = this.selectBestQuote(quotes);
            // Calculate savings compared to worst quote
            const worstQuote = quotes.reduce((worst, current) => current.amountOut.lt(worst.amountOut) ? current : worst);
            const savings = bestQuote.amountOut.sub(worstQuote.amountOut);
            const executionTime = Date.now() - startTime;
            const recommendation = this.generateRecommendation(bestQuote, quotes);
            const aggregatedQuote = {
                bestQuote,
                allQuotes: quotes,
                savings,
                executionTime,
                recommendation
            };
            logger_1.default.info('Aggregated quote generated', {
                bestProvider: bestQuote.provider,
                amountOut: bestQuote.amountOut.toString(),
                savings: savings.toString(),
                quotesCount: quotes.length,
                executionTime
            });
            return aggregatedQuote;
        }
        catch (error) {
            logger_1.default.error('Failed to get aggregated quote', { error, request });
            throw new errors_1.LiquidityError('Failed to get aggregated quote', { error });
        }
    }
    /**
     * Get quote from specific provider
     */
    async getQuoteFromProvider(providerName, request) {
        const provider = this.providers.get(providerName);
        if (!provider || !provider.isActive) {
            return null;
        }
        const metrics = this.providerMetrics.get(providerName);
        const startTime = Date.now();
        try {
            metrics.totalQuotes++;
            let quote = null;
            switch (providerName) {
                case '1inch':
                    quote = await this.get1inchQuote(request);
                    break;
                case '0x':
                    quote = await this.get0xQuote(request);
                    break;
                case 'paraswap':
                    quote = await this.getParaswapQuote(request);
                    break;
                default:
                    throw new errors_1.LiquidityError(`Unknown provider: ${providerName}`);
            }
            if (quote) {
                metrics.successfulQuotes++;
                const responseTime = Date.now() - startTime;
                metrics.averageResponseTime = (metrics.averageResponseTime + responseTime) / 2;
                metrics.reliability = Math.min(100, (metrics.successfulQuotes / metrics.totalQuotes) * 100);
                logger_1.default.debug(`Quote received from ${providerName}`, {
                    amountOut: quote.amountOut.toString(),
                    priceImpact: quote.priceImpact,
                    responseTime
                });
            }
            return quote;
        }
        catch (error) {
            metrics.errorCount++;
            metrics.reliability = Math.max(0, metrics.reliability - 5);
            logger_1.default.warn(`Failed to get quote from ${providerName}`, { error });
            return null;
        }
    }
    /**
     * Get quotes from all active providers
     */
    async getAllQuotes(request) {
        const cacheKey = `quotes_${JSON.stringify(request)}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            logger_1.default.debug('Using cached quotes');
            return cached;
        }
        const activeProviders = Array.from(this.providers.entries())
            .filter(([_, provider]) => provider.isActive &&
            provider.supportedNetworks.includes(request.networkId))
            .map(([name]) => name);
        const quotePromises = activeProviders.map(providerName => this.getQuoteFromProvider(providerName, request));
        // Use Promise.all with error handling for Node.js 12 compatibility
        const quotes = [];
        for (const promise of quotePromises) {
            try {
                const quote = await promise;
                if (quote) {
                    quotes.push(quote);
                }
            }
            catch (error) {
                logger_1.default.debug('Provider quote failed', { error: error instanceof Error ? error.message : String(error) });
            }
        }
        // Cache successful quotes
        if (quotes.length > 0) {
            this.cache.set(cacheKey, quotes, 30); // Cache for 30 seconds
        }
        return quotes;
    }
    /**
     * Select the best quote based on multiple criteria
     */
    selectBestQuote(quotes) {
        if (quotes.length === 0) {
            throw new errors_1.LiquidityError('No quotes to select from');
        }
        if (quotes.length === 1) {
            return quotes[0];
        }
        // Score each quote based on multiple factors
        const scoredQuotes = quotes.map(quote => {
            var _a;
            const metrics = this.providerMetrics.get(quote.provider);
            // Amount out score (40% weight)
            const maxAmountOut = quotes.reduce((max, q) => q.amountOut.gt(max) ? q.amountOut : max, ethers_1.BigNumber.from(0));
            const amountScore = quote.amountOut.mul(100).div(maxAmountOut).toNumber();
            // Price impact score (25% weight) - lower is better
            const maxPriceImpact = Math.max(...quotes.map(q => q.priceImpact));
            const priceImpactScore = maxPriceImpact > 0
                ? (1 - (quote.priceImpact / maxPriceImpact)) * 100
                : 100;
            // Gas efficiency score (20% weight) - lower gas is better
            const maxGasEstimate = quotes.reduce((max, q) => q.gasEstimate.gt(max) ? q.gasEstimate : max, ethers_1.BigNumber.from(0));
            const gasScore = maxGasEstimate.gt(0)
                ? ethers_1.BigNumber.from(100).sub(quote.gasEstimate.mul(100).div(maxGasEstimate)).toNumber()
                : 100;
            // Provider reliability score (10% weight)
            const reliabilityScore = (_a = metrics === null || metrics === void 0 ? void 0 : metrics.reliability) !== null && _a !== void 0 ? _a : 50;
            // Confidence score (5% weight)
            const confidenceScore = quote.confidence;
            // Calculate weighted total score
            const totalScore = (amountScore * 0.4 +
                priceImpactScore * 0.25 +
                gasScore * 0.2 +
                reliabilityScore * 0.1 +
                confidenceScore * 0.05);
            return { quote, score: totalScore };
        });
        // Sort by score and return the best
        scoredQuotes.sort((a, b) => b.score - a.score);
        logger_1.default.debug('Quote selection completed', {
            bestProvider: scoredQuotes[0].quote.provider,
            bestScore: scoredQuotes[0].score,
            totalQuotes: quotes.length
        });
        return scoredQuotes[0].quote;
    }
    /**
     * Generate recommendation based on quote analysis
     */
    generateRecommendation(bestQuote, allQuotes) {
        const avgAmountOut = allQuotes.reduce((sum, quote) => sum.add(quote.amountOut), ethers_1.BigNumber.from(0)).div(allQuotes.length);
        const avgPriceImpact = allQuotes.reduce((sum, quote) => sum + quote.priceImpact, 0) / allQuotes.length;
        let recommendation = `Best route via ${bestQuote.provider}. `;
        // Amount comparison
        const amountDiff = bestQuote.amountOut.sub(avgAmountOut);
        const amountDiffPercent = avgAmountOut.gt(0)
            ? amountDiff.mul(100).div(avgAmountOut).toNumber()
            : 0;
        if (amountDiffPercent > 5) {
            recommendation += `Excellent rate - ${amountDiffPercent.toFixed(1)}% above average. `;
        }
        else if (amountDiffPercent > 1) {
            recommendation += `Good rate - ${amountDiffPercent.toFixed(1)}% above average. `;
        }
        // Price impact analysis
        if (bestQuote.priceImpact > 5) {
            recommendation += `High price impact (${bestQuote.priceImpact.toFixed(2)}%) - consider smaller trade size. `;
        }
        else if (bestQuote.priceImpact > 2) {
            recommendation += `Moderate price impact (${bestQuote.priceImpact.toFixed(2)}%). `;
        }
        else {
            recommendation += `Low price impact (${bestQuote.priceImpact.toFixed(2)}%). `;
        }
        // Gas efficiency
        const avgGas = allQuotes.reduce((sum, quote) => sum.add(quote.gasEstimate), ethers_1.BigNumber.from(0)).div(allQuotes.length);
        if (bestQuote.gasEstimate.lt(avgGas.mul(90).div(100))) {
            recommendation += `Gas efficient route. `;
        }
        else if (bestQuote.gasEstimate.gt(avgGas.mul(110).div(100))) {
            recommendation += `Higher gas usage than average. `;
        }
        return recommendation.trim();
    }
    /**
     * Get quote from 1inch API
     */
    async get1inchQuote(request) {
        try {
            const provider = this.providers.get('1inch');
            const url = `${provider.apiUrl}/v5.0/${request.networkId}/quote`;
            const params = {
                fromTokenAddress: request.tokenIn,
                toTokenAddress: request.tokenOut,
                amount: request.amountIn.toString(),
                slippage: request.slippageTolerance || 1
            };
            const response = await axios_1.default.get(url, {
                params,
                timeout: this.timeout,
                headers: provider.apiKey ? { 'Authorization': `Bearer ${provider.apiKey}` } : {}
            });
            const data = response.data;
            return {
                provider: '1inch',
                amountOut: ethers_1.BigNumber.from(data.toTokenAmount),
                priceImpact: parseFloat(data.estimatedGas) / 1000000,
                gasEstimate: ethers_1.BigNumber.from(data.estimatedGas),
                route: this.parse1inchRoute(data.protocols),
                confidence: 85,
                timestamp: Date.now()
            };
        }
        catch (error) {
            logger_1.default.warn('1inch quote failed', { error });
            return null;
        }
    }
    /**
     * Get quote from 0x API
     */
    async get0xQuote(request) {
        try {
            const provider = this.providers.get('0x');
            const url = `${provider.apiUrl}/swap/v1/quote`;
            const params = {
                sellToken: request.tokenIn,
                buyToken: request.tokenOut,
                sellAmount: request.amountIn.toString(),
                slippagePercentage: (request.slippageTolerance || 1) / 100
            };
            const response = await axios_1.default.get(url, {
                params,
                timeout: this.timeout,
                headers: provider.apiKey ? { '0x-api-key': provider.apiKey } : {}
            });
            const data = response.data;
            return {
                provider: '0x',
                amountOut: ethers_1.BigNumber.from(data.buyAmount),
                priceImpact: parseFloat(data.estimatedPriceImpact || '0'),
                gasEstimate: ethers_1.BigNumber.from(data.estimatedGas || '150000'),
                route: this.parse0xRoute(data.sources),
                confidence: 80,
                timestamp: Date.now()
            };
        }
        catch (error) {
            logger_1.default.warn('0x quote failed', { error });
            return null;
        }
    }
    /**
     * Get quote from Paraswap API
     */
    async getParaswapQuote(request) {
        try {
            const provider = this.providers.get('paraswap');
            const url = `${provider.apiUrl}/prices`;
            const params = {
                srcToken: request.tokenIn,
                destToken: request.tokenOut,
                amount: request.amountIn.toString(),
                network: request.networkId,
                side: 'SELL'
            };
            const response = await axios_1.default.get(url, {
                params,
                timeout: this.timeout
            });
            const data = response.data.priceRoute;
            return {
                provider: 'paraswap',
                amountOut: ethers_1.BigNumber.from(data.destAmount),
                priceImpact: parseFloat(data.side === 'SELL' ? data.destUSD : data.srcUSD) / 100,
                gasEstimate: ethers_1.BigNumber.from(data.gasCost || '200000'),
                route: this.parseParaswapRoute(data.bestRoute),
                confidence: 75,
                timestamp: Date.now()
            };
        }
        catch (error) {
            logger_1.default.warn('Paraswap quote failed', { error });
            return null;
        }
    }
    /**
     * Parse 1inch route data
     */
    parse1inchRoute(protocols) {
        const steps = [];
        for (const protocol of protocols || []) {
            for (const route of protocol) {
                steps.push({
                    protocol: route.name,
                    tokenIn: route.fromTokenAddress,
                    tokenOut: route.toTokenAddress,
                    amountIn: ethers_1.BigNumber.from(route.fromAmount || '0'),
                    amountOut: ethers_1.BigNumber.from(route.toAmount || '0'),
                    pool: route.pool || '',
                    fee: route.fee || 0
                });
            }
        }
        return steps;
    }
    /**
     * Parse 0x route data
     */
    parse0xRoute(sources) {
        const steps = [];
        for (const source of sources || []) {
            steps.push({
                protocol: source.name,
                tokenIn: '',
                tokenOut: '',
                amountIn: ethers_1.BigNumber.from('0'),
                amountOut: ethers_1.BigNumber.from('0'),
                pool: '',
                fee: 0
            });
        }
        return steps;
    }
    /**
     * Parse Paraswap route data
     */
    parseParaswapRoute(bestRoute) {
        var _a, _b;
        const steps = [];
        for (const route of bestRoute || []) {
            for (const swap of route.swaps || []) {
                steps.push({
                    protocol: ((_a = swap.swapExchanges[0]) === null || _a === void 0 ? void 0 : _a.exchange) || 'unknown',
                    tokenIn: route.srcToken,
                    tokenOut: route.destToken,
                    amountIn: ethers_1.BigNumber.from(route.srcAmount || '0'),
                    amountOut: ethers_1.BigNumber.from(route.destAmount || '0'),
                    pool: ((_b = swap.swapExchanges[0]) === null || _b === void 0 ? void 0 : _b.poolAddress) || '',
                    fee: 0
                });
            }
        }
        return steps;
    }
    /**
     * Get provider metrics
     */
    getProviderMetrics() {
        return new Map(this.providerMetrics);
    }
    /**
     * Get provider reliability ranking
     */
    getProviderRanking() {
        return Array.from(this.providerMetrics.entries())
            .map(([name, metrics]) => ({ name, reliability: metrics.reliability, metrics }))
            .sort((a, b) => b.reliability - a.reliability);
    }
    /**
     * Validate liquidity provider configuration
     */
    validateProvider(provider) {
        if (!provider.name || provider.name.trim().length === 0) {
            throw new errors_1.ValidationError('Provider name is required');
        }
        if (!provider.apiUrl || !this.isValidUrl(provider.apiUrl)) {
            throw new errors_1.ValidationError('Valid API URL is required');
        }
        if (!Array.isArray(provider.supportedNetworks) || provider.supportedNetworks.length === 0) {
            throw new errors_1.ValidationError('Supported networks must be a non-empty array');
        }
        if (typeof provider.feeStructure.percentage !== 'number' || provider.feeStructure.percentage < 0) {
            throw new errors_1.ValidationError('Fee percentage must be a non-negative number');
        }
    }
    /**
     * Initialize default liquidity providers
     */
    initializeProviders() {
        const defaultProviders = [
            {
                name: '1inch',
                apiUrl: 'https://api.1inch.io',
                supportedNetworks: [1, 137, 42161, 10],
                feeStructure: {
                    percentage: 0.3,
                    fixed: ethers_1.BigNumber.from(0)
                },
                isActive: true
            },
            {
                name: '0x',
                apiUrl: 'https://api.0x.org',
                supportedNetworks: [1, 137, 42161, 10],
                feeStructure: {
                    percentage: 0.15,
                    fixed: ethers_1.BigNumber.from(0)
                },
                isActive: true
            },
            {
                name: 'paraswap',
                apiUrl: 'https://apiv5.paraswap.io',
                supportedNetworks: [1, 137, 42161, 10],
                feeStructure: {
                    percentage: 0.1,
                    fixed: ethers_1.BigNumber.from(0)
                },
                isActive: true
            }
        ];
        for (const provider of defaultProviders) {
            this.addProvider(provider);
        }
    }
    /**
     * Validate URL format
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    /**
     * Cleanup resources
     */
    destroy() {
        this.providers.clear();
        this.providerMetrics.clear();
        logger_1.default.info('LiquidityAggregator destroyed');
    }
}
exports.LiquidityAggregator = LiquidityAggregator;
//# sourceMappingURL=LiquidityAggregator.js.map