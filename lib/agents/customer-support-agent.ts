// Customer Support Agent - Handles general queries, FAQ, and basic information
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
import { generateId } from '../types/agent-types';
import { logger, LogCategory } from '../logging/comprehensive-logger';
import { errorHandler, ErrorCategory, ErrorSeverity } from '../error-handling/enhanced-error-handler';
import { retryAIOperation } from '../error-handling/advanced-retry-mechanisms';

// FAQ Knowledge Base
interface FAQItem {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
  confidence: number;
}

export class CustomerSupportAgent extends BaseAgent {
  private openai: OpenAI;
  private faqKnowledgeBase: FAQItem[];
  
  constructor() {
    super({
      id: generateId(),
      type: AgentType.CUSTOMER_SUPPORT,
      name: 'Customer Support Assistant',
      description: 'Handles general inquiries, FAQ, and customer support requests',
      capabilities: [
        AgentCapability.FAQ_HANDLING,
        AgentCapability.GENERAL_SUPPORT,
        AgentCapability.INFORMATION_RETRIEVAL,
        AgentCapability.CONTEXT_AWARENESS
      ],
      version: '2.0.0'
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 20000,
      maxRetries: 2,
    });

    this.initializeFAQKnowledgeBase();
  }

  async processTask(
    messages: Message[],
    context: ConversationContext,
    priority: TaskPriority = TaskPriority.MEDIUM
  ): Promise<TaskResult> {
    const startTime = Date.now();
    const taskId = generateId();

    try {
      logger.info(LogCategory.AGENT, `Customer Support processing task`, {
        taskId,
        messageCount: messages.length,
        priority,
        contextId: context.id
      });

      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (!lastUserMessage) {
        return this.createErrorResult(taskId, 'No user message found', startTime);
      }

      // Try to match with FAQ first
      const faqMatch = await this.matchFAQ(lastUserMessage.content);
      
      let response: string;
      if (faqMatch && faqMatch.confidence > 0.7) {
        response = await this.formatFAQResponse(faqMatch, lastUserMessage.content, context);
        logger.info(LogCategory.AGENT, 'FAQ match found', {
          taskId,
          faqId: faqMatch.id,
          confidence: faqMatch.confidence
        });
      } else {
        // Generate dynamic response using AI
        response = await this.generateDynamicResponse(messages, context);
      }

      const processingTime = Date.now() - startTime;
      logger.info(LogCategory.AGENT, `Customer Support task completed`, {
        taskId,
        responseLength: response.length,
        processingTime,
        usedFAQ: !!faqMatch
      });

      return {
        success: true,
        taskId,
        agentId: this.config.id,
        agentType: this.config.type,
        result: response,
        processingTime,
        metadata: {
          faqMatch: faqMatch?.id || null,
          confidence: faqMatch?.confidence || 0.8,
          responseType: faqMatch ? 'faq' : 'dynamic'
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(LogCategory.AGENT, 'Customer Support task failed', error as Error, {
        taskId,
        contextId: context.id,
        processingTime
      });

      return this.createErrorResult(taskId, error instanceof Error ? error.message : String(error), startTime);
    }
  }

  private async matchFAQ(userMessage: string): Promise<FAQItem | null> {
    const messageWords = userMessage.toLowerCase().split(/\s+/);
    let bestMatch: FAQItem | null = null;
    let highestScore = 0;

    for (const faq of this.faqKnowledgeBase) {
      let score = 0;
      const faqKeywords = faq.keywords.map(k => k.toLowerCase());
      
      // Check for keyword matches
      for (const word of messageWords) {
        if (faqKeywords.some(keyword => keyword.includes(word) || word.includes(keyword))) {
          score += 1;
        }
      }
      
      // Check question similarity
      const questionWords = faq.question.toLowerCase().split(/\s+/);
      const commonWords = messageWords.filter(word => questionWords.includes(word));
      score += commonWords.length * 0.5;
      
      // Normalize score
      const normalizedScore = score / (messageWords.length + questionWords.length);
      
      if (normalizedScore > highestScore && normalizedScore > 0.3) {
        highestScore = normalizedScore;
        bestMatch = { ...faq, confidence: normalizedScore };
      }
    }

    return bestMatch;
  }

  private async formatFAQResponse(faq: FAQItem, userMessage: string, context: ConversationContext): Promise<string> {
    try {
      const formatPrompt = `
User asked: "${userMessage}"

FAQ Answer: ${faq.answer}

Please format this FAQ answer in a friendly, conversational way that directly addresses the user's question. 
Make it feel like a natural conversation, not a robotic FAQ response.

Guidelines:
- Start with acknowledgment of their question
- Provide the helpful information clearly
- End with an offer for further assistance
- Use emojis appropriately but not excessively
- Keep the tone professional yet friendly
- Make it feel personalized to TripXplo AI
      `.trim();

      const response = await retryAIOperation(
        async () => {
          return await this.openai.chat.completions.create({
            messages: [
              { 
                role: 'system', 
                content: 'You are a helpful customer support representative for TripXplo AI, a travel assistant service. Format FAQ responses in a natural, conversational way.'
              },
              { role: 'user', content: formatPrompt }
            ],
            model: 'gpt-4o',
            temperature: 0.7,
            max_tokens: 400,
          });
        },
        'faq_formatting',
        { maxAttempts: 2 }
      );

      return response.choices?.[0]?.message?.content?.trim() || faq.answer;

    } catch (error) {
      logger.error(LogCategory.AGENT, 'FAQ formatting failed', error as Error);
      return faq.answer; // Fallback to original answer
    }
  }

  private async generateDynamicResponse(messages: Message[], context: ConversationContext): Promise<string> {
    const startTime = Date.now();

    try {
      const conversationHistory = messages
        .slice(-8) // Last 8 messages for context
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const lastUserMessage = messages.filter(m => m.role === 'user').pop();

      const supportPrompt = `You are a professional customer support representative for TripXplo AI, an intelligent travel assistant.

Current user message: "${lastUserMessage?.content}"

Conversation history:
${conversationHistory}

Your role is to:
1. Provide helpful, accurate information about TripXplo AI services
2. Address customer concerns with empathy and professionalism  
3. Guide users to appropriate features and capabilities
4. Offer specific next steps when possible
5. Maintain a friendly, knowledgeable tone

About TripXplo AI:
- AI-powered travel assistant for discovering and booking travel packages
- Specializes in Indian destinations and international trips
- Offers package search, customization, and booking assistance
- Provides personalized recommendations based on preferences
- Has partnerships with hotels, transportation, and activity providers

If the user's question is about:
- Booking/Payment issues → Offer to connect with booking specialists
- Technical problems → Provide troubleshooting steps and escalation options
- General travel advice → Share helpful tips and direct to travel matching features
- Package modifications → Explain customization options available

Keep responses concise but comprehensive. Always end with an offer to help further.`;

      const response = await retryAIOperation(
        async () => {
          return await this.openai.chat.completions.create({
            messages: [
              { role: 'system', content: supportPrompt },
              { role: 'user', content: lastUserMessage?.content || '' }
            ],
            model: 'gpt-4o',
            temperature: 0.6,
            max_tokens: 500,
          });
        },
        'customer_support_response',
        { maxAttempts: 2 }
      );

      const responseContent = response.choices?.[0]?.message?.content?.trim();
      
      const processingTime = Date.now() - startTime;
      logger.logAIInteraction(
        'customer_support_dynamic',
        processingTime,
        true,
        context.userId,
        context.sessionId,
        context.id,
        { responseLength: responseContent?.length || 0 }
      );

      return responseContent || this.getFallbackSupportResponse();

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(LogCategory.AI, 'Dynamic support response failed', error as Error);
      
      logger.logAIInteraction(
        'customer_support_dynamic',
        processingTime,
        false,
        context.userId,
        context.sessionId,
        context.id,
        { error: (error as Error).message }
      );

      return this.getFallbackSupportResponse();
    }
  }

  private initializeFAQKnowledgeBase(): void {
    this.faqKnowledgeBase = [
      {
        id: 'welcome_greeting',
        question: 'Hello, hi, hey, good morning, good evening',
        answer: 'Hello! Welcome to TripXplo AI! 🌟 I\'m your intelligent travel assistant, ready to help you discover amazing travel experiences. Whether you\'re looking for adventure packages, romantic getaways, or family trips, I\'m here to make your travel planning effortless!',
        keywords: ['hello', 'hi', 'hey', 'welcome', 'greeting', 'good morning', 'good evening'],
        category: 'greeting',
        confidence: 0.9
      },
      {
        id: 'what_is_tripxplo',
        question: 'What is TripXplo AI?',
        answer: 'TripXplo AI is your intelligent travel companion! 🤖✈️ I help you discover, customize, and book amazing travel packages. I can suggest destinations, find packages that match your preferences, help with trip planning, and guide you through the booking process. Think of me as your personal travel expert available 24/7!',
        keywords: ['what is', 'tripxplo', 'about', 'explain', 'tell me', 'service', 'ai'],
        category: 'about',
        confidence: 0.95
      },
      {
        id: 'how_to_search_packages',
        question: 'How do I search for travel packages?',
        answer: 'Searching for packages is super easy! 🔍 Just tell me where you\'d like to go and for how many days. For example, say "Show me 5-day packages for Goa" or "I want to visit Himachal Pradesh for a week." I\'ll find the best packages that match your preferences and help you compare options!',
        keywords: ['search', 'find', 'packages', 'how to', 'looking for', 'trips'],
        category: 'usage',
        confidence: 0.9
      },
      {
        id: 'booking_process',
        question: 'How do I book a travel package?',
        answer: 'Booking is simple! 📝 Once you find a package you like, I\'ll guide you through the process. I can help you customize the package, check availability, get detailed pricing, and connect you with our booking specialists who will finalize your reservation. You\'ll get full support from selection to confirmation!',
        keywords: ['book', 'booking', 'reserve', 'purchase', 'buy', 'confirm'],
        category: 'booking',
        confidence: 0.9
      },
      {
        id: 'package_customization',
        question: 'Can I customize my travel package?',
        answer: 'Absolutely! 🎨 Most of our packages are customizable. You can modify hotels, activities, transportation, duration, and more. Just tell me what changes you\'d like, and I\'ll work with you to create your perfect trip within your budget. Every traveler is unique, and your trip should be too!',
        keywords: ['customize', 'modify', 'change', 'personalize', 'adjust', 'tailor'],
        category: 'customization',
        confidence: 0.85
      },
      {
        id: 'payment_pricing',
        question: 'What about pricing and payment?',
        answer: 'Our packages offer great value! 💰 Prices vary based on destination, duration, hotels, and season. I can provide detailed pricing with breakdowns for any package. We accept multiple payment methods and offer flexible payment plans. For exact pricing and payment options, I\'ll connect you with our booking team.',
        keywords: ['price', 'cost', 'payment', 'money', 'expensive', 'cheap', 'budget'],
        category: 'pricing',
        confidence: 0.8
      },
      {
        id: 'destinations_available',
        question: 'What destinations do you cover?',
        answer: 'We cover amazing destinations across India and internationally! 🌍 Popular Indian destinations include Goa, Kerala, Himachal Pradesh, Rajasthan, Kashmir, and many more. We also offer international packages to Thailand, Dubai, Singapore, Europe, and other exciting locations. Where would you like to explore?',
        keywords: ['destinations', 'places', 'where', 'locations', 'countries', 'cities'],
        category: 'destinations',
        confidence: 0.85
      },
      {
        id: 'customer_support',
        question: 'I need help or have a problem',
        answer: 'I\'m here to help! 🤝 Whether you have questions about packages, need assistance with booking, or encounter any issues, I\'m your first point of contact. For complex matters, I can connect you with our specialized support team. What specific help do you need today?',
        keywords: ['help', 'problem', 'issue', 'support', 'assistance', 'trouble'],
        category: 'support',
        confidence: 0.9
      },
      {
        id: 'technical_issues',
        question: 'I\'m having technical problems',
        answer: 'Sorry to hear you\'re experiencing technical difficulties! 🔧 Try refreshing the page first. If the problem persists, please let me know what specific issue you\'re facing - is it slow loading, error messages, or something else? I\'ll help troubleshoot or escalate to our technical team if needed.',
        keywords: ['technical', 'error', 'bug', 'not working', 'broken', 'slow', 'loading'],
        category: 'technical',
        confidence: 0.8
      },
      {
        id: 'thank_you',
        question: 'Thank you, thanks',
        answer: 'You\'re very welcome! 😊 I\'m delighted I could help! If you need any more assistance with your travel planning or have other questions, I\'m always here. Have a wonderful day and happy travels! ✈️🌟',
        keywords: ['thank you', 'thanks', 'appreciate', 'grateful'],
        category: 'gratitude',
        confidence: 0.9
      }
    ];
  }

  private getFallbackSupportResponse(): string {
    return `Hello! I'm here to help you with TripXplo AI! 🌟

I can assist you with:
• 🔍 **Finding travel packages** - Just tell me where you want to go
• 🎨 **Customizing trips** - Modify packages to fit your preferences  
• 📝 **Booking assistance** - Guide you through the reservation process
• 💡 **Travel advice** - Share tips and recommendations
• 🤝 **General support** - Answer questions about our services

What would you like help with today? Feel free to ask me anything about travel planning or TripXplo AI!`;
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
        fallbackResponse: this.getFallbackSupportResponse()
      }
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const testMessages: Message[] = [{
        role: 'user',
        content: 'Hello, I need help',
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
      logger.error(LogCategory.AGENT, 'Customer Support health check failed', error as Error);
      return false;
    }
  }
}

// Export singleton instance
export const customerSupportAgent = new CustomerSupportAgent();