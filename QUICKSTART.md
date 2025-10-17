# Quick Start Guide - Game Search API v2

Choose your deployment method:

## 🐳 Docker (VPS) - **Recommended for Full Features**

Perfect for VPS, homelab, or self-hosting with built-in FlareSolverr support.

### Option A: Complete Setup (includes FlareSolverr)
```bash
git clone https://github.com/darkmaster420/gameapi.git
cd gameapi
docker compose up -d
```

✅ All sites working (including SteamRip & SkidrowReloaded)  
API available at: `http://localhost:3000`

### Option B: Standalone (external FlareSolverr)
```bash
git clone https://github.com/darkmaster420/gameapi.git
cd gameapi
cp .env.example .env
nano .env  # Set FLARESOLVERR_URL=http://your-flaresolverr:8191/v1
docker compose -f docker-compose.standalone.yml up -d
```

**📚 Full Guide:** [VPS_DEPLOYMENT.md](VPS_DEPLOYMENT.md) | [DOCKER_SETUP.md](DOCKER_SETUP.md)

---

## ☁️ Vercel (Serverless) - Easy but Limited

⚠️ **Limitation:** Cannot run FlareSolverr. Need external instance for SteamRip/SkidrowReloaded.

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
vercel

# 3. Set environment variable in Vercel dashboard:
#    FLARESOLVERR_URL=http://your-external-flaresolverr:8191/v1
```

✅ FreeGOG & GameDrive work  
⚠️ SteamRip & SkidrowReloaded require external FlareSolverr

---

## ⚡ Cloudflare Workers - Edge Performance

⚠️ **Limitation:** Cannot run FlareSolverr. Need external instance for SteamRip/SkidrowReloaded.

```bash
# 1. Install dependencies (if needed)
npm install

# 2. Start server
npm start

# 3. API runs on http://localhost:3000
```

## 🧪 Test the API

```bash
# Run test script
./test.sh

# Or manual tests:
curl "http://localhost:3000/?search=celeste"
curl "http://localhost:3000/?search=game&site=freegog"
curl "http://localhost:3000/recent"
```

## 📚 API Usage

### Search all sites:
```javascript
const response = await fetch('https://your-api.vercel.app/?search=cuphead');
const data = await response.json();
console.log(data.results);
```

### Search specific site:
```javascript
const response = await fetch('https://your-api.vercel.app/?search=game&site=freegog');
const data = await response.json();
console.log(data.results);
```

### Get recent uploads:
```javascript
const response = await fetch('https://your-api.vercel.app/recent');
const data = await response.json();
console.log(data.results);
```

## 🔧 Configuration

### Change sites or limits:
Edit `lib/helpers.js`:
```javascript
export const SITE_CONFIGS = {
  'yoursite': {
    baseUrl: 'https://yoursite.com/wp-json/wp/v2/posts',
    type: 'yoursite',
    name: 'YourSite'
  }
};
```

### Environment variables (optional):
```bash
PORT=3000          # Server port (Docker only)
NODE_ENV=production # Environment
```

## ✅ That's it!

Your Game Search API v2 is ready to use!

For more details, see:
- `README.md` - Full documentation
- `SUMMARY.md` - Complete feature list
- `test.sh` - Test examples
