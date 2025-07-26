// Optimized AI Processor - Enhanced Single-Agent System
import OpenAI from "openai";
import { 
  Message, 
  TripIntent, 
  TripIntentSchema, 
  ConversationContext, 
  ConversationState,
  generateId,
  validateTripIntent 
} from '../types/agent-types';
import { 
  errorHandler, 
  createAPIError, 
  createValidationError, 
  createSystemError,
  ErrorCategory,
  ErrorSeverity 
} from '../error-handling/enhanced-error-handler';
import { logger, LogCategory } from '../logging/comprehensive-logger';
import { retryAIOperation } from '../error-handling/advanced-retry-mechanisms';
import { toolMiddleware } from '../middleware/tool-middleware';
import { executeEnhancedTool } from '../tools/enhanced-tool-integration';

// Enhanced OpenAI client with optimized configuration
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 3,
});

// Optimized AI configuration
interface OptimizedAIConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  retryAttempts: number;
  enableCaching: boolean;
  enableMetrics: boolean;
}

const optimizedConfig: OptimizedAIConfig = {
  model: process.env.AI_MODEL || "gpt-4o",
  temperature: parseFloat(process.env.AI_TEMPERATURE || '0.6'),
  maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
  timeout: parseInt(process.env.AI_TIMEOUT || '30000'),
  retryAttempts: 3,
  enableCaching: true,
  enableMetrics: true,
};

// Response cache for optimization
interface CacheEntry {
  response: string;
  timestamp: Date;
  ttl: number;
}

export class OptimizedAIProcessor {
  private conversations: Map<string, ConversationContext> = new Map();
  private responseCache: Map<string, CacheEntry> = new Map();
  private performanceMetrics: {
    totalRequests: number;
    successfulRequests: number;
    averageResponseTime: number;
    cacheHitRate: number;
    errorRate: number;
  } = {
    totalRequests: 0,
    successfulRequests: 0,
    averageResponseTime: 0,
    cacheHitRate: 0,
    errorRate: 0,
  };

  constructor() {
    // Start cache cleanup timer
    setInterval(() => this.cleanupCache(), 300000); // 5 minutes
    
    // Register error handlers
    errorHandler.onError((error) => {
      if (error.severity === ErrorSeverity.CRITICAL) {
        logger.critical(LogCategory.AI, 'Critical AI error detected', undefined, {
          errorId: error.id,
          category: error.category,
        });
      }
    });
  }

  // Main processing function with comprehensive optimization
  public async processWithOptimizedAI(
    messages: Message[],
    sessionId: string = generateId(),
    userId?: string
  ): Promise<string> {
    const startTime = Date.now();
    let conversationId: string = '';
    
    try {
      // Get or create conversation context
      const context = this.getOrCreateContext(sessionId, userId);
      conversationId = context.id;

      logger.info(LogCategory.AI, 'Starting optimized AI processing', {
        messageCount: messages.length,
        sessionId,
        userId,
        conversationId,
      });
      
      // Update metrics
      this.performanceMetrics.totalRequests++;
      
      // Add messages to context
      context.messages.push(...messages);
      context.metadata.totalMessages += messages.length;
      
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (!lastUserMessage) {
        return this.getWelcomeMessage();
      }

      // Check cache first
      const cacheKey = this.generateCacheKey(messages, context);
      const cachedResponse = this.getFromCache(cacheKey);
      
      if (cachedResponse) {
        logger.info(LogCategory.AI, 'Cache hit for AI processing', { cacheKey });
        this.performanceMetrics.cacheHitRate = 
          (this.performanceMetrics.cacheHitRate * (this.performanceMetrics.totalRequests - 1) + 1) / 
          this.performanceMetrics.totalRequests;
        return cachedResponse;
      }

      // Update conversation state
      context.state = ConversationState.INTENT_ANALYSIS;
      
      // Analyze user intent with enhanced error handling
      const intent = await this.analyzeUserIntentOptimized(messages, context);
      context.currentIntent = intent;
      
      logger.info(LogCategory.AI, 'Intent analysis completed', {
        intent: intent.intent,
        confidence: intent.confidence,
        destination: intent.destination,
        duration: intent.duration,
      });

      // Route to appropriate handler based on intent
      let result: string;
      
      switch (intent.intent) {
        case 'get_packages':
          context.state = ConversationState.PACKAGE_SEARCH;
          result = await this.handlePackageRequestOptimized(intent, context);
          break;
        
        case 'get_details':
          context.state = ConversationState.PACKAGE_DETAILS;
          result = await this.handlePackageDetailsOptimized(intent, context);
          break;
        
        case 'get_pricing':
          context.state = ConversationState.PACKAGE_DETAILS;
          result = await this.handlePricingRequestOptimized(intent, context);
          break;
        
        case 'ask_general':
          result = await this.handleGeneralQueryOptimized(messages, context);
          break;
        
        default:
          result = await this.handleGeneralQueryOptimized(messages, context);
      }

      // Cache successful results
      if (optimizedConfig.enableCaching && result) {
        this.addToCache(cacheKey, result, 300000); // 5 minutes TTL
      }

      // Update context metrics
      const processingTime = Date.now() - startTime;
      context.metadata.lastActivity = new Date();
      context.metadata.averageResponseTime = 
        ((context.metadata.averageResponseTime * (context.metadata.totalMessages - 1)) + processingTime) / 
        context.metadata.totalMessages;

      // Update performance metrics
      this.performanceMetrics.successfulRequests++;
      this.performanceMetrics.averageResponseTime = 
        ((this.performanceMetrics.averageResponseTime * (this.performanceMetrics.totalRequests - 1)) + processingTime) / 
        this.performanceMetrics.totalRequests;

      logger.info(LogCategory.AI, 'AI processing completed successfully', {
        processingTime,
        responseLength: result.length,
        cacheKey,
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Update error metrics
      this.performanceMetrics.errorRate = 
        (this.performanceMetrics.errorRate * (this.performanceMetrics.totalRequests - 1) + 1) / 
        this.performanceMetrics.totalRequests;

      logger.error(LogCategory.AI, 'Optimized AI processing failed', error as Error, {
        sessionId,
        userId,
        conversationId,
        processingTime,
        messageCount: messages.length,
      });
      
      // Create enhanced error
      const enhancedError = errorHandler.createEnhancedError(
        error instanceof Error ? error : new Error(String(error)),
        ErrorCategory.SYSTEM,
        ErrorSeverity.HIGH,
        {
          sessionId,
          userId,
          conversationId,
          processingTime,
          messageCount: messages.length,
        }
      );

      // Try to handle the error
      const recovery = await errorHandler.handleError(enhancedError);
      
      if (recovery?.fallback || recovery?.safeResponse) {
        return recovery.message;
      }

      // Fallback to safe response
      return this.getSafeErrorResponse();
    }
  }

  // Enhanced intent analysis with optimized prompts
  private async analyzeUserIntentOptimized(
    messages: Message[], 
    context: ConversationContext
  ): Promise<TripIntent> {
    const startTime = Date.now();
    
    try {
      logger.debug(LogCategory.AI, 'Starting optimized intent analysis', {
        messageCount: messages.length,
        conversationId: context.id,
      });

      const conversationHistory = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      
      // Optimized intent analysis prompt
      const systemPrompt = `You are TripXplo AI's advanced intent analyzer with deep travel domain expertise.

🎯 **CORE MISSION:**
Analyze user messages with contextual awareness and travel psychology to extract precise, actionable intent data.

**Intent Categories:**
- "get_packages": User wants to find/book travel packages, trips, tours, holidays
- "get_details": User asks for specific package details, itineraries, inclusions
- "get_pricing": User specifically wants pricing, costs, budget information
- "ask_general": General travel advice, weather, visa, destination info
- "unknown": Intent unclear or unrelated to travel

**Enhanced Output Structure:**
{
  "intent": "primary_intent",
  "confidence": 0.85,
  "destination": "destination_name_or_null",
  "duration": number_or_null,
  "planType": "plan_type_or_null",
  "budget": {
    "min": number_or_null,
    "max": number_or_null,
    "currency": "INR"
  },
  "travelers": {
    "adults": 1,
    "children": 0,
    "rooms": 1
  },
  "preferences": ["preference_list"],
  "urgency": "low|medium|high"
}

**Quality Standards:**
- Confidence scores must be realistic (0.0-1.0)
- Unknown intent if confidence < 0.5
- Consider conversation context and user behavior
- Extract implicit preferences and requirements

Return ONLY the JSON object.`;

      const userPrompt = `Analyze this travel conversation with advanced contextual understanding:

**Conversation History:**
${conversationHistory}

**Previous Context:**
${context.currentIntent ? JSON.stringify(context.currentIntent) : 'None'}

Extract comprehensive travel intent with high accuracy. Return ONLY the JSON object.`;

      const response = await retryAIOperation(
        async () => {
          return await openai.chat.completions.create({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            model: optimizedConfig.model,
            temperature: 0.1,
            max_tokens: 600,
          });
        },
        'optimized_intent_analysis',
        { maxAttempts: 2 }
      );

      const content = response.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty response from intent analysis');
      }

      // Parse and validate the response
      const parsed = JSON.parse(content);
      const validatedIntent = validateTripIntent(parsed);
      
      const duration = Date.now() - startTime;
      logger.info(LogCategory.AI, 'Intent analysis completed', {
        duration,
        confidence: validatedIntent.confidence,
        intent: validatedIntent.intent,
      });

      return validatedIntent;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(LogCategory.AI, 'Optimized intent analysis failed', error as Error, {
        conversationId: context.id,
        messageCount: messages.length,
        duration,
      });
      
      // Return default intent with low confidence
      return {
        intent: 'unknown',
        destination: undefined,
        duration: undefined,
        planType: undefined,
        budget: { min: undefined, max: undefined, currency: 'INR' },
        travelers: { adults: 1, children: 0, rooms: 1 },
        preferences: [],
        urgency: 'medium',
        confidence: 0.3,
      };
    }
  }

  // Optimized package request handling
  private async handlePackageRequestOptimized(
    intent: TripIntent, 
    context: ConversationContext
  ): Promise<string> {
    const startTime = Date.now();
    
    try {
      const { destination, duration, planType } = intent;
      
      logger.info(LogCategory.AI, 'Processing optimized package request', {
        destination,
        duration,
        planType,
        conversationId: context.id,
      });
      
      // If we have all required info, fetch packages
      if (typeof destination === 'string' && typeof duration === 'number') {
        logger.info(LogCategory.TOOL, `Fetching packages: ${destination}, ${duration} days, ${planType || 'any'}`);
        
        // Use enhanced tool execution with high priority
        const toolResult = await executeEnhancedTool(
          'get_packages',
          { 
            search: destination,
            days: duration
          },
          {
            sessionId: context.sessionId,
            userId: context.userId,
            priority: intent.urgency === 'high' ? 'high' : 'medium',
            enableCache: true,
          }
        );
        
        if (!toolResult.success || !toolResult.data || !toolResult.data.packages || toolResult.data.packages.length === 0) {
          return await this.generateNoPackagesResponseOptimized(destination, duration, planType, context);
        }
        
        return await this.formatPackagesResponseOptimized(toolResult.data.packages, destination, duration, planType, context);
      }
      
      // If we don't have the required info, ask for it
      const missingInfo = [];
      if (!destination) missingInfo.push('destination');
      if (!duration) missingInfo.push('duration');
      return await this.generateFollowUpQuestionOptimized(intent, missingInfo, context);

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(LogCategory.AI, 'Optimized package request failed', error as Error, {
        conversationId: context.id,
        sessionId: context.sessionId,
        intent: intent,
        duration,
      });

      const enhancedError = createAPIError(
        `Package request failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          conversationId: context.id,
          sessionId: context.sessionId,
          intent: intent,
        }
      );

      const recovery = await errorHandler.handleError(enhancedError);
      
      if (recovery?.fallback) {
        return recovery.message;
      }

      return "🔄 **Service Temporarily Unavailable**\n\nI'm having trouble accessing our travel database right now. Please try again in a moment!\n\n✨ *Great travel experiences are worth the wait* 🌟";
    }
  }

  // Optimized general query handling
  private async handleGeneralQueryOptimized(
    messages: Message[], 
    context: ConversationContext
  ): Promise<string> {
    const startTime = Date.now();
    
    try {
      logger.info(LogCategory.AI, 'Processing optimized general query', {
        conversationId: context.id,
        messageCount: messages.length,
      });
      
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      
      // Optimized general query prompt
      const systemPrompt = `You are TripXplo AI, a world-class travel consultant with extensive global knowledge.

🎯 **EXPERTISE AREAS:**
- Global destination intelligence and insider knowledge
- Travel planning strategies and optimization
- Cultural insights and local customs
- Budget optimization and value maximization
- Safety guidelines and travel advisories
- Visa requirements and documentation
- Seasonal travel patterns and weather insights

🧠 **RESPONSE FRAMEWORK:**
- Lead with direct answer to user's specific question
- Provide context and background for better understanding
- Offer actionable insights and practical recommendations
- Include relevant warnings or considerations
- Suggest related topics or follow-up questions

**Communication Style:**
- Clear, engaging, and authoritative language
- Professional confidence without arrogance
- Include emotional intelligence and empathy
- Balance thoroughness with conciseness
- Use appropriate emojis for visual appeal

**Response Structure:**
1. Direct answer to the specific question
2. Important context and considerations
3. Practical recommendations and tips
4. Related insights and additional value
5. Gentle guidance toward TripXplo services when relevant

Keep responses under 400 words and maintain TripXplo brand voice.`;

      const userPrompt = `Provide expert travel guidance for this query:

**User Question:** ${lastUserMessage?.content || ''}

**Conversation Context:** ${context.messages.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

Create a response that positions you as the trusted travel expert while providing genuine value.`;

      const response = await retryAIOperation(
        async () => {
          return await openai.chat.completions.create({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            model: optimizedConfig.model,
            temperature: 0.6,
            max_tokens: 600,
          });
        },
        'optimized_general_query',
        { maxAttempts: 2 }
      );

      const messageContent = response.choices?.[0]?.message?.content ?? "";
      
      const duration = Date.now() - startTime;
      logger.info(LogCategory.AI, 'General query processing completed', {
        duration,
        responseLength: messageContent.length,
      });

      if (!messageContent) {
        return this.getWelcomeMessage();
      }

      return messageContent;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(LogCategory.AI, 'Optimized general query failed', error as Error, {
        conversationId: context.id,
        sessionId: context.sessionId,
        duration,
      });

      const enhancedError = createAPIError(
        `General query processing failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          conversationId: context.id,
          sessionId: context.sessionId,
        }
      );

      const recovery = await errorHandler.handleError(enhancedError);
      
      if (recovery?.fallback) {
        return recovery.message;
      }

      return this.getWelcomeMessage();
    }
  }

  // Additional optimized methods...
  private async handlePackageDetailsOptimized(intent: TripIntent, context: ConversationContext): Promise<string> {
    return "Package details feature will be enhanced in the next optimization phase.";
  }

  private async handlePricingRequestOptimized(intent: TripIntent, context: ConversationContext): Promise<string> {
    return "Pricing request feature will be enhanced in the next optimization phase.";
  }

  private async generateFollowUpQuestionOptimized(
    intent: TripIntent, 
    missingInfo: string[], 
    context: ConversationContext
  ): Promise<string> {
    try {
      const conversationHistory = context.messages.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n');
      
      // Optimized follow-up question prompt
      const systemPrompt = `You are TripXplo AI's conversation specialist. Generate natural follow-up questions that efficiently gather required information.

**Question Generation Strategy:**
- Reference information already provided by the user
- Show active listening through acknowledgment
- Build on conversation momentum and emotional state
- Match user's communication style and energy level
- Consider urgency and decision-making stage

**Question Crafting Principles:**
- Use open-ended questions when exploring preferences
- Offer specific options when narrowing choices
- Frame questions positively and aspirationally
- Include brief rationale for why information is helpful
- Maintain conversational flow with smooth transitions

Generate ONE engaging follow-up question that moves the conversation forward effectively.`;

      const userPrompt = `Generate a natural follow-up question to gather missing information:

**Current Intent:** ${JSON.stringify(intent)}
**Missing Information:** ${missingInfo.join(', ')}
**Recent Conversation:** ${conversationHistory}

Ask for the MOST important missing piece of information with encouraging language and 2-3 specific examples when helpful.`;

      const response = await retryAIOperation(
        async () => {
          return await openai.chat.completions.create({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            model: optimizedConfig.model,
            temperature: 0.7,
            max_tokens: 200,
          });
        },
        'optimized_follow_up',
        { maxAttempts: 2 }
      );

      return response.choices?.[0]?.message?.content?.trim() || 
        "I'd love to help you find the perfect trip! Could you tell me more about what you're looking for? 🌍";
      
    } catch (error) {
      logger.error(LogCategory.AI, 'Follow-up question generation failed', error as Error);
      
      // Fallback questions based on missing info
      if (missingInfo.includes('destination')) {
        return "I'd love to help you find the perfect trip! 🌍 Where would you like to go?";
      } else if (missingInfo.includes('duration')) {
        return `Great choice! ${intent.destination} sounds amazing! 🎯 How many days are you planning for this trip?`;
      }
      
      return "I'd love to help you find the perfect trip! Could you tell me more about what you're looking for? 🌍";
    }
  }

  private async generateNoPackagesResponseOptimized(
    destination: string, 
    duration: number, 
    planType: string | undefined,
    context: ConversationContext
  ): Promise<string> {
    const planText = planType ? ` for ${planType} trips` : '';
    const durationText = duration ? `${duration}-day ` : '';
    const destinationText = destination || 'your chosen destination';
    return `😕 **No packages found**\n\nSorry, I couldn't find any ${durationText}packages${planText} for ${destinationText} right now.\n\n🔄 **Try:**\n• Different duration (3-7 days are popular)\n• Different destination\n• Remove specific trip type filter\n\n💡 *Our inventory updates regularly, so check back soon!*`;
  }

  private async formatPackagesResponseOptimized(
    packages: any, 
    destination: string, 
    duration: number, 
    planType: string | undefined,
    context: ConversationContext
  ): Promise<string> {
    try {
      // Extract packages data
      const packageList = Array.isArray(packages) ? packages : packages.packages || [];
      
      if (packageList.length === 0) {
        return await this.generateNoPackagesResponseOptimized(destination, duration, planType, context);
      }

      // Optimized package formatting prompt
      const systemPrompt = `You are TripXplo AI's package presentation specialist. Create compelling, personalized recommendations.

**Presentation Excellence:**
- Lead with emotional hooks and aspirational language
- Use sensory descriptions and vivid imagery
- Structure information for easy scanning and comparison
- Include social proof and credibility indicators
- Address potential concerns proactively

**Response Structure:**
1. Personalized opening with excitement acknowledgment
2. Top 3-5 packages with compelling descriptions
3. Clear value propositions and unique selling points
4. Practical information (duration, pricing, inclusions)
5. Next steps guidance and booking encouragement

Create recommendations that inspire and motivate booking decisions.`;

      const userPrompt = `Create compelling package recommendations:

**Search Criteria:** ${destination}, ${duration} days, ${planType || 'any type'}
**Available Packages:** ${JSON.stringify(packageList.slice(0, 5))}

Present maximum 5 packages with personalized language and compelling calls-to-action.`;

      const response = await retryAIOperation(
        async () => {
          return await openai.chat.completions.create({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            model: optimizedConfig.model,
            temperature: 0.6,
            max_tokens: 800,
          });
        },
        'optimized_package_formatting',
        { maxAttempts: 2 }
      );

      return response.choices?.[0]?.message?.content || 
        this.getFallbackPackageResponse(packageList, destination, duration);
      
    } catch (error) {
      logger.error(LogCategory.AI, 'Package formatting failed', error as Error);
      const packageList = Array.isArray(packages) ? packages : packages.packages || [];
      return this.getFallbackPackageResponse(packageList, destination, duration);
    }
  }

  // Cache management methods
  private generateCacheKey(messages: Message[], context: ConversationContext): string {
    const lastMessage = messages[messages.length - 1];
    const contextKey = `${context.sessionId}-${lastMessage?.content?.substring(0, 50)}`;
    return Buffer.from(contextKey).toString('base64').slice(0, 32);
  }

  private getFromCache(key: string): string | null {
    const entry = this.responseCache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check if cache entry has expired
    if (Date.now() - entry.timestamp.getTime() > entry.ttl) {
      this.responseCache.delete(key);
      return null;
    }
    
    return entry.response;
  }

  private addToCache(key: string, response: string, ttl: number): void {
    // Don't cache very large responses
    if (response.length > 5000) {
      return;
    }

    this.responseCache.set(key, {
      response,
      timestamp: new Date(),
      ttl,
    });

    // Limit cache size
    if (this.responseCache.size > 100) {
      const oldestKey = Array.from(this.responseCache.keys())[0];
      this.responseCache.delete(oldestKey);
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.responseCache.entries()) {
      if (now - entry.timestamp.getTime() > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.responseCache.delete(key));
    
    if (expiredKeys.length > 0) {
      logger.debug(LogCategory.AI, `Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  // Context management
  private getOrCreateContext(sessionId: string, userId?: string): ConversationContext {
    const existing = this.conversations.get(sessionId);
    if (existing) {
      return existing;
    }

    const newContext: ConversationContext = {
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
      },
    };

    this.conversations.set(sessionId, newContext);
    return newContext;
  }

  // Utility methods
  private getFallbackPackageResponse(packages: any[], destination: string, duration: number): string {
    const packageCount = packages.length;
    const topPackages = packages.slice(0, 3);
    
    let response = `✨ Found ${packageCount} packages for your ${duration}-day trip to ${destination}!\n\n`;
    
    topPackages.forEach((pkg, index) => {
      response += `🌍 **${pkg.packageName || pkg.name}**\n`;
      response += `📅 ${pkg.noOfDays || pkg.days} Days / ${pkg.noOfNight || pkg.nights} Nights\n`;
      response += `💸 Starting From: ₹${pkg.startFrom}\n`;
      if (pkg.packageId) response += `🔖 Package ID: ${pkg.packageId}\n`;
      if (index < topPackages.length - 1) response += '\n';
    });
    
    return response;
  }

  private getWelcomeMessage(): string {
    return "✨ **TripXplo AI** - Your Travel Companion\n\nHello! I'm here to help you discover amazing travel experiences.\n\n💫 Ask me about destinations, packages, or travel tips!\n\n*What adventure are you dreaming of?* 🌍";
  }

  private getSafeErrorResponse(): string {
    return "✨ **TripXplo AI** - Temporary Service Interruption\n\nI'm experiencing some technical difficulties right now. Our team has been notified and we're working to resolve this quickly.\n\n🔄 **Please try:**\n• Refreshing the page\n• Rephrasing your question\n• Trying again in a few minutes\n\n💫 *Amazing travel experiences are worth the wait!* 🌟";
  }

  // Performance metrics
  public getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheSize: this.responseCache.size,
      activeConversations: this.conversations.size,
    };
  }

  public clearCache(): void {
    this.responseCache.clear();
    logger.info(LogCategory.AI, 'AI response cache cleared');
  }

  public resetMetrics(): void {
    this.performanceMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      averageResponseTime: 0,
      cacheHitRate: 0,
      errorRate: 0,
    };
    logger.info(LogCategory.AI, 'AI performance metrics reset');
  }
}

// Global optimized AI processor instance
export const optimizedAIProcessor = new OptimizedAIProcessor();

// Backward compatibility function
export async function processWithOptimizedAI(messages: any[], sessionId?: string): Promise<string> {
  const conversationId = generateId();
  const formattedMessages: Message[] = messages.map(m => ({
    role: m.role,
    content: m.content,
    timestamp: new Date(),
    messageId: generateId(),
    conversationId: conversationId,
  }));

  return optimizedAIProcessor.processWithOptimizedAI(formattedMessages, sessionId);
}
