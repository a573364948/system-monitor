const fs = require('fs');
const path = require('path');

const PROJECT_PROFILES_PATH = path.join(__dirname, '..', 'project-profiles.json');
const PROJECT_STATE_PATH = path.join(__dirname, '..', 'data', 'project-state.json');

function loadProjectProfiles() {
  if (!fs.existsSync(PROJECT_PROFILES_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(PROJECT_PROFILES_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function loadProjectState() {
  if (!fs.existsSync(PROJECT_STATE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(PROJECT_STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveProjectState(state) {
  const dir = path.dirname(PROJECT_STATE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PROJECT_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function updateProjectState(topic, updates) {
  const state = loadProjectState();
  state[topic] = { ...state[topic], ...updates, updatedAt: new Date().toISOString() };
  saveProjectState(state);
  return state[topic];
}

function getProjectState(topic) {
  const state = loadProjectState();
  return state[topic] || null;
}

function listProjects() {
  const profiles = loadProjectProfiles();
  const state = loadProjectState();
  return Object.keys(profiles).map((topic) => ({
    topic,
    profile: profiles[topic],
    state: state[topic] || null,
  }));
}

module.exports = {
  loadProjectProfiles,
  loadProjectState,
  saveProjectState,
  updateProjectState,
  getProjectState,
  listProjects,
};
