import StreamLoader from '#infrastructure/aistream/loader.js';
import LLMFactory from '#factory/llm/LLMFactory.js';
import BotUtil from '#utils/botutil.js';
import { HttpResponse } from '#utils/http-utils.js';
import { getAistreamConfigOptional } from '#utils/aistream-config.js';
import cfg from '#infrastructure/config/config.js';
import PluginsLoader from '#infrastructure/plugins/loader.js';
import { segment } from '#oicq';

const trimLower = (v) => (v || '').toString().trim().toLowerCase();

const getDefaultProvider = () => {
  const llm = getAistreamConfigOptional().llm || cfg?.aistream?.llm || {};
  return (llm?.Provider || llm?.provider || '').toString().trim().toLowerCase();
};

function getProviderConfig(provider) {
  return LLMFactory.getProviderConfig(provider) || {};
}

function resolveProviderFromRequest(body = {}) {
  const pickFirst = (obj, keys) => {
    for (const k of keys) {
      if (Object.hasOwn(obj, k) && obj[k] !== undefined) return obj[k];
    }
    return;
  };

  return LLMFactory.resolveProvider({
    model: trimLower(pickFirst(body, ['model'])),
    provider: trimLower(pickFirst(body, ['provider', 'llm', 'profile'])),
    llm: trimLower(pickFirst(body, ['llm'])),
    profile: trimLower(pickFirst(body, ['profile'])),
    defaultProvider: getDefaultProvider()
  });
}

function writeSSEChunk(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if (typeof res.flush === 'function') res.flush();
}

/**
 * xiaoyu-Core 测试API模块
 * 
 * 提供聊天测试、工作流测试等功能
 */
function hasImageInMessages(messages) {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item?.type === 'image_url' || item?.image_url) return true;
      }
    }
  }
  return false;
}

async function tryHandlePluginCommand(command, req) {
  const result = { handled: false, reply: '', pluginName: '' };
  
  try {
    const priority = PluginsLoader.priority || [];
    
    for (const pluginData of priority) {
      if (!pluginData) continue;
      
      const plugin = pluginData.plugin || pluginData;
      const ruleList = pluginData.ruleTemplates || plugin.rule || [];
      
      if (!Array.isArray(ruleList) || ruleList.length === 0) continue;
      
      for (const rule of ruleList) {
        if (!rule || !rule.reg) continue;
        
        try {
          const regex = rule.reg instanceof RegExp ? rule.reg : new RegExp(rule.reg);
          if (regex.test(command)) {
            const handlerName = rule.fnc;
            if (!handlerName || typeof plugin[handlerName] !== 'function') continue;
            
            const mockEvent = {
              msg: command,
              message: command,
              user_id: 'web_user',
              group_id: null,
              isPrivate: true,
              reply: async (content) => {
                if (Array.isArray(content)) {
                  for (const item of content) {
                    if (typeof item === 'string') {
                      result.reply += item;
                    } else if (item?.type === 'image' || item?.file) {
                      const imgUrl = item.file || item.url || item;
                      result.reply += `\n[图片] ${imgUrl}`;
                    } else if (item?.type === 'video') {
                      const videoUrl = item.file || item.url || item;
                      result.reply += `\n[视频] ${videoUrl}`;
                    }
                  }
                } else {
                  result.reply = String(content);
                }
                return true;
              }
            };
            
            plugin.e = mockEvent;
            
            try {
              await plugin[handlerName]();
              result.handled = true;
              result.pluginName = plugin.name || '未知插件';
              BotUtil.makeLog('info', `[xiaoyu/test/chat] 插件命令已处理: ${command} -> ${result.pluginName}.${handlerName}`, 'xiaoyu.test');
              return result;
            } catch (execError) {
              const errorMsg = execError.cause ? `${execError.message} (${execError.cause.code || execError.cause})` : execError.message;
              BotUtil.makeLog('error', `[xiaoyu/test/chat] 插件执行错误: ${errorMsg}`, 'xiaoyu.test');
              result.reply = `插件执行错误: ${errorMsg}`;
              result.handled = true;
              return result;
            }
          }
        } catch (e) {
          // 忽略无效正则
        }
      }
    }
  } catch (error) {
    BotUtil.makeLog('error', `[xiaoyu/test/chat] 插件命令处理错误: ${error.message}`, 'xiaoyu.test');
  }
  
  return result;
}

async function handleChatTest(req, res) {
  const body = req.body || {};
  let messages = Array.isArray(body.messages) ? body.messages : null;
  const streamFlag = Boolean(body.stream);

  if (!messages || messages.length === 0) {
    return HttpResponse.validationError(res, 'messages 参数无效');
  }

  const lastMessage = messages[messages.length - 1];
  const userText = typeof lastMessage?.content === 'string' 
    ? lastMessage.content 
    : (Array.isArray(lastMessage?.content) 
        ? lastMessage.content.find(c => c.type === 'text')?.text || '' 
        : '');

  if (userText.startsWith('#')) {
    const pluginResult = await tryHandlePluginCommand(userText, req);
    if (pluginResult.handled) {
      if (streamFlag) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        
        writeSSEChunk(res, { 
          delta: pluginResult.reply, 
          provider: 'plugin',
          model: pluginResult.pluginName 
        });
        writeSSEChunk(res, { 
          done: true, 
          provider: 'plugin',
          model: pluginResult.pluginName,
          totalLength: pluginResult.reply.length 
        });
        res.end();
        return;
      }
      
      return res.json({
        success: true,
        data: {
          content: pluginResult.reply,
          provider: 'plugin',
          model: pluginResult.pluginName
        }
      });
    }
  }

  const provider = resolveProviderFromRequest(body);
  if (!provider) {
    return HttpResponse.error(
      res,
      new Error('未指定有效的LLM提供商'),
      400,
      'xiaoyu.test.chat'
    );
  }

  const base = getProviderConfig(provider);
  const llmConfig = {
    provider,
    ...base
  };
  
  const hasImage = hasImageInMessages(messages);
  if (hasImage) {
    if (base.visionModel) {
      llmConfig.model = base.visionModel;
      BotUtil.makeLog('info', `[xiaoyu/test/chat] 检测到图片，使用视觉模型: ${base.visionModel}`, 'xiaoyu.test');
    } else {
      const visionProvider = LLMFactory.getVisionProvider();
      if (visionProvider) {
        const visionBase = getProviderConfig(visionProvider);
        if (visionBase && (visionBase.visionModel || visionBase.model)) {
          llmConfig.provider = visionProvider;
          llmConfig.model = visionBase.visionModel || visionBase.model;
          llmConfig.baseUrl = visionBase.baseUrl;
          BotUtil.makeLog('info', `[xiaoyu/test/chat] 检测到图片，自动切换到视觉提供商: ${visionProvider}, 模型: ${llmConfig.model}`, 'xiaoyu.test');
        }
      }
    }
  }
  
  const modelForLog = llmConfig.model || base.model || 'unknown';
  BotUtil.makeLog('info', `[xiaoyu/test/chat] 配置: provider=${llmConfig.provider}, model=${modelForLog}, visionModel=${base.visionModel || 'none'}`, 'xiaoyu.test');

  if (streamFlag && base.enableStream === false) {
    return HttpResponse.error(
      res,
      new Error(`提供商 ${provider} 的流式输出已禁用`),
      400,
      'xiaoyu.test.chat'
    );
  }

  if (body.persona && typeof body.persona === 'string' && body.persona.trim()) {
    const systemMessage = { role: 'system', content: body.persona.trim() };
    messages = [systemMessage, ...messages];
  }

  const client = LLMFactory.createClient(llmConfig);
  const overrides = {};
  
  if (llmConfig.model) overrides.model = llmConfig.model;
  if (body.temperature !== undefined) overrides.temperature = Number(body.temperature);
  if (body.max_tokens !== undefined) overrides.max_tokens = Number(body.max_tokens);
  if (body.top_p !== undefined) overrides.top_p = Number(body.top_p);

  if (!streamFlag) {
    try {
      const chatResult = await client.chat(messages, overrides);
      const text = typeof chatResult === 'string' ? chatResult : (chatResult?.content || '');
      const actualModel = llmConfig.model || base.model || base.chatModel || 'unknown';

      return res.json({
        success: true,
        data: {
          content: text,
          provider,
          model: actualModel
        }
      });
    } catch (error) {
      return HttpResponse.error(res, error, 500, 'xiaoyu.test.chat');
    }
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  BotUtil.makeLog('info', `[xiaoyu/test/chat] 开始流式输出: provider=${provider}`, 'xiaoyu.test');

  try {
    let totalContent = '';

    await client.chatStream(messages, (delta) => {
      if (typeof delta === 'string' && delta.length > 0) {
        totalContent += delta;
        writeSSEChunk(res, { delta, provider });
      }
    }, overrides);

    writeSSEChunk(res, { 
      done: true, 
      provider,
      totalLength: totalContent.length 
    });
  } catch (error) {
    BotUtil.makeLog('error', `[xiaoyu/test/chat] 流式输出错误: ${error.message}`, 'xiaoyu.test');
    writeSSEChunk(res, { error: error.message });
  } finally {
    res.end();
  }
}

async function handleWorkflowTest(req, res) {
  const body = req.body || {};
  const workflowName = body.workflow || 'xiaoyu-chat';
  const prompt = body.prompt || body.message || '';

  if (!prompt.trim()) {
    return HttpResponse.validationError(res, 'prompt 参数无效');
  }

  const stream = StreamLoader.getStream(workflowName);
  if (!stream) {
    return HttpResponse.error(
      res,
      new Error(`工作流 ${workflowName} 未找到`),
      404,
      'xiaoyu.test.workflow'
    );
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  BotUtil.makeLog('info', `[xiaoyu/test/workflow] 测试工作流: ${workflowName}`, 'xiaoyu.test');

  try {
    const messages = await stream.buildChatContext(null, {
      text: prompt,
      persona: body.persona
    });

    const config = stream.resolveLLMConfig({
      provider: body.provider,
      ...stream.config
    });

    let acc = '';
    const finalText = await stream.callAIStream(
      messages,
      config,
      (delta) => {
        acc += delta;
        res.write(`data: ${JSON.stringify({ delta, workflow: stream.name })}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({
      done: true,
      workflow: stream.name,
      text: finalText || acc
    })}\n\n`);
  } catch (error) {
    BotUtil.makeLog('error', `[xiaoyu/test/workflow] 测试失败: ${error.message}`, 'xiaoyu.test');
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
}

async function handleListWorkflows(req, res) {
  const workflows = StreamLoader.getStreamsByPriority()
    .filter(s => s.name.startsWith('xiaoyu-'))
    .map(s => ({
      name: s.name,
      description: s.description || s.name,
      version: s.version || '1.0.0',
      enabled: s.config?.enabled !== false,
      mcpTools: (s.mcpTools?.size || 0)
    }));

  return HttpResponse.success(res, { workflows });
}

async function handleListProviders(req, res) {
  const allowedProviders = ['qwen3', 'qwen3-vl'];
  
  const providerList = allowedProviders.map(provider => {
    const c = getProviderConfig(provider);
    return {
      name: provider,
      label: c.label || provider,
      model: c.model || c.chatModel || null,
      visionModel: c.visionModel || null,
      baseUrl: c.baseUrl || null,
      hasApiKey: Boolean((c.apiKey || '').toString().trim()),
      enableStream: c.enableStream !== false,
      enableTools: c.enableTools === true
    };
  });

  return HttpResponse.success(res, {
    defaultProvider: 'qwen3',
    providers: providerList
  });
}

async function handleMemoryClear(req, res) {
  const body = req.body || {};
  const sessionId = body.sessionId || 'default';
  
  try {
    const MemoryStream = (await import('../stream/memory.js')).default;
    const cleared = MemoryStream.clearMemory(sessionId);
    
    return res.json({
      success: true,
      data: {
        sessionId,
        cleared,
        message: cleared ? '记忆已清除' : '会话不存在'
      }
    });
  } catch (error) {
    return HttpResponse.error(res, error, 500, 'xiaoyu.memory.clear');
  }
}

async function handleMemoryStats(req, res) {
  const sessionId = req.query.sessionId || 'default';
  
  try {
    const MemoryStream = (await import('../stream/memory.js')).default;
    const stats = MemoryStream.getMemoryStats(sessionId);
    
    return res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    return HttpResponse.error(res, error, 500, 'xiaoyu.memory.stats');
  }
}

async function handleMemoryChat(req, res) {
  const body = req.body || {};
  const message = body.message || body.prompt || '';
  const sessionId = body.sessionId || 'default';
  const streamFlag = body.stream !== false;

  if (!message.trim()) {
    return HttpResponse.validationError(res, 'message 参数无效');
  }

  try {
    const MemoryStream = (await import('../stream/memory.js')).default;
    const provider = resolveProviderFromRequest(body) || getDefaultProvider();
    
    if (!provider) {
      return HttpResponse.error(res, new Error('未指定有效的LLM提供商'), 400, 'xiaoyu.memory.chat');
    }

    const base = getProviderConfig(provider);
    const client = LLMFactory.createClient({ provider, ...base });
    
    MemoryStream.addMessage(sessionId, 'user', message);
    const messages = [];
    messages.push({
      role: 'system',
      content: '你是 xiaoyu-Core 的智能助手，友好、专业、乐于助人。请根据上下文进行对话。'
    });
    
    const history = MemoryStream.getMessages(sessionId);
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }

    if (!streamFlag) {
      const response = await client.chat(messages, { model: base.model });
      const text = typeof response === 'string' ? response : (response?.content || '');
      MemoryStream.addMessage(sessionId, 'assistant', text);
      
      return res.json({
        success: true,
        data: {
          content: text,
          sessionId,
          provider
        }
      });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let totalContent = '';
    await client.chatStream(messages, (delta) => {
      if (typeof delta === 'string' && delta.length > 0) {
        totalContent += delta;
        writeSSEChunk(res, { delta, sessionId });
      }
    }, { model: base.model });

    MemoryStream.addMessage(sessionId, 'assistant', totalContent);
    writeSSEChunk(res, { done: true, sessionId, totalLength: totalContent.length });
    res.end();
  } catch (error) {
    BotUtil.makeLog('error', `[xiaoyu/memory/chat] 错误: ${error.message}`, 'xiaoyu.memory');
    if (!res.headersSent) {
      return HttpResponse.error(res, error, 500, 'xiaoyu.memory.chat');
    } else {
      writeSSEChunk(res, { error: error.message });
      res.end();
    }
  }
}

async function handleDesktopToolsTest(req, res) {
  const body = req.body || {};
  const toolName = body.tool || 'screenshot';
  
  const stream = StreamLoader.getStream('desktop');
  if (!stream) {
    return HttpResponse.error(res, new Error('desktop工作流未找到'), 404, 'xiaoyu.test.desktop');
  }

  try {
    let result;
    const context = { e: null, stream };

    switch (toolName) {
      case 'screenshot': {
        const tool = stream.mcpTools?.get('screenshot');
        if (!tool) throw new Error('screenshot工具未注册');
        result = await tool.handler({}, context);
        break;
      }
      case 'send_image': {
        const imagePath = body.imagePath || body.path;
        if (!imagePath) {
          return HttpResponse.validationError(res, 'imagePath 参数无效');
        }
        const tool = stream.mcpTools?.get('send_image');
        if (!tool) throw new Error('send_image工具未注册');
        
        const mockContext = {
          e: {
            reply: async (segments) => {
              BotUtil.makeLog('info', `[test] 模拟发送图片: ${JSON.stringify(segments)}`, 'xiaoyu.test');
              return true;
            }
          },
          stream
        };
        result = await tool.handler({ imagePath }, mockContext);
        break;
      }
      case 'send_video': {
        const videoPath = body.videoPath || body.path;
        if (!videoPath) {
          return HttpResponse.validationError(res, 'videoPath 参数无效');
        }
        const tool = stream.mcpTools?.get('send_video');
        if (!tool) throw new Error('send_video工具未注册');
        
        const mockContext = {
          e: {
            reply: async (segments) => {
              BotUtil.makeLog('info', `[test] 模拟发送视频: ${JSON.stringify(segments)}`, 'xiaoyu.test');
              return true;
            }
          },
          stream
        };
        result = await tool.handler({ videoPath }, mockContext);
        break;
      }
      case 'system_info': {
        const tool = stream.mcpTools?.get('system_info');
        if (!tool) throw new Error('system_info工具未注册');
        result = await tool.handler({}, context);
        break;
      }
      case 'get_time': {
        const tool = stream.mcpTools?.get('get_time');
        if (!tool) throw new Error('get_time工具未注册');
        result = await tool.handler({ format: body.format || 'locale' }, context);
        break;
      }
      default:
        return HttpResponse.validationError(res, `不支持的工具: ${toolName}`);
    }

    return res.json({
      success: true,
      data: {
        tool: toolName,
        result
      }
    });
  } catch (error) {
    BotUtil.makeLog('error', `[xiaoyu/test/desktop] 测试失败: ${error.message}`, 'xiaoyu.test');
    return HttpResponse.error(res, error, 500, 'xiaoyu.test.desktop');
  }
}

async function handleDesktopToolsList(req, res) {
  const stream = StreamLoader.getStream('desktop');
  if (!stream) {
    return HttpResponse.error(res, new Error('desktop工作流未找到'), 404, 'xiaoyu.test.desktop');
  }

  const tools = [];
  if (stream.mcpTools) {
    for (const [name, tool] of stream.mcpTools) {
      tools.push({
        name,
        description: tool.description || '',
        enabled: tool.enabled !== false
      });
    }
  }

  return HttpResponse.success(res, {
    workflow: 'desktop',
    tools,
    count: tools.length
  });
}

async function handlePluginsList(req, res) {
  const plugins = [];
  const priority = PluginsLoader.priority || [];
  
  for (const pluginData of priority) {
    if (!pluginData) continue;
    
    const plugin = pluginData.plugin || pluginData;
    const rules = [];
    
    const ruleList = pluginData.ruleTemplates || plugin.rule || [];
    if (Array.isArray(ruleList)) {
      for (const rule of ruleList) {
        if (rule && rule.reg) {
          const regStr = rule.reg instanceof RegExp ? rule.reg.source : String(rule.reg);
          rules.push({
            reg: regStr,
            fnc: rule.fnc || ''
          });
        }
      }
    }
    
    plugins.push({
      name: plugin.name || pluginData.name || '未知插件',
      dsc: plugin.dsc || '',
      event: plugin.event || 'message',
      priority: pluginData.priority || plugin.priority || 0,
      ruleCount: rules.length,
      rules: rules.slice(0, 10)
    });
  }

  return HttpResponse.success(res, {
    count: plugins.length,
    plugins
  });
}

async function handlePluginTest(req, res) {
  const body = req.body || {};
  const command = (body.command || '').trim();
  
  if (!command) {
    return HttpResponse.validationError(res, 'command 参数无效');
  }

  try {
    const priority = PluginsLoader.priority || [];
    let matchedPlugin = null;
    let matchedRule = null;
    
    for (const pluginData of priority) {
      if (!pluginData) continue;
      
      const plugin = pluginData.plugin || pluginData;
      const ruleList = pluginData.ruleTemplates || plugin.rule || [];
      
      if (!Array.isArray(ruleList)) continue;
      
      for (const rule of ruleList) {
        if (!rule || !rule.reg) continue;
        
        try {
          const regex = rule.reg instanceof RegExp ? rule.reg : new RegExp(rule.reg);
          if (regex.test(command)) {
            matchedPlugin = plugin;
            matchedRule = rule;
            break;
          }
        } catch (e) {
          // 忽略无效正则
        }
      }
      
      if (matchedPlugin) break;
    }
    
    if (!matchedPlugin) {
      return HttpResponse.success(res, {
        matched: false,
        message: '没有匹配的插件规则',
        command
      });
    }
    
    const regStr = matchedRule.reg instanceof RegExp ? matchedRule.reg.source : String(matchedRule.reg);
    const ruleInfo = {
      pluginName: matchedPlugin.name,
      pluginDsc: matchedPlugin.dsc || '',
      matchedReg: regStr,
      handlerFnc: matchedRule.fnc || ''
    };
    
    return HttpResponse.success(res, {
      matched: true,
      command,
      rule: ruleInfo,
      message: `匹配到插件: ${matchedPlugin.name}, 处理函数: ${matchedRule.fnc || '未知'}`
    });
  } catch (error) {
    BotUtil.makeLog('error', `[xiaoyu/test/plugin] 测试失败: ${error.message}`, 'xiaoyu.test');
    return HttpResponse.error(res, error, 500, 'xiaoyu.test.plugin');
  }
}

async function handlePluginStats(req, res) {
  const stats = PluginsLoader.getPluginStats ? PluginsLoader.getPluginStats() : {};
  const priority = PluginsLoader.priority || [];
  
  const eventStats = {};
  for (const plugin of priority) {
    if (!plugin) continue;
    const event = plugin.event || 'message';
    eventStats[event] = (eventStats[event] || 0) + 1;
  }

  return HttpResponse.success(res, {
    totalPlugins: priority.length,
    eventStats,
    loadStats: stats
  });
}

export default {
  name: 'xiaoyu-test',
  dsc: 'xiaoyu-Core 测试API',
  priority: 70,
  routes: [
    {
      method: 'POST',
      path: '/api/xiaoyu/test/chat',
      handler: HttpResponse.asyncHandler(handleChatTest, 'xiaoyu.test.chat')
    },
    {
      method: 'POST',
      path: '/api/xiaoyu/test/workflow',
      handler: HttpResponse.asyncHandler(handleWorkflowTest, 'xiaoyu.test.workflow')
    },
    {
      method: 'GET',
      path: '/api/xiaoyu/test/workflows',
      handler: HttpResponse.asyncHandler(handleListWorkflows, 'xiaoyu.test.workflows')
    },
    {
      method: 'GET',
      path: '/api/xiaoyu/test/providers',
      handler: HttpResponse.asyncHandler(handleListProviders, 'xiaoyu.test.providers')
    },
    {
      method: 'POST',
      path: '/api/xiaoyu/memory/clear',
      handler: HttpResponse.asyncHandler(handleMemoryClear, 'xiaoyu.memory.clear')
    },
    {
      method: 'GET',
      path: '/api/xiaoyu/memory/stats',
      handler: HttpResponse.asyncHandler(handleMemoryStats, 'xiaoyu.memory.stats')
    },
    {
      method: 'POST',
      path: '/api/xiaoyu/memory/chat',
      handler: HttpResponse.asyncHandler(handleMemoryChat, 'xiaoyu.memory.chat')
    },
    {
      method: 'POST',
      path: '/api/xiaoyu/test/desktop',
      handler: HttpResponse.asyncHandler(handleDesktopToolsTest, 'xiaoyu.test.desktop')
    },
    {
      method: 'GET',
      path: '/api/xiaoyu/test/desktop/tools',
      handler: HttpResponse.asyncHandler(handleDesktopToolsList, 'xiaoyu.test.desktop.tools')
    },
    {
      method: 'GET',
      path: '/api/xiaoyu/test/plugins',
      handler: HttpResponse.asyncHandler(handlePluginsList, 'xiaoyu.test.plugins')
    },
    {
      method: 'POST',
      path: '/api/xiaoyu/test/plugin/match',
      handler: HttpResponse.asyncHandler(handlePluginTest, 'xiaoyu.test.plugin.match')
    },
    {
      method: 'GET',
      path: '/api/xiaoyu/test/plugins/stats',
      handler: HttpResponse.asyncHandler(handlePluginStats, 'xiaoyu.test.plugins.stats')
    }
  ]
};
