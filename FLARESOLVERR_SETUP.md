# FlareSolverr Setup Guide

## Why is FlareSolverr Required?

Some game sites (SteamRip, SkidrowReloaded) use Cloudflare protection that blocks automated requests. FlareSolverr solves these challenges so the API can access these sites.

**Sites that require FlareSolverr:**
- ✅ SteamRip
- ✅ SkidrowReloaded

**Sites that work without FlareSolverr:**
- ✅ FreeGOG
- ✅ GameDrive

---

## Quick Setup

### Option 1: Local Docker (Easiest)

```bash
# Run FlareSolverr in Docker
docker run -d \
  --name=flaresolverr \
  -p 8191:8191 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest

# Your FLARESOLVERR_URL is: http://localhost:8191/v1
```

Then set the environment variable:

**For Vercel:**
```bash
vercel env add FLARESOLVERR_URL
# Enter: http://localhost:8191/v1
# Note: This only works if deploying from the same machine
```

**For Cloudflare Workers:**
```bash
# Edit wrangler.toml
FLARESOLVERR_URL = "http://localhost:8191/v1"

# Then deploy
wrangler deploy
```

**For Docker/Express Server:**
```bash
# Add to .env file
FLARESOLVERR_URL=http://flaresolverr:8191/v1

# Or run with env var
docker run -e FLARESOLVERR_URL="http://flaresolverr:8191/v1" -p 3000:3000 gameapi
```

---

### Option 2: Cloud Deployment (Recommended for Production)

Deploy FlareSolverr to a cloud platform that stays online 24/7:

#### Railway.app
1. Go to https://railway.app
2. Create new project
3. Deploy from Docker image: `ghcr.io/flaresolverr/flaresolverr:latest`
4. Add public domain
5. Copy the URL (e.g., `https://flaresolverr-production-xxxx.railway.app`)
6. Set `FLARESOLVERR_URL=https://your-railway-url.railway.app/v1`

#### Render.com
1. Go to https://render.com
2. Create new Web Service
3. Use Docker image: `ghcr.io/flaresolverr/flaresolverr:latest`
4. Set port: `8191`
5. Copy the public URL
6. Set `FLARESOLVERR_URL=https://your-service.onrender.com/v1`

#### Heroku
```bash
heroku create my-flaresolverr
heroku container:push web -a my-flaresolverr
heroku container:release web -a my-flaresolverr
# Set FLARESOLVERR_URL=https://my-flaresolverr.herokuapp.com/v1
```

---

### Option 3: VPS Deployment

If you have a VPS (DigitalOcean, Linode, AWS EC2, etc.):

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Install Docker (if not installed)
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Run FlareSolverr
docker run -d \
  --name=flaresolverr \
  -p 8191:8191 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest

# Open port 8191 in firewall
ufw allow 8191

# Your FLARESOLVERR_URL is: http://your-vps-ip:8191/v1
```

---

## Testing Your FlareSolverr Instance

```bash
# Test if FlareSolverr is working
curl -X POST http://your-flaresolverr-url:8191/v1 \
  -H "Content-Type: application/json" \
  -d '{
    "cmd": "request.get",
    "url": "https://steamrip.com",
    "maxTimeout": 60000
  }'

# Should return JSON with "status": "ok"
```

---

## Setting Environment Variables

### Vercel
```bash
vercel env add FLARESOLVERR_URL
# Enter your FlareSolverr URL

vercel --prod  # Redeploy
```

### Cloudflare Workers
```toml
# wrangler.toml
[vars]
FLARESOLVERR_URL = "http://your-instance:8191/v1"
```

```bash
wrangler deploy
```

### Docker/Express
```bash
# .env file
FLARESOLVERR_URL=http://your-instance:8191/v1
FLARE_TIMEOUT_MS=60000
FLARE_RETRIES=3
```

---

## Troubleshooting

### FlareSolverr not responding
- Check if container is running: `docker ps`
- Check logs: `docker logs flaresolverr`
- Restart: `docker restart flaresolverr`

### Timeout errors
- Increase timeout: `FLARE_TIMEOUT_MS=60000`
- Increase retries: `FLARE_RETRIES=3`

### 403 errors still happening
- Make sure FlareSolverr URL is correct
- Test FlareSolverr directly with curl
- Check FlareSolverr logs for errors

### Sites not working
Without FlareSolverr configured:
- ❌ SteamRip - Will throw error
- ❌ SkidrowReloaded - Will throw error
- ✅ FreeGOG - Will work
- ✅ GameDrive - Will work

---

## Security Notes

⚠️ **Important:**
- FlareSolverr should NOT be publicly accessible
- Use authentication/firewall rules to restrict access
- Only your API server should be able to reach it
- Consider using a private network or VPN

**Good setup:**
```
Internet → API Server (Vercel/CF) → Private FlareSolverr
```

**Bad setup:**
```
Internet → Public FlareSolverr ← Anyone can abuse
```

---

## Future: No-FlareSolverr Solution

We're working on alternative methods that don't require FlareSolverr:
- Browser automation with Playwright/Puppeteer
- Cloudflare bypass libraries
- API key authentication (if sites provide it)

Stay tuned for updates!
