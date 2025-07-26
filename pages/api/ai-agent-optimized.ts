// Optimized AI Agent API - Enhanced Single-Agent System
import { NextApiRequest, NextApiResponse } from 'next';
import { optimizedAIProcessor } from '../../lib/ai/optimized-ai-processor';
import { 
  errorHandler, 
  createAPIError, 
  createValidationError,
  ErrorSeverity 
} from '../../lib/error-handling/enhanced-error-handler';
import { 
  Message, 
  generateId, 
  validateMessage 
} from '../../lib/types/agent-types';
import { logger, LogCategory } from '../../lib/logging/comprehensive-logger';

// Enhanced API metrics with detailed tracking
interface OptimizedAPIMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalResponseTime: number;
  lastRequestTime: Date | null;
  requestsPerMinute: number;
  errorsByType: Record<string, number>;
  responseTimeDistribution: {
    fast: number; // < 1s
    medium: number; // 1-3s
    slow: number; // > 3s
  };
}

class OptimizedAPIMetricsCollector {
  private metrics: OptimizedAPIMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    totalResponseTime: 0,
    lastRequestTime: null,
    requestsPerMinute: 0,
    errorsByType: {},
    responseTimeDistribution: {
      fast: 0,
      medium: 0,
      slow: 0,
    },
  };

  private requestTimestamps: number[] = [];

  public recordRequest(responseTime: number, success: boolean, errorType?: string): void {
    const now = Date.now();
    
    this.metrics.totalRequests++;
    this.metrics.totalResponseTime += responseTime;
    this.metrics.lastRequestTime = new Date();
    
    // Track request timestamps for RPM calculation
    this.requestTimestamps.push(now);
    this.requestTimestamps = this.requestTimestamps.filter(timestamp => now - timestamp < 60000);
    this.metrics.requestsPerMinute = this.requestTimestamps.length;
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
      if (errorType) {
        this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
      }
    }
    
    // Update response time distribution
    if (responseTime < 1000) {
      this.metrics.responseTimeDistribution.fast++;
    } else if (responseTime < 3000) {
      this.metrics.responseTimeDistribution.medium++;
    } else {
      this.metrics.responseTimeDistribution.slow++;
    }
    
    this.metrics.averageResponseTime = 
      this.metrics.totalResponseTime / this.metrics.totalRequests;
  }

  public getMetrics(): OptimizedAPIMetrics & { successRate: number } {
    const successRate = this.metrics.totalRequests > 0 
      ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
      : 0;

    return {
      ...this.metrics,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  public reset(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
      lastRequestTime: null,
      requestsPerMinute: 0,
      errorsByType: {},
      responseTimeDistribution: {
        fast: 0,
        medium: 0,
        slow: 0,
      },
    };
    this.requestTimestamps = [];
  }
}

const optimizedMetricsCollector = new OptimizedAPIMetricsCollector();

// Enhanced request validation with detailed error reporting
interface OptimizedValidatedRequest {
  messages: Message[];
  sessionId: string;
  userId?: string;
  metadata: {
    userAgent?: string;
    ip?: string;
    timestamp: Date;
    requestId: string;
  };
}

function validateOptimizedRequest(req: NextApiRequest): OptimizedValidatedRequest {
  const requestId = generateId();
  
  try {
    const { messages, sessionId, userId } = req.body;

    // Validate required fields
    if (!messages || !Array.isArray(messages)) {
      throw createValidationError('Messages array is required and must be an array', {
        body: req.body,
        requestId,
      });
    }

    if (messages.length === 0) {
      throw createValidationError('Messages array cannot be empty', {
        body: req.body,
        requestId,
      });
    }

    if (messages.length > 50) {
      throw createValidationError('Too many messages in conversation (max 50)', {
        messageCount: messages.length,
        requestId,
      });
    }

    // Validate each message with detailed error reporting
    const validatedMessages: Message[] = messages.map((msg, index) => {
      try {
        // Check message structure
        if (!msg || typeof msg !== 'object') {
          throw new Error(`Message at index ${index} is not a valid object`);
        }

        if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
          throw new Error(`Message at index ${index} has invalid role: ${msg.role}`);
        }

        if (!msg.content || typeof msg.content !== 'string') {
          throw new Error(`Message at index ${index} has invalid content`);
        }

        if (msg.content.length > 10000) {
          throw new Error(`Message at index ${index} content too long (max 10000 characters)`);
        }

        return validateMessage({
          ...msg,
          messageId: msg.messageId || generateId(),
          conversationId: sessionId || generateId(),
          timestamp: msg.timestamp || new Date(),
        });
      } catch (error) {
        throw createValidationError(
          `Invalid message at index ${index}: ${error instanceof Error ? error.message : String(error)}`,
          { messageIndex: index, message: msg, requestId }
        );
      }
    });

    // Validate session ID
    const validatedSessionId = sessionId || generateId();
    if (typeof validatedSessionId !== 'string' || validatedSessionId.length > 100) {
      throw createValidationError('Invalid session ID', { sessionId, requestId });
    }

    // Validate user ID if provided
    if (userId && (typeof userId !== 'string' || userId.length > 100)) {
      throw createValidationError('Invalid user ID', { userId, requestId });
    }

    return {
      messages: validatedMessages,
      sessionId: validatedSessionId,
      userId,
      metadata: {
        userAgent: req.headers['user-agent'],
        ip: req.headers['x-forwarded-for']?.toString() || req.connection.remoteAddress,
        timestamp: new Date(),
        requestId,
      },
    };
  } catch (error) {
    logger.error(LogCategory.API, 'Request validation failed', error as Error, { requestId });
    throw error;
  }
}

// Enhanced rate limiting with different tiers
class OptimizedRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number = 60000; // 1 minute
  private readonly limits = {
    default: 30, // 30 requests per minute
    premium: 100, // 100 requests per minute for premium users
    burst: 5, // 5 requests per 10 seconds for burst protection
  };

  public isAllowed(identifier: string, tier: 'default' | 'premium' = 'default'): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    const burstRequests = validRequests.filter(time => now - time < 10000); // Last 10 seconds
    
    const limit = this.limits[tier];
    const burstLimit = this.limits.burst;
    
    // Check burst protection
    if (burstRequests.length >= burstLimit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: Math.min(...burstRequests) + 10000,
      };
    }
    
    // Check main rate limit
    if (validRequests.length >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: Math.min(...validRequests) + this.windowMs,
      };
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return {
      allowed: true,
      remaining: limit - validRequests.length,
      resetTime: now + this.windowMs,
    };
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [identifier, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => now - time < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validRequests);
      }
    }
  }

  public getStats(): { totalClients: number; totalRequests: number } {
    let totalRequests = 0;
    for (const requests of this.requests.values()) {
      totalRequests += requests.length;
    }
    return {
      totalClients: this.requests.size,
      totalRequests,
    };
  }
}

const optimizedRateLimiter = new OptimizedRateLimiter();

// Cleanup timers
setInterval(() => {
  optimizedRateLimiter.cleanup();
}, 60000); // Every minute

// Main optimized API handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  let success = false;
  let errorType = 'unknown';

  // Set enhanced CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
  res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Remaining, X-RateLimit-Reset');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    errorType = 'method_not_allowed';
    const error = createAPIError('Method not allowed', {
      method: req.method,
      url: req.url,
    });
    
    optimizedMetricsCollector.recordRequest(Date.now() - startTime, false, errorType);
    
    return res.status(405).json({ 
      error: 'Method not allowed',
      errorId: error.id,
      allowedMethods: ['POST'],
      timestamp: new Date().toISOString(),
    });
  }

  let validatedRequest: OptimizedValidatedRequest;

  try {
    logger.info(LogCategory.API, 'Optimized AI Agent API request received', {
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
    });
    
    // Enhanced rate limiting check
    const clientId = req.headers['x-forwarded-for']?.toString() || 
                    req.connection.remoteAddress || 
                    'unknown';
    
    const rateLimitResult = optimizedRateLimiter.isAllowed(clientId);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime.toString());
    
    if (!rateLimitResult.allowed) {
      errorType = 'rate_limit_exceeded';
      const error = createAPIError('Rate limit exceeded', {
        clientId,
        limit: '30 requests per minute',
        resetTime: rateLimitResult.resetTime,
      });
      
      optimizedMetricsCollector.recordRequest(Date.now() - startTime, false, errorType);
      
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
        errorId: error.id,
        retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
        remaining: rateLimitResult.remaining,
        resetTime: new Date(rateLimitResult.resetTime).toISOString(),
        timestamp: new Date().toISOString(),
      });
    }

    // Validate request with enhanced error handling
    validatedRequest = validateOptimizedRequest(req);
    
    logger.info(LogCategory.API, 'Request validation successful', {
      requestId: validatedRequest.metadata.requestId,
      messageCount: validatedRequest.messages.length,
      sessionId: validatedRequest.sessionId,
    });

    // Process with optimized AI
    const response = await optimizedAIProcessor.processWithOptimizedAI(
      validatedRequest.messages,
      validatedRequest.sessionId,
      validatedRequest.userId
    );

    logger.info(LogCategory.API, 'AI processing completed successfully', {
      requestId: validatedRequest.metadata.requestId,
      responseLength: response.length,
    });
    
    success = true;
    const responseTime = Date.now() - startTime;
    
    // Record successful metrics
    optimizedMetricsCollector.recordRequest(responseTime, true);
    
    // Get AI performance metrics
    const aiMetrics = optimizedAIProcessor.getPerformanceMetrics();
    
    // Return enhanced successful response
    res.status(200).json({
      response,
      metadata: {
        processingTime: responseTime,
        sessionId: validatedRequest.sessionId,
        requestId: validatedRequest.metadata.requestId,
        timestamp: new Date().toISOString(),
        version: '2.1.0-optimized',
        performance: {
          responseTime,
          cacheHit: aiMetrics.cacheHitRate > 0,
        },
      },
      rateLimit: {
        remaining: rateLimitResult.remaining,
        resetTime: new Date(rateLimitResult.resetTime).toISOString(),
      },
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error(LogCategory.API, 'Optimized AI Agent API error', error as Error, {
      requestId: validatedRequest?.metadata?.requestId,
      responseTime,
    });
    
    // Determine error type for metrics
    if (error && typeof error === 'object' && 'category' in error) {
      errorType = (error as any).category;
    } else if (error instanceof Error) {
      if (error.message.includes('validation')) {
        errorType = 'validation_error';
      } else if (error.message.includes('timeout')) {
        errorType = 'timeout_error';
      } else if (error.message.includes('network')) {
        errorType = 'network_error';
      } else {
        errorType = 'processing_error';
      }
    }
    
    // Record failed request
    optimizedMetricsCollector.recordRequest(responseTime, false, errorType);
    
    // Handle different types of errors with enhanced recovery
    let statusCode = 500;
    let errorResponse: any = {
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
      requestId: validatedRequest?.metadata?.requestId,
    };

    if (error && typeof error === 'object' && 'category' in error) {
      // This is an enhanced error
      const enhancedError = error as any;
      
      // Try to handle the error
      const recovery = await errorHandler.handleError(enhancedError);
      
      if (recovery?.userGuidance) {
        statusCode = 400;
        errorResponse = {
          error: recovery.message,
          type: 'validation_error',
          errorId: enhancedError.id,
          guidance: true,
          timestamp: new Date().toISOString(),
        };
      } else if (recovery?.fallback || recovery?.safeResponse) {
        statusCode = 200; // Return successful response with fallback
        errorResponse = {
          response: recovery.message,
          metadata: {
            processingTime: responseTime,
            fallback: true,
            timestamp: new Date().toISOString(),
            requestId: validatedRequest?.metadata?.requestId,
          },
        };
      } else {
        // No recovery possible
        switch (enhancedError.category) {
          case 'validation':
            statusCode = 400;
            errorResponse.error = 'Invalid request data';
            errorResponse.details = enhancedError.message;
            break;
          case 'rate_limit':
            statusCode = 429;
            errorResponse.error = 'Rate limit exceeded';
            errorResponse.retryAfter = 60;
            break;
          case 'network':
          case 'api':
            statusCode = 503;
            errorResponse.error = 'Service temporarily unavailable';
            break;
          default:
            statusCode = 500;
            errorResponse.error = 'Internal server error';
        }
        
        errorResponse.errorId = enhancedError.id;
        errorResponse.type = enhancedError.category;
      }
    } else {
      // Handle regular errors
      const enhancedError = createAPIError(
        error instanceof Error ? error.message : String(error),
        {
          url: req.url,
          method: req.method,
          userAgent: req.headers['user-agent'],
          requestId: validatedRequest?.metadata?.requestId,
        }
      );
      
      errorResponse.errorId = enhancedError.id;
      errorResponse.type = errorType;
    }

    res.status(statusCode).json(errorResponse);
  }
}

// Enhanced health check for optimized system
export async function optimizedHealthCheck(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiMetrics = optimizedMetricsCollector.getMetrics();
    const aiMetrics = optimizedAIProcessor.getPerformanceMetrics();
    const rateLimitStats = optimizedRateLimiter.getStats();
    const errorStats = errorHandler.getErrorStats();
    
    // Check database connection
    let dbStatus = 'unknown';
    try {
      const { getAccessToken } = await import('../../lib/api/tripxplo');
      await getAccessToken();
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'disconnected';
    }
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.1.0-optimized',
      uptime: Math.floor(process.uptime()),
      database: {
        tripxplo: dbStatus,
      },
      api: {
        ...apiMetrics,
        rateLimiting: rateLimitStats,
      },
      ai: aiMetrics,
      errors: errorStats,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024),
        },
        cpu: process.cpuUsage(),
      },
    };

    // Determine overall health status
    let overallStatus = 'healthy';
    
    if (dbStatus === 'disconnected') {
      overallStatus = 'degraded';
    }
    
    if (apiMetrics.successRate < 95) {
      overallStatus = 'degraded';
    }
    
    if (apiMetrics.averageResponseTime > 5000) {
      overallStatus = 'degraded';
    }

    const totalErrors = Object.values(errorStats).reduce((sum, count) => sum + count, 0);
    if (totalErrors > 100) {
      overallStatus = 'degraded';
    }

    health.status = overallStatus;
    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      version: '2.1.0-optimized',
    });
  }
}

// Enhanced metrics endpoint
export async function getOptimizedMetrics(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiMetrics = optimizedMetricsCollector.getMetrics();
    const aiMetrics = optimizedAIProcessor.getPerformanceMetrics();
    const rateLimitStats = optimizedRateLimiter.getStats();
    const errorStats = errorHandler.getErrorStats();
    const recentErrors = errorHandler.getRecentErrors(10);
    
    const metrics = {
      timestamp: new Date().toISOString(),
      version: '2.1.0-optimized',
      api: {
        ...apiMetrics,
        rateLimiting: rateLimitStats,
      },
      ai: aiMetrics,
      errors: {
        summary: errorStats,
        totalErrors: Object.values(errorStats).reduce((sum, count) => sum + count, 0),
        recentErrors: recentErrors.map(error => ({
          id: error.id,
          category: error.category,
          severity: error.severity,
          message: error.message.substring(0, 100),
          timestamp: error.context?.timestamp,
          handled: error.handled,
        })),
      },
      system: {
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    res.status(200).json(metrics);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve optimized metrics',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
}