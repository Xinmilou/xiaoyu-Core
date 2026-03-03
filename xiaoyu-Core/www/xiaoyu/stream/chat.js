let chatHistory = [];
let selectedImage = null;
let currentProvider = '';
let currentPersona = '';
const sessionId = 'web-chat-' + Date.now();

const PERSONA_PRESETS = {
    default: '',
    cute: '你是一个活泼可爱的女孩子，性格开朗、爱聊天、有点小调皮。喜欢用可爱的语气词和表情，会撒娇会吐槽，像朋友一样自然聊天。',
    chill: '你是一个随和的网友，说话很随意，喜欢用"哈哈"、"确实"、"牛啊"之类的口语。不装不作，有啥说啥，偶尔会皮一下。',
    gentle: '你是一个温柔的大姐姐，说话轻声细语，很会照顾人的感受。回复温暖有耐心，会关心对方，像知心朋友一样倾听和回应。',
    funny: '你是一个搞笑担当，说话幽默风趣，喜欢讲段子、玩梗、吐槽。回复轻松愉快，总能把气氛搞活跃，但也会认真回答问题。'
};

async function loadProviders() {
    try {
        const response = await fetch('/api/xiaoyu/test/providers');
        if (!response.ok) throw new Error('获取提供商列表失败');
        const data = await response.json();
        
        if (data.providers && data.providers.length > 0) {
            const modelSelect = document.getElementById('aiModelSelect');
            const panelModelSelect = document.getElementById('panelModelSelect');
            
            modelSelect.innerHTML = '';
            panelModelSelect.innerHTML = '';
            
            data.providers.forEach(p => {
                const option1 = document.createElement('option');
                option1.value = p.name;
                option1.textContent = p.label || `${p.name} (${p.model || 'unknown'})`;
                modelSelect.appendChild(option1);
                
                const option2 = document.createElement('option');
                option2.value = p.name;
                option2.textContent = p.label || `${p.name} (${p.model || 'unknown'})`;
                panelModelSelect.appendChild(option2);
            });
            
            if (data.defaultProvider) {
                modelSelect.value = data.defaultProvider;
                panelModelSelect.value = data.defaultProvider;
                currentProvider = data.defaultProvider;
            }
            
            updateModelInfo(data.providers);
        }
    } catch (error) {
        console.error('加载提供商列表失败:', error);
        document.getElementById('aiModelSelect').innerHTML = '<option value="">加载失败</option>';
        document.getElementById('panelModelSelect').innerHTML = '<option value="">加载失败</option>';
    }
}

function updateModelInfo(providers) {
    const selectedName = document.getElementById('aiModelSelect').value;
    const provider = providers.find(p => p.name === selectedName);
    const modelInfo = document.getElementById('modelInfo');
    
    if (provider) {
        modelInfo.innerHTML = `
            <p><strong>模型:</strong> ${provider.model || '未知'}</p>
            <p><strong>类型:</strong> ${provider.visionModel ? '视觉模型' : '文本模型'}</p>
            <p><strong>地址:</strong> ${provider.baseUrl || '默认'}</p>
        `;
    } else {
        modelInfo.innerHTML = '<p>请选择一个模型</p>';
    }
}

function onModelChange() {
    const modelSelect = document.getElementById('aiModelSelect');
    currentProvider = modelSelect.value;
    document.getElementById('panelModelSelect').value = currentProvider;
    
    fetch('/api/xiaoyu/test/providers')
        .then(res => res.json())
        .then(data => updateModelInfo(data.providers))
        .catch(() => {});
}

function syncModelSelect() {
    const panelModelSelect = document.getElementById('panelModelSelect');
    currentProvider = panelModelSelect.value;
    document.getElementById('aiModelSelect').value = currentProvider;
    
    fetch('/api/xiaoyu/test/providers')
        .then(res => res.json())
        .then(data => updateModelInfo(data.providers))
        .catch(() => {});
}

function openSettingsPanel() {
    document.getElementById('settingsPanel').classList.add('open');
    document.getElementById('settingsOverlay').classList.add('show');
}

function closeSettingsPanel() {
    document.getElementById('settingsPanel').classList.remove('open');
    document.getElementById('settingsOverlay').classList.remove('show');
}

function setPersonaPreset(preset) {
    const personaInput = document.getElementById('personaInput');
    personaInput.value = PERSONA_PRESETS[preset] || '';
}

function savePersona() {
    const personaInput = document.getElementById('personaInput');
    currentPersona = personaInput.value.trim();
    
    const personaPreview = document.getElementById('personaPreview');
    if (currentPersona) {
        personaPreview.textContent = currentPersona.length > 30 ? currentPersona.substring(0, 30) + '...' : currentPersona;
        personaPreview.title = currentPersona;
    } else {
        personaPreview.textContent = '默认人设';
        personaPreview.title = '';
    }
    
    localStorage.setItem('chatPersona', currentPersona);
    closeSettingsPanel();
    addMessage('system', '人设已保存');
}

function resetPersona() {
    document.getElementById('personaInput').value = '';
    currentPersona = '';
    document.getElementById('personaPreview').textContent = '默认人设';
    document.getElementById('personaPreview').title = '';
    localStorage.removeItem('chatPersona');
}

function loadSavedPersona() {
    const saved = localStorage.getItem('chatPersona');
    if (saved) {
        currentPersona = saved;
        document.getElementById('personaInput').value = saved;
        const personaPreview = document.getElementById('personaPreview');
        personaPreview.textContent = saved.length > 30 ? saved.substring(0, 30) + '...' : saved;
        personaPreview.title = saved;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadProviders();
    loadSavedPersona();
});

function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        addMessage('system', '请选择有效的图片文件');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        selectedImage = e.target.result;
        const preview = document.getElementById('imagePreview');
        preview.innerHTML = `
            <div class="preview-item">
                <img src="${selectedImage}" alt="预览图片">
                <button class="remove-btn" onclick="clearSelectedImage()">✕</button>
            </div>
        `;
        preview.style.display = 'flex';
    };
    reader.readAsDataURL(file);
}

function clearSelectedImage() {
    selectedImage = null;
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';
    preview.style.display = 'none';
    document.getElementById('imageInput').value = '';
}

function handleChatKeypress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message && !selectedImage) return;
    
    const sendBtn = document.getElementById('chatSendBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = '发送中...';
    
    const userMessage = { role: 'user', content: [] };
    
    if (selectedImage) {
        userMessage.content.push({
            type: 'image_url',
            image_url: { url: selectedImage }
        });
        addMessageWithImage('user', message || '请描述这张图片', selectedImage);
    } else {
        addMessage('user', message);
    }
    
    if (message) {
        userMessage.content.push({ type: 'text', text: message });
    }
    
    chatHistory.push(userMessage);
    input.value = '';
    clearSelectedImage();
    
    const requestBody = {
        messages: chatHistory,
        stream: true,
        sessionId: sessionId
    };
    
    if (currentProvider) {
        requestBody.provider = currentProvider;
    }
    
    if (currentPersona) {
        requestBody.persona = currentPersona;
    }
    
    try {
        const response = await fetch('/api/xiaoyu/test/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP 错误! 状态: ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiMessage = '';
        let messageElement = null;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.delta) {
                            aiMessage += data.delta;
                            if (!messageElement) {
                                messageElement = addMessage('assistant', aiMessage);
                            } else {
                                updateMessage(messageElement, aiMessage);
                            }
                        } else if (data.error) {
                            addMessage('system', `错误: ${data.error}`);
                        }
                    } catch (e) {}
                }
            }
        }
        
        if (aiMessage) {
            chatHistory.push({ role: 'assistant', content: aiMessage });
        } else {
            addMessage('assistant', '(无响应内容)');
        }
    } catch (error) {
        addMessage('system', `请求失败: ${error.message}`);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
    }
}

function addMessage(role, content) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    const processedContent = processMessageContent(content);
    div.innerHTML = `<div class="message-content">${processedContent}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

function addMessageWithImage(role, content, imageUrl) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    const processedContent = processMessageContent(content);
    div.innerHTML = `
        <div class="message-content">
            ${imageUrl ? `<img src="${imageUrl}" class="message-image" alt="用户图片">` : ''}
            ${processedContent}
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

function processMessageContent(content) {
    if (!content) return '<p></p>';
    
    const imageUrlRegex = /\[图片\]\s*(https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|gif|webp|bmp))/gi;
    const videoUrlRegex = /\[视频\]\s*(https?:\/\/[^\s<>"']+\.(?:mp4|webm|ogg|mov))/gi;
    
    let processed = content;
    
    processed = processed.replace(imageUrlRegex, (match, url) => {
        return `<img src="${url}" class="message-image" alt="图片" onclick="openImagePreview('${url}')">`;
    });
    
    processed = processed.replace(videoUrlRegex, (match, url) => {
        return `<video src="${url}" class="message-video" controls></video>`;
    });
    
    const urlRegex = /(https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|gif|webp|bmp))(?![^<]*>)/gi;
    processed = processed.replace(urlRegex, (url) => {
        return `<img src="${url}" class="message-image" alt="图片" onclick="openImagePreview('${url}')">`;
    });
    
    processed = processed.replace(/\n/g, '<br>');
    
    if (!processed.includes('<img') && !processed.includes('<video')) {
        processed = `<p>${escapeHtml(processed)}</p>`;
    }
    
    return processed;
}

function openImagePreview(url) {
    const overlay = document.createElement('div');
    overlay.className = 'image-preview-overlay';
    overlay.onclick = () => overlay.remove();
    overlay.innerHTML = `
        <div class="image-preview-container">
            <img src="${url}" alt="预览">
            <button class="close-preview" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function updateMessage(element, content) {
    const contentDiv = element.querySelector('.message-content');
    if (contentDiv) {
        contentDiv.innerHTML = processMessageContent(content);
    }
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function clearChatScreen() {
    const container = document.getElementById('chatMessages');
    container.innerHTML = `
        <div class="message system">
            <div class="message-content">
                <p>聊天屏幕已清空，上下文记忆保留中...</p>
            </div>
        </div>
    `;
}

async function clearChatMemory() {
    try {
        const response = await fetch('/api/xiaoyu/memory/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            chatHistory = [];
            const container = document.getElementById('chatMessages');
            container.innerHTML = `
                <div class="message system">
                    <div class="message-content">
                        <p>上下文记忆已清除，开始新的对话吧！</p>
                    </div>
                </div>
            `;
        } else {
            addMessage('system', '清除记忆失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        chatHistory = [];
        const container = document.getElementById('chatMessages');
        container.innerHTML = `
            <div class="message system">
                <div class="message-content">
                    <p>上下文记忆已清除（本地），开始新的对话吧！</p>
                </div>
            </div>
        `;
    }
}
