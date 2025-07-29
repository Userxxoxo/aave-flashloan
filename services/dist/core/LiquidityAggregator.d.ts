import { LiquidityProvider, RouteQuote, AggregatedQuote, TradeRequest } from '../types';
interface ProviderMetrics {
    totalQuotes: number;
    successfulQuotes: number;
    averageResponseTime: number;
    lastError?: string;
    errorCount: number;
    reliability: number;
}
export declare class LiquidityAggregator {
    private providers;
    private providerMetrics;
    private cache;
    private timeout;
    constructor();
    /**
     * Add a liquidity provider
     */
    addProvider(provider: LiquidityProvider): void;
    /**
     * Get aggregated quote from multiple providers
     */
    getAggregatedQuote(request: TradeRequest): Promise<AggregatedQuote>;
    /**
     * Get quote from specific provider
     */
    getQuoteFromProvider(providerName: string, request: TradeRequest): Promise<RouteQuote | null>;
    /**
     * Get quotes from all active providers
     */
    private getAllQuotes;
    /**
     * Select the best quote based on multiple criteria
     */
    private selectBestQuote;
    /**
     * Generate recommendation based on quote analysis
     */
    private generateRecommendation;
    /**
     * Get quote from 1inch API
     */
    private get1inchQuote;
    /**
     * Get quote from 0x API
     */
    private get0xQuote;
    /**
     * Get quote from Paraswap API
     */
    private getParaswapQuote;
    /**
     * Parse 1inch route data
     */
    private parse1inchRoute;
    /**
     * Parse 0x route data
     */
    private parse0xRoute;
    /**
     * Parse Paraswap route data
     */
    private parseParaswapRoute;
    /**
     * Get provider metrics
     */
    getProviderMetrics(): Map<string, ProviderMetrics>;
    /**
     * Get provider reliability ranking
     */
    getProviderRanking(): Array<{
        name: string;
        reliability: number;
        metrics: ProviderMetrics;
    }>;
    /**
     * Validate liquidity provider configuration
     */
    private validateProvider;
    /**
     * Initialize default liquidity providers
     */
    private initializeProviders;
    /**
     * Validate URL format
     */
    private isValidUrl;
    /**
     * Cleanup resources
     */
    destroy(): void;
}
export {};
//# sourceMappingURL=LiquidityAggregator.d.ts.map