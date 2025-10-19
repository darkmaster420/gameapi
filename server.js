/**
 * Game Search API v2 - Express Server for Docker
 * Standalone server that can run in Docker containers
 */

import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import handler from './api/index.js';

// Get package.json version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
const VERSION = packageJson.version;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Version endpoint
app.get('/version', (req, res) => {
  res.json({
    success: true,
    version: VERSION,
    timestamp: new Date().toISOString(),
    cloudflare_detection: 'improved',
    changes: [
      'Dynamic Cloudflare detection on every request',
      'Checks response content even with 200 status',
      'Improved FlareSolverr integration for intermittent CF protection'
    ]
  });
});

// Route all requests through the Vercel handler
app.use('/', async (req, res) => {
  // Mock Vercel-like req/res objects
  req.url = req.originalUrl || req.url;
  
  try {
    await handler(req, res);
  } catch (error) {
    console.error('Handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    version: VERSION,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Game Search API v${VERSION} running on port ${PORT}`);
  console.log(`📍 Version: http://localhost:${PORT}/version`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Search: http://localhost:${PORT}/?search=your-game`);
  console.log(`📦 Recent: http://localhost:${PORT}/recent`);
  console.log(`📬 Post: http://localhost:${PORT}/post`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
