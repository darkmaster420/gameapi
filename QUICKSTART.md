# Quick Start Guide - Game Search API v2

## 🚀 Deploy to Vercel (30 seconds)

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
vercel

# 3. Follow prompts, then your API is live!
# URL: https://your-project.vercel.app
```

## 🐳 Run with Docker (1 minute)

```bash
# 1. Build and run
docker-compose up -d

# 2. Test
curl http://localhost:3000/health

# 3. Search
curl "http://localhost:3000/?search=cuphead"
```

## 💻 Run Locally (30 seconds)

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
