# GameAPI v2 - /post Endpoint Implementation

## Overview
Implemented the missing `/post` endpoint in GameAPI v2 to allow fetching individual post details with download links by post ID.

## Changes Made

### 1. Updated `/api/index.js` ✅

**Added `/post` endpoint handler**:
```javascript
async function handlePostDetails(req, res) {
  // Accepts query parameters: id, site
  // Returns full post details with download links
}
```

**Features**:
- Validates required parameters (`id` and `site`)
- Supports all site types: `skidrow`, `freegog`, `gamedrive`, `steamrip`
- Constructs correct URLs for each site type
- Uses site-specific fetch methods (handles Cloudflare protection)
- Returns transformed post with extracted download links

### 2. Added Helper Functions to `/lib/helpers.js` ✅

**New Functions**:

#### `transformPostForV2(post, site, fetchLinks)`
- Transforms raw WordPress/API post data into standardized format
- Extracts and prioritizes images (featured images, Open Graph, content images)
- Generates unique IDs (`siteType_postId`)
- Optionally fetches download links
- Returns clean, consistent post structure

#### `extractDownloadLinksForV2(postUrl, siteType)`
- Site-specific download link extraction
- **SteamRip**: Extracts direct hosting links and torrents
- **GameDrive**: 
  - Detects extras (soundtracks, MP3s) → returns manual grab notice
  - Extracts Crypt.cybar.xyz encrypted links
  - Extracts approved file hosting links
  - Extracts torrent/magnet links
- **FreeGOG/Skidrow**: Extracts all valid hosting and torrent links
- Handles Cloudflare-protected sites with cookie support

#### `extractImageFromContent(content)`
- Extracts first image URL from HTML content

#### `extractDescription(content)`
- Strips HTML and truncates to 300 characters

#### `isValidDownloadUrl(url)`
- Validates URLs against approved hosting domains
- Supports 20+ file hosting services

### 3. Updated Imports ✅

Added `transformPostForV2` to imports in `/api/index.js`.

## API Usage

### Endpoint
```
GET /post?id={postId}&site={siteType}
```

### Parameters
- **id** (required): Post ID or slug
  - For WordPress sites (gamedrive, freegog): numeric ID
  - For other sites: post slug/path
- **site** (required): Site type
  - Valid values: `skidrow`, `freegog`, `gamedrive`, `steamrip`

### Example Requests

#### GameDrive Post
```bash
GET /post?id=12345&site=gamedrive
```

#### SteamRip Post
```bash
GET /post?id=game-name-2025&site=steamrip
```

#### Skidrow Post
```bash
GET /post?id=game-title-cracked&site=skidrow
```

### Response Format

```json
{
  "success": true,
  "post": {
    "id": "gamedrive_12345",
    "originalId": 12345,
    "title": "Game Title",
    "excerpt": "Brief description...",
    "link": "https://gamedrive.org/...",
    "date": "2025-10-18T12:00:00",
    "slug": "game-title",
    "description": "Full description...",
    "categories": [1, 2, 3],
    "tags": [10, 20, 30],
    "downloadLinks": [
      {
        "type": "hosting",
        "service": "MEGA",
        "url": "https://mega.nz/...",
        "text": "MEGA"
      },
      {
        "type": "crypt",
        "service": "Crypt",
        "url": "https://crypt.cybar.xyz/link#...",
        "text": "Encrypted Link"
      },
      {
        "type": "torrent",
        "service": "Magnet Link",
        "url": "magnet:?xt=...",
        "text": "Magnet Download"
      }
    ],
    "source": "GameDrive",
    "siteType": "gamedrive",
    "image": "https://..."
  },
  "cached": false
}
```

### Error Responses

**Missing Parameters**:
```json
{
  "success": false,
  "error": "Missing post ID parameter"
}
```

**Invalid Site**:
```json
{
  "success": false,
  "error": "Invalid site parameter. Valid options: skidrow, freegog, gamedrive, steamrip"
}
```

**Fetch Error**:
```json
{
  "success": false,
  "error": "GameDrive API returned 404: Not Found"
}
```

## Download Link Types

### Hosting Links
- Direct file hosting services (MEGA, MediaFire, 1fichier, etc.)
- `type: "hosting"`

### Encrypted Links
- Crypt.cybar.xyz protected links (GameDrive)
- `type: "crypt"`

### Torrent Links
- Magnet links and .torrent files
- `type: "torrent"`

### Manual Grab
- Posts with extras that need manual selection
- `type: "manual"`

## Integration with AIOgames

The AIOgames app uses this endpoint in:
- `/api/games/downloads/route.ts` - Fetches download links for tracked games
- `/api/games/links/route.ts` - Fetches links for search results

Example integration:
```typescript
const response = await fetch(
  `${GAMEAPI_URL}/post?id=${postId}&site=${siteType}`
);
const data = await response.json();
const links = data.post.downloadLinks;
```

## Benefits

✅ **Full Feature Parity**: v2 now matches v1 worker functionality
✅ **Download Links**: Extracts all download links from posts
✅ **Multi-Site Support**: Works with all 4 supported sites
✅ **Cloudflare Handling**: Properly handles protected sites
✅ **Rich Metadata**: Returns complete post information
✅ **Error Handling**: Clear error messages for debugging

## Testing

Test the endpoint with:
```bash
# Test GameDrive post
curl "https://your-gameapi.vercel.app/post?id=12345&site=gamedrive"

# Test SteamRip post
curl "https://your-gameapi.vercel.app/post?id=game-slug&site=steamrip"
```

## Version
- GameAPI v2 now feature-complete with `/post` endpoint
- Compatible with AIOgames v1.3.7+
