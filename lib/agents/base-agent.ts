// Base Agent Framework - Foundation for Multi-Agent System (Updated for Phase 2)
import { 
  AgentType,
  AgentCapability,
  Message,
  ConversationContext,
  generateId 
} from '../types/agent-types';
import { logger, LogCategory } from '../logging/comprehensive-logger';

// Task priority levels
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

// Task result interface
export interface TaskResult {
  success: boolean;
  taskId: string;
  agentId: string;
  agentType: AgentType;
  result?: any;
  error?: string;
  processingTime: number;
  metadata?: Record<string, any>;
}

// Agent configuration interface
export interface AgentConfig {
  id: string;
  type: AgentType;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  version: string;
}

// Abstract base class for all agents in the multi-agent system
export abstract class BaseAgent {
  protected config: AgentConfig;
  private startTime: Date;

  constructor(config: AgentConfig) {
    this.config = config;
    this.startTime = new Date();
  }

  // Abstract method that each agent must implement
  abstract processTask(
    messages: Message[],
    context: ConversationContext,
    priority?: TaskPriority
  ): Promise<TaskResult>;

  // Health check method - can be overridden by specific agents
  async healthCheck(): Promise<boolean> {
    try {
      // Basic health check - can be overridden for more specific checks
      return true;
    } catch (error) {
      logger.error(LogCategory.AGENT, `Health check failed for ${this.config.name}`, error as Error);
      return false;
    }
  }

  // Get agent configuration
  getConfig(): AgentConfig {
    return this.config;
  }

  // Check if agent has specific capability
  hasCapability(capability: AgentCapability): boolean {
    return this.config.capabilities.includes(capability);
  }

  // Get agent uptime
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  // Get agent information
  getInfo(): {
    id: string;
    type: AgentType;
    name: string;
    description: string;
    capabilities: AgentCapability[];
    version: string;
    uptime: number;
  } {
    return {
      id: this.config.id,
      type: this.config.type,
      name: this.config.name,
      description: this.config.description,
      capabilities: this.config.capabilities,
      version: this.config.version,
      uptime: this.getUptime()
    };
  }

  // Utility method for creating error results
  protected createErrorResult(taskId: string, error: string, startTime: number): TaskResult {
    return {
      success: false,
      taskId,
      agentId: this.config.id,
      agentType: this.config.type,
      error,
      processingTime: Date.now() - startTime,
      metadata: {
        errorTimestamp: new Date().toISOString(),
        agentVersion: this.config.version
      }
    };
  }

  // Utility method for creating success results
  protected createSuccessResult(
    taskId: string, 
    result: any, 
    startTime: number, 
    metadata?: Record<string, any>
  ): TaskResult {
    return {
      success: true,
      taskId,
      agentId: this.config.id,
      agentType: this.config.type,
      result,
      processingTime: Date.now() - startTime,
      metadata: {
        completedAt: new Date().toISOString(),
        agentVersion: this.config.version,
        ...metadata
      }
    };
  }
}