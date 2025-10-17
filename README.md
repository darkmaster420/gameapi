# Game Search API v2# 🎮 GameSearch Worker



A modern, flexible API for searching game downloads across multiple sites. Compatible with **Vercel** and **Docker** deployments.A [Cloudflare Worker](https://developers.cloudflare.com/workers/) that aggregates game data from multiple sources into a single JSON API.  

Supports searching, recent uploads, proxied images, and on-demand **crypt link decryption**.

## 🚀 Features

---

- **Multi-site search**: Search across SkidrowReloaded, FreeGOG, GameDrive, and SteamRip

- **Recent uploads**: Get the latest game releases## 🚀 Features

- **Flexible deployment**: Works with Vercel serverless functions or Docker containers- 🔍 **Search API** – Query across multiple game sources in one call.  

- **CORS enabled**: Use from any frontend- 🕒 **Recent Uploads** – Fetch the latest games from supported sources.  

- **Smart caching**: Optimized for performance- 🖼 **Image Proxy** – Serve remote images via the Worker to avoid hotlinking / CORS issues.  

- **FreeGOG fix**: Properly handles FreeGOG API without pagination issues- 🔑 **Crypt Link Decryption** – Convert encrypted crypt.gg–style links into real direct links (Mega, Mediafire, torrents, etc).  

- 📊 **Per-Site Stats** – Search responses include source breakdown counts.  

## 📋 API Endpoints- ⚡ **Serverless** – Runs entirely on Cloudflare’s edge network.  



### Search Games---

```

GET /?search=your-game-name## 📡 API Endpoints

GET /?search=your-game-name&site=skidrow

```### `GET /?search=<query>&site=<site>`

Search for games.  

**Query Parameters:**

- `search` (required): Game name to search for**Query Parameters:**

- `site` (optional): Specific site to search (`skidrow`, `freegog`, `gamedrive`, `steamrip`)- `search` *(required)* – The search term (game title, keyword, etc).  

- `site` *(optional)* – Limit to one source. Options:  

**Response:**  - `skidrow` → SkidrowReloaded  

```json  - `freegog` → FreeGOGPCGames  

{  - `gamedrive` → GameDrive  

  "success": true,  - `all` *(default)* → all supported sites  

  "results": [

    {**Example:**

      "id": "12345",```bash

      "title": "Game Title",curl "https://<your-worker-subdomain>.workers.dev/?search=witcher&site=all"

      "excerpt": "Game description...",```

      "link": "https://...",

      "date": "2025-10-14T...",

      "source": "SkidrowReloaded",### GET /recent

      "siteType": "skidrow"

    }Fetch the latest uploads across all sources.

  ],

  "count": 10Example:

}```bash

```curl "https://<your-worker-subdomain>.workers.dev/recent"

```

### Recent Uploads

```### GET /proxy-image?url=<encodedUrl>

GET /recent

```Proxy and serve external images safely.



Returns the most recent game uploads from all sites.Example:

```bash

### Health Checkcurl "https://<your-worker-subdomain>.workers.dev/proxy-image?url=https%3A%2F%2Fexample.com%2Fcover.jpg"

``````

GET /health

```### GET /decrypt?hash=<cryptHash>



Returns API status and version information.Decrypts a crypt.gg–style hash into the real link and service type.



## 🔧 Deployment OptionsResponse:

```json

### Option 1: Vercel (Recommended for Production){

  "url": "https://mega.nz/...",

1. **Install Vercel CLI:**  "service": "Mega"

   ```bash}

   npm install -g vercel```

   ```Example:

```bash

2. **Deploy:**curl "https://<your-worker-subdomain>.workers.dev/decrypt?hash=abc123xyz"

   ```bash```

   vercel

   ```---



3. **Production deploy:**## 📦 Response Structure

   ```bash

   vercel --prodAll search/recent endpoints return JSON in the form:

   ``````json

{

The API will be available at: `https://your-project.vercel.app`  "success": true,

  "results": [

### Option 2: Docker    {

      "id": "unique-id",

1. **Build the image:**      "title": "Game Title",

   ```bash      "description": "Short description",

   npm run docker:build      "date": "2025-09-01T12:00:00Z",

   # or      "image": "https://example.com/poster.jpg",

   docker build -t gamesearch-api .      "link": "https://source-site.com/game/123",

   ```      "source": "SkidrowReloaded",

      "downloadLinks": [

2. **Run the container:**        {

   ```bash          "url": "https://mega.nz/...",

   npm run docker:run          "service": "Mega",

   # or          "text": "Mega Link"

   docker run -p 3000:3000 gamesearch-api        },

   ```        {

          "url": "https://crypt.gg/#abc123",

3. **Or use Docker Compose:**          "type": "crypt"

   ```bash        }

   docker-compose up -d      ]

   ```    }

  ],

The API will be available at: `http://localhost:3000`  "siteStats": {

    "SkidrowReloaded": 12,

### Option 3: Node.js (Development)    "FreeGOGPCGames": 5

  }

1. **Install dependencies:**}

   ```bash```

   npm install---

   ```## 🖥 Frontend Integration



2. **Start the server:**This Worker is designed to be used with a React frontend.

   ```bashHere’s an example integration (App.js from this project):

   npm start```json

   ```const WORKER_URL = 'https://<your-worker-subdomain>.workers.dev';



3. **For development with Vercel CLI:**const searchGames = async (query) => {

   ```bash  const params = new URLSearchParams({ search: query, site: 'both' });

   npm run dev  const response = await fetch(`${WORKER_URL}?${params}`);

   ```  const data = await response.json();

  return data.results || [];

## 🛠️ Configuration};



### Environment Variablesconst decryptCryptLink = async (hash) => {

  const response = await fetch(`${WORKER_URL}/decrypt?hash=${encodeURIComponent(hash)}`);

- `PORT` - Server port (default: 3000)  return await response.json();

- `NODE_ENV` - Environment mode (production/development)};



### Site Configurationconst getProxiedImageUrl = (url) =>

  `${WORKER_URL}/proxy-image?url=${encodeURIComponent(url)}`;

Edit `lib/helpers.js` to modify site configurations, timeouts, or add new sources.```

In the React app:

## 📊 Architecture

Calls /recent on initial load to display the newest games.

```

gameapi/Calls /?search=query when searching.

├── api/

│   └── index.js          # Vercel serverless function handlerProxies game images through /proxy-image for reliability.

├── lib/

│   └── helpers.js        # Shared utility functionsHandles crypt links by calling /decrypt?hash=... only when a user clicks on them (avoiding Worker subrequest limits).

├── server.js             # Express server for Docker

├── Dockerfile            # Docker image configuration---

├── docker-compose.yml    # Docker Compose setup

├── vercel.json           # Vercel configuration## ⚙️ Configuration

└── package.json          # Dependencies and scripts

```The worker supports optional environment variables for enhanced functionality:



## 🔄 Migration from v1### Environment Variables



v2 is a complete rewrite with:| Variable | Description | Default | Required |

- ✅ Removed Cloudflare Workers dependency|----------|-------------|---------|----------|

- ✅ Added Express server for Docker support| `FLARESOLVERR_URL` | FlareSolverr instance URL for bypassing Cloudflare protection | `https://flare.iforgor.cc/v1` | No |

- ✅ Modular architecture (easy to maintain)

- ✅ Better error handling### Setting Environment Variables

- ✅ Fixed FreeGOG pagination issues

- ✅ Simplified deployment optionsIn `wrangler.toml`:

```toml

## 🐛 Known Issues & Fixes[vars]

FLARESOLVERR_URL = "https://your-flaresolverr-instance.com/v1"

### FreeGOG Not Returning Results```

**Fixed in v2!** FreeGOG's API doesn't handle `per_page` and `page` parameters properly. v2 excludes these parameters for FreeGOG requests.

Or using Wrangler CLI:

### CORS Errors```bash

v2 includes proper CORS headers by default. No additional configuration needed.wrangler secret put FLARESOLVERR_URL

```

## 📝 Examples

---

### Basic Search

```bash## 🛠 Deployment

curl "https://your-api.vercel.app/?search=cuphead"

```1. Install Wrangler CLI:

```bash

### Site-Specific Searchnpm install -g wrangler

```bash```

curl "https://your-api.vercel.app/?search=hollow%20knight&site=freegog"

```2. Login to Cloudflare:

```bash

### Recent Uploadswrangler login

```bash```

curl "https://your-api.vercel.app/recent"

```3. Deploy:

```bash

### With JavaScriptwrangler deploy

```javascript```

const response = await fetch('https://your-api.vercel.app/?search=celeste');alternatively you can just copy and paste into workers

const data = await response.json();

console.log(data.results);---

```

## ⚠️ Disclaimer

## 📦 NPM Scripts

This project is for educational purposes only.

- `npm run dev` - Start Vercel dev serverIt aggregates publicly available data and does not host or distribute any game files.

- `npm start` - Start Express server (for Docker)Use responsibly.

- `npm run docker:build` - Build Docker image

- `npm run docker:run` - Run Docker container

---

## 🔐 Security

## 📄 License

- No API keys required

- Rate limiting handled by deployment platform (Vercel/Docker host)MIT
- All external requests use HTTPS
- No user data stored

## 📄 License

MIT

## 🤝 Contributing

This is the **vercel** branch - a clean v2 implementation.
The **main** branch contains the original Cloudflare Workers version.

## 🆘 Support

For issues or questions:
1. Check the examples above
2. Review the API response format
3. Test with the health endpoint
4. Check deployment logs


## 🎯 Roadmap

- [ ] Add post details endpoint
- [ ] Add image proxy endpoint  
- [ ] Add decrypt endpoint
- [ ] Add rate limiting middleware
- [ ] Add Redis caching for Docker deployments
- [ ] Add more game sources

---

## ⚙️ Configuration & Environment Variables

### Environment Variables

The API supports optional environment variables for enhanced functionality:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `FLARESOLVERR_URL` | FlareSolverr instance URL for bypassing Cloudflare protection (SteamRip, SkidrowReloaded) | None | **Yes** |
| `FLARE_TIMEOUT_MS` | Timeout for FlareSolverr requests in milliseconds | `30000` (30s) | No |
| `FLARE_RETRIES` | Number of retry attempts for FlareSolverr requests | `2` | No |

**Why FlareSolverr?**  
Some sites (SteamRip, SkidrowReloaded) use Cloudflare protection. FlareSolverr bypasses this by solving challenges and providing valid cookies.

**Setting up FlareSolverr:**

You need to run your own FlareSolverr instance:

```bash
# Using Docker (recommended)
docker run -d \
  --name=flaresolverr \
  -p 8191:8191 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest

# Your FLARESOLVERR_URL will be: http://localhost:8191/v1
```

Or deploy FlareSolverr on a cloud platform (Railway, Render, etc.)

**Recommended values for production:**
- `FLARE_TIMEOUT_MS=60000` (60s) - For slower FlareSolverr instances
- `FLARE_RETRIES=3` - More retries if your FlareSolverr is flaky

### Setting Environment Variables

**For Vercel:**
```bash
# Required: Set your FlareSolverr URL
vercel env add FLARESOLVERR_URL
# Enter: http://your-flaresolverr-instance:8191/v1

# Optional: Increase timeout if needed
vercel env add FLARE_TIMEOUT_MS
# Enter: 60000

# Optional: More retries
vercel env add FLARE_RETRIES
# Enter: 3
```

Or add them in your Vercel dashboard under Settings → Environment Variables.

**For Docker:**
```bash
docker run -e FLARESOLVERR_URL="http://flaresolverr:8191/v1" \
           -e FLARE_TIMEOUT_MS=60000 \
           -e FLARE_RETRIES=3 \
           -p 3000:3000 gameapi
```

Or use a `.env` file with docker-compose (see `docker-compose.yml`).

**For Cloudflare Workers (v1 - main branch):**

In `wrangler.toml`:
```toml
[vars]
FLARESOLVERR_URL = "http://your-flaresolverr-instance:8191/v1"
FLARE_TIMEOUT_MS = "60000"
FLARE_RETRIES = "3"
```

Or using Wrangler CLI:
```bash
wrangler secret put FLARESOLVERR_URL
# Enter your FlareSolverr URL
```

**Note:** Without FlareSolverr, SteamRip and SkidrowReloaded will not work. FreeGOG and GameDrive will continue to work normally.

