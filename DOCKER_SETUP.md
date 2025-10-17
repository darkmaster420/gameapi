# Docker Setup Guide - GameSearch API v2

## Quick Start with Docker Compose (Recommended)

This setup includes FlareSolverr as a sidecar service, so you don't need to manage it separately!

### 1. Clone and Setup

```bash
git clone <your-repo>
cd gameapi
cp .env.example .env
```

### 2. Configure Environment (Optional)

The `docker-compose.yml` already includes FlareSolverr with correct internal networking.

Edit `.env` if you want to customize:
```env
FLARESOLVERR_URL=http://flaresolverr:8191/v1
FLARE_TIMEOUT_MS=60000
FLARE_RETRIES=3
PORT=3000
NODE_ENV=production
```

### 3. Start Everything

```bash
docker-compose up -d
```

This starts:
- ✅ **FlareSolverr** on internal network (not exposed)
- ✅ **GameSearch API** on http://localhost:3000

### 4. Check Status

```bash
# View logs
docker-compose logs -f

# Check health
curl http://localhost:3000/health
```

### 5. Test API

```bash
# Test FreeGOG (no FlareSolverr needed)
curl "http://localhost:3000?search=witcher&site=freegog"

# Test SteamRip (uses FlareSolverr internally)
curl "http://localhost:3000?search=balatro&site=steamrip"

# Get recent uploads (all sites)
curl "http://localhost:3000/recent"
```

---

## How It Works

### Architecture

```
┌─────────────────────────────────────┐
│  Docker Compose Stack               │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  GameSearch API :3000        │  │
│  │  (Exposed to host)           │  │
│  └──────────────┬───────────────┘  │
│                 │                   │
│                 │ Internal Network  │
│                 ↓                   │
│  ┌──────────────────────────────┐  │
│  │  FlareSolverr :8191          │  │
│  │  (Internal only)             │  │
│  └──────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
         ↑
         │ Port 3000
         │
    ┌────┴────┐
    │  Users  │
    └─────────┘
```

### Why This Works

1. **FlareSolverr gets cookies**: When you request SteamRip, the API asks FlareSolverr to solve the Cloudflare challenge
2. **Cookies are cached**: The API stores these cookies in memory
3. **Fast subsequent requests**: Future requests reuse cached cookies (no FlareSolverr needed)
4. **Auto-refresh**: If cookies expire (403 error), new ones are fetched automatically
5. **Internal network**: FlareSolverr is only accessible to the API container, not the internet

---

## Management Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### Restart Services
```bash
docker-compose restart
```

### View Logs
```bash
# All services
docker-compose logs -f

# Just API
docker-compose logs -f gameapi

# Just FlareSolverr
docker-compose logs -f flaresolverr
```

### Rebuild After Code Changes
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## Troubleshooting

### FlareSolverr not starting

```bash
# Check FlareSolverr logs
docker-compose logs flaresolverr

# Restart FlareSolverr
docker-compose restart flaresolverr
```

### API can't reach FlareSolverr

**Error:** `FLARESOLVERR_URL environment variable is required`

**Fix:**
```bash
# Check docker-compose.yml has correct FLARESOLVERR_URL
# Should be: FLARESOLVERR_URL=http://flaresolverr:8191/v1
docker-compose down
docker-compose up -d
```

### SteamRip still returns 403

**Possible causes:**
1. FlareSolverr timeout - increase `FLARE_TIMEOUT_MS`
2. FlareSolverr overloaded - check logs
3. Cookie expired - API auto-refreshes, but may need time

**Debug:**
```bash
# Test FlareSolverr directly
docker exec -it flaresolverr curl http://localhost:8191/health

# Check API logs
docker-compose logs -f gameapi | grep -i steamrip
```

### Port 3000 already in use

**Error:** `address already in use`

**Fix:**
```bash
# Change port in docker-compose.yml
ports:
  - "3001:3000"  # Use port 3001 instead

# Or stop conflicting service
sudo lsof -i :3000
sudo kill <PID>
```

---

## Production Deployment

### Environment Variables

For production, customize these in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  - FLARESOLVERR_URL=http://flaresolverr:8191/v1
  - FLARE_TIMEOUT_MS=90000     # Increase for production
  - FLARE_RETRIES=5             # More retries
```

### Resource Limits

Add resource limits to prevent overuse:

```yaml
services:
  gameapi:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  flaresolverr:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
```

### Reverse Proxy (Nginx/Caddy)

```nginx
# nginx.conf
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### SSL/TLS (Let's Encrypt)

```bash
# Using Caddy (automatic HTTPS)
caddy reverse-proxy --from api.yourdomain.com --to localhost:3000
```

---

## Scaling Considerations

### Multiple API Instances

If you need to scale horizontally:

```yaml
services:
  gameapi:
    # ... existing config ...
    deploy:
      replicas: 3  # Run 3 instances

  flaresolverr:
    # Keep one FlareSolverr instance
    # All API instances will share it
```

### Persistent Cookies (Redis)

For multi-instance deployments, use Redis to share cookies:

```yaml
services:
  redis:
    image: redis:alpine
    networks:
      - gameapi-network

  gameapi:
    environment:
      - REDIS_URL=redis://redis:6379
```

(Redis integration coming soon!)

---

## Alternative: Standalone Docker

If you prefer to run just the API (without Docker Compose):

### 1. Run FlareSolverr separately
```bash
docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest
```

### 2. Build and run API
```bash
docker build -t gameapi .
docker run -d \
  --name gameapi \
  -p 3000:3000 \
  -e FLARESOLVERR_URL="http://host.docker.internal:8191/v1" \
  -e FLARE_TIMEOUT_MS=60000 \
  -e FLARE_RETRIES=3 \
  gameapi
```

**Note:** Use `host.docker.internal` on Mac/Windows, or `172.17.0.1` on Linux to access host services.

---

## Monitoring

### Health Checks

```bash
# API health
curl http://localhost:3000/health

# FlareSolverr health (from inside API container)
docker exec gameapi curl http://flaresolverr:8191/health
```

### Performance Metrics

```bash
# API stats
docker stats gameapi

# FlareSolverr stats
docker stats flaresolverr
```

---

## Next Steps

- ✅ API is running with built-in FlareSolverr
- 🔄 Set up monitoring/logging (Prometheus, Grafana)
- 🔄 Configure reverse proxy for production
- 🔄 Set up automatic backups
- 🔄 Implement rate limiting
- 🔄 Add Redis for multi-instance deployments
