#!/usr/bin/env node

/**
 * Enhanced DeFi Arbitrage System Launcher
 * 
 * This script orchestrates the startup of the complete system including:
 * - TypeScript services
 * - Python arbitrage bot
 * - Dashboard
 * - Health monitoring
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

class SystemLauncher {
    constructor() {
        this.processes = new Map();
        this.isShuttingDown = false;
        this.healthCheckInterval = null;
        this.startTime = Date.now();
        
        // Load environment variables
        require('dotenv').config();
        
        this.config = {
            services: {
                defiSystem: { port: process.env.DEFI_SYSTEM_PORT || 3001, path: 'services' },
                networkManager: { port: process.env.NETWORK_MANAGER_PORT || 3002, path: 'services' },
                liquidityAggregator: { port: process.env.LIQUIDITY_AGGREGATOR_PORT || 3003, path: 'services' },
                riskManager: { port: process.env.RISK_MANAGER_PORT || 3004, path: 'services' }
            },
            python: {
                arbitrageBot: { script: 'scripts/polygon_arbitrage_bot.py' },
                dashboard: { script: 'run_dashboard.py', port: process.env.PORT || 5000 }
            },
            healthCheck: {
                interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
                timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000
            }
        };
    }

    async start() {
        console.log('🚀 Starting Enhanced DeFi Arbitrage System...');
        console.log('=' .repeat(60));
        
        try {
            // Pre-flight checks
            await this.preflightChecks();
            
            // Start TypeScript services
            await this.startTypeScriptServices();
            
            // Wait for services to be ready
            await this.waitForServices();
            
            // Start Python components
            await this.startPythonComponents();
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();
            
            console.log('✅ System startup complete!');
            console.log('📊 Dashboard: http://localhost:' + this.config.python.dashboard.port);
            console.log('🔧 Services: TypeScript services running on ports 3001-3004');
            console.log('🤖 Arbitrage bot: Active and scanning for opportunities');
            console.log('=' .repeat(60));
            
        } catch (error) {
            console.error('❌ System startup failed:', error.message);
            await this.shutdown();
            process.exit(1);
        }
    }

    async preflightChecks() {
        console.log('🔍 Running pre-flight checks...');
        
        // Check if required files exist
        const requiredFiles = [
            'services/package.json',
            'services/dist/index.js',
            'scripts/polygon_arbitrage_bot.py',
            'run_dashboard.py'
        ];
        
        for (const file of requiredFiles) {
            if (!fs.existsSync(file)) {
                if (file.includes('dist/')) {
                    console.log('📦 Building TypeScript services...');
                    await this.buildServices();
                    break;
                } else {
                    throw new Error(`Required file not found: ${file}`);
                }
            }
        }
        
        // Check environment variables
        const requiredEnvVars = ['PRIVATE_KEY', 'POLYGON_RPC_URL'];
        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Required environment variable not set: ${envVar}`);
            }
        }
        
        console.log('✅ Pre-flight checks passed');
    }

    async buildServices() {
        return new Promise((resolve, reject) => {
            const buildProcess = spawn('npm', ['run', 'build'], {
                cwd: 'services',
                stdio: 'inherit'
            });
            
            buildProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Build failed with code ${code}`));
                }
            });
        });
    }

    async startTypeScriptServices() {
        console.log('🔧 Starting TypeScript services...');
        
        // Start main DeFi system service
        await this.startService('defiSystem', 'npm', ['run', 'start:system']);
        
        // Start individual services
        await this.startService('networkManager', 'npm', ['run', 'start:network']);
        await this.startService('liquidityAggregator', 'npm', ['run', 'start:liquidity']);
        await this.startService('riskManager', 'npm', ['run', 'start:risk']);
        
        console.log('✅ TypeScript services started');
    }

    async startService(name, command, args) {
        const service = this.config.services[name];
        if (!service) return;
        
        const process = spawn(command, args, {
            cwd: service.path,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PORT: service.port }
        });
        
        this.processes.set(name, process);
        
        // Log output
        process.stdout.on('data', (data) => {
            console.log(`[${name}] ${data.toString().trim()}`);
        });
        
        process.stderr.on('data', (data) => {
            console.error(`[${name}] ERROR: ${data.toString().trim()}`);
        });
        
        process.on('close', (code) => {
            if (!this.isShuttingDown) {
                console.error(`[${name}] Process exited with code ${code}`);
                this.restartService(name, command, args);
            }
        });
        
        // Give the service time to start
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    async waitForServices() {
        console.log('⏳ Waiting for services to be ready...');
        
        const maxRetries = 30;
        const retryDelay = 2000;
        
        for (const [name, config] of Object.entries(this.config.services)) {
            let retries = 0;
            let isReady = false;
            
            while (retries < maxRetries && !isReady) {
                try {
                    const response = await axios.get(`http://localhost:${config.port}/health`, {
                        timeout: 1000
                    });
                    
                    if (response.status === 200) {
                        console.log(`✅ ${name} is ready`);
                        isReady = true;
                    }
                } catch (error) {
                    retries++;
                    if (retries < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                }
            }
            
            if (!isReady) {
                throw new Error(`Service ${name} failed to start after ${maxRetries} retries`);
            }
        }
    }

    async startPythonComponents() {
        console.log('🐍 Starting Python components...');
        
        // Start arbitrage bot
        const botProcess = spawn('python', [this.config.python.arbitrageBot.script], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        this.processes.set('arbitrageBot', botProcess);
        
        botProcess.stdout.on('data', (data) => {
            console.log(`[ArbitrageBot] ${data.toString().trim()}`);
        });
        
        botProcess.stderr.on('data', (data) => {
            console.error(`[ArbitrageBot] ERROR: ${data.toString().trim()}`);
        });
        
        // Start dashboard
        const dashboardProcess = spawn('python', [this.config.python.dashboard.script], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PORT: this.config.python.dashboard.port }
        });
        
        this.processes.set('dashboard', dashboardProcess);
        
        dashboardProcess.stdout.on('data', (data) => {
            console.log(`[Dashboard] ${data.toString().trim()}`);
        });
        
        dashboardProcess.stderr.on('data', (data) => {
            console.error(`[Dashboard] ERROR: ${data.toString().trim()}`);
        });
        
        console.log('✅ Python components started');
    }

    startHealthMonitoring() {
        console.log('💓 Starting health monitoring...');
        
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, this.config.healthCheck.interval);
    }

    async performHealthCheck() {
        const results = {
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime,
            services: {},
            overall: 'healthy'
        };
        
        // Check TypeScript services
        for (const [name, config] of Object.entries(this.config.services)) {
            try {
                const response = await axios.get(`http://localhost:${config.port}/health`, {
                    timeout: this.config.healthCheck.timeout
                });
                
                results.services[name] = {
                    status: 'healthy',
                    port: config.port,
                    response: response.data
                };
            } catch (error) {
                results.services[name] = {
                    status: 'unhealthy',
                    port: config.port,
                    error: error.message
                };
                results.overall = 'degraded';
            }
        }
        
        // Check Python processes
        for (const [name, process] of this.processes.entries()) {
            if (name.includes('arbitrage') || name.includes('dashboard')) {
                results.services[name] = {
                    status: process.killed ? 'stopped' : 'running',
                    pid: process.pid
                };
            }
        }
        
        // Log health status
        if (results.overall === 'healthy') {
            console.log(`💚 System health check: ${results.overall} (uptime: ${Math.floor(results.uptime / 1000)}s)`);
        } else {
            console.warn(`⚠️  System health check: ${results.overall}`);
            console.warn(JSON.stringify(results, null, 2));
        }
    }

    async restartService(name, command, args) {
        console.log(`🔄 Restarting service: ${name}`);
        
        // Remove old process
        this.processes.delete(name);
        
        // Wait a bit before restarting
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Restart the service
        await this.startService(name, command, args);
    }

    setupGracefulShutdown() {
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        
        signals.forEach(signal => {
            process.on(signal, async () => {
                console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
                await this.shutdown();
                process.exit(0);
            });
        });
        
        process.on('uncaughtException', async (error) => {
            console.error('💥 Uncaught exception:', error);
            await this.shutdown();
            process.exit(1);
        });
        
        process.on('unhandledRejection', async (reason, promise) => {
            console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
            await this.shutdown();
            process.exit(1);
        });
    }

    async shutdown() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        
        console.log('🛑 Shutting down system...');
        
        // Stop health monitoring
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        // Kill all processes
        for (const [name, process] of this.processes.entries()) {
            console.log(`🔴 Stopping ${name}...`);
            process.kill('SIGTERM');
            
            // Force kill after 5 seconds
            setTimeout(() => {
                if (!process.killed) {
                    process.kill('SIGKILL');
                }
            }, 5000);
        }
        
        console.log('✅ System shutdown complete');
    }
}

// Start the system if this script is run directly
if (require.main === module) {
    const launcher = new SystemLauncher();
    launcher.start().catch(error => {
        console.error('💥 Failed to start system:', error);
        process.exit(1);
    });
}

module.exports = SystemLauncher;