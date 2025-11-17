// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const KEEP_ALIVE_INTERVAL = 30000; // ms between ping frames

function heartbeat() {
  this.isAlive = true;
}

// ---- allow-list of namespaces (rooms) ----
const allowedNamespaces = new Set(['vpm-yt-b8j4l', 'chip-guy-yt-j7rup']); // add more like: 'abc', 'demo'

// ---- per-namespace state ----
const overlays = new Map();        // ns -> overlay WebSocket
const lastMessages = new Map();    // ns -> last JSON/string message

// Serve overlay page for a given namespace
app.get('/:ns/overlay', (req, res) => {
  const ns = req.params.ns;
  if (!allowedNamespaces.has(ns)) return res.status(403).send('Namespace not allowed');
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// (Optional) block old non-namespaced route explicitly
app.get('/overlay', (_req, res) => res.status(404).send('Use /:ns/overlay'));

// Periodically ping every client to keep the connections alive and detect drops
const keepAliveTimer = setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.isAlive === false) {
      try { client.terminate(); } catch {}
      return;
    }

    client.isAlive = false;
    if (client.readyState === WebSocket.OPEN) {
      client.ping(); // tells the browser to respond with pong
    }
  });
}, KEEP_ALIVE_INTERVAL);

wss.on('close', () => clearInterval(keepAliveTimer));

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  // Expected paths:
  //   /:ns/overlay
  //   /:ns/extension
  // (reject if not matching)
  const parts = req.url.split('/').filter(Boolean); // e.g. ['vpm','overlay']
  const [ns, role] = parts.length === 2 ? parts : [null, null];

  const isOverlay = role === 'overlay';
  const isExtension = role === 'extension';

  // Validate namespace and role
  if (!ns || (!isOverlay && !isExtension) || !allowedNamespaces.has(ns)) {
    try { ws.close(1008, 'Namespace or path not allowed'); } catch {}
    return;
  }

  console.log(`[WebSocket] New ${role} connection in ns="${ns}"`);

  ws.isAlive = true;
  ws.on('pong', heartbeat);

  if (isOverlay) {
    // Track overlay socket for this namespace
    overlays.set(ns, ws);

    // If we already have a last message for this ns, replay it to the new overlay
    const last = lastMessages.get(ns);
    if (last && ws.readyState === WebSocket.OPEN) {
      ws.send(last);
    }
  }

  ws.on('message', (msg) => {
    // Typically extensions send messages; forward to overlay in same namespace
    if (isExtension) {
      lastMessages.set(ns, msg);

      const overlaySocket = overlays.get(ns);
      if (overlaySocket && overlaySocket.readyState === WebSocket.OPEN) {
        overlaySocket.send(msg);
      }
    }

    console.log(`[WebSocket] (${ns}/${role}) Received: ${msg}`);
  });

  ws.on('close', () => {
    if (isOverlay && overlays.get(ns) === ws) {
      overlays.delete(ns);
    }
    // No need to clean lastMessages; keeping it lets new overlays get state instantly
  });
});

// Start server
const PORT = 3001;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`➡️  Allowed namespaces: ${Array.from(allowedNamespaces).join(', ')}`);
  console.log(`➡️  Overlay page example: http://localhost:${PORT}/vpm/overlay`);
});
