/**
 * Game Search API v2 - Vercel Serverless Function
 * Main entry point for API requests
 */

import { 
  SITE_CONFIGS, 
  MAX_POSTS_PER_SITE,
  stripHtml,
  extractServiceName,
  classifyTorrentLink
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
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'GameSearch-API-v2/2.0'
      }
    });

    if (!response.ok) {
      console.error(`${siteConfig.name} returned ${response.status}`);
      return [];
    }

    const posts = await response.json();

    return posts.map(post => ({
      id: post.id.toString(),
      title: stripHtml(post.title?.rendered || post.title || ''),
      excerpt: stripHtml(post.excerpt?.rendered || post.excerpt || ''),
      link: post.link,
      date: post.date,
      source: siteConfig.name,
      siteType: siteConfig.type
    }));

  } catch (error) {
    console.error(`Error searching ${siteConfig.name}:`, error);
    return [];
  }
}

async function handleRecentUploads(req, res) {
  const allSites = Object.values(SITE_CONFIGS);
  const fetchPromises = allSites.map(site => fetchRecentFromSite(site));
  const allResults = await Promise.all(fetchPromises);
  const combinedResults = allResults.flat();

  // Sort by date
  combinedResults.sort((a, b) => new Date(b.date) - new Date(a.date));

  return res.status(200).json({
    success: true,
    results: combinedResults,
    count: combinedResults.length
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
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'GameSearch-API-v2/2.0'
      }
    });

    if (!response.ok) {
      return [];
    }

    const posts = await response.json();

    return posts.map(post => ({
      id: post.id.toString(),
      title: stripHtml(post.title?.rendered || post.title || ''),
      excerpt: stripHtml(post.excerpt?.rendered || post.excerpt || ''),
      link: post.link,
      date: post.date,
      source: siteConfig.name,
      siteType: siteConfig.type
    }));

  } catch (error) {
    console.error(`Error fetching recent from ${siteConfig.name}:`, error);
    return [];
  }
}

async function handlePostDetails(req, res) {
  return res.status(501).json({
    success: false,
    error: 'Post details endpoint not yet implemented in v2'
  });
}

async function handleImageProxy(req, res) {
  return res.status(501).json({
    success: false,
    error: 'Image proxy endpoint not yet implemented in v2'
  });
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
