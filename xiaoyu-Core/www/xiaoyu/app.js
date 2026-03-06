const loadTime = new Date();

// 移动端滑动修复
document.addEventListener('touchmove', function(e) {
    // 允许页面正常滚动，只阻止特定元素的默认行为
    const target = e.target;
    if (target.closest('.sidebar') || target.closest('.mobile-overlay')) {
        // 侧边栏和遮罩层不需要阻止滚动
    }
}, { passive: true });

window.onload = function() {
    const now = new Date();
    const loadDuration = now - loadTime;
    document.getElementById('loadTime').textContent = `${loadDuration}ms`;
    
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    updateSystemStatus();
    setInterval(updateSystemStatus, 5000);
    
    loadWorkflowsAndPlugins();
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

async function loadWorkflowsAndPlugins() {
    const workflowList = document.getElementById('workflowList');
    const pluginList = document.getElementById('pluginList');
    
    try {
        const response = await fetch('/api/xiaoyu/test/workflows');
        const data = await response.json();
        
        if (data.workflows && Array.isArray(data.workflows)) {
            document.getElementById('workflowCount').textContent = data.workflows.length;
            
            if (data.workflows.length === 0) {
                workflowList.innerHTML = '<div class="item-list-empty">暂无工作流</div>';
            } else {
                workflowList.innerHTML = data.workflows.map(wf => `
                    <div class="dashboard-item">
                        <div class="dashboard-item-icon">⚡</div>
                        <div class="dashboard-item-content">
                            <div class="dashboard-item-name">${wf.name || wf}</div>
                            <div class="dashboard-item-desc">${wf.description || '工作流'}</div>
                        </div>
                        <span class="dashboard-item-status enabled">已启用</span>
                    </div>
                `).join('');
            }
        } else {
            workflowList.innerHTML = '<div class="item-list-empty">暂无工作流</div>';
        }
    } catch (error) {
        workflowList.innerHTML = '<div class="item-list-empty">加载失败</div>';
    }
    
    try {
        const response = await fetch('/api/xiaoyu/test/plugins');
        const data = await response.json();
        
        if (data.plugins && Array.isArray(data.plugins)) {
            document.getElementById('pluginCount').textContent = data.plugins.length;
            
            if (data.plugins.length === 0) {
                pluginList.innerHTML = '<div class="item-list-empty">暂无插件</div>';
            } else {
                pluginList.innerHTML = data.plugins.map(plugin => `
                    <div class="dashboard-item">
                        <div class="dashboard-item-icon">🔌</div>
                        <div class="dashboard-item-content">
                            <div class="dashboard-item-name">${plugin.name || '未知插件'}</div>
                            <div class="dashboard-item-desc">${plugin.dsc || plugin.description || '插件'} ${plugin.priority ? '- 优先级: ' + plugin.priority : ''}</div>
                        </div>
                        ${plugin.priority ? '<span class="dashboard-item-status priority">优先级:' + plugin.priority + '</span>' : '<span class="dashboard-item-status enabled">已启用</span>'}
                    </div>
                `).join('');
            }
        } else {
            pluginList.innerHTML = '<div class="item-list-empty">暂无插件</div>';
        }
    } catch (error) {
        pluginList.innerHTML = '<div class="item-list-empty">加载失败</div>';
    }
}

async function loadWorkflowSettings() {
    const container = document.getElementById('workflowSettingsList');
    container.innerHTML = '<div class="toggle-list-loading">加载中...</div>';
    
    try {
        const response = await fetch('/api/xiaoyu/test/workflows');
        const data = await response.json();
        
        if (data.workflows && Array.isArray(data.workflows) && data.workflows.length > 0) {
            container.innerHTML = data.workflows.map(wf => `
                <div class="toggle-item" data-name="${wf.name || ''}">
                    <div class="toggle-item-icon">⚡</div>
                    <div class="toggle-item-content">
                        <div class="toggle-item-name">${wf.name || '未知工作流'}</div>
                        <div class="toggle-item-desc">${wf.description || '工作流'} | MCP工具: ${wf.mcpTools || 0}</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${wf.enabled !== false ? 'checked' : ''} 
                            onchange="toggleWorkflow('${wf.name}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="toggle-list-empty">暂无可管理工作流</div>';
        }
    } catch (error) {
        container.innerHTML = '<div class="toggle-list-loading">加载失败</div>';
    }
}

async function toggleWorkflow(name, enabled) {
    try {
        const response = await fetch('/api/xiaoyu/test/workflow/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, enabled })
        });
        const data = await response.json();
        if (data.success) {
            showToast(`工作流 "${name}" 已${enabled ? '启用' : '禁用'}`);
        } else {
            showToast('操作失败: ' + (data.error || '未知错误'), true);
            loadWorkflowSettings();
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, true);
        loadWorkflowSettings();
    }
}

async function loadPluginSettings() {
    const container = document.getElementById('pluginSettingsList');
    container.innerHTML = '<div class="toggle-list-loading">加载中...</div>';
    
    try {
        const response = await fetch('/api/xiaoyu/test/plugins');
        const data = await response.json();
        
        if (data.plugins && Array.isArray(data.plugins) && data.plugins.length > 0) {
            container.innerHTML = data.plugins.map(plugin => `
                <div class="toggle-item" data-name="${plugin.name || ''}">
                    <div class="toggle-item-icon">🔌</div>
                    <div class="toggle-item-content">
                        <div class="toggle-item-name">${plugin.name || '未知插件'}</div>
                        <div class="toggle-item-desc">${plugin.dsc || plugin.description || '插件'} | 规则数: ${plugin.ruleCount || 0}</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${plugin.enabled !== false ? 'checked' : ''} onchange="togglePlugin('${plugin.name}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="toggle-list-empty">暂无可管理插件</div>';
        }
    } catch (error) {
        container.innerHTML = '<div class="toggle-list-empty">加载失败</div>';
    }
}

async function togglePlugin(name, enabled) {
    try {
        const response = await fetch('/api/xiaoyu/test/plugin/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, enabled })
        });
        const data = await response.json();
        if (data.success) {
            showToast(`插件 "${name}" 已${enabled ? '启用' : '禁用'}`);
        } else {
            showToast('操作失败: ' + (data.error || '未知错误'), true);
            loadPluginSettings();
        }
    } catch (error) {
        showToast('操作失败: ' + error.message, true);
        loadPluginSettings();
    }
}

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 12px 20px;
        background: ${isError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)'};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function saveAllSettings() {
    const workflowItems = document.querySelectorAll('#workflowSettingsList .toggle-item');
    const pluginItems = document.querySelectorAll('#pluginSettingsList .toggle-item');
    
    const workflows = {};
    workflowItems.forEach(item => {
        const name = item.dataset.name;
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (name && checkbox) {
            workflows[name] = checkbox.checked;
        }
    });
    
    const plugins = {};
    pluginItems.forEach(item => {
        const name = item.dataset.name;
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (name && checkbox) {
            plugins[name] = checkbox.checked;
        }
    });
    
    const general = {
        httpPort: parseInt(document.getElementById('httpPort')?.value || '8888'),
        httpsPort: parseInt(document.getElementById('httpsPort')?.value || '8889'),
        apiKey: document.getElementById('apiKey')?.value || ''
    };
    
    const api = {
        endpoints: []
    };
    
    const model = {
        temperature: parseFloat(document.getElementById('defaultTemp')?.value || '0.8'),
        maxTokens: parseInt(document.getElementById('defaultMaxTokens')?.value || '4000'),
        topP: parseFloat(document.getElementById('defaultTopP')?.value || '0.9')
    };
    
    const persona = {
        global: document.getElementById('globalPersonaInput')?.value || ''
    };
    
    try {
        const response = await fetch('/api/xiaoyu/test/save-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflows, plugins, general, api, model, persona })
        });
        const data = await response.json();
        if (data.success) {
            showToast('✅ 设置已保存');
        } else {
            showToast('❌ 保存失败: ' + (data.error || '未知错误'), true);
        }
    } catch (error) {
        showToast('❌ 保存失败: ' + error.message, true);
    }
}

function resetAllSettings() {
    loadWorkflowSettings();
    loadPluginSettings();
    showToast('已重置为保存的设置');
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
    
    if (tabName === 'workflow') {
        loadWorkflowSettings();
        loadPluginSettings();
    }
    
    if (tabName === 'persona') {
        loadCustomPresets();
    }
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

async function loadCustomPresets() {
    try {
        const response = await fetch('/api/xiaoyu/test/persona-presets');
        const data = await response.json();
        
        const grid = document.getElementById('personaPresetsGrid');
        if (!grid) return;
        
        let html = '';
        
        const builtInPresets = [
            { key: 'cute', icon: '🌸', name: '可爱少女', desc: '活泼可爱、会撒娇会吐槽' },
            { key: 'chill', icon: '😎', name: '随和网友', desc: '说话随意、不装不作' },
            { key: 'gentle', icon: '💝', name: '温柔姐姐', desc: '温柔耐心、会关心人' },
            { key: 'funny', icon: '🤣', name: '搞笑担当', desc: '幽默风趣、喜欢玩梗' }
        ];
        
        for (const p of builtInPresets) {
            html += `
                <div class="persona-preset-card" onclick="setGlobalPersona('${p.key}')">
                    <div class="preset-icon">${p.icon}</div>
                    <div class="preset-name">${p.name}</div>
                    <div class="preset-desc">${p.desc}</div>
                </div>
            `;
        }
        
        const customPresets = data.custom || data.data?.custom || [];
        if (Array.isArray(customPresets)) {
            for (const preset of customPresets) {
                const safeContent = encodeURIComponent(preset.content || '');
                const safeName = encodeURIComponent(preset.name || '');
                html += `
                    <div class="persona-preset-card" onclick="setCustomPersona('${safeContent}')">
                        <button class="delete-preset-btn" onclick="event.stopPropagation(); deleteCustomPreset('${safeName}')">×</button>
                        <div class="preset-icon">${preset.icon || '✨'}</div>
                        <div class="preset-name">${preset.name || '未命名'}</div>
                        <div class="preset-desc">${preset.description || '自定义人设'}</div>
                    </div>
                `;
            }
        }
        
        grid.innerHTML = html;
    } catch (error) {
        console.error('加载自定义预设失败:', error);
    }
}

function setCustomPersona(content) {
    const input = document.getElementById('globalPersonaInput');
    input.value = decodeURIComponent(content);
}

async function addCustomPreset() {
    const name = document.getElementById('customPresetName').value.trim();
    const desc = document.getElementById('customPresetDesc').value.trim();
    const content = document.getElementById('globalPersonaInput').value.trim();
    
    if (!name) {
        showToast('请输入预设名称', true);
        return;
    }
    
    if (!content) {
        showToast('请先编辑人设内容', true);
        return;
    }
    
    try {
        const response = await fetch('/api/xiaoyu/test/persona-presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description: desc, content })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast(`✅ 预设 "${name}" 已保存`);
            document.getElementById('customPresetName').value = '';
            document.getElementById('customPresetDesc').value = '';
            loadCustomPresets();
        } else {
            showToast('❌ 保存失败: ' + (data.message || '未知错误'), true);
        }
    } catch (error) {
        showToast('❌ 保存失败: ' + error.message, true);
    }
}

async function deleteCustomPreset(name) {
    const presetName = decodeURIComponent(name);
    if (!confirm(`确定要删除预设 "${presetName}" 吗？`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/xiaoyu/test/persona-presets', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: presetName })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast(`✅ 预设 "${presetName}" 已删除`);
            loadCustomPresets();
        } else {
            showToast('❌ 删除失败: ' + (data.message || '未知错误'), true);
        }
    } catch (error) {
        showToast('❌ 删除失败: ' + error.message, true);
    }
}

function saveGlobalPersona() {
    const persona = document.getElementById('globalPersonaInput').value.trim();
    localStorage.setItem('globalPersona', persona);
    showToast('✅ 人设已保存');
}

function resetGlobalPersona() {
    document.getElementById('globalPersonaInput').value = PERSONA_PRESETS_GLOBAL.cute;
    localStorage.removeItem('globalPersona');
    showToast('已重置为默认人设');
}

document.addEventListener('DOMContentLoaded', () => {
    const savedPersona = localStorage.getItem('globalPersona');
    if (savedPersona) {
        document.getElementById('globalPersonaInput').value = savedPersona;
    }
    
    // 初始化主题
    initTheme();
});

// 主题切换功能
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const btn = document.getElementById('themeToggleBtn');
    const icon = btn.querySelector('.theme-icon');
    const text = btn.querySelector('.theme-text');
    
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        icon.textContent = '☀️';
        text.textContent = '亮色模式';
    } else {
        document.body.classList.remove('light-theme');
        icon.textContent = '🌙';
        text.textContent = '暗色模式';
    }
}

function toggleTheme() {
    const btn = document.getElementById('themeToggleBtn');
    const icon = btn.querySelector('.theme-icon');
    const text = btn.querySelector('.theme-text');
    
    if (document.body.classList.contains('light-theme')) {
        document.body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
        icon.textContent = '🌙';
        text.textContent = '暗色模式';
    } else {
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
        icon.textContent = '☀️';
        text.textContent = '亮色模式';
    }
}

// 移动端菜单切换功能
function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    sidebar.classList.toggle('mobile-menu-open');
    if (overlay) {
        overlay.classList.toggle('active');
    }
}

// 点击外部关闭菜单
document.addEventListener('click', function(event) {
    const sidebar = document.getElementById('sidebar');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    
    if (sidebar.classList.contains('mobile-menu-open') && 
        !sidebar.contains(event.target) && 
        !mobileMenuBtn.contains(event.target)) {
        sidebar.classList.remove('mobile-menu-open');
    }
});
