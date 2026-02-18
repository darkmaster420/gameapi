/**
 * Game Search API v2 - Vercel Serverless Function
 * Main entry point for API requests
 */

import { 
  SITE_CONFIGS, 
  MAX_POSTS_PER_SITE,
  stripHtml,
  extractServiceName,
  classifyTorrentLink,
  fetchSteamrip,
  fetchSkidrow,
  transformPostForV2,
  isValidImageUrl
} from '../lib/helpers.js';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);

  try {
    // Route handling
    if (pathname === '/clearcache') {
      return handleClearCache(req, res);
    }

    if (pathname === '/proxy-image') {
      return handleImageProxy(req, res);
    }

    if (pathname === '/recent') {
      return handleRecentUploads(req, res);
    }

    if (pathname === '/post') {
      return handlePostDetails(req, res);
    }

    if (pathname === '/decrypt') {
      return handleDecrypt(req, res);
    }

    // Default: search endpoint
    return handleSearch(req, res);

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}

// Handler functions
async function handleSearch(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const searchQuery = url.searchParams.get('search');
  const siteParam = url.searchParams.get('site');

  if (!searchQuery) {
    return res.status(400).json({
      success: false,
      error: 'Missing search parameter'
    });
  }

  // If site specified, search only that site
  if (siteParam) {
    const siteConfig = SITE_CONFIGS[siteParam];
    if (!siteConfig) {
      return res.status(400).json({
        success: false,
        error: `Invalid site parameter. Valid options: ${Object.keys(SITE_CONFIGS).join(', ')}`
      });
    }

    const results = await searchSite(siteConfig, searchQuery);
    return res.status(200).json({
      success: true,
      results,
      count: results.length,
      site: siteParam
    });
  }

  // Search all sites
  const allSites = Object.values(SITE_CONFIGS);
  const searchPromises = allSites.map(site => searchSite(site, searchQuery));
  const allResults = await Promise.all(searchPromises);
  const combinedResults = allResults.flat();

  return res.status(200).json({
    success: true,
    results: combinedResults,
    count: combinedResults.length
  });
}

async function searchSite(siteConfig, searchQuery) {
  try {
    const params = new URLSearchParams({
      search: searchQuery,
      orderby: 'date',
      order: 'desc'
    });

    // GameDrive specific filter
    if (siteConfig.type === 'gamedrive') {
      params.set('categories', '3');
    }

    // Set per_page for all sites EXCEPT freegog
    if (siteConfig.type !== 'freegog') {
      const maxPosts = MAX_POSTS_PER_SITE[siteConfig.type] || MAX_POSTS_PER_SITE.default;
      params.set('per_page', maxPosts.toString());
    }

    const url = `${siteConfig.baseUrl}?${params}`;
    
    let response;
    if (siteConfig.type === 'steamrip') {
      response = await fetchSteamrip(url);
    } else if (siteConfig.type === 'skidrow') {
      response = await fetchSkidrow(url);
    } else {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'GameSearch-API-v2/2.0'
        }
      });
    }

    if (!response.ok) {
      console.error(`${siteConfig.name} returned ${response.status}`);
      return [];
    }

    const posts = await response.json();

    // Transform posts with full data including images and download links
    const transformPromises = posts.map(post => transformPostForV2(post, siteConfig, false));
    return await Promise.all(transformPromises);

  } catch (error) {
    console.error(`Error searching ${siteConfig.name}:`, error);
    return [];
  }
}

async function handleRecentUploads(req, res) {
  // Exclude SteamRip from recent uploads due to frequent timeouts with FlareSolverr
  // SteamRip still works for search and individual post fetches
  const allSites = Object.values(SITE_CONFIGS).filter(site => site.type !== 'steamrip');
  
  console.log(`Fetching recent uploads from ${allSites.length} sites (excluding SteamRip)`);
  
  const fetchPromises = allSites.map(site => fetchRecentFromSite(site));
  
  // Use Promise.allSettled to not fail if one site times out
  const allResults = await Promise.allSettled(fetchPromises);
  
  // Extract successful results and log failures
  const combinedResults = allResults
    .filter(result => result.status === 'fulfilled')
    .flatMap(result => result.value);
  
  // Log any failures
  allResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Failed to fetch from ${allSites[index].name}:`, result.reason);
    }
  });

  // Sort by date
  combinedResults.sort((a, b) => new Date(b.date) - new Date(a.date));

  return res.status(200).json({
    success: true,
    results: combinedResults,
    count: combinedResults.length,
    // Include info about which sites succeeded/failed
    sitesAttempted: allSites.length,
    sitesSucceeded: allResults.filter(r => r.status === 'fulfilled').length
  });
}

async function fetchRecentFromSite(siteConfig) {
  try {
    const params = new URLSearchParams({
      orderby: 'date',
      order: 'desc'
    });

    if (siteConfig.type === 'gamedrive') {
      params.set('categories', '3');
    }

    if (siteConfig.type !== 'freegog') {
      const maxPosts = MAX_POSTS_PER_SITE[siteConfig.type] || MAX_POSTS_PER_SITE.default;
      params.set('per_page', maxPosts.toString());
      params.set('page', '1');
    }

    const url = `${siteConfig.baseUrl}?${params}`;
    
    let response;
    if (siteConfig.type === 'steamrip') {
      response = await fetchSteamrip(url);
    } else if (siteConfig.type === 'skidrow') {
      response = await fetchSkidrow(url);
    } else {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'GameSearch-API-v2/2.0'
        }
      });
    }

    if (!response.ok) {
      return [];
    }

    const posts = await response.json();

    // Transform posts with full data including images and download links
    const transformPromises = posts.map(post => transformPostForV2(post, siteConfig, false));
    return await Promise.all(transformPromises);

  } catch (error) {
    console.error(`Error fetching recent from ${siteConfig.name}:`, error);
    return [];
  }
}

async function handlePostDetails(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const postId = url.searchParams.get('id');
  const site = url.searchParams.get('site');

  if (!postId) {
    return res.status(400).json({
      success: false,
      error: 'Missing post ID parameter'
    });
  }

  if (!site) {
    return res.status(400).json({
      success: false,
      error: `Missing site parameter (${Object.keys(SITE_CONFIGS).join(', ')})`
    });
  }

  const siteConfig = SITE_CONFIGS[site];
  if (!siteConfig) {
    return res.status(400).json({
      success: false,
      error: `Invalid site parameter. Valid options: ${Object.keys(SITE_CONFIGS).join(', ')}`
    });
  }

  try {
    // Construct the full post URL
    let postUrl;
    let response;
    
    if (siteConfig.type === 'steamrip') {
      // SteamRip uses slug-based URLs, need to fetch from API first
      postUrl = `${siteConfig.baseUrl}/${postId}`;
      console.log(`Fetching SteamRip post from API: ${postUrl}`);
      response = await fetchSteamrip(postUrl);
    } else {
      // All WordPress sites (skidrow, gamedrive, freegog) use WP REST API with numeric IDs
      postUrl = `${siteConfig.baseUrl}/${postId}`;
      console.log(`Fetching post details from: ${postUrl}`);
      
      if (siteConfig.type === 'skidrow') {
        response = await fetchSkidrow(postUrl);
      } else {
        response = await fetch(postUrl, {
          headers: {
            'User-Agent': 'Game-Search-API-v2/2.0'
          }
        });
      }
    }

    if (!response.ok) {
      throw new Error(`${siteConfig.name} API returned ${response.status}: ${response.statusText}`);
    }

    const post = await response.json();
    
    // Transform the post with download links enabled
    const transformedPost = await transformPostForV2(post, siteConfig, true);

    return res.status(200).json({
      success: true,
      post: transformedPost,
      cached: false
    });

  } catch (error) {
    console.error('Error fetching post details:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function handleImageProxy(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl) {
    return res.status(400).json({
      success: false,
      error: 'Missing url parameter'
    });
  }

  // Validate image URL
  if (!isValidImageUrl(imageUrl)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid image URL'
    });
  }

  try {
    let response;
    const parsedUrl = new URL(imageUrl);

    // Handle SteamRip images (Cloudflare protected)
    if (parsedUrl.hostname.includes('steamrip.com')) {
      response = await fetchSteamrip(imageUrl, true);
      
      if (!response || !response.ok) {
        console.warn(`Failed to fetch SteamRip image: ${response?.status || 'no response'}`);
        return res.status(response?.status || 500).send('Failed to fetch image from SteamRip');
      }
    }
    // Handle SkidrowReloaded images (Cloudflare protected)
    else if (parsedUrl.hostname.includes('skidrowreloaded.com')) {
      response = await fetchSkidrow(imageUrl, true);
      
      if (!response || !response.ok) {
        console.warn(`Failed to fetch Skidrow image: ${response?.status || 'no response'}`);
        return res.status(response?.status || 500).send('Failed to fetch image from Skidrow');
      }
    }
    // Standard fetch for other sites
    else {
      response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': parsedUrl.origin + '/',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      if (!response.ok) {
        console.warn(`Failed to fetch image: ${response.status} ${response.statusText}`);
        return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
      }
    }

    // Get content type
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // Cache for 7 days
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Convert response to buffer and send
    const buffer = await response.arrayBuffer();
    return res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('Image proxy error:', error);
    return res.status(500).send(`Error fetching image: ${error.message}`);
  }
}

async function handleDecrypt(req, res) {
  return res.status(501).json({
    success: false,
    error: 'Decrypt endpoint not yet implemented in v2'
  });
}

async function handleClearCache(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Cache cleared (no-op in v2)'
  });
}
