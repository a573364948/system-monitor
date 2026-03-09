const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config-manager');

const OPENCLAW_AGENTS_PATH = getConfig('openclaw.agentsPath', '/home/deck/.openclaw/agents');
const DEFAULT_AGENT = getConfig('openclaw.defaultAgent', 'main');

function runOpenClawCommand(args, options = {}) {
  return new Promise((resolve) => {
    const command = `openclaw ${args}`;
    const child = spawn('bash', ['-lc', command], {
      cwd: options.cwd || '/home/deck',
      env: process.env,
      timeout: options.timeout || 180000,
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
      if (options.json) {
        try {
          parsed = JSON.parse(stdout);
        } catch {
          parsed = null;
        }
      }
      resolve({ code, stdout, stderr, parsed });
    });

    child.on('error', (error) => {
      resolve({ code: -1, stdout, stderr, error: error.message });
    });
  });
}

async function createConversation(message, agentId = DEFAULT_AGENT) {
  const args = `agent --agent ${JSON.stringify(agentId)} --message ${JSON.stringify(message)} --json --timeout 180`;
  const result = await runOpenClawCommand(args, { json: true });

  if (result.parsed && result.parsed.sessionId) {
    return {
      ok: true,
      sessionId: result.parsed.sessionId,
      agentId,
      message,
      response: result.parsed,
    };
  }

  return {
    ok: false,
    error: 'Failed to create conversation',
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function sendMessage(sessionId, message, agentId = DEFAULT_AGENT) {
  const args = `agent --agent ${JSON.stringify(agentId)} --session-id ${JSON.stringify(sessionId)} --message ${JSON.stringify(message)} --json --timeout 180`;
  const result = await runOpenClawCommand(args, { json: true });

  return {
    ok: result.code === 0,
    sessionId,
    agentId,
    message,
    response: result.parsed,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function listConversations(agentId = DEFAULT_AGENT) {
  const sessionsDir = path.join(OPENCLAW_AGENTS_PATH, agentId, 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    return [];
  }

  try {
    const sessions = fs.readdirSync(sessionsDir)
      .filter((name) => fs.statSync(path.join(sessionsDir, name)).isDirectory())
      .map((sessionId) => {
        const sessionPath = path.join(sessionsDir, sessionId);
        const stat = fs.statSync(sessionPath);

        // Try to read first message
        let firstMessage = null;
        const transcriptPath = path.join(sessionPath, 'transcript.jsonl');
        if (fs.existsSync(transcriptPath)) {
          try {
            const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
            if (lines.length > 0) {
              const first = JSON.parse(lines[0]);
              firstMessage = first.content || first.message || null;
            }
          } catch {}
        }

        return {
          sessionId,
          agentId,
          createdAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
          firstMessage,
        };
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return sessions;
  } catch (error) {
    console.error('Failed to list conversations:', error);
    return [];
  }
}

function getConversationHistory(sessionId, agentId = DEFAULT_AGENT) {
  const transcriptPath = path.join(OPENCLAW_AGENTS_PATH, agentId, 'sessions', sessionId, 'transcript.jsonl');

  if (!fs.existsSync(transcriptPath)) {
    return { ok: false, error: 'Conversation not found' };
  }

  try {
    const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
    const messages = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    return {
      ok: true,
      sessionId,
      agentId,
      messages,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

async function deleteConversation(sessionId, agentId = DEFAULT_AGENT) {
  const sessionPath = path.join(OPENCLAW_AGENTS_PATH, agentId, 'sessions', sessionId);

  if (!fs.existsSync(sessionPath)) {
    return { ok: false, error: 'Conversation not found' };
  }

  try {
    fs.rmSync(sessionPath, { recursive: true, force: true });
    return { ok: true, sessionId, agentId };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = {
  createConversation,
  sendMessage,
  listConversations,
  getConversationHistory,
  deleteConversation,
};
