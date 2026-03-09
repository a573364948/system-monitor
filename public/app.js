// ===== WebSocket Connection =====
let ws = null;
let wsReconnectTimer = null;

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      updateConnectionStatus(true);

      // Subscribe to channels
      ws.send(JSON.stringify({
        type: 'subscribe',
        channels: ['permissions', 'alerts', 'chat'],
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      updateConnectionStatus(false);

      // Reconnect after 5 seconds
      wsReconnectTimer = setTimeout(() => {
        initWebSocket();
      }, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  } catch (error) {
    console.error('WebSocket init error:', error);
  }
}

function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'connected':
      console.log('WebSocket:', data.message);
      break;
    case 'pong':
      // Handle ping/pong
      break;
    case 'permission_update':
      // Reload permissions if on permissions tab
      if (document.querySelector('#tab-permissions.active')) {
        loadPermissions();
      }
      showNotification('权限审批', '有新的权限请求需要审批');
      break;
    case 'chat_message':
      // Reload chat if viewing this conversation
      if (currentChatSession && currentChatSession.sessionId === data.sessionId) {
        openChat(data.sessionId, data.agentId);
      }
      break;
    case 'alert':
      showNotification('系统告警', data.message);
      break;
    default:
      console.log('Unknown WebSocket message:', data);
  }
}

function updateConnectionStatus(connected) {
  // Update UI to show connection status
  const statusIndicator = document.querySelector('.connection-indicator');
  if (statusIndicator) {
    statusIndicator.classList.toggle('connected', connected);
    statusIndicator.classList.toggle('disconnected', !connected);
  }
}

function showNotification(title, message) {
  // Simple notification - can be enhanced with browser notifications
  console.log(`[Notification] ${title}: ${message}`);

  // Try to use browser notifications if permitted
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: message });
  }
}

// Ping WebSocket every 30 seconds to keep alive
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);

let dashboard = null;
let query = '';
let selectedTopic = null;
let statusFilter = 'all';

const $ = (selector) => document.querySelector(selector);

function isMobileLayout() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function fmtDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatUptime(sec) {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function projectHash(topic) {
  return `#project=${encodeURIComponent(topic)}`;
}

function setSelectedTopic(topic, skipHash = false) {
  selectedTopic = topic;
  if (!skipHash && topic) {
    history.replaceState(null, '', projectHash(topic));
  }
}

function syncTopicFromHash() {
  const hash = location.hash || '';
  const match = hash.match(/^#project=(.+)$/);
  if (match) {
    selectedTopic = decodeURIComponent(match[1]);
  }
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) button.textContent = '✓ 已复制';
    setTimeout(() => {
      if (button) button.textContent = '复制';
    }, 2000);
  } catch {
    if (button) button.textContent = text;
  }
}

function getStatusClass(status) {
  const statusMap = {
    '活跃优化中': 'active',
    '高频验证中': 'validating',
    '持续优化中': 'validating',
    '长期通用架构设计中': 'designing',
    '链路可用': 'ready',
    '已提速待继续调度优化': 'ready',
  };
  return statusMap[status] || 'ready';
}

function renderOverview(data) {
  const overview = data.overview;
  $('#generatedAt').textContent = `更新于 ${fmtDate(data.generatedAt)}`;
  $('#projectCountPill').textContent = `${overview.totalProjects} 个项目`;
  $('#overviewCards').innerHTML = [
    ['总记忆', overview.totalMemories],
    ['项目数', overview.totalProjects],
    ['偏好', overview.categoryCounts.preferences],
    ['实体', overview.categoryCounts.entities],
    ['事件', overview.categoryCounts.events],
  ].map(([label, value]) => `
    <article class="metric-card">
      <strong>${value}</strong>
      <span>${label}</span>
    </article>
  `).join('');
}

function renderQuickLinks(data) {
  const topProjects = data.overview.topProjects.slice(0, 6);
  const emojiMap = {
    'OpenClaw': '🔧',
    'GLKVM': '🖥️',
    '列车长': '🚂',
    '日报': '📊',
    'Discord': '💬',
    'OpenViking': '🧠',
  };
  $('#quickLinks').innerHTML = topProjects.map((item) => {
    const emoji = emojiMap[item.topic] || '📌';
    return `<button class="quick-link" data-topic="${escapeHtml(item.topic)}">${emoji} ${escapeHtml(item.topic)}</button>`;
  }).join('');
  document.querySelectorAll('.quick-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSelectedTopic(btn.dataset.topic);
      setActiveTab('projects');
      render();
    });
  });
}

function matches(item) {
  if (!query) return true;
  const haystack = JSON.stringify(item).toLowerCase();
  return haystack.includes(query);
}

function matchesFilter(item) {
  if (statusFilter === 'all') return true;
  const profile = item.profile || {};
  const status = profile.status || '未知';
  const statusClass = getStatusClass(status);
  return statusClass === statusFilter;
}

function renderProjects(data) {
  const items = data.projects.filter(matches).filter(matchesFilter);
  if (!selectedTopic && items[0] && !isMobileLayout()) setSelectedTopic(items[0].topic, true);
  if (selectedTopic && !items.find((item) => item.topic === selectedTopic)) {
    setSelectedTopic(!isMobileLayout() && items[0] ? items[0].topic : null, true);
  }
  $('#projectCount').textContent = `${items.length} 个主题`;
  
  // Show filter row when on projects tab
  const filterRow = $('#filterRow');
  if (filterRow) {
    filterRow.style.display = 'flex';
  }
  $('#projectsList').innerHTML = items.map((item) => {
    const profile = item.profile || {};
    const status = profile.status || '未知';
    const statusClass = getStatusClass(status);
    return `
      <article class="project-card ${item.topic === selectedTopic ? 'active' : ''}" data-topic="${escapeHtml(item.topic)}">
        <div class="project-header">
          <div class="project-title">
            <span class="status-dot ${statusClass}"></span>
            <h3>${escapeHtml(item.topic)}</h3>
          </div>
          <button class="resume-btn" data-topic="${escapeHtml(item.topic)}" onclick="event.stopPropagation(); quickResume('${escapeHtml(item.topic)}')">续接 →</button>
        </div>
        <div class="project-meta">
          <span>${status}</span>
          <span>·</span>
          <span>${item.count} 条记忆</span>
          <span>·</span>
          <span>${fmtDate(item.lastUpdatedAt)}</span>
        </div>
        <p class="project-excerpt">${escapeHtml(item.excerpt)}</p>
        <div class="project-tags">
          ${item.categories.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      </article>
    `;
  }).join('') || '<div class="empty-state"><h3>没有匹配到项目</h3><p>尝试调整搜索关键词</p></div>';

  document.querySelectorAll('.project-card').forEach((card) => {
    card.addEventListener('click', () => {
      setSelectedTopic(card.dataset.topic);
      render();
    });
  });

  if (selectedTopic && !isMobileLayout()) {
    renderProjectDetail(data);
  } else if (selectedTopic && isMobileLayout()) {
    renderProjectDetailSheet(data);
  }
}

async function quickResume(topic) {
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = '执行中...';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/dispatch?topic=${encodeURIComponent(topic)}`, {
      method: 'POST',
      cache: 'no-store',
    });
    const result = await res.json();
    
    if (result.ok) {
      btn.textContent = '✓ 完成';
      showActionResult(result);
    } else {
      btn.textContent = '✗ 失败';
    }
  } catch (error) {
    btn.textContent = '✗ 错误';
    console.error(error);
  } finally {
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 3000);
  }
}

function showActionResult(result) {
  const container = $('#actionResult');
  container.innerHTML = `
    <div class="detail-card">
      <div class="section-header">
        <h3>执行结果</h3>
        <button class="ghost-btn" onclick="$('#actionResult').innerHTML = ''">关闭</button>
      </div>
      <div class="detail-section">
        <pre>${escapeHtml(result.resultText || '无输出')}</pre>
      </div>
    </div>
  `;
}

function renderProjectDetail(data) {
  const project = data.projects.find((item) => item.topic === selectedTopic);
  if (!project) {
    $('#projectDetail').innerHTML = '';
    return;
  }

  const profile = project.profile || {};
  const nextActions = profile.nextActions || [];
  const evidence = profile.evidence || [];
  const links = profile.links || [];
  const recentMemories = project.items.slice(0, 5);

  $('#projectDetail').innerHTML = `
    <div class="detail-card">
      <div class="detail-section">
        <h2>${escapeHtml(project.topic)}</h2>
        <p class="muted small">${profile.status || '未知'}</p>
        <p class="excerpt" style="margin-top: 12px;">${escapeHtml(profile.summary || project.excerpt)}</p>
      </div>

      ${nextActions.length ? `
        <div class="detail-section">
          <h3>下一步</h3>
          <ul class="detail-list">
            ${nextActions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${recentMemories.length ? `
        <div class="detail-section">
          <h3>最近记忆 (${project.count} 条)</h3>
          <div class="detail-list">
            ${recentMemories.map((item) => `
              <div class="item-card" style="padding: 12px;">
                <div class="meta">
                  <span class="tag">${escapeHtml(item.category)}</span>
                  <span class="muted small">${fmtDate(item.updatedAt)}</span>
                </div>
                <p class="excerpt small" style="margin-top: 6px;">${escapeHtml(item.excerpt)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${(evidence.length || links.length) ? `
        <div class="detail-section">
          <h3>证据与文档</h3>
          <div class="detail-list">
            ${evidence.map((path) => `<li>📄 ${escapeHtml(path.split('/').pop())}</li>`).join('')}
            ${links.map((link) => `<li>🔗 <a href="${escapeHtml(link)}" target="_blank" style="color: var(--accent);">${escapeHtml(link)}</a></li>`).join('')}
          </div>
        </div>
      ` : ''}

      <div class="action-row">
        <button class="action-btn" onclick="quickResume('${escapeHtml(project.topic)}')">继续工作</button>
        <button class="ghost-btn" onclick="copyProjectSummary('${escapeHtml(project.topic)}')">复制摘要</button>
      </div>
    </div>
  `;
}

function renderProjectDetailSheet(data) {
  const project = data.projects.find((item) => item.topic === selectedTopic);
  if (!project) {
    $('#projectDetail').innerHTML = '';
    $('#projectDetail').classList.remove('sheet-open');
    return;
  }

  renderProjectDetail(data);
  $('#projectDetail').classList.add('sheet-open');

  // Close on backdrop click
  $('#projectDetail').onclick = (e) => {
    if (e.target.id === 'projectDetail') {
      setSelectedTopic(null);
      render();
    }
  };
}

function copyProjectSummary(topic) {
  const project = dashboard.projects.find((item) => item.topic === topic);
  if (!project) return;
  const profile = project.profile || {};
  const text = [
    `项目：${topic}`,
    `状态：${profile.status || '未知'}`,
    `摘要：${profile.summary || project.excerpt}`,
    '',
    '下一步：',
    ...(profile.nextActions || []).map((item) => `- ${item}`),
  ].join('\n');
  copyText(text, event.target);
}

function renderTimeline(data) {
  const items = data.timeline.filter(matches);
  $('#timelineSummary').textContent = `${items.length} 条记录`;
  
  const typeIcons = {
    memory: '🧠',
    daily: '📅',
    action: '⚡',
  };

  $('#timelineList').innerHTML = items.map((item) => `
    <div class="item-card">
      <div class="meta">
        <span>${typeIcons[item.type] || '•'} ${escapeHtml(item.type)}</span>
        <span>·</span>
        <span>${fmtDate(item.updatedAt)}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="excerpt">${escapeHtml(item.excerpt)}</p>
    </div>
  `).join('') || '<div class="empty-state"><h3>暂无时间线记录</h3></div>';
}

function renderAlerts(data) {
  const items = data.system.alerts.filter(matches);
  $('#alertSummary').textContent = items.length ? `${items.length} 条告警` : '无告警';
  
  const levelColors = {
    error: 'error',
    warn: 'warn',
    info: 'muted',
  };

  $('#alertList').innerHTML = items.map((item) => `
    <div class="item-card">
      <div class="meta">
        <span class="${levelColors[item.level] || 'muted'}">${escapeHtml(item.level).toUpperCase()}</span>
        <span>·</span>
        <span>${escapeHtml(item.source)}</span>
        <span>·</span>
        <span>${fmtDate(item.updatedAt)}</span>
      </div>
      <p class="excerpt">${escapeHtml(item.text)}</p>
    </div>
  `).join('') || '<div class="empty-state good"><h3>✓ 系统运行正常</h3><p>暂无告警</p></div>';
}

function renderSystem(data) {
  const sys = data.system;
  const metrics = sys.metrics;
  
  $('#systemSummary').textContent = `运行 ${formatUptime(metrics.uptimeSec)}`;
  
  $('#systemList').innerHTML = `
    <div class="detail-card">
      <div class="detail-section">
        <h3>系统指标</h3>
        <div class="detail-list">
          <li>运行时间：${formatUptime(metrics.uptimeSec)}</li>
          <li>负载：${metrics.loadavg.map((v) => v.toFixed(2)).join(' / ')}</li>
          <li>内存：${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)} (${(metrics.memory.usedRatio * 100).toFixed(1)}%)</li>
          <li>磁盘：${metrics.disk.used} / ${metrics.disk.size} (${metrics.disk.ratio})</li>
        </div>
      </div>

      <div class="detail-section">
        <h3>服务状态</h3>
        <div class="detail-list">
          ${sys.services.map((svc) => `
            <li>
              <span class="${svc.activeState === 'active' ? 'good' : 'error'}">${svc.activeState === 'active' ? '✓' : '✗'}</span>
              ${escapeHtml(svc.label)}
              <span class="muted small">(${escapeHtml(svc.subState)})</span>
            </li>
          `).join('')}
        </div>
      </div>

      <div class="detail-section">
        <h3>通道配置</h3>
        <div class="detail-list">
          ${sys.channels.map((ch) => `<li>${escapeHtml(ch.name)} ${ch.enabled ? '✓' : '✗'}</li>`).join('')}
        </div>
      </div>

      <div class="detail-section">
        <h3>网络地址</h3>
        <div class="detail-list">
          <li>本地：http://${sys.host}:${sys.port}</li>
          ${sys.lan.map((item) => `<li>${escapeHtml(item.name)}：http://${item.address}:${sys.port}</li>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderMemories(data) {
  const items = data.memories.filter(matches);
  $('#memoryList').innerHTML = items.map((item) => `
    <div class="item-card">
      <div class="meta">
        <span class="tag">${escapeHtml(item.category)}</span>
        <span class="tag">${escapeHtml(item.topic)}</span>
        <span>·</span>
        <span>${fmtDate(item.updatedAt)}</span>
      </div>
      <p class="excerpt">${escapeHtml(item.excerpt)}</p>
    </div>
  `).join('') || '<div class="empty-state"><h3>暂无记忆</h3></div>';
}

function renderActivity(data) {
  const items = data.recentActions.filter(matches);
  $('#activityList').innerHTML = items.map((item) => `
    <div class="item-card">
      <div class="meta">
        <span>${escapeHtml(item.topic)}</span>
        <span>·</span>
        <span class="${item.ok ? 'good' : 'error'}">${item.ok ? '✓ 成功' : '✗ 失败'}</span>
        <span>·</span>
        <span>${fmtDate(item.createdAt)}</span>
      </div>
      <p class="excerpt">${escapeHtml(item.prompt || item.resultText || '无输出')}</p>
    </div>
  `).join('') || '<div class="empty-state"><h3>暂无操作记录</h3></div>';
}

function renderEvidence(data) {
  const items = data.evidenceIndex.filter(matches);
  $('#evidenceList').innerHTML = items.map((item) => `
    <div class="item-card">
      <div class="meta">
        <span class="tag">${escapeHtml(item.topic)}</span>
        <span>·</span>
        <span>${item.kind === 'file' ? '📄' : '🔗'} ${escapeHtml(item.kind)}</span>
      </div>
      <p class="excerpt">${escapeHtml(item.label)}</p>
    </div>
  `).join('') || '<div class="empty-state"><h3>暂无文档</h3></div>';
}

function renderDaily(data) {
  const items = data.dailyNotes.filter(matches);
  $('#dailyList').innerHTML = items.map((item) => `
    <div class="item-card">
      <div class="meta">
        <span>📅 ${escapeHtml(item.date)}</span>
        <span>·</span>
        <span>${fmtDate(item.updatedAt)}</span>
      </div>
      <p class="excerpt">${escapeHtml(item.excerpt)}</p>
    </div>
  `).join('') || '<div class="empty-state"><h3>暂无日志</h3></div>';
}

function renderWorkspace(data) {
  const items = data.workspace;
  $('#workspaceList').innerHTML = items.map((item) => `
    <div class="item-card">
      <h3>${escapeHtml(item.name)}</h3>
      <div class="meta">
        ${item.exists ? `
          <span>${formatBytes(item.size)}</span>
          <span>·</span>
          <span>${fmtDate(item.updatedAt)}</span>
        ` : '<span class="muted">不存在</span>'}
      </div>
    </div>
  `).join('');
}

function render() {
  if (!dashboard) return;
  
  renderProjects(dashboard);
  
  const activeTab = document.querySelector('.tab.active')?.dataset.tab;
  if (activeTab === 'timeline') renderTimeline(dashboard);
  if (activeTab === 'alerts') renderAlerts(dashboard);
  if (activeTab === 'system') renderSystem(dashboard);
  if (activeTab === 'memories') renderMemories(dashboard);
  if (activeTab === 'activity') renderActivity(dashboard);
  if (activeTab === 'evidence') renderEvidence(dashboard);
  if (activeTab === 'daily') renderDaily(dashboard);
  if (activeTab === 'workspace') renderWorkspace(dashboard);
}

function setActiveTab(tabName) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });

  // Close project detail sheet on mobile when switching tabs
  if (isMobileLayout() && tabName !== 'projects') {
    setSelectedTopic(null);
    $('#projectDetail').classList.remove('sheet-open');
  }

  // Load data for specific tabs
  if (tabName === 'dashboard' && dashboard) {
    renderDashboard(dashboard).catch(err => console.error('Dashboard render error:', err));
  } else if (tabName === 'chat') {
    loadChatList();
  } else if (tabName === 'permissions') {
    loadPermissions();
  } else if (tabName === 'share') {
    loadShareHistory();
  } else if (tabName === 'commands') {
    loadCommands();
  }

  render();
}

async function fetchDashboard() {
  try {
    // Show skeleton on first load
    if (!dashboard) {
      showSkeleton();
    }

    const res = await fetch('/api/dashboard', { cache: 'no-store' });
    dashboard = await res.json();

    // Render dashboard if on dashboard tab
    if (document.querySelector('#tab-dashboard.active')) {
      await renderDashboard(dashboard);
    } else {
      // Otherwise render old views for projects tab
      renderOverview(dashboard);
      renderQuickLinks(dashboard);
    }

    render();
  } catch (error) {
    console.error('Failed to fetch dashboard:', error);
    showError('加载失败，请刷新重试');
  }
}

function showSkeleton() {
  $('#projectsList').innerHTML = Array(4).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-line short"></div>
      <div class="skeleton skeleton-line medium" style="margin-top: 12px;"></div>
      <div class="skeleton skeleton-line long" style="margin-top: 8px;"></div>
    </div>
  `).join('');
}

function showError(message) {
  $('#projectsList').innerHTML = `
    <div class="empty-state error">
      <h3>✗ ${escapeHtml(message)}</h3>
      <button class="action-btn" onclick="fetchDashboard()" style="margin-top: 16px;">重新加载</button>
    </div>
  `;
}

// ===== Chat Functions =====
let currentChatSession = null;

async function loadChatList() {
  try {
    const res = await fetch('/api/chat/conversations');
    const data = await res.json();
    if (data.ok) {
      renderChatList(data.conversations);
    }
  } catch (error) {
    console.error('Failed to load chat list:', error);
  }
}

function renderChatList(conversations) {
  const list = $('#chatList');
  if (!conversations || conversations.length === 0) {
    list.innerHTML = '<div class="item-card"><p class="muted">暂无对话</p></div>';
    return;
  }

  list.innerHTML = conversations.map((conv) => `
    <div class="item-card" style="cursor: pointer;" onclick="openChat('${escapeHtml(conv.sessionId)}', '${escapeHtml(conv.agentId)}')">
      <h3>${escapeHtml(conv.sessionId)}</h3>
      <p class="excerpt">${escapeHtml(conv.firstMessage || '无消息')}</p>
      <div class="meta muted">
        <span>更新于 ${fmtDate(conv.updatedAt)}</span>
      </div>
    </div>
  `).join('');
}

async function openChat(sessionId, agentId = 'main') {
  currentChatSession = { sessionId, agentId };
  $('#chatSessionId').textContent = `会话: ${sessionId}`;
  $('#chatList').style.display = 'none';
  $('#chatDetail').style.display = 'block';

  try {
    const res = await fetch(`/api/chat/conversations/${sessionId}?agent=${agentId}`);
    const data = await res.json();
    if (data.ok) {
      renderChatMessages(data.messages);
    }
  } catch (error) {
    console.error('Failed to load chat:', error);
  }
}

function renderChatMessages(messages) {
  const container = $('#chatMessages');
  container.innerHTML = messages.map((msg) => {
    const role = msg.role || 'user';
    const content = msg.content || msg.text || JSON.stringify(msg);
    return `
      <div class="chat-message ${role}">
        <div class="chat-role">${role}</div>
        <div class="chat-content">${escapeHtml(content)}</div>
      </div>
    `;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = $('#chatInput');
  const message = input.value.trim();
  if (!message || !currentChatSession) return;

  const btn = $('#sendMessageBtn');
  btn.disabled = true;
  btn.textContent = '发送中...';

  try {
    const res = await fetch(`/api/chat/conversations/${currentChatSession.sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        agentId: currentChatSession.agentId,
      }),
    });

    const data = await res.json();
    if (data.ok) {
      input.value = '';
      openChat(currentChatSession.sessionId, currentChatSession.agentId);
    } else {
      alert('发送失败: ' + (data.error || '未知错误'));
    }
  } catch (error) {
    alert('发送失败: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '发送';
  }
}

async function createNewChat() {
  const message = prompt('请输入第一条消息:');
  if (!message) return;

  try {
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, agentId: 'main' }),
    });

    const data = await res.json();
    if (data.ok && data.sessionId) {
      await loadChatList();
      openChat(data.sessionId, 'main');
    } else {
      alert('创建对话失败: ' + (data.error || '未知错误'));
    }
  } catch (error) {
    alert('创建对话失败: ' + error.message);
  }
}

// ===== Permissions Functions =====
async function loadPermissions() {
  try {
    const res = await fetch('/api/chat/pending-permissions');
    const data = await res.json();
    if (data.ok) {
      renderPermissions(data.permissions);
    }
  } catch (error) {
    console.error('Failed to load permissions:', error);
  }
}

function renderPermissions(permissions) {
  const list = $('#permissionsList');
  if (!permissions || permissions.length === 0) {
    list.innerHTML = '<div class="item-card"><p class="muted">暂无待审批权限</p></div>';
    return;
  }

  list.innerHTML = permissions.map((perm, idx) => `
    <div class="item-card">
      <h3>权限请求 #${idx + 1}</h3>
      <pre style="white-space: pre-wrap; font-size: 12px;">${escapeHtml(JSON.stringify(perm, null, 2))}</pre>
      <div style="margin-top: 12px;">
        <button class="primary-btn" onclick="approvePermission('${idx}')">批准</button>
        <button class="ghost-btn" onclick="rejectPermission('${idx}')">拒绝</button>
      </div>
    </div>
  `).join('');
}

async function approvePermission(permissionId) {
  try {
    const res = await fetch(`/api/chat/permissions/${permissionId}/approve`, {
      method: 'POST',
    });
    const data = await res.json();
    alert(data.ok ? '已批准' : '批准失败: ' + data.error);
    loadPermissions();
  } catch (error) {
    alert('批准失败: ' + error.message);
  }
}

async function rejectPermission(permissionId) {
  try {
    const res = await fetch(`/api/chat/permissions/${permissionId}/reject`, {
      method: 'POST',
    });
    const data = await res.json();
    alert(data.ok ? '已拒绝' : '拒绝失败: ' + data.error);
    loadPermissions();
  } catch (error) {
    alert('拒绝失败: ' + error.message);
  }
}

// ===== Share Functions =====
async function loadShareHistory() {
  try {
    const res = await fetch('/api/share/history');
    const data = await res.json();
    if (data.ok) {
      renderShareHistory(data.history);
    }
  } catch (error) {
    console.error('Failed to load share history:', error);
  }
}

function renderShareHistory(history) {
  const list = $('#shareList');
  if (!history || history.length === 0) {
    list.innerHTML = '<div class="item-card"><p class="muted">暂无分享历史</p></div>';
    return;
  }

  list.innerHTML = history.map((item) => {
    let content = '';
    if (item.type === 'link') {
      content = `<a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.url)}</a>`;
    } else if (item.type === 'text') {
      content = `<p>${escapeHtml(item.text.slice(0, 200))}${item.text.length > 200 ? '...' : ''}</p>`;
    } else if (item.type === 'file') {
      content = `<p>文件: ${escapeHtml(item.filename)} (${formatBytes(item.size)})</p>`;
    }

    return `
      <div class="item-card">
        <h3>${item.type === 'link' ? '🔗 链接' : item.type === 'text' ? '📝 文本' : '📎 文件'}</h3>
        ${content}
        <div class="meta muted">
          <span>${fmtDate(item.createdAt)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Commands Functions =====
async function loadCommands() {
  try {
    const res = await fetch('/api/control/commands');
    const data = await res.json();
    if (data.ok) {
      renderCommands(data.commands);
    }
  } catch (error) {
    console.error('Failed to load commands:', error);
  }
}

function renderCommands(commands) {
  const list = $('#commandsList');
  if (!commands || commands.length === 0) {
    list.innerHTML = '<div class="item-card"><p class="muted">暂无可用命令</p></div>';
    return;
  }

  list.innerHTML = commands.map((cmd) => `
    <div class="item-card" style="cursor: pointer;" onclick="executeCommand('${escapeHtml(cmd.id)}')">
      <h3>${escapeHtml(cmd.label)}</h3>
      <p class="excerpt muted">${escapeHtml(cmd.description)}</p>
      <div class="meta muted">
        <span>分类: ${escapeHtml(cmd.category)}</span>
      </div>
    </div>
  `).join('');
}

async function executeCommand(commandId) {
  if (!confirm('确定要执行此命令吗?')) return;

  try {
    const res = await fetch('/api/control/command/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId }),
    });

    const data = await res.json();
    $('#commandResultTitle').textContent = data.ok ? `✓ ${data.label}` : `✗ 执行失败`;
    $('#commandResultOutput').textContent = data.stdout || data.stderr || data.error || '无输出';
    $('#commandResult').style.display = 'block';
  } catch (error) {
    alert('执行失败: ' + error.message);
  }
}

// ===== Dashboard Functions =====
async function renderDashboard(data) {
  const cards = $('#dashboardCards');
  const system = data.system || {};
  const overview = data.overview || {};

  // Get real-time data
  const chatList = await fetch('/api/chat/conversations').then(r => r.json()).catch(() => ({ conversations: [] }));
  const permissions = await fetch('/api/chat/pending-permissions').then(r => r.json()).catch(() => ({ permissions: [] }));
  const commands = await fetch('/api/control/commands').then(r => r.json()).catch(() => ({ commands: [] }));

  const recentChats = chatList.conversations?.slice(0, 3) || [];
  const pendingCount = permissions.permissions?.length || 0;
  const quickCommands = commands.commands?.slice(0, 4) || [];

  cards.innerHTML = `
    <!-- System Resources Card -->
    <div class="dashboard-card resource-card">
      <div class="card-header">
        <h3>💻 系统资源</h3>
        <span class="refresh-indicator">●</span>
      </div>
      <div class="resource-item">
        <div class="resource-label">
          <span>CPU</span>
          <span class="resource-value">${system.cpuUsage || 0}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${system.cpuUsage || 0}%"></div>
        </div>
      </div>
      <div class="resource-item">
        <div class="resource-label">
          <span>内存</span>
          <span class="resource-value">${system.memoryUsage || 0}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${system.memoryUsage || 0}%"></div>
        </div>
      </div>
      <div class="resource-item">
        <div class="resource-label">
          <span>磁盘</span>
          <span class="resource-value">${system.diskUsage || 0}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${system.diskUsage || 0}%"></div>
        </div>
      </div>
      <div class="resource-stats">
        <span>负载: ${system.loadAverage ? system.loadAverage.slice(0, 3).join(' / ') : 'N/A'}</span>
        <span>运行时间: ${system.uptime ? formatUptime(system.uptime) : 'N/A'}</span>
      </div>
    </div>

    <!-- Quick Actions Card -->
    <div class="dashboard-card actions-card">
      <div class="card-header">
        <h3>⚡ 快捷操作</h3>
      </div>
      <div class="quick-actions">
        <button class="action-btn" onclick="setActiveTab('chat'); createNewChat();">
          <span class="action-icon">💬</span>
          <span class="action-label">新建对话</span>
        </button>
        <button class="action-btn" onclick="setActiveTab('permissions');">
          <span class="action-icon">✅</span>
          <span class="action-label">权限审批</span>
          ${pendingCount > 0 ? `<span class="badge">${pendingCount}</span>` : ''}
        </button>
        <button class="action-btn" onclick="setActiveTab('commands');">
          <span class="action-icon">⚡</span>
          <span class="action-label">执行命令</span>
        </button>
        <button class="action-btn" onclick="setActiveTab('system');">
          <span class="action-icon">📊</span>
          <span class="action-label">系统监控</span>
        </button>
      </div>
    </div>

    <!-- Recent Chats Card -->
    <div class="dashboard-card chats-card">
      <div class="card-header">
        <h3>💬 最近对话</h3>
        <button class="ghost-btn-small" onclick="setActiveTab('chat')">查看全部 →</button>
      </div>
      ${recentChats.length > 0 ? `
        <div class="recent-list">
          ${recentChats.map(chat => `
            <div class="recent-item" onclick="setActiveTab('chat'); openChat('${escapeHtml(chat.sessionId)}', '${escapeHtml(chat.agentId)}');">
              <div class="recent-title">${escapeHtml(chat.sessionId)}</div>
              <div class="recent-meta">${fmtDate(chat.updatedAt)}</div>
            </div>
          `).join('')}
        </div>
      ` : '<p class="empty-message">暂无对话</p>'}
    </div>

    <!-- Services Status Card -->
    <div class="dashboard-card services-card">
      <div class="card-header">
        <h3>🔧 服务状态</h3>
      </div>
      ${system.services && system.services.length > 0 ? `
        <div class="services-list">
          ${system.services.map(s => `
            <div class="service-item">
              <span class="service-status ${s.status === 'active' ? 'status-active' : 'status-inactive'}">●</span>
              <span class="service-name">${escapeHtml(s.label || s.unit)}</span>
              <span class="service-state">${escapeHtml(s.status || 'unknown')}</span>
            </div>
          `).join('')}
        </div>
      ` : '<p class="empty-message">无服务信息</p>'}
    </div>

    <!-- Network Info Card -->
    <div class="dashboard-card network-card">
      <div class="card-header">
        <h3>🌐 网络信息</h3>
      </div>
      ${system.lan && system.lan.length > 0 ? `
        <div class="network-list">
          ${system.lan.map(n => `
            <div class="network-item">
              <span class="network-name">${escapeHtml(n.name)}</span>
              <code class="network-address">${escapeHtml(n.address)}</code>
            </div>
          `).join('')}
        </div>
      ` : '<p class="empty-message">无网络信息</p>'}
    </div>

    <!-- Stats Card -->
    <div class="dashboard-card stats-card">
      <div class="card-header">
        <h3>📊 统计信息</h3>
      </div>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${overview.totalProjects || 0}</div>
          <div class="stat-label">项目数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${overview.totalMemories || 0}</div>
          <div class="stat-label">记忆数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${recentChats.length}</div>
          <div class="stat-label">对话数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${pendingCount}</div>
          <div class="stat-label">待审批</div>
        </div>
      </div>
    </div>
  `;

  // Auto refresh dashboard every 30 seconds
  if (!window.dashboardRefreshTimer) {
    window.dashboardRefreshTimer = setInterval(() => {
      if (document.querySelector('#tab-dashboard.active')) {
        fetchDashboard();
      }
    }, 30000);
  }
}

function init() {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration);
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  }

  // Initialize WebSocket
  initWebSocket();

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  syncTopicFromHash();
  fetchDashboard();

  $('#refreshBtn').addEventListener('click', fetchDashboard);

  // Chat event listeners
  if ($('#newChatBtn')) {
    $('#newChatBtn').addEventListener('click', createNewChat);
  }
  if ($('#sendMessageBtn')) {
    $('#sendMessageBtn').addEventListener('click', sendChatMessage);
  }
  if ($('#backToChatList')) {
    $('#backToChatList').addEventListener('click', () => {
      $('#chatList').style.display = 'block';
      $('#chatDetail').style.display = 'none';
      currentChatSession = null;
      loadChatList();
    });
  }
  if ($('#chatInput')) {
    $('#chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  // Permissions event listeners
  if ($('#refreshPermissionsBtn')) {
    $('#refreshPermissionsBtn').addEventListener('click', loadPermissions);
  }

  $('#searchInput').addEventListener('input', (e) => {
    query = e.target.value.toLowerCase().trim();
    render();
  });
  
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      statusFilter = btn.dataset.filter;
      render();
    });
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      setActiveTab(tab.dataset.tab);
    });
  });

  // Sub-tab navigation in "More"
  document.querySelectorAll('#tab-more .item-card[data-subtab]').forEach((card) => {
    card.addEventListener('click', () => {
      setActiveTab(card.dataset.subtab);
    });
  });

  // Pull-to-refresh for mobile
  if (isMobileLayout()) {
    let startY = 0;
    let pulling = false;
    let pullDistance = 0;
    const threshold = 80;
    
    const refreshIndicator = document.createElement('div');
    refreshIndicator.id = 'refresh-indicator';
    refreshIndicator.style.cssText = `
      position: fixed;
      top: -40px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      background: var(--glass);
      backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 999px;
      color: var(--text);
      font-size: 13px;
      z-index: 100;
      transition: top 0.3s ease, opacity 0.3s ease;
      opacity: 0;
    `;
    refreshIndicator.textContent = '↓ 下拉刷新';
    document.body.appendChild(refreshIndicator);
    
    document.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    });
    
    document.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      const currentY = e.touches[0].clientY;
      pullDistance = Math.max(0, currentY - startY);
      
      if (pullDistance > 20) {
        refreshIndicator.style.top = `${Math.min(pullDistance - 20, 20)}px`;
        refreshIndicator.style.opacity = Math.min(pullDistance / threshold, 1);
        refreshIndicator.textContent = pullDistance >= threshold ? '↻ 释放刷新' : '↓ 下拉刷新';
      }
    });
    
    document.addEventListener('touchend', () => {
      if (pulling && pullDistance >= threshold) {
        refreshIndicator.textContent = '⟳ 刷新中...';
        fetchDashboard().finally(() => {
          setTimeout(() => {
            refreshIndicator.style.top = '-40px';
            refreshIndicator.style.opacity = '0';
          }, 500);
        });
      } else {
        refreshIndicator.style.top = '-40px';
        refreshIndicator.style.opacity = '0';
      }
      pulling = false;
      pullDistance = 0;
    });
  }

  // Auto-refresh every 60 seconds
  setInterval(fetchDashboard, 60000);
  
  // Handle hash changes
  window.addEventListener('hashchange', () => {
    syncTopicFromHash();
    render();
  });
  
  // Keyboard shortcuts (desktop only)
  if (!isMobileLayout()) {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + K: Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        $('#searchInput').focus();
      }
      
      // Cmd/Ctrl + R: Refresh
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        fetchDashboard();
      }
      
      // Number keys 1-5: Switch tabs
      if (e.key >= '1' && e.key <= '6' && !e.metaKey && !e.ctrlKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        const tabs = ['dashboard', 'chat', 'permissions', 'projects', 'system', 'more'];
        const index = parseInt(e.key) - 1;
        if (tabs[index]) {
          setActiveTab(tabs[index]);
        }
      }
      
      // Escape: Clear search or close detail
      if (e.key === 'Escape') {
        if ($('#searchInput').value) {
          $('#searchInput').value = '';
          query = '';
          render();
        } else if (selectedTopic) {
          setSelectedTopic(null);
          render();
        }
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
