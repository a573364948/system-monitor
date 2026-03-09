const { parseKeyValueOutput, runCommand, runCommandResult } = require('./command-utils');

function collectServices(serviceUnits = [], options = {}) {
  const systemctlScope = options.systemctlScope || '--user';
  return serviceUnits.map(({ unit, label }) => {
    const raw = runCommand(
      `systemctl ${systemctlScope} show ${unit} -p Id -p ActiveState -p SubState -p MainPID -p MemoryCurrent -p ExecMainStartTimestamp`,
    );
    const props = parseKeyValueOutput(raw);
    return {
      label,
      unit,
      activeState: props.ActiveState || 'unknown',
      subState: props.SubState || 'unknown',
      pid: props.MainPID || '-',
      memory: props.MemoryCurrent || '-',
      startedAt: props.ExecMainStartTimestamp || '-',
    };
  });
}

function controlService(unit, action, options = {}) {
  const allowedActions = new Set(['start', 'stop', 'restart', 'reload']);
  if (!allowedActions.has(action)) {
    return { ok: false, unit, action, error: 'Unsupported action' };
  }

  const systemctlScope = options.systemctlScope || '--user';
  const result = runCommandResult(`systemctl ${systemctlScope} ${action} ${unit}`);
  return {
    ok: result.ok,
    unit,
    action,
    output: result.stdout,
    error: result.stderr || null,
  };
}

module.exports = {
  collectServices,
  controlService,
};
