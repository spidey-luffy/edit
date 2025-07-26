// System Health API Endpoint
import { NextApiRequest, NextApiResponse } from 'next';
import { getSystemHealth, getMonitoringMetrics } from '../../lib/monitoring/system-monitor';
import { logger, LogCategory } from '../../lib/logging/comprehensive-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logger.info(LogCategory.API, 'System health check requested');

    // Get comprehensive system health
    const systemHealth = await getSystemHealth();
    const monitoringMetrics = getMonitoringMetrics();

    // Determine HTTP status based on system health
    let statusCode = 200;
    if (systemHealth.overall === 'degraded') {
      statusCode = 200; // Still operational but with warnings
    } else if (systemHealth.overall === 'unhealthy') {
      statusCode = 503; // Service unavailable
    }

    const response = {
      ...systemHealth,
      monitoring: monitoringMetrics,
      version: '2.1.0-optimized',
    };

    res.status(statusCode).json(response);

  } catch (error) {
    logger.error(LogCategory.API, 'System health check failed', error as Error);
    
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      version: '2.1.0-optimized',
    });
  }
}