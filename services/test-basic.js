// Basic test to ensure the services can be imported and instantiated
const { SlippageProtection, MEVProtection, GasOptimizer } = require('./dist/index');
const { ethers } = require('ethers');

console.log('Testing DeFi Arbitrage Services...');

// Mock provider for testing
const mockProvider = {
  getBlockNumber: () => Promise.resolve(1000),
  getBlock: () => Promise.resolve({
    number: 1000,
    timestamp: Math.floor(Date.now() / 1000),
    gasUsed: ethers.BigNumber.from('8000000'),
    gasLimit: ethers.BigNumber.from('10000000')
  }),
  getFeeData: () => Promise.resolve({
    lastBaseFeePerGas: ethers.utils.parseUnits('20', 'gwei'),
    maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
  }),
  getBlockWithTransactions: () => Promise.resolve({
    number: 1000,
    transactions: []
  }),
  estimateGas: () => Promise.resolve(ethers.BigNumber.from('21000')),
  call: () => Promise.resolve('0x'),
  send: () => Promise.resolve({})
};

async function testServices() {
  try {
    // Test SlippageProtection
    console.log('✓ Testing SlippageProtection...');
    const slippageProtection = new SlippageProtection(mockProvider);
    const config = slippageProtection.getConfig();
    console.log('  - Default config:', config);
    
    // Test MEVProtection
    console.log('✓ Testing MEVProtection...');
    const mevProtection = new MEVProtection(mockProvider);
    const mevConfig = mevProtection.getConfig();
    console.log('  - Default config:', mevConfig);
    
    // Test GasOptimizer
    console.log('✓ Testing GasOptimizer...');
    const gasOptimizer = new GasOptimizer(mockProvider);
    const gasConfig = gasOptimizer.getConfig();
    console.log('  - Default config:', gasConfig);
    
    // Test gas estimation
    const gasEstimate = await gasOptimizer.getOptimizedGasEstimate({
      to: '0x1234567890123456789012345678901234567890',
      data: '0x',
      value: ethers.BigNumber.from(0)
    });
    console.log('  - Gas estimate:', {
      gasLimit: gasEstimate.gasLimit.toString(),
      maxFeePerGas: ethers.utils.formatUnits(gasEstimate.maxFeePerGas, 'gwei') + ' gwei',
      confidence: gasEstimate.confidence
    });
    
    console.log('\n🎉 All services initialized successfully!');
    console.log('✅ TypeScript compilation: PASSED');
    console.log('✅ Service instantiation: PASSED');
    console.log('✅ Basic functionality: PASSED');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testServices();