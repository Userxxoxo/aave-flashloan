"use strict";
/**
 * Health Check Utility for TypeScript Services
 *
 * Provides comprehensive health monitoring capabilities for all services
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHealthApp = exports.HealthChecker = void 0;
const express_1 = __importDefault(require("express"));
const perf_hooks_1 = require("perf_hooks");
const logger_1 = __importDefault(require("./logger"));
class HealthChecker {
    constructor(serviceName, version = '1.0.0') {
        this.checks = new Map();
        this.requestCount = 0;
        this.errorCount = 0;
        this.responseTimes = [];
        this.serviceName = serviceName;
        this.version = version;
        this.startTime = Date.now();
        this.metrics = {
            memoryUsage: process.memoryUsage(),
            requestCount: 0,
            errorCount: 0,
            averageResponseTime: 0
        };
        // Register default health checks
        this.registerDefaultChecks();
    }
    registerDefaultChecks() {
        // Memory usage check
        this.addCheck('memory', async () => {
            const memUsage = process.memoryUsage();
            const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
            const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
            const usage = (heapUsedMB / heapTotalMB) * 100;
            return {
                name: 'memory',
                status: usage > 90 ? 'fail' : usage > 75 ? 'warn' : 'pass',
                message: `Heap usage: ${heapUsedMB.toFixed(1)}MB / ${heapTotalMB.toFixed(1)}MB (${usage.toFixed(1)}%)`,
                details: memUsage
            };
        });
        // Event loop lag check
        this.addCheck('eventloop', async () => {
            const start = perf_hooks_1.performance.now();
            await new Promise(resolve => setImmediate(resolve));
            const lag = perf_hooks_1.performance.now() - start;
            return {
                name: 'eventloop',
                status: lag > 100 ? 'fail' : lag > 50 ? 'warn' : 'pass',
                message: `Event loop lag: ${lag.toFixed(2)}ms`,
                duration: lag,
                details: { lag }
            };
        });
        // Process uptime check
        this.addCheck('uptime', async () => {
            const uptime = Date.now() - this.startTime;
            const uptimeSeconds = Math.floor(uptime / 1000);
            return {
                name: 'uptime',
                status: 'pass',
                message: `Service uptime: ${this.formatUptime(uptimeSeconds)}`,
                details: { uptime, uptimeSeconds }
            };
        });
    }
    addCheck(name, checkFunction) {
        this.checks.set(name, checkFunction);
    }
    removeCheck(name) {
        this.checks.delete(name);
    }
    async performHealthCheck() {
        const startTime = perf_hooks_1.performance.now();
        const checks = [];
        // Run all health checks
        for (const [name, checkFn] of this.checks.entries()) {
            try {
                const checkStart = perf_hooks_1.performance.now();
                const result = await checkFn();
                result.duration = perf_hooks_1.performance.now() - checkStart;
                checks.push(result);
            }
            catch (error) {
                checks.push({
                    name,
                    status: 'fail',
                    message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    details: { error: error instanceof Error ? error.message : error }
                });
            }
        }
        // Update metrics
        this.updateMetrics();
        // Determine overall status
        const overallStatus = this.determineOverallStatus(checks);
        const healthStatus = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime,
            version: this.version,
            service: this.serviceName,
            checks,
            metrics: this.metrics
        };
        const duration = perf_hooks_1.performance.now() - startTime;
        logger_1.default.debug(`Health check completed in ${duration.toFixed(2)}ms`, {
            service: this.serviceName,
            status: overallStatus,
            checksCount: checks.length
        });
        return healthStatus;
    }
    determineOverallStatus(checks) {
        const failedChecks = checks.filter(c => c.status === 'fail');
        const warnChecks = checks.filter(c => c.status === 'warn');
        if (failedChecks.length > 0) {
            return 'unhealthy';
        }
        else if (warnChecks.length > 0) {
            return 'degraded';
        }
        else {
            return 'healthy';
        }
    }
    updateMetrics() {
        this.metrics = {
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            averageResponseTime: this.calculateAverageResponseTime(),
            lastRequestTime: this.lastRequestTime
        };
    }
    calculateAverageResponseTime() {
        if (this.responseTimes.length === 0)
            return 0;
        const sum = this.responseTimes.reduce((a, b) => a + b, 0);
        return sum / this.responseTimes.length;
    }
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m ${secs}s`;
        }
        else if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        }
        else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        }
        else {
            return `${secs}s`;
        }
    }
    // Middleware for tracking requests
    trackRequest() {
        return (req, res, next) => {
            const startTime = perf_hooks_1.performance.now();
            this.requestCount++;
            this.lastRequestTime = new Date().toISOString();
            // Track response time
            res.on('finish', () => {
                const responseTime = perf_hooks_1.performance.now() - startTime;
                this.responseTimes.push(responseTime);
                // Keep only last 100 response times
                if (this.responseTimes.length > 100) {
                    this.responseTimes = this.responseTimes.slice(-100);
                }
                // Track errors
                if (res.statusCode >= 400) {
                    this.errorCount++;
                }
            });
            next();
        };
    }
    // Express route handler for health endpoint
    getHealthHandler() {
        return async (req, res) => {
            try {
                const healthStatus = await this.performHealthCheck();
                // Set appropriate HTTP status code
                let statusCode = 200;
                if (healthStatus.status === 'degraded') {
                    statusCode = 200; // Still OK, but with warnings
                }
                else if (healthStatus.status === 'unhealthy') {
                    statusCode = 503; // Service Unavailable
                }
                res.status(statusCode).json(healthStatus);
            }
            catch (error) {
                logger_1.default.error('Health check endpoint error', {
                    service: this.serviceName,
                    error: error instanceof Error ? error.message : error
                });
                res.status(500).json({
                    status: 'unhealthy',
                    timestamp: new Date().toISOString(),
                    service: this.serviceName,
                    error: 'Health check failed',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
    }
    // Express route handler for metrics endpoint
    getMetricsHandler() {
        return (req, res) => {
            try {
                this.updateMetrics();
                res.json({
                    service: this.serviceName,
                    version: this.version,
                    timestamp: new Date().toISOString(),
                    uptime: Date.now() - this.startTime,
                    metrics: this.metrics
                });
            }
            catch (error) {
                logger_1.default.error('Metrics endpoint error', {
                    service: this.serviceName,
                    error: error instanceof Error ? error.message : error
                });
                res.status(500).json({
                    error: 'Failed to retrieve metrics',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
    }
    // Get current status without running checks
    getCurrentStatus() {
        this.updateMetrics();
        return {
            service: this.serviceName,
            version: this.version,
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime,
            metrics: this.metrics
        };
    }
}
exports.HealthChecker = HealthChecker;
// Utility function to create a basic Express app with health endpoints
function createHealthApp(serviceName, version, port) {
    const app = (0, express_1.default)();
    const healthChecker = new HealthChecker(serviceName, version);
    // Middleware
    app.use(express_1.default.json());
    app.use(healthChecker.trackRequest());
    // Health endpoints
    app.get('/health', healthChecker.getHealthHandler());
    app.get('/metrics', healthChecker.getMetricsHandler());
    app.get('/status', (req, res) => {
        res.json(healthChecker.getCurrentStatus());
    });
    // Basic info endpoint
    app.get('/', (req, res) => {
        res.json({
            service: serviceName,
            version: version || '1.0.0',
            status: 'running',
            timestamp: new Date().toISOString(),
            endpoints: ['/health', '/metrics', '/status']
        });
    });
    // Start server if port is provided
    if (port) {
        app.listen(port, () => {
            logger_1.default.info(`${serviceName} health server started on port ${port}`);
        });
    }
    return app;
}
exports.createHealthApp = createHealthApp;
exports.default = HealthChecker;
//# sourceMappingURL=health-check.js.map