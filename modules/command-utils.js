const { execSync } = require('child_process');

function runCommand(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch {
    return '';
  }
}

function runCommandResult(command, options = {}) {
  try {
    const stdout = execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: '',
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || '').trim(),
      stderr: String(error.stderr || '').trim(),
      error: String(error.message || error),
    };
  }
}

function parseKeyValueOutput(raw) {
  return Object.fromEntries(
    raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=');
        if (index < 0) return [line, ''];
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

module.exports = {
  parseKeyValueOutput,
  runCommand,
  runCommandResult,
};
