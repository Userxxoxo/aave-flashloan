#!/usr/bin/env python3

"""
Python-TypeScript Bridge for Enhanced DeFi Arbitrage System

This module provides integration between the existing Python/Brownie arbitrage bot
and the new TypeScript services, enabling seamless communication and data sharing.
"""

import json
import time
import requests
import threading
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ArbitrageOpportunity:
    """Data structure for arbitrage opportunities"""
    token_in: str
    token_out: str
    amount_in: float
    expected_profit: float
    profit_percentage: float
    dex_path: List[str]
    gas_estimate: int
    timestamp: datetime
    confidence_score: float

@dataclass
class TradeExecution:
    """Data structure for trade execution results"""
    opportunity_id: str
    success: bool
    tx_hash: Optional[str]
    actual_profit: Optional[float]
    gas_used: Optional[int]
    execution_time: float
    error_message: Optional[str]

class TypeScriptServiceClient:
    """Client for communicating with TypeScript services"""
    
    def __init__(self, base_url: str, timeout: int = 10):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        
    def health_check(self) -> bool:
        """Check if the service is healthy"""
        try:
            response = self.session.get(f"{self.base_url}/health", timeout=self.timeout)
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"Health check failed for {self.base_url}: {e}")
            return False
    
    def post_data(self, endpoint: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Post data to a service endpoint"""
        try:
            response = self.session.post(
                f"{self.base_url}{endpoint}",
                json=data,
                timeout=self.timeout,
                headers={'Content-Type': 'application/json'}
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to post to {self.base_url}{endpoint}: {e}")
            return None
    
    def get_data(self, endpoint: str) -> Optional[Dict[str, Any]]:
        """Get data from a service endpoint"""
        try:
            response = self.session.get(f"{self.base_url}{endpoint}", timeout=self.timeout)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get from {self.base_url}{endpoint}: {e}")
            return None

class PythonTypeScriptBridge:
    """Main bridge class for Python-TypeScript integration"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.services = {}
        self.running = False
        self.data_queue = []
        self.callbacks = {}
        
        # Initialize service clients
        self._initialize_services()
        
        # Start background threads
        self.data_sync_thread = None
        self.health_monitor_thread = None
        
    def _initialize_services(self):
        """Initialize connections to TypeScript services"""
        service_configs = {
            'defi_system': self.config.get('DEFI_SYSTEM_URL', 'http://localhost:3001'),
            'network_manager': self.config.get('NETWORK_MANAGER_URL', 'http://localhost:3002'),
            'liquidity_aggregator': self.config.get('LIQUIDITY_AGGREGATOR_URL', 'http://localhost:3003'),
            'risk_manager': self.config.get('RISK_MANAGER_URL', 'http://localhost:3004'),
        }
        
        for service_name, url in service_configs.items():
            self.services[service_name] = TypeScriptServiceClient(url)
            logger.info(f"Initialized client for {service_name}: {url}")
    
    def start(self):
        """Start the bridge service"""
        logger.info("Starting Python-TypeScript Bridge...")
        self.running = True
        
        # Start background threads
        self.data_sync_thread = threading.Thread(target=self._data_sync_loop, daemon=True)
        self.health_monitor_thread = threading.Thread(target=self._health_monitor_loop, daemon=True)
        
        self.data_sync_thread.start()
        self.health_monitor_thread.start()
        
        logger.info("Bridge started successfully")
    
    def stop(self):
        """Stop the bridge service"""
        logger.info("Stopping Python-TypeScript Bridge...")
        self.running = False
        
        if self.data_sync_thread:
            self.data_sync_thread.join(timeout=5)
        if self.health_monitor_thread:
            self.health_monitor_thread.join(timeout=5)
        
        logger.info("Bridge stopped")
    
    def register_callback(self, event_type: str, callback):
        """Register a callback for specific events"""
        if event_type not in self.callbacks:
            self.callbacks[event_type] = []
        self.callbacks[event_type].append(callback)
    
    def emit_event(self, event_type: str, data: Any):
        """Emit an event to registered callbacks"""
        if event_type in self.callbacks:
            for callback in self.callbacks[event_type]:
                try:
                    callback(data)
                except Exception as e:
                    logger.error(f"Callback error for {event_type}: {e}")
    
    def send_arbitrage_opportunity(self, opportunity: ArbitrageOpportunity) -> bool:
        """Send arbitrage opportunity to TypeScript services for analysis"""
        try:
            # Convert to dict for JSON serialization
            opp_data = asdict(opportunity)
            opp_data['timestamp'] = opportunity.timestamp.isoformat()
            
            # Send to risk manager for validation
            risk_result = self.services['risk_manager'].post_data('/analyze-opportunity', opp_data)
            if not risk_result or not risk_result.get('approved', False):
                logger.warning(f"Opportunity rejected by risk manager: {risk_result}")
                return False
            
            # Send to liquidity aggregator for optimization
            liquidity_result = self.services['liquidity_aggregator'].post_data('/optimize-route', opp_data)
            if liquidity_result:
                # Update opportunity with optimized data
                opportunity.dex_path = liquidity_result.get('optimized_path', opportunity.dex_path)
                opportunity.expected_profit = liquidity_result.get('optimized_profit', opportunity.expected_profit)
            
            # Send to main DeFi system
            system_result = self.services['defi_system'].post_data('/opportunity', asdict(opportunity))
            
            return system_result is not None
            
        except Exception as e:
            logger.error(f"Failed to send arbitrage opportunity: {e}")
            return False
    
    def report_trade_execution(self, execution: TradeExecution) -> bool:
        """Report trade execution results to TypeScript services"""
        try:
            execution_data = asdict(execution)
            
            # Send to all relevant services
            for service_name, client in self.services.items():
                result = client.post_data('/trade-execution', execution_data)
                if not result:
                    logger.warning(f"Failed to report execution to {service_name}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to report trade execution: {e}")
            return False
    
    def get_gas_optimization(self, transaction_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Get gas optimization suggestions from TypeScript services"""
        try:
            # Send to DeFi system for gas optimization
            result = self.services['defi_system'].post_data('/optimize-gas', transaction_data)
            return result
        except Exception as e:
            logger.error(f"Failed to get gas optimization: {e}")
            return None
    
    def get_mev_protection(self, transaction_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Get MEV protection recommendations"""
        try:
            result = self.services['defi_system'].post_data('/mev-protection', transaction_data)
            return result
        except Exception as e:
            logger.error(f"Failed to get MEV protection: {e}")
            return None
    
    def get_slippage_protection(self, trade_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Get slippage protection parameters"""
        try:
            result = self.services['defi_system'].post_data('/slippage-protection', trade_data)
            return result
        except Exception as e:
            logger.error(f"Failed to get slippage protection: {e}")
            return None
    
    def get_network_status(self) -> Dict[str, Any]:
        """Get network status from network manager"""
        try:
            result = self.services['network_manager'].get_data('/status')
            return result or {}
        except Exception as e:
            logger.error(f"Failed to get network status: {e}")
            return {}
    
    def get_liquidity_data(self, token_pair: str) -> Optional[Dict[str, Any]]:
        """Get liquidity data for a token pair"""
        try:
            result = self.services['liquidity_aggregator'].get_data(f'/liquidity/{token_pair}')
            return result
        except Exception as e:
            logger.error(f"Failed to get liquidity data: {e}")
            return None
    
    def _data_sync_loop(self):
        """Background thread for syncing data with TypeScript services"""
        while self.running:
            try:
                # Process queued data
                if self.data_queue:
                    data_item = self.data_queue.pop(0)
                    self._process_data_item(data_item)
                
                # Sync system metrics
                self._sync_system_metrics()
                
                time.sleep(1)  # 1 second sync interval
                
            except Exception as e:
                logger.error(f"Data sync error: {e}")
                time.sleep(5)  # Wait longer on error
    
    def _health_monitor_loop(self):
        """Background thread for monitoring service health"""
        while self.running:
            try:
                unhealthy_services = []
                
                for service_name, client in self.services.items():
                    if not client.health_check():
                        unhealthy_services.append(service_name)
                
                if unhealthy_services:
                    logger.warning(f"Unhealthy services: {unhealthy_services}")
                    self.emit_event('services_unhealthy', unhealthy_services)
                else:
                    logger.debug("All services healthy")
                
                time.sleep(30)  # 30 second health check interval
                
            except Exception as e:
                logger.error(f"Health monitor error: {e}")
                time.sleep(60)  # Wait longer on error
    
    def _process_data_item(self, data_item: Dict[str, Any]):
        """Process a queued data item"""
        try:
            data_type = data_item.get('type')
            data_payload = data_item.get('payload')
            
            if data_type == 'price_update':
                self._send_price_update(data_payload)
            elif data_type == 'trade_signal':
                self._send_trade_signal(data_payload)
            elif data_type == 'system_metric':
                self._send_system_metric(data_payload)
            
        except Exception as e:
            logger.error(f"Failed to process data item: {e}")
    
    def _send_price_update(self, price_data: Dict[str, Any]):
        """Send price update to relevant services"""
        for service_name in ['liquidity_aggregator', 'defi_system']:
            if service_name in self.services:
                self.services[service_name].post_data('/price-update', price_data)
    
    def _send_trade_signal(self, signal_data: Dict[str, Any]):
        """Send trade signal to DeFi system"""
        if 'defi_system' in self.services:
            self.services['defi_system'].post_data('/trade-signal', signal_data)
    
    def _send_system_metric(self, metric_data: Dict[str, Any]):
        """Send system metric to monitoring services"""
        for service_name, client in self.services.items():
            client.post_data('/metrics', metric_data)
    
    def _sync_system_metrics(self):
        """Sync system metrics with TypeScript services"""
        try:
            metrics = {
                'timestamp': datetime.now().isoformat(),
                'python_bridge_status': 'running',
                'queue_size': len(self.data_queue),
                'active_services': len([s for s in self.services.values() if s.health_check()])
            }
            
            self.queue_data('system_metric', metrics)
            
        except Exception as e:
            logger.error(f"Failed to sync system metrics: {e}")
    
    def queue_data(self, data_type: str, payload: Any):
        """Queue data for processing"""
        self.data_queue.append({
            'type': data_type,
            'payload': payload,
            'timestamp': datetime.now().isoformat()
        })
        
        # Limit queue size
        if len(self.data_queue) > 1000:
            self.data_queue = self.data_queue[-500:]  # Keep last 500 items

# Example usage and integration helper
class ArbitrageBotIntegration:
    """Helper class for integrating with existing arbitrage bot"""
    
    def __init__(self, bridge: PythonTypeScriptBridge):
        self.bridge = bridge
        
    def enhance_opportunity_analysis(self, opportunity_data: Dict[str, Any]) -> Dict[str, Any]:
        """Enhance opportunity analysis using TypeScript services"""
        
        # Create opportunity object
        opportunity = ArbitrageOpportunity(
            token_in=opportunity_data['token_in'],
            token_out=opportunity_data['token_out'],
            amount_in=opportunity_data['amount_in'],
            expected_profit=opportunity_data['expected_profit'],
            profit_percentage=opportunity_data['profit_percentage'],
            dex_path=opportunity_data['dex_path'],
            gas_estimate=opportunity_data['gas_estimate'],
            timestamp=datetime.now(),
            confidence_score=opportunity_data.get('confidence_score', 0.5)
        )
        
        # Send to TypeScript services for analysis
        if self.bridge.send_arbitrage_opportunity(opportunity):
            # Get enhanced data
            gas_optimization = self.bridge.get_gas_optimization(opportunity_data)
            mev_protection = self.bridge.get_mev_protection(opportunity_data)
            slippage_protection = self.bridge.get_slippage_protection(opportunity_data)
            
            # Merge enhancements
            enhanced_data = opportunity_data.copy()
            if gas_optimization:
                enhanced_data.update(gas_optimization)
            if mev_protection:
                enhanced_data.update(mev_protection)
            if slippage_protection:
                enhanced_data.update(slippage_protection)
            
            return enhanced_data
        
        return opportunity_data
    
    def report_execution_result(self, execution_data: Dict[str, Any]):
        """Report execution result to TypeScript services"""
        execution = TradeExecution(
            opportunity_id=execution_data['opportunity_id'],
            success=execution_data['success'],
            tx_hash=execution_data.get('tx_hash'),
            actual_profit=execution_data.get('actual_profit'),
            gas_used=execution_data.get('gas_used'),
            execution_time=execution_data['execution_time'],
            error_message=execution_data.get('error_message')
        )
        
        self.bridge.report_trade_execution(execution)

# Configuration and startup
def create_bridge_from_env() -> PythonTypeScriptBridge:
    """Create bridge instance from environment variables"""
    import os
    
    config = {
        'DEFI_SYSTEM_URL': os.getenv('DEFI_SYSTEM_URL', 'http://localhost:3001'),
        'NETWORK_MANAGER_URL': os.getenv('NETWORK_MANAGER_URL', 'http://localhost:3002'),
        'LIQUIDITY_AGGREGATOR_URL': os.getenv('LIQUIDITY_AGGREGATOR_URL', 'http://localhost:3003'),
        'RISK_MANAGER_URL': os.getenv('RISK_MANAGER_URL', 'http://localhost:3004'),
    }
    
    return PythonTypeScriptBridge(config)

if __name__ == "__main__":
    # Example usage
    bridge = create_bridge_from_env()
    bridge.start()
    
    try:
        # Keep running
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down bridge...")
        bridge.stop()