const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config-manager');

const SHARE_HISTORY_PATH = path.join(__dirname, '..', 'data', 'share-history.jsonl');
const UPLOAD_PATH = getConfig('share.uploadPath', path.join(__dirname, '..', 'data', 'uploads'));
const MAX_FILE_SIZE = getConfig('share.maxFileSize', 10485760); // 10MB
const HISTORY_LIMIT = getConfig('share.historyLimit', 100);

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_PATH)) {
    fs.mkdirSync(UPLOAD_PATH, { recursive: true });
  }
}

function appendShareHistory(entry) {
  const dir = path.dirname(SHARE_HISTORY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify({
    ...entry,
    createdAt: new Date().toISOString(),
  });

  fs.appendFileSync(SHARE_HISTORY_PATH, `${line}\n`, 'utf8');
}

function getShareHistory(limit = HISTORY_LIMIT) {
  if (!fs.existsSync(SHARE_HISTORY_PATH)) return [];

  try {
    const lines = fs.readFileSync(SHARE_HISTORY_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-limit);

    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean).reverse();
  } catch {
    return [];
  }
}

function handleSharedLink(url, metadata = {}) {
  const entry = {
    type: 'link',
    url,
    metadata,
  };

  appendShareHistory(entry);

  return {
    ok: true,
    type: 'link',
    url,
    createdAt: entry.createdAt,
  };
}

function handleSharedText(text, metadata = {}) {
  const entry = {
    type: 'text',
    text: text.slice(0, 10000), // Limit text length
    metadata,
  };

  appendShareHistory(entry);

  return {
    ok: true,
    type: 'text',
    text: entry.text,
    createdAt: entry.createdAt,
  };
}

function handleSharedFile(filename, fileBuffer, metadata = {}) {
  ensureUploadDir();

  if (fileBuffer.length > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File too large (max ${MAX_FILE_SIZE} bytes)`,
    };
  }

  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const savedName = `${timestamp}_${safeName}`;
  const filePath = path.join(UPLOAD_PATH, savedName);

  try {
    fs.writeFileSync(filePath, fileBuffer);

    const entry = {
      type: 'file',
      filename,
      savedName,
      filePath,
      size: fileBuffer.length,
      metadata,
    };

    appendShareHistory(entry);

    return {
      ok: true,
      type: 'file',
      filename,
      savedName,
      size: fileBuffer.length,
      createdAt: entry.createdAt,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

module.exports = {
  handleSharedLink,
  handleSharedText,
  handleSharedFile,
  getShareHistory,
};
