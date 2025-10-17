# VPS Deployment Guide - GameSearch API

Quick guide for deploying GameSearch API on a VPS (Ubuntu/Debian).

## Prerequisites

- Ubuntu 20.04+ or Debian 11+
- Root or sudo access
- Basic terminal knowledge

## Installation

### 1. Install Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (optional, avoids sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker installation
docker --version
```

### 2. Install Docker Compose

```bash
# Install Docker Compose V2
sudo apt install docker-compose-plugin -y

# Verify installation
docker compose version
```

### 3. Clone Repository

```bash
# Install git if needed
sudo apt install git -y

# Clone your repo
git clone https://github.com/darkmaster420/gameapi.git
cd gameapi
```

## Deployment Options

### Option A: Complete Setup (Recommended)

**Includes FlareSolverr** - Everything in one stack. No configuration needed!

```bash
# Start services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

Your API is now running at `http://your-vps-ip:3000`

**Optional: Customize settings**
```bash
# Create .env file for customization (optional)
cp .env.example .env
nano .env
# Adjust PORT, timeouts, log levels, etc.
docker compose restart
```

### Option B: API Only (External FlareSolverr)

If you already have FlareSolverr running elsewhere.

```bash
# Create .env file (REQUIRED for standalone)
cp .env.standalone.example .env

# Edit .env and set your FlareSolverr URL
nano .env
# Set: FLARESOLVERR_URL=http://your-flaresolverr:8191/v1

# Start API only
docker compose -f docker-compose.standalone.yml up -d

# Check status
docker compose -f docker-compose.standalone.yml ps

# View logs
docker compose -f docker-compose.standalone.yml logs -f
```

## Post-Deployment

### 1. Test the API

```bash
# Health check
curl http://localhost:3000/health

# Test search
curl "http://localhost:3000?search=balatro&site=steamrip"
```

### 2. Configure Firewall

```bash
# Allow port 3000
sudo ufw allow 3000/tcp

# Enable firewall (if not already)
sudo ufw enable

# Check status
sudo ufw status
```

### 3. Setup Reverse Proxy (Optional but Recommended)

#### Using Nginx

```bash
# Install Nginx
sudo apt install nginx -y

# Create config
sudo nano /etc/nginx/sites-available/gameapi
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # or your VPS IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/gameapi /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

#### Using Caddy (Easier SSL)

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Create Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Add:
```caddy
your-domain.com {
    reverse_proxy localhost:3000
}
```

```bash
# Restart Caddy
sudo systemctl restart caddy
```

Caddy automatically handles SSL certificates!

### 4. Setup Auto-Start on Reboot

Docker Compose services with `restart: unless-stopped` will automatically restart on reboot.

Verify:
```bash
# Reboot VPS
sudo reboot

# After reboot, check services are running
docker compose ps
```

## Management Commands

### View Logs
```bash
# All services
docker compose logs -f

# API only
docker logs gamesearch-api -f

# FlareSolverr only (if using complete setup)
docker logs gameapi-flaresolverr -f
```

### Restart Services
```bash
# Complete setup
docker compose restart

# Standalone
docker compose -f docker-compose.standalone.yml restart
```

### Stop Services
```bash
# Complete setup
docker compose down

# Standalone
docker compose -f docker-compose.standalone.yml down
```

### Update to Latest Code
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Check Resource Usage
```bash
# Container stats
docker stats

# Disk usage
docker system df

# Clean up old images
docker system prune -a
```

## Security Best Practices

### 1. Keep System Updated
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Use Firewall
```bash
# Only allow necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # API (if not using reverse proxy)
sudo ufw enable
```

### 3. Change Default Port (Optional)
Edit `docker-compose.yml`:
```yaml
services:
  gameapi:
    ports:
      - "8080:3000"  # Change 8080 to your preferred port
```

### 4. Setup SSL with Let's Encrypt
If using Nginx:
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

## Monitoring

### Check Health
```bash
# API health endpoint
curl http://localhost:3000/health

# Should return: {"status":"ok"}
```

### Monitor Logs in Real-Time
```bash
# Follow all logs
docker compose logs -f

# Filter for errors
docker compose logs -f | grep -i error
```

### Setup Uptime Monitoring (Optional)
Use services like:
- [UptimeRobot](https://uptimerobot.com/) (Free)
- [Healthchecks.io](https://healthchecks.io/) (Free tier)
- [BetterStack](https://betterstack.com/) (Paid)

Monitor: `http://your-domain.com/health`

## Troubleshooting

### Services won't start
```bash
# Check Docker daemon
sudo systemctl status docker

# Check logs
docker compose logs
```

### Port already in use
```bash
# Find what's using port 3000
sudo lsof -i :3000

# Kill process if needed
sudo kill <PID>

# Or change port in docker-compose.yml
```

### Out of disk space
```bash
# Clean up Docker
docker system prune -a --volumes

# Check disk usage
df -h
```

### Performance issues
```bash
# Increase resource limits in docker-compose.yml
services:
  gameapi:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

## Common VPS Providers

- **DigitalOcean**: $6/month droplet works well
- **Linode**: $5/month Nanode is sufficient
- **Vultr**: $5/month instance
- **Hetzner**: €4.15/month CX11 (EU)
- **Contabo**: €3.99/month (budget option)

**Recommended Specs:**
- 1 vCPU
- 1-2 GB RAM
- 25 GB SSD
- Ubuntu 22.04 LTS

---

Need help? Check the main [DOCKER_SETUP.md](DOCKER_SETUP.md) or open an issue!
