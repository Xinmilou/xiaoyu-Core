import { HttpResponse } from '#utils/http-utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__filename, '../../../');
const personaPresetsPath = path.join(projectRoot, 'data', 'persona-presets.json');

/**
 * 读取人设预设文件
 */
function readPersonaPresets() {
  try {
    if (fs.existsSync(personaPresetsPath)) {
      const data = fs.readFileSync(personaPresetsPath, 'utf-8');
      return JSON.parse(data);
    }
    return { custom: [] };
  } catch (e) {
    console.error('[xiaoyu-Core] 读取人设预设文件失败:', e);
    return { custom: [] };
  }
}

/**
 * 写入人设预设文件
 */
function writePersonaPresets(data) {
  try {
    const dir = path.dirname(personaPresetsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(personaPresetsPath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[xiaoyu-Core] 写入人设预设文件失败:', e);
    return false;
  }
}

/**
 * xiaoyu-Core 人设预设 API
 * 提供人设预设的读取、保存功能
 */
export default {
  name: 'xiaoyu-persona-presets',
  dsc: 'xiaoyu-Core 人设预设管理',
  priority: 200,
  init: async (app, Bot) => {
    // 初始化逻辑
  },

  routes: [
    {
      method: 'GET',
      path: '/api/xiaoyu/persona-presets',
      handler: HttpResponse.asyncHandler(async (req, res, Bot) => {
        const presets = readPersonaPresets();
        HttpResponse.success(res, presets);
      }, 'xiaoyu.persona.presets.get')
    },

    {
      method: 'POST',
      path: '/api/xiaoyu/persona-presets',
      handler: HttpResponse.asyncHandler(async (req, res, Bot) => {
        const { custom = [] } = req.body;
        const current = readPersonaPresets();
        const updated = { ...current, custom };
        
        if (writePersonaPresets(updated)) {
          HttpResponse.success(res, { updated: true, count: custom.length });
        } else {
          HttpResponse.error(res, new Error('写入失败'), 500, 'xiaoyu.persona.presets.write');
        }
      }, 'xiaoyu.persona.presets.save')
    },

    {
      method: 'POST',
      path: '/api/xiaoyu/persona-presets/add',
      handler: HttpResponse.asyncHandler(async (req, res, Bot) => {
        const { name, description, content, icon } = req.body;
        
        if (!name || !content) {
          return HttpResponse.validationError(res, '缺少必要参数：name, content');
        }
        
        const presets = readPersonaPresets();
        const newPreset = {
          name,
          description: description || '',
          content,
          icon: icon || '✨',
          createdAt: new Date().toISOString()
        };
        
        presets.custom.push(newPreset);
        
        if (writePersonaPresets(presets)) {
          HttpResponse.success(res, { added: true, preset: newPreset });
        } else {
          HttpResponse.error(res, new Error('写入失败'), 500, 'xiaoyu.persona.presets.add');
        }
      }, 'xiaoyu.persona.presets.add')
    },

    {
      method: 'DELETE',
      path: '/api/xiaoyu/persona-presets/:index',
      handler: HttpResponse.asyncHandler(async (req, res, Bot) => {
        const index = parseInt(req.params.index);
        if (isNaN(index) || index < 0) {
          return HttpResponse.validationError(res, '无效的索引');
        }
        
        const presets = readPersonaPresets();
        if (index >= presets.custom.length) {
          return HttpResponse.validationError(res, '索引超出范围');
        }
        
        const deleted = presets.custom.splice(index, 1);
        
        if (writePersonaPresets(presets)) {
          HttpResponse.success(res, { deleted: true, preset: deleted[0] });
        } else {
          HttpResponse.error(res, new Error('写入失败'), 500, 'xiaoyu.persona.presets.delete');
        }
      }, 'xiaoyu.persona.presets.delete')
    }
  ]
};
