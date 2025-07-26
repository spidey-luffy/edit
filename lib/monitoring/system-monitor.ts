// System Monitoring - Comprehensive monitoring for optimized system
import { logger, LogCategory } from '../logging/comprehensive-logger';
import { errorHandler } from '../error-handling/enhanced-error-handler';
import { toolMiddleware } from '../middleware/tool-middleware';
import { optimizedAIProcessor } from '../ai/optimized-ai-processor';

// System health metrics interface
export interface SystemHealthMetrics {
  timestamp: Date;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    api: ComponentHealth;
    ai: ComponentHealth;
    database: ComponentHealth;
    tools: ComponentHealth;
    memory: ComponentHealth;
    errors: ComponentHealth;
  };
  performance: {
    responseTime: number;
    throughput: number;
    errorRate: number;
    cacheHitRate: number;
  };
  alerts: SystemAlert[];
}

interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: Record<string, any>;
  lastCheck: Date;
  message?: string;
}

interface SystemAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  component: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
}

// System monitor class
export class SystemMonitor {
  private alerts: Map<string, SystemAlert> = new Map();
  private healthHistory: SystemHealthMetrics[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  // Thresholds for health checks
  private readonly thresholds = {
    responseTime: {
      healthy: 2000, // < 2s
      degraded: 5000, // < 5s
    },
    errorRate: {
      healthy: 5, // < 5%
      degraded: 15, // < 15%
    },
    memoryUsage: {
      healthy: 70, // < 70%
      degraded: 85, // < 85%
    },
    cacheHitRate: {
      healthy: 60, // > 60%
      degraded: 30, // > 30%
    },
  };

  constructor() {
    this.startMonitoring();
  }

  // Start system monitoring
  public startMonitoring(intervalMs: number = 60000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    
    logger.info(LogCategory.SYSTEM, 'Starting system monitoring', {
      interval: intervalMs,
    });

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error(LogCategory.SYSTEM, 'Health check failed', error as Error);
      }
    }, intervalMs);

    // Initial health check
    this.performHealthCheck();
  }

  // Stop system monitoring
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.isMonitoring = false;
    
    logger.info(LogCategory.SYSTEM, 'System monitoring stopped');
  }

  // Perform comprehensive health check
  public async performHealthCheck(): Promise<SystemHealthMetrics> {
    const startTime = Date.now();
    
    try {
      logger.debug(LogCategory.SYSTEM, 'Performing system health check');

      // Check all components
      const [apiHealth, aiHealth, dbHealth, toolsHealth, memoryHealth, errorsHealth] = await Promise.all([
        this.checkAPIHealth(),
        this.checkAIHealth(),
        this.checkDatabaseHealth(),
        this.checkToolsHealth(),
        this.checkMemoryHealth(),
        this.checkErrorsHealth(),
      ]);

      // Calculate overall performance metrics
      const performance = this.calculatePerformanceMetrics();

      // Determine overall system health
      const componentStatuses = [apiHealth, aiHealth, dbHealth, toolsHealth, memoryHealth, errorsHealth];
      const overallStatus = this.determineOverallHealth(componentStatuses);

      // Create health metrics
      const healthMetrics: SystemHealthMetrics = {
        timestamp: new Date(),
        overall: overallStatus,
        components: {
          api: apiHealth,
          ai: aiHealth,
          database: dbHealth,
          tools: toolsHealth,
          memory: memoryHealth,
          errors: errorsHealth,
        },
        performance,
        alerts: Array.from(this.alerts.values()).filter(alert => !alert.resolved),
      };

      // Store in history (keep last 100 checks)
      this.healthHistory.push(healthMetrics);
      if (this.healthHistory.length > 100) {
        this.healthHistory.shift();
      }

      // Check for alerts
      this.checkForAlerts(healthMetrics);

      const checkDuration = Date.now() - startTime;
      logger.debug(LogCategory.SYSTEM, 'Health check completed', {
        duration: checkDuration,
        overallStatus,
      });

      return healthMetrics;

    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Health check failed', error as Error);
      
      // Return unhealthy status
      return {
        timestamp: new Date(),
        overall: 'unhealthy',
        components: {
          api: { status: 'unhealthy', metrics: {}, lastCheck: new Date(), message: 'Health check failed' },
          ai: { status: 'unhealthy', metrics: {}, lastCheck: new Date(), message: 'Health check failed' },
          database: { status: 'unhealthy', metrics: {}, lastCheck: new Date(), message: 'Health check failed' },
          tools: { status: 'unhealthy', metrics: {}, lastCheck: new Date(), message: 'Health check failed' },
          memory: { status: 'unhealthy', metrics: {}, lastCheck: new Date(), message: 'Health check failed' },
          errors: { status: 'unhealthy', metrics: {}, lastCheck: new Date(), message: 'Health check failed' },
        },
        performance: { responseTime: 0, throughput: 0, errorRate: 100, cacheHitRate: 0 },
        alerts: [],
      };
    }
  }

  // Check API health
  private async checkAPIHealth(): Promise<ComponentHealth> {
    try {
      // This would typically check API metrics from the optimized metrics collector
      // For now, we'll simulate based on system state
      const metrics = {
        uptime: Math.floor(process.uptime()),
        requestsPerMinute: 0, // Would be populated from actual metrics
        averageResponseTime: 1500,
        successRate: 98.5,
      };

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'API is operating normally';

      if (metrics.averageResponseTime > this.thresholds.responseTime.degraded) {
        status = 'unhealthy';
        message = 'API response time is too high';
      } else if (metrics.averageResponseTime > this.thresholds.responseTime.healthy) {
        status = 'degraded';
        message = 'API response time is elevated';
      }

      if (metrics.successRate < 90) {
        status = 'unhealthy';
        message = 'API success rate is too low';
      } else if (metrics.successRate < 95) {
        status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
        message = 'API success rate is below optimal';
      }

      return {
        status,
        metrics,
        lastCheck: new Date(),
        message,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: {},
        lastCheck: new Date(),
        message: `API health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Check AI system health
  private async checkAIHealth(): Promise<ComponentHealth> {
    try {
      const aiMetrics = optimizedAIProcessor.getPerformanceMetrics();
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'AI system is operating normally';

      if (aiMetrics.errorRate > 0.15) {
        status = 'unhealthy';
        message = 'AI error rate is too high';
      } else if (aiMetrics.errorRate > 0.05) {
        status = 'degraded';
        message = 'AI error rate is elevated';
      }

      if (aiMetrics.averageResponseTime > 5000) {
        status = 'unhealthy';
        message = 'AI response time is too high';
      } else if (aiMetrics.averageResponseTime > 3000) {
        status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
        message = 'AI response time is elevated';
      }

      return {
        status,
        metrics: aiMetrics,
        lastCheck: new Date(),
        message,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: {},
        lastCheck: new Date(),
        message: `AI health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Check database health
  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    try {
      // Test database connection
      const { getAccessToken } = await import('../api/tripxplo');
      const startTime = Date.now();
      await getAccessToken();
      const connectionTime = Date.now() - startTime;

      const metrics = {
        connectionTime,
        status: 'connected',
      };

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Database is connected and responsive';

      if (connectionTime > 5000) {
        status = 'degraded';
        message = 'Database connection is slow';
      }

      return {
        status,
        metrics,
        lastCheck: new Date(),
        message,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: { status: 'disconnected' },
        lastCheck: new Date(),
        message: `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Check tools health
  private async checkToolsHealth(): Promise<ComponentHealth> {
    try {
      const toolMetrics = toolMiddleware.getMetrics();
      
      const totalCalls = Object.values(toolMetrics).reduce((sum, metric) => sum + metric.calls, 0);
      const totalFailures = Object.values(toolMetrics).reduce((sum, metric) => sum + metric.failures, 0);
      const overallSuccessRate = totalCalls > 0 ? ((totalCalls - totalFailures) / totalCalls) * 100 : 100;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Tools are operating normally';

      if (overallSuccessRate < 80) {
        status = 'unhealthy';
        message = 'Tool success rate is too low';
      } else if (overallSuccessRate < 90) {
        status = 'degraded';
        message = 'Tool success rate is below optimal';
      }

      return {
        status,
        metrics: {
          ...toolMetrics,
          overallSuccessRate,
          totalCalls,
          totalFailures,
        },
        lastCheck: new Date(),
        message,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: {},
        lastCheck: new Date(),
        message: `Tools health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Check memory health
  private async checkMemoryHealth(): Promise<ComponentHealth> {
    try {
      const memoryUsage = process.memoryUsage();
      const totalMemory = memoryUsage.heapTotal;
      const usedMemory = memoryUsage.heapUsed;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      const metrics = {
        heapUsed: Math.round(usedMemory / 1024 / 1024), // MB
        heapTotal: Math.round(totalMemory / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        usagePercent: Math.round(memoryUsagePercent * 100) / 100,
      };

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Memory usage is normal';

      if (memoryUsagePercent > this.thresholds.memoryUsage.degraded) {
        status = 'unhealthy';
        message = 'Memory usage is critically high';
      } else if (memoryUsagePercent > this.thresholds.memoryUsage.healthy) {
        status = 'degraded';
        message = 'Memory usage is elevated';
      }

      return {
        status,
        metrics,
        lastCheck: new Date(),
        message,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: {},
        lastCheck: new Date(),
        message: `Memory health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Check errors health
  private async checkErrorsHealth(): Promise<ComponentHealth> {
    try {
      const errorStats = errorHandler.getErrorStats();
      const recentErrors = errorHandler.getRecentErrors(50);
      
      const totalErrors = Object.values(errorStats).reduce((sum, count) => sum + count, 0);
      const criticalErrors = recentErrors.filter(error => error.severity === 'critical').length;
      const recentErrorRate = recentErrors.length; // Errors in recent period

      const metrics = {
        totalErrors,
        criticalErrors,
        recentErrorRate,
        errorsByCategory: errorStats,
      };

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = 'Error levels are normal';

      if (criticalErrors > 5) {
        status = 'unhealthy';
        message = 'Too many critical errors detected';
      } else if (criticalErrors > 2) {
        status = 'degraded';
        message = 'Elevated critical error count';
      } else if (recentErrorRate > 20) {
        status = 'degraded';
        message = 'High recent error rate';
      }

      return {
        status,
        metrics,
        lastCheck: new Date(),
        message,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: {},
        lastCheck: new Date(),
        message: `Error health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Calculate performance metrics
  private calculatePerformanceMetrics(): SystemHealthMetrics['performance'] {
    // This would typically aggregate from various sources
    // For now, we'll provide reasonable defaults
    return {
      responseTime: 1500, // ms
      throughput: 25, // requests per minute
      errorRate: 2.5, // percentage
      cacheHitRate: 65, // percentage
    };
  }

  // Determine overall system health
  private determineOverallHealth(components: ComponentHealth[]): 'healthy' | 'degraded' | 'unhealthy' {
    const unhealthyCount = components.filter(c => c.status === 'unhealthy').length;
    const degradedCount = components.filter(c => c.status === 'degraded').length;

    if (unhealthyCount > 0) {
      return 'unhealthy';
    } else if (degradedCount > 2) {
      return 'degraded';
    } else if (degradedCount > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  // Check for alerts and create new ones
  private checkForAlerts(healthMetrics: SystemHealthMetrics): void {
    // Check for new alerts based on health metrics
    for (const [componentName, component] of Object.entries(healthMetrics.components)) {
      if (component.status === 'unhealthy') {
        this.createAlert('high', componentName, component.message || 'Component is unhealthy');
      } else if (component.status === 'degraded') {
        this.createAlert('medium', componentName, component.message || 'Component performance is degraded');
      } else {
        // Resolve any existing alerts for this component
        this.resolveAlertsForComponent(componentName);
      }
    }

    // Check performance-based alerts
    if (healthMetrics.performance.responseTime > this.thresholds.responseTime.degraded) {
      this.createAlert('high', 'performance', `Response time is ${healthMetrics.performance.responseTime}ms`);
    }

    if (healthMetrics.performance.errorRate > this.thresholds.errorRate.degraded) {
      this.createAlert('high', 'performance', `Error rate is ${healthMetrics.performance.errorRate}%`);
    }
  }

  // Create a new alert
  private createAlert(severity: SystemAlert['severity'], component: string, message: string): void {
    const alertId = `${component}-${severity}-${Date.now()}`;
    
    // Check if similar alert already exists
    const existingAlert = Array.from(this.alerts.values()).find(
      alert => alert.component === component && alert.severity === severity && !alert.resolved
    );

    if (existingAlert) {
      return; // Don't create duplicate alerts
    }

    const alert: SystemAlert = {
      id: alertId,
      severity,
      component,
      message,
      timestamp: new Date(),
      resolved: false,
    };

    this.alerts.set(alertId, alert);

    logger.warn(LogCategory.SYSTEM, `System alert created: ${component}`, undefined, {
      alertId,
      severity,
      message,
    });
  }

  // Resolve alerts for a component
  private resolveAlertsForComponent(component: string): void {
    for (const [alertId, alert] of this.alerts.entries()) {
      if (alert.component === component && !alert.resolved) {
        alert.resolved = true;
        
        logger.info(LogCategory.SYSTEM, `System alert resolved: ${component}`, {
          alertId,
          resolvedAt: new Date(),
        });
      }
    }
  }

  // Get current system health
  public getCurrentHealth(): SystemHealthMetrics | null {
    return this.healthHistory[this.healthHistory.length - 1] || null;
  }

  // Get health history
  public getHealthHistory(limit: number = 50): SystemHealthMetrics[] {
    return this.healthHistory.slice(-limit);
  }

  // Get active alerts
  public getActiveAlerts(): SystemAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  // Get all alerts
  public getAllAlerts(limit: number = 100): SystemAlert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Resolve alert by ID
  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      logger.info(LogCategory.SYSTEM, `Alert manually resolved: ${alertId}`);
      return true;
    }
    return false;
  }

  // Clear old resolved alerts
  public clearOldAlerts(maxAge: number = 86400000): void { // 24 hours default
    const cutoff = Date.now() - maxAge;
    
    for (const [alertId, alert] of this.alerts.entries()) {
      if (alert.resolved && alert.timestamp.getTime() < cutoff) {
        this.alerts.delete(alertId);
      }
    }
  }
}

// Global system monitor instance
export const systemMonitor = new SystemMonitor();

// Export health check function for API endpoints
export async function getSystemHealth(): Promise<SystemHealthMetrics> {
  return systemMonitor.performHealthCheck();
}

// Export metrics for monitoring endpoints
export function getMonitoringMetrics() {
  return {
    currentHealth: systemMonitor.getCurrentHealth(),
    healthHistory: systemMonitor.getHealthHistory(10),
    activeAlerts: systemMonitor.getActiveAlerts(),
    allAlerts: systemMonitor.getAllAlerts(50),
  };
}