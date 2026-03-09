const { runCommand } = require('./command-utils');

function parseProcessLine(line) {
  const parts = line.trim().split(/\s+/, 8);
  return {
    pid: parts[0],
    ppid: parts[1],
    cpu: parts[2],
    mem: parts[3],
    rssKb: parts[4],
    etime: parts[5],
    comm: parts[6],
    args: parts[7] || '',
  };
}

function collectTopProcesses(limit = 11) {
  const raw = runCommand(`ps -eo pid,ppid,%cpu,%mem,rss,etime,comm,args --sort=-rss | sed -n '1,${limit + 1}p'`);
  return raw
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map(parseProcessLine);
}

function signalProcess(pid, signal = 'SIGTERM') {
  if (!Number.isInteger(Number(pid))) {
    return { ok: false, error: 'Invalid PID' };
  }

  try {
    process.kill(Number(pid), signal);
    return { ok: true, pid: Number(pid), signal };
  } catch (error) {
    return { ok: false, pid: Number(pid), signal, error: String(error.message || error) };
  }
}

module.exports = {
  collectTopProcesses,
  signalProcess,
};
