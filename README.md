# 🎮 GameSearch Worker

A [Cloudflare Worker](https://developers.cloudflare.com/workers/) that aggregates game data from multiple sources into a single JSON API.  
Supports searching, recent uploads, proxied images, and on-demand **crypt link decryption**.

---

## 🚀 Features
- 🔍 **Search API** – Query across multiple game sources in one call.  
- 🕒 **Recent Uploads** – Fetch the latest games from supported sources.  
- 🖼 **Image Proxy** – Serve remote images via the Worker to avoid hotlinking / CORS issues.  
- 🔑 **Crypt Link Decryption** – Convert encrypted crypt.gg–style links into real direct links (Mega, Mediafire, torrents, etc).  
- 📊 **Per-Site Stats** – Search responses include source breakdown counts.  
- ⚡ **Serverless** – Runs entirely on Cloudflare’s edge network.  

---

## 📡 API Endpoints

### `GET /?search=<query>&site=<site>`
Search for games.  

**Query Parameters:**
- `search` *(required)* – The search term (game title, keyword, etc).  
- `site` *(optional)* – Limit to one source. Options:  
  - `skidrow` → SkidrowReloaded  
  - `freegog` → FreeGOGPCGames  
  - `gamedrive` → GameDrive  
  - `all` *(default)* → all supported sites  

**Example:**
```bash
curl "https://<your-worker-subdomain>.workers.dev/?search=witcher&site=all"
```


### GET /recent

Fetch the latest uploads across all sources.

Example:
```bash
curl "https://<your-worker-subdomain>.workers.dev/recent"
```

### GET /proxy-image?url=<encodedUrl>

Proxy and serve external images safely.

Example:
```bash
curl "https://<your-worker-subdomain>.workers.dev/proxy-image?url=https%3A%2F%2Fexample.com%2Fcover.jpg"
```

### GET /decrypt?hash=<cryptHash>

Decrypts a crypt.gg–style hash into the real link and service type.

Response:
```json
{
  "url": "https://mega.nz/...",
  "service": "Mega"
}
```
Example:
```bash
curl "https://<your-worker-subdomain>.workers.dev/decrypt?hash=abc123xyz"
```

---

## 📦 Response Structure

All search/recent endpoints return JSON in the form:
```json
{
  "success": true,
  "results": [
    {
      "id": "unique-id",
      "title": "Game Title",
      "description": "Short description",
      "date": "2025-09-01T12:00:00Z",
      "image": "https://example.com/poster.jpg",
      "link": "https://source-site.com/game/123",
      "source": "SkidrowReloaded",
      "downloadLinks": [
        {
          "url": "https://mega.nz/...",
          "service": "Mega",
          "text": "Mega Link"
        },
        {
          "url": "https://crypt.gg/#abc123",
          "type": "crypt"
        }
      ]
    }
  ],
  "siteStats": {
    "SkidrowReloaded": 12,
    "FreeGOGPCGames": 5
  }
}
```
---
## 🖥 Frontend Integration

This Worker is designed to be used with a React frontend.
Here’s an example integration (App.js from this project):
```json
const WORKER_URL = 'https://<your-worker-subdomain>.workers.dev';

const searchGames = async (query) => {
  const params = new URLSearchParams({ search: query, site: 'both' });
  const response = await fetch(`${WORKER_URL}?${params}`);
  const data = await response.json();
  return data.results || [];
};

const decryptCryptLink = async (hash) => {
  const response = await fetch(`${WORKER_URL}/decrypt?hash=${encodeURIComponent(hash)}`);
  return await response.json();
};

const getProxiedImageUrl = (url) =>
  `${WORKER_URL}/proxy-image?url=${encodeURIComponent(url)}`;
```
In the React app:

Calls /recent on initial load to display the newest games.

Calls /?search=query when searching.

Proxies game images through /proxy-image for reliability.

Handles crypt links by calling /decrypt?hash=... only when a user clicks on them (avoiding Worker subrequest limits).

---

## ⚙️ Configuration

The worker supports optional environment variables for enhanced functionality:

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `FLARESOLVERR_URL` | FlareSolverr instance URL for bypassing Cloudflare protection | `https://flare.iforgor.cc/v1` | No |

### Setting Environment Variables

In `wrangler.toml`:
```toml
[vars]
FLARESOLVERR_URL = "https://your-flaresolverr-instance.com/v1"
```

Or using Wrangler CLI:
```bash
wrangler secret put FLARESOLVERR_URL
```

---

## 🛠 Deployment

1. Install Wrangler CLI:
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
wrangler login
```

3. Deploy:
```bash
wrangler deploy
```
alternatively you can just copy and paste into workers

---

## ⚠️ Disclaimer

This project is for educational purposes only.
It aggregates publicly available data and does not host or distribute any game files.
Use responsibly.


---

## 📄 License

MIT