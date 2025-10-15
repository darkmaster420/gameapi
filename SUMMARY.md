# Game Search API v2 - Summary

## 🎯 What Was Created

A complete rewrite of the Game Search API optimized for Vercel and Docker deployments.

## 📁 File Structure

```
gameapi/
├── api/
│   └── index.js              # Vercel serverless function handler
├── lib/
│   └── helpers.js            # Shared utilities and configurations
├── server.js                 # Express server for Docker
├── Dockerfile                # Docker image configuration
├── docker-compose.yml        # Docker Compose setup
├── vercel.json               # Vercel deployment configuration
├── package.json              # Dependencies (v2.0.0)
├── .dockerignore             # Docker build exclusions
├── .gitignore                # Git exclusions (added .vercel)
├── test.sh                   # Test script
├── README.md                 # v2 documentation
└── README.v1.md              # Backup of v1 README

# Not used in vercel branch (for reference only):
├── worker.js                 # Cloudflare Workers (main branch)
└── wrangler.toml             # Cloudflare config (main branch)
```

## 🚀 Key Features

### 1. **Dual Deployment Support**
- **Vercel**: Serverless functions with automatic scaling
- **Docker**: Standalone container for any host

### 2. **Modular Architecture**
- `lib/helpers.js`: Shared configuration and utilities
- `api/index.js`: Vercel-compatible handler
- `server.js`: Express server wrapping the same handler

### 3. **Fixed Issues from v1**
- ✅ **FreeGOG pagination bug**: Removed `per_page` and `page` params for FreeGOG
- ✅ **CORS headers**: Properly set in all responses
- ✅ **Error handling**: Better error messages and logging
- ✅ **Health checks**: Docker healthcheck support

### 4. **API Endpoints**

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /?search=game` | Search all sites | ✅ Implemented |
| `GET /?search=game&site=X` | Search specific site | ✅ Implemented |
| `GET /recent` | Recent uploads | ✅ Implemented |
| `GET /health` | Health check | ✅ Implemented |
| `GET /post` | Post details | 🚧 Placeholder |
| `GET /proxy-image` | Image proxy | 🚧 Placeholder |
| `GET /decrypt` | Decrypt links | 🚧 Placeholder |

## 🔧 Deployment Instructions

### Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Login (if not already)
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Docker Deployment

```bash
# Build image
docker build -t gamesearch-api .

# Run container
docker run -p 3000:3000 gamesearch-api

# Or use Docker Compose
docker-compose up -d
```

### Local Development

```bash
# Install dependencies
npm install

# Start Express server
npm start

# Or start Vercel dev server
npm run dev
```

## 📊 Configuration

### Site Configurations (lib/helpers.js)

```javascript
export const SITE_CONFIGS = {
  'skidrow': {
    baseUrl: 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts',
    type: 'skidrow',
    name: 'SkidrowReloaded'
  },
  'freegog': {
    baseUrl: 'https://freegogpcgames.com/wp-json/wp/v2/posts',
    type: 'freegog',
    name: 'FreeGOGPCGames'
  },
  'gamedrive': {
    baseUrl: 'https://gamedrive.org/wp-json/wp/v2/posts',
    type: 'gamedrive',
    name: 'GameDrive'
  },
  'steamrip': {
    baseUrl: 'https://steamrip.com/wp-json/wp/v2/posts',
    type: 'steamrip',
    name: 'SteamRip'
  }
};
```

### Max Posts Per Site

```javascript
export const MAX_POSTS_PER_SITE = {
  'skidrow': 40,
  'gamedrive': 40,
  'steamrip': 40,
  'freegog': 40,  // No pagination params sent
  'default': 50
};
```

## 🧪 Testing

Run the test script:
```bash
./test.sh
```

Or manual tests:
```bash
# Health check
curl http://localhost:3000/health

# Search
curl "http://localhost:3000/?search=cuphead"

# Site-specific
curl "http://localhost:3000/?search=game&site=freegog"

# Recent uploads
curl http://localhost:3000/recent
```

## 🔄 Differences from v1

| Feature | v1 (main) | v2 (vercel) |
|---------|-----------|-------------|
| Platform | Cloudflare Workers | Vercel + Docker |
| Architecture | Single worker.js | Modular (api/, lib/) |
| FreeGOG fix | ❌ Not applied | ✅ Fixed |
| Docker support | ❌ No | ✅ Yes |
| Express server | ❌ No | ✅ Yes |
| Health endpoint | ❌ No | ✅ Yes |
| Modularity | ❌ Monolithic | ✅ Modular |

## 📝 Response Format

### Success Response
```json
{
  "success": true,
  "results": [
    {
      "id": "123",
      "title": "Game Title",
      "excerpt": "Description...",
      "link": "https://...",
      "date": "2025-10-14T...",
      "source": "SkidrowReloaded",
      "siteType": "skidrow"
    }
  ],
  "count": 1
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "message": "Details..."
}
```

## 🎯 Next Steps

### Priority 1 - Core Functionality
- [ ] Implement `/post` endpoint (fetch full post content)
- [ ] Implement `/proxy-image` endpoint (proxy images through API)
- [ ] Implement `/decrypt` endpoint (decrypt download links)

### Priority 2 - Optimization
- [ ] Add Redis caching for Docker deployments
- [ ] Add rate limiting middleware
- [ ] Add request logging and analytics

### Priority 3 - Features
- [ ] Add more game sources
- [ ] Add torrent magnet link parsing
- [ ] Add download link extraction
- [ ] Add NFO file parsing

## ⚠️ Important Notes

1. **Branch Strategy**
   - `main` branch: Cloudflare Workers version (v1)
   - `vercel` branch: Vercel/Docker version (v2)
   - Keep them separate!

2. **Dependencies**
   - v2 uses Express (not needed in v1)
   - v1 uses Wrangler (not needed in v2)

3. **FreeGOG Fix**
   - The fix for FreeGOG pagination is **only in v2**
   - If you want it in v1, apply the same logic to worker.js

4. **Environment Variables**
   - v2 uses standard Node.js env vars
   - No Cloudflare-specific vars needed

## 🐛 Known Limitations

1. **Incomplete Endpoints**
   - Post details, image proxy, and decrypt endpoints return 501 (Not Implemented)
   - These need to be ported from worker.js

2. **No Cloudflare-Specific Features**
   - No KV storage
   - No Cloudflare Workers KV for caching
   - Use Redis or memory cache instead

3. **SteamRip/Skidrow Auth**
   - Cloudflare bypass logic not implemented
   - May need to add if those sites block requests

## 📦 Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "vercel": "^33.0.0"
  }
}
```

## 🎉 Summary

v2 is a **clean, modular rewrite** that:
- ✅ Works with Vercel serverless functions
- ✅ Works with Docker containers
- ✅ Fixes FreeGOG pagination issues
- ✅ Has proper error handling and CORS
- ✅ Includes health checks and testing
- ✅ Has comprehensive documentation

It's **production-ready** for the implemented endpoints (search, recent, health).

The placeholder endpoints (post, proxy-image, decrypt) can be implemented by porting the logic from worker.js when needed.
