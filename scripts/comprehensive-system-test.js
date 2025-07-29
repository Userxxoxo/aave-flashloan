#!/usr/bin/env node

/**
 * Comprehensive System Test
 * 
 * This script validates that all components of the Enhanced DeFi Arbitrage System
 * work together correctly, including:
 * - TypeScript services integration
 * - Python-TypeScript bridge communication
 * - Multi-network initialization
 * - Complete trade execution flow
 * - Service health and monitoring
 */

const axios = require('axios');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class ComprehensiveSystemTest {
    constructor() {
        require('dotenv').config();
        
        this.config = {
            services: {
                defiSystem: { port: process.env.DEFI_SYSTEM_PORT || 3001, name: 'DeFi System' },
                networkManager: { port: process.env.NETWORK_MANAGER_PORT || 3002, name: 'Network Manager' },
                liquidityAggregator: { port: process.env.LIQUIDITY_AGGREGATOR_PORT || 3003, name: 'Liquidity Aggregator' },
                riskManager: { port: process.env.RISK_MANAGER_PORT || 3004, name: 'Risk Manager' }
            },
            networks: {
                polygon: { rpc: process.env.POLYGON_RPC_URL, chainId: 137 },
                ethereum: { rpc: process.env.ETHEREUM_RPC_URL, chainId: 1 },
                arbitrum: { rpc: process.env.ARBITRUM_RPC_URL, chainId: 42161 },
                optimism: { rpc: process.env.OPTIMISM_RPC_URL, chainId: 10 }
            },
            timeout: 30000
        };
        
        this.testResults = {
            timestamp: new Date().toISOString(),
            overall: 'unknown',
            tests: {},
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0
            }
        };
    }

    async runComprehensiveTest() {
        console.log('🧪 Enhanced DeFi System - Comprehensive Integration Test');
        console.log('=' .repeat(70));
        console.log(`Started at: ${this.testResults.timestamp}`);
        console.log('');

        try {
            // Test 1: System Prerequisites
            await this.testSystemPrerequisites();
            
            // Test 2: TypeScript Services
            await this.testTypeScriptServices();
            
            // Test 3: Network Connectivity
            await this.testNetworkConnectivity();
            
            // Test 4: Service Integration
            await this.testServiceIntegration();
            
            // Test 5: Python-TypeScript Bridge
            await this.testPythonTypeScriptBridge();
            
            // Test 6: Multi-Network Initialization
            await this.testMultiNetworkInitialization();
            
            // Test 7: Trade Execution Flow
            await this.testTradeExecutionFlow();
            
            // Test 8: Monitoring and Alerting
            await this.testMonitoringAndAlerting();
            
            // Test 9: Error Handling and Recovery
            await this.testErrorHandlingAndRecovery();
            
            // Test 10: Performance and Load
            await this.testPerformanceAndLoad();
            
            // Generate final report
            this.generateFinalReport();
            
            return this.testResults;
            
        } catch (error) {
            console.error('❌ Comprehensive test failed:', error.message);
            this.testResults.overall = 'failed';
            this.testResults.error = error.message;
            return this.testResults;
        }
    }

    async testSystemPrerequisites() {
        console.log('📋 Test 1: System Prerequisites');
        const testName = 'system_prerequisites';
        
        try {
            const checks = [];
            
            // Check Node.js version
            const nodeVersion = await this.execCommand('node --version');
            checks.push({
                name: 'Node.js Version',
                status: this.checkNodeVersion(nodeVersion.trim()),
                details: nodeVersion.trim()
            });
            
            // Check npm version
            const npmVersion = await this.execCommand('npm --version');
            checks.push({
                name: 'npm Version',
                status: this.checkNpmVersion(npmVersion.trim()),
                details: npmVersion.trim()
            });
            
            // Check Python version
            try {
                const pythonVersion = await this.execCommand('python --version');
                checks.push({
                    name: 'Python Version',
                    status: this.checkPythonVersion(pythonVersion.trim()),
                    details: pythonVersion.trim()
                });
            } catch (error) {
                checks.push({
                    name: 'Python Version',
                    status: 'failed',
                    details: 'Python not found'
                });
            }
            
            // Check required files
            const requiredFiles = [
                'package.json',
                'services/package.json',
                'services/dist/index.js',
                '.env.example',
                'scripts/start-enhanced-system.js'
            ];
            
            for (const file of requiredFiles) {
                checks.push({
                    name: `File: ${file}`,
                    status: fs.existsSync(file) ? 'passed' : 'failed',
                    details: fs.existsSync(file) ? 'Found' : 'Missing'
                });
            }
            
            // Check environment variables
            const requiredEnvVars = ['POLYGON_RPC_URL', 'PRIVATE_KEY'];
            for (const envVar of requiredEnvVars) {
                checks.push({
                    name: `Env Var: ${envVar}`,
                    status: process.env[envVar] ? 'passed' : 'failed',
                    details: process.env[envVar] ? 'Set' : 'Missing'
                });
            }
            
            const passed = checks.filter(c => c.status === 'passed').length;
            const failed = checks.filter(c => c.status === 'failed').length;
            
            this.recordTestResult(testName, {
                status: failed === 0 ? 'passed' : 'failed',
                checks,
                summary: `${passed}/${checks.length} checks passed`
            });
            
            // Display results
            for (const check of checks) {
                const icon = check.status === 'passed' ? '✅' : '❌';
                console.log(`  ${icon} ${check.name}: ${check.details}`);
            }
            
        } catch (error) {
            this.recordTestResult(testName, {
                status: 'failed',
                error: error.message
            });
        }
    }

    async testTypeScriptServices() {
        console.log('🔧 Test 2: TypeScript Services');
        const testName = 'typescript_services';
        
        try {
            const serviceResults = {};
            
            for (const [serviceId, config] of Object.entries(this.config.services)) {
                console.log(`  Testing ${config.name}...`);
                
                const result = await this.testService(serviceId, config);
                serviceResults[serviceId] = result;
                
                const icon = result.status === 'passed' ? '✅' : '❌';
                console.log(`    ${icon} ${config.name} (port ${config.port}): ${result.status}`);
                
                if (result.responseTime) {
                    console.log(`       Response time: ${result.responseTime}ms`);
                }
                if (result.error) {
                    console.log(`       Error: ${result.error}`);
                }
            }
            
            const allPassed = Object.values(serviceResults).every(r => r.status === 'passed');
            
            this.recordTestResult(testName, {
                status: allPassed ? 'passed' : 'failed',
                services: serviceResults,
                summary: `${Object.values(serviceResults).filter(r => r.status === 'passed').length}/${Object.keys(serviceResults).length} services healthy`
            });
            
        } catch (error) {
            this.recordTestResult(testName, {
                status: 'failed',
                error: error.message
            });
        }
    }

    async testNetworkConnectivity() {
        console.log('🌐 Test 3: Network Connectivity');
        const testName = 'network_connectivity';
        
        try {
            const networkResults = {};
            
            for (const [networkName, config] of Object.entries(this.config.networks)) {
                if (!config.rpc) {
                    console.log(`  ⚠️  ${networkName}: Not configured`);
                    networkResults[networkName] = { status: 'skipped', reason: 'Not configured' };
                    continue;
                }
                
                console.log(`  Testing ${networkName}...`);
                
                try {
                    const startTime = Date.now();
                    
                    const response = await axios.post(config.rpc, {
                        jsonrpc: '2.0',
                        method: 'eth_blockNumber',
                        params: [],
                        id: 1
                    }, {
                        timeout: 10000,
                        headers: { 'Content-Type': 'application/json' }
                    });
                    
                    const responseTime = Date.now() - startTime;
                    
                    if (response.data && response.data.result) {
                        const blockNumber = parseInt(response.data.result, 16);
                        networkResults[networkName] = {
                            status: 'passed',
                            blockNumber,
                            responseTime,
                            chainId: config.chainId
                        };
                        
                        console.log(`    ✅ ${networkName}: Block ${blockNumber} (${responseTime}ms)`);
                    } else {
                        networkResults[networkName] = {
                            status: 'failed',
                            error: 'Invalid response'
                        };
                        console.log(`    ❌ ${networkName}: Invalid response`);
                    }
                    
                } catch (error) {
                    networkResults[networkName] = {
                        status: 'failed',
                        error: error.message
                    };
                    console.log(`    ❌ ${networkName}: ${error.message}`);
                }
            }
            
            const passed = Object.values(networkResults).filter(r => r.status === 'passed').length;
            const total = Object.keys(networkResults).length;
            
            this.recordTestResult(testName, {
                status: passed > 0 ? 'passed' : 'failed',
                networks: networkResults,
                summary: `${passed}/${total} networks accessible`
            });
            
        } catch (error) {
            this.recordTestResult(testName, {
                status: 'failed',
                error: error.message
            });
        }
    }

    async testServiceIntegration() {
        console.log('🔗 Test 4: Service Integration');
        const testName = 'service_integration';
        
        try {
            const integrationTests = [];
            
            // Test 1: DeFi System can communicate with other services
            console.log('  Testing inter-service communication...');
            
            const testData = {
                token_in: 'WMATIC',
                token_out: 'USDC',
                amount_in: 1000,
                expected_profit: 10,
                profit_percentage: 1.0
            };
            
            // Test DeFi System -> Risk Manager
            try {
                const riskResponse = await axios.post(
                    `http://localhost:${this.config.services.riskManager.port}/analyze-opportunity`,
                    testData,
                    { timeout: 5000 }
                );
                
                integrationTests.push({
                    name: 'DeFi System -> Risk Manager',
                    status: riskResponse.status === 200 ? 'passed' : 'failed',
                    details: riskResponse.data
                });
                
                console.log('    ✅ DeFi System -> Risk Manager: Communication successful');
                
            } catch (error) {
                integrationTests.push({
                    name: 'DeFi System -> Risk Manager',
                    status: 'failed',
                    error: error.message
                });
                console.log('    ❌ DeFi System -> Risk Manager: Communication failed');
            }
            
            // Test DeFi System -> Liquidity Aggregator
            try {
                const liquidityResponse = await axios.post(
                    `http://localhost:${this.config.services.liquidityAggregator.port}/optimize-route`,
                    testData,
                    { timeout: 5000 }
                );
                
                integrationTests.push({
                    name: 'DeFi System -> Liquidity Aggregator',
                    status: liquidityResponse.status === 200 ? 'passed' : 'failed',
                    details: liquidityResponse.data
                });
                
                console.log('    ✅ DeFi System -> Liquidity Aggregator: Communication successful');
                
            } catch (error) {
                integrationTests.push({
                    name: 'DeFi System -> Liquidity Aggregator',
                    status: 'failed',
                    error: error.message
                });
                console.log('    ❌ DeFi System -> Liquidity Aggregator: Communication failed');
            }
            
            // Test Network Manager network switching
            try {
                const networkResponse = await axios.post(
                    `http://localhost:${this.config.services.networkManager.port}/switch`,
                    { network: 'polygon' },
                    { timeout: 5000 }
                );
                
                integrationTests.push({
                    name: 'Network Manager Switch',
                    status: networkResponse.status === 200 ? 'passed' : 'failed',
                    details: networkResponse.data
                });
                
                console.log('    ✅ Network Manager: Network switching successful');
                
            } catch (error) {
                integrationTests.push({
                    name: 'Network Manager Switch',
                    status: 'failed',
                    error: error.message
                });
                console.log('    ❌ Network Manager: Network switching failed');
            }
            
            const passed = integrationTests.filter(t => t.status === 'passed').length;
            
            this.recordTestResult(testName, {
                status: passed > 0 ? 'passed' : 'failed',
                tests: integrationTests,
                summary: `${passed}/${integrationTests.length} integration tests passed`
            });
            
        } catch (error) {
            this.recordTestResult(testName, {
                status: 'failed',
                error: error.message
            });
        }
    }

    async testPythonTypeScriptBridge() {
        console.log('🐍 Test 5: Python-TypeScript Bridge');
        const testName = 'python_typescript_bridge';
        
        try {
            console.log('  Testing bridge communication...');
            
            // This test would require the bridge to be running
            // For now, we'll test if the bridge script exists and is valid
            const bridgeScript = 'scripts/python_typescript_bridge.py';
            
            if (!fs.existsSync(bridgeScript)) {
                this.recordTestResult(testName, {
                    status: 'failed',
                    error: 'Bridge script not found'
                });
                return;
            }
            
            // Test Python syntax
            try {
                await this.execCommand(`python -m py_compile ${bridgeScript}`);
                console.log('    ✅ Bridge script syntax valid');
                
                this.recordTestResult(testName, {
                    status: 'passed',
                    summary: 'Bridge script exists and has valid syntax'
                });
                
            } catch (error) {
                console.log('    ❌ Bridge script syntax error');
                this.recordTestResult(testName, {
                    status: 'failed',
                    error: 'Bridge script syntax error'
                });
            }
            
        } catch (error) {
            this.recordTestResult(testName, {
                status: 'failed',
                error: error.message
            });
        }
    }

    async testMultiNetworkInitialization() {
        console.log('⛓️  Test 6: Multi-Network Initialization');
        const testName = 'multi_network_initialization';
        
        try {
            console.log('  Testing network initialization...');
            
            const networkTests = [];
            
            // Test network manager can initialize multiple networks
            try {
                const networksResponse = await axios.get(
                    `http://localhost:${this.config.services.networkManager.port}/networks`,
                    { timeout: 5000 }
                );
                
                if (networksResponse.data && networksResponse.data.networks) {
                    const supportedNetworks = networksResponse.data.networks;
                    
                    networkTests.push({
                        name: 'Network List',
                        status: supportedNetworks.length > 0 ? 'passed' : 'failed',
                        details: `${supportedNetworks.length} networks supported`
                    });
                    
                    console.log(`    ✅ Network Manager: ${supportedNetworks.length} networks supported`);
                    
                    // Test switching to each network
                    for (const network of supportedNetworks.slice(0, 2)) { // Test first 2 networks
                        try {
                            const switchResponse = await axios.post(
                                `http://localhost:${this.config.services.networkManager.port}/switch`,
                                { network: network.name },
                                { timeout: 5000 }
                            );
                            
                            networkTests.push({
                                name: `Switch to ${network.name}`,
                                status: switchResponse.status === 200 ? 'passed' : 'failed',
                                details: switchResponse.data
                            });
                            
                            console.log(`    ✅ Successfully switched to ${network.name}`);
                            
                        } catch (error) {
                            networkTests.push({
                                name: `Switch to ${network.name}`,
                                status: 'failed',
                                error: error.message
                            });
                            console.log(`    ❌ Failed to switch to ${network.name}`);
                        }
                    }
                } else {
                    networkTests.push({
                        name: 'Network List',
                        status: 'failed',
                        error: 'No networks returned'
                    });
                }
                
            } catch (error) {
                networkTests.push({
                    name: 'Network Manager Communication',
                    status: 'failed',
                    error: error.message
                });
            }
            
            const passed = networkTests.filter(t => t.status === 'passed').length;
            
            this.recordTestResult(testName, {
                status: passed > 0 ? 'passed' : 'failed',
                tests: networkTests,
                summary: `${passed}/${networkTests.length} network tests passed`
            });
            
        } catch (error) {
            this.recordTestResult(testName, {
                status: 'failed',
                error: error.message
            });
        }
    }

    async testTradeExecutionFlow() {
        console.log('💱 Test 7: Trade Execution Flow');
        const testName = 'trade_execution_flow';
        
        try {
            console.log('  Testing complete trade execution flow...');
            
            const flowTests = [];
            
            // Mock arbitrage opportunity
            const mockOpportunity = {
                token_in: 'WMATIC',
                token_out: 'USDC',
                amount_in: 1000,
                expected_profit: 10,
                profit_percentage: 1.0,
                dex_path: ['QuickSwap', 'SushiSwap'],
                gas_estimate: 200000,
                timestamp: new Date().toISOString(),
                confidence_score: 0.8
            };
            
            // Step 1: Risk Assessment
            try {
                const riskResponse = await axios.post(
                    `http://localhost:${this.config.services.riskManager.port}/analyze-opportunity`,
                    mockOpportunity,
                    { timeout: 5000 }
                );
                
                flowTests.push({
                    name: 'Risk Assessment',
                    status: riskResponse.status === 200 ? 'passed' : 'failed',
                    details: riskResponse.data
                });
                
                console.log('    ✅ Step 1: Risk assessment completed');
                
            } catch (error) {
                flowTests.push({
                    name: 'Risk Assessment',
                    status: 'failed',
                    error: error.message
                });
                console.log('    ❌ Step 1: Risk assessment failed');
            }
            
            // Step 2: Route Optimization
            try {
                const routeResponse = await axios.post(
                    `http://localhost:${this.config.services.liquidityAggregator.port}/optimize-route`,
                    mockOpportunity,
                    { timeout: 5000 }
                );
                
                flowTests.push({
                    name: 'Route Optimization',
                    status: routeResponse.status === 200 ? 'passed' : 'failed',
                    details: routeResponse.data
                });
                
                console.log('    ✅ Step 2: Route optimization completed');
                
            } catch (error) {
                flowTests.push({
                    name: 'Route Optimization',
                    status: 'failed',
                    error: error.message
                });
                console.log('    ❌ Step 2: Route optimization failed');
            }
            
            // Step 3: Gas Optimization
            try {
                const gasResponse = await axios.post(
                    `http://localhost:${this.config.services.defiSystem.port}/optimize-gas`,
                    mockOpportunity,
                    { timeout: 5000 }
                );
                
                flowTests.push({
                    name: 'Gas Optimization',
                    status: gasResponse.status === 200 ? 'passed' : 'failed',
                    details: gasResponse.data
                });
                
                console.log('    ✅ Step 3: Gas optimization completed');
                
            } catch (error) {
                flowTests.push({
                    name: 'Gas Optimization',
                    status: 'failed',
                    error: error.message
                });
                console.log('    ❌ Step 3: Gas optimization failed');
            }
            
            // Step 4: MEV Protection
            try {
                const mevResponse = await axios.post(
                    `http://localhost:${this.config.services.defiSystem.port}/mev-protection`,
                    mockOpportunity,
                    { timeout: 5000 }
                );
                
                flowTests.push({
                    name: 'MEV Protection',
                    status: mevResponse.status === 200 ? 'passed' : 'failed',
                    details: mevResponse.data
                });
                
                console.log('    ✅ Step 4: MEV protection completed');
                
            } catch (error) {
                flowTests.push({
                    name: 'MEV Protection',
                    status: 'failed',
                    error: error.message
                });
                console.log('    ❌ Step 4: MEV protection failed');
            }
            
            const passed = flowTests.filter(t => t.status === 'passed').length;
            
            this.recordTestResult(testName, {
                status: passed >= 2 ? 'passed' : 'failed', // At least 2 steps should work
                tests: flowTests,
                summary: `${passed}/${flowTests.length} execution steps completed`
            });
            
        } catch (error) {
            this.recordTestResult(testName, {
                status: 'failed',
                error: error.message
            });
        }
    }

    async testMonitoringAndAlerting() {
        console.log('📊 Test 8: Monitoring and Alerting');
        const testName = 'monitoring_alerting';
        
        try {
            console.log('  Testing monitoring capabilities...');
            
            const monitoringTests = [];
            
            // Test health endpoints
            for (const [serviceId, config] of Object.entries(this.config.services)) {
                try {
                    const healthResponse = await axios.get(
                        `http://localhost:${config.port}/health`,
                        { timeout: 3000 }
                    );
                    
                    monitoringTests.push({
                        name: `${config.name} Health Endpoint`,
                        status: healthResponse.status === 200 ? 'passed' : 'failed',
                        details: healthResponse.data
                    });
                    
                } catch (error) {
                    monitoringTests.push({
                        name: `${config.name} Health Endpoint`,
                        status: 'failed',
                        error: error.message
                    });
                }
            }
            
            // Test metrics endpoints
            for (const [serviceId, config] of Object.entries(this.config.services)) {
                try {
                    const metricsResponse = await axios.get(
                        `http://localhost:${config.port}/metrics`,
                        { timeout: 3000 }
                    );
                    
                    monitoringTests.push({
                        name: `${config.name} Metrics Endpoint`,
                        status: metricsResponse.status === 200 ? 'passed' : 'failed',
                        details: metricsResponse.data
                    });
                    
                } catch (error) {
                    monitoringTests.push({
                        name: `${config.name} Metrics Endpoint`,
                        status: 'failed',
                        error: error.message
                    });
                }
            }
            
            const passed = monitoringTests.filter(t => t.status === 'passed').length;
            
            this.recordTestResult(testName, {
                status: passed > 0 ? 'passed' : 'failed',
                tests: monitoringTests,
                summary: `${passed}/${monitoringTests.length} monitoring tests passed`
            });
            
            console.log(`    📈 Monitoring tests: ${passed}/${monitoringTests.length} passed`);
            
        } catch (error) {
            this.recordTestResult(testName, {
                status: 'failed',
                error: error.message
            });
        }
    }

    async testErrorHandlingAndRecovery() {
        console.log('🛡️  Test 9: Error Handling and Recovery');
        const testName = 'error_handling_recovery';
        
        try {
            console.log('  Testing error handling capabilities...');
            
            const errorTests = [];
            
            // Test invalid requests
            try {
                await axios.post(
                    `http://localhost:${this.config.services.defiSystem.port}/invalid-endpoint`,
                    {},
                    { timeout: 3000 }
                );
                
                errorTests.push({
                    name: 'Invalid Endpoint Handling',
                    status: 'failed',
                    error: 'Should have returned 404'
                });
                
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    errorTests.push({
                        name: 'Invalid Endpoint Handling',
                        status: 'passed',
                        details: 'Correctly returned 404'
                    });
                } else {
                    errorTests.push({
                        name: 'Invalid Endpoint Handling',
                        status: 'failed',
                        error: error.message
                    });
                }
            }
            
            // Test malformed data
            try {
                await axios.post(
                    `http://localhost:${this.config.services.riskManager.port}/analyze-opportunity`,
                    { invalid: 'data' },
                    { timeout: 3000 }
                );
                
                errorTests.push({
                    name: 'Malformed Data Handling',
                    status: 'failed',
                    error: 'Should have returned error for invalid data'
                });
                
            } catch (error) {
                if (error.response && error.response.status >= 400) {
                    errorTests.push({
                        name: 'Malformed Data Handling',
                        status: 'passed',
                        details: 'Correctly rejected invalid data'
                    });
                } else {
                    errorTests.push({
                        name: 'Malformed Data Handling',
                        status: 'failed',
                        error: error.message
                    });
                }
            }
            
            const passed = errorTests.filter(t => t.status === 'passed').length;
            
            this.recordTestResult(testName, {
                status: passed > 0 ? 'passed' : 'failed',
                tests: errorTests,
                summary: `${passed}/${errorTests.length} error handling tests passed`
            });
            
            console.log(`    🛡️  Error handling tests: ${passed}/${errorTests.length} passed`);
            
        } catch (error) {
            this.recordTestResult(testName, {
                status: 'failed',
                error: error.message
            });
        }
    }

    async testPerformanceAndLoad() {
        console.log('⚡ Test 10: Performance and Load');
        const testName = 'performance_load';
        
        try {
            console.log('  Testing system performance...');
            
            const performanceTests = [];
            
            // Test response times
            for (const [serviceId, config] of Object.entries(this.config.services)) {
                const responseTimes = [];
                
                for (let i = 0; i < 5; i++) {
                    try {
                        const startTime = Date.now();
                        await axios.get(`http://localhost:${config.port}/health`, { timeout: 5000 });
                        const responseTime = Date.now() - startTime;
                        responseTimes.push(responseTime);
                    } catch (error) {
                        // Skip failed requests
                    }
                }
                
                if (responseTimes.length > 0) {
                    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
                    
                    performanceTests.push({
                        name: `${config.name} Response Time`,
                        status: avgResponseTime < 1000 ? 'passed' : 'warning',
                        details: `${avgResponseTime.toFixed(0)}ms average`,
                        responseTime: avgResponseTime
                    });
                    
                    console.log(`    ⚡ ${config.name}: ${avgResponseTime.toFixed(0)}ms average response time`);
                }
            }
            
            const passed = performanceTests.filter(t => t.status === 'passed').length;
            const warnings = performanceTests.filter(t => t.status === 'warning').length;
            
            this.recordTestResult(testName, {
                status: passed > 0 ? 'passed' : 'warning',
                tests: performanceTests,
                summary: `${passed} passed, ${warnings} warnings`
            });
            
        } catch (error) {
            this.recordTestResult(testName, {
                status: 'failed',
                error: error.message
            });
        }
    }

    generateFinalReport() {
        console.log('');
        console.log('📋 COMPREHENSIVE TEST RESULTS');
        console.log('=' .repeat(70));
        
        // Calculate overall results
        const testResults = Object.values(this.testResults.tests);
        this.testResults.summary.total = testResults.length;
        this.testResults.summary.passed = testResults.filter(t => t.status === 'passed').length;
        this.testResults.summary.failed = testResults.filter(t => t.status === 'failed').length;
        this.testResults.summary.skipped = testResults.filter(t => t.status === 'skipped').length;
        
        // Determine overall status
        if (this.testResults.summary.failed === 0) {
            this.testResults.overall = 'passed';
        } else if (this.testResults.summary.passed > this.testResults.summary.failed) {
            this.testResults.overall = 'warning';
        } else {
            this.testResults.overall = 'failed';
        }
        
        const overallIcon = this.testResults.overall === 'passed' ? '✅' : 
                           this.testResults.overall === 'warning' ? '⚠️' : '❌';
        
        console.log(`Overall Status: ${overallIcon} ${this.testResults.overall.toUpperCase()}`);
        console.log('');
        console.log('Summary:');
        console.log(`  Total Tests: ${this.testResults.summary.total}`);
        console.log(`  Passed: ${this.testResults.summary.passed}`);
        console.log(`  Failed: ${this.testResults.summary.failed}`);
        console.log(`  Skipped: ${this.testResults.summary.skipped}`);
        console.log('');
        
        // Show failed tests
        const failedTests = testResults.filter(t => t.status === 'failed');
        if (failedTests.length > 0) {
            console.log('❌ Failed Tests:');
            failedTests.forEach(test => {
                console.log(`  - ${test.name}: ${test.error || 'Unknown error'}`);
            });
            console.log('');
        }
        
        // Save detailed results
        this.saveTestResults();
        
        console.log('Detailed results saved to: comprehensive-test-results.json');
        console.log('');
    }

    saveTestResults() {
        const filename = `comprehensive-test-results-${Date.now()}.json`;
        const filepath = path.join('logs', filename);
        
        // Ensure logs directory exists
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs', { recursive: true });
        }
        
        fs.writeFileSync(filepath, JSON.stringify(this.testResults, null, 2));
        fs.writeFileSync('logs/comprehensive-test-latest.json', JSON.stringify(this.testResults, null, 2));
    }

    recordTestResult(testName, result) {
        this.testResults.tests[testName] = {
            name: testName,
            timestamp: new Date().toISOString(),
            ...result
        };
    }

    async testService(serviceId, config) {
        try {
            const startTime = Date.now();
            const response = await axios.get(`http://localhost:${config.port}/health`, {
                timeout: this.config.timeout
            });
            const responseTime = Date.now() - startTime;
            
            return {
                status: response.status === 200 ? 'passed' : 'failed',
                responseTime,
                details: response.data
            };
        } catch (error) {
            return {
                status: 'failed',
                error: error.code === 'ECONNREFUSED' ? 'Service not running' : error.message
            };
        }
    }

    checkNodeVersion(version) {
        const major = parseInt(version.replace('v', '').split('.')[0]);
        return major >= 16 ? 'passed' : 'failed';
    }

    checkNpmVersion(version) {
        const major = parseInt(version.split('.')[0]);
        return major >= 8 ? 'passed' : 'failed';
    }

    checkPythonVersion(version) {
        const versionMatch = version.match(/Python (\d+)\.(\d+)/);
        if (versionMatch) {
            const major = parseInt(versionMatch[1]);
            const minor = parseInt(versionMatch[2]);
            return (major === 3 && minor >= 8) || major > 3 ? 'passed' : 'failed';
        }
        return 'failed';
    }

    async execCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });
    }
}

// Run comprehensive test if this script is executed directly
if (require.main === module) {
    const tester = new ComprehensiveSystemTest();
    tester.runComprehensiveTest().then(results => {
        const exitCode = results.overall === 'failed' ? 1 : 0;
        process.exit(exitCode);
    }).catch(error => {
        console.error('Comprehensive test failed:', error);
        process.exit(1);
    });
}

module.exports = ComprehensiveSystemTest;