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
			return new Response(null, {
				headers: corsHeaders
			});
		}

		// NEW: Allow both GET and POST for all endpoints
		if (request.method !== 'GET' && request.method !== 'POST') {
			return new Response('Method not allowed', {
				status: 405, headers: corsHeaders
			});
		}

		// Handle cache clearing endpoint
		if (url.pathname === '/clearcache') {
			return await handleClearCache(corsHeaders);
		}

		// Handle deleting decrypted cache
		if (url.pathname === '/clear-decrypt-cache') {
			return await handleClearDecryptCache(corsHeaders, env);
		}

		// Handle image proxy endpoint
		if (url.pathname === '/proxy-image') {
			return await handleImageProxy(request, corsHeaders);
		}

		// Handle recent uploads endpoint
		if (url.pathname === '/recent') {
			return await handleRecentUploadsComplete(request, corsHeaders, ctx);
		}

		// Handles decryption endpoint
		if (url.pathname === '/decrypt') {
			const hash = url.searchParams.get('hash');
			if (!hash) {
				return new Response(JSON.stringify({
					success: false, error: 'Missing hash'
				}), {
					status: 400,
					headers: {
						...corsHeaders, 'Content-Type': 'application/json'
					}

				});
			}
			return await handleDecrypt(hash, corsHeaders, env, ctx);
		}

		// Handle search endpoint
		return await handleSearchComplete(request, corsHeaders, ctx);
	}
};

	// Cache configuration
	const CACHE_CONFIG = {
		CACHE_TTL: 3600,
		// 1 hour
		STALE_WHILE_REVALIDATE: 7200,
		// 2 hours
		CACHE_PREFIX: 'game-search-v2:',
		RECENT_UPLOADS_KEY: 'recent-uploads-complete',
	};

	// Maximum posts to fetch per site to prevent timeouts
	const MAX_POSTS_PER_SITE = 10;

	// Global variable to store the SteamRip cookie (in a real implementation, you might want to use KV storage)
	let steamripCookie = {
		cf_clearance: null,
		expires_at: 0
	};

	// Helper functions for common tasks
	function stripHtml(html) {
		return (html || '').replace(/<[^>]*>?/gm, '');
	}

	// Updated extractServiceName function
	function extractServiceName(url) {
		try {
			// Handle protocol-relative URLs (starting with //)
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
			// Add SteamRip specific hosters
			if (host.includes('buzzheavier')) return 'BuzzHeavier';
			if (host.includes('datanodes')) return 'DataNodes';
			if (host.includes('filecrypt')) return 'FileCrypt';
			if (host.includes('megadb')) return 'MegaDB'; // Added for MegaDB links
			return host;
		} catch {
			// If URL parsing fails, try a simple string check
			if (url.includes('megadb')) return 'MegaDB';
			if (url.includes('buzzheavier')) return 'BuzzHeavier';
			if (url.includes('datanodes')) return 'DataNodes';
			if (url.includes('filecrypt')) return 'FileCrypt';
			return 'Unknown';
		}
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
				return linkTextMatch ? linkTextMatch[1]: '';
			});
			return stripHtml(strippedContent).trim().split('\n').filter(line => line.trim() !== '').join('\n');
		}
		return stripHtml(content).trim();
	}

	// SteamRip cookie management functions
	// Function to get a fresh cookie from FlareSolverr
	async function getFreshSteamripCookie() {
		console.log('Getting fresh cf_clearance cookie for SteamRip');

		try {
			const flaresolverrUrl = 'https://flare.iforgor.cc/v1';
			const response = await fetch(flaresolverrUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					cmd: 'request.get',
					url: 'https://steamrip.com/wp-json/wp/v2/posts',
					userAgent: 'Cloudflare-Workers-Search-API/2.0'
				})
			});

			if (!response.ok) {
				throw new Error(`FlareSolverr request failed: ${response.status}`);
			}

			const data = await response.json();

			if (data.status !== 'ok') {
				throw new Error(`FlareSolverr error: ${data.message}`);
			}

			// Extract cf_clearance cookie
			let cf_clearance = null;
			let expires_at = Date.now() + (4 * 60 * 60 * 1000); // Default 4 hours from now

			if (data.solution.cookies && Array.isArray(data.solution.cookies)) {
				const cfCookie = data.solution.cookies.find(cookie => cookie.name === 'cf_clearance');
				if (cfCookie) {
					cf_clearance = cfCookie.value;

					// Use the actual expiration time if available, otherwise default to 4 hours
					if (cfCookie.expires) {
						expires_at = new Date(cfCookie.expires * 1000).getTime();
					}

					console.log('Successfully obtained cf_clearance cookie:', cf_clearance.substring(0, 20) + '...');
				}
			}

			if (!cf_clearance) {
				throw new Error('Failed to extract cf_clearance cookie from FlareSolverr response');
			}

			// Update the global cookie variable
			steamripCookie = {
				cf_clearance: cf_clearance,
				expires_at: expires_at
			};

			return steamripCookie;
		} catch (error) {
			console.error('Error getting fresh SteamRip cookie:', error);
			throw error;
		}
	}

	// Function to get a valid cookie (refresh if needed)
	async function getValidSteamripCookie() {
		// If we don't have a cookie or it's expired, get a fresh one
		if (!steamripCookie.cf_clearance || Date.now() >= steamripCookie.expires_at) {
			return await getFreshSteamripCookie();
		}

		return steamripCookie;
	}

	// Function to make authenticated requests to SteamRip (both API and page content)
	async function fetchSteamrip(url, isPageRequest = false) {
		try {
			// Get a valid cookie
			const cookie = await getValidSteamripCookie();

			const requestType = isPageRequest ? "page": "API";
			console.log(`Making authenticated request to SteamRip ${requestType}`);

			// Set appropriate user agent based on request type
			const userAgent = isPageRequest
			? 'Cloudflare-Workers-Link-Extractor/2.0': 'Cloudflare-Workers-Search-API/2.0';

			// Make the request with the cookie
			const response = await fetch(url, {
				headers: {
					'User-Agent': userAgent,
					'Cookie': `cf_clearance=${cookie.cf_clearance}`
				}
			});

			// If the request fails with a 403 (Forbidden), the cookie might be expired
			if (response.status === 403) {
				console.log('Received 403, cookie might be expired, getting a fresh one');

				// Get a fresh cookie
				const freshCookie = await getFreshSteamripCookie();

				// Retry the request with the fresh cookie
				const retryResponse = await fetch(url, {
					headers: {
						'User-Agent': userAgent,
						'Cookie': `cf_clearance=${freshCookie.cf_clearance}`
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

	async function handleClearDecryptCache(corsHeaders, env) {
		try {
			// List all keys with the prefix "decrypt:"
			const listResult = await env.DECRYPTED_LINKS_KV.list({
				prefix: 'decrypt:'
			});

			// Delete each key
			const deletePromises = listResult.keys.map(key =>
				env.DECRYPTED_LINKS_KV.delete(key.name)
			);

			await Promise.all(deletePromises);

			return new Response(JSON.stringify({
				success: true,
				message: `Cleared ${listResult.keys.length} decrypted links from KV cache`,
				count: listResult.keys.length
			}), {
				headers: {
					...corsHeaders,
					'Content-Type': 'application/json'
				}
			});
		} catch (error) {
			console.error('Error clearing decrypt cache:', error);
			return new Response(JSON.stringify({
				success: false,
				error: `Failed to clear decrypt cache: ${error.message}`
			}), {
				status: 500,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/json'
				}
			});
		}
	}

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
		const siteParam = url.searchParams.get('site') || 'all';

		if (!searchQuery?.trim()) {
			return new Response(JSON.stringify({
				error: 'Search query required'
			}), {
				status: 400,
				headers: {
					...corsHeaders, 'Content-Type': 'application/json'
				}
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
		const sites = [{
			baseUrl: 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts',
			type: 'skidrow',
			name: 'SkidrowReloaded'
		},
			{
				baseUrl: 'https://freegogpcgames.com/wp-json/wp/v2/posts',
				type: 'freegog',
				name: 'FreeGOGPCGames'
			},
			{
				baseUrl: 'https://gamedrive.org/wp-json/wp/v2/posts',
				type: 'gamedrive',
				name: 'GameDrive'
			},
			{
				baseUrl: 'https://steamrip.com/wp-json/wp/v2/posts',
				type: 'steamrip',
				name: 'SteamRip'
			}];

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
			...(Object.keys(errors).length > 0 && {
				errors
			}),
			fetchStrategy: 'recent',
			cached: false
		};
	}

	async function fetchAllSearchResults(searchQuery, siteParam) {
		const sites = [];
		if (siteParam === 'all' || !siteParam) {
			sites.push(
				{
					baseUrl: 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts', type: 'skidrow', name: 'SkidrowReloaded'
				},
				{
					baseUrl: 'https://freegogpcgames.com/wp-json/wp/v2/posts', type: 'freegog', name: 'FreeGOGPCGames'
				},
				{
					baseUrl: 'https://gamedrive.org/wp-json/wp/v2/posts', type: 'gamedrive', name: 'GameDrive'
				},
				{
					baseUrl: 'https://steamrip.com/wp-json/wp/v2/posts', type: 'steamrip', name: 'SteamRip'
				}
			);
		} else if (siteParam === 'both') {
			// Legacy support - now searches first two sites
			sites.push(
				{
					baseUrl: 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts', type: 'skidrow', name: 'SkidrowReloaded'
				},
				{
					baseUrl: 'https://freegogpcgames.com/wp-json/wp/v2/posts', type: 'freegog', name: 'FreeGOGPCGames'
				}
			);
		} else if (siteParam === 'skidrow') {
			sites.push({
				baseUrl: 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts', type: 'skidrow', name: 'SkidrowReloaded'
			});
		} else if (siteParam === 'freegog') {
			sites.push({
				baseUrl: 'https://freegogpcgames.com/wp-json/wp/v2/posts', type: 'freegog', name: 'FreeGOGPCGames'
			});
		} else if (siteParam === 'gamedrive') {
			sites.push({
				baseUrl: 'https://gamedrive.org/wp-json/wp/v2/posts', type: 'gamedrive', name: 'GameDrive'
			});
		} else if (siteParam === 'steamrip') {
			sites.push({
				baseUrl: 'https://steamrip.com/wp-json/wp/v2/posts', type: 'steamrip', name: 'SteamRip'
			});
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
			...(Object.keys(errors).length > 0 && {
				errors
			}),
			fetchStrategy: 'search',
			cached: false
		};
	}

	async function fetchRecentUploadsFromSite(site) {
		try {
			const params = new URLSearchParams( {
				orderby: 'date',
				order: 'desc'
			});

			// For GameDrive, include categories filter
			if (site.type === 'gamedrive') {
				params.set('categories', '3');
			}

			// Only add per_page and page for sites that aren't FreeGOG or SteamRip
			if (site.type !== 'freegog' && site.type !== 'steamrip') {
				params.set('per_page', MAX_POSTS_PER_SITE.toString());
				params.set('page', '1');
			}

			const url = `${site.baseUrl}?${params}`;
			console.log(`Fetching recent uploads from ${site.name}: ${url}`);

			let response;
			if (site.type === 'steamrip') {
				// Use our new helper function to make authenticated requests
				response = await fetchSteamrip(url);
			} else {
				// Normal fetch for other sites
				response = await fetch(url, {
					headers: {
						'User-Agent': 'Cloudflare-Workers-Search-API/2.0'
					}
				});
			}

			if (!response.ok) {
				throw new Error(`${site.name} API returned ${response.status}: ${response.statusText}`);
			}

			const posts = await response.json();
			console.log(`Got ${posts.length} posts from ${site.name}`);

			// Always extract download links for SteamRip, even for recent uploads
			const fetchLinks = false;

			const transformedPosts = await Promise.all(
				posts.map(async (post) => transformPost(post, site, fetchLinks))
			);

			return {
				site: site.name,
				posts: transformedPosts,
				error: null
			};
		} catch (error) {
			console.error(`Error fetching recent uploads from ${site.name}:`, error);
			return {
				site: site.name,
				posts: [],
				error: error.message
			};
		}
	}

	async function fetchPostsWithSearch(site, searchQuery) {
		try {
			const params = new URLSearchParams( {
				search: searchQuery,
				orderby: 'date',
				order: 'desc'
			});

			// For GameDrive, include categories filter
			if (site.type === 'gamedrive') {
				params.set('categories', '3');
			}

			// Only add per_page for sites that aren't FreeGOG or SteamRip
			if (site.type !== 'freegog' && site.type !== 'steamrip') {
				params.set('per_page', MAX_POSTS_PER_SITE.toString());
			}

			const url = `${site.baseUrl}?${params}`;
			console.log(`Fetching from ${site.name}: ${url}`);

			let response;
			if (site.type === 'steamrip') {
				// Use our new helper function to make authenticated requests
				response = await fetchSteamripAPI(url);
			} else {
				// Normal fetch for other sites
				response = await fetch(url, {
					headers: {
						'User-Agent': 'Cloudflare-Workers-Search-API/2.0'
					}
				});
			}

			if (!response.ok) {
				throw new Error(`${site.name} API returned ${response.status}: ${response.statusText}`);
			}

			const posts = await response.json();
			console.log(`Got ${posts.length} posts from ${site.name}`);

			const transformedPosts = await Promise.all(
				posts.map(async (post) => transformPost(post, site, true))
			);

			return {
				site: site.name,
				posts: transformedPosts,
				error: null
			};
		} catch (error) {
			console.error(`Error fetching search results from ${site.name}:`, error);
			return {
				site: site.name,
				posts: [],
				error: error.message
			};
		}
	}


	async function transformPost(post, site, fetchLinks = false) {
		const downloadLinks = fetchLinks ? await extractDownloadLinks(post.link, site.type): [];
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
			...(fallbackData && {
				results: fallbackData.results, cached: true
			})
		}), {
			status: fallbackData ? 200: 500,
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
			return new Response('Invalid image URL', {
				status: 400
			});
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
					return new Response(`Failed to fetch image: ${response.status} ${response.statusText}`, {
						status: response.status
					});
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
				return new Response(`Error fetching image: ${err.message}`, {
					status: 500
				});
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


	// Updated isValidDownloadUrl function
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
			'onedrive.live.com': 'OneDrive',
			'gamedrive.org': 'GameDrive',
			'torrent.cybar.xyz': 'CybarTorrent',
			// Add SteamRip specific hosters
			'buzzheavier.com': 'BuzzHeavier',
			'datanodes.to': 'DataNodes',
			'filecrypt.co': 'FileCrypt',
			'megadb.net': 'MegaDB' // Added for MegaDB links
		};

		try {
			// Handle protocol-relative URLs (starting with //)
			let testUrl = url;
			if (url.startsWith('//')) {
				testUrl = 'https:' + url;
			}

			const parsedUrl = new URL(testUrl);
			const hostname = parsedUrl.hostname.toLowerCase();

			return Object.keys(hostingServices).some(domain => hostname.includes(domain));
		} catch (e) {
			// If URL parsing fails, try a simple string check
			return Object.keys(hostingServices).some(domain => url.includes(domain));
		}
	}

	async function fetchWithFlareSolverr(url) {
		const flaresolverrUrl = 'https://flare.iforgor.cc/v1';

		try {
			const response = await fetch(flaresolverrUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					cmd: 'request.get',
					url: url,
					userAgent: 'Cloudflare-Workers-Search-API/2.0'
				})
			});

			if (!response.ok) {
				throw new Error(`FlareSolverr request failed: ${response.status}`);
			}

			const data = await response.json();

			if (data.status !== 'ok') {
				throw new Error(`FlareSolverr error: ${data.message}`);
			}

			return data.solution.response;
		} catch (error) {
			console.error('FlareSolverr error:', error);
			throw error;
		}
	}

	async function handleDecrypt(hash, corsHeaders, env, ctx) {
		const cacheKey = `decrypt:${hash}`;
		const vpsProxyUrl = 'https://decrypt.iforgor.cc/decrypt'; // Replace with your actual VPS proxy URL

		// Check KV first
		try {
			const cachedData = await env.DECRYPTED_LINKS_KV.get(cacheKey, {
				type: 'json'
			});
			if (cachedData) {
				return new Response(JSON.stringify({
					...cachedData,
					cached: true
				}), {
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json',
						'X-Cache-Status': 'KV-HIT'
					}
				});
			}
		} catch (error) {
			console.error('KV access error:', error);
		}

		// Try direct decryption first
		try {
			const decodedHash = decodeURIComponent(hash.replace(/\s/g, '+'));

			const response = await fetch('https://crypt.cybar.xyz/api/decrypt', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
					'Accept': 'application/json, text/plain, */*',
					'Accept-Language': 'en-US,en;q=0.9',
					'Accept-Encoding': 'gzip, deflate, br',
					'Connection': 'keep-alive',
					'Sec-Fetch-Dest': 'empty',
					'Sec-Fetch-Mode': 'cors',
					'Sec-Fetch-Site': 'same-origin',
					'Cache-Control': 'no-cache',
					'Pragma': 'no-cache',
					'Origin': 'https://crypt.cybar.xyz',
					'Referer': 'https://crypt.cybar.xyz/'
				},
				body: JSON.stringify({
					hash: decodedHash
				})
			});

			if (response.ok) {
				const data = await response.json();
				const resolvedData = {
					success: true,
					originalHash: decodedHash,
					url: data.resolvedUrl || data.url,
					service: data.service || extractServiceName(data.resolvedUrl || data.url) || 'Unknown',
					source: 'direct' // Track the source for debugging
				};

				// Store in KV
				try {
					await env.DECRYPTED_LINKS_KV.put(cacheKey, JSON.stringify(resolvedData), {
						expirationTtl: 2592000,
						metadata: {
							service: resolvedData.service,
							originalHash: decodedHash
						}
					});
				} catch (error) {
					console.error('KV storage error:', error);
				}

				return new Response(JSON.stringify(resolvedData), {
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json',
						'X-Cache-Status': 'KV-MISS',
						'X-Decrypt-Source': 'direct'
					}
				});
			} else {
				// If direct request fails, try VPS fallback
				console.log(`Direct request failed with status ${response.status}, trying VPS fallback`);
				throw new Error(`Direct request failed: ${response.status}`);
			}

		} catch (error) {
			console.log('Direct decryption failed, falling back to VPS proxy:', error.message);

			// Try VPS proxy as fallback
			try {
				const response = await fetch(vpsProxyUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						hash
					})
				});

				if (!response.ok) {
					const errorText = await response.text();
					console.error('VPS proxy also failed:', errorText);
					return new Response(JSON.stringify({
						success: false,
						error: 'Both direct decryption and VPS proxy failed',
						details: errorText
					}), {
						status: 500,
						headers: {
							...corsHeaders,
							'Content-Type': 'application/json'
						}
					});
				}

				const data = await response.json();

				if (data.success) {
					const resolvedData = {
						...data,
						source: 'vps-fallback' // Track the source
					};

					// Store in KV
					try {
						await env.DECRYPTED_LINKS_KV.put(cacheKey, JSON.stringify(resolvedData), {
							expirationTtl: 2592000,
							metadata: {
								service: resolvedData.service,
								originalHash: hash
							}
						});
					} catch (error) {
						console.error('KV storage error:', error);
					}

					return new Response(JSON.stringify(resolvedData), {
						headers: {
							...corsHeaders,
							'Content-Type': 'application/json',
							'X-Cache-Status': 'KV-MISS',
							'X-Decrypt-Source': 'vps-fallback'
						}
					});
				} else {
					return new Response(JSON.stringify(data), {
						status: 400,
						headers: {
							...corsHeaders,
							'Content-Type': 'application/json'
						}
					});
				}
			} catch (vpsError) {
				console.error('VPS proxy error:', vpsError);
				return new Response(JSON.stringify({
					success: false,
					error: 'Both direct decryption and VPS proxy failed',
					directError: error.message,
					vpsError: vpsError.message
				}), {
					status: 500,
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json'
					}
				});
			}
		}
	}

	/* ---------------------------
   Main download link extractor
   --------------------------- */
	async function extractDownloadLinks(postUrl, siteType = 'skidrow') {
		try {
			let html;
			const downloadLinks = [];

			if (siteType === 'steamrip') {
				// Use our consolidated function to fetch the page
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

						// Try to find the service name in the HTML before the link
						let serviceName = service; // Default to extracted service name
						const beforeLink = html.substring(0, match.index);

						// Look for service name patterns in the HTML before the link
						// Pattern 1: Service name in a span before the link
						const spanPattern = /<span[^>]*>([^<]+)<\/span>\s*<br\s*\/?>\s*<a[^>]+href=/i;
						const spanMatch = beforeLink.match(spanPattern);
						if (spanMatch) {
							serviceName = stripHtml(spanMatch[1]).trim();
						}

						// Pattern 2: Service name in a paragraph before the link
						const pPattern = /<p[^>]*>([^<]+)<\/p>\s*<p[^>]*>\s*<a[^>]+href=/i;
						const pMatch = beforeLink.match(pPattern);
						if (pMatch) {
							serviceName = stripHtml(pMatch[1]).trim();
						}

						// Pattern 3: Service name in a strong tag before the link
						const strongPattern = /<strong[^>]*>([^<]+)<\/strong>\s*<br\s*\/?>\s*<a[^>]+href=/i;
						const strongMatch = beforeLink.match(strongPattern);
						if (strongMatch) {
							serviceName = stripHtml(strongMatch[1]).trim();
						}

						// Add to our download links list
						downloadLinks.push({
							type: 'hosting',
							service: serviceName,
							url: url,
							text: linkText || serviceName
						});
					}

					// Also check for torrent links
					if (url.startsWith('magnet:') || url.includes('.torrent')) {
						downloadLinks.push({
							type: 'torrent',
							url: url,
							text: url.startsWith('magnet:') ? 'Magnet Link': 'Torrent File'
						});
					}
				}
			} else {
				// Normal fetch for other sites
				const response = await fetch(postUrl, {
					headers: {
						'User-Agent': 'Cloudflare-Workers-Link-Extractor/2.0'
					}
				});

				if (!response.ok) {
					console.warn(`Failed to fetch post content from ${postUrl}`);
					return [];
				}

				html = await response.text();

				// Handle each site type specifically
				if (siteType === 'gamedrive') {
					// Prioritize "Manual Grab" for GameDrive if extras are present
					const extrasRegex = /\b(soundtrack|mp3)\b/i;
					if (extrasRegex.test(html)) {
						return [{
							type: 'manual',
							service: 'Manual Grab',
							url: postUrl,
							text: 'Post contains extras, grab manually'
						}];
					}

					// If no extras are found, proceed to scrape other links
					// Corrected regex to handle all characters in the hash
					const cryptRegex = /https?:\/\/crypt\.cybar\.xyz\/(?:link)?\#?([A-Za-z0-9_\-\+\/=]+)/gi;
					let match;
					while ((match = cryptRegex.exec(html)) !== null) {
						const cryptId = match[1];
						const cryptUrl = `https://crypt.cybar.xyz/#${cryptId}`;
						if (!downloadLinks.some(l => l.url === cryptUrl)) {
							downloadLinks.push({
								type: 'crypt', service: 'Crypt', url: cryptUrl, text: 'Encrypted Link'
							});
						}
					}

					const approvedHosters = [
						'mediafire.com',
						'mega.nz',
						'1fichier.com',
						'rapidgator.net',
						'uploaded.net',
						'turbobit.net',
						'nitroflare.com',
						'katfile.com',
						'pixeldrain.com',
						'gofile.io',
						'mixdrop.to',
						'krakenfiles.com',
						'filefactory.com',
						'dailyuploads.net',
						'multiup.io',
						'drive.google.com',
						'dropbox.com',
						'onedrive.live.com',
						'1337x.to'
					];
					const hosterRegex = new RegExp(`<a[^>]+href=["'](https?://[^"']*(?:${approvedHosters.join('|')})[^"']*)["']`, 'gi');
					while ((match = hosterRegex.exec(html)) !== null) {
						const url = match[1];
						const service = extractServiceName(url);

						// Try to find a better service name in the HTML before the link
						let serviceName = service;
						const beforeLink = html.substring(0, match.index);

						// Look for service name patterns
						const spanPattern = /<span[^>]*>([^<]+)<\/span>\s*<br\s*\/?>\s*<a[^>]+href=/i;
						const spanMatch = beforeLink.match(spanPattern);
						if (spanMatch) {
							serviceName = stripHtml(spanMatch[1]).trim();
						}

						const pPattern = /<p[^>]*>([^<]+)<\/p>\s*<p[^>]*>\s*<a[^>]+href=/i;
						const pMatch = beforeLink.match(pPattern);
						if (pMatch) {
							serviceName = stripHtml(pMatch[1]).trim();
						}

						const strongPattern = /<strong[^>]*>([^<]+)<\/strong>\s*<br\s*\/?>\s*<a[^>]+href=/i;
						const strongMatch = beforeLink.match(strongPattern);
						if (strongMatch) {
							serviceName = stripHtml(strongMatch[1]).trim();
						}

						if (!downloadLinks.some(l => l.url === url)) {
							downloadLinks.push({
								type: 'hosting',
								service: serviceName,
								url: url,
								text: serviceName
							});
						}
					}

					const torrentRegex = /<a[^>]+href=["'](magnet:[^"']*?)["'][^>]*>|<a[^>]+href=["'](https?:\/\/[^"']*\.torrent[^"']*?)["'][^>]*>/gi;
					while ((match = torrentRegex.exec(html)) !== null) {
						const url = match[1] || match[2];
						if (url && !downloadLinks.some(l => l.url === url)) {
							downloadLinks.push({
								type: 'torrent',
								url: url,
								text: url.startsWith('magnet:') ? 'Magnet Link': 'Torrent File'
							});
						}
					}
				} else if (siteType === 'skidrow') {
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

								// Try to find a better service name in the HTML before the link
								let serviceName = service;
								const beforeLink = html.substring(0, linkMatch.index);

								// Look for service name patterns
								const spanPattern = /<span[^>]*>([^<]+)<\/span>\s*<br\s*\/?>\s*<a[^>]+href=/i;
								const spanMatch = beforeLink.match(spanPattern);
								if (spanMatch) {
									serviceName = stripHtml(spanMatch[1]).trim();
								}

								const pPattern = /<p[^>]*>([^<]+)<\/p>\s*<p[^>]*>\s*<a[^>]+href=/i;
								const pMatch = beforeLink.match(pPattern);
								if (pMatch) {
									serviceName = stripHtml(pMatch[1]).trim();
								}

								const strongPattern = /<strong[^>]*>([^<]+)<\/strong>\s*<br\s*\/?>\s*<a[^>]+href=/i;
								const strongMatch = beforeLink.match(strongPattern);
								if (strongMatch) {
									serviceName = stripHtml(strongMatch[1]).trim();
								}

								if (!downloadLinks.some(link => link.url === url)) {
									downloadLinks.push({
										type: 'hosting',
										service: serviceName,
										url: url,
										filename: filename,
										text: `${serviceName} - ${filename}`
									});
								}
							}
						}
					}

					// Also extract regular links with service names
					const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
					let hrefMatch;
					while ((hrefMatch = hrefRegex.exec(html)) !== null) {
						const url = hrefMatch[1].trim();
						const linkText = stripHtml(hrefMatch[2]).trim();

						if (isValidDownloadUrl(url) && !downloadLinks.some(l => l.url === url)) {
							const service = extractServiceName(url);

							// Try to find a better service name in the HTML before the link
							let serviceName = service;
							const beforeLink = html.substring(0, hrefMatch.index);

							// Look for service name patterns
							const spanPattern = /<span[^>]*>([^<]+)<\/span>\s*<br\s*\/?>\s*<a[^>]+href=/i;
							const spanMatch = beforeLink.match(spanPattern);
							if (spanMatch) {
								serviceName = stripHtml(spanMatch[1]).trim();
							}

							const pPattern = /<p[^>]*>([^<]+)<\/p>\s*<p[^>]*>\s*<a[^>]+href=/i;
							const pMatch = beforeLink.match(pPattern);
							if (pMatch) {
								serviceName = stripHtml(pMatch[1]).trim();
							}

							const strongPattern = /<strong[^>]*>([^<]+)<\/strong>\s*<br\s*\/?>\s*<a[^>]+href=/i;
							const strongMatch = beforeLink.match(strongPattern);
							if (strongMatch) {
								serviceName = stripHtml(strongMatch[1]).trim();
							}

							downloadLinks.push({
								type: 'hosting',
								service: serviceName,
								url: url,
								text: linkText || serviceName
							});
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

						// Try to find a better service name in the HTML before the link
						let serviceName = service;
						const beforeLink = html.substring(0, m.index);

						// Look for service name patterns
						const spanPattern = /<span[^>]*>([^<]+)<\/span>\s*<br\s*\/?>\s*<a[^>]+href=/i;
						const spanMatch = beforeLink.match(spanPattern);
						if (spanMatch) {
							serviceName = stripHtml(spanMatch[1]).trim();
						}

						const pPattern = /<p[^>]*>([^<]+)<\/p>\s*<p[^>]*>\s*<a[^>]+href=/i;
						const pMatch = beforeLink.match(pPattern);
						if (pMatch) {
							serviceName = stripHtml(pMatch[1]).trim();
						}

						const strongPattern = /<strong[^>]*>([^<]+)<\/strong>\s*<br\s*\/?>\s*<a[^>]+href=/i;
						const strongMatch = beforeLink.match(strongPattern);
						if (strongMatch) {
							serviceName = stripHtml(strongMatch[1]).trim();
						}

						if (isValidDownloadUrl(url) && !downloadLinks.some(l => l.url === url)) {
							downloadLinks.push({
								type: 'hosting',
								service: serviceName,
								url: url,
								text: linkText || serviceName
							});
						}
					}

					const fileRegex = /<a[^>]*href=["'](https?:\/\/[^"']*\.(?:exe|zip|rar|7z|iso|bin|cue|mdf|mds)[^"']*?)["'][^>]*>([^<]*)<\/a>/gi;
					while ((m = fileRegex.exec(html)) !== null) {
						const url = m[1];
						const linkText = stripHtml(m[2]).trim();
						if (isValidDownloadUrl(url) && !downloadLinks.some(l => l.url === url)) {
							downloadLinks.push({
								type: 'direct',
								service: 'Direct Download',
								url: url,
								text: linkText || 'Direct Download'
							});
						}
					}

					const torrentRegex = /<a[^>]*href=["'](magnet:[^"']*?)["'][^>]*>([^<]*)<\/a>|<a[^>]*href=["'](https?:\/\/[^"']*\.torrent[^"']*?)["'][^>]*>([^<]*)<\/a>/gi;
					while ((m = torrentRegex.exec(html)) !== null) {
						const url = m[1] || m[3];
						const linkText = stripHtml(m[2] || m[4]).trim();
						if (url && !downloadLinks.some(l => l.url === url)) {
							downloadLinks.push({
								type: 'torrent',
								service: url.startsWith('magnet:') ? 'Magnet': 'Torrent',
								url: url,
								text: linkText || (url.startsWith('magnet:') ? 'Magnet Link': 'Torrent File')
							});
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
								url: url,
								text: linkText || 'FreeGOG Download'
							});
						}
					}

					const buttonRegex = /<(?:a|button)[^>]*(?:class|id)=["'][^"']*(?:download|btn|button)[^"']*["'][^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/(?:a|button)>/gi;
					while ((m = buttonRegex.exec(html)) !== null) {
						const url = m[1];
						const linkText = stripHtml(m[2]).trim();
						const service = extractServiceName(url);

						// Try to find a better service name in the HTML before the link
						let serviceName = service;
						const beforeLink = html.substring(0, m.index);

						// Look for service name patterns
						const spanPattern = /<span[^>]*>([^<]+)<\/span>\s*<br\s*\/?>\s*<a[^>]+href=/i;
						const spanMatch = beforeLink.match(spanPattern);
						if (spanMatch) {
							serviceName = stripHtml(spanMatch[1]).trim();
						}

						const pPattern = /<p[^>]*>([^<]+)<\/p>\s*<p[^>]*>\s*<a[^>]+href=/i;
						const pMatch = beforeLink.match(pPattern);
						if (pMatch) {
							serviceName = stripHtml(pMatch[1]).trim();
						}

						const strongPattern = /<strong[^>]*>([^<]+)<\/strong>\s*<br\s*\/?>\s*<a[^>]+href=/i;
						const strongMatch = beforeLink.match(strongPattern);
						if (strongMatch) {
							serviceName = stripHtml(strongMatch[1]).trim();
						}

						if (isValidDownloadUrl(url) && !downloadLinks.some(l => l.url === url)) {
							downloadLinks.push({
								type: 'hosting',
								service: serviceName,
								url: url,
								text: linkText || serviceName
							});
						}
					}
				}

				// Generic hosting/torrent patterns for all sites (fallback)
				const hostingServices = [
					'mediafire.com',
					'mega.nz',
					'mega.co.nz',
					'1fichier.com',
					'rapidgator.net',
					'uploaded.net',
					'turbobit.net',
					'nitroflare.com',
					'katfile.com',
					'pixeldrain.com',
					'gofile.io',
					'mixdrop.to',
					'krakenfiles.com',
					'filefactory.com',
					'dailyuploads.net',
					'multiup.io',
					'zippyshare.com',
					'drive.google.com',
					'dropbox.com',
					'onedrive.live.com'
				];
				const hostingRegex = new RegExp(`<a[^>]+href=["'](https?://[^"']*(?:${hostingServices.join('|')})[^"']*?)["'][^>]*>`, 'gi');
				let hm;
				while ((hm = hostingRegex.exec(html)) !== null) {
					const url = hm[1];
					const service = extractServiceName(url);

					// Try to find a better service name in the HTML before the link
					let serviceName = service;
					const beforeLink = html.substring(0, hm.index);

					// Look for service name patterns
					const spanPattern = /<span[^>]*>([^<]+)<\/span>\s*<br\s*\/?>\s*<a[^>]+href=/i;
					const spanMatch = beforeLink.match(spanPattern);
					if (spanMatch) {
						serviceName = stripHtml(spanMatch[1]).trim();
					}

					const pPattern = /<p[^>]*>([^<]+)<\/p>\s*<p[^>]*>\s*<a[^>]+href=/i;
					const pMatch = beforeLink.match(pPattern);
					if (pMatch) {
						serviceName = stripHtml(pMatch[1]).trim();
					}

					const strongPattern = /<strong[^>]*>([^<]+)<\/strong>\s*<br\s*\/?>\s*<a[^>]+href=/i;
					const strongMatch = beforeLink.match(strongPattern);
					if (strongMatch) {
						serviceName = stripHtml(strongMatch[1]).trim();
					}

					if (!downloadLinks.some(l => l.url === url)) {
						downloadLinks.push({
							type: 'hosting',
							service: serviceName,
							url: url,
							text: serviceName
						});
					}
				}

				const torrentRegex = /<a[^>]+href=["'](magnet:[^"']*?)["'][^>]*>|<a[^>]+href=["'](https?:\/\/[^"']*\.torrent[^"']*?)["'][^>]*>/gi;
				let tm;
				while ((tm = torrentRegex.exec(html)) !== null) {
					const url = tm[1] || tm[2];
					if (url && !downloadLinks.some(l => l.url === url)) {
						downloadLinks.push({
							type: 'torrent',
							url: url,
							text: url.startsWith('magnet:') ? 'Magnet Link': 'Torrent File'
						});
					}
				}
			}

			// Special handling for FileCrypt links (for all sites)
			const filecryptRegex = /https?:\/\/filecrypt\.co\/(?:Container\/|Link\/)([A-Z0-9]+)/gi;
			let filecryptMatch;
			while ((filecryptMatch = filecryptRegex.exec(html)) !== null) {
				const filecryptId = filecryptMatch[1];
				const filecryptUrl = filecryptMatch[0];
				if (!downloadLinks.some(l => l.url === filecryptUrl)) {
					downloadLinks.push({
						type: 'filecrypt',
						service: 'FileCrypt',
						url: filecryptUrl,
						text: 'FileCrypt (Requires CAPTCHA)',
						id: filecryptId,
						requiresCaptcha: true
					});
				}
			}

			// Apply limits based on site type
			const maxLinks = siteType === 'gamedrive' ? 20: (siteType === 'freegog' ? 20: 15);
			return downloadLinks.slice(0, maxLinks);

		} catch (err) {
			console.error(`Error extracting download links from ${postUrl}:`, err);
			return [];
		}
	}