/**
 * Game Search API v2 - Core Library
 * Shared logic for Vercel and Docker deployments
 */

// Cache configuration
export const CACHE_CONFIG = {
  CACHE_TTL: 3600, // 1 hour
  STALE_WHILE_REVALIDATE: 7200, // 2 hours
  CACHE_PREFIX: 'game-search-v2:',
  RECENT_UPLOADS_KEY: 'recent-uploads-complete',
};

// FlareSolverr timeout/retry settings (ms)
export const DEFAULT_FLARE_TIMEOUT_MS = 30000; // 30s default
export const DEFAULT_FLARE_RETRIES = 2;

// Cookie storage for SteamRip and Skidrow (in-memory for this instance)
let steamripCookie = {
  cf_clearance: null,
  cookies: [], // Store all cookies from FlareSolverr
  userAgent: null, // Store the User-Agent used by FlareSolverr
  expires_at: 0
};

let skidrowCookie = {
  cf_clearance: null,
  cookies: [],
  userAgent: null,
  expires_at: 0
};

// Timeout and retry helpers
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(resource, options = {}, timeoutMs = DEFAULT_FLARE_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  options.signal = controller.signal;
  try {
    const res = await fetch(resource, options);
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function retryableFetch(resource, options = {}, attempts = DEFAULT_FLARE_RETRIES, timeoutMs = DEFAULT_FLARE_TIMEOUT_MS) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchWithTimeout(resource, options, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(500 * (i + 1));
    }
  }
  throw lastErr;
}

// Maximum posts to fetch per site
export const MAX_POSTS_PER_SITE = {
  'skidrow': 40,
  'gamedrive': 40,
  'steamrip': 40,
  'freegog': 40,
  'default': 50
};

// Site configurations
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

// Helper functions
export function stripHtml(html) {
  // Handle cases where html might be an object with a 'rendered' property
  if (typeof html === 'object' && html !== null) {
    html = html.rendered || '';
  }
  // Ensure we have a string
  if (typeof html !== 'string') {
    return '';
  }
  return html.replace(/<[^>]*>?/gm, '');
}

export function getSiteConfig(siteType) {
  return SITE_CONFIGS[siteType] || null;
}

export function extractServiceName(url) {
  try {
    let testUrl = url;
    if (url.startsWith('//')) {
      testUrl = 'https:' + url;
    }

    const parsed = new URL(testUrl);
    const host = parsed.hostname.toLowerCase();
    
    if (host.includes('gamedrive.org')) return 'GameDrive';
    if (host.includes('torrent.cybar.xyz')) return 'CybarTorrent';
    if (host.includes('freegogpcgames.com') || host.includes('gdl.freegogpcgames.xyz')) {
      return 'FreeGOG';
    }
    if (host.includes('mediafire')) return 'Mediafire';
    if (host.includes('megadb')) return 'MegaDB';
    if (host.includes('mega')) return 'MEGA';
    if (host.includes('1fichier')) return '1Fichier';
    if (host.includes('rapidgator')) return 'Rapidgator';
    if (host.includes('uploaded')) return 'Uploaded';
    if (host.includes('turbobit')) return 'Turbobit';
    if (host.includes('nitroflare')) return 'Nitroflare';
    if (host.includes('katfile')) return 'Katfile';
    if (host.includes('pixeldrain')) return 'Pixeldrain';
    if (host.includes('gofile')) return 'Gofile';
    if (host.includes('mixdrop')) return 'Mixdrop';
    if (host.includes('krakenfiles')) return 'KrakenFiles';
    if (host.includes('filefactory')) return 'FileFactory';
    if (host.includes('dailyuploads')) return 'DailyUploads';
    if (host.includes('multiup')) return 'MultiUp';
    if (host.includes('zippyshare')) return 'Zippyshare';
    if (host.includes('drive.google')) return 'Google Drive';
    if (host.includes('dropbox')) return 'Dropbox';
    if (host.includes('onedrive')) return 'OneDrive';
    if (host.includes('torrent')) return 'Torrent';
    if (host.includes('buzzheavier')) return 'BuzzHeavier';
    if (host.includes('datanodes')) return 'DataNodes';
    if (host.includes('filecrypt')) return 'FileCrypt';
    if (host.includes('hitfile')) return 'HitFile';
    if (host.includes('ufile')) return 'UFile';
    if (host.includes('clicknupload')) return 'ClicknUpload';
    
    return host;
  } catch {
    if (url.includes('megadb')) return 'MegaDB';
    if (url.includes('buzzheavier')) return 'BuzzHeavier';
    if (url.includes('datanodes')) return 'DataNodes';
    if (url.includes('filecrypt')) return 'FileCrypt';
    if (url.includes('hitfile')) return 'HitFile';
    if (url.includes('ufile')) return 'UFile';
    if (url.includes('clicknupload')) return 'ClicknUpload';
    return 'Unknown';
  }
}

export function classifyTorrentLink(url, linkText = '') {
  const cleanText = stripHtml(linkText).trim();
  
  if (url.startsWith('magnet:')) {
    return {
      type: 'magnet',
      service: 'Magnet Link',
      url: url,
      isTorrent: true
    };
  }
  
  if (url.toLowerCase().endsWith('.torrent') || url.includes('/torrent/') || url.includes('torrent.')) {
    return {
      type: 'torrent-file',
      service: extractServiceName(url),
      url: url,
      isTorrent: true
    };
  }
  
  
  return null;
}

// FlareSolverr cookie management for SteamRip
export async function getFreshSteamripCookie() {
  console.log('Getting fresh cf_clearance cookie for SteamRip');

  try {
    const flaresolverrUrl = process.env.FLARESOLVERR_URL;
    if (!flaresolverrUrl) {
      throw new Error('FLARESOLVERR_URL environment variable is required for SteamRip. Please set it to your FlareSolverr instance URL (e.g., http://localhost:8191/v1)');
    }
    
    const attempts = parseInt(process.env.FLARE_RETRIES || DEFAULT_FLARE_RETRIES, 10) || DEFAULT_FLARE_RETRIES;
    const timeoutMs = parseInt(process.env.FLARE_TIMEOUT_MS || DEFAULT_FLARE_TIMEOUT_MS, 10) || DEFAULT_FLARE_TIMEOUT_MS;

    const response = await retryableFetch(flaresolverrUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cmd: 'request.get',
        url: 'https://steamrip.com/wp-json/wp/v2/posts',
        userAgent: 'GameSearch-API-v2/2.0'
      })
    }, attempts, timeoutMs);

    if (!response.ok) {
      throw new Error(`FlareSolverr request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'ok') {
      throw new Error(`FlareSolverr error: ${data.message}`);
    }

    // Extract cf_clearance cookie and all cookies
    let cf_clearance = null;
    let expires_at = Date.now() + (4 * 60 * 60 * 1000); // Default 4 hours from now
    const allCookies = [];

    if (data.solution.cookies && Array.isArray(data.solution.cookies)) {
      // Store all cookies
      data.solution.cookies.forEach(cookie => {
        allCookies.push(`${cookie.name}=${cookie.value}`);
        if (cookie.name === 'cf_clearance') {
          cf_clearance = cookie.value;
          if (cookie.expires) {
            expires_at = new Date(cookie.expires * 1000).getTime();
          }
        }
      });

      if (cf_clearance) {
        console.log('Successfully obtained cf_clearance cookie:', cf_clearance.substring(0, 20) + '...');
        console.log(`Total cookies from FlareSolverr: ${allCookies.length}`);
      }
    }

    if (!cf_clearance) {
      throw new Error('Failed to extract cf_clearance cookie from FlareSolverr response');
    }

    // Store the User-Agent that FlareSolverr used
    const userAgent = data.solution.userAgent || 'GameSearch-API-v2/2.0';

    steamripCookie = {
      cf_clearance: cf_clearance,
      cookies: allCookies,
      userAgent: userAgent,
      expires_at: expires_at
    };

    return steamripCookie;
  } catch (error) {
    console.error('Error getting fresh SteamRip cookie:', error);
    throw error;
  }
}

export async function getValidSteamripCookie() {
  if (!steamripCookie.cf_clearance || Date.now() >= steamripCookie.expires_at) {
    return await getFreshSteamripCookie();
  }
  return steamripCookie;
}

export async function fetchSteamrip(url, isPageRequest = false) {
  try {
    // First, try to get a valid cookie from FlareSolverr
    const cookie = await getValidSteamripCookie();
    
    // Use the same User-Agent that FlareSolverr used to get the cookie
    const userAgent = cookie.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    // Use all cookies, not just cf_clearance
    const cookieString = cookie.cookies.join('; ');

    console.log(`Fetching SteamRip with cookies: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Cookie': cookieString,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://steamrip.com/',
        'Origin': 'https://steamrip.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      }
    });

    if (response.status === 403) {
      console.log('Received 403, cookie might be expired, getting a fresh one');
      const freshCookie = await getFreshSteamripCookie();
      const freshUserAgent = freshCookie.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
      const freshCookieString = freshCookie.cookies.join('; ');

      const retryResponse = await fetch(url, {
        headers: {
          'User-Agent': freshUserAgent,
          'Cookie': freshCookieString,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://steamrip.com/',
          'Origin': 'https://steamrip.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin'
        }
      });

      if (!retryResponse.ok) {
        if (isPageRequest) {
          console.warn(`Failed to fetch SteamRip page: ${retryResponse.status} ${retryResponse.statusText} (even with fresh cookie)`);
          return null;
        } else {
          throw new Error(`SteamRip API returned ${retryResponse.status}: ${retryResponse.statusText} (even with fresh cookie)`);
        }
      }

      return retryResponse;
    }

    if (!response.ok) {
      if (isPageRequest) {
        console.warn(`Failed to fetch SteamRip page: ${response.status} ${response.statusText}`);
        return null;
      } else {
        throw new Error(`SteamRip API returned ${response.status}: ${response.statusText}`);
      }
    }

    return response;
  } catch (error) {
    console.error(`Error fetching SteamRip:`, error);
    if (isPageRequest) {
      return null;
    } else {
      throw error;
    }
  }
}

// FlareSolverr cookie management for SkidrowReloaded
export async function getFreshSkidrowCookie() {
  console.log('Getting fresh cf_clearance cookie for SkidrowReloaded');

  try {
    const flaresolverrUrl = process.env.FLARESOLVERR_URL;
    if (!flaresolverrUrl) {
      throw new Error('FLARESOLVERR_URL environment variable is required for SkidrowReloaded. Please set it to your FlareSolverr instance URL (e.g., http://localhost:8191/v1)');
    }
    
    const attempts = parseInt(process.env.FLARE_RETRIES || DEFAULT_FLARE_RETRIES, 10) || DEFAULT_FLARE_RETRIES;
    const timeoutMs = parseInt(process.env.FLARE_TIMEOUT_MS || DEFAULT_FLARE_TIMEOUT_MS, 10) || DEFAULT_FLARE_TIMEOUT_MS;

    const response = await retryableFetch(flaresolverrUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cmd: 'request.get',
        url: 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts',
        userAgent: 'GameSearch-API-v2/2.0'
      })
    }, attempts, timeoutMs);

    if (!response.ok) {
      throw new Error(`FlareSolverr request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'ok') {
      throw new Error(`FlareSolverr error: ${data.message}`);
    }

    let cf_clearance = null;
    let expires_at = Date.now() + (4 * 60 * 60 * 1000);
    const allCookies = [];

    if (data.solution.cookies && Array.isArray(data.solution.cookies)) {
      data.solution.cookies.forEach(cookie => {
        allCookies.push(`${cookie.name}=${cookie.value}`);
        if (cookie.name === 'cf_clearance') {
          cf_clearance = cookie.value;
          if (cookie.expires) {
            expires_at = new Date(cfCookie.expires * 1000).getTime();
          }
        }
      });

      if (cf_clearance) {
        console.log('Successfully obtained cf_clearance cookie for SkidrowReloaded:', cf_clearance.substring(0, 20) + '...');
        console.log(`Total cookies from FlareSolverr: ${allCookies.length}`);
      }
    }

    if (!cf_clearance) {
      throw new Error('Failed to extract cf_clearance cookie from FlareSolverr response for SkidrowReloaded');
    }

    const userAgent = data.solution.userAgent || 'GameSearch-API-v2/2.0';

    skidrowCookie = {
      cf_clearance: cf_clearance,
      cookies: allCookies,
      userAgent: userAgent,
      expires_at: expires_at
    };

    return skidrowCookie;
  } catch (error) {
    console.error('Error getting fresh SkidrowReloaded cookie:', error);
    throw error;
  }
}

export async function getValidSkidrowCookie() {
  if (!skidrowCookie.cf_clearance || Date.now() >= skidrowCookie.expires_at) {
    return await getFreshSkidrowCookie();
  }
  return skidrowCookie;
}

export async function fetchSkidrow(url, isPageRequest = false) {
  try {
    const userAgent = isPageRequest ? 'GameSearch-API-v2-PageFetch/2.0' : 'GameSearch-API-v2/2.0';

    // Try direct fetch first
    let response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (response.ok) {
      return response;
    }

    // Check for Cloudflare protection
    const cloudflareStatus = [403, 503];
    let isCloudflare = cloudflareStatus.includes(response.status);

    if (!isCloudflare && response.headers.get('content-type')?.includes('text/html')) {
      const text = await response.text();
      if (text.includes('cf-browser-verification') || text.includes('Cloudflare') || text.includes('Attention Required')) {
        isCloudflare = true;
      }
    }

    if (isCloudflare) {
      const cookie = await getValidSkidrowCookie();
      const cookieUserAgent = cookie.userAgent || userAgent;
      const cookieString = cookie.cookies.join('; ');
      
      response = await fetch(url, {
        headers: {
          'User-Agent': cookieUserAgent,
          'Cookie': cookieString,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.skidrowreloaded.com/',
          'Origin': 'https://www.skidrowreloaded.com'
        }
      });

      if (response.status === 403) {
        console.log('Received 403 from SkidrowReloaded, cookie might be expired, getting a fresh one');
        const freshCookie = await getFreshSkidrowCookie();
        const freshUserAgent = freshCookie.userAgent || userAgent;
        const freshCookieString = freshCookie.cookies.join('; ');
        
        const retryResponse = await fetch(url, {
          headers: {
            'User-Agent': freshUserAgent,
            'Cookie': freshCookieString,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.skidrowreloaded.com/',
            'Origin': 'https://www.skidrowreloaded.com'
          }
        });

        if (!retryResponse.ok) {
          if (isPageRequest) {
            console.warn(`Failed to fetch SkidrowReloaded page: ${retryResponse.status} ${retryResponse.statusText} (even with fresh cookie)`);
            return null;
          } else {
            throw new Error(`SkidrowReloaded API returned ${retryResponse.status}: ${retryResponse.statusText} (even with fresh cookie)`);
          }
        }
        return retryResponse;
      }

      if (!response.ok) {
        if (isPageRequest) {
          console.warn(`Failed to fetch SkidrowReloaded page: ${response.status} ${response.statusText}`);
          return null;
        } else {
          throw new Error(`SkidrowReloaded API returned ${response.status}: ${response.statusText}`);
        }
      }
      return response;
    } else {
      if (isPageRequest) {
        console.warn(`Failed to fetch SkidrowReloaded page: ${response.status} ${response.statusText}`);
        return null;
      } else {
        throw new Error(`SkidrowReloaded API returned ${response.status}: ${response.statusText}`);
      }
    }
  } catch (error) {
    console.error(`Error fetching SkidrowReloaded:`, error);
    if (isPageRequest) {
      return null;
    } else {
      throw error;
    }
  }
}

// Post transformation for v2
export async function transformPostForV2(post, site, fetchLinks = false) {
  const downloadLinks = fetchLinks ? await extractDownloadLinksForV2(post.link, site.type) : [];
  
  // Enhanced image extraction
  let image = null;
  if (site.type === 'gamedrive') {
    image = post.featured_image_src || post.jetpack_featured_media_url;
  } else if (site.type === 'steamrip') {
    if (post.yoast_head_json?.og_image && post.yoast_head_json.og_image.length > 0) {
      image = post.yoast_head_json.og_image[0].url;
    }
  }
  
  // Fallback to content/excerpt image extraction
  if (!image) {
    image = extractImageFromContent(post.content?.rendered) || extractImageFromContent(post.excerpt?.rendered);
  }

  return {
    id: `${site.type}_${post.id}`,
    originalId: post.id,
    title: post.title?.rendered || 'No title',
    excerpt: stripHtml(post.excerpt?.rendered || ''),
    link: post.link,
    date: post.date,
    slug: post.slug,
    description: extractDescription(post.content?.rendered),
    categories: post.categories,
    tags: post.tags,
    downloadLinks,
    source: site.name,
    siteType: site.type,
    image
  };
}

// Extract download links for v2
export async function extractDownloadLinksForV2(postUrl, siteType = 'skidrow') {
  try {
    let html;
    const downloadLinks = [];

    if (siteType === 'steamrip') {
      const response = await fetchSteamrip(postUrl, true);
      if (!response) {
        console.warn(`Failed to fetch post content from ${postUrl}`);
        return [];
      }
      html = await response.text();

      // Extract all href links from SteamRip
      const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
      let match;

      while ((match = hrefRegex.exec(html)) !== null) {
        let url = match[1].trim();
        const linkText = stripHtml(match[2]).trim();

        // Normalize protocol-relative URLs
        if (url.startsWith('//')) {
          url = 'https:' + url;
        }

        // Skip if this URL is already in our list
        if (downloadLinks.some(l => l.url === url)) continue;

        // Check if this is a valid download URL
        if (isValidDownloadUrl(url)) {
          const service = extractServiceName(url);
          downloadLinks.push({
            type: 'hosting',
            service: service,
            url: url,
            text: service
          });
        }

        // Check for torrent links
        if (url.startsWith('magnet:') || url.includes('.torrent')) {
          const torrentData = classifyTorrentLink(url, linkText);
          if (torrentData && !downloadLinks.some(l => l.url === url)) {
            downloadLinks.push(torrentData);
          }
        }
      }
    } else {
      // Handle other site types
      let response;
      if (siteType === 'skidrow') {
        response = await fetchSkidrow(postUrl, true);
      } else {
        response = await fetch(postUrl, {
          headers: {
            'User-Agent': 'Game-Search-API-v2-Link-Extractor/2.0'
          }
        });
      }

      if (!response || !response.ok) {
        console.warn(`Failed to fetch post content from ${postUrl}`);
        return [];
      }

      html = await response.text();

      // GameDrive specific handling
      if (siteType === 'gamedrive') {
        // Check for extras
        const extrasRegex = /\b(soundtrack|mp3)\b/i;
        if (extrasRegex.test(html)) {
          return [{
            type: 'manual',
            service: 'Manual Grab',
            url: postUrl,
            text: 'Post contains extras, grab manually'
          }];
        }

        // Extract crypt links
        const cryptRegex = /https?:\/\/crypt\.cybar\.xyz\/(?:link)?\#?([A-Za-z0-9_\-\+\/=]+)/gi;
        let match;
        while ((match = cryptRegex.exec(html)) !== null) {
          const cryptId = match[1];
          const cryptUrl = `https://crypt.cybar.xyz/link#${cryptId}`;
          if (!downloadLinks.some(l => l.url === cryptUrl)) {
            downloadLinks.push({
              type: 'crypt',
              service: 'Crypt',
              url: cryptUrl,
              text: 'Encrypted Link'
            });
          }
        }

        // Extract approved hosters
        const approvedHosters = [
          'mediafire.com', 'mega.nz', '1fichier.com', 'rapidgator.net',
          'uploaded.net', 'turbobit.net', 'nitroflare.com', 'katfile.com',
          'pixeldrain.com', 'gofile.io', 'mixdrop.to', 'krakenfiles.com',
          'filefactory.com', 'dailyuploads.net', 'multiup.io', 'drive.google.com',
          'dropbox.com', 'onedrive.live.com', 'hitfile.net', 'ufile.io',
          'clicknupload.site', '1337x.to'
        ];
        const hosterRegex = new RegExp(`<a[^>]+href=["'](https?://[^"']*(?:${approvedHosters.join('|')})[^"']*)["']`, 'gi');
        while ((match = hosterRegex.exec(html)) !== null) {
          const url = match[1];
          const service = extractServiceName(url);
          if (!downloadLinks.some(l => l.url === url)) {
            downloadLinks.push({
              type: 'hosting',
              service: service,
              url: url,
              text: service
            });
          }
        }

        // Extract torrent links
        const torrentRegex = /<a[^>]+href=["'](magnet:[^"']*?)["'][^>]*>([^<]*)<\/a>|<a[^>]+href=["'](https?:\/\/[^"']*\.torrent[^"']*?)["'][^>]*>([^<]*)<\/a>/gi;
        while ((match = torrentRegex.exec(html)) !== null) {
          const url = match[1] || match[3];
          const linkText = stripHtml(match[2] || match[4]).trim();
          if (url && !downloadLinks.some(l => l.url === url)) {
            const torrentData = classifyTorrentLink(url, linkText);
            if (torrentData) {
              downloadLinks.push(torrentData);
            }
          }
        }
      } else if (siteType === 'freegog' || siteType === 'skidrow') {
        // Extract links for FreeGOG and Skidrow
        const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
        let match;
        while ((match = hrefRegex.exec(html)) !== null) {
          let url = match[1].trim();
          const linkText = stripHtml(match[2]).trim();

          if (url.startsWith('//')) {
            url = 'https:' + url;
          }

          if (downloadLinks.some(l => l.url === url)) continue;

          if (isValidDownloadUrl(url)) {
            const service = extractServiceName(url);
            downloadLinks.push({
              type: 'hosting',
              service: service,
              url: url,
              text: service
            });
          }

          if (url.startsWith('magnet:') || url.includes('.torrent')) {
            const torrentData = classifyTorrentLink(url, linkText);
            if (torrentData && !downloadLinks.some(l => l.url === url)) {
              downloadLinks.push(torrentData);
            }
          }
        }
      }
    }

    return downloadLinks;
  } catch (error) {
    console.error(`Error extracting download links from ${postUrl}:`, error);
    return [];
  }
}

function extractImageFromContent(content) {
  if (!content) return null;
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/i;
  const match = imgRegex.exec(content);
  return match ? match[1] : null;
}

function extractDescription(content) {
  if (!content) return '';
  const stripped = stripHtml(content);
  return stripped.length > 300 ? stripped.substring(0, 300) + '...' : stripped;
}

function isValidDownloadUrl(url) {
  const validDomains = [
    'mega.nz', 'mediafire.com', '1fichier.com', 'rapidgator.net',
    'uploaded.net', 'turbobit.net', 'nitroflare.com', 'katfile.com',
    'pixeldrain.com', 'gofile.io', 'mixdrop.to', 'krakenfiles.com',
    'filefactory.com', 'dailyuploads.net', 'multiup.io', 'drive.google.com',
    'dropbox.com', 'onedrive.live.com', 'hitfile.net', 'ufile.io',
    'clicknupload.site', '1337x.to', 'uploadhaven.com'
  ];
  
  try {
    const urlObj = new URL(url);
    return validDomains.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

export function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const urlObj = new URL(url);
    
    // Block known invalid patterns
    const invalidPatterns = [
      /wordpress\.com\/s2\/images\/smile\//,  // Emoji images
      /gravatar\.com/,                          // Gravatar avatars
      /s\.w\.org\/images\/core\/emoji\//,      // WordPress emoji
      /tracking/i,                              // Tracking pixels
      /beacon/i,                                // Analytics beacons
      /pixel/i                                  // Tracking pixels
    ];
    
    // Check if URL matches any invalid pattern
    if (invalidPatterns.some(pattern => pattern.test(url))) {
      return false;
    }
    
    // Check for common image extensions or image-like URLs
    const path = urlObj.pathname.toLowerCase();
    const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)(\?.*)?$/i.test(path);
    const isImagePath = path.includes('image') || path.includes('photo') || path.includes('picture');
    const isUploadPath = path.includes('upload') || path.includes('wp-content') || path.includes('media');
    
    // Allow if it has image extension or looks like an image URL
    return hasImageExtension || isImagePath || isUploadPath;
    
  } catch {
    return false;
  }
}
