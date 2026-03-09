const { spawn } = require('child_process');
const { getCommandsConfig } = require('./config-manager');

function executeCommand(commandId) {
  return new Promise((resolve) => {
    const config = getCommandsConfig();
    const cmd = config.commands.find((c) => c.id === commandId);

    if (!cmd) {
      resolve({
        ok: false,
        error: 'Command not found',
        commandId,
      });
      return;
    }

    const child = spawn('bash', ['-c', cmd.command], {
      timeout: 30000,
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
      resolve({
        ok: code === 0,
        commandId,
        label: cmd.label,
        command: cmd.command,
        stdout,
        stderr,
        exitCode: code,
      });
    });

    child.on('error', (error) => {
      resolve({
        ok: false,
        commandId,
        error: error.message,
      });
    });
  });
}

function listCommands() {
  const config = getCommandsConfig();
  return config.commands.map((cmd) => ({
    id: cmd.id,
    label: cmd.label,
    description: cmd.description,
    category: cmd.category,
  }));
}

module.exports = {
  executeCommand,
  listCommands,
};
