// Multi-Agent System Health Check API
import { NextApiRequest, NextApiResponse } from 'next';
import { multiAgentCoordinator } from '../../lib/agents/multi-agent-coordinator';
import { agentRegistry } from '../../lib/agents/agent-registry';
import { logger, LogCategory } from '../../lib/logging/comprehensive-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only GET requests are supported' 
    });
  }

  const startTime = Date.now();

  try {
    // Perform health checks
    const [coordinatorHealth, agentHealthResults] = await Promise.all([
      multiAgentCoordinator.healthCheck(),
      agentRegistry.performHealthChecks()
    ]);

    const systemStatus = multiAgentCoordinator.getSystemStatus();
    const processingTime = Date.now() - startTime;

    // Calculate overall health
    const healthyAgents = Array.from(agentHealthResults.values()).filter(healthy => healthy).length;
    const totalAgents = agentHealthResults.size;
    const overallHealth = coordinatorHealth && (healthyAgents === totalAgents);

    const healthReport = {
      overall: {
        healthy: overallHealth,
        status: overallHealth ? 'operational' : 'degraded',
        uptime: systemStatus.coordinator.uptime,
        processingTime
      },
      coordinator: {
        healthy: coordinatorHealth,
        activeConversations: systemStatus.coordinator.activeConversations
      },
      agents: {
        total: totalAgents,
        healthy: healthyAgents,
        unhealthy: totalAgents - healthyAgents,
        details: Object.fromEntries(
          Array.from(agentHealthResults.entries()).map(([agentType, healthy]) => [
            agentType,
            {
              healthy,
              status: healthy ? 'operational' : 'down',
              ...systemStatus.agentRegistry.agentDetails[agentType]
            }
          ])
        )
      },
      metrics: {
        averageSuccessRate: systemStatus.agentRegistry.averageSuccessRate,
        averageResponseTime: systemStatus.agentRegistry.averageResponseTime,
        totalAgents: systemStatus.agentRegistry.totalAgents,
        activeAgents: systemStatus.agentRegistry.activeAgents,
        healthyAgents: systemStatus.agentRegistry.healthyAgents
      },
      timestamp: new Date().toISOString(),
      version: '2.0.0-multi-agent'
    };

    logger.info(LogCategory.API, 'Health check completed', {
      overallHealth,
      healthyAgents,
      totalAgents,
      processingTime
    });

    // Return appropriate status code
    const statusCode = overallHealth ? 200 : 503;
    res.status(statusCode).json(healthReport);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(LogCategory.API, 'Health check failed', error as Error, {
      processingTime
    });

    res.status(500).json({
      overall: {
        healthy: false,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        processingTime
      },
      timestamp: new Date().toISOString(),
      version: '2.0.0-multi-agent'
    });
  }
}