const WebSocket = require('ws');

let wss = null;
const clients = new Set();

function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    clients.add(ws);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        handleWebSocketMessage(ws, data);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connected',
      timestamp: new Date().toISOString(),
    }));
  });

  console.log('WebSocket server initialized on /ws');
}

function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      break;
    case 'subscribe':
      // Handle subscription to specific channels
      ws.channels = data.channels || [];
      break;
    default:
      console.log('Unknown WebSocket message type:', data.type);
  }
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastToChannel(channel, message) {
  const payload = JSON.stringify({ ...message, channel });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.channels && client.channels.includes(channel)) {
      client.send(payload);
    }
  });
}

module.exports = {
  initWebSocket,
  broadcast,
  broadcastToChannel,
};
