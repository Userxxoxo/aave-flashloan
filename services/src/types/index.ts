import { BigNumber } from 'ethers';

export interface SlippageConfig {
  tolerance: number; // Percentage (0.5 = 0.5%)
  maxTolerance: number; // Maximum allowed tolerance
  safetyBuffer: number; // Additional safety buffer
  deadline: number; // Trade deadline in seconds
}

export interface PriceData {
  price: BigNumber;
  timestamp: number;
  source: string;
  confidence: number; // 0-100
}

export interface TradeParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: BigNumber;
  minAmountOut: BigNumber;
  deadline: number;
  slippageTolerance: number;
}

export interface MEVConfig {
  usePrivateMempool: boolean;
  bundleDelay: number; // blocks
  maxPriorityFeePerGas: BigNumber;
  gasLimit: BigNumber;
  enableBackrunProtection: boolean;
  simulationRequired: boolean;
}

export interface BundleTransaction {
  to: string;
  data: string;
  value: BigNumber;
  gasLimit: BigNumber;
  maxFeePerGas: BigNumber;
  maxPriorityFeePerGas: BigNumber;
}

export interface MEVBundle {
  transactions: BundleTransaction[];
  targetBlock: number;
  minTimestamp?: number;
  maxTimestamp?: number;
  revertingTxHashes?: string[];
}

export interface GasConfig {
  baseFeeMultiplier: number; // Multiplier for base fee
  priorityFeeMultiplier: number; // Multiplier for priority fee
  gasLimitBuffer: number; // Percentage buffer (20 = 20%)
  cacheTimeout: number; // Cache timeout in seconds
  maxGasPrice: BigNumber; // Maximum gas price willing to pay
}

export interface GasEstimate {
  gasLimit: BigNumber;
  maxFeePerGas: BigNumber;
  maxPriorityFeePerGas: BigNumber;
  baseFee: BigNumber;
  estimatedCost: BigNumber;
  confidence: number;
  timestamp: number;
}

export interface NetworkConditions {
  baseFee: BigNumber;
  priorityFee: BigNumber;
  gasUsed: number;
  gasLimit: number;
  blockNumber: number;
  timestamp: number;
  congestionLevel: 'low' | 'medium' | 'high';
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface ServiceError extends Error {
  code: string;
  details?: any;
  recoverable: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Oracle interfaces
export interface PriceOracle {
  getPrice(token: string): Promise<PriceData>;
  getPrices(tokens: string[]): Promise<Map<string, PriceData>>;
  isHealthy(): Promise<boolean>;
}

// DEX interfaces
export interface DEXQuote {
  amountOut: BigNumber;
  priceImpact: number;
  gasEstimate: BigNumber;
  route: string[];
  dex: string;
}

export interface ArbitrageOpportunity {
  tokenA: string;
  tokenB: string;
  amountIn: BigNumber;
  expectedProfit: BigNumber;
  profitUSD: number;
  dexA: string;
  dexB: string;
  gasEstimate: BigNumber;
  confidence: number;
  timestamp: number;
}

// Network and System Types
export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorer: string;
  gasMultiplier: number;
  maxGasPrice: BigNumber;
  initialBalance: BigNumber; // $50 USD equivalent
  supportedDEXs: string[];
  supportedTokens: string[];
}

export interface NetworkStatus {
  chainId: number;
  isHealthy: boolean;
  latency: number;
  blockNumber: number;
  gasPrice: BigNumber;
  balance: BigNumber;
  lastUpdate: number;
  errorCount: number;
}

export interface SystemConfig {
  networks: NetworkConfig[];
  slippage: SlippageConfig;
  mev: MEVConfig;
  gas: GasConfig;
  risk: RiskConfig;
  monitoring: MonitoringConfig;
}

export interface SystemStatus {
  isHealthy: boolean;
  networks: Map<number, NetworkStatus>;
  services: Map<string, ServiceStatus>;
  metrics: SystemMetrics;
  lastUpdate: number;
}

export interface ServiceStatus {
  name: string;
  isHealthy: boolean;
  uptime: number;
  errorCount: number;
  lastError?: string;
  metrics: any;
}

export interface SystemMetrics {
  totalTrades: number;
  successfulTrades: number;
  totalVolume: BigNumber;
  totalProfit: BigNumber;
  averageGasUsed: BigNumber;
  averageSlippage: number;
  uptime: number;
}

// Liquidity Aggregator Types
export interface LiquidityProvider {
  name: string;
  apiUrl: string;
  apiKey?: string;
  supportedNetworks: number[];
  feeStructure: {
    percentage: number;
    fixed: BigNumber;
  };
  isActive: boolean;
}

export interface RouteQuote {
  provider: string;
  amountOut: BigNumber;
  priceImpact: number;
  gasEstimate: BigNumber;
  route: RouteStep[];
  confidence: number;
  timestamp: number;
}

export interface RouteStep {
  protocol: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: BigNumber;
  amountOut: BigNumber;
  pool: string;
  fee: number;
}

export interface AggregatedQuote {
  bestQuote: RouteQuote;
  allQuotes: RouteQuote[];
  savings: BigNumber;
  executionTime: number;
  recommendation: string;
}

// Risk Management Types
export interface RiskConfig {
  maxPositionSize: BigNumber;
  maxDailyLoss: BigNumber;
  maxDrawdown: number; // percentage
  maxLeverage: number;
  stopLossThreshold: number;
  riskFreeRate: number;
  volatilityWindow: number; // blocks
  correlationThreshold: number;
}

export interface RiskMetrics {
  currentExposure: BigNumber;
  dailyPnL: BigNumber;
  drawdown: number;
  sharpeRatio: number;
  volatility: number;
  var95: BigNumber; // Value at Risk 95%
  maxDrawdown: number;
  winRate: number;
}

export interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100
  factors: RiskFactor[];
  recommendations: string[];
  shouldProceed: boolean;
  maxAllowedSize: BigNumber;
}

export interface RiskFactor {
  name: string;
  impact: 'low' | 'medium' | 'high';
  description: string;
  value: number;
  threshold: number;
}

// Monitoring Types
export interface MonitoringConfig {
  alertThresholds: {
    errorRate: number;
    latency: number;
    gasPrice: BigNumber;
    slippage: number;
    profitMargin: number;
  };
  notifications: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };
  metricsRetention: number; // days
  healthCheckInterval: number; // seconds
}

export interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: any;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
}

// Trade Execution Types
export interface TradeRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: BigNumber;
  minAmountOut?: BigNumber;
  slippageTolerance?: number;
  deadline?: number;
  recipient?: string;
  networkId: number;
  priority: 'low' | 'medium' | 'high';
  mevProtection: boolean;
}

export interface TradeResult {
  success: boolean;
  transactionHash?: string;
  amountOut?: BigNumber;
  gasUsed?: BigNumber;
  actualSlippage?: number;
  executionTime: number;
  error?: string;
  route?: RouteStep[];
}

export interface ExecutionContext {
  networkId: number;
  blockNumber: number;
  gasPrice: BigNumber;
  nonce: number;
  timestamp: number;
}