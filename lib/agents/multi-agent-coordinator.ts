// Multi-Agent Coordinator - Main interface for the multi-agent system
import { 
  Message,
  ConversationContext,
  ConversationState,
  generateId 
} from '../types/agent-types';
import { 
  TaskResult,
  TaskPriority
} from './base-agent';
import { agentRegistry, AgentRegistry } from './agent-registry';
import { logger, LogCategory } from '../logging/comprehensive-logger';
import { errorHandler, ErrorCategory, ErrorSeverity } from '../error-handling/enhanced-error-handler';

export interface MultiAgentResponse {
  success: boolean;
  response: string;
  agentUsed: string;
  processingTime: number;
  confidence: number;
  metadata: {
    routingDecision?: any;
    agentMetrics?: any;
    conversationState?: ConversationState;
    sessionId: string;
    requestId: string;
  };
}

export class MultiAgentCoordinator {
  private agentRegistry: AgentRegistry;
  private conversations: Map<string, ConversationContext> = new Map();

  constructor() {
    this.agentRegistry = agentRegistry;
    
    // Initialize health monitoring
    this.startHealthMonitoring();
    
    logger.info(LogCategory.AGENT, 'Multi-Agent Coordinator initialized');
  }

  public async processMessage(
    messages: Message[],
    sessionId: string = generateId(),
    userId?: string
  ): Promise<MultiAgentResponse> {
    const startTime = Date.now();
    const requestId = generateId();

    try {
      logger.info(LogCategory.AGENT, 'Multi-agent processing started', {
        requestId,
        sessionId,
        userId,
        messageCount: messages.length
      });

      // Get or create conversation context
      const context = this.getOrCreateContext(sessionId, userId, requestId);
      
      // Add new messages to context
      context.messages.push(...messages);
      context.metadata.totalMessages += messages.length;
      context.metadata.lastActivity = new Date();

      // Determine priority based on message content and context
      const priority = this.determinePriority(messages, context);

      // Process through agent registry
      const taskResult = await this.agentRegistry.processMessage(messages, context, priority);

      // Update conversation state based on result
      this.updateConversationState(context, taskResult);

      const processingTime = Date.now() - startTime;
      
      logger.info(LogCategory.AGENT, 'Multi-agent processing completed', {
        requestId,
        sessionId,
        success: taskResult.success,
        agentUsed: taskResult.agentType,
        processingTime
      });

      // Format response
      const response: MultiAgentResponse = {
        success: taskResult.success,
        response: this.formatResponse(taskResult),
        agentUsed: taskResult.agentType,
        processingTime,
        confidence: this.extractConfidence(taskResult),
        metadata: {
          routingDecision: taskResult.metadata?.routingDecision,
          agentMetrics: taskResult.metadata,
          conversationState: context.state,
          sessionId,
          requestId
        }
      };

      // Store assistant response in context
      if (taskResult.success) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.response,
          timestamp: new Date(),
          messageId: generateId(),
          conversationId: context.id
        };
        context.messages.push(assistantMessage);
      }

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error(LogCategory.AGENT, 'Multi-agent processing failed', error as Error, {
        requestId,
        sessionId,
        userId,
        processingTime
      });

      // Return error response
      return {
        success: false,
        response: this.getErrorResponse(error),
        agentUsed: 'error_handler',
        processingTime,
        confidence: 0.0,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          conversationState: ConversationState.ERROR,
          sessionId,
          requestId
        }
      };
    }
  }

  private getOrCreateContext(sessionId: string, userId?: string, requestId?: string): ConversationContext {
    let context = this.conversations.get(sessionId);
    
    if (!context) {
      context = {
        id: generateId(),
        userId,
        sessionId,
        state: ConversationState.INITIATED,
        messages: [],
        taskQueue: [],
        metadata: {
          startTime: new Date(),
          lastActivity: new Date(),
          totalMessages: 0,
          averageResponseTime: 0,
          requestId
        }
      };
      
      this.conversations.set(sessionId, context);
      
      logger.info(LogCategory.AGENT, 'New conversation context created', {
        contextId: context.id,
        sessionId,
        userId
      });
    }

    return context;
  }

  private determinePriority(messages: Message[], context: ConversationContext): TaskPriority {
    const lastMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastMessage) return TaskPriority.MEDIUM;

    const urgentKeywords = ['urgent', 'emergency', 'asap', 'immediately', 'problem', 'issue', 'help', 'stuck'];
    const lowPriorityKeywords = ['general', 'information', 'curious', 'wondering', 'maybe'];

    const messageContent = lastMessage.content.toLowerCase();

    if (urgentKeywords.some(keyword => messageContent.includes(keyword))) {
      return TaskPriority.HIGH;
    }

    if (lowPriorityKeywords.some(keyword => messageContent.includes(keyword))) {
      return TaskPriority.LOW;
    }

    // Consider conversation history
    if (context.metadata.totalMessages > 5) {
      return TaskPriority.HIGH; // Long conversations get priority
    }

    return TaskPriority.MEDIUM;
  }

  private updateConversationState(context: ConversationContext, result: TaskResult): void {
    if (!result.success) {
      context.state = ConversationState.ERROR;
      return;
    }

    // Update state based on agent type and routing decision
    const routingDecision = result.metadata?.routingDecision;
    
    if (routingDecision) {
      switch (routingDecision.intentCategory) {
        case 'travel_matching':
          context.state = ConversationState.PACKAGE_SEARCH;
          break;
        case 'package_customization':
          context.state = ConversationState.CUSTOMIZATION;
          break;
        case 'booking_assistance':
          context.state = ConversationState.BOOKING;
          break;
        default:
          context.state = ConversationState.ACTIVE;
      }
    } else {
      context.state = ConversationState.ACTIVE;
    }

    // Update response time metrics
    if (result.processingTime) {
      const currentAvg = context.metadata.averageResponseTime;
      const messageCount = context.metadata.totalMessages;
      context.metadata.averageResponseTime = 
        ((currentAvg * (messageCount - 1)) + result.processingTime) / messageCount;
    }
  }

  private formatResponse(result: TaskResult): string {
    if (!result.success) {
      return result.metadata?.fallbackResponse || this.getErrorResponse(new Error(result.error || 'Unknown error'));
    }

    return typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
  }

  private extractConfidence(result: TaskResult): number {
    return result.metadata?.confidence || (result.success ? 0.8 : 0.0);
  }

  private getErrorResponse(error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return `🔄 **Service Temporarily Unavailable**

I'm experiencing some technical difficulties right now. Our team has been notified and we're working to resolve this quickly.

🛠️ **Please try:**
• Refreshing the page
• Rephrasing your question  
• Trying again in a few minutes

💫 *Amazing travel experiences are worth the wait!* 🌟

**TripXplo AI - Your Premium Travel Intelligence**`;
  }

  private startHealthMonitoring(): void {
    // Perform health checks every 5 minutes
    setInterval(async () => {
      try {
        const healthResults = await this.agentRegistry.performHealthChecks();
        const unhealthyAgents = Array.from(healthResults.entries())
          .filter(([_, healthy]) => !healthy)
          .map(([agentType, _]) => agentType);

        if (unhealthyAgents.length > 0) {
          logger.warn(LogCategory.AGENT, 'Unhealthy agents detected', {
            unhealthyAgents,
            totalAgents: healthResults.size
          });
        }

        logger.debug(LogCategory.AGENT, 'Health monitoring completed', {
          totalAgents: healthResults.size,
          healthyAgents: healthResults.size - unhealthyAgents.length,
          unhealthyAgents: unhealthyAgents.length
        });

      } catch (error) {
        logger.error(LogCategory.AGENT, 'Health monitoring failed', error as Error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Clean up old conversations every hour
    setInterval(() => {
      this.cleanupOldConversations();
    }, 60 * 60 * 1000); // 1 hour
  }

  private cleanupOldConversations(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let cleanedCount = 0;

    for (const [sessionId, context] of this.conversations) {
      const age = now.getTime() - context.metadata.lastActivity.getTime();
      if (age > maxAge) {
        this.conversations.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(LogCategory.AGENT, 'Old conversations cleaned up', {
        cleanedCount,
        remainingCount: this.conversations.size
      });
    }
  }

  public getSystemStatus(): any {
    return {
      coordinator: {
        activeConversations: this.conversations.size,
        uptime: Date.now() // This would be calculated from start time in production
      },
      agentRegistry: this.agentRegistry.getSystemMetrics()
    };
  }

  // Health check for the coordinator
  public async healthCheck(): Promise<boolean> {
    try {
      const testMessages: Message[] = [{
        role: 'user',
        content: 'Health check test',
        timestamp: new Date(),
        messageId: generateId(),
        conversationId: generateId()
      }];

      const response = await this.processMessage(testMessages, 'health-check-session');
      return response.success;

    } catch (error) {
      logger.error(LogCategory.AGENT, 'Coordinator health check failed', error as Error);
      return false;
    }
  }
}

// Export singleton instance
export const multiAgentCoordinator = new MultiAgentCoordinator();