const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'config');

function loadConfig(name) {
  const filePath = path.join(CONFIG_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to load config ${name}:`, error);
    return null;
  }
}

function getDefaultConfig() {
  return loadConfig('default') || {};
}

function getServicesConfig() {
  return loadConfig('services') || { services: [] };
}

function getCommandsConfig() {
  return loadConfig('commands') || { commands: [] };
}

function getConfig(key, defaultValue = null) {
  const config = getDefaultConfig();
  const keys = key.split('.');
  let value = config;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return defaultValue;
    }
  }
  return value;
}

module.exports = {
  loadConfig,
  getDefaultConfig,
  getServicesConfig,
  getCommandsConfig,
  getConfig,
};
