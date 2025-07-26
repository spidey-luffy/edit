// Agent Registry - Manages all agents and routing between them
import { 
  BaseAgent, 
  TaskResult,
  TaskPriority
} from './base-agent';
import { 
  AgentType,
  AgentCapability,
  Message,
  ConversationContext,
  generateId 
} from '../types/agent-types';
import { IntentRouterAgent, intentRouterAgent, RouteDecision } from './intent-router-agent';
import { CustomerSupportAgent, customerSupportAgent } from './customer-support-agent';
import { logger, LogCategory } from '../logging/comprehensive-logger';
import { errorHandler, ErrorCategory, ErrorSeverity } from '../error-handling/enhanced-error-handler';

export interface AgentRegistration {
  agent: BaseAgent;
  isActive: boolean;
  lastHealthCheck: Date;
  healthStatus: boolean;
  performanceMetrics: {
    totalTasks: number;
    successRate: number;
    averageResponseTime: number;
    lastTaskTime?: Date;
  };
}

export class AgentRegistry {
  private agents: Map<AgentType, AgentRegistration> = new Map();
  private routerAgent: IntentRouterAgent;
  
  constructor() {
    this.routerAgent = intentRouterAgent;
    this.initializeAgents();
  }

  private initializeAgents(): void {
    // Register Customer Support Agent
    this.registerAgent(customerSupportAgent);
    
    logger.info(LogCategory.AGENT, 'Agent Registry initialized', {
      registeredAgents: Array.from(this.agents.keys()),
      totalAgents: this.agents.size
    });
  }

  public registerAgent(agent: BaseAgent): void {
    const registration: AgentRegistration = {
      agent,
      isActive: true,
      lastHealthCheck: new Date(),
      healthStatus: true,
      performanceMetrics: {
        totalTasks: 0,
        successRate: 1.0,
        averageResponseTime: 0
      }
    };

    this.agents.set(agent.getConfig().type, registration);
    
    logger.info(LogCategory.AGENT, 'Agent registered', {
      agentType: agent.getConfig().type,
      agentId: agent.getConfig().id,
      capabilities: agent.getConfig().capabilities
    });
  }

  public async processMessage(
    messages: Message[],
    context: ConversationContext,
    priority: TaskPriority = TaskPriority.MEDIUM
  ): Promise<TaskResult> {
    const startTime = Date.now();
    const requestId = generateId();

    try {
      logger.info(LogCategory.AGENT, 'Processing message through agent registry', {
        requestId,
        messageCount: messages.length,
        contextId: context.id,
        priority
      });

      // Step 1: Route the message using Intent Router
      const routingResult = await this.routerAgent.processTask(messages, context, priority);
      
      if (!routingResult.success) {
        logger.error(LogCategory.AGENT, 'Intent routing failed', new Error(routingResult.error || 'Unknown routing error'));
        // Fallback to customer support
        return await this.executeAgentTask(AgentType.CUSTOMER_SUPPORT, messages, context, priority);
      }

      const routeDecision = routingResult.result as RouteDecision;
      
      logger.info(LogCategory.AGENT, 'Message routed successfully', {
        requestId,
        targetAgent: routeDecision.targetAgent,
        confidence: routeDecision.confidence,
        reasoning: routeDecision.reasoning
      });

      // Step 2: Execute task with target agent
      const taskResult = await this.executeAgentTask(
        routeDecision.targetAgent,
        messages,
        context,
        routeDecision.priority
      );

      // Step 3: Update performance metrics
      this.updateAgentMetrics(routeDecision.targetAgent, taskResult);

      const totalProcessingTime = Date.now() - startTime;
      logger.info(LogCategory.AGENT, 'Message processing completed', {
        requestId,
        executedAgent: routeDecision.targetAgent,
        success: taskResult.success,
        totalProcessingTime,
        routingTime: routingResult.processingTime,
        executionTime: taskResult.processingTime
      });

      // Enhance result with routing information
      return {
        ...taskResult,
        metadata: {
          ...taskResult.metadata,
          routingDecision: routeDecision,
          routingTime: routingResult.processingTime,
          totalProcessingTime
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(LogCategory.AGENT, 'Agent registry processing failed', error as Error, {
        requestId,
        processingTime
      });

      // Fallback to customer support for any system errors
      try {
        return await this.executeAgentTask(AgentType.CUSTOMER_SUPPORT, messages, context, priority);
      } catch (fallbackError) {
        return {
          success: false,
          taskId: requestId,
          agentId: 'registry',
          agentType: AgentType.CUSTOMER_SUPPORT,
          error: `System error: ${error instanceof Error ? error.message : String(error)}`,
          processingTime,
          metadata: {
            fallbackAttempted: true,
            originalError: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  }

  private async executeAgentTask(
    agentType: AgentType,
    messages: Message[],
    context: ConversationContext,
    priority: TaskPriority
  ): Promise<TaskResult> {
    const registration = this.agents.get(agentType);
    
    if (!registration || !registration.isActive) {
      logger.warn(LogCategory.AGENT, 'Agent not available, falling back', {
        requestedAgent: agentType,
        available: registration?.isActive || false
      });
      
      // Fallback to customer support if target agent is unavailable
      if (agentType !== AgentType.CUSTOMER_SUPPORT) {
        return await this.executeAgentTask(AgentType.CUSTOMER_SUPPORT, messages, context, priority);
      }
      
      throw new Error(`Customer support agent is not available`);
    }

    const startTime = Date.now();
    const result = await registration.agent.processTask(messages, context, priority);
    
    // Update last task time
    registration.performanceMetrics.lastTaskTime = new Date();
    
    return result;
  }

  private updateAgentMetrics(agentType: AgentType, result: TaskResult): void {
    const registration = this.agents.get(agentType);
    if (!registration) return;

    const metrics = registration.performanceMetrics;
    metrics.totalTasks += 1;

    // Update success rate
    const successCount = Math.floor(metrics.successRate * (metrics.totalTasks - 1)) + (result.success ? 1 : 0);
    metrics.successRate = successCount / metrics.totalTasks;

    // Update average response time
    metrics.averageResponseTime = (
      (metrics.averageResponseTime * (metrics.totalTasks - 1)) + result.processingTime
    ) / metrics.totalTasks;

    logger.debug(LogCategory.AGENT, 'Agent metrics updated', {
      agentType,
      totalTasks: metrics.totalTasks,
      successRate: metrics.successRate,
      averageResponseTime: metrics.averageResponseTime
    });
  }

  public async performHealthChecks(): Promise<Map<AgentType, boolean>> {
    const healthResults = new Map<AgentType, boolean>();

    for (const [agentType, registration] of this.agents) {
      try {
        const isHealthy = await registration.agent.healthCheck();
        registration.healthStatus = isHealthy;
        registration.lastHealthCheck = new Date();
        healthResults.set(agentType, isHealthy);

        logger.debug(LogCategory.AGENT, 'Health check completed', {
          agentType,
          healthy: isHealthy
        });

      } catch (error) {
        registration.healthStatus = false;
        registration.lastHealthCheck = new Date();
        healthResults.set(agentType, false);

        logger.error(LogCategory.AGENT, 'Health check failed', error as Error, {
          agentType
        });
      }
    }

    return healthResults;
  }

  public getAgentStatus(agentType: AgentType): AgentRegistration | null {
    return this.agents.get(agentType) || null;
  }

  public getAllAgentStatuses(): Map<AgentType, AgentRegistration> {
    return new Map(this.agents);
  }

  public getSystemMetrics(): any {
    const metrics = {
      totalAgents: this.agents.size,
      activeAgents: 0,
      healthyAgents: 0,
      averageSuccessRate: 0,
      averageResponseTime: 0,
      agentDetails: {} as any
    };

    let totalSuccessRate = 0;
    let totalResponseTime = 0;

    for (const [agentType, registration] of this.agents) {
      if (registration.isActive) metrics.activeAgents++;
      if (registration.healthStatus) metrics.healthyAgents++;

      totalSuccessRate += registration.performanceMetrics.successRate;
      totalResponseTime += registration.performanceMetrics.averageResponseTime;

      metrics.agentDetails[agentType] = {
        isActive: registration.isActive,
        healthStatus: registration.healthStatus,
        totalTasks: registration.performanceMetrics.totalTasks,
        successRate: registration.performanceMetrics.successRate,
        averageResponseTime: registration.performanceMetrics.averageResponseTime,
        lastHealthCheck: registration.lastHealthCheck,
        lastTaskTime: registration.performanceMetrics.lastTaskTime
      };
    }

    metrics.averageSuccessRate = totalSuccessRate / this.agents.size;
    metrics.averageResponseTime = totalResponseTime / this.agents.size;

    return metrics;
  }
}

// Export singleton instance
export const agentRegistry = new AgentRegistry();