import AIStream from '#infrastructure/aistream/aistream.js';
import BotUtil from '#utils/botutil.js';

class MemoryStream extends AIStream {
  static conversationMemory = new Map();
  static maxMessagesPerSession = 20;
  static cleanupTimer = null;

  constructor() {
    super({
      name: 'memory',
      description: '对话记忆管理工作流',
      version: '1.0.0',
      author: 'XRK',
      priority: 5,
      config: {
        enabled: true,
        maxMessages: 20,
        contextWindow: 4096
      },
      embedding: { enabled: false }
    });
  }

  async init() {
    await super.init();
    
    if (!MemoryStream.cleanupTimer) {
      MemoryStream.cleanupTimer = setInterval(() => MemoryStream.cleanupOldSessions(), 600000);
    }
    
    BotUtil.makeLog('info', '[memory] 记忆工作流初始化完成', 'MemoryStream');
  }

  static getSessionKey(sessionId) {
    return sessionId || 'default';
  }

  static getMemory(sessionId) {
    const key = MemoryStream.getSessionKey(sessionId);
    if (!MemoryStream.conversationMemory.has(key)) {
      MemoryStream.conversationMemory.set(key, {
        messages: [],
        createdAt: Date.now(),
        lastAccessedAt: Date.now()
      });
    }
    const memory = MemoryStream.conversationMemory.get(key);
    memory.lastAccessedAt = Date.now();
    return memory;
  }

  static addMessage(sessionId, role, content) {
    const memory = MemoryStream.getMemory(sessionId);
    memory.messages.push({
      role,
      content,
      timestamp: Date.now()
    });
    
    if (memory.messages.length > MemoryStream.maxMessagesPerSession * 2) {
      memory.messages = memory.messages.slice(-MemoryStream.maxMessagesPerSession);
    }
    
    BotUtil.makeLog('debug', `[memory] 添加消息: session=${sessionId}, role=${role}, 总消息数=${memory.messages.length}`, 'MemoryStream');
    return memory.messages;
  }

  static getMessages(sessionId, limit = null) {
    const memory = MemoryStream.getMemory(sessionId);
    const messages = memory.messages;
    
    if (limit && messages.length > limit) {
      return messages.slice(-limit);
    }
    return messages;
  }

  static clearMemory(sessionId) {
    const key = MemoryStream.getSessionKey(sessionId);
    if (MemoryStream.conversationMemory.has(key)) {
      MemoryStream.conversationMemory.delete(key);
      BotUtil.makeLog('info', `[memory] 清除会话记忆: ${key}`, 'MemoryStream');
      return true;
    }
    return false;
  }

  static clearAllMemory() {
    const count = MemoryStream.conversationMemory.size;
    MemoryStream.conversationMemory.clear();
    BotUtil.makeLog('info', `[memory] 清除所有会话记忆: ${count} 个会话`, 'MemoryStream');
    return count;
  }

  static getMemoryStats(sessionId) {
    const key = MemoryStream.getSessionKey(sessionId);
    const memory = MemoryStream.conversationMemory.get(key);
    
    if (!memory) {
      return {
        exists: false,
        messageCount: 0,
        createdAt: null,
        lastAccessedAt: null
      };
    }
    
    return {
      exists: true,
      messageCount: memory.messages.length,
      createdAt: memory.createdAt,
      lastAccessedAt: memory.lastAccessedAt
    };
  }

  static cleanupOldSessions() {
    const now = Date.now();
    const maxAge = 3600000;
    let cleaned = 0;
    
    for (const [key, memory] of MemoryStream.conversationMemory.entries()) {
      if (now - memory.lastAccessedAt > maxAge) {
        MemoryStream.conversationMemory.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      BotUtil.makeLog('info', `[memory] 清理过期会话: ${cleaned} 个`, 'MemoryStream');
    }
  }

  async buildChatContext(e, question) {
    const sessionId = question?.sessionId || 'default';
    const userMessage = typeof question === 'string' ? question : (question?.text || question?.content || '');
    
    MemoryStream.addMessage(sessionId, 'user', userMessage);
    
    const messages = [];
    messages.push({
      role: 'system',
      content: '你是 xiaoyu-Core 的智能助手，友好、专业、乐于助人。请根据上下文进行对话。'
    });
    
    const history = MemoryStream.getMessages(sessionId);
    for (const msg of history) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
    
    return messages;
  }

  async cleanup() {
    await super.cleanup();
    
    if (MemoryStream.cleanupTimer) {
      clearInterval(MemoryStream.cleanupTimer);
      MemoryStream.cleanupTimer = null;
    }
  }
}

export default MemoryStream;
