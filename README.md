# Enhanced DeFi Arbitrage System

![DeFi Banner](box-img-sm.png)

*Advanced flash loan arbitrage system with multi-network support, MEV protection, and intelligent risk management.*

## 🚀 Overview

This is a comprehensive DeFi arbitrage system that combines the power of Python/Brownie for smart contract interactions with TypeScript services for advanced features like MEV protection, gas optimization, and intelligent slippage management. The system supports multiple networks and provides a complete solution for profitable and secure arbitrage trading.

### ✨ Key Features

- **🔗 Multi-Network Support**: Ethereum, Polygon, Arbitrum, Optimism
- **🛡️ MEV Protection**: Advanced protection against front-running and sandwich attacks
- **⚡ Gas Optimization**: Intelligent gas price management and optimization
- **📊 Slippage Protection**: Dynamic slippage calculation and protection
- **🎯 Risk Management**: Comprehensive risk assessment and position sizing
- **🔄 Real-time Monitoring**: Live system health monitoring and alerting
- **📈 Advanced Analytics**: Performance tracking and profit optimization
- **🌐 Multi-DEX Integration**: Support for major DEXs and aggregators
- **🔧 Modular Architecture**: Easily extensible and maintainable codebase

### 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Enhanced DeFi System                     │
├─────────────────────────────────────────────────────────────┤
│  Python/Brownie Layer          │  TypeScript Services       │
│  ├─ Arbitrage Bot              │  ├─ DeFi System Core       │
│  ├─ Smart Contracts            │  ├─ Network Manager        │
│  ├─ Dashboard                  │  ├─ Liquidity Aggregator   │
│  └─ Bridge Integration         │  ├─ Risk Manager           │
│                                │  ├─ Gas Optimizer          │
│                                │  ├─ MEV Protection         │
│                                │  └─ Slippage Protection    │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Prerequisites

- **Node.js** >= 16.0.0
- **Python** >= 3.8
- **npm** >= 8.0.0
- **Git**

## 🛠️ Installation and Setup

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/your-username/enhanced-defi-arbitrage.git
cd enhanced-defi-arbitrage

# Install all dependencies (Python + TypeScript)
npm run setup
```

### 2. Environment Configuration

Copy the example environment files and configure them:

```bash
# Copy environment templates
cp .env.example .env
cp services/.env.example services/.env

# Edit the configuration files with your API keys and settings
nano .env
nano services/.env
```

**Required Environment Variables:**

```bash
# Network Configuration
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY

# Wallet Configuration
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
WALLET_ADDRESS=0xYOUR_WALLET_ADDRESS

# API Keys
ONEINCH_API_KEY=your_1inch_api_key
ZEROX_API_KEY=your_0x_api_key
COINGECKO_API_KEY=your_coingecko_api_key
```

### 3. Build TypeScript Services

```bash
# Build the TypeScript services
npm run build
```

### 4. Deploy Smart Contracts (Optional)

```bash
# Deploy to Polygon testnet
npm run deploy:testnet

# Deploy to Polygon mainnet (when ready)
npm run deploy
```

## 🚀 Quick Start

### Start the Complete System

```bash
# Start all services (TypeScript + Python + Dashboard)
npm start

# Or start individual components
npm run start:services    # TypeScript services only
npm run start:python     # Python arbitrage bot only
npm run start:dashboard  # Dashboard only
```

### System Health Check

```bash
# Run comprehensive health check
npm run health-check

# Monitor system status
npm run test:integration
```

### View Dashboard

Once started, access the system dashboard at:
- **Dashboard**: http://localhost:5000
- **API Services**: http://localhost:3001-3007

## 📊 Usage Examples

### Basic Arbitrage Scanning

The system automatically scans for arbitrage opportunities across multiple DEXs:

```python
# The arbitrage bot runs continuously and will:
# 1. Scan for price differences across DEXs
# 2. Calculate potential profits
# 3. Assess risks using TypeScript services
# 4. Execute profitable trades automatically
```

### Manual Trade Execution

```bash
# Execute a specific arbitrage opportunity
brownie run scripts/run_flash_loan_v2.py --network polygon-main
```

### Advanced Configuration

```bash
# Enable MEV protection
export MEV_PROTECTION_ENABLED=true

# Set custom profit thresholds
export MIN_PROFIT_USD=5.0
export MIN_PROFIT_PERCENTAGE=0.5

# Configure gas optimization
export MAX_GAS_PRICE_GWEI=30
```

## 🏗️ System Components

### TypeScript Services

#### 1. DeFi System Core (`port 3001`)
- **Purpose**: Main orchestration service
- **Features**: Trade execution, system coordination, API gateway
- **Endpoints**: `/health`, `/opportunity`, `/execute`, `/status`

#### 2. Network Manager (`port 3002`)
- **Purpose**: Multi-network RPC management
- **Features**: Network switching, RPC failover, connection pooling
- **Endpoints**: `/health`, `/networks`, `/switch`, `/status`

#### 3. Liquidity Aggregator (`port 3003`)
- **Purpose**: DEX liquidity aggregation and routing
- **Features**: Multi-DEX price comparison, optimal routing
- **Endpoints**: `/health`, `/liquidity`, `/route`, `/prices`

#### 4. Risk Manager (`port 3004`)
- **Purpose**: Risk assessment and position management
- **Features**: Risk scoring, position sizing, safety checks
- **Endpoints**: `/health`, `/assess`, `/limits`, `/metrics`

#### 5. Gas Optimizer (`port 3005`)
- **Purpose**: Gas price optimization and management
- **Features**: Dynamic gas pricing, optimization strategies
- **Endpoints**: `/health`, `/optimize`, `/estimate`, `/prices`

#### 6. MEV Protection (`port 3006`)
- **Purpose**: MEV attack prevention and mitigation
- **Features**: Front-running protection, private mempools
- **Endpoints**: `/health`, `/protect`, `/analyze`, `/submit`

#### 7. Slippage Protection (`port 3007`)
- **Purpose**: Slippage calculation and protection
- **Features**: Dynamic slippage limits, impact analysis
- **Endpoints**: `/health`, `/calculate`, `/protect`, `/analyze`

### Python Components

#### Arbitrage Bot (`scripts/polygon_arbitrage_bot.py`)
- **Purpose**: Main arbitrage scanning and execution
- **Features**: Opportunity detection, trade execution, profit tracking
- **Integration**: Uses TypeScript services for enhanced analysis

#### Dashboard (`run_dashboard.py`)
- **Purpose**: Web-based monitoring and control interface
- **Features**: Real-time metrics, trade history, system controls
- **Access**: http://localhost:5000

#### Bridge Integration (`scripts/python_typescript_bridge.py`)
- **Purpose**: Communication layer between Python and TypeScript
- **Features**: Data synchronization, service integration, health monitoring

## 🔧 Configuration Guide

### Environment Variables

The system uses comprehensive environment configuration. Key categories:

#### Network Configuration
```bash
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
OPTIMISM_RPC_URL=https://mainnet.optimism.io
```

#### Trading Parameters
```bash
MIN_PROFIT_USD=1.0
MIN_PROFIT_PERCENTAGE=0.30
MAX_GAS_PRICE_GWEI=50
MAX_SLIPPAGE_PERCENT=2.0
```

#### Service Configuration
```bash
DEFI_SYSTEM_PORT=3001
NETWORK_MANAGER_PORT=3002
LIQUIDITY_AGGREGATOR_PORT=3003
RISK_MANAGER_PORT=3004
```

#### Security Settings
```bash
MEV_PROTECTION_ENABLED=true
PRIVATE_MEMPOOL_ENABLED=false
FLASHBOTS_ENABLED=true
```

### Advanced Features

#### MEV Protection
- **Front-running Protection**: Detects and prevents front-running attacks
- **Private Mempools**: Routes transactions through private mempools
- **Flashbots Integration**: Uses Flashbots for MEV-protected execution

#### Gas Optimization
- **Dynamic Pricing**: Adjusts gas prices based on network conditions
- **Optimization Strategies**: Multiple gas optimization algorithms
- **Cost Analysis**: Comprehensive gas cost analysis and reporting

#### Risk Management
- **Position Sizing**: Intelligent position sizing based on risk assessment
- **Safety Limits**: Multiple safety mechanisms and circuit breakers
- **Real-time Monitoring**: Continuous risk monitoring and alerting

## 🧪 Testing

### Run All Tests
```bash
# Run complete test suite
npm test

# Run TypeScript service tests
npm run test:services

# Run Python/Brownie tests
npm run test:python

# Run integration tests
npm run test:integration
```

### Individual Component Testing
```bash
# Test specific TypeScript service
cd services && npm run test -- --testPathPattern=NetworkManager

# Test Python arbitrage logic
brownie test tests/test_flashloan_v2.py

# Test system integration
node scripts/system-health-check.js
```

## 📈 Monitoring and Analytics

### System Health Monitoring
```bash
# Real-time health check
npm run health-check

# Continuous monitoring
npm run logs
```

### Performance Metrics
- **Profit Tracking**: Real-time profit and loss tracking
- **Success Rates**: Trade execution success rates
- **Gas Efficiency**: Gas usage optimization metrics
- **Network Performance**: RPC response times and reliability

### Alerting
- **Discord Integration**: Real-time alerts via Discord webhooks
- **Telegram Notifications**: Trade notifications via Telegram
- **Email Alerts**: Critical system alerts via email

## 🔒 Security Considerations

### Private Key Management
- Store private keys securely using environment variables
- Never commit private keys to version control
- Consider using hardware wallets for production

### Network Security
- Use reputable RPC providers with proper authentication
- Implement rate limiting and request validation
- Monitor for unusual network activity

### Smart Contract Security
- All contracts are thoroughly tested and audited
- Use established patterns and libraries
- Implement proper access controls and safety checks

## 🚨 Troubleshooting

### Common Issues

#### Services Not Starting
```bash
# Check if ports are available
netstat -tulpn | grep :3001

# Check service logs
npm run logs

# Restart services
npm run clean && npm run build && npm start
```

#### RPC Connection Issues
```bash
# Test RPC connectivity
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  $POLYGON_RPC_URL
```

#### Python Environment Issues
```bash
# Reinstall Python dependencies
pip install -r requirements.txt

# Check Brownie installation
brownie --version
```

### Debug Mode
```bash
# Enable debug logging
export DEBUG_MODE=true
export LOG_LEVEL=debug

# Start with verbose logging
npm start
```

## 📚 API Documentation

### TypeScript Services API

All services expose RESTful APIs with the following common endpoints:

#### Health Check
```bash
GET /health
Response: { "status": "healthy", "timestamp": "...", "uptime": 12345 }
```

#### Service Status
```bash
GET /status
Response: { "service": "...", "version": "1.0.0", "metrics": {...} }
```

### Service-Specific Endpoints

#### DeFi System Core
```bash
POST /opportunity    # Submit arbitrage opportunity
POST /execute        # Execute trade
GET /metrics         # Get system metrics
```

#### Network Manager
```bash
GET /networks        # List available networks
POST /switch         # Switch network
GET /status          # Network status
```

#### Liquidity Aggregator
```bash
GET /liquidity/:pair # Get liquidity for token pair
POST /route          # Get optimal route
GET /prices          # Get current prices
```

## 🤝 Contributing

### Development Setup
```bash
# Fork and clone the repository
git clone https://github.com/your-username/enhanced-defi-arbitrage.git

# Create development branch
git checkout -b feature/your-feature

# Install dependencies
npm run setup

# Start development environment
npm run dev
```

### Code Standards
- **TypeScript**: Follow ESLint configuration
- **Python**: Follow PEP 8 standards
- **Testing**: Maintain >90% test coverage
- **Documentation**: Update docs for all changes

### Pull Request Process
1. Create feature branch from `main`
2. Implement changes with tests
3. Update documentation
4. Submit pull request with detailed description

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Aave Protocol**: For flash loan infrastructure
- **Brownie Framework**: For smart contract development
- **OpenZeppelin**: For secure smart contract libraries
- **DeFi Community**: For continuous innovation and support

## 📞 Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Join community discussions
- **Security**: Report security issues privately

---

## Legacy Documentation (Original Aave Flash Loan Mix)

### Basic Console Use

To perform a simple flash loan in a development environment:

1. Open the Brownie console. This automatically launches Ganache on a forked mainnet.

```bash
$ brownie console
```

2. Create variables for the Aave lending pool.

```python
>>> aave_lending_pool_v2 = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5"
```

3. Deploy the [`FlashloanV2.sol`](contracts/v2/FlashloanV2.sol) contract.

```python
>>> flashloan = FlashloanV2.deploy(aave_lending_pool_v2, {"from": accounts[0]})
Transaction sent: 0xb0f70b42d2cec9c027b664e9f37490ad50fb934e61f0c58cfe5a77d96dfad681
  Gas price: 0.0 gwei   Gas limit: 12000000   Nonce: 8
  FlashloanV2.constructor confirmed - Block: 11577534   Gas used: 957504 (7.98%)
  FlashloanV2 deployed at: 0x420b1099B9eF5baba6D92029594eF45E19A04A4A
```

4. Transfer some Ether in form of WETH to the newly deployed contract. We must do this because we have not implemented any custom flash loan logic, otherwise the loan will fail from an inability to pay the fee.

```python
>>> WETH = Contract("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")
>>> accounts[0].transfer(WETH, "1 ether")
Transaction sent: 0x29ac98c861356bc65e19407d8389e53f8c3d9a05513a8610c9de2ef013aac525
  Gas price: 0.0 gwei   Gas limit: 12000000   Nonce: 10
  Transaction confirmed - Block: 11577536   Gas used: 28431 (0.24%)
>>> WETH.transfer(flashloan, "1 ether", {"from": accounts[0]})
Transaction sent: 0x1bff7e44779eb92d426bc432d22ecb9821e0b66afb66d48404a23e37b34044e6
  Gas price: 0.0 gwei   Gas limit: 12000000   Nonce: 11
  ERC20.transfer confirmed - Block: 11577537   Gas used: 36794 (0.31%)
```

5. Now we are ready to perform our first flash loan!

```python
>>> tx = flashloan.flashloan(WETH, {"from": accounts[0]})
Transaction sent: 0x335530e6d2b7588ee4727b35ae1ed8634a264aca04b325640101ec1c2b89d499
  Gas price: 0.0 gwei   Gas limit: 12000000   Nonce: 12
  FlashloanV2.flashloan confirmed - Block: 11577538   Gas used: 193010 (1.61%)
```

## Implementing Flash Loan Logic

[`contracts/v2/FlashloanV2.sol`](contracts/v2/FlashloanV2.sol) is where you implement your own logic for flash loans. In particular:

* The size of the loan is set in line 89 in `flashloan`.
* Custom flash loan logic is added after line 31 in `executeOperation`.

See the Aave documentation on [Performing a Flash Loan](https://docs.aave.com/developers/guides/flash-loans) for more detailed information.

## Testing

To run the tests:

```
brownie test
```

The example tests provided in this mix start by transfering funds to the [`FlashloanV2.sol`](contracts/v2/FlashloanV2.sol) contract. This ensures that the loan executes succesfully without any custom logic. Once you have built your own logic, you should edit [`tests/test_flashloan_v2.py`](tests/test_flashloan_v2.py) and remove this initial funding logic.

See the [Brownie documentation](https://eth-brownie.readthedocs.io/en/stable/tests-pytest-intro.html) for more detailed information on testing your project.

## Debugging Failed Transactions

Use the `--interactive` flag to open a console immediatly after each failing test:

```
brownie test --interactive
```

Within the console, transaction data is available in the [`history`](https://eth-brownie.readthedocs.io/en/stable/api-network.html#txhistory) container:

```python
>>> history
[<Transaction '0x50f41e2a3c3f44e5d57ae294a8f872f7b97de0cb79b2a4f43cf9f2b6bac61fb4'>,
 <Transaction '0x7af1ce1c30de8b939f481fd6c340226415428f7e6b59e09d7fa5383939091824'>]
```

Examine the [`TransactionReceipt`](https://eth-brownie.readthedocs.io/en/stable/api-network.html#transactionreceipt) for the failed test to determine what went wrong. For example, to view a traceback:

```python
>>> tx = history[-1]
>>> tx.traceback()

Traceback for '0x7af1ce1c30de8b939f481fd6c340226415428f7e6b59e09d7fa5383939091824':


Trace step 13656, program counter 6555:
  File "contracts/protocol/lendingpool/LendingPool.sol", lines 532-536, in LendingPool.flashLoan:    
    IERC20(vars.currentAsset).safeTransferFrom(
      receiverAddress,
      vars.currentATokenAddress,
      vars.currentAmountPlusPremium
    );
Trace step 13750, program counter 11619:
  File "contracts/dependencies/openzeppelin/contracts/SafeERC20.sol", line 36, in SafeERC20.safeTransferFrom:    
    callOptionalReturn(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
Trace step 13937, program counter 16308:
  File "contracts/dependencies/openzeppelin/contracts/SafeERC20.sol", line 55, in SafeERC20.callOptionalReturn:    
    (bool success, bytes memory returndata) = address(token).call(data);
Trace step 13937, program counter 16308:
  File "contracts/dependencies/openzeppelin/contracts/SafeERC20.sol", line 55, in SafeERC20.callOptionalReturn:    
    (bool success, bytes memory returndata) = address(token).call(data);
```

To view a tree map of how the transaction executed:

```python
>>> tx.call_trace()

Call trace for '0x7af1ce1c30de8b939f481fd6c340226415428f7e6b59e09d7fa5383939091824':
Initial call cost  [21432 gas]
FlashloanV2.flashloan  0:14132  [3717 / 174153 gas]
└── ILendingPoolV2.flashLoan  [CALL]  662:14120  [1996 / 170436 gas]
    └── LendingPool.flashLoan  [DELEGATECALL]  759:14107  [218057 / 168440 gas]
        ├── ValidationLogic.validateFlashloan  1428:1461  [106 gas]
        ├── SafeMath.mul  1752:1779  [100 gas]
        ├── SafeMath.div  1783:1831  [161 gas]
        ├── IAtoken  [CALL]  1963:2807  [1914 / 20764 gas]
        │   └── AToken.transferUnderlyingTo  [DELEGATECALL]  2060:2795  [2988 / 18850 gas]
        │       └── ERC20.transfer  [CALL]  2422:2695  [15862 gas]
        ├── FlashloanV2.executeOperation  [CALL]  3252:3904  [3035 / 11055 gas]
        │   └── ERC20.approve  [CALL]  3681:3836  [8020 gas]
        ├── SafeMath.add  4186:4204  [59 gas]
        ├── ReserveLogic.updateState  4270:5480  [10868 / 17605 gas]
        │   ├── InitializableImmutableAdminUpgradeabilityProxy.scaledTotalSupply  [STATICCALL]  4322:4500  [1908 / 3663 gas]
        │   │   └── VariableDebtToken.scaledTotalSupply  [DELEGATECALL]  4419:4488  [1755 gas]
        │   ├── ReserveLogic._updateIndexes  4593:4758  [995 / 1352 gas]
        │   │   ├── MathUtils.calculateLinearInterest  4620:4678  [53 / 183 gas]
        │   │   │   └── SafeMath.sub  4630:4671  [130 gas]
        │   │   ├── WadRayMath.ray  4685:4689  [15 gas]
        │   │   ├── SafeMath.mul  4696:4723  [100 gas]
        │   │   └── SafeMath.add  4732:4750  [59 gas]
        │   ├── WadRayMath.rayMul  4766:4836  [238 gas]
        │   ├── MathUtils.calculateCompoundedInterest  4919:4985  [80 / 210 gas]
        │   │   └── SafeMath.sub  4937:4978  [130 gas]
        │   ├── WadRayMath.rayMul  5018:5088  [238 gas]
        │   ├── WadRayMath.rayMul  5097:5167  [244 gas]
        │   ├── SafeMath.mul  5179:5206  [100 gas]
        │   ├── SafeMath.mul  5210:5237  [100 gas]
        │   ├── SafeMath.mul  5256:5283  [100 gas]
        │   ├── SafeMath.mul  5287:5314  [100 gas]
        │   ├── SafeMath.mul  5318:5345  [100 gas]
        │   ├── SafeMath.mul  5363:5390  [100 gas]
        │   ├── WadRayMath.ray  5394:5398  [15 gas]
        │   ├── SafeMath.add  5402:5420  [59 gas]
        │   ├── SafeMath.add  5424:5442  [59 gas]
        │   └── SafeMath.add  5446:5464  [59 gas]
        ├── WadRayMath.rayMul  5495:5565  [245 gas]
        ├── ReserveLogic._mintToTreasury  5672:7537  [2857 / 14960 gas]
        │   ├── ReserveConfiguration.getReserveFactor  5748:5756  [824 gas]
        │   ├── InitializableImmutableAdminUpgradeabilityProxy.getSupplyData  [STATICCALL]  5820:6706  [1929 / 9318 gas]
        │   │   └── StableDebtToken.getSupplyData  [DELEGATECALL]  5917:6694  [7389 gas]
        │   ├── WadRayMath.rayMul  6813:6883  [245 gas]
        │   ├── WadRayMath.rayMul  6893:6963  [244 gas]
        │   ├── MathUtils.calculateCompoundedInterest  6984:7042  [54 / 191 gas]
        │   │   └── SafeMath.sub  6994:7035  [137 gas]
        │   ├── WadRayMath.rayMul  7075:7145  [244 gas]
        │   ├── WadRayMath.rayMul  7154:7224  [245 gas]
        │   ├── SafeMath.mul  7236:7263  [100 gas]
        │   ├── SafeMath.mul  7267:7294  [100 gas]
        │   ├── SafeMath.mul  7313:7340  [100 gas]
        │   ├── SafeMath.mul  7344:7371  [100 gas]
        │   ├── SafeMath.mul  7375:7402  [100 gas]
        │   ├── SafeMath.mul  7420:7447  [100 gas]
        │   ├── WadRayMath.ray  7451:7455  [15 gas]
        │   ├── SafeMath.add  7459:7477  [59 gas]
        │   ├── SafeMath.add  7481:7499  [59 gas]
        │   └── SafeMath.add  7503:7521  [59 gas]
        ├── WadRayMath.rayMul  7552:7622  [244 gas]
        ├── SafeMath.add  7650:7668  [59 gas]
        ├── SafeMath.sub  7672:7713  [137 gas]
        ├── SafeMath.sub  7724:7765  [137 gas]
        ├── PercentageMath.percentMul  7788:7860  [255 gas]
        ├── IAtoken  [CALL]  7938:8460  [1911 / 19056 gas]
        │   └── AToken.mintToTreasury  [DELEGATECALL]  8035:8448  [17145 gas]
        ├── IAtoken.totalSupply  [STATICCALL]  8530:9167  [1908 / 9796 gas]
        │   └── AToken.totalSupply  [DELEGATECALL]  8627:9155  [3006 / 7888 gas]
        │       └── ILendingPoolV2.getReserveNormalizedIncome  [STATICCALL]  8755:9048  [1911 / 4882 gas]
        │           └── LendingPool.getReserveNormalizedIncome  [DELEGATECALL]  8852:9036  [1237 / 2971 gas]
        │               └── ReserveLogic.getNormalizedIncome  8963:9006  [1734 gas]
        ├── ReserveLogic.cumulateToLiquidityIndex  9246:9616  [2768 / 3626 gas]
        │   ├── WadRayMath.wadToRay  9253:9294  [131 gas]
        │   ├── WadRayMath.wadToRay  9299:9340  [138 gas]
        │   ├── WadRayMath.rayDiv  9344:9423  [270 gas]
        │   ├── WadRayMath.ray  9431:9435  [15 gas]
        │   ├── SafeMath.add  9440:9458  [59 gas]
        │   └── WadRayMath.rayMul  9478:9548  [245 gas]
        ├── ReserveLogic.updateInterestRates  9656:11398  [6759 / 20432 gas]
        │   ├── InitializableImmutableAdminUpgradeabilityProxy.getTotalSupplyAndAvgRate  [STATICCALL]  9767:10627  [1915 / 7639 gas]
        │   │   └── StableDebtToken.getTotalSupplyAndAvgRate  [DELEGATECALL]  9864:10615  [5724 gas]
        │   ├── InitializableImmutableAdminUpgradeabilityProxy.scaledTotalSupply  [STATICCALL]  10769:10947  [1908 / 3663 gas]
        │   │   └── VariableDebtToken.scaledTotalSupply  [DELEGATECALL]  10866:10935  [1755 gas]
        │   ├── WadRayMath.rayMul  11001:11071  [245 gas]
        │   ├── ERC20.balanceOf  [STATICCALL]  11137:11247  [1934 gas]
        │   ├── SafeMath.add  11328:11346  [59 gas]
        │   └── SafeMath.sub  11350:11391  [133 gas]
        ├── ReserveConfiguration.getReserveFactor  11415:11423  [824 gas]
        ├── DefaultReserveInterestRateStrategy.calculateInterestRates  [STATICCALL]  11507:13284  [7330 / 11175 gas]
        │   ├── ILendingPoolAddressesProviderV2.getLendingRateOracle  [STATICCALL]  11838:11954  [1959 gas]
        │   └── LendingRateOracle.getMarketBorrowRate  [STATICCALL]  12031:12129  [1886 gas]
        └── SafeERC20.safeTransferFrom  13657:14107  [291 / -180413 gas]
            └── SafeERC20.callOptionalReturn  13751:14107  [-183382 / -180704 gas]
                ├── Address.isContract  13762:13784  [769 gas]
                └── ERC20.transferFrom  [CALL]  13938:14045  [1909 gas]
```

See the [Brownie documentation](https://eth-brownie.readthedocs.io/en/stable/core-transactions.html) for more detailed information on debugging failed transactions.

## Deployment

When you are finished testing and ready to deploy to the mainnet:

1. [Import a keystore](https://eth-brownie.readthedocs.io/en/stable/account-management.html#importing-from-a-private-key) into Brownie for the account you wish to deploy from. Add this as a `PRIVATE_KEY` environment variable.
2. Run the deployment script on the mainnet using the following command:

```bash
$ brownie run scripts/deployment_v2.py --network mainnet
```

## Known issues

### No access to archive state errors

If you are using Ganache to fork a network, then you may have issues with the blockchain archive state every 30 minutes. This is due to your node provider (i.e. Infura) only allowing free users access to 30 minutes of archive state. To solve this, upgrade to a paid plan, or simply restart your ganache instance and redploy your contracts.

## Troubleshooting

See our [Troubleshooting Errors](https://docs.aave.com/developers/tutorials/troubleshooting-errors) documentation.

# Resources

 - Aave [flash loan documentation](https://docs.aave.com/developers/guides/flash-loans)
 - Aave [Developer Discord channel](https://discord.gg/CJm5Jt3)
 - Brownie [Gitter channel](https://gitter.im/eth-brownie/community)
