import { ethers, BigNumber } from 'ethers';
import { SlippageProtection } from '../SlippageProtection';
import { PriceOracle, PriceData } from '../types';

// Mock provider
const mockProvider = {
  getBlockNumber: jest.fn().mockResolvedValue(1000),
  getBlock: jest.fn().mockResolvedValue({
    number: 1000,
    timestamp: Math.floor(Date.now() / 1000)
  }),
  getFeeData: jest.fn().mockResolvedValue({
    lastBaseFeePerGas: ethers.utils.parseUnits('20', 'gwei'),
    maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
  })
} as any;

// Mock price oracle
class MockPriceOracle implements PriceOracle {
  async getPrice(token: string): Promise<PriceData> {
    return {
      price: ethers.utils.parseEther('1'),
      timestamp: Date.now(),
      source: 'mock',
      confidence: 95
    };
  }

  async getPrices(tokens: string[]): Promise<Map<string, PriceData>> {
    const prices = new Map();
    for (const token of tokens) {
      prices.set(token, await this.getPrice(token));
    }
    return prices;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

describe('SlippageProtection', () => {
  let slippageProtection: SlippageProtection;
  let mockOracle: MockPriceOracle;

  beforeEach(() => {
    slippageProtection = new SlippageProtection(mockProvider);
    mockOracle = new MockPriceOracle();
    slippageProtection.addPriceOracle('mock', mockOracle);
  });

  test('should initialize with default config', () => {
    const config = slippageProtection.getConfig();
    expect(config.tolerance).toBe(0.5);
    expect(config.maxTolerance).toBe(2.0);
    expect(config.safetyBuffer).toBe(0.1);
    expect(config.deadline).toBe(300);
  });

  test('should calculate minimum output with slippage', async () => {
    const tokenIn = '0x1234567890123456789012345678901234567890';
    const tokenOut = '0x0987654321098765432109876543210987654321';
    const amountIn = ethers.utils.parseEther('100');

    const minOutput = await slippageProtection.calculateMinOutput(
      tokenIn,
      tokenOut,
      amountIn
    );

    expect(minOutput.gt(0)).toBe(true);
    expect(minOutput.lt(amountIn)).toBe(true); // Should be less due to slippage
  });

  test('should create trade parameters', async () => {
    const tokenIn = '0x1234567890123456789012345678901234567890';
    const tokenOut = '0x0987654321098765432109876543210987654321';
    const amountIn = ethers.utils.parseEther('100');

    const tradeParams = await slippageProtection.createTradeParams(
      tokenIn,
      tokenOut,
      amountIn
    );

    expect(tradeParams.tokenIn).toBe(tokenIn);
    expect(tradeParams.tokenOut).toBe(tokenOut);
    expect(tradeParams.amountIn).toEqual(amountIn);
    expect(tradeParams.minAmountOut.gt(0)).toBe(true);
    expect(tradeParams.deadline).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test('should validate trade parameters', async () => {
    const validParams = {
      tokenIn: '0x1234567890123456789012345678901234567890',
      tokenOut: '0x0987654321098765432109876543210987654321',
      amountIn: ethers.utils.parseEther('100'),
      minAmountOut: ethers.utils.parseEther('99'),
      deadline: Math.floor(Date.now() / 1000) + 300,
      slippageTolerance: 1.0
    };

    const result = await slippageProtection.validateTrade(validParams);
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test('should reject invalid addresses', async () => {
    const invalidParams = {
      tokenIn: 'invalid-address',
      tokenOut: '0x0987654321098765432109876543210987654321',
      amountIn: ethers.utils.parseEther('100'),
      minAmountOut: ethers.utils.parseEther('99'),
      deadline: Math.floor(Date.now() / 1000) + 300,
      slippageTolerance: 1.0
    };

    const result = await slippageProtection.validateTrade(invalidParams);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid tokenIn address');
  });

  test('should update configuration', () => {
    const newConfig = {
      tolerance: 1.0,
      maxTolerance: 3.0
    };

    slippageProtection.updateConfig(newConfig);
    const config = slippageProtection.getConfig();
    
    expect(config.tolerance).toBe(1.0);
    expect(config.maxTolerance).toBe(3.0);
  });
});