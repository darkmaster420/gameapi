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
    const flaresolverrUrl = process.env.FLARESOLVERR_URL || 'https://flare.iforgor.cc/v1';
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
  console.log(`Fetching SteamRip via FlareSolverr: ${url}`);
  
  try {
    const flaresolverrUrl = process.env.FLARESOLVERR_URL || 'https://flare.iforgor.cc/v1';
    const attempts = parseInt(process.env.FLARE_RETRIES || DEFAULT_FLARE_RETRIES, 10) || DEFAULT_FLARE_RETRIES;
    const timeoutMs = parseInt(process.env.FLARE_TIMEOUT_MS || DEFAULT_FLARE_TIMEOUT_MS, 10) || DEFAULT_FLARE_TIMEOUT_MS;

    // Use FlareSolverr to make the actual request (not just get cookies)
    const response = await retryableFetch(flaresolverrUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cmd: 'request.get',
        url: url,
        maxTimeout: 60000 // Give FlareSolverr 60s to solve the challenge
      })
    }, attempts, timeoutMs);

    if (!response.ok) {
      throw new Error(`FlareSolverr request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'ok') {
      if (isPageRequest) {
        console.warn(`FlareSolverr error for SteamRip page: ${data.message}`);
        return null;
      } else {
        throw new Error(`FlareSolverr error: ${data.message}`);
      }
    }

    // FlareSolverr returns the response in data.solution.response
    // We need to convert it back to a Response-like object
    const responseText = data.solution.response;
    
    // Create a mock Response object that matches fetch() API
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-type': 'application/json'
      }),
      json: async () => JSON.parse(responseText),
      text: async () => responseText
    };

  } catch (error) {
    console.error(`Error fetching SteamRip via FlareSolverr:`, error);
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
    const flaresolverrUrl = process.env.FLARESOLVERR_URL || 'https://flare.iforgor.cc/v1';
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
