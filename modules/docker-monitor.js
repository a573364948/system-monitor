const { runCommand } = require('./command-utils');

function safeParseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function collectDockerInfo() {
  const cliPath = runCommand('command -v docker');
  if (!cliPath) {
    return {
      available: false,
      reason: 'Docker CLI not installed',
      version: null,
      containers: [],
      counts: {
        total: 0,
        running: 0,
        exited: 0,
      },
    };
  }

  const version = runCommand("docker version --format '{{.Server.Version}}' 2>/dev/null");
  const infoRaw = runCommand("docker info --format '{{json .}}' 2>/dev/null");
  if (!infoRaw) {
    return {
      available: false,
      reason: 'Docker daemon unavailable or access denied',
      version: version || null,
      containers: [],
      counts: {
        total: 0,
        running: 0,
        exited: 0,
      },
    };
  }

  const info = safeParseJson(infoRaw, {});
  const containersRaw = runCommand("docker ps -a --format '{{json .}}' 2>/dev/null");
  const containers = containersRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => safeParseJson(line, null))
    .filter(Boolean)
    .map((item) => ({
      id: item.ID,
      name: item.Names,
      image: item.Image,
      command: item.Command,
      state: item.State,
      status: item.Status,
      ports: item.Ports || '',
      runningFor: item.RunningFor || '',
    }));

  return {
    available: true,
    reason: null,
    version: version || null,
    rootDir: info.DockerRootDir || null,
    driver: info.Driver || null,
    operatingSystem: info.OperatingSystem || null,
    containers: containers.slice(0, 20),
    counts: {
      total: Number(info.Containers) || containers.length,
      running: Number(info.ContainersRunning) || containers.filter((item) => item.state === 'running').length,
      exited: Number(info.ContainersStopped) || containers.filter((item) => item.state === 'exited').length,
    },
  };
}

module.exports = {
  collectDockerInfo,
};
