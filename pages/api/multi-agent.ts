// Multi-Agent API Endpoint - Main interface for the multi-agent system
import { NextApiRequest, NextApiResponse } from 'next';
import { multiAgentCoordinator } from '../../lib/agents/multi-agent-coordinator';
import { Message, generateId } from '../../lib/types/agent-types';
import { logger, LogCategory } from '../../lib/logging/comprehensive-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only POST requests are supported' 
    });
  }

  const startTime = Date.now();
  const requestId = generateId();

  try {
    const { messages, sessionId, userId } = req.body;

    // Validate request
    if (!messages || !Array.isArray(messages)) {
      logger.warn(LogCategory.API, 'Invalid request: missing messages array', {
        requestId,
        body: req.body
      });
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'Messages array is required' 
      });
    }

    // Convert and validate messages
    const formattedMessages: Message[] = messages.map((m: any, index: number) => ({
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp || Date.now()),
      messageId: m.messageId || generateId(),
      conversationId: m.conversationId || generateId(),
      metadata: m.metadata
    }));

    logger.info(LogCategory.API, 'Multi-agent request received', {
      requestId,
      sessionId: sessionId || 'auto-generated',
      userId: userId || 'anonymous',
      messageCount: formattedMessages.length,
      lastMessage: formattedMessages[formattedMessages.length - 1]?.content?.substring(0, 100)
    });

    // Process through multi-agent coordinator
    const response = await multiAgentCoordinator.processMessage(
      formattedMessages,
      sessionId,
      userId
    );

    const processingTime = Date.now() - startTime;

    logger.info(LogCategory.API, 'Multi-agent request completed', {
      requestId,
      success: response.success,
      agentUsed: response.agentUsed,
      confidence: response.confidence,
      processingTime: processingTime,
      responseLength: response.response.length
    });

    // Return enhanced response
    res.status(200).json({
      success: response.success,
      response: response.response,
      agentUsed: response.agentUsed,
      confidence: response.confidence,
      processingTime: processingTime,
      sessionId: response.metadata.sessionId,
      requestId,
      metadata: {
        ...response.metadata,
        apiVersion: '2.0.0-multi-agent',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(LogCategory.API, 'Multi-agent request failed', error as Error, {
      requestId,
      processingTime,
      body: req.body
    });

    // Return error response
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'The multi-agent system encountered an error. Please try again.',
      requestId,
      processingTime,
      metadata: {
        apiVersion: '2.0.0-multi-agent',
        timestamp: new Date().toISOString(),
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      }
    });
  }
}