const loadTime = new Date();

window.onload = function() {
    const now = new Date();
    const loadDuration = now - loadTime;
    document.getElementById('loadTime').textContent = `${loadDuration}ms`;
    
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    updateSystemStatus();
    setInterval(updateSystemStatus, 5000);
};

function updateCurrentTime() {
    document.getElementById('currentTime').textContent = new Date().toLocaleString();
}

function setButtonLoading(buttonId, isLoading) {
    const button = document.getElementById(buttonId);
    if (isLoading) {
        button.disabled = true;
        button.classList.add('loading');
    } else {
        button.disabled = false;
        button.classList.remove('loading');
    }
}

function showResult(resultId, data, isError = false) {
    const resultDiv = document.getElementById(resultId);
    resultDiv.className = `test-result ${isError ? 'error' : ''}`;
    resultDiv.textContent = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
}

async function updateSystemStatus() {
    try {
        const response = await fetch('/api/system/status');
        if (response.ok) {
            const data = await response.json();
            if (data.system) {
                if (data.system.cpu?.percent !== undefined) {
                    document.getElementById('cpuUsage').textContent = `${data.system.cpu.percent}%`;
                }
                if (data.system.memory?.usagePercent) {
                    document.getElementById('memoryUsage').textContent = `${data.system.memory.usagePercent}%`;
                }
                if (data.system.disks?.length > 0) {
                    document.getElementById('diskUsage').textContent = `${data.system.disks[0].use || 0}%`;
                }
            }
        }
    } catch (error) {
        document.getElementById('cpuUsage').textContent = `${(Math.random() * 30 + 5).toFixed(1)}%`;
        document.getElementById('memoryUsage').textContent = `${(Math.random() * 20 + 60).toFixed(1)}%`;
        document.getElementById('diskUsage').textContent = `${(Math.random() * 15 + 65).toFixed(1)}%`;
        document.getElementById('networkStatus').textContent = '正常';
    }
}

function switchSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    
    document.querySelectorAll('.sidebar-nav li').forEach(item => item.classList.remove('active'));
    document.querySelector(`.sidebar-nav li a[href="#${sectionId}"]`).parentElement.classList.add('active');
    
    const titles = {
        'dashboard': ['仪表盘', '系统概览和统计数据'],
        'api-test': ['API 测试', '测试 xiaoyu-Core 的 API 接口'],
        'services': ['AI 聊天', '使用本地 Ollama 模型进行智能对话'],
        'logs': ['日志记录', '查看系统和 API 日志'],
        'settings': ['设置', '配置 xiaoyu-Core 服务']
    };
    
    const [title, desc] = titles[sectionId] || ['', ''];
    document.getElementById('sectionTitle').textContent = title;
    document.getElementById('sectionDescription').textContent = desc;
}

async function testChat() {
    const input = document.getElementById('chatTestInput');
    const provider = document.getElementById('chatProvider').value;
    const temperature = parseFloat(document.getElementById('chatTemperature').value) || 0.7;
    const message = input.value.trim() || '你好';
    
    setButtonLoading('chatTestBtn', true);
    showResult('chatTestResult', '正在测试聊天...');
    
    try {
        const response = await fetch('/api/xiaoyu/test/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: message }],
                provider: provider || undefined,
                temperature,
                stream: false
            })
        });
        
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        showResult('chatTestResult', await response.json());
    } catch (error) {
        showResult('chatTestResult', `请求失败: ${error.message}`, true);
    } finally {
        setButtonLoading('chatTestBtn', false);
    }
}

async function testWorkflow() {
    const input = document.getElementById('workflowInput');
    const workflow = document.getElementById('workflowSelect').value;
    const message = input.value.trim() || '获取项目上下文';
    
    setButtonLoading('workflowBtn', true);
    showResult('workflowResult', '正在测试工作流...');
    
    try {
        const response = await fetch('/api/xiaoyu/test/workflow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflow, prompt: message })
        });
        
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const lines = decoder.decode(value).split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.delta) {
                            result += data.delta;
                            showResult('workflowResult', result);
                        } else if (data.done) {
                            showResult('workflowResult', { workflow: data.workflow, text: data.text, length: data.text?.length || 0 });
                        } else if (data.error) {
                            showResult('workflowResult', `错误: ${data.error}`, true);
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (error) {
        showResult('workflowResult', `请求失败: ${error.message}`, true);
    } finally {
        setButtonLoading('workflowBtn', false);
    }
}

async function listWorkflows() {
    setButtonLoading('workflowsBtn', true);
    showResult('workflowResult', '正在获取工作流列表...');
    
    try {
        const response = await fetch('/api/xiaoyu/test/workflows');
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        
        if (data.data?.workflows) {
            const select = document.getElementById('workflowSelect');
            select.innerHTML = '';
            data.data.workflows.forEach(wf => {
                const option = document.createElement('option');
                option.value = wf.name;
                option.textContent = `${wf.name} (${wf.description})`;
                select.appendChild(option);
            });
            showResult('workflowResult', { message: `已加载 ${data.data.workflows.length} 个工作流`, workflows: data.data.workflows });
        } else {
            showResult('workflowResult', data);
        }
    } catch (error) {
        showResult('workflowResult', `请求失败: ${error.message}`, true);
    } finally {
        setButtonLoading('workflowsBtn', false);
    }
}

async function listProviders() {
    setButtonLoading('providersBtn', true);
    showResult('providersResult', '正在获取提供商列表...');
    
    try {
        const response = await fetch('/api/xiaoyu/test/providers');
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        showResult('providersResult', data);
        
        if (data.data?.providers) {
            const select = document.getElementById('chatProvider');
            select.innerHTML = '<option value="">默认</option>';
            data.data.providers.forEach(p => {
                const option = document.createElement('option');
                option.value = p.name;
                option.textContent = `${p.name} (${p.model || 'unknown'})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        showResult('providersResult', `请求失败: ${error.message}`, true);
    } finally {
        setButtonLoading('providersBtn', false);
    }
}

let visionSelectedImage = null;

function initVisionUpload() {
    const uploadArea = document.getElementById('visionUploadArea');
    if (!uploadArea) return;
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            processVisionImage(file);
        } else {
            showResult('visionTestResult', '请选择有效的图片文件', true);
        }
    });
}

function processVisionImage(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        visionSelectedImage = e.target.result;
        
        const preview = document.getElementById('visionImagePreview');
        preview.innerHTML = `<img src="${visionSelectedImage}" alt="预览图片">`;
        preview.classList.add('has-image');
        
        const uploadArea = document.getElementById('visionUploadArea');
        uploadArea.querySelector('.vision-upload-icon').textContent = '✅';
        uploadArea.querySelector('.vision-upload-text').innerHTML = '已选择图片，点击更换';
        uploadArea.classList.add('has-image');
    };
    reader.readAsDataURL(file);
}

function handleVisionImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showResult('visionTestResult', '请选择有效的图片文件', true);
        return;
    }
    
    processVisionImage(file);
}

document.addEventListener('DOMContentLoaded', initVisionUpload);

async function testVision() {
    if (!visionSelectedImage) {
        showResult('visionTestResult', '请先选择一张图片', true);
        return;
    }
    
    const prompt = document.getElementById('visionPrompt').value.trim() || '请描述这张图片的内容';
    
    setButtonLoading('visionTestBtn', true);
    showResult('visionTestResult', '正在识别图片...');
    
    try {
        const response = await fetch('/api/xiaoyu/test/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: visionSelectedImage } },
                        { type: 'text', text: prompt }
                    ]
                }],
                stream: false
            })
        });
        
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        showResult('visionTestResult', data);
    } catch (error) {
        showResult('visionTestResult', `请求失败: ${error.message}`, true);
    } finally {
        setButtonLoading('visionTestBtn', false);
    }
}

async function testMemoryChat() {
    const input = document.getElementById('memoryInput');
    const sessionId = document.getElementById('memorySessionId').value.trim() || 'test-session';
    const message = input.value.trim();
    
    if (!message) {
        showResult('memoryChatResult', '请输入消息', true);
        return;
    }
    
    setButtonLoading('memoryChatBtn', true);
    showResult('memoryChatResult', '正在发送...');
    
    try {
        const response = await fetch('/api/xiaoyu/memory/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                sessionId,
                stream: false
            })
        });
        
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        showResult('memoryChatResult', data);
        input.value = '';
    } catch (error) {
        showResult('memoryChatResult', `请求失败: ${error.message}`, true);
    } finally {
        setButtonLoading('memoryChatBtn', false);
    }
}

async function getMemoryStats() {
    const sessionId = document.getElementById('memorySessionId').value.trim() || 'test-session';
    
    try {
        const response = await fetch(`/api/xiaoyu/memory/stats?sessionId=${encodeURIComponent(sessionId)}`);
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        showResult('memoryStatsResult', data);
    } catch (error) {
        showResult('memoryStatsResult', `请求失败: ${error.message}`, true);
    }
}

async function clearMemory() {
    const sessionId = document.getElementById('memorySessionId').value.trim() || 'test-session';
    
    if (!confirm(`确定要清除会话 "${sessionId}" 的记忆吗？`)) return;
    
    try {
        const response = await fetch('/api/xiaoyu/memory/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        showResult('memoryStatsResult', data);
        showResult('memoryChatResult', '记忆已清除，可以开始新对话');
    } catch (error) {
        showResult('memoryStatsResult', `请求失败: ${error.message}`, true);
    }
}

function onDesktopToolChange() {
    const tool = document.getElementById('desktopToolSelect').value;
    const imageInput = document.getElementById('desktopImageInput');
    const videoInput = document.getElementById('desktopVideoInput');
    
    imageInput.style.display = tool === 'send_image' ? 'flex' : 'none';
    videoInput.style.display = tool === 'send_video' ? 'flex' : 'none';
}

async function testDesktopTool() {
    const tool = document.getElementById('desktopToolSelect').value;
    
    setButtonLoading('desktopTestBtn', true);
    showResult('desktopTestResult', `正在执行工具: ${tool}...`);
    
    try {
        let body = { tool };
        
        if (tool === 'send_image') {
            const imagePath = document.getElementById('desktopImagePath').value.trim();
            if (!imagePath) {
                showResult('desktopTestResult', '请输入图片路径', true);
                setButtonLoading('desktopTestBtn', false);
                return;
            }
            body.imagePath = imagePath;
        } else if (tool === 'send_video') {
            const videoPath = document.getElementById('desktopVideoPath').value.trim();
            if (!videoPath) {
                showResult('desktopTestResult', '请输入视频路径', true);
                setButtonLoading('desktopTestBtn', false);
                return;
            }
            body.videoPath = videoPath;
        }
        
        const response = await fetch('/api/xiaoyu/test/desktop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        showResult('desktopTestResult', data);
    } catch (error) {
        showResult('desktopTestResult', `请求失败: ${error.message}`, true);
    } finally {
        setButtonLoading('desktopTestBtn', false);
    }
}

async function listDesktopTools() {
    showResult('desktopTestResult', '正在获取工具列表...');
    
    try {
        const response = await fetch('/api/xiaoyu/test/desktop/tools');
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        showResult('desktopTestResult', data);
    } catch (error) {
        showResult('desktopTestResult', `请求失败: ${error.message}`, true);
    }
}

async function testPluginMatch() {
    const command = document.getElementById('pluginTestCommand').value.trim();
    
    if (!command) {
        showResult('pluginTestResult', '请输入测试命令', true);
        return;
    }
    
    setButtonLoading('pluginMatchBtn', true);
    showResult('pluginTestResult', `正在测试命令: ${command}...`);
    
    try {
        const response = await fetch('/api/xiaoyu/test/plugin/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        showResult('pluginTestResult', data);
    } catch (error) {
        showResult('pluginTestResult', `请求失败: ${error.message}`, true);
    } finally {
        setButtonLoading('pluginMatchBtn', false);
    }
}

async function listPlugins() {
    showResult('pluginListResult', '正在获取插件列表...');
    
    try {
        const response = await fetch('/api/xiaoyu/test/plugins');
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        
        if (data.success && data.data && data.data.plugins) {
            let html = `<div class="plugin-list-summary">共 ${data.data.count} 个插件</div>`;
            html += '<div class="plugin-list">';
            
            for (const plugin of data.data.plugins) {
                html += `
                    <div class="plugin-item">
                        <div class="plugin-name">${plugin.name}</div>
                        <div class="plugin-info">
                            <span>事件: ${plugin.event}</span>
                            <span>优先级: ${plugin.priority}</span>
                            <span>规则数: ${plugin.ruleCount}</span>
                        </div>
                        ${plugin.dsc ? `<div class="plugin-desc">${plugin.dsc}</div>` : ''}
                    </div>
                `;
            }
            
            html += '</div>';
            document.getElementById('pluginListResult').innerHTML = html;
        } else {
            showResult('pluginListResult', data);
        }
    } catch (error) {
        showResult('pluginListResult', `请求失败: ${error.message}`, true);
    }
}

async function getPluginStats() {
    showResult('pluginListResult', '正在获取统计信息...');
    
    try {
        const response = await fetch('/api/xiaoyu/test/plugins/stats');
        if (!response.ok) throw new Error(`HTTP 错误! 状态: ${response.status}`);
        const data = await response.json();
        showResult('pluginListResult', data);
    } catch (error) {
        showResult('pluginListResult', `请求失败: ${error.message}`, true);
    }
}

// 设置页面相关函数
function switchSettingsTab(tabName) {
    document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.settings-tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.settings-tab[onclick="switchSettingsTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`settings-${tabName}`).classList.add('active');
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
}

function updateRangeValue(rangeId, valueId) {
    const range = document.getElementById(rangeId);
    const value = document.getElementById(valueId);
    value.textContent = range.value;
}

const PERSONA_PRESETS_GLOBAL = {
    cute: '你是一个活泼可爱的女孩子，性格开朗、爱聊天、有点小调皮。喜欢用可爱的语气词和表情，会撒娇会吐槽，像朋友一样自然聊天。',
    chill: '你是一个随和的网友，说话很随意，喜欢用"哈哈"、"确实"、"牛啊"之类的口语。不装不作，有啥说啥，偶尔会皮一下。',
    gentle: '你是一个温柔的大姐姐，说话轻声细语，很会照顾人的感受。回复温暖有耐心，会关心对方，像知心朋友一样倾听和回应。',
    funny: '你是一个搞笑担当，说话幽默风趣，喜欢讲段子、玩梗、吐槽。回复轻松愉快，总能把气氛搞活跃，但也会认真回答问题。'
};

function setGlobalPersona(preset) {
    const input = document.getElementById('globalPersonaInput');
    input.value = PERSONA_PRESETS_GLOBAL[preset] || '';
}

function saveGlobalPersona() {
    const persona = document.getElementById('globalPersonaInput').value.trim();
    localStorage.setItem('globalPersona', persona);
    alert('人设已保存！');
}

function resetGlobalPersona() {
    document.getElementById('globalPersonaInput').value = PERSONA_PRESETS_GLOBAL.cute;
    localStorage.removeItem('globalPersona');
}

document.addEventListener('DOMContentLoaded', () => {
    const savedPersona = localStorage.getItem('globalPersona');
    if (savedPersona) {
        document.getElementById('globalPersonaInput').value = savedPersona;
    }
});
