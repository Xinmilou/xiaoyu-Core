import { HttpResponse } from '#utils/http-utils.js';

/**
 * xiaoyu-Core 示例API
 * 提供示例功能演示
 */
export default {
  name: 'xiaoyu-example',
  dsc: 'xiaoyu-Core示例API',
  priority: 200,
  init: async (app, Bot) => {
    // 初始化逻辑
  },

  routes: [
    {
      method: 'GET',
      path: '/api/xiaoyu/hello',
      handler: HttpResponse.asyncHandler(async (req, res, Bot) => {
        HttpResponse.success(res, {
          message: 'Hello from xiaoyu-Core!',
          timestamp: Date.now(),
          service: 'xiaoyu-Core',
          status: 'operational'
        });
      }, 'xiaoyu.hello')
    },

    {
      method: 'GET',
      path: '/api/xiaoyu/status',
      handler: HttpResponse.asyncHandler(async (req, res, Bot) => {
        HttpResponse.success(res, {
          status: 'healthy',
          service: 'xiaoyu-Core',
          timestamp: Date.now(),
          uptime: process.uptime()
        });
      }, 'xiaoyu.status')
    },

    {
      method: 'POST',
      path: '/api/xiaoyu/echo',
      handler: HttpResponse.asyncHandler(async (req, res, Bot) => {
        const { message = 'Default echo message' } = req.body;
        HttpResponse.success(res, {
          echo: message,
          timestamp: Date.now(),
          service: 'xiaoyu-Core'
        });
      }, 'xiaoyu.echo')
    }
  ]
};