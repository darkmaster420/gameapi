/**
 * Game Search API v2 - Express Server for Docker
 * Standalone server that can run in Docker containers
 */

import express from 'express';
import handler from './api/index.js';

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
    version: '2.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Game Search API v2 running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Search: http://localhost:${PORT}/?search=your-game`);
  console.log(`📦 Recent: http://localhost:${PORT}/recent`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
