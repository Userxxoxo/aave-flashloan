#!/usr/bin/env node

/**
 * System Health Check Script
 * 
 * Comprehensive health monitoring for the Enhanced DeFi Arbitrage System
 * Checks all services, connections, and system metrics
 */

const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class SystemHealthChecker {
    constructor() {
        require('dotenv').config();
        
        this.config = {
            services: {
                defiSystem: { 
                    port: process.env.DEFI_SYSTEM_PORT || 3001,
                    name: 'DeFi System Core',
                    critical: true
                },
                networkManager: { 
                    port: process.env.NETWORK_MANAGER_PORT || 3002,
                    name: 'Network Manager',
                    critical: true
                },
                liquidityAggregator: { 
                    port: process.env.LIQUIDITY_AGGREGATOR_PORT || 3003,
                    name: 'Liquidity Aggregator',
                    critical: true
                },
                riskManager: { 
                    port: process.env.RISK_MANAGER_PORT || 3004,
                    name: 'Risk Manager',
                    critical: true
                },
                dashboard: {
                    port: process.env.PORT || 5000,
                    name: 'Dashboard',
                    critical: false
                }
            },
            rpcEndpoints: {
                polygon: process.env.POLYGON_RPC_URL,
                ethereum: process.env.ETHEREUM_RPC_URL,
                arbitrum: process.env.ARBITRUM_RPC_URL,
                optimism: process.env.OPTIMISM_RPC_URL
            },
            timeout: 10000,
            retries: 3
        };
        
        this.results = {
            timestamp: new Date().toISOString(),
            overall: 'unknown',
            services: {},
            network: {},
            system: {},
            recommendations: []
        };
    }

    async runHealthCheck() {
        console.log('🏥 Enhanced DeFi System Health Check');
        console.log('=' .repeat(50));
        console.log(`Started at: ${this.results.timestamp}`);
        console.log('');

        try {
            // Check system resources
            await this.checkSystemResources();
            
            // Check TypeScript services
            await this.checkServices();
            
            // Check network connectivity
            await this.checkNetworkConnectivity();
            
            // Check RPC endpoints
            await this.checkRPCEndpoints();
            
            // Check file system
            await this.checkFileSystem();
            
            // Check Python environment
            await this.checkPythonEnvironment();
            
            // Determine overall health
            this.determineOverallHealth();
            
            // Generate recommendations
            this.generateRecommendations();
            
            // Display results
            this.displayResults();
            
            // Save results to file
            await this.saveResults();
            
            return this.results;
            
        } catch (error) {
            console.error('❌ Health check failed:', error.message);
            this.results.overall = 'critical';
            this.results.error = error.message;
            return this.results;
        }
    }

    async checkSystemResources() {
        console.log('🖥️  Checking system resources...');
        
        try {
            // Check memory usage
            const memInfo = await this.execCommand('free -m');
            const memLines = memInfo.split('\n');
            const memData = memLines[1].split(/\s+/);
            const totalMem = parseInt(memData[1]);
            const usedMem = parseInt(memData[2]);
            const memUsage = (usedMem / totalMem) * 100;
            
            // Check disk usage
            const diskInfo = await this.execCommand('df -h /');
            const diskLines = diskInfo.split('\n');
            const diskData = diskLines[1].split(/\s+/);
            const diskUsage = parseInt(diskData[4].replace('%', ''));
            
            // Check CPU load
            const loadInfo = await this.execCommand('uptime');
            const loadMatch = loadInfo.match(/load average: ([\d.]+)/);
            const cpuLoad = loadMatch ? parseFloat(loadMatch[1]) : 0;
            
            this.results.system = {
                memory: {
                    total: totalMem,
                    used: usedMem,
                    usage: Math.round(memUsage),
                    status: memUsage > 90 ? 'critical' : memUsage > 75 ? 'warning' : 'healthy'
                },
                disk: {
                    usage: diskUsage,
                    status: diskUsage > 90 ? 'critical' : diskUsage > 80 ? 'warning' : 'healthy'
                },
                cpu: {
                    load: cpuLoad,
                    status: cpuLoad > 4 ? 'critical' : cpuLoad > 2 ? 'warning' : 'healthy'
                }
            };
            
            console.log(`  Memory: ${memUsage.toFixed(1)}% (${this.results.system.memory.status})`);
            console.log(`  Disk: ${diskUsage}% (${this.results.system.disk.status})`);
            console.log(`  CPU Load: ${cpuLoad} (${this.results.system.cpu.status})`);
            
        } catch (error) {
            console.log('  ⚠️  Could not check system resources (non-Unix system?)');
            this.results.system = { status: 'unknown', error: error.message };
        }
    }

    async checkServices() {
        console.log('🔧 Checking TypeScript services...');
        
        for (const [serviceId, config] of Object.entries(this.config.services)) {
            const result = await this.checkService(serviceId, config);
            this.results.services[serviceId] = result;
            
            const status = result.status === 'healthy' ? '✅' : 
                          result.status === 'warning' ? '⚠️' : '❌';
            console.log(`  ${status} ${config.name} (port ${config.port}): ${result.status}`);
            
            if (result.responseTime) {
                console.log(`     Response time: ${result.responseTime}ms`);
            }
            if (result.error) {
                console.log(`     Error: ${result.error}`);
            }
        }
    }

    async checkService(serviceId, config) {
        const result = {
            name: config.name,
            port: config.port,
            critical: config.critical,
            status: 'unknown',
            responseTime: null,
            error: null,
            details: {}
        };
        
        try {
            const startTime = Date.now();
            
            // Check if service is responding
            const healthUrl = `http://localhost:${config.port}/health`;
            const response = await axios.get(healthUrl, {
                timeout: this.config.timeout
            });
            
            result.responseTime = Date.now() - startTime;
            
            if (response.status === 200) {
                result.status = 'healthy';
                result.details = response.data || {};
                
                // Additional checks based on response
                if (result.responseTime > 5000) {
                    result.status = 'warning';
                    result.warning = 'High response time';
                }
            } else {
                result.status = 'unhealthy';
                result.error = `HTTP ${response.status}`;
            }
            
        } catch (error) {
            result.status = 'unhealthy';
            result.error = error.code === 'ECONNREFUSED' ? 'Service not running' : error.message;
        }
        
        return result;
    }

    async checkNetworkConnectivity() {
        console.log('🌐 Checking network connectivity...');
        
        const testUrls = [
            'https://google.com',
            'https://api.coingecko.com/api/v3/ping',
            'https://api.1inch.io/v5.0/1/healthcheck'
        ];
        
        for (const url of testUrls) {
            try {
                const startTime = Date.now();
                const response = await axios.get(url, { timeout: 5000 });
                const responseTime = Date.now() - startTime;
                
                console.log(`  ✅ ${url}: ${responseTime}ms`);
                
            } catch (error) {
                console.log(`  ❌ ${url}: ${error.message}`);
                this.results.network[url] = { status: 'failed', error: error.message };
            }
        }
    }

    async checkRPCEndpoints() {
        console.log('⛓️  Checking RPC endpoints...');
        
        for (const [network, rpcUrl] of Object.entries(this.config.rpcEndpoints)) {
            if (!rpcUrl) {
                console.log(`  ⚠️  ${network}: Not configured`);
                continue;
            }
            
            try {
                const startTime = Date.now();
                
                // Test RPC with a simple eth_blockNumber call
                const response = await axios.post(rpcUrl, {
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
                    console.log(`  ✅ ${network}: Block ${blockNumber} (${responseTime}ms)`);
                    
                    this.results.network[network] = {
                        status: 'healthy',
                        blockNumber,
                        responseTime,
                        url: rpcUrl
                    };
                } else {
                    console.log(`  ❌ ${network}: Invalid response`);
                    this.results.network[network] = {
                        status: 'unhealthy',
                        error: 'Invalid response',
                        url: rpcUrl
                    };
                }
                
            } catch (error) {
                console.log(`  ❌ ${network}: ${error.message}`);
                this.results.network[network] = {
                    status: 'failed',
                    error: error.message,
                    url: rpcUrl
                };
            }
        }
    }

    async checkFileSystem() {
        console.log('📁 Checking file system...');
        
        const requiredFiles = [
            'package.json',
            'services/package.json',
            'services/dist/index.js',
            '.env.example',
            'services/.env.example',
            'scripts/polygon_arbitrage_bot.py',
            'run_dashboard.py'
        ];
        
        const requiredDirs = [
            'services/src',
            'services/dist',
            'scripts',
            'contracts'
        ];
        
        let missingFiles = [];
        let missingDirs = [];
        
        for (const file of requiredFiles) {
            if (!fs.existsSync(file)) {
                missingFiles.push(file);
                console.log(`  ❌ Missing file: ${file}`);
            } else {
                console.log(`  ✅ ${file}`);
            }
        }
        
        for (const dir of requiredDirs) {
            if (!fs.existsSync(dir)) {
                missingDirs.push(dir);
                console.log(`  ❌ Missing directory: ${dir}`);
            } else {
                console.log(`  ✅ ${dir}/`);
            }
        }
        
        this.results.filesystem = {
            status: (missingFiles.length === 0 && missingDirs.length === 0) ? 'healthy' : 'unhealthy',
            missingFiles,
            missingDirs
        };
    }

    async checkPythonEnvironment() {
        console.log('🐍 Checking Python environment...');
        
        try {
            // Check Python version
            const pythonVersion = await this.execCommand('python --version');
            console.log(`  ✅ ${pythonVersion.trim()}`);
            
            // Check if Brownie is installed
            try {
                const brownieVersion = await this.execCommand('brownie --version');
                console.log(`  ✅ ${brownieVersion.trim()}`);
            } catch (error) {
                console.log(`  ❌ Brownie not installed or not in PATH`);
            }
            
            // Check if required Python packages are installed
            const requiredPackages = ['web3', 'requests', 'flask'];
            for (const pkg of requiredPackages) {
                try {
                    await this.execCommand(`python -c "import ${pkg}"`);
                    console.log(`  ✅ ${pkg} package available`);
                } catch (error) {
                    console.log(`  ❌ ${pkg} package missing`);
                }
            }
            
        } catch (error) {
            console.log(`  ❌ Python not available: ${error.message}`);
            this.results.python = { status: 'failed', error: error.message };
        }
    }

    determineOverallHealth() {
        let criticalIssues = 0;
        let warnings = 0;
        
        // Check services
        for (const [serviceId, result] of Object.entries(this.results.services)) {
            if (result.critical && result.status !== 'healthy') {
                criticalIssues++;
            } else if (result.status === 'warning') {
                warnings++;
            }
        }
        
        // Check system resources
        if (this.results.system.memory?.status === 'critical' || 
            this.results.system.disk?.status === 'critical' ||
            this.results.system.cpu?.status === 'critical') {
            criticalIssues++;
        }
        
        // Check network
        const networkIssues = Object.values(this.results.network).filter(n => n.status === 'failed').length;
        if (networkIssues > 0) {
            warnings++;
        }
        
        // Determine overall status
        if (criticalIssues > 0) {
            this.results.overall = 'critical';
        } else if (warnings > 0) {
            this.results.overall = 'warning';
        } else {
            this.results.overall = 'healthy';
        }
    }

    generateRecommendations() {
        const recommendations = [];
        
        // Service recommendations
        for (const [serviceId, result] of Object.entries(this.results.services)) {
            if (result.status === 'unhealthy') {
                if (result.error === 'Service not running') {
                    recommendations.push(`Start the ${result.name} service on port ${result.port}`);
                } else {
                    recommendations.push(`Check ${result.name} service logs for errors`);
                }
            } else if (result.status === 'warning' && result.responseTime > 5000) {
                recommendations.push(`${result.name} has high response time - check system load`);
            }
        }
        
        // System recommendations
        if (this.results.system.memory?.status === 'critical') {
            recommendations.push('System memory usage is critical - consider adding more RAM or reducing load');
        }
        if (this.results.system.disk?.status === 'critical') {
            recommendations.push('Disk usage is critical - free up disk space');
        }
        if (this.results.system.cpu?.status === 'critical') {
            recommendations.push('CPU load is high - check for resource-intensive processes');
        }
        
        // Network recommendations
        const failedNetworks = Object.entries(this.results.network)
            .filter(([_, result]) => result.status === 'failed')
            .map(([network, _]) => network);
        
        if (failedNetworks.length > 0) {
            recommendations.push(`Check network connectivity for: ${failedNetworks.join(', ')}`);
        }
        
        // File system recommendations
        if (this.results.filesystem?.missingFiles?.length > 0) {
            recommendations.push('Some required files are missing - run setup scripts');
        }
        
        this.results.recommendations = recommendations;
    }

    displayResults() {
        console.log('');
        console.log('📊 HEALTH CHECK RESULTS');
        console.log('=' .repeat(50));
        
        const statusIcon = this.results.overall === 'healthy' ? '✅' : 
                          this.results.overall === 'warning' ? '⚠️' : '❌';
        
        console.log(`Overall Status: ${statusIcon} ${this.results.overall.toUpperCase()}`);
        console.log('');
        
        if (this.results.recommendations.length > 0) {
            console.log('🔧 RECOMMENDATIONS:');
            this.results.recommendations.forEach((rec, index) => {
                console.log(`${index + 1}. ${rec}`);
            });
            console.log('');
        }
        
        console.log('For detailed results, check: health-check-results.json');
    }

    async saveResults() {
        const filename = `health-check-results-${Date.now()}.json`;
        const filepath = path.join('logs', filename);
        
        // Ensure logs directory exists
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs', { recursive: true });
        }
        
        fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
        
        // Also save as latest
        fs.writeFileSync('logs/health-check-latest.json', JSON.stringify(this.results, null, 2));
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

// Run health check if this script is executed directly
if (require.main === module) {
    const checker = new SystemHealthChecker();
    checker.runHealthCheck().then(results => {
        const exitCode = results.overall === 'critical' ? 1 : 0;
        process.exit(exitCode);
    }).catch(error => {
        console.error('Health check failed:', error);
        process.exit(1);
    });
}

module.exports = SystemHealthChecker;