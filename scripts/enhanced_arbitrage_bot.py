#!/usr/bin/env python3

"""
Enhanced Arbitrage Bot with TypeScript Services Integration

This enhanced version of the arbitrage bot integrates with the TypeScript services
to provide advanced features like MEV protection, gas optimization, and intelligent
risk management.
"""

import os
import sys
import time
import json
import requests
import threading
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
import logging
from datetime import datetime

# Add the scripts directory to the path to import the bridge
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from python_typescript_bridge import (
        PythonTypeScriptBridge, 
        ArbitrageOpportunity, 
        TradeExecution,
        ArbitrageBotIntegration,
        create_bridge_from_env
    )
except ImportError:
    print("Warning: Bridge integration not available. Running in basic mode.")
    PythonTypeScriptBridge = None

# Import existing arbitrage bot components
try:
    from brownie import FlashloanV3Polygon, accounts, config, network, Contract
    from web3 import Web3
    BROWNIE_AVAILABLE = True
except ImportError:
    print("Warning: Brownie not available. Some features will be disabled.")
    BROWNIE_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/enhanced_arbitrage_bot.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class EnhancedConfig:
    """Enhanced configuration for the arbitrage bot"""
    # Basic settings
    contract_address: str
    private_key: str
    min_profit_usd: float = 1.0
    min_profit_percentage: float = 0.30
    max_gas_price_gwei: int = 50
    scan_interval_seconds: int = 1
    
    # Enhanced features
    mev_protection_enabled: bool = True
    gas_optimization_enabled: bool = True
    risk_management_enabled: bool = True
    slippage_protection_enabled: bool = True
    
    # TypeScript services
    use_typescript_services: bool = True
    services_timeout: int = 10
    
    # Network settings
    networks: List[str] = None
    
    def __post_init__(self):
        if self.networks is None:
            self.networks = ['polygon']

class EnhancedArbitrageBot:
    """Enhanced arbitrage bot with TypeScript services integration"""
    
    def __init__(self, config: EnhancedConfig):
        self.config = config
        self.running = False
        self.bridge = None
        self.integration = None
        self.stats = {
            'opportunities_found': 0,
            'trades_executed': 0,
            'successful_trades': 0,
            'total_profit': 0.0,
            'total_gas_used': 0,
            'start_time': time.time()
        }
        
        # Initialize components
        self._initialize_bridge()
        self._initialize_brownie()
        self._initialize_tokens_and_dexes()
        
        logger.info("Enhanced Arbitrage Bot initialized")
    
    def _initialize_bridge(self):
        """Initialize the Python-TypeScript bridge"""
        if not self.config.use_typescript_services or not PythonTypeScriptBridge:
            logger.warning("TypeScript services integration disabled")
            return
        
        try:
            self.bridge = create_bridge_from_env()
            self.integration = ArbitrageBotIntegration(self.bridge)
            logger.info("TypeScript services bridge initialized")
        except Exception as e:
            logger.error(f"Failed to initialize TypeScript bridge: {e}")
            self.config.use_typescript_services = False
    
    def _initialize_brownie(self):
        """Initialize Brownie components"""
        if not BROWNIE_AVAILABLE:
            logger.warning("Brownie not available - contract interactions disabled")
            return
        
        try:
            if self.config.contract_address:
                self.contract = Contract.from_abi(
                    "FlashloanV3Polygon", 
                    self.config.contract_address, 
                    FlashloanV3Polygon.abi
                )
                self.account = accounts.add(self.config.private_key)
                logger.info(f"Brownie initialized with contract: {self.config.contract_address}")
            else:
                logger.warning("No contract address provided")
        except Exception as e:
            logger.error(f"Failed to initialize Brownie: {e}")
    
    def _initialize_tokens_and_dexes(self):
        """Initialize token and DEX configurations"""
        # Polygon token addresses
        self.tokens = {
            'WMATIC': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
            'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            'WETH': '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
            'DAI': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
            'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
        }
        
        # DEX addresses
        self.dexes = {
            'QUICKSWAP': '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
            'SUSHISWAP': '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
            'UNISWAP_V3': '0xE592427A0AEce92De3Edee1F18E0157C05861564'
        }
        
        # Trade amounts (in wei)
        self.trade_amounts = [
            Web3.toWei(1000, 'ether') if BROWNIE_AVAILABLE else 1000 * 10**18,
            Web3.toWei(3146, 'ether') if BROWNIE_AVAILABLE else 3146 * 10**18,
            Web3.toWei(10000, 'ether') if BROWNIE_AVAILABLE else 10000 * 10**18,
        ]
    
    def start(self):
        """Start the enhanced arbitrage bot"""
        logger.info("Starting Enhanced Arbitrage Bot...")
        self.running = True
        
        # Start the bridge if available
        if self.bridge:
            self.bridge.start()
        
        # Start main scanning loop
        try:
            self._main_loop()
        except KeyboardInterrupt:
            logger.info("Received interrupt signal, shutting down...")
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}")
        finally:
            self.stop()
    
    def stop(self):
        """Stop the arbitrage bot"""
        logger.info("Stopping Enhanced Arbitrage Bot...")
        self.running = False
        
        if self.bridge:
            self.bridge.stop()
        
        # Print final stats
        self._print_final_stats()
    
    def _main_loop(self):
        """Main arbitrage scanning and execution loop"""
        logger.info("Starting arbitrage scanning loop...")
        
        while self.running:
            try:
                # Scan for arbitrage opportunities
                opportunities = self._scan_for_opportunities()
                
                if opportunities:
                    logger.info(f"Found {len(opportunities)} potential opportunities")
                    
                    # Process each opportunity
                    for opportunity in opportunities:
                        if not self.running:
                            break
                        
                        # Enhance opportunity analysis using TypeScript services
                        enhanced_opportunity = self._enhance_opportunity_analysis(opportunity)
                        
                        # Execute if profitable
                        if self._should_execute_trade(enhanced_opportunity):
                            self._execute_arbitrage_trade(enhanced_opportunity)
                
                # Wait before next scan
                time.sleep(self.config.scan_interval_seconds)
                
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(5)  # Wait longer on error
    
    def _scan_for_opportunities(self) -> List[Dict[str, Any]]:
        """Scan for arbitrage opportunities across DEXs"""
        opportunities = []
        
        try:
            # Get current prices from multiple DEXs
            for token_in, token_out in self._get_token_pairs():
                for amount in self.trade_amounts:
                    opportunity = self._analyze_token_pair(token_in, token_out, amount)
                    if opportunity and opportunity['profit_percentage'] >= self.config.min_profit_percentage:
                        opportunities.append(opportunity)
                        self.stats['opportunities_found'] += 1
        
        except Exception as e:
            logger.error(f"Error scanning for opportunities: {e}")
        
        return opportunities
    
    def _get_token_pairs(self) -> List[tuple]:
        """Get list of token pairs to analyze"""
        pairs = []
        token_list = list(self.tokens.keys())
        
        for i, token_in in enumerate(token_list):
            for token_out in token_list[i+1:]:
                pairs.append((token_in, token_out))
                pairs.append((token_out, token_in))  # Both directions
        
        return pairs
    
    def _analyze_token_pair(self, token_in: str, token_out: str, amount: int) -> Optional[Dict[str, Any]]:
        """Analyze a specific token pair for arbitrage opportunities"""
        try:
            # Get prices from different DEXs
            prices = {}
            for dex_name, dex_address in self.dexes.items():
                price = self._get_price_from_dex(token_in, token_out, amount, dex_address)
                if price:
                    prices[dex_name] = price
            
            if len(prices) < 2:
                return None
            
            # Find best buy and sell prices
            best_buy_dex = min(prices.keys(), key=lambda x: prices[x])
            best_sell_dex = max(prices.keys(), key=lambda x: prices[x])
            
            buy_price = prices[best_buy_dex]
            sell_price = prices[best_sell_dex]
            
            # Calculate potential profit
            profit = sell_price - buy_price
            profit_percentage = (profit / buy_price) * 100 if buy_price > 0 else 0
            
            if profit_percentage >= self.config.min_profit_percentage:
                return {
                    'token_in': token_in,
                    'token_out': token_out,
                    'amount_in': amount,
                    'buy_dex': best_buy_dex,
                    'sell_dex': best_sell_dex,
                    'buy_price': buy_price,
                    'sell_price': sell_price,
                    'expected_profit': profit,
                    'profit_percentage': profit_percentage,
                    'dex_path': [best_buy_dex, best_sell_dex],
                    'gas_estimate': 200000,  # Rough estimate
                    'timestamp': datetime.now(),
                    'confidence_score': min(profit_percentage / 10, 1.0)  # Simple confidence scoring
                }
        
        except Exception as e:
            logger.debug(f"Error analyzing {token_in}/{token_out}: {e}")
        
        return None
    
    def _get_price_from_dex(self, token_in: str, token_out: str, amount: int, dex_address: str) -> Optional[float]:
        """Get price quote from a specific DEX"""
        try:
            # This is a simplified implementation
            # In a real implementation, you would call the actual DEX contracts
            # or use DEX aggregator APIs
            
            # Mock price data for demonstration
            import random
            base_price = random.uniform(0.8, 1.2)  # Random price around 1.0
            return base_price * amount
        
        except Exception as e:
            logger.debug(f"Error getting price from {dex_address}: {e}")
            return None
    
    def _enhance_opportunity_analysis(self, opportunity: Dict[str, Any]) -> Dict[str, Any]:
        """Enhance opportunity analysis using TypeScript services"""
        if not self.integration:
            return opportunity
        
        try:
            # Use TypeScript services for enhanced analysis
            enhanced_opportunity = self.integration.enhance_opportunity_analysis(opportunity)
            
            logger.debug(f"Enhanced opportunity analysis completed for {opportunity['token_in']}/{opportunity['token_out']}")
            return enhanced_opportunity
        
        except Exception as e:
            logger.warning(f"Failed to enhance opportunity analysis: {e}")
            return opportunity
    
    def _should_execute_trade(self, opportunity: Dict[str, Any]) -> bool:
        """Determine if a trade should be executed"""
        try:
            # Basic profitability check
            if opportunity['expected_profit'] < self.config.min_profit_usd:
                return False
            
            if opportunity['profit_percentage'] < self.config.min_profit_percentage:
                return False
            
            # Gas price check
            current_gas_price = self._get_current_gas_price()
            if current_gas_price > self.config.max_gas_price_gwei:
                logger.info(f"Gas price too high: {current_gas_price} gwei")
                return False
            
            # Additional checks from TypeScript services
            if self.config.risk_management_enabled and 'risk_score' in opportunity:
                if opportunity['risk_score'] > 0.7:  # High risk
                    logger.info(f"Risk score too high: {opportunity['risk_score']}")
                    return False
            
            return True
        
        except Exception as e:
            logger.error(f"Error in trade decision: {e}")
            return False
    
    def _get_current_gas_price(self) -> int:
        """Get current gas price in gwei"""
        try:
            # This would typically query the network for current gas prices
            # For now, return a mock value
            return 30  # 30 gwei
        except Exception as e:
            logger.error(f"Error getting gas price: {e}")
            return 100  # Conservative fallback
    
    def _execute_arbitrage_trade(self, opportunity: Dict[str, Any]):
        """Execute an arbitrage trade"""
        logger.info(f"Executing arbitrage trade: {opportunity['token_in']} -> {opportunity['token_out']}")
        
        start_time = time.time()
        execution_result = {
            'opportunity_id': f"{opportunity['token_in']}_{opportunity['token_out']}_{int(time.time())}",
            'success': False,
            'tx_hash': None,
            'actual_profit': None,
            'gas_used': None,
            'execution_time': 0,
            'error_message': None
        }
        
        try:
            self.stats['trades_executed'] += 1
            
            # Execute the actual trade
            if BROWNIE_AVAILABLE and hasattr(self, 'contract'):
                tx_result = self._execute_flash_loan_trade(opportunity)
                
                if tx_result:
                    execution_result.update({
                        'success': True,
                        'tx_hash': tx_result.get('tx_hash'),
                        'actual_profit': tx_result.get('profit'),
                        'gas_used': tx_result.get('gas_used')
                    })
                    
                    self.stats['successful_trades'] += 1
                    self.stats['total_profit'] += tx_result.get('profit', 0)
                    self.stats['total_gas_used'] += tx_result.get('gas_used', 0)
                    
                    logger.info(f"Trade executed successfully: {tx_result}")
                else:
                    execution_result['error_message'] = "Trade execution failed"
            else:
                # Simulation mode
                logger.info("Simulating trade execution (Brownie not available)")
                execution_result.update({
                    'success': True,
                    'actual_profit': opportunity['expected_profit'],
                    'gas_used': opportunity['gas_estimate']
                })
                self.stats['successful_trades'] += 1
        
        except Exception as e:
            execution_result['error_message'] = str(e)
            logger.error(f"Trade execution failed: {e}")
        
        finally:
            execution_result['execution_time'] = time.time() - start_time
            
            # Report execution result to TypeScript services
            if self.integration:
                self.integration.report_execution_result(execution_result)
    
    def _execute_flash_loan_trade(self, opportunity: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Execute the actual flash loan trade using Brownie"""
        try:
            # This is a simplified implementation
            # In a real implementation, you would:
            # 1. Prepare the flash loan parameters
            # 2. Call the flash loan contract
            # 3. Handle the callback execution
            # 4. Return the transaction result
            
            logger.info("Flash loan trade execution not implemented in this demo")
            return None
        
        except Exception as e:
            logger.error(f"Flash loan execution error: {e}")
            return None
    
    def _print_final_stats(self):
        """Print final statistics"""
        runtime = time.time() - self.stats['start_time']
        
        logger.info("=== Enhanced Arbitrage Bot Final Statistics ===")
        logger.info(f"Runtime: {runtime:.2f} seconds")
        logger.info(f"Opportunities Found: {self.stats['opportunities_found']}")
        logger.info(f"Trades Executed: {self.stats['trades_executed']}")
        logger.info(f"Successful Trades: {self.stats['successful_trades']}")
        logger.info(f"Success Rate: {(self.stats['successful_trades'] / max(self.stats['trades_executed'], 1)) * 100:.2f}%")
        logger.info(f"Total Profit: ${self.stats['total_profit']:.2f}")
        logger.info(f"Total Gas Used: {self.stats['total_gas_used']}")
        logger.info("=" * 50)

def load_config_from_env() -> EnhancedConfig:
    """Load configuration from environment variables"""
    return EnhancedConfig(
        contract_address=os.getenv('ARBITRAGE_CONTRACT_ADDRESS', ''),
        private_key=os.getenv('PRIVATE_KEY', ''),
        min_profit_usd=float(os.getenv('MIN_PROFIT_USD', '1.0')),
        min_profit_percentage=float(os.getenv('MIN_PROFIT_PERCENTAGE', '0.30')),
        max_gas_price_gwei=int(os.getenv('MAX_GAS_PRICE_GWEI', '50')),
        scan_interval_seconds=int(os.getenv('SCAN_INTERVAL_SECONDS', '1')),
        mev_protection_enabled=os.getenv('MEV_PROTECTION_ENABLED', 'true').lower() == 'true',
        gas_optimization_enabled=os.getenv('GAS_OPTIMIZATION_ENABLED', 'true').lower() == 'true',
        risk_management_enabled=os.getenv('RISK_MANAGEMENT_ENABLED', 'true').lower() == 'true',
        slippage_protection_enabled=os.getenv('SLIPPAGE_PROTECTION_ENABLED', 'true').lower() == 'true',
        use_typescript_services=os.getenv('USE_TYPESCRIPT_SERVICES', 'true').lower() == 'true',
        services_timeout=int(os.getenv('SERVICES_TIMEOUT', '10'))
    )

def main():
    """Main entry point"""
    # Ensure logs directory exists
    os.makedirs('logs', exist_ok=True)
    
    # Load configuration
    config = load_config_from_env()
    
    # Create and start the bot
    bot = EnhancedArbitrageBot(config)
    bot.start()

if __name__ == "__main__":
    main()