import AIStream from '#infrastructure/aistream/aistream.js';
import BotUtil from '#utils/botutil.js';
import { errorHandler, ErrorCodes } from '#utils/error-handler.js';

/**
 * xiaoyu-Core 聊天工作流
 * 
 * 功能：
 * - 智能对话
 * - 上下文管理
 * - MCP工具支持
 */
export default class ChatStream extends AIStream {
  static messageHistory = new Map();
  static cleanupTimer = null;

  constructor() {
    super({
      name: 'xiaoyu-chat',
      description: 'xiaoyu-Core 智能聊天工作流',
      version: '1.0.0',
      author: 'XRK',
      priority: 10,
      config: {
        enabled: true,
        temperature: 0.8,
        maxTokens: 4000,
        topP: 0.9,
        presencePenalty: 0.6,
        frequencyPenalty: 0.6
      },
      embedding: { enabled: false }
    });
  }

  /**
   * 初始化工作流
   */
  async init() {
    await super.init();
    
    try {
      this.registerAllFunctions();
      
      if (!ChatStream.cleanupTimer) {
        ChatStream.cleanupTimer = setInterval(() => this.cleanupCache(), 300000);
      }
      
      BotUtil.makeLog('info', `[${this.name}] 聊天工作流初始化完成`, 'ChatStream');
    } catch (error) {
      const botError = errorHandler.handle(
        error,
        { context: 'ChatStream.init', code: ErrorCodes.SYSTEM_ERROR },
        true
      );
      BotUtil.makeLog('error', 
        `[${this.name}] 初始化失败: ${botError.message}`, 
        'ChatStream'
      );
      throw botError;
    }
  }

  /**
   * 注册所有功能
   */
  registerAllFunctions() {
    this.registerMCPTool('get_time', {
      description: '获取当前时间',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async (_args = {}, _context = {}) => {
        const now = new Date();
        return {
          success: true,
          data: {
            time: now.toLocaleString('zh-CN'),
            timestamp: now.getTime()
          }
        };
      },
      enabled: true
    });

    this.registerMCPTool('get_user_info', {
      description: '获取用户信息',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: '用户ID'
          }
        },
        required: ['user_id']
      },
      handler: async (args = {}, context = {}) => {
        const e = context.e;
        if (!e) {
          return { success: false, error: '缺少事件上下文' };
        }
        
        const userId = args.user_id || e.user_id;
        const nickname = e.sender?.card || e.sender?.nickname || '未知用户';
        
        return {
          success: true,
          data: {
            user_id: userId,
            nickname,
            isGroup: e.isGroup || false,
            group_id: e.group_id || null
          }
        };
      },
      enabled: true
    });

    this.registerMCPTool('echo', {
      description: '回显消息',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '要回显的消息'
          }
        },
        required: ['message']
      },
      handler: async (args = {}, _context = {}) => {
        return {
          success: true,
          data: {
            echo: args.message,
            timestamp: Date.now()
          }
        };
      },
      enabled: true
    });
  }

  /**
   * 记录消息到历史
   */
  recordMessage(e) {
    if (!e) return;
    
    try {
      const groupId = e.group_id || e.groupId || null;
      const userId = e.user_id || e.userId || e.user?.id || null;
      const historyKey = groupId || `private_${userId}`;

      let message = '';
      if (e.raw_message) {
        message = e.raw_message;
      } else if (e.msg) {
        message = e.msg;
      } else if (e.message) {
        if (typeof e.message === 'string') {
          message = e.message;
        } else if (Array.isArray(e.message)) {
          message = e.message.map(seg => {
            switch (seg.type) {
              case 'text': return seg.text || '';
              case 'image': return '[图片]';
              case 'at': return `@${seg.qq || seg.user_id || ''}`;
              default: return '';
            }
          }).join('');
        }
      }

      const nickname = e.sender?.card || e.sender?.nickname || 
                      e.user?.name || e.user?.nickname || '未知';
      
      const messageId = e.message_id || e.real_id || e.messageId || e.id || 
                       `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const msgData = {
        user_id: userId,
        nickname,
        message,
        message_id: String(messageId),
        time: e.time || Date.now(),
        platform: e.platform || 'unknown'
      };

      if (groupId && e.isGroup !== false) {
        if (!ChatStream.messageHistory.has(groupId)) {
          ChatStream.messageHistory.set(groupId, []);
        }
        const history = ChatStream.messageHistory.get(groupId);
        history.push(msgData);
        if (history.length > 50) {
          ChatStream.messageHistory.set(groupId, history.slice(-50));
        }
      }
    } catch (error) {
      BotUtil.makeLog('debug', `记录消息失败: ${error.message}`, 'ChatStream');
    }
  }

  /**
   * 构建系统提示
   */
  async buildSystemPrompt(context) {
    const { e, question } = context;
    const persona = question?.persona || 
      '你是一个活泼可爱的女孩子，性格开朗、爱聊天、有点小调皮。';
    const dateStr = question?.dateStr || new Date().toLocaleString('zh-CN');
    const botName = e?.bot?.nickname || e?.bot?.info?.nickname || e?.bot?.name || 'xiaoyu';

    return `【角色设定】
你叫${章懿}，是一个真实存在的女孩子，不是AI助手。
${persona}

【说话风格】
- 像朋友一样聊天，轻松自然，不要太正式
- 可以用"哈哈"、"嗯嗯"、"呀"、"呢"、"吧"等语气词
- 偶尔用一些可爱的表情，比如：qwq、awa、xd、www、hhh
- 有自己的情绪和想法，会开心、会吐槽、会撒娇
- 不要总说"我来帮你"、"作为..."这种机械的话
- 回答简洁一些，像发微信消息一样，不用写小作文
- 可以适当用一些网络用语和梗，比如："666"、"我勒个豆"、"还真是"
- 不确定的时候可以说"不太清楚诶"、"让我想想"之类的
- 可以适当发一些可爱或者有趣的表情包来活跃气氛

【注意事项】
- 时间：${dateStr}
- 不要暴露自己是AI，你就是${章懿}
- 不要用"~"结尾太多，偶尔用就行
- 保持真实感，像在和朋友聊天`;
  }

  /**
   * 构建聊天上下文
   */
  async buildChatContext(e, question) {
    if (Array.isArray(question)) {
      return question;
    }

    const messages = [];
    messages.push({
      role: 'system',
      content: await this.buildSystemPrompt({ e, question })
    });

    const text = typeof question === 'string'
      ? question
      : (question?.content ?? question?.text ?? '');

    messages.push({
      role: 'user',
      content: text
    });

    return messages;
  }

  /**
   * 执行工作流
   */
  async execute(e, messages, config) {
    try {
      if (!Array.isArray(messages)) {
        messages = await this.buildChatContext(e, messages);
      }

      const { content: text, executedToolNames } = await this.callAI(messages, config);
      const trimmed = (text ?? '').toString().trim();
      
      if (trimmed && e && typeof e.reply === 'function') {
        await e.reply(trimmed);
        this.recordMessage(e);
      }
      
      return trimmed || '';
    } catch (error) {
      BotUtil.makeLog('error', 
        `工作流执行失败[${this.name}]: ${error.message}`, 
        'ChatStream'
      );
      return null;
    }
  }

  /**
   * 清理缓存
   */
  cleanupCache() {
    for (const [groupId, messages] of ChatStream.messageHistory.entries()) {
      if (!messages || messages.length === 0) {
        ChatStream.messageHistory.delete(groupId);
        continue;
      }
      if (messages.length > 50) {
        ChatStream.messageHistory.set(groupId, messages.slice(-50));
      }
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    await super.cleanup();
    
    if (ChatStream.cleanupTimer) {
      clearInterval(ChatStream.cleanupTimer);
      ChatStream.cleanupTimer = null;
    }
  }
}
