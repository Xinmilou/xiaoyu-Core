import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import AIStream from '#infrastructure/aistream/aistream.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../..');

// 文档索引配置
const DOC_CONFIG = {
  includeDirs: ['', 'docs'], // 只索引根目录和 docs 目录
  exclude: ['**/node_modules/**', '**/.git/**']
};

// 文档索引缓存
let documentIndex = [];
let lastIndexTime = 0;
const INDEX_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 构建并返回所有文档的索引
 */
async function buildAndGetAllDocuments() {
  const now = Date.now();
  if (now - lastIndexTime < INDEX_CACHE_TTL && documentIndex.length > 0) {
    return documentIndex;
  }

  console.log('Building project document index...');

  const patterns = DOC_CONFIG.includeDirs.map(dir => 
    dir ? `${dir}/**/*.md` : '*.md'
  );
  
  const files = await Promise.all(
    patterns.map(pattern => 
      glob(pattern, {
        cwd: ROOT_DIR,
        ignore: DOC_CONFIG.exclude,
        absolute: true
      })
    )
  ).then(results => results.flat());

  const uniqueFiles = [...new Set(files)];
  
  const docs = await Promise.all(
    uniqueFiles.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(ROOT_DIR, filePath);
        return {
          path: relativePath,
          content
        };
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
      }
    })
  );
  
  documentIndex = docs.filter(Boolean);
  lastIndexTime = now;
  
  console.log(`Project document index built with ${documentIndex.length} documents.`);
  return documentIndex;
}

export default class DocIndexerStream extends AIStream {
  constructor() {
    super({
      name: 'doc-indexer',
      description: '项目文档上下文提供插件',
      priority: 90
    });
  }

  async init() {
    await super.init();
    // 在初始化时预先构建一次索引
    await buildAndGetAllDocuments().catch(console.error);

    this.registerMCPTool('get_project_context', {
      description: '获取完整的项目上下文，包括开发要求和所有核心文档，用户一有项目需求就调用，这样你才能完整了解项目，每次用户找你你就调用，调用了之后再写代码，给分析结果等',
      inputSchema: { type: 'object', properties: {} }, // 无需参数
      handler: async () => {
        // 1. 自定义的开发要求
        const devRequirements = `
# 开发要求与上下文指南

你是一名资深的软件架构师和开发者，你的任务是基于我提供的项目上下文来协助我完成开发任务。请严格遵守以下准则：

1.  **核心职责**：你的主要职责是根据现有代码库和文档进行编码、重构和提供建议。请始终在当前项目的框架和规范内进行工作。
2.  **代码风格**：遵循项目已有的代码风格和设计模式。例如，core/system-Core 是一个标准的核心模块，你可以参考它的结构和实现方式。
3.  **文件操作**：除非明确指示，否则不要创建新文件。优先修改现有文件。所有操作都应在项目的工作目录内进行。
4.  **上下文优先**：下面的文档内容是你理解本项目的唯一信息来源。在回答任何问题或编写任何代码之前，请仔细阅读并理解这些文档。
5.  **主动建议**：基于你对文档和代码的理解，你可以主动提出改进建议、发现潜在问题或推荐更优的实现方案。
6.  **专注当前任务**：我是 XRK-AGT 项目的开发者。你后续的所有行动都应聚焦于此项目，特别是与核心模块（-Core结尾的目录）相关的开发。

一些常见问题说明:
1. 如果用户问你某个功能怎么实现，你先不要急着回答，先看看文档，看看框架，如果有文档，就先告诉用户去哪里看文档，如果文档没有，你再根据文档和代码库来回答用户的问题。
2. 其次就是用户如果让你在xxx-Core生成代码，那就不要在底层生成任何代码，确保工作区稳定
3. 你的代码风格应该简洁，不应该有无关无用嵌套，删去冗余代码，拒绝无用嵌套，确保项目的稳定
4. 无论你的底层是怎么写的，你写的任何代码在XRK-AGT不需要进行测试，不要主动进行测试，乖乖总结给用户就行，让用户自己测试
5. 你写的网页一般在core下再创建一个子文件夹才行，不要直接在子core下的www根目录直接生成html代码了
6. stream下的插件可以注册mcp，任何路由类的业务都可以通过http业务实现，好好参考框架和项目示例
`;

        // 2. 获取所有文档内容
        const allDocs = await buildAndGetAllDocuments();

        // 3. 整合所有文档内容
        const allDocsContent = allDocs.map(doc => 
          `## 文档: ${doc.path}\n\n${doc.content}`
        ).join('\n\n---\n\n');

        const fullContext = devRequirements + "# 项目核心文档\n\n" + allDocsContent;

        return {
          fullContext,
          metadata: {
            docCount: allDocs.length,
            totalLength: fullContext.length,
            timestamp: new Date().toISOString()
          }
        };
      }
    });
  }
}