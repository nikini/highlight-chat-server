// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files (like overlay.html)
app.get('/overlay', (req, res) => {
res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Handle WebSocket connections
let overlaySocket = null;
let lastMessage = null;

wss.on('connection', (ws, req) => {
  const isOverlay = req.url === '/overlay';
  const isExtension = req.url === '/extension';

  console.log(`[WebSocket] New ${isOverlay ? 'overlay' : 'extension'} connection`);

  if (isOverlay) {
    overlaySocket = ws;
    if (lastMessage && ws.readyState === WebSocket.OPEN) {
      ws.send(lastMessage);
    }
  }

  // send the message also for extension
  if (isExtension && lastMessage && ws.readyState === WebSocket.OPEN) {
    ws.send(lastMessage);
  }

  ws.on('message', (msg) => {
    console.log(`[WebSocket] Received message: ${msg}`);

    if (isExtension) {
      lastMessage = msg;
      if (overlaySocket && overlaySocket.readyState === WebSocket.OPEN) {
        overlaySocket.send(msg);
      }
    }
  });

  ws.on('close', () => {
    if (isOverlay && ws === overlaySocket) {
      overlaySocket = null;
    }
  });
});

// Start server
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});