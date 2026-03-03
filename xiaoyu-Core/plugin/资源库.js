import path from 'path';
import querystring from 'querystring';
import { setGlobalDispatcher, Agent } from 'undici';

setGlobalDispatcher(new Agent({
  connectTimeout: 30000,
  headersTimeout: 60000,
  bodyTimeout: 60000
}));

// 开关：是否允许分享（如需禁用，改为 false）
const DEFAULT_SHARING = true;

// API Token配置
const API_TOKEN = 'atS1EmIz3rdigzqE859zdnB2soxmIMI8cEhYX_J1wEowVQVCAEv05QXniLPQJrS-Nq6Rj4CS8f0Egj63olsfdv7FEGkYsGQpUSQb_FYJ0YAOVcv72dOEGdLj5370IQq-Xy1zmNjMcUYfvQHzyE725EsvayjqorelZd9gJkqPNEc';

// B站API常量
const BILIBILI_API = {
  VIDEO_DETAIL: 'https://api.bilibili.com/x/web-interface/view',
  VIDEO_PLAYURL: 'https://api.bilibili.com/x/player/playurl',
  SHORT_URL_REDIRECT: 'https://b23.tv/'
};

// waifu.im API请求头配置
const WAIFU_IM_HEADERS = new Headers();
WAIFU_IM_HEADERS.append('Accept-Version', 'v6');
WAIFU_IM_HEADERS.append('Authorization', `Bearer ${API_TOKEN}`);

const URLS = {
  img: {
    random: 'https://www.dmoe.cc/random.php?return=json',
    touhou: 'https://img.paulzzh.com/touhou/random',
    anime: 'https://api.mtyqx.cn/api/random.php',
    meizi: 'https://api.mmp.cc/api/kswallpaper?category=meizi&type=jpg',
    ks: 'https://api.mmp.cc/api/kswallpaper?category=kuaishou&type=jpg',
    cos: 'https://api.mmp.cc/api/kswallpaper?category=cos&type=jpg',
    waifu: 'https://api.waifu.pics/nsfw/waifu',
    waifuMany: 'https://api.waifu.pics/many/nsfw/waifu',
    waifuFav: 'https://api.waifu.im/fav',
    waifuImSearch: 'https://api.waifu.im/search'
  },
  video: {
    baisi: 'https://api.mmp.cc/api/ksvideo?type=json&id=BaiSi',
    jk: 'https://api.mmp.cc/api/ksvideo?type=json&id=jk',
    heisi: 'https://api.mmp.cc/api/ksvideo?type=json&id=HeiSi',
    rewu: 'https://api.mmp.cc/api/ksvideo?type=json&id=ReWu',
    gzlxjj: 'https://api.mmp.cc/api/ksvideo?type=json&id=GaoZhiLiangXiaoJieJie',
    luoli: 'https://api.mmp.cc/api/ksvideo?type=json&id=LuoLi',
    random: 'https://api.mmp.cc/api/ksvideo?type=json'
  }
};

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeout || 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  const fetchOptions = { 
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
    signal: controller.signal
  };
  
  try {
    const res = await fetch(url, fetchOptions);
    clearTimeout(timeout);
    
    if (!res.ok) throw new Error(`请求失败: ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      throw new Error(`响应非 JSON，content-type=${ct}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(`请求超时 (${timeoutMs}ms)`);
    }
    throw err;
  }
}

// 记忆存储对象，用于保存每个用户或群聊的消息历史
const memoryStore = {
  // 存储结构：{ userId: { messages: [], timestamp: Date }, groupId: { messages: [], timestamp: Date } }
  store: {},
  
  // 获取或创建记忆
  getMemory(key) {
    if (!this.store[key]) {
      this.store[key] = {
        messages: [],
        timestamp: Date.now()
      };
    }
    return this.store[key];
  },
  
  // 保存消息到记忆
  saveMessage(key, message) {
    const memory = this.getMemory(key);
    memory.messages.push(message);
    memory.timestamp = Date.now();
    
    // 限制记忆长度，只保留最近的20条消息
    if (memory.messages.length > 20) {
      memory.messages = memory.messages.slice(-20);
    }
  },
  
  // 获取记忆中的消息历史
  getMessages(key, limit = 10) {
    const memory = this.getMemory(key);
    return memory.messages.slice(-limit);
  },
  
  // 清理过期记忆（超过1小时未使用的记忆）
  cleanup() {
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    
    for (const key in this.store) {
      if (now - this.store[key].timestamp > hour) {
        delete this.store[key];
      }
    }
  }
};

// 定期清理过期记忆
setInterval(() => {
  memoryStore.cleanup();
}, 60 * 60 * 1000); // 每小时清理一次

export class AvatarPlugin extends plugin {
  constructor() {
    super({
      name: '向日葵资源库',
      dsc: '向日葵资源库',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#?随机图片', fnc: 'img_random' },
        { reg: '^#?(随机)?东方图', fnc: 'img_touhou' },
        { reg: '^#?(随机)?二次元图', fnc: 'img_anime' },
        { reg: '^#?白丝(视频)?', fnc: 'vid_baisi' },
        { reg: '^#?黑丝(视频)?', fnc: 'vid_heisi' },
        { reg: '^#?jk(视频)?', fnc: 'vid_jk' },
        { reg: '^#?高质量小姐姐(视频)?', fnc: 'vid_gzlxjj' },
        { reg: '^#?热舞(视频)?', fnc: 'vid_rewu' },
        { reg: '^#?萝莉(视频)?', fnc: 'vid_luoli' },
        { reg: '^#?小姐姐(视频)?', fnc: 'vid_random' },
        { reg: '^#?ks网红', fnc: 'img_ks' },
        { reg: '^#?cos图', fnc: 'img_cos' },
        { reg: '^#?妹子图', fnc: 'img_meizi' },
        { reg: '^#?(随机)?waifu', fnc: 'img_waifu' },
        { reg: '^#?(多张|批量)?waifu', fnc: 'img_waifu_many' },
        { reg: '^#?waifu搜索\s*', fnc: 'img_waifu_im_search' },
        { reg: '^#?waifu搜索\s*', fnc: 'img_waifu_im_search' },
        { reg: '^#?(播放)?B站(视频)?[:：]?\s*(.+)$', fnc: 'vid_bilibili' },
        { reg: '^#?waifu收藏|^#?我的收藏', fnc: 'img_fav' },
        { reg: '^#?(收藏|waifu收藏添加)\s*\d+$', fnc: 'img_fav_add' },
        { reg: '^#?waifu搜索id\s*\d+$', fnc: 'img_waifu_by_id' },
        { reg: '^#?查看记忆|^#?记忆记录', fnc: 'showMemory' }
      ]
    });
    this._path = process.cwd();
    this.configDir = path.join(this._path, 'data', 'xrkconfig');
    this.configFile = path.join(this.configDir, 'config.yaml'); // 预留：如未来需要文件配置
  }
  
  // 获取记忆键（根据私聊或群聊）
  getMemoryKey() {
    if (this.e.isPrivate) {
      // 私聊：使用userId
      return `user_${this.e.user_id}`;
    } else {
      // 群聊：使用groupId
      return `group_${this.e.group_id}`;
    }
  }
  
  // 保存消息到记忆
  saveToMemory() {
    const key = this.getMemoryKey();
    const message = {
      type: 'user',
      content: this.e.msg,
      timestamp: Date.now()
    };
    memoryStore.saveMessage(key, message);
  }
  
  // 保存回复到记忆
  saveReplyToMemory(reply) {
    const key = this.getMemoryKey();
    const message = {
      type: 'bot',
      content: typeof reply === 'string' ? reply : JSON.stringify(reply),
      timestamp: Date.now()
    };
    memoryStore.saveMessage(key, message);
  }
  
  // 获取记忆中的消息历史
  getMemoryHistory(limit = 10) {
    const key = this.getMemoryKey();
    return memoryStore.getMessages(key, limit);
  }
  
  // 显示记忆（用于调试）
  async showMemory() {
    const history = this.getMemoryHistory(20);
    if (history.length === 0) {
      await this.e.reply('暂无记忆记录');
      return;
    }
    
    let reply = '记忆记录：\n';
    history.forEach((msg, index) => {
      const sender = msg.type === 'user' ? '我' : '机器人';
      reply += `${index + 1}. [${sender}] ${msg.content}\n`;
    });
    
    await this.e.reply(reply);
  }

  async checkSharing() {
    // 仅使用常量控制，避免外部依赖
    if (!DEFAULT_SHARING) {
      await this.e.reply('当前已禁用资源分享');
      return false;
    }
    return true;
  }

  async sendImg(url) {
    if (!url || !(await this.checkSharing())) return false;
    const reply = ['芝士你要的图片', segment.image(url)];
    await this.e.reply(reply);
    // 保存回复到记忆
    this.saveReplyToMemory(reply);
    return true;
  }

  async sendVideo(apiUrl) {
    if (!(await this.checkSharing())) return false;
    try {
      const data = await fetchJson(apiUrl);
      // 兼容多种字段名
      const link = data.link || data.url || data.video || data.play || data.playurl;
      if (!link) {
        const reply = '视频链接获取失败';
        await this.e.reply(reply);
        // 保存回复到记忆
        this.saveReplyToMemory(reply);
        return false;
      }
      const reply = [segment.video(link), '看吧涩批！'];
      await this.e.reply(reply);
      // 保存回复到记忆
      this.saveReplyToMemory(reply);
      return true;
    } catch (err) {
      const reply = `获取视频失败：${err.message}`;
      await this.e.reply(reply);
      // 保存回复到记忆
      this.saveReplyToMemory(reply);
      return false;
    }
  }

  /**
   * 提取B站链接中的BV/AV号（支持短链接、完整链接、纯BV/AV号）
   * @param {string} input - 输入的链接/标识
   * @returns {string|null} BV/AV号（如BV1xx411c7m9/av123456）
   */
  extractBVAV(input) {
    if (!input) return null;
    
    // 匹配BV号（BV开头+10位字符）
    const bvMatch = input.match(/BV([A-Za-z0-9]{10})/i);
    if (bvMatch) return `BV${bvMatch[1]}`;

    // 匹配AV号（av开头+数字）
    const avMatch = input.match(/av(\d+)/i);
    if (avMatch) return `av${avMatch[1]}`;

    // 匹配b23短链接
    const b23Match = input.match(/b23\.tv\/(\w+)/i);
    if (b23Match) return b23Match[1];

    return null;
  }

  /**
   * 解析b23短链接到真实B站链接
   * @param {string} shortCode - b23短链接后缀（如123456）
   * @returns {string|null} 真实B站链接
   */
  async resolveB23ShortUrl(shortCode) {
    try {
      const response = await fetch(`${BILIBILI_API.SHORT_URL_REDIRECT}${shortCode}`, {
        method: 'HEAD',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      return response.url || null;
    } catch (err) {
      return null;
    }
  }

  /**
   * 获取B站视频的播放地址（用于预览）
   * @param {string} bvid - BV号
   * @param {number} cid - 视频cid
   * @param {number} aid - AV号（可选）
   * @returns {string|null} 视频流地址
   */
  async getBilibiliVideoPlayUrl(bvid, cid, aid = null) {
    if (!cid) return null;
    
    try {
      // 构建播放API参数，使用fnval=16+128=144，支持mp4+hls格式，确保包含音频
      const params = {
        bvid: bvid,
        cid: cid,
        qn: 16, // 清晰度：16=360P, 32=480P, 64=720P, 80=1080P，使用较低清晰度以加快加载
        fnval: 16, // 视频格式：16=mp4
        fnver: 0,
        fourk: 0
      };
      
      const apiUrl = `${BILIBILI_API.VIDEO_PLAYURL}?${querystring.stringify(params)}`;
      
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.bilibili.com/'
        }
      });

      const data = await response.json();
      if (data.code !== 0 || !data.data) {
        return null;
      }

      // 获取视频流地址（优先使用durl中的第一个）
      const videoUrl = data.data.durl?.[0]?.url || data.data.dash?.video?.[0]?.baseUrl || null;
      return videoUrl;
    } catch (err) {
      return null;
    }
  }

  /**
   * 获取B站视频的播放页面链接和基本信息（通过BV/AV号）
   * @param {string} bvav - BV/AV号
   * @returns {Object|null} {url: 视频播放页链接, title: 视频标题, pic: 封面图, author: 作者, cid: 视频cid, previewUrl: 预览视频地址}
   */
  async getBilibiliVideoInfo(bvav) {
    if (!bvav) return null;

    // 如果是b23短链接后缀，先解析真实链接
    if (!bvav.startsWith('BV') && !bvav.startsWith('av')) {
      const realUrl = await this.resolveB23ShortUrl(bvav);
      if (!realUrl) return null;
      // 从真实链接中重新提取BV/AV号
      bvav = this.extractBVAV(realUrl);
      if (!bvav) return null;
    }

    // 调用B站API获取视频基本信息（验证有效性）
    try {
      const params = bvav.startsWith('BV') 
        ? { bvid: bvav } 
        : { aid: bvav.replace('av', '') };
      const apiUrl = `${BILIBILI_API.VIDEO_DETAIL}?${querystring.stringify(params)}`;
      
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.bilibili.com/'
        }
      });

      const data = await response.json();
      if (data.code !== 0 || !data.data) {
        return null;
      }

      const videoData = data.data;
      // 获取第一个分P的cid（用于获取视频流地址）
      const cid = videoData.pages?.[0]?.cid || videoData.cid || null;
      
      // 处理BV号和AV号
      const actualBvid = bvav.startsWith('BV') ? bvav : (videoData.bvid || null);
      const actualAid = bvav.startsWith('av') ? parseInt(bvav.replace('av', '')) : (videoData.aid || null);
      
      // 返回视频播放页链接和基本信息
      return {
        url: `https://www.bilibili.com/video/${bvav}`,
        title: videoData.title || 'B站视频',
        pic: videoData.pic || '',
        author: videoData.owner?.name || '未知UP主',
        bvid: actualBvid,
        cid: cid,
        aid: actualAid
      };
    } catch (err) {
      return null;
    }
  }

  // 图片
  async img_random() { 
    // 保存用户消息到记忆
    this.saveToMemory();
    
    if (!(await this.checkSharing())) return false;
    const data = await fetchJson(URLS.img.random);
    if (data.code && data.code !== '200') return false;
    return this.sendImg(data.imgurl || data.url || data.img);
  }
  
  async img_touhou() { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendImg(URLS.img.touhou); 
  }
  
  async img_anime()  { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendImg(URLS.img.anime); 
  }
  
  async img_meizi()  { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendImg(URLS.img.meizi); 
  }
  
  async img_ks()     { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendImg(URLS.img.ks); 
  }
  
  async img_cos()    { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendImg(URLS.img.cos); 
  }
  
  async img_waifu() { 
    // 保存用户消息到记忆
    this.saveToMemory();
    
    if (!(await this.checkSharing())) return false;
    const data = await fetchJson(URLS.img.waifu);
    return this.sendImg(data.url);
  }
  
  async img_waifu_many() { 
    // 保存用户消息到记忆
    this.saveToMemory();
    
    if (!(await this.checkSharing())) return false;
    try {
      // 批量waifu API需要POST请求，返回JSON数据包含files数组
      const response = await fetch(URLS.img.waifuMany, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ exclude: [] })
      });
      const data = await response.json();
      return this.sendImg(data.files[0]);
    } catch (err) {
      return false;
    }
  }
  
  async img_waifu_im_search() { 
    // 保存用户消息到记忆
    this.saveToMemory();
    
    if (!(await this.checkSharing())) return false;
    try {
      // 从消息中提取搜索标签
      const msg = this.e.msg || '';
      const tags = msg.replace(/^#?waifu搜索\s*/, '').trim();
      if (!tags) {
        const reply = '请提供要搜索的waifu标签，例如：#waifu搜索 raiden-shogun';
        await this.e.reply(reply);
        // 保存回复到记忆
        this.saveReplyToMemory(reply);
        return false;
      }
      
      // 构建请求URL和参数
      const params = {
        included_tags: tags.split(/\s+/),
        height: '>=2000' // 过滤高度大于等于2000的图片，提高图片质量
      };
      
      const queryParams = new URLSearchParams();
      for (const key in params) {
        if (Array.isArray(params[key])) {
          params[key].forEach(value => {
            queryParams.append(key, value);
          });
        } else {
          queryParams.set(key, params[key]);
        }
      }
      
      const requestUrl = `${URLS.img.waifuImSearch}?${queryParams.toString()}`;
      
      // 添加超时机制，避免API响应过慢导致卡住
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 延长超时时间到10秒
      
      // 使用单独的headers配置，确保使用正确的API版本
      const headers = new Headers();
      headers.append('Accept-Version', 'v5'); // 使用v5版本，与收藏功能一致
      headers.append('Authorization', `Bearer ${API_TOKEN}`);
      
      // 发送带Token和API版本的请求
      const response = await fetch(requestUrl, {
        headers: headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      // 处理不同的响应状态
      if (!response.ok) {
        // 鉴权失败常见状态码处理
        if (response.status === 401) {
          await this.e.reply('waifu API Token无效或已过期');
        } else if (response.status === 403) {
          await this.e.reply('waifu API权限不足');
        } else if (response.status === 429) {
          await this.e.reply('waifu API请求次数超限');
        } else {
          await this.e.reply(`waifu API请求失败：${response.status} ${response.statusText}`);
        }
        return false;
      }
      
      const data = await response.json();
      if (!data.images || !data.images.length) {
        await this.e.reply('未找到匹配的waifu图片');
        return false;
      }
      
      // 发送第一张图片
      return this.sendImg(data.images[0].url);
    } catch (err) {
      // 对超时错误进行更友好的处理
      if (err.name === 'AbortError') {
        await this.e.reply('搜索waifu图片超时，请稍后再试～');
      } else {
        await this.e.reply(`搜索waifu图片失败：${err.message}`);
      }
      return false;
    }
  }
  
  // 获取waifu收藏列表
  async getWaifuFavorites() {
    try {
      // 添加超时机制，避免API响应过慢导致卡住
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 延长超时时间到10秒
      
      // 使用单独的headers配置，确保使用正确的API版本
      const headers = new Headers();
      headers.append('Accept-Version', 'v5'); // 使用v5版本，与用户提供的示例一致
      headers.append('Authorization', `Bearer ${API_TOKEN}`);
      
      const response = await fetch(URLS.img.waifuFav, {
        headers: headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // 鉴权失败常见状态码处理
        if (response.status === 401) {
          return 'waifu API Token无效或已过期';
        } else if (response.status === 403) {
          return 'waifu API权限不足';
        } else if (response.status === 429) {
          return 'waifu API请求次数超限';
        } else {
          return `waifu API请求失败：${response.status} ${response.statusText}`;
        }
      }
      
      const data = await response.json();
      
      // 提取收藏的图片链接
      const favImages = data.images?.map(img => img.url) || [];
      if (favImages.length === 0) {
        return '你还没有收藏任何图片哦～';
      }
      
      // 返回文字 + 第一张收藏图片
      return [
        `✅ 你共有 ${favImages.length} 张收藏图片：`,
        segment.image(favImages[0])
      ];
    } catch (err) {
      // 对超时错误进行更友好的处理
      if (err.name === 'AbortError') {
        return '获取收藏列表超时，请稍后再试～';
      }
      return `获取收藏失败：${err.message}`;
    }
  }
  
  // 处理waifu收藏列表请求
  async img_fav() {
    if (!(await this.checkSharing())) return false;
    
    // 保存用户消息到记忆
    this.saveToMemory();
    
    const replyMsg = await this.getWaifuFavorites();
    await this.e.reply(replyMsg);
    
    // 保存回复到记忆
    this.saveReplyToMemory(replyMsg);
    return true;
  }
  
  // 向waifu.im添加图片收藏
  async addWaifuFavorites(imageId) {
    const apiUrl = 'https://api.waifu.im/fav/insert';
    const headers = new Headers();
    headers.append('Accept-Version', 'v5');
    headers.append('Authorization', `Bearer ${API_TOKEN}`);
    headers.append('Content-Type', 'application/json');
    
    try {
      // 添加超时机制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ image_id: imageId }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // 针对性处理已知错误
        if (response.status === 409) {
          return `😯 你已经收藏过 ID 为 ${imageId} 的图片啦！`;
        } else if (response.status === 404) {
          return `❌ 未找到 ID 为 ${imageId} 的图片，请核对ID！`;
        } else if (response.status === 401) {
          return 'waifu API Token无效或已过期';
        } else if (response.status === 403) {
          return 'waifu API权限不足';
        } else if (response.status === 429) {
          return 'waifu API请求次数超限';
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      }
      
      const data = await response.json();
      return `✅ 图片 ID ${imageId} 收藏成功！该图片当前共有 ${data.favorites_count} 人收藏～`;
    } catch (error) {
      // 对超时错误进行更友好的处理
      if (error.name === 'AbortError') {
        return '收藏图片超时，请稍后再试～';
      }
      return `❌ 收藏失败：${error.message}，请稍后再试～`;
    }
  }
  
  // 处理waifu添加收藏请求
  async img_fav_add() {
    if (!(await this.checkSharing())) return false;
    
    // 保存用户消息到记忆
    this.saveToMemory();
    
    // 从消息中提取图片ID
    const msg = this.e.msg || '';
    const imageIdMatch = msg.match(/^#?(收藏|waifu收藏添加)\s*(\d+)$/);
    if (!imageIdMatch || !imageIdMatch[2]) {
      const reply = '请提供要收藏的waifu图片ID，例如：#收藏 8008 或 #waifu收藏添加 8008';
      await this.e.reply(reply);
      // 保存回复到记忆
      this.saveReplyToMemory(reply);
      return false;
    }
    
    const imageId = imageIdMatch[2];
    const replyMsg = await this.addWaifuFavorites(imageId);
    await this.e.reply(replyMsg);
    
    // 保存回复到记忆
    this.saveReplyToMemory(replyMsg);
    return true;
  }
  
  // 根据ID获取waifu图片
  async getWaifuById(imageId) {
    const apiUrl = `https://api.waifu.im/${imageId}`;
    const headers = new Headers();
    headers.append('Accept-Version', 'v5');
    headers.append('Authorization', `Bearer ${API_TOKEN}`);
    
    try {
      // 添加超时机制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(apiUrl, {
        headers: headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // 针对性处理已知错误
        if (response.status === 404) {
          return `❌ 未找到 ID 为 ${imageId} 的图片，请核对ID！`;
        } else if (response.status === 401) {
          return 'waifu API Token无效或已过期';
        } else if (response.status === 403) {
          return 'waifu API权限不足';
        } else if (response.status === 429) {
          return 'waifu API请求次数超限';
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      }
      
      const data = await response.json();
      if (!data.image || !data.image.url) {
        return `❌ 未找到 ID 为 ${imageId} 的图片，请核对ID！`;
      }
      
      return data.image.url;
    } catch (error) {
      // 对超时错误进行更友好的处理
      if (error.name === 'AbortError') {
        return '获取图片超时，请稍后再试～';
      }
      return `❌ 获取图片失败：${error.message}，请稍后再试～`;
    }
  }
  
  // 根据ID搜索waifu图片
  async img_waifu_by_id() {
    if (!(await this.checkSharing())) return false;
    
    // 保存用户消息到记忆
    this.saveToMemory();
    
    // 从消息中提取图片ID
    const msg = this.e.msg || '';
    const imageIdMatch = msg.match(/^#?waifu搜索id\s*(\d+)$/);
    if (!imageIdMatch || !imageIdMatch[1]) {
      const reply = '请提供要搜索的waifu图片ID，例如：#waifu搜索id 1260';
      await this.e.reply(reply);
      // 保存回复到记忆
      this.saveReplyToMemory(reply);
      return false;
    }
    
    const imageId = imageIdMatch[1];
    const imageUrl = await this.getWaifuById(imageId);
    
    if (imageUrl.startsWith('❌') || imageUrl.startsWith('获取图片超时')) {
      await this.e.reply(imageUrl);
      // 保存回复到记忆
      this.saveReplyToMemory(imageUrl);
      return false;
    }
    
    const result = await this.sendImg(imageUrl);
    // 保存回复到记忆
    this.saveReplyToMemory('芝士你要的图片');
    return result;
  }

  // 视频
  async vid_baisi()   { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendVideo(URLS.video.baisi); 
  }
  async vid_heisi()   { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendVideo(URLS.video.heisi); 
  }
  async vid_jk()      { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendVideo(URLS.video.jk); 
  }
  async vid_gzlxjj()  { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendVideo(URLS.video.gzlxjj); 
  }
  async vid_rewu()    { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendVideo(URLS.video.rewu); 
  }
  async vid_luoli()   { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendVideo(URLS.video.luoli); 
  }
  async vid_random()  { 
    // 保存用户消息到记忆
    this.saveToMemory();
    return this.sendVideo(URLS.video.random); 
  }

  // B站视频点播
  async vid_bilibili() {
    // 保存用户消息到记忆
    this.saveToMemory();
    
    if (!(await this.checkSharing())) return false;
    
    // 从消息中提取视频标识
    const msg = this.e.msg || this.e.message || '';
    
    // 从正则匹配中提取视频ID（第3个捕获组）
    const match = msg.match(/^#?(播放)?B站(视频)?[:：]?\s*(.+)$/);
    const videoId = match && match[3] ? match[3].trim() : '';
    
    if (!videoId) {
      const reply = '❌ 请提供有效的B站视频BV/AV号、短链接或完整链接\n例如：#B站视频 BV1xx411c7m9 或 #播放B站视频 b23.tv/123456';
      await this.e.reply(reply);
      // 保存回复到记忆
      this.saveReplyToMemory(reply);
      return false;
    }

    try {
      // 1. 提取BV/AV号
      const bvav = this.extractBVAV(videoId);
      if (!bvav) {
        await this.e.reply(`❌ 无法从「${videoId}」中提取有效的B站视频标识（BV/AV号/短链接）`);
        return false;
      }

      // 2. 获取视频播放页链接和基本信息
      const videoInfo = await this.getBilibiliVideoInfo(bvav);
      if (!videoInfo) {
        await this.e.reply(`❌ 未找到该B站视频（${bvav}），可能视频不存在、已删除或无访问权限`);
        return false;
      }

      // 3. 尝试获取视频预览地址
      let previewUrl = null;
      if (videoInfo.cid && videoInfo.bvid) {
        previewUrl = await this.getBilibiliVideoPlayUrl(videoInfo.bvid, videoInfo.cid, videoInfo.aid);
      }

      // 4. 构建回复消息
      const replyParts = [];
      
      // 如果有预览视频，先发送预览（类似网红小姐姐视频）
      if (previewUrl) {
        replyParts.push(segment.video(previewUrl));
        replyParts.push(' 这是你点播的视频喵(●ˇ∀ˇ●)');
      } else if (videoInfo.pic) {
        // 如果没有预览，发送封面图
        replyParts.push(segment.image(videoInfo.pic));
      }
      
      // 发送视频信息文本
      const infoText = ``;
      replyParts.push(infoText);
      
      await this.e.reply(replyParts);
      return true;
    } catch (err) {
      await this.e.reply(`❌ 播放B站视频时出错：${err.message}`);
      return false;
    }
  }
}