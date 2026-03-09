const os = require('os');

const { runCommand } = require('./command-utils');

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const results = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        results.push({ name, address: entry.address });
      }
    }
  }
  return results;
}

function parsePortLines(output, protocol) {
  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    const parts = line.split(/\s+/);
    const local = parts[3] || '';
    const peer = parts[4] || '';
    const process = parts.slice(5).join(' ');
    const port = local.includes(':') ? local.split(':').pop() : local;
    const appMatch = process.match(/users:\(\(\"([^\"]+)/);
    const pidMatch = process.match(/pid=(\d+)/);
    return {
      protocol,
      local,
      peer,
      port,
      process: appMatch ? appMatch[1] : process || 'unknown',
      pid: pidMatch ? Number(pidMatch[1]) : null,
      raw: line,
    };
  });
}

function collectPorts() {
  const tcp = runCommand('ss -lntpH');
  const udp = runCommand('ss -lnupH');
  return [...parsePortLines(tcp, 'tcp'), ...parsePortLines(udp, 'udp')]
    .sort((a, b) => Number(a.port || 0) - Number(b.port || 0));
}

module.exports = {
  collectPorts,
  getLanAddresses,
  parsePortLines,
};
