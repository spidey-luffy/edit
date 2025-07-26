// Intent Router Agent - Intelligently routes user queries to specialized agents
import OpenAI from "openai";
import { 
  BaseAgent, 
  AgentType, 
  AgentCapability,
  Message,
  ConversationContext,
  TaskResult,
  TaskPriority
} from './base-agent';
import { 
  TripIntent, 
  TripIntentSchema,
  validateTripIntent,
  generateId 
} from '../types/agent-types';
import { logger, LogCategory } from '../logging/comprehensive-logger';
import { errorHandler, ErrorCategory, ErrorSeverity } from '../error-handling/enhanced-error-handler';

// Intent categories for routing
export enum IntentCategory {
  CUSTOMER_SUPPORT = 'customer_support',
  TRAVEL_MATCHING = 'travel_matching', 
  PACKAGE_CUSTOMIZATION = 'package_customization',
  BOOKING_ASSISTANCE = 'booking_assistance',
  GENERAL_INQUIRY = 'general_inquiry',
  UNKNOWN = 'unknown'
}

export interface RouteDecision {
  targetAgent: AgentType;
  intentCategory: IntentCategory;
  confidence: number;
  reasoning: string;
  extractedData: any;
  priority: TaskPriority;
}

export class IntentRouterAgent extends BaseAgent {
  private openai: OpenAI;
  
  constructor() {
    super({
      id: generateId(),
      type: AgentType.INTENT_ROUTER,
      name: 'Intent Router',
      description: 'Routes user queries to appropriate specialized agents',
      capabilities: [
        AgentCapability.INTENT_ANALYSIS,
        AgentCapability.QUERY_ROUTING,
        AgentCapability.CONTEXT_ANALYSIS
      ],
      version: '2.0.0'
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 15000,
      maxRetries: 2,
    });
  }

  async processTask(
    messages: Message[],
    context: ConversationContext,
    priority: TaskPriority = TaskPriority.MEDIUM
  ): Promise<TaskResult> {
    const startTime = Date.now();
    const taskId = generateId();

    try {
      logger.info(LogCategory.AGENT, `Intent Router processing task`, {
        taskId,
        messageCount: messages.length,
        priority,
        contextId: context.id
      });

      // Extract the latest user message
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (!lastUserMessage) {
        return this.createErrorResult(taskId, 'No user message found', startTime);
      }

      // Analyze intent and route to appropriate agent
      const routeDecision = await this.analyzeAndRoute(
        lastUserMessage.content,
        messages,
        context
      );

      // Update context with routing decision
      context.metadata.lastRoutingDecision = routeDecision;
      context.metadata.lastActivity = new Date();

      const processingTime = Date.now() - startTime;
      logger.info(LogCategory.AGENT, `Intent routing completed`, {
        taskId,
        targetAgent: routeDecision.targetAgent,
        confidence: routeDecision.confidence,
        processingTime
      });

      return {
        success: true,
        taskId,
        agentId: this.config.id,
        agentType: this.config.type,
        result: routeDecision,
        processingTime,
        metadata: {
          confidence: routeDecision.confidence,
          targetAgent: routeDecision.targetAgent,
          intentCategory: routeDecision.intentCategory
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(LogCategory.AGENT, 'Intent routing failed', error as Error, {
        taskId,
        contextId: context.id,
        processingTime
      });

      return this.createErrorResult(taskId, error instanceof Error ? error.message : String(error), startTime);
    }
  }

  private async analyzeAndRoute(
    userMessage: string,
    conversationHistory: Message[],
    context: ConversationContext
  ): Promise<RouteDecision> {
    const startTime = Date.now();

    try {
      // Build conversation context for analysis
      const historyText = conversationHistory
        .slice(-6) // Last 6 messages for context
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const routingPrompt = this.buildRoutingPrompt(userMessage, historyText, context);

      const response = await this.openai.chat.completions.create({
        messages: [
          { 
            role: 'system', 
            content: `You are an intelligent intent router for TripXplo AI travel assistant. 
            Analyze user messages and route them to the most appropriate specialized agent.
            
            Available Agents:
            1. CUSTOMER_SUPPORT - General questions, FAQ, help, complaints, basic info
            2. TRAVEL_MATCHING - Package search, destination suggestions, travel preferences
            3. PACKAGE_CUSTOMIZATION - Trip modifications, budget planning, itinerary changes
            4. BOOKING_ASSISTANCE - Payment, booking confirmation, reservation help
            
            Respond with a JSON object containing:
            {
              "targetAgent": "CUSTOMER_SUPPORT|TRAVEL_MATCHING|PACKAGE_CUSTOMIZATION|BOOKING_ASSISTANCE",
              "intentCategory": "customer_support|travel_matching|package_customization|booking_assistance|general_inquiry",
              "confidence": 0.0-1.0,
              "reasoning": "Brief explanation of routing decision",
              "extractedData": {
                "destination": null|string,
                "duration": null|number,
                "budget": null|object,
                "travelers": null|object,
                "urgency": "low|medium|high"
              },
              "priority": "LOW|MEDIUM|HIGH"
            }`
          },
          { 
            role: 'user', 
            content: routingPrompt 
          }
        ],
        model: 'gpt-4o',
        temperature: 0.1,
        max_tokens: 500,
      });

      const content = response.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty response from intent analysis');
      }

      // Parse and validate response
      const parsed = JSON.parse(content);
      const routeDecision: RouteDecision = {
        targetAgent: this.mapStringToAgentType(parsed.targetAgent),
        intentCategory: parsed.intentCategory as IntentCategory,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'No reasoning provided',
        extractedData: parsed.extractedData || {},
        priority: this.mapStringToPriority(parsed.priority)
      };

      const processingTime = Date.now() - startTime;
      logger.logAIInteraction(
        'intent_routing',
        processingTime,
        true,
        context.userId,
        context.sessionId,
        context.id,
        { 
          targetAgent: routeDecision.targetAgent,
          confidence: routeDecision.confidence 
        }
      );

      return routeDecision;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(LogCategory.AI, 'Intent routing analysis failed', error as Error, {
        userMessage: userMessage.substring(0, 100),
        processingTime
      });

      logger.logAIInteraction(
        'intent_routing',
        processingTime,
        false,
        context.userId,
        context.sessionId,
        context.id,
        { error: (error as Error).message }
      );

      // Fallback to customer support for general queries
      return {
        targetAgent: AgentType.CUSTOMER_SUPPORT,
        intentCategory: IntentCategory.GENERAL_INQUIRY,
        confidence: 0.3,
        reasoning: 'Fallback due to analysis error',
        extractedData: {},
        priority: TaskPriority.MEDIUM
      };
    }
  }

  private buildRoutingPrompt(userMessage: string, historyText: string, context: ConversationContext): string {
    return `
Current User Message: "${userMessage}"

Conversation History:
${historyText}

User Context:
- Session ID: ${context.sessionId}
- Previous Intent: ${context.currentIntent?.intent || 'none'}
- Message Count: ${context.metadata.totalMessages}

Please analyze this message and determine the best agent to handle it.

Consider:
1. Is this a general question or request for help? → CUSTOMER_SUPPORT
2. Is the user looking for travel packages or destinations? → TRAVEL_MATCHING  
3. Is the user modifying existing trip plans or customizing? → PACKAGE_CUSTOMIZATION
4. Is the user ready to book or having booking issues? → BOOKING_ASSISTANCE

Provide routing decision with high confidence and clear reasoning.
    `.trim();
  }

  private mapStringToAgentType(agentString: string): AgentType {
    switch (agentString?.toUpperCase()) {
      case 'CUSTOMER_SUPPORT':
        return AgentType.CUSTOMER_SUPPORT;
      case 'TRAVEL_MATCHING':
        return AgentType.TRAVEL_MATCHING;
      case 'PACKAGE_CUSTOMIZATION':
        return AgentType.PACKAGE_CUSTOMIZATION;
      case 'BOOKING_ASSISTANCE':
        return AgentType.BOOKING_ASSISTANCE;
      default:
        return AgentType.CUSTOMER_SUPPORT; // Safe fallback
    }
  }

  private mapStringToPriority(priorityString: string): TaskPriority {
    switch (priorityString?.toUpperCase()) {
      case 'HIGH':
        return TaskPriority.HIGH;
      case 'LOW':
        return TaskPriority.LOW;
      default:
        return TaskPriority.MEDIUM;
    }
  }

  private createErrorResult(taskId: string, errorMessage: string, startTime: number): TaskResult {
    return {
      success: false,
      taskId,
      agentId: this.config.id,
      agentType: this.config.type,
      error: errorMessage,
      processingTime: Date.now() - startTime,
      metadata: {
        fallbackAgent: AgentType.CUSTOMER_SUPPORT
      }
    };
  }

  // Health check for the router
  async healthCheck(): Promise<boolean> {
    try {
      // Test with a simple routing request
      const testMessages: Message[] = [{
        role: 'user',
        content: 'Hello, I need help with travel packages',
        timestamp: new Date(),
        messageId: generateId(),
        conversationId: generateId()
      }];

      const testContext: ConversationContext = {
        id: generateId(),
        sessionId: generateId(),
        state: 'initiated' as any,
        messages: testMessages,
        taskQueue: [],
        metadata: {
          startTime: new Date(),
          lastActivity: new Date(),
          totalMessages: 1,
          averageResponseTime: 0
        }
      };

      const result = await this.processTask(testMessages, testContext, TaskPriority.LOW);
      return result.success;

    } catch (error) {
      logger.error(LogCategory.AGENT, 'Intent Router health check failed', error as Error);
      return false;
    }
  }
}

// Export singleton instance
export const intentRouterAgent = new IntentRouterAgent();