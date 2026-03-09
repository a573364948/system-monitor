const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function runOpenClawApprovals(args) {
  return new Promise((resolve) => {
    const command = `openclaw approvals ${args}`;
    const child = spawn('bash', ['-lc', command], {
      cwd: '/home/deck',
      env: process.env,
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
      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {}
      resolve({ code, stdout, stderr, parsed });
    });

    child.on('error', (error) => {
      resolve({ code: -1, stdout, stderr, error: error.message });
    });
  });
}

async function getPendingPermissions() {
  const result = await runOpenClawApprovals('get --json');

  if (result.parsed) {
    return {
      ok: true,
      permissions: result.parsed,
    };
  }

  return {
    ok: false,
    error: 'Failed to get pending permissions',
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function getAllowlist(agentId = 'main') {
  const result = await runOpenClawApprovals(`allowlist --agent ${JSON.stringify(agentId)}`);

  return {
    ok: result.code === 0,
    agentId,
    allowlist: result.stdout,
    stderr: result.stderr,
  };
}

// Note: OpenClaw CLI doesn't have direct approve/reject commands
// This would need to be implemented by modifying the approval state files
// or using allowlist commands
async function approvePermission(permissionId, agentId = 'main') {
  // This is a placeholder - actual implementation would need to:
  // 1. Read the approval state file
  // 2. Modify the approval status
  // 3. Write back the file
  // Or use openclaw approvals set command if available

  return {
    ok: false,
    error: 'Approval functionality not yet implemented - requires direct file manipulation or CLI extension',
    permissionId,
    agentId,
  };
}

async function rejectPermission(permissionId, agentId = 'main') {
  return {
    ok: false,
    error: 'Rejection functionality not yet implemented - requires direct file manipulation or CLI extension',
    permissionId,
    agentId,
  };
}

module.exports = {
  getPendingPermissions,
  getAllowlist,
  approvePermission,
  rejectPermission,
};
