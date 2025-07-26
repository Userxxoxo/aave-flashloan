# DeFi Arbitrage Services

Core TypeScript services for the enhanced flash loan arbitrage system, providing slippage protection, MEV protection, and gas optimization.

## Services

### SlippageProtection

Implements comprehensive slippage protection with:
- Configurable slippage tolerance (default 0.5%, max 2%)
- Real-time price validation using price oracles
- Minimum output calculation with safety buffers
- Trade deadline enforcement (5 minutes)
- Automatic slippage checks before trade execution

```typescript
import { SlippageProtection } from './src/SlippageProtection';

const slippageProtection = new SlippageProtection(provider, {
  tolerance: 0.5,
  maxTolerance: 2.0,
  safetyBuffer: 0.1,
  deadline: 300
});

const tradeParams = await slippageProtection.createTradeParams(
  tokenIn,
  tokenOut,
  amountIn,
  customTolerance
);
```

### MEVProtection

Implements MEV protection with:
- Private mempool integration (Flashbots-style)
- Bundle transaction protection with 2-block delay
- Anti-MEV parameters (optimal priority fees, gas limits)
- Backrunning protection mechanisms
- Bundle simulation and safety checks
- MEV exposure analysis

```typescript
import { MEVProtection } from './src/MEVProtection';

const mevProtection = new MEVProtection(provider, flashbotsRelay, {
  usePrivateMempool: true,
  bundleDelay: 2,
  enableBackrunProtection: true,
  simulationRequired: true
});

const bundle = await mevProtection.createProtectedBundle(transactions);
const bundleId = await mevProtection.submitBundle(bundle, signerWallet);
```

### GasOptimizer

Implements gas optimization with:
- EIP-1559 fee optimization (maxFeePerGas, maxPriorityFeePerGas)
- Gas estimation caching (1-minute cache duration)
- Dynamic fee calculation based on network conditions
- Historical fee analysis for optimal pricing
- 20% gas limit buffer for safety
- Base fee and priority fee optimization

```typescript
import { GasOptimizer } from './src/GasOptimizer';

const gasOptimizer = new GasOptimizer(provider, {
  baseFeeMultiplier: 1.125,
  priorityFeeMultiplier: 1.2,
  gasLimitBuffer: 20,
  cacheTimeout: 60
});

const gasEstimate = await gasOptimizer.getOptimizedGasEstimate(transaction, 'medium');
const trends = await gasOptimizer.analyzeGasTrends();
```

## Installation

```bash
cd services
npm install
```

## Build

```bash
npm run build
```

## Development

```bash
npm run dev
```

## Testing

```bash
npm test
```

## Configuration

Each service accepts configuration options to customize behavior:

- **SlippageProtection**: Configure tolerance levels, safety buffers, and deadlines
- **MEVProtection**: Configure private mempool settings, bundle delays, and protection mechanisms
- **GasOptimizer**: Configure fee multipliers, cache timeouts, and gas limits

## Error Handling

All services use comprehensive error handling with specific error types:
- `SlippageError`: Slippage-related errors
- `MEVError`: MEV protection errors
- `GasEstimationError`: Gas estimation errors
- `PriceOracleError`: Price oracle errors
- `ValidationError`: Input validation errors
- `NetworkError`: Network connectivity errors

## Caching

Services implement intelligent caching to reduce API calls and improve performance:
- Price data cached for 30 seconds
- Gas estimates cached for 1 minute
- Network conditions cached for 15-30 seconds
- Fee history cached for 1 minute

## Logging

Comprehensive logging using Winston with different log levels:
- Error logs saved to `logs/error.log`
- All logs saved to `logs/combined.log`
- Console output in development mode

## Integration

These services are designed to integrate with the existing Python-based arbitrage system and can be called from Python scripts or used in a Node.js environment for enhanced DeFi operations.