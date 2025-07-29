import { ethers, BigNumber } from 'ethers';
import { SlippageConfig, TradeParams, ValidationResult, PriceOracle } from './types';
export declare class SlippageProtection {
    private config;
    private cache;
    private priceOracles;
    private provider;
    constructor(provider: ethers.providers.Provider, config?: Partial<SlippageConfig>);
    /**
     * Add a price oracle for token price validation
     */
    addPriceOracle(name: string, oracle: PriceOracle): void;
    /**
     * Calculate minimum output amount with slippage protection
     */
    calculateMinOutput(tokenIn: string, tokenOut: string, amountIn: BigNumber, customTolerance?: number): Promise<BigNumber>;
    /**
     * Validate trade parameters before execution
     */
    validateTrade(params: TradeParams): Promise<ValidationResult>;
    /**
     * Check if trade execution should proceed based on current conditions
     */
    shouldExecuteTrade(params: TradeParams): Promise<boolean>;
    /**
     * Create trade parameters with slippage protection
     */
    createTradeParams(tokenIn: string, tokenOut: string, amountIn: BigNumber, customTolerance?: number): Promise<TradeParams>;
    /**
     * Update slippage configuration
     */
    updateConfig(newConfig: Partial<SlippageConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): SlippageConfig;
    private validateConfig;
    private validateTolerance;
    private getTokenPrice;
    private calculateExpectedOutput;
    private calculatePriceImpact;
}
//# sourceMappingURL=SlippageProtection.d.ts.map