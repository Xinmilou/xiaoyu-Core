import StreamLoader from '#infrastructure/aistream/loader.js';

/**
 * XXX 工作流触发插件
 * 以 xxx 开头的消息会触发工作流
 */
export default class xxx extends plugin {
  constructor() {
    super({
      name: "XXX工作流",
      dsc: "以xxx开头的消息触发工作流",
      event: "message",
      priority: 1000,
      rule: [
        {
          reg: "^xxx",
          fnc: "triggerWorkflow",
          permission: 'master'  // 仅主人可用
        }
      ]
    });
  }

  /**
   * 触发工作流（简化调用方式）
   */
  async triggerWorkflow() {
    if (!this.e.msg?.trim().startsWith('xxx')) return false;

    const question = this.e.msg.trim().substring(3).trim();
    if (!question) {
      return this.reply('请输入要询问的内容，例如：xxx在么');
    }

    const stream = StreamLoader.getStream('desktop');
    if (!stream) return this.reply('工作流未加载');

    // 简化调用：使用统一的process方法，自动处理所有功能
    // 底层会自动合并辅助工作流（memory, database等）
    // 模型配置自动从 cfg 读取，无需手动指定
    await stream.process(this.e, question, {
      enableMemory: true,
      enableDatabase: true
    });

    return true;
  }

}
