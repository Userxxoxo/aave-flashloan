/**
 * Health Check Utility for TypeScript Services
 * 
 * Provides comprehensive health monitoring capabilities for all services
 */

import express from 'express';
import { performance } from 'perf_hooks';
import logger from './logger';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  service: string;
  checks: HealthCheck[];
  metrics?: ServiceMetrics;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration?: number;
  details?: any;
}

export interface ServiceMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  lastRequestTime?: string | undefined;
}

export class HealthChecker {
  private serviceName: string;
  private version: string;
  private startTime: number;
  private checks: Map<string, () => Promise<HealthCheck>> = new Map();
  private metrics: ServiceMetrics;
  private requestCount: number = 0;
  private errorCount: number = 0;
  private responseTimes: number[] = [];
  private lastRequestTime?: string;

  constructor(serviceName: string, version: string = '1.0.0') {
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

  private registerDefaultChecks() {
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
      const start = performance.now();
      await new Promise(resolve => setImmediate(resolve));
      const lag = performance.now() - start;

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

  addCheck(name: string, checkFunction: () => Promise<HealthCheck>) {
    this.checks.set(name, checkFunction);
  }

  removeCheck(name: string) {
    this.checks.delete(name);
  }

  async performHealthCheck(): Promise<HealthStatus> {
    const startTime = performance.now();
    const checks: HealthCheck[] = [];
    
    // Run all health checks
    for (const [name, checkFn] of this.checks.entries()) {
      try {
        const checkStart = performance.now();
        const result = await checkFn();
        result.duration = performance.now() - checkStart;
        checks.push(result);
      } catch (error) {
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
    
    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: this.version,
      service: this.serviceName,
      checks,
      metrics: this.metrics
    };

    const duration = performance.now() - startTime;
    logger.debug(`Health check completed in ${duration.toFixed(2)}ms`, { 
      service: this.serviceName, 
      status: overallStatus,
      checksCount: checks.length
    });

    return healthStatus;
  }

  private determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'degraded' | 'unhealthy' {
    const failedChecks = checks.filter(c => c.status === 'fail');
    const warnChecks = checks.filter(c => c.status === 'warn');

    if (failedChecks.length > 0) {
      return 'unhealthy';
    } else if (warnChecks.length > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  private updateMetrics() {
    this.metrics = {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      averageResponseTime: this.calculateAverageResponseTime(),
      lastRequestTime: this.lastRequestTime
    };
  }

  private calculateAverageResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.responseTimes.length;
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${secs}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  // Middleware for tracking requests
  trackRequest() {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const startTime = performance.now();
      this.requestCount++;
      this.lastRequestTime = new Date().toISOString();

      // Track response time
      res.on('finish', () => {
        const responseTime = performance.now() - startTime;
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
    return async (req: express.Request, res: express.Response) => {
      try {
        const healthStatus = await this.performHealthCheck();
        
        // Set appropriate HTTP status code
        let statusCode = 200;
        if (healthStatus.status === 'degraded') {
          statusCode = 200; // Still OK, but with warnings
        } else if (healthStatus.status === 'unhealthy') {
          statusCode = 503; // Service Unavailable
        }

        res.status(statusCode).json(healthStatus);
      } catch (error) {
        logger.error('Health check endpoint error', { 
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
    return (req: express.Request, res: express.Response) => {
      try {
        this.updateMetrics();
        res.json({
          service: this.serviceName,
          version: this.version,
          timestamp: new Date().toISOString(),
          uptime: Date.now() - this.startTime,
          metrics: this.metrics
        });
      } catch (error) {
        logger.error('Metrics endpoint error', { 
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
  getCurrentStatus(): Partial<HealthStatus> {
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

// Utility function to create a basic Express app with health endpoints
export function createHealthApp(serviceName: string, version?: string, port?: number): express.Application {
  const app = express();
  const healthChecker = new HealthChecker(serviceName, version);

  // Middleware
  app.use(express.json());
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
      logger.info(`${serviceName} health server started on port ${port}`);
    });
  }

  return app;
}

export default HealthChecker;