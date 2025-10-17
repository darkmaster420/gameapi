# Docker Setup Guide - GameSearch API v2

## 🚀 Quick Start

Choose your setup based on whether you already have FlareSolverr running:

### Option 1: Complete Setup (Includes FlareSolverr) - **Recommended for Most Users**

Perfect if you don't have FlareSolverr or want everything in one place.

```bash
git clone <your-repo>
cd gameapi

# Start both API and FlareSolverr
docker-compose up -d

# Or explicitly use the with-flaresolverr compose file
docker-compose -f docker-compose.with-flaresolverr.yml up -d
```

This starts:
- ✅ **FlareSolverr** on internal network (not exposed publicly)
- ✅ **GameSearch API** on http://localhost:3000

### Option 2: Standalone API Only (External FlareSolverr)

Perfect if you already have FlareSolverr running elsewhere.

```bash
git clone <your-repo>
cd gameapi

# Create .env file
cp .env.example .env

# Edit .env and set your FlareSolverr URL
nano .env
# Set: FLARESOLVERR_URL=http://your-flaresolverr:8191/v1

# Start only the API
docker-compose -f docker-compose.standalone.yml up -d
```

**FlareSolverr URL Examples:**
- Local: `http://localhost:8191/v1`
- Docker network: `http://flaresolverr:8191/v1`
- Remote server: `http://192.168.1.100:8191/v1`
- Cloud: `https://your-flaresolverr.example.com/v1`

---

## Configuration

### Default Setup (docker-compose.yml / with-flaresolverr)

No configuration needed! FlareSolverr is automatically configured on the internal network.

Optional customization in `.env`:
```env
FLARE_TIMEOUT_MS=60000
FLARE_RETRIES=3
PORT=3000
NODE_ENV=production
```

### Standalone Setup (docker-compose.standalone.yml)

**Required:** Create `.env` file:
```env
FLARESOLVERR_URL=http://your-flaresolverr:8191/v1
FLARE_TIMEOUT_MS=60000
FLARE_RETRIES=3
PORT=3000
NODE_ENV=production
```

---

## Testing Your Deployment

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

### Architecture - Complete Setup (with FlareSolverr)

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

### Architecture - Standalone Setup (external FlareSolverr)

```
┌─────────────────────────────────────┐
│  Docker Compose Stack               │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  GameSearch API :3000        │  │
│  │  (Exposed to host)           │  │
│  └──────────────┬───────────────┘  │
│                 │                   │
└─────────────────┼───────────────────┘
                  │
                  │ Network/HTTP
                  ↓
      ┌────────────────────────┐
      │  FlareSolverr :8191    │
      │  (External - yours)    │
      └────────────────────────┘
```

### Why This Works

1. **FlareSolverr gets cookies**: When you request SteamRip, the API asks FlareSolverr to solve the Cloudflare challenge
2. **Cookies are cached**: The API stores these cookies in memory
3. **Fast subsequent requests**: Future requests reuse cached cookies (no FlareSolverr needed)
4. **Auto-refresh**: If cookies expire (403 error), new ones are fetched automatically
5. **Internal network**: FlareSolverr is only accessible to the API container, not the internet

---

## Management Commands

### Complete Setup (with FlareSolverr)

```bash
# Start services
docker-compose up -d
# OR
docker-compose -f docker-compose.with-flaresolverr.yml up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Rebuild after code changes
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Standalone Setup (API only)

```bash
# Start API
docker-compose -f docker-compose.standalone.yml up -d

# Stop API
docker-compose -f docker-compose.standalone.yml down

# View logs
docker-compose -f docker-compose.standalone.yml logs -f

# Restart API
docker-compose -f docker-compose.standalone.yml restart

# Rebuild after code changes
docker-compose -f docker-compose.standalone.yml down
docker-compose -f docker-compose.standalone.yml build --no-cache
docker-compose -f docker-compose.standalone.yml up -d
```

### View Individual Service Logs

```bash
# API logs
docker logs gamesearch-api -f

# FlareSolverr logs (if using complete setup)
docker logs gameapi-flaresolverr -f
```

---

## Troubleshooting

### Complete Setup Issues

#### FlareSolverr not starting

```bash
# Check FlareSolverr logs
docker logs gameapi-flaresolverr

# Restart FlareSolverr
docker-compose restart flaresolverr
```

#### API can't reach FlareSolverr

**Error:** `FLARESOLVERR_URL environment variable is required`

**Fix:**
```bash
# Check docker-compose.yml has correct FLARESOLVERR_URL
# Should be: FLARESOLVERR_URL=http://flaresolverr:8191/v1
docker-compose down
docker-compose up -d
```

### Standalone Setup Issues

#### Can't connect to external FlareSolverr

**Error:** `ECONNREFUSED` or timeout errors

**Fix:**
1. Check your `.env` file has correct `FLARESOLVERR_URL`
2. Verify FlareSolverr is running: `curl http://your-flaresolverr:8191/health`
3. If using Docker networks, ensure both containers are on same network
4. Check firewall rules if using remote FlareSolverr

**Example: Connecting to external Docker FlareSolverr**
```bash
# If your FlareSolverr is named "my-flaresolverr" on network "mynetwork"
# Update docker-compose.standalone.yml:

services:
  gameapi:
    # ... existing config ...
    environment:
      - FLARESOLVERR_URL=http://my-flaresolverr:8191/v1
    networks:
      - mynetwork

networks:
  mynetwork:
    external: true
```

### General Issues

#### SteamRip still returns 403

**Possible causes:**
1. FlareSolverr timeout - increase `FLARE_TIMEOUT_MS`
2. FlareSolverr overloaded - check logs
3. Cookie expired - API auto-refreshes, but may need time

**Debug:**
```bash
# Test FlareSolverr health
curl http://localhost:8191/health  # if complete setup
curl http://your-flaresolverr:8191/health  # if standalone

# Check API logs
docker logs gamesearch-api | grep -i steamrip
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
