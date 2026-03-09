const fs = require('fs');
const os = require('os');
const path = require('path');

const { runCommand } = require('./command-utils');
const { collectDockerInfo } = require('./docker-monitor');
const { collectPorts, getLanAddresses } = require('./network-monitor');
const { collectTopProcesses } = require('./process-manager');
const { collectServices } = require('./service-manager');

function collectSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const diskRaw = runCommand('df -h / | tail -n 1');
  const diskParts = diskRaw.split(/\s+/);

  return {
    uptimeSec: os.uptime(),
    loadavg: os.loadavg(),
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usedRatio: totalMem ? usedMem / totalMem : 0,
    },
    disk: {
      filesystem: diskParts[0] || '-',
      size: diskParts[1] || '-',
      used: diskParts[2] || '-',
      available: diskParts[3] || '-',
      ratio: diskParts[4] || '-',
      mount: diskParts[5] || '/',
    },
  };
}

function collectChannelsSummary(channelConfigPath = path.join(process.env.HOME, '.openclaw', 'openclaw.json')) {
  try {
    const obj = JSON.parse(fs.readFileSync(channelConfigPath, 'utf8'));
    const channels = obj.channels || {};
    return Object.entries(channels)
      .filter(([, value]) => value && value.enabled)
      .map(([name, value]) => ({
        name,
        enabled: !!value.enabled,
        proxy: value.proxy || null,
        streaming: value.streaming ?? null,
        groupPolicy: value.groupPolicy ?? null,
        dmPolicy: value.dmPolicy ?? null,
      }));
  } catch {
    return [];
  }
}

function collectAlerts(options = {}) {
  const alerts = [];
  const services = options.services || collectServices(options.serviceUnits || [], options);

  for (const service of services) {
    if (service.activeState !== 'active') {
      alerts.push({
        level: 'warn',
        source: service.label,
        text: `${service.label} 当前不是 active（${service.activeState}/${service.subState}）`,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  if (options.journalAlertCommand) {
    const raw = runCommand(options.journalAlertCommand);
    for (const line of raw.split('\n').filter(Boolean)) {
      alerts.push({
        level: 'info',
        source: options.journalAlertSource || 'journalctl',
        text: line,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return alerts.slice(0, options.alertLimit || 30);
}

function collectSystemOverview(options = {}) {
  const services = collectServices(options.serviceUnits || [], options);
  return {
    host: options.host,
    port: options.port,
    lan: getLanAddresses(),
    ports: collectPorts(),
    services,
    topProcesses: collectTopProcesses(options.topProcessLimit || 11),
    metrics: collectSystemMetrics(),
    channels: collectChannelsSummary(options.channelConfigPath),
    docker: collectDockerInfo(),
    alerts: collectAlerts({
      ...options,
      services,
    }),
  };
}

module.exports = {
  collectAlerts,
  collectChannelsSummary,
  collectSystemMetrics,
  collectSystemOverview,
};
