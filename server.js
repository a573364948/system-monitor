const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

const { getLanAddresses } = require('./modules/network-monitor');
const { collectSystemOverview } = require('./modules/system-monitor');
const { executeCommand, listCommands } = require('./modules/command-executor');
const { createConversation, sendMessage, listConversations, getConversationHistory, deleteConversation } = require('./modules/openclaw-chat');
const { getPendingPermissions, getAllowlist, approvePermission, rejectPermission } = require('./modules/permission-manager');
const { handleSharedLink, handleSharedText, handleSharedFile, getShareHistory } = require('./modules/share-handler');
const { getConfig } = require('./modules/config-manager');

const PORT = Number(process.env.MEMORY_COCKPIT_PORT || 18489);
const HOST = process.env.MEMORY_COCKPIT_HOST || '0.0.0.0';
const WORKSPACE = '/home/deck/.openclaw/workspace';
const VIKING_ROOT = '/home/deck/.openviking/data/viking/default/user/default/memories';
const STATIC_ROOT = path.join(__dirname, 'public');
const PROJECT_PROFILES_PATH = path.join(__dirname, 'project-profiles.json');
const PROJECT_STATE_PATH = path.join(__dirname, 'data', 'project-state.json');
const ACTION_LOG_PATH = path.join(__dirname, 'data', 'action-log.jsonl');
const MEMORY_POLICY_PATH = path.join(__dirname, 'data', 'memory-policy.json');
const ALLOWED_FILE_ROOTS = [
  WORKSPACE,
  '/home/deck/.openviking/data/viking/default/user/default/memories',
  '/home/deck/.openviking/data/viking/default/resources',
];

const KEYWORDS = [
  'OpenClaw',
  'GLKVM',
  '列车长',
  '定员定额',
  '日报',
  '每日知识',
  'Discord',
  '飞书',
  'Telegram',
  'OpenViking',
  '模型',
  'GMN',
  'Gemini',
  'GPT-5.4',
  'Codex',
  '列车长工作群',
  'daily-digest',
];

const SERVICE_UNITS = [
  { unit: 'openclaw-gateway.service', label: 'OpenClaw Gateway' },
  { unit: 'openviking.service', label: 'OpenViking' },
  { unit: 'openviking-watchdog.timer', label: 'OpenViking Watchdog' },
];

const SYSTEM_MONITOR_OPTIONS = {
  host: HOST,
  port: PORT,
  serviceUnits: SERVICE_UNITS,
  journalAlertCommand: "journalctl --user -u openclaw-gateway.service --since 'today' --no-pager | rg -i 'lane wait exceeded|timeout|browser failed|extract returned 0 memories|dispatch complete \\(queuedFinal=false, replies=0\\)|auto-capture failed' | tail -n 20",
  journalAlertSource: 'openclaw-gateway',
};

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(dirPath, name));
}

function cleanText(text) {
  return text.replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferTopicKey(text) {
  const cleaned = cleanText(text);
  const snippet = cleaned.slice(0, 120);
  const colonMatch = snippet.match(/^(.{1,30}?)[：:]/);
  if (colonMatch) {
    const candidate = colonMatch[1].trim();
    if (!['用户', '当前', '系统', '项目', '这个项目', '该项目'].includes(candidate)) {
      return candidate;
    }
  }
  for (const keyword of KEYWORDS) {
    if (cleaned.includes(keyword)) return keyword;
  }
  return '其他';
}

function buildExcerpt(text, maxLen = 140) {
  const cleaned = cleanText(text);
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}...`;
}

function parseMemoryFile(filePath, category) {
  const stat = fs.statSync(filePath);
  const raw = readText(filePath);
  const text = cleanText(raw);
  const name = path.basename(filePath, '.md');
  const topic = inferTopicKey(text || name);
  return {
    id: name,
    name,
    category,
    topic,
    excerpt: buildExcerpt(text),
    text,
    updatedAt: stat.mtime.toISOString(),
    sourcePath: filePath,
  };
}

function collectMemories() {
  const categories = ['preferences', 'entities', 'events'];
  const items = [];
  for (const category of categories) {
    const dirPath = path.join(VIKING_ROOT, category);
    for (const filePath of listMarkdownFiles(dirPath)) {
      items.push(parseMemoryFile(filePath, category));
    }
  }
  const profilePath = path.join(VIKING_ROOT, 'profile.md');
  if (fs.existsSync(profilePath)) {
    items.push(parseMemoryFile(profilePath, 'profile'));
  }
  return items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function collectDailyNotes(limit = 10) {
  const memoryDir = path.join(WORKSPACE, 'memory');
  if (!fs.existsSync(memoryDir)) return [];
  return fs.readdirSync(memoryDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((name) => {
      const filePath = path.join(memoryDir, name);
      const stat = fs.statSync(filePath);
      const text = readText(filePath);
      return {
        id: name.replace(/\.md$/, ''),
        date: name.replace(/\.md$/, ''),
        updatedAt: stat.mtime.toISOString(),
        excerpt: buildExcerpt(text, 220),
        sourcePath: filePath,
      };
    });
}

function collectWorkspaceSummary() {
  const files = ['AGENTS.md', 'USER.md', 'HEARTBEAT.md', 'SOUL.md', 'MEMORY.md'];
  return files.map((name) => {
    const filePath = path.join(WORKSPACE, name);
    if (!fs.existsSync(filePath)) {
      return { name, exists: false, size: 0 };
    }
    const stat = fs.statSync(filePath);
    return { name, exists: true, size: stat.size, updatedAt: stat.mtime.toISOString() };
  });
}

function loadProjectProfiles() {
  if (!fs.existsSync(PROJECT_PROFILES_PATH)) return {};
  return JSON.parse(fs.readFileSync(PROJECT_PROFILES_PATH, 'utf8'));
}

function loadProjectState() {
  if (!fs.existsSync(PROJECT_STATE_PATH)) return {};
  return JSON.parse(fs.readFileSync(PROJECT_STATE_PATH, 'utf8'));
}

function loadActionLog(limit = 200) {
  if (!fs.existsSync(ACTION_LOG_PATH)) return [];
  return fs.readFileSync(ACTION_LOG_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}

function loadMemoryPolicy() {
  if (!fs.existsSync(MEMORY_POLICY_PATH)) return {};
  return JSON.parse(fs.readFileSync(MEMORY_POLICY_PATH, 'utf8'));
}

function appendActionLog(entry) {
  const line = JSON.stringify({ ...entry, createdAt: new Date().toISOString() });
  fs.appendFileSync(ACTION_LOG_PATH, `${line}\n`, 'utf8');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveProjectIntent(input, projects, profiles) {
  const normalized = normalizeText(input);
  if (!normalized) return null;
  for (const project of projects) {
    const profile = profiles[project.topic] || {};
    const candidates = [project.topic, ...(profile.chatEntrances || []), ...(profile.aliases || [])]
      .map(normalizeText)
      .filter(Boolean);
    if (candidates.some((candidate) => normalized.includes(candidate))) {
      return { ...project, profile };
    }
  }
  return null;
}

function buildResumePayload(project) {
  if (!project) return null;
  const profile = project.profile || {};
  return {
    topic: project.topic,
    status: profile.status || '未知',
    summary: profile.summary || project.excerpt,
    nextActions: profile.nextActions || [],
    chatEntrances: profile.chatEntrances || [project.commandHint],
    evidence: (profile.evidence || []).slice(0, 5),
    recentMemories: (project.items || []).slice(0, 5).map((item) => ({
      category: item.category,
      excerpt: item.excerpt,
      updatedAt: item.updatedAt,
      sourcePath: item.sourcePath,
    })),
    suggestedPrompt: `继续${project.topic}相关工作。先基于已有项目记忆恢复上下文，再告诉我当前状态、下一步和建议执行路径。`,
  };
}

function buildActionPayload(project, origin) {
  const resume = buildResumePayload(project);
  if (!resume) return null;
  const primaryText = resume.chatEntrances[0] || resume.suggestedPrompt;
  const deepLink = `${origin}/#project=${encodeURIComponent(project.topic)}`;
  const executionPrompt = [
    `项目：${resume.topic}`,
    `当前状态：${resume.status}`,
    `项目摘要：${resume.summary}`,
    '',
    '下一步：',
    ...(resume.nextActions.length ? resume.nextActions.map((item) => `- ${item}`) : ['- 暂无明确下一步']),
    '',
    '最近相关记忆：',
    ...(resume.recentMemories.length
      ? resume.recentMemories.map((item) => `- [${item.category}] ${item.excerpt}`)
      : ['- 暂无近期记忆']),
    '',
    '请基于以上项目上下文恢复工作状态，先给出：',
    '1. 当前进展判断',
    '2. 最值得继续的下一步',
    '3. 建议执行路径',
  ].join('\n');
  return {
    topic: project.topic,
    primaryText,
    executionPrompt,
    suggestedPrompt: resume.suggestedPrompt,
    deepLink,
    telegramShareUrl: `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(primaryText)}`,
    shareText: `${primaryText}\n${deepLink}`,
    channels: {
      telegram: primaryText,
      discord: primaryText,
      feishu: primaryText,
    },
  };
}

function buildProjects(items) {
  const groups = new Map();
  for (const item of items) {
    const existing = groups.get(item.topic) || {
      topic: item.topic,
      count: 0,
      lastUpdatedAt: item.updatedAt,
      categories: new Set(),
      items: [],
    };
    existing.count += 1;
    existing.categories.add(item.category);
    existing.items.push(item);
    if (new Date(item.updatedAt) > new Date(existing.lastUpdatedAt)) {
      existing.lastUpdatedAt = item.updatedAt;
    }
    groups.set(item.topic, existing);
  }
  return [...groups.values()]
    .map((group) => ({
      topic: group.topic,
      count: group.count,
      lastUpdatedAt: group.lastUpdatedAt,
      categories: [...group.categories].sort(),
      excerpt: group.items[0] ? group.items[0].excerpt : '',
      commandHint: `继续${group.topic}相关工作`,
      items: group.items.slice(0, 12),
    }))
    .sort((a, b) => {
      if (a.topic === '其他') return 1;
      if (b.topic === '其他') return -1;
      const countDiff = b.count - a.count;
      if (countDiff !== 0) return countDiff;
      return new Date(b.lastUpdatedAt) - new Date(a.lastUpdatedAt);
    });
}

function collectTimeline(memories, dailyNotes, recentActions) {
  const memoryEvents = memories.slice(0, 30).map((item) => ({
    type: 'memory',
    topic: item.topic,
    title: `${item.category} · ${item.topic}`,
    excerpt: item.excerpt,
    updatedAt: item.updatedAt,
    sourcePath: item.sourcePath,
  }));
  const dailyEvents = dailyNotes.slice(0, 10).map((item) => ({
    type: 'daily',
    topic: item.date,
    title: `日志 · ${item.date}`,
    excerpt: item.excerpt,
    updatedAt: item.updatedAt,
    sourcePath: item.sourcePath,
  }));
  const actionEvents = recentActions.slice(0, 20).map((item) => ({
    type: 'action',
    topic: item.topic,
    title: `动作 · ${item.topic}`,
    excerpt: item.prompt || item.resultText || '',
    updatedAt: item.createdAt,
    sourcePath: null,
  }));
  return [...actionEvents, ...memoryEvents, ...dailyEvents]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 40);
}

function collectEvidenceIndex(projects) {
  const items = [];
  for (const project of projects) {
    const profile = project.profile || {};
    for (const filePath of profile.evidence || []) {
      items.push({
        topic: project.topic,
        kind: 'file',
        label: path.basename(filePath),
        target: filePath,
      });
    }
    for (const link of profile.links || []) {
      items.push({
        topic: project.topic,
        kind: 'link',
        label: link,
        target: link,
      });
    }
  }
  const reportsDir = path.join(WORKSPACE, 'reports');
  if (fs.existsSync(reportsDir)) {
    for (const name of fs.readdirSync(reportsDir).filter((item) => item.endsWith('.md')).slice(0, 30)) {
      items.push({
        topic: 'reports',
        kind: 'file',
        label: name,
        target: path.join(reportsDir, name),
      });
    }
  }
  return items.slice(0, 80);
}

function buildDashboard() {
  const memories = collectMemories();
  const projectProfiles = loadProjectProfiles();
  const projectState = loadProjectState();
  const memoryPolicy = loadMemoryPolicy();
  const actionLog = loadActionLog();
  const projects = buildProjects(memories).map((project) => ({
    ...project,
    profile: projectProfiles[project.topic] || null,
    state: projectState[project.topic] || null,
    recentActions: actionLog.filter((entry) => entry.topic === project.topic).slice(0, 8),
  }));
  const categories = ['profile', 'preferences', 'entities', 'events'];
  const categoryCounts = Object.fromEntries(categories.map((category) => [
    category,
    memories.filter((item) => item.category === category).length,
  ]));
  const recentActions = actionLog.slice(0, 20);
  const dailyNotes = collectDailyNotes();
  const system = collectSystemOverview(SYSTEM_MONITOR_OPTIONS);
  return {
    generatedAt: new Date().toISOString(),
    overview: {
      totalMemories: memories.length,
      totalProjects: projects.length,
      categoryCounts,
      topProjects: projects.slice(0, 8),
    },
    system,
    projects,
    memories,
    memoryPolicy,
    recentActions,
    timeline: collectTimeline(memories, dailyNotes, recentActions),
    evidenceIndex: collectEvidenceIndex(projects),
    dailyNotes,
    workspace: collectWorkspaceSummary(),
  };
}

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload, null, 2));
}

function runAgentPrompt(promptText, options = {}) {
  return new Promise((resolve) => {
    const agentId = options.agentId || 'main';
    const sessionId = options.sessionId ? ` --session-id ${JSON.stringify(options.sessionId)}` : '';
    const command = `openclaw agent --agent ${JSON.stringify(agentId)}${sessionId} --message ${JSON.stringify(promptText)} --json --timeout 180`;
    const child = spawn('bash', ['-lc', command], {
      cwd: WORKSPACE,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = null;
      }
      resolve({ code, stdout, stderr, parsed });
    });
  });
}

function isAllowedPath(targetPath) {
  const resolved = path.resolve(targetPath);
  return ALLOWED_FILE_ROOTS.some((root) => resolved.startsWith(path.resolve(root)));
}

function sendFileView(res, targetPath) {
  if (!targetPath || !isAllowedPath(targetPath) || !fs.existsSync(targetPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const content = fs.readFileSync(targetPath, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${path.basename(targetPath)}</title><style>body{margin:0;background:#0b1020;color:#f4f7fb;font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}header{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.08);position:sticky;top:0;background:#111934}main{padding:20px}pre{white-space:pre-wrap;word-break:break-word;margin:0}</style></head><body><header><strong>${path.basename(targetPath)}</strong><div>${targetPath}</div></header><main><pre>${content.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</pre></main></body></html>`);
}

function sendStatic(reqPath, res) {
  const safePath = reqPath === '/' ? '/index.html' : reqPath;
  const filePath = path.join(STATIC_ROOT, safePath);
  if (!filePath.startsWith(STATIC_ROOT) || !fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
  }[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/dashboard') {
    sendJson(res, buildDashboard());
    return;
  }
  if (url.pathname === '/api/health') {
    sendJson(res, { ok: true, generatedAt: new Date().toISOString(), host: HOST, port: PORT, lan: getLanAddresses() });
    return;
  }
  if (url.pathname === '/api/project') {
    const dashboard = buildDashboard();
    const topic = url.searchParams.get('topic');
    const project = dashboard.projects.find((item) => item.topic === topic) || null;
    sendJson(res, { ok: !!project, project });
    return;
  }
  if (url.pathname === '/api/resolve') {
    const dashboard = buildDashboard();
    const matched = resolveProjectIntent(url.searchParams.get('q'), dashboard.projects, loadProjectProfiles());
    sendJson(res, { ok: !!matched, project: matched });
    return;
  }
  if (url.pathname === '/api/resume') {
    const dashboard = buildDashboard();
    const matched = resolveProjectIntent(url.searchParams.get('q'), dashboard.projects, loadProjectProfiles());
    sendJson(res, { ok: !!matched, resume: buildResumePayload(matched) });
    return;
  }
  if (url.pathname === '/api/actions') {
    const dashboard = buildDashboard();
    const topic = url.searchParams.get('topic');
    const project = dashboard.projects.find((item) => item.topic === topic) || null;
    const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    sendJson(res, { ok: !!project, actions: buildActionPayload(project, origin) });
    return;
  }
  if (url.pathname === '/api/dispatch') {
    if (req.method !== 'POST') {
      sendJson(res, { ok: false, error: 'Method not allowed' }, 405);
      return;
    }
    const dashboard = buildDashboard();
    const topic = url.searchParams.get('topic');
    const project = dashboard.projects.find((item) => item.topic === topic) || null;
    if (!project) {
      sendJson(res, { ok: false, error: 'Project not found' }, 404);
      return;
    }
    const action = buildActionPayload(project, `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`);
    const sessionId = `cockpit:${project.topic}`;
    runAgentPrompt(action.executionPrompt, { agentId: 'cockpit', sessionId })
      .then((result) => {
        const text = result.parsed?.result?.payloads?.map((item) => item.text).filter(Boolean).join('\n\n') || result.stdout || result.stderr;
        const ok = result.code === 0 || result.parsed?.status === 'ok';
        appendActionLog({
          topic: project.topic,
          sessionId,
          prompt: action.primaryText,
          ok,
          resultText: text.slice(0, 4000),
        });
        sendJson(res, {
          ok,
          topic: project.topic,
          prompt: action.primaryText,
          sessionId,
          resultText: text,
          raw: result.parsed,
          stderr: result.stderr,
        });
      })
      .catch((error) => {
        sendJson(res, { ok: false, error: String(error) }, 500);
      });
    return;
  }
  if (url.pathname === '/api/projects') {
    const dashboard = buildDashboard();
    sendJson(res, { ok: true, projects: dashboard.projects.map((project) => ({
      topic: project.topic,
      count: project.count,
      status: project.profile?.status || '未知',
      priority: project.state?.priority || 'normal',
      commandHint: project.commandHint,
    })) });
    return;
  }
  if (url.pathname === '/api/activity') {
    const dashboard = buildDashboard();
    sendJson(res, { ok: true, recentActions: dashboard.recentActions });
    return;
  }
  if (url.pathname === '/api/memory-policy') {
    const dashboard = buildDashboard();
    sendJson(res, { ok: true, memoryPolicy: dashboard.memoryPolicy });
    return;
  }
  if (url.pathname === '/api/timeline') {
    const dashboard = buildDashboard();
    sendJson(res, { ok: true, timeline: dashboard.timeline });
    return;
  }
  if (url.pathname === '/api/evidence') {
    const dashboard = buildDashboard();
    sendJson(res, { ok: true, evidence: dashboard.evidenceIndex });
    return;
  }
  if (url.pathname === '/api/alerts') {
    const dashboard = buildDashboard();
    sendJson(res, { ok: true, alerts: dashboard.system.alerts });
    return;
  }
  // OpenClaw Chat API
  if (url.pathname === '/api/chat/conversations') {
    if (req.method === 'GET') {
      const agentId = url.searchParams.get('agent') || 'main';
      const conversations = listConversations(agentId);
      sendJson(res, { ok: true, conversations });
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const result = await createConversation(data.message, data.agentId || 'main');
          sendJson(res, result);
        } catch (error) {
          sendJson(res, { ok: false, error: error.message }, 400);
        }
      });
      return;
    }
  }
  if (url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)$/)) {
    const sessionId = url.pathname.split('/').pop();
    if (req.method === 'GET') {
      const agentId = url.searchParams.get('agent') || 'main';
      const result = getConversationHistory(sessionId, agentId);
      sendJson(res, result);
      return;
    }
    if (req.method === 'DELETE') {
      const agentId = url.searchParams.get('agent') || 'main';
      const result = await deleteConversation(sessionId, agentId);
      sendJson(res, result);
      return;
    }
  }
  if (url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/message$/)) {
    if (req.method === 'POST') {
      const sessionId = url.pathname.split('/')[4];
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const result = await sendMessage(sessionId, data.message, data.agentId || 'main');
          sendJson(res, result);
        } catch (error) {
          sendJson(res, { ok: false, error: error.message }, 400);
        }
      });
      return;
    }
  }
  // Permission API
  if (url.pathname === '/api/chat/pending-permissions') {
    const result = await getPendingPermissions();
    sendJson(res, result);
    return;
  }
  if (url.pathname.match(/^\/api\/chat\/permissions\/([^/]+)\/approve$/)) {
    if (req.method === 'POST') {
      const permissionId = url.pathname.split('/')[4];
      const agentId = url.searchParams.get('agent') || 'main';
      const result = await approvePermission(permissionId, agentId);
      sendJson(res, result);
      return;
    }
  }
  if (url.pathname.match(/^\/api\/chat\/permissions\/([^/]+)\/reject$/)) {
    if (req.method === 'POST') {
      const permissionId = url.pathname.split('/')[4];
      const agentId = url.searchParams.get('agent') || 'main';
      const result = await rejectPermission(permissionId, agentId);
      sendJson(res, result);
      return;
    }
  }
  // Share API
  if (url.pathname === '/api/share/link') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const result = handleSharedLink(data.url, data.metadata || {});
          sendJson(res, result);
        } catch (error) {
          sendJson(res, { ok: false, error: error.message }, 400);
        }
      });
      return;
    }
  }
  if (url.pathname === '/api/share/text') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const result = handleSharedText(data.text, data.metadata || {});
          sendJson(res, result);
        } catch (error) {
          sendJson(res, { ok: false, error: error.message }, 400);
        }
      });
      return;
    }
  }
  if (url.pathname === '/api/share/file') {
    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', (chunk) => { chunks.push(chunk); });
      req.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const filename = url.searchParams.get('filename') || 'unnamed';
          const result = handleSharedFile(filename, buffer);
          sendJson(res, result);
        } catch (error) {
          sendJson(res, { ok: false, error: error.message }, 400);
        }
      });
      return;
    }
  }
  if (url.pathname === '/api/share/history') {
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const history = getShareHistory(limit);
    sendJson(res, { ok: true, history });
    return;
  }
  // Command Executor API
  if (url.pathname === '/api/control/command/execute') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const result = await executeCommand(data.commandId);
          sendJson(res, result);
        } catch (error) {
          sendJson(res, { ok: false, error: error.message }, 400);
        }
      });
      return;
    }
  }
  if (url.pathname === '/api/control/commands') {
    const commands = listCommands();
    sendJson(res, { ok: true, commands });
    return;
  }
  if (url.pathname === '/api/file') {
    sendFileView(res, url.searchParams.get('path'));
    return;
  }
  sendStatic(url.pathname, res);
});

server.listen(PORT, HOST, () => {
  console.log(`memory-cockpit listening on http://${HOST}:${PORT}`);
});
