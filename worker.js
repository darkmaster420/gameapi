export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    // Handle cache clearing endpoint
    if (url.pathname === '/clearcache') {
      return await handleClearCache(corsHeaders);
    }

    // Handle image proxy endpoint
    if (url.pathname === '/proxy-image') {
      return await handleImageProxy(request, corsHeaders);
    }

    // Handle recent uploads endpoint
    if (url.pathname === '/recent') {
      return await handleRecentUploadsComplete(request, corsHeaders, ctx);
    }

    // Handle search endpoint
    return await handleSearchComplete(request, corsHeaders, ctx);
  }
};

// Cache configuration
const CACHE_CONFIG = {
  CACHE_TTL: 3600, // 1 hour
  STALE_WHILE_REVALIDATE: 7200, // 2 hours
  CACHE_PREFIX: 'game-search-v2:',
  RECENT_UPLOADS_KEY: 'recent-uploads-complete',
};

// Maximum posts to fetch per site to prevent timeouts
const MAX_POSTS_PER_SITE = 10;

async function handleClearCache(corsHeaders) {
  const cache = caches.default;
  const recentCacheKey = `${CACHE_CONFIG.CACHE_PREFIX}${CACHE_CONFIG.RECENT_UPLOADS_KEY}`;

  try {
    const cacheRequest = new Request(`https://cache.internal/${recentCacheKey}`);
    const deleted = await cache.delete(cacheRequest);

    if (deleted) {
      return new Response(JSON.stringify({
        success: true,
        message: `Successfully cleared cache for recent uploads.`,
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } else {
      return new Response(JSON.stringify({
        success: true,
        message: 'No cache entry found for recent uploads to clear.',
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

  } catch (error) {
    console.error('Error clearing cache:', error);
    return new Response(JSON.stringify({
      success: false,
      error: `Failed to clear cache: ${error.message}`
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}

async function handleRecentUploadsComplete(request, corsHeaders, ctx) {
  const cacheKey = `${CACHE_CONFIG.CACHE_PREFIX}${CACHE_CONFIG.RECENT_UPLOADS_KEY}`;

  try {
    const cache = caches.default;
    const cacheRequest = new Request(`https://cache.internal/${cacheKey}`);
    let cachedResponse = await cache.match(cacheRequest);

    if (cachedResponse) {
      const cacheDate = cachedResponse.headers.get('x-cache-date');
      const cacheAge = Date.now() - parseInt(cacheDate);

      if (cacheAge < CACHE_CONFIG.CACHE_TTL * 1000) {
        const freshData = await cachedResponse.json();
        freshData.cached = true;
        return new Response(JSON.stringify(freshData), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-Cache-Status': 'HIT'
          }
        });
      }

      ctx.waitUntil(revalidateRecentUploadsComplete(cacheKey));
      const staleData = await cachedResponse.json();
      staleData.cached = true;
      staleData.stale = true;
      return new Response(JSON.stringify(staleData), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Cache-Status': 'STALE-WHILE-REVALIDATE'
        }
      });
    }

    const freshData = await fetchAllRecentUploads();

    const cacheResponse = new Response(JSON.stringify(freshData), {
      headers: {
        'Content-Type': 'application/json',
        'x-cache-date': Date.now().toString(),
        'Cache-Control': `max-age=${CACHE_CONFIG.STALE_WHILE_REVALIDATE}`
      }
    });

    ctx.waitUntil(cache.put(cacheRequest, cacheResponse.clone()));

    return new Response(JSON.stringify(freshData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Cache-Status': 'MISS'
      }
    });

  } catch (error) {
    console.error('Error in recent uploads:', error);
    return handleError('recent uploads', error, corsHeaders, cacheKey);
  }
}

async function handleSearchComplete(request, corsHeaders, ctx) {
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get('search');
  const siteParam = url.searchParams.get('site') || 'both';

  if (!searchQuery?.trim()) {
    return new Response(JSON.stringify({ error: 'Search query required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const cacheKey = `${CACHE_CONFIG.CACHE_PREFIX}search:${encodeURIComponent(searchQuery)}:${siteParam}`;

  try {
    const cache = caches.default;
    const cacheRequest = new Request(`https://cache.internal/${cacheKey}`);
    let cachedResponse = await cache.match(cacheRequest);

    if (cachedResponse) {
      const cacheDate = cachedResponse.headers.get('x-cache-date');
      const cacheAge = Date.now() - parseInt(cacheDate);
      if (cacheAge < CACHE_CONFIG.CACHE_TTL * 1000) {
        const freshData = await cachedResponse.json();
        freshData.cached = true;
        return new Response(JSON.stringify(freshData), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-Cache-Status': 'HIT'
          }
        });
      }
    }

    const freshData = await fetchAllSearchResults(searchQuery, siteParam);

    const cacheResponse = new Response(JSON.stringify(freshData), {
      headers: {
        'Content-Type': 'application/json',
        'x-cache-date': Date.now().toString(),
        'Cache-Control': `max-age=${CACHE_CONFIG.STALE_WHILE_REVALIDATE}`
      }
    });

    ctx.waitUntil(cache.put(cacheRequest, cacheResponse.clone()));

    return new Response(JSON.stringify(freshData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Cache-Status': 'MISS'
      }
    });

  } catch (error) {
    console.error('Error in search:', error);
    return handleError('search', error, corsHeaders, cacheKey);
  }
}

async function fetchAllRecentUploads() {
  const sites = [
    {
      baseUrl: 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts',
      type: 'skidrow',
      name: 'SkidrowReloaded'
    },
    {
      baseUrl: 'https://freegogpcgames.com/wp-json/wp/v2/posts',
      type: 'freegog',
      name: 'FreeGOGPCGames'
    }
  ];

  const sitePromises = sites.map(site => fetchRecentUploadsFromSite(site));
  const siteResults = await Promise.all(sitePromises);

  const allPosts = [];
  const siteStats = {};
  const errors = {};

  siteResults.forEach(result => {
    if (result && result.posts) {
      siteStats[result.site] = result.posts.length;
      if (result.error) {
        errors[result.site] = result.error;
      }
      allPosts.push(...result.posts);
    }
  });

  const validPosts = allPosts.filter(post => post && post.date);

  validPosts.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);

    if (isNaN(dateA.getTime())) {
      return 1;
    }
    if (isNaN(dateB.getTime())) {
      return -1;
    }
    return dateB.getTime() - dateA.getTime();
  });

  return {
    success: true,
    type: 'recent_uploads',
    totalResults: validPosts.length,
    siteStats,
    results: validPosts,
    ...(Object.keys(errors).length > 0 && { errors }),
    fetchStrategy: 'recent',
    cached: false
  };
}

async function fetchAllSearchResults(searchQuery, siteParam) {
  const sites = [];
  if (siteParam === 'both' || siteParam === 'all' || !siteParam) {
    sites.push(
      { baseUrl: 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts', type: 'skidrow', name: 'SkidrowReloaded' },
      { baseUrl: 'https://freegogpcgames.com/wp-json/wp/v2/posts', type: 'freegog', name: 'FreeGOGPCGames' }
    );
  } else if (siteParam === 'skidrow') {
    sites.push({ baseUrl: 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts', type: 'skidrow', name: 'SkidrowReloaded' });
  } else if (siteParam === 'freegog') {
    sites.push({ baseUrl: 'https://freegogpcgames.com/wp-json/wp/v2/posts', type: 'freegog', name: 'FreeGOGPCGames' });
  }

  const sitePromises = sites.map(site => fetchPostsWithSearch(site, searchQuery));
  const siteResults = await Promise.all(sitePromises);

  const allPosts = [];
  const siteStats = {};
  const errors = {};
  siteResults.forEach(result => {
    if (result && result.posts) {
      siteStats[result.site] = result.posts.length;
      if (result.error) {
        errors[result.site] = result.error;
      }
      allPosts.push(...result.posts);
    }
  });

  const validPosts = allPosts.filter(post => post && post.date);

  validPosts.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);

    if (isNaN(dateA.getTime())) {
      return 1;
    }
    if (isNaN(dateB.getTime())) {
      return -1;
    }
    return dateB.getTime() - dateA.getTime();
  });

  return {
    success: true,
    query: searchQuery,
    sitesSearched: sites.map(s => s.name),
    totalResults: validPosts.length,
    siteStats,
    results: validPosts,
    ...(Object.keys(errors).length > 0 && { errors }),
    fetchStrategy: 'search',
    cached: false
  };
}

async function fetchRecentUploadsFromSite(site) {
  try {
    const params = new URLSearchParams({
      per_page: MAX_POSTS_PER_SITE.toString(),
      page: '1',
      orderby: 'date',
      order: 'desc'
    });

    const url = `${site.baseUrl}?${params}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Cloudflare-Workers-Search-API/2.0'
      }
    });

    if (!response.ok) {
      throw new Error(`${site.name} API returned ${response.status}: ${response.statusText}`);
    }

    const posts = await response.json();
    const transformedPosts = await Promise.all(
      posts.map(async (post) => transformPost(post, site, false))
    );

    return { site: site.name, posts: transformedPosts, error: null };
  } catch (error) {
    console.error(`Error fetching recent uploads from ${site.name}:`, error);
    return { site: site.name, posts: [], error: error.message };
  }
}

async function fetchPostsWithSearch(site, searchQuery) {
  try {
    const params = new URLSearchParams({
      search: searchQuery,
      per_page: MAX_POSTS_PER_SITE.toString(),
      orderby: 'date',
      order: 'desc'
    });

    const url = `${site.baseUrl}?${params}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Cloudflare-Workers-Search-API/2.0'
      }
    });

    if (!response.ok) {
      throw new Error(`${site.name} API returned ${response.status}: ${response.statusText}`);
    }

    // The API's search is reliable, so we directly use its results.
    const posts = await response.json();
    
    // The problematic, redundant filtering block has been removed from here.
    
    const transformedPosts = await Promise.all(
      posts.map(async (post) => transformPost(post, site, true))
    );

    return { site: site.name, posts: transformedPosts, error: null };
  } catch (error) {
    console.error(`Error fetching search results from ${site.name}:`, error);
    return { site: site.name, posts: [], error: error.message };
  }
}

async function transformPost(post, site, fetchLinks = false) {
  const downloadLinks = fetchLinks ? await extractDownloadLinks(post.link, site.type) : [];
  const image = extractImageFromContent(post.content?.rendered) || extractImageFromContent(post.excerpt?.rendered);

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

// Background revalidation functions
async function revalidateRecentUploadsComplete(cacheKey) {
  const cache = caches.default;
  const freshData = await fetchAllRecentUploads();
  const cacheResponse = new Response(JSON.stringify(freshData), {
    headers: {
      'Content-Type': 'application/json',
      'x-cache-date': Date.now().toString(),
      'Cache-Control': `max-age=${CACHE_CONFIG.STALE_WHILE_REVALIDATE}`
    }
  });
  await cache.put(new Request(`https://cache.internal/${cacheKey}`), cacheResponse);
}

async function revalidateSearchComplete(cacheKey, searchQuery, siteParam) {
  const cache = caches.default;
  const freshData = await fetchAllSearchResults(searchQuery, siteParam);
  const cacheResponse = new Response(JSON.stringify(freshData), {
    headers: {
      'Content-Type': 'application/json',
      'x-cache-date': Date.now().toString(),
      'Cache-Control': `max-age=${CACHE_CONFIG.STALE_WHILE_REVALIDATE}`
    }
  });
  await cache.put(new Request(`https://cache.internal/${cacheKey}`), cacheResponse);
}

async function handleError(operation, error, corsHeaders, cacheKey) {
  let fallbackData = null;
  const cache = caches.default;
  const cacheRequest = new Request(`https://cache.internal/${cacheKey}`);
  try {
    const cachedResponse = await cache.match(cacheRequest);
    if (cachedResponse) {
      fallbackData = await cachedResponse.json();
      fallbackData.cached = true;
      fallbackData.stale = true;
      fallbackData.error = `Fresh data fetch failed: ${error.message}. Returning stale data.`;
      console.warn('Returning stale data due to fetch error.');
      return new Response(JSON.stringify(fallbackData), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Cache-Status': 'STALE-FALLBACK'
        }
      });
    }
  } catch (cacheError) {
    console.error('Failed to access cache for fallback:', cacheError);
  }

  const errorMessage = `Failed to fetch ${operation} from all sources. Reason: ${error.message}`;
  return new Response(JSON.stringify({
    success: false,
    error: errorMessage,
    ...(fallbackData && { results: fallbackData.results, cached: true })
  }), {
    status: fallbackData ? 200 : 500,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

// Image proxy handler
async function handleImageProxy(request, corsHeaders) {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl || !isValidImageUrl(imageUrl)) {
    return new Response('Invalid image URL', { status: 400 });
  }

  const cacheKey = new Request(imageUrl, request);
  const cache = caches.default;
  let response = await cache.match(cacheKey);

  if (!response) {
    try {
      response = await fetch(imageUrl, {
        headers: {
          'Referer': 'https://www.skidrowreloaded.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        return new Response(`Failed to fetch image: ${response.status} ${response.statusText}`, { status: response.status });
      }

      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'public, max-age=604800'); // Cache images for a week

      response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
      });

      caches.default.put(cacheKey, response.clone());

    } catch (err) {
      return new Response(`Error fetching image: ${err.message}`, { status: 500 });
    }
  }

  return response;
}

// Helper functions
function extractImageFromContent(htmlContent) {
  if (!htmlContent) return null;
  const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/i);
  if (imgMatch) {
    const imageUrl = imgMatch[1].trim();
    if (isValidImageUrl(imageUrl)) {
      return imageUrl;
    }
  }
  return null;
}

function isValidImageUrl(url) {
  const invalidPatterns = [
    /wordpress\.com\/s2\/images\/smile\//,
    /gravatar\.com/,
    /s\.w\.org\/images\/core\/emoji\//
  ];
  return !invalidPatterns.some(pattern => pattern.test(url));
}

async function extractDownloadLinks(postUrl, siteType = 'skidrow') {
  try {
    const response = await fetch(postUrl, {
      headers: {
        'User-Agent': 'Cloudflare-Workers-Link-Extractor/2.0'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch post content from ${postUrl}`);
      return [];
    }

    const html = await response.text();
    const downloadLinks = [];

    if (siteType === 'skidrow') {
      // Handle codecolorer blocks with filenames
      const codeColorerRegex = /<div class="codecolorer-container[^>]*>[\s\S]*?<div class="text codecolorer">(.*?)<\/div>[\s\S]*?<\/div>/gi;
      let codeMatch;
      while ((codeMatch = codeColorerRegex.exec(html)) !== null) {
        const filename = codeMatch[1].trim();
        if (filename && !filename.includes('Uploading') && filename.length > 3) {
          const beforeCode = html.substring(0, codeMatch.index);
          const linkMatch = beforeCode.match(/<a[^>]+href=["'](.*?)["'][^>]*>[\s\S]*?$/);
          if (linkMatch && linkMatch[1]) {
            const url = linkMatch[1];
            const service = extractServiceName(url);
            if (!downloadLinks.some(link => link.url === url)) {
              downloadLinks.push({
                type: 'hosting',
                service,
                url,
                filename,
                text: `${service} - ${filename}`
              });
            }
          }
        }
      }
    } else if (siteType === 'freegog') {
      // FreeGOG patterns
      const downloadRegex = /<a[^>]*href=["'](https?:\/\/[^"']*(?:mediafire|mega|1fichier|rapidgator|uploaded|turbobit|nitroflare|katfile|pixeldrain|gofile|mixdrop|krakenfiles|filefactory|dailyuploads|multiup|drive\.google|dropbox|onedrive|torrents?)[^"']*?)["'][^>]*>([^<]*)<\/a>/gi;
      let m;
      while ((m = downloadRegex.exec(html)) !== null) {
        const url = m[1];
        const linkText = stripHtml(m[2]).trim();
        const service = extractServiceName(url);
        if (isValidDownloadUrl(url) && !downloadLinks.some(l => l.url === url)) {
          downloadLinks.push({ type: 'hosting', service, url, text: linkText || service });
        }
      }

      const fileRegex = /<a[^>]*href=["'](https?:\/\/[^"']*\.(?:exe|zip|rar|7z|iso|bin|cue|mdf|mds)[^"']*?)["'][^>]*>([^<]*)<\/a>/gi;
      while ((m = fileRegex.exec(html)) !== null) {
        const url = m[1];
        const linkText = stripHtml(m[2]).trim();
        if (isValidDownloadUrl(url) && !downloadLinks.some(l => l.url === url)) {
          downloadLinks.push({ type: 'direct', service: 'Direct Download', url, text: linkText || 'Direct Download' });
        }
      }

      const torrentRegex = /<a[^>]*href=["'](magnet:[^"']*?)["'][^>]*>([^<]*)<\/a>|<a[^>]*href=["'](https?:\/\/[^"']*\.torrent[^"']*?)["'][^>]*>([^<]*)<\/a>/gi;
      while ((m = torrentRegex.exec(html)) !== null) {
        const url = m[1] || m[3];
        const linkText = stripHtml(m[2] || m[4]).trim();
        if (url && !downloadLinks.some(l => l.url === url)) {
          downloadLinks.push({ type: 'torrent', service: url.startsWith('magnet:') ? 'Magnet' : 'Torrent', url, text: linkText || (url.startsWith('magnet:') ? 'Magnet Link' : 'Torrent File') });
        }
      }
      
      const freegogBtnRegex = /<a[^>]+class=["'][^"']*download-btn[^"']*["'][^>]+href=["'](https?:\/\/gdl\.freegogpcgames\.xyz\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi;
      let fb;
      while ((fb = freegogBtnRegex.exec(html)) !== null) {
        const url = fb[1];
        const linkText = stripHtml(fb[2]).trim();
        if (!downloadLinks.some(l => l.url === url)) {
          downloadLinks.push({
            type: 'direct',
            service: 'FreeGOG',
            url,
            text: linkText || 'FreeGOG Download'
          });
        }
      }

      const buttonRegex = /<(?:a|button)[^>]*(?:class|id)=["'][^"']*(?:download|btn|button)[^"']*["'][^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/(?:a|button)>/gi;
      while ((m = buttonRegex.exec(html)) !== null) {
        const url = m[1];
        const linkText = stripHtml(m[2]).trim();
        const service = extractServiceName(url);
        if (isValidDownloadUrl(url) && !downloadLinks.some(l => l.url === url)) {
          downloadLinks.push({ type: 'hosting', service, url, text: linkText || service });
        }
      }
    }

    // Generic hosting/torrent patterns for both sites
    const hostingServices = [
      'mediafire.com','mega.nz','mega.co.nz','1fichier.com','rapidgator.net',
      'uploaded.net','turbobit.net','nitroflare.com','katfile.com',
      'pixeldrain.com','gofile.io','mixdrop.to','krakenfiles.com',
      'filefactory.com','dailyuploads.net','multiup.io','zippyshare.com',
      'drive.google.com','dropbox.com','onedrive.live.com'
    ];
    const hostingRegex = new RegExp(`<a[^>]+href=["'](https?://[^"']*(?:${hostingServices.join('|')})[^"']*?)["'][^>]*>`, 'gi');
    let hm;
    while ((hm = hostingRegex.exec(html)) !== null) {
      const url = hm[1];
      const service = extractServiceName(url);
      if (!downloadLinks.some(l => l.url === url)) {
        downloadLinks.push({ type: 'hosting', service, url, text: service });
      }
    }

    const torrentRegex = /<a[^>]+href=["'](magnet:[^"']*?)["'][^>]*>|<a[^>]+href=["'](https?:\/\/[^"']*\.torrent[^"']*?)["'][^>]*>/gi;
    let tm;
    while ((tm = torrentRegex.exec(html)) !== null) {
      const url = tm[1] || tm[2];
      if (url && !downloadLinks.some(l => l.url === url)) {
        downloadLinks.push({ type: 'torrent', url, text: url.startsWith('magnet:') ? 'Magnet Link' : 'Torrent File' });
      }
    }

    const maxLinks = siteType === 'freegog' ? 20 : 15;
    return downloadLinks.slice(0, maxLinks);

  } catch (err) {
    console.error(`Error extracting download links from ${postUrl}:`, err);
    return [];
  }
}

function isValidDownloadUrl(url) {
  const hostingServices = {
    'mediafire.com': 'MediaFire',
    'mega.nz': 'MEGA',
    'mega.co.nz': 'MEGA',
    '1fichier.com': '1Fichier',
    'rapidgator.net': 'RapidGator',
    'uploaded.net': 'Uploaded',
    'turbobit.net': 'TurboBit',
    'nitroflare.com': 'NitroFlare',
    'katfile.com': 'KatFile',
    'pixeldrain.com': 'PixelDrain',
    'gofile.io': 'GoFile',
    'mixdrop.to': 'MixDrop',
    'krakenfiles.com': 'KrakenFiles',
    'filefactory.com': 'FileFactory',
    'dailyuploads.net': 'DailyUploads',
    'multiup.io': 'MultiUp',
    'zippyshare.com': 'ZippyShare',
    'drive.google.com': 'Google Drive',
    'dropbox.com': 'Dropbox',
    'onedrive.live.com': 'OneDrive'
  };

  try {
    const hostname = new URL(url).hostname;
    // ✅ Convert object keys to array and check
    return Object.keys(hostingServices).some(domain => hostname.includes(domain));
  } catch (e) {
    return false;
  }
}

function extractServiceName(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('freegogpcgames.com') || host.includes('gdl.freegogpcgames.xyz')) {
      return 'FreeGOG';
    }
    if (host.includes('mediafire')) return 'Mediafire';
    if (host.includes('mega')) return 'Mega';
    if (host.includes('1fichier')) return '1Fichier';
    if (host.includes('rapidgator')) return 'Rapidgator';
    if (host.includes('uploaded')) return 'Uploaded';
    if (host.includes('turbobit')) return 'Turbobit';
    if (host.includes('nitroflare')) return 'Nitroflare';
    if (host.includes('katfile')) return 'Katfile';
    if (host.includes('pixeldrain')) return 'Pixeldrain';
    if (host.includes('gofile')) return 'Gofile';
    if (host.includes('mixdrop')) return 'Mixdrop';
    if (host.includes('krakenfiles')) return 'Krakenfiles';
    if (host.includes('filefactory')) return 'FileFactory';
    if (host.includes('dailyuploads')) return 'DailyUploads';
    if (host.includes('multiup')) return 'MultiUp';
    if (host.includes('zippyshare')) return 'Zippyshare';
    if (host.includes('drive.google')) return 'Google Drive';
    if (host.includes('dropbox')) return 'Dropbox';
    if (host.includes('onedrive')) return 'OneDrive';
    if (host.includes('torrent')) return 'Torrent';

    return host;
  } catch {
    return 'Unknown';
  }
}

function stripHtml(html) {
  return html.replace(/<[^>]*>?/gm, '');
}

function extractDescription(content) {
  if (!content) return '';
  const divRegex = /<div[^>]*class="entry-content"[^>]*>([\s\S]*?)<\/div>/i;
  const match = content.match(divRegex);
  if (match && match[1]) {
    const contentWithoutDiv = match[1];
    const imageAndLinkRegex = /<img[^>]*>|<a[^>]*>(.*?)<\/a>|Download Links|Password|Title:|Genre:|Developer:|Publisher:|Release Name:|Game Version:|Size:|Interface Language:|Audio Language:|Subtitles Language:|Crack:|Minimun:|Operating system:|CPU:|RAM:|Hard disk:|Video card:|Installation:|Game Features:|Repack Features:|Description:|Screenshots:/gi;
    const strippedContent = contentWithoutDiv.replace(imageAndLinkRegex, (match) => {
      const linkTextMatch = /<a[^>]*>(.*?)<\/a>/i.exec(match);
      return linkTextMatch ? linkTextMatch[1] : '';
    });
    return stripHtml(strippedContent).trim().split('\n').filter(line => line.trim() !== '').join('\n');
  }
  return stripHtml(content).trim();
}
