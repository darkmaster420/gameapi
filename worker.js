export default {
	// Cloudflare Worker - Game Search API
	// Auto-deployed via GitHub integration
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

		// Handle post details endpoint (fetch specific post with download links)
		if (url.pathname === '/post') {
			return await handlePostDetails(request, corsHeaders, ctx);
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

	// FlareSolverr timeout/retry settings (ms)
	const DEFAULT_FLARE_TIMEOUT_MS = 30000; // 30s default
	const DEFAULT_FLARE_RETRIES = 2;

	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	async function fetchWithTimeout(resource, options = {}, timeoutMs = DEFAULT_FLARE_TIMEOUT_MS) {
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

	async function retryableFetch(resource, options = {}, attempts = DEFAULT_FLARE_RETRIES, timeoutMs = DEFAULT_FLARE_TIMEOUT_MS) {
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

	// Maximum posts to fetch per site - site-specific limits to prevent CPU timeouts
	const MAX_POSTS_PER_SITE = {
		'skidrow': 40,
		'gamedrive': 40, 
		'steamrip': 40,
		'freegog': 40,
		'reloadedsteam': 40,
		'steamunderground': 40,
		'onlinefix': 40,
		'goggames': 50,
		'default': 50
	};

	// Global variables to store Cloudflare bypass cookies (in a real implementation, you might want to use KV storage)
	let steamripCookie = {
		cf_clearance: null,
		expires_at: 0
	};

	let skidrowCookie = {
		cf_clearance: null,
		expires_at: 0
	};

	const SKIDROW_COOLDOWN_MS = Math.max(30000, parseInt(env.SKIDROW_COOLDOWN_MS || '300000', 10) || 300000);
	let skidrowCircuit = {
		cooldownUntil: 0,
		failures: 0,
		lastError: null,
	};

	function isSkidrowCircuitOpen() {
		return Date.now() < skidrowCircuit.cooldownUntil;
	}

	function noteSkidrowFailure(error) {
		skidrowCircuit.failures += 1;
		skidrowCircuit.lastError = String(error?.message || error || 'unknown error');
		skidrowCircuit.cooldownUntil = Date.now() + SKIDROW_COOLDOWN_MS;
		console.warn(`Skidrow circuit opened for ${Math.round(SKIDROW_COOLDOWN_MS / 1000)}s after failure #${skidrowCircuit.failures}: ${skidrowCircuit.lastError}`);
	}

	function resetSkidrowCircuit() {
		if (skidrowCircuit.failures > 0 || skidrowCircuit.cooldownUntil > 0) {
			console.log('Skidrow circuit reset after successful response');
		}
		skidrowCircuit = {
			cooldownUntil: 0,
			failures: 0,
			lastError: null,
		};
	}

	// Helper functions for common tasks
	function stripHtml(html) {
		return (html || '').replace(/<[^>]*>?/gm, '');
	}

	// Helper function to get site configuration
	function getSiteConfig(siteType) {
		const siteConfigs = {
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
			},
			'reloadedsteam': {
				baseUrl: 'https://reloadedsteam.com/wp-json/wp/v2/posts',
				type: 'reloadedsteam',
				name: 'ReloadedSteam'
			},
			'steamunderground': {
				baseUrl: 'https://steamunderground.net/wp-json/wp/v2/posts',
				type: 'steamunderground',
				name: 'SteamUnderground'
			},
			'onlinefix': {
				baseUrl: 'https://online-fix.me',
				type: 'onlinefix',
				name: 'Online-Fix'
			}
		};
		return siteConfigs[siteType] || null;
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
			   if (host.includes('megadb')) return 'MegaDB'; // Check megadb before mega
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
			if (host.includes('datavaults')) return 'DataVaults';
			if (host.includes('vikingfile')) return 'VikingFile';
			if (host.includes('akirabox')) return 'AkiraBox';
			if (host.includes('filecrypt')) return 'FileCrypt';
			if (host.includes('megadb')) return 'MegaDB'; // Added for MegaDB links
			if (host.includes('hitfile')) return 'HitFile';
			if (host.includes('ufile')) return 'UFile';
			if (host.includes('clicknupload')) return 'ClicknUpload';
			return host;
		} catch {
			// If URL parsing fails, try a simple string check
			if (url.includes('megadb')) return 'MegaDB';
			if (url.includes('buzzheavier')) return 'BuzzHeavier';
			if (url.includes('datanodes')) return 'DataNodes';
			if (url.includes('datavaults')) return 'DataVaults';
			if (url.includes('vikingfile')) return 'VikingFile';
			if (url.includes('akirabox')) return 'AkiraBox';
			if (url.includes('filecrypt')) return 'FileCrypt';
			if (url.includes('hitfile')) return 'HitFile';
			if (url.includes('ufile')) return 'UFile';
			if (url.includes('clicknupload')) return 'ClicknUpload';
			return 'Unknown';
		}
	}

	// Enhanced torrent link detection and classification
	function classifyTorrentLink(url, linkText = '') {
		const cleanText = stripHtml(linkText).trim();
		
		if (url.startsWith('magnet:')) {
			// Extract tracker info from magnet links
			const trackerMatch = url.match(/tr=([^&]+)/);
			let trackerInfo = 'Magnet Link';
			
			if (trackerMatch) {
				const tracker = decodeURIComponent(trackerMatch[1]);
				if (tracker.includes('1337x')) trackerInfo = 'Magnet Link (1337x)';
				else if (tracker.includes('rarbg')) trackerInfo = 'Magnet Link (RARBG)';
				else if (tracker.includes('piratebay')) trackerInfo = 'Magnet Link (PirateBay)';
				else if (tracker.includes('kickass')) trackerInfo = 'Magnet Link (KickAss)';
				else if (tracker.includes('torrentgalaxy')) trackerInfo = 'Magnet Link (TorrentGalaxy)';
			}
			
			// Use meaningful link text if available
			if (cleanText && cleanText.length > 0 && !cleanText.toLowerCase().includes('click') && !cleanText.toLowerCase().includes('here')) {
				return {
					type: 'torrent',
					service: 'Magnet',
					url: url,
					text: cleanText,
					torrentInfo: trackerInfo
				};
			}
			
			return {
				type: 'torrent',
				service: 'Magnet',
				url: url,
				text: trackerInfo,
				torrentInfo: trackerInfo
			};
		}
		
		if (url.includes('.torrent')) {
			const hostname = extractServiceName(url);
			let torrentType = 'Torrent File';
			
			// Classify by host
			if (hostname.includes('1337x')) torrentType = 'Torrent File (1337x)';
			else if (hostname.includes('rarbg')) torrentType = 'Torrent File (RARBG)';
			else if (hostname.includes('piratebay')) torrentType = 'Torrent File (PirateBay)';
			else if (hostname.includes('kickass')) torrentType = 'Torrent File (KickAss)';
			else if (hostname.includes('torrentgalaxy')) torrentType = 'Torrent File (TorrentGalaxy)';
			else if (hostname !== url) torrentType = `Torrent File (${hostname})`;
			
			// Use meaningful link text if available
			if (cleanText && cleanText.length > 0 && !cleanText.toLowerCase().includes('click') && !cleanText.toLowerCase().includes('here')) {
				return {
					type: 'torrent',
					service: 'Torrent',
					url: url,
					text: cleanText,
					torrentInfo: torrentType
				};
			}
			
			return {
				type: 'torrent',
				service: 'Torrent',
				url: url,
				text: torrentType,
				torrentInfo: torrentType
			};
		}
		
		// Fallback for torrent-related URLs
		const hostname = extractServiceName(url);
		if (hostname.toLowerCase().includes('torrent')) {
			return {
				type: 'torrent',
				service: hostname,
				url: url,
				text: cleanText || hostname,
				torrentInfo: `Torrent (${hostname})`
			};
		}
		
		return null;
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
			const flaresolverrUrl = env.FLARESOLVERR_URL;
			if (!flaresolverrUrl) {
				throw new Error('FLARESOLVERR_URL environment variable is required for SteamRip. Please set it in wrangler.toml or via wrangler secret');
			}
			
			const attempts = parseInt(env.FLARE_RETRIES || DEFAULT_FLARE_RETRIES, 10) || DEFAULT_FLARE_RETRIES;
			const timeoutMs = parseInt(env.FLARE_TIMEOUT_MS || DEFAULT_FLARE_TIMEOUT_MS, 10) || DEFAULT_FLARE_TIMEOUT_MS;

			const response = await retryableFetch(flaresolverrUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					cmd: 'request.get',
					url: 'https://steamrip.com/wp-json/wp/v2/posts',
					userAgent: 'Cloudflare-Workers-Search-API/2.0'
				})
			}, attempts, timeoutMs);

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
			// Set appropriate user agent based on request type
			const userAgent = isPageRequest
				? 'Cloudflare-Workers-Link-Extractor/2.0'
				: 'Cloudflare-Workers-Search-API/2.0';

			// 1. Try direct fetch first (no cookie) — avoids FlareSolverr delay when CF is not active
			let response = await fetch(url, {
				headers: {
					'User-Agent': userAgent
				}
			});

			// If direct fetch is successful, return it
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
				console.log('Cloudflare protection detected on SteamRip, using FlareSolverr cookie');
				const cookie = await getValidSteamripCookie();

				response = await fetch(url, {
					headers: {
						'User-Agent': userAgent,
						'Cookie': `cf_clearance=${cookie.cf_clearance}`
					}
				});

				if (response.status === 403) {
					console.log('Received 403 from SteamRip, cookie might be expired, getting a fresh one');
					const freshCookie = await getFreshSteamripCookie();

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
			} else {
				// Not Cloudflare, but still not ok
				if (isPageRequest) {
					console.warn(`Failed to fetch SteamRip page: ${response.status} ${response.statusText}`);
					return null;
				} else {
					throw new Error(`SteamRip API returned ${response.status}: ${response.statusText}`);
				}
			}
		} catch (error) {
			console.error(`Error fetching SteamRip:`, error);
			if (isPageRequest) {
				return null;
			} else {
				throw error;
			}
		}
	}

	// SkidrowReloaded cookie management functions
	// Function to get a fresh cookie from FlareSolverr for SkidrowReloaded
	async function getFreshSkidrowCookie() {
		console.log('Getting fresh cf_clearance cookie for SkidrowReloaded');

		try {
			const flaresolverrUrl = env.FLARESOLVERR_URL;
			if (!flaresolverrUrl) {
				throw new Error('FLARESOLVERR_URL environment variable is required for SkidrowReloaded. Please set it in wrangler.toml or via wrangler secret');
			}
			
			const attempts = Math.max(1, parseInt(env.FLARE_RETRIES || '1', 10) || 1);
			const timeoutMs = Math.min(25000, parseInt(env.FLARE_TIMEOUT_MS || DEFAULT_FLARE_TIMEOUT_MS, 10) || DEFAULT_FLARE_TIMEOUT_MS);
			const response = await retryableFetch(flaresolverrUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					cmd: 'request.get',
					url: 'https://www.skidrowreloaded.com/wp-json/wp/v2/posts',
					session: 'skidrowreloaded',
					maxTimeout: timeoutMs
				})
			}, attempts, timeoutMs);

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

					console.log('Successfully obtained cf_clearance cookie for SkidrowReloaded:', cf_clearance.substring(0, 20) + '...');
				}
			}

			if (!cf_clearance) {
				throw new Error('Failed to extract cf_clearance cookie from FlareSolverr response for SkidrowReloaded');
			}

			// Update the global cookie variable
			skidrowCookie = {
				cf_clearance: cf_clearance,
				expires_at: expires_at
			};

			return skidrowCookie;
		} catch (error) {
			console.error('Error getting fresh SkidrowReloaded cookie:', error);
			throw error;
		}
	}

	// Function to get a valid SkidrowReloaded cookie (refresh if needed)
	async function getValidSkidrowCookie() {
		// If we don't have a cookie or it's expired, get a fresh one
		if (!skidrowCookie.cf_clearance || Date.now() >= skidrowCookie.expires_at) {
			return await getFreshSkidrowCookie();
		}

		return skidrowCookie;
	}

	// Function to make authenticated requests to SkidrowReloaded (both API and page content)
	async function fetchSkidrow(url, isPageRequest = false) {
		if (isSkidrowCircuitOpen()) {
			const remainingMs = skidrowCircuit.cooldownUntil - Date.now();
			console.warn(`Skipping Skidrow request during cooldown (${Math.max(0, Math.ceil(remainingMs / 1000))}s remaining)`);
			return isPageRequest ? null : new Response('[]', {
				status: 200,
				headers: {
					'Content-Type': 'application/json'
				}
			});
		}

		try {
			// Set appropriate user agent based on request type
			const userAgent = isPageRequest
				? 'Cloudflare-Workers-Link-Extractor/2.0'
				: 'Cloudflare-Workers-Search-API/2.0';

			// 1. Try direct fetch (no cookie)
			let response = await fetch(url, {
				headers: {
					'User-Agent': userAgent
				}
			});

			// If direct fetch is successful, return it
			if (response.ok) {
				resetSkidrowCircuit();
				return response;
			}

			// If response indicates Cloudflare protection, try with cookie
			const cloudflareStatus = [403, 503];
			let isCloudflare = cloudflareStatus.includes(response.status);

			// Also check for Cloudflare challenge in body (HTML page with challenge)
			if (!isCloudflare && response.headers.get('content-type')?.includes('text/html')) {
				const text = await response.text();
				if (text.includes('cf-browser-verification') || text.includes('Cloudflare') || text.includes('Attention Required')) {
					isCloudflare = true;
				}
			}

			if (isCloudflare) {
				// Get a valid cookie
				const cookie = await getValidSkidrowCookie();
				// Retry with cookie
				response = await fetch(url, {
					headers: {
						'User-Agent': userAgent,
						'Cookie': `cf_clearance=${cookie.cf_clearance}`
					}
				});

				// If the request fails with a 403 (Forbidden), the cookie might be expired
				if (response.status === 403) {
					console.log('Received 403 from SkidrowReloaded, cookie might be expired, getting a fresh one');
					// Get a fresh cookie
					const freshCookie = await getFreshSkidrowCookie();
					// Retry the request with the fresh cookie
					const retryResponse = await fetch(url, {
						headers: {
							'User-Agent': userAgent,
							'Cookie': `cf_clearance=${freshCookie.cf_clearance}`
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
				// Not Cloudflare, but still not ok
				if (isPageRequest) {
					console.warn(`Failed to fetch SkidrowReloaded page: ${response.status} ${response.statusText}`);
					return null;
				} else {
					throw new Error(`SkidrowReloaded API returned ${response.status}: ${response.statusText}`);
				}
			}
		} catch (error) {
			console.error(`Error fetching SkidrowReloaded:`, error);
			noteSkidrowFailure(error);
			if (isPageRequest) {
				return null;
			} else {
				// Fail open for site-level fetch errors so other providers still return data.
				return new Response('[]', {
					status: 200,
					headers: {
						'Content-Type': 'application/json'
					}
				});
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

	async function handlePostDetails(request, corsHeaders, ctx) {
		const url = new URL(request.url);
		const postId = url.searchParams.get('id');
		const site = url.searchParams.get('site');

		if (!postId) {
			return new Response(JSON.stringify({
				success: false,
				error: 'Missing post ID parameter'
			}), {
				status: 400,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/json'
				}
			});
		}

		if (!site) {
			return new Response(JSON.stringify({
				success: false,
				error: 'Missing site parameter (skidrow, freegog, gamedrive, steamrip, reloadedsteam, steamunderground)'
			}), {
				status: 400,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/json'
				}
			});
		}

		try {
			const siteConfig = getSiteConfig(site);
			if (!siteConfig) {
				return new Response(JSON.stringify({
					success: false,
					error: `Invalid site parameter. Valid options: skidrow, freegog, gamedrive, steamrip, reloadedsteam, steamunderground`
				}), {
					status: 400,
					headers: {
						...corsHeaders,
						'Content-Type': 'application/json'
					}
				});
			}

			// Fetch the specific post
			const postUrl = `${siteConfig.baseUrl}/${postId}`;
			console.log(`Fetching post details from: ${postUrl}`);

			let response;
			if (siteConfig.type === 'steamrip') {
				response = await fetchSteamrip(postUrl);
			} else if (siteConfig.type === 'skidrow') {
				response = await fetchSkidrow(postUrl);
			} else {
				response = await fetch(postUrl, {
					headers: {
						'User-Agent': 'Cloudflare-Workers-Search-API/2.0'
					}
				});
			}

			if (!response.ok) {
				throw new Error(`${siteConfig.name} API returned ${response.status}: ${response.statusText}`);
			}

			const post = await response.json();
			
			// Transform the post with download links enabled
			const workerUrl = `${url.protocol}//${url.host}`;
			const transformedPost = await transformPost(post, siteConfig, true, workerUrl);

			return new Response(JSON.stringify({
				success: true,
				post: transformedPost,
				cached: false
			}), {
				headers: {
					...corsHeaders,
					'Content-Type': 'application/json'
				}
			});

		} catch (error) {
			console.error('Error fetching post details:', error);
			return new Response(JSON.stringify({
				success: false,
				error: error.message
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
		const workerUrl = new URL(request.url).origin;

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

				ctx.waitUntil(revalidateRecentUploadsComplete(cacheKey, workerUrl));
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

			const freshData = await fetchAllRecentUploads(workerUrl);

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

			const freshData = await fetchAllSearchResults(searchQuery, siteParam, `${url.protocol}//${url.host}`);

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

	async function fetchAllRecentUploads(workerUrl) {
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
			},
			{
				baseUrl: 'https://reloadedsteam.com/wp-json/wp/v2/posts',
				type: 'reloadedsteam',
				name: 'ReloadedSteam'
			},
			{
				baseUrl: 'https://steamunderground.net/wp-json/wp/v2/posts',
				type: 'steamunderground',
				name: 'SteamUnderground'
			},
			{
				baseUrl: 'https://online-fix.me',
				type: 'onlinefix',
				name: 'Online-Fix'
			},
			{
				baseUrl: 'https://gog-games.to/api/web/recent-torrents',
				type: 'goggames',
				name: 'GOG-Games'
			}];

		const sitePromises = sites.map(site => fetchRecentUploadsFromSite(site, workerUrl));
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

	async function fetchAllSearchResults(searchQuery, siteParam, workerUrl) {
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
				},
				{
					baseUrl: 'https://reloadedsteam.com/wp-json/wp/v2/posts', type: 'reloadedsteam', name: 'ReloadedSteam'
				},
				{
					baseUrl: 'https://steamunderground.net/wp-json/wp/v2/posts', type: 'steamunderground', name: 'SteamUnderground'
				},
				{
					baseUrl: 'https://online-fix.me', type: 'onlinefix', name: 'Online-Fix'
				},
				{
					baseUrl: 'https://gog-games.to/api/web/recent-torrents', type: 'goggames', name: 'GOG-Games'
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
		} else if (siteParam === 'reloadedsteam') {
			sites.push({
				baseUrl: 'https://reloadedsteam.com/wp-json/wp/v2/posts', type: 'reloadedsteam', name: 'ReloadedSteam'
			});
		} else if (siteParam === 'steamunderground') {
			sites.push({
				baseUrl: 'https://steamunderground.net/wp-json/wp/v2/posts', type: 'steamunderground', name: 'SteamUnderground'
			});
		} else if (siteParam === 'onlinefix') {
			sites.push({
				baseUrl: 'https://online-fix.me', type: 'onlinefix', name: 'Online-Fix'
			});
		} else if (siteParam === 'goggames') {
			sites.push({
				baseUrl: 'https://gog-games.to/api/web/recent-torrents', type: 'goggames', name: 'GOG-Games'
			});
		}

		const sitePromises = sites.map(site => fetchPostsWithSearch(site, searchQuery, workerUrl));
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

	async function fetchRecentUploadsFromSite(site, workerUrl) {
		try {
			// GOG-Games has its own API format – handle separately
			if (site.type === 'goggames') {
				return await fetchGogGamesRecentForWorker(site);
			}

			// Online-Fix recent uploads are exposed via RSS.
			if (site.type === 'onlinefix') {
				return await fetchOnlineFixRecentForWorker(site);
			}

			const params = new URLSearchParams( {
				orderby: 'date',
				order: 'desc'
			});

		// For GameDrive, include categories filter
		if (site.type === 'gamedrive') {
			params.set('categories', '3');
		}

		// Set per_page and page for all sites EXCEPT freegog (freegog API doesn't handle these params well)
		if (site.type !== 'freegog') {
			const maxPosts = MAX_POSTS_PER_SITE[site.type] || MAX_POSTS_PER_SITE.default;
			params.set('per_page', maxPosts.toString());
			params.set('page', '1');
		}

		const url = `${site.baseUrl}?${params}`;
			console.log(`Fetching recent uploads from ${site.name}: ${url}`);

			let response;
			if (site.type === 'steamrip') {
				// Use our new helper function to make authenticated requests
				response = await fetchSteamrip(url);
			} else if (site.type === 'skidrow') {
				// Use our new helper function to make authenticated requests to SkidrowReloaded
				response = await fetchSkidrow(url);
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

			const transformedPosts = await transformPostsInBatches(posts, site, fetchLinks, workerUrl, 8);

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

	async function fetchPostsWithSearch(site, searchQuery, workerUrl) {
		try {
			// GOG-Games doesn't have a search API – skip for search requests
			if (site.type === 'goggames') {
				return { site: site.name, posts: [], error: null };
			}

			// Online-Fix uses an HTML search endpoint.
			if (site.type === 'onlinefix') {
				return await fetchOnlineFixSearchForWorker(site, searchQuery);
			}

			const params = new URLSearchParams( {
				search: searchQuery,
				orderby: 'date',
				order: 'desc'
			});

		// For GameDrive, include categories filter
		if (site.type === 'gamedrive') {
			params.set('categories', '3');
		}

		// Set per_page for all sites EXCEPT freegog (freegog API doesn't handle this param well)
		if (site.type !== 'freegog') {
			const maxPosts = MAX_POSTS_PER_SITE[site.type] || MAX_POSTS_PER_SITE.default;
			params.set('per_page', maxPosts.toString());
		}

		const url = `${site.baseUrl}?${params}`;
			console.log(`Fetching from ${site.name}: ${url}`);

		let response;
		if (site.type === 'steamrip') {
			// Use our helper function to make authenticated requests
			response = await fetchSteamrip(url);
		} else if (site.type === 'skidrow') {
			// Use our helper function to make authenticated requests to SkidrowReloaded
			response = await fetchSkidrow(url);
		} else {
			// Normal fetch for other sites
			response = await fetch(url, {
				headers: {
					'User-Agent': 'Cloudflare-Workers-Search-API/2.0'
				}
			});
		}			if (!response.ok) {
				throw new Error(`${site.name} API returned ${response.status}: ${response.statusText}`);
			}

		const posts = await response.json();
		console.log(`Got ${posts.length} posts from ${site.name}`);

		// Filter posts to only include those that actually match the search query
		// WordPress search sometimes returns irrelevant results
		const filteredPosts = posts.filter(post => {
			const title = (post.title?.rendered || '').toLowerCase();
			const searchLower = searchQuery.toLowerCase();
			
			// Split search query into words
			const searchWords = searchLower.split(/\s+/).filter(w => w.length > 2);
			
			// Check if at least one significant word from search appears in title
			if (searchWords.length === 0) return true; // No filter for very short queries
			
			// For single-word searches, require it to be in the title
			if (searchWords.length === 1) {
				return title.includes(searchWords[0]);
			}
			
			// For multi-word searches, require at least 50% of words to match
			const matchCount = searchWords.filter(word => title.includes(word)).length;
			const matchRatio = matchCount / searchWords.length;
			
			return matchRatio >= 0.5;
		});
		
		console.log(`Filtered to ${filteredPosts.length} relevant posts from ${site.name} (removed ${posts.length - filteredPosts.length} irrelevant)`);

		const transformedPosts = await transformPostsInBatches(filteredPosts, site, true, workerUrl, 8);			return {
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

	// Helper function to process posts in batches to reduce CPU spikes
	async function transformPostsInBatches(posts, site, fetchLinks, workerUrl, batchSize = 10) {
		const results = [];
		for (let i = 0; i < posts.length; i += batchSize) {
			const batch = posts.slice(i, i + batchSize);
			const batchResults = await Promise.all(
				batch.map(async (post) => transformPost(post, site, fetchLinks, workerUrl))
			);
			results.push(...batchResults);
			
			// Small delay between batches to prevent CPU spikes
			if (i + batchSize < posts.length) {
				await new Promise(resolve => setTimeout(resolve, 1));
			}
		}
		return results;
	}

	async function transformPost(post, site, fetchLinks = false, workerUrl = null) {
		const downloadLinks = fetchLinks ? await extractDownloadLinks(post.link, site.type): [];
		
		// Enhanced image extraction - prioritize site-specific fields
		let image = null;
		if (site.type === 'gamedrive') {
			// GameDrive provides featured_image_src and jetpack_featured_media_url
			image = post.featured_image_src || post.jetpack_featured_media_url;
		} else if (site.type === 'steamrip') {
			// SteamRip provides proper Open Graph image data - prioritize this over content extraction
			if (post.yoast_head_json?.og_image && post.yoast_head_json.og_image.length > 0) {
				image = post.yoast_head_json.og_image[0].url;
			}
		} else if (site.type === 'steamunderground') {
			if (post.yoast_head_json?.og_image && post.yoast_head_json.og_image.length > 0) {
				image = post.yoast_head_json.og_image[0].url;
			}
		}
		
		// Fallback to content/excerpt image extraction for all sites
		if (!image) {
			image = extractImageFromContent(post.content?.rendered) || extractImageFromContent(post.excerpt?.rendered);
		}
		
		// For SteamRip and SkidrowReloaded images, create proxied URLs to bypass Cloudflare protection
		if (image && workerUrl) {
			if ((site.type === 'steamrip' && image.includes('steamrip.com')) ||
			    (site.type === 'skidrow' && image.includes('skidrowreloaded.com'))) {
				image = `${workerUrl}/proxy-image?url=${encodeURIComponent(image)}`;
			}
			// ReloadedSteam and SteamUnderground images don't need proxying (no Cloudflare protection)
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

	// ─── Online-Fix.me helpers (worker-local) ───────────────────────────────
	const ONLINE_FIX_BASE = 'https://online-fix.me';

	function decodeWindows1251Worker(buffer, contentType = '') {
		const has1251 = /1251/i.test(contentType || '');
		if (has1251) {
			try {
				return new TextDecoder('windows-1251').decode(buffer);
			} catch {
				// Fallback to UTF-8.
			}
		}
		return new TextDecoder('utf-8').decode(buffer);
	}

	function decodeBasicHtmlEntitiesWorker(text = '') {
		return text
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&#038;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&nbsp;/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function parseOnlineFixLinkWorker(link) {
		const normalized = link.startsWith('http') ? link : `${ONLINE_FIX_BASE}${link}`;
		const m = normalized.match(/\/(\d+)-([^/]+)\.html/i);
		return {
			link: normalized,
			id: m ? m[1] : null,
			slug: m ? m[2] : null
		};
	}

	function extractSearchTermsWorker(query = '') {
		return (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(term => term.length > 0);
	}

	function slugMatchesQueryWorker(slug = '', searchQuery = '') {
		const terms = extractSearchTermsWorker(searchQuery);
		if (terms.length === 0) return true;
		const normalizedSlug = (slug || '').toLowerCase();
		return terms.some(term => normalizedSlug.includes(term));
	}

	function buildOnlineFixPostForWorker({ id, title, link, date, image, description, excerpt }) {
		const parsed = parseOnlineFixLinkWorker(link);
		return {
			id: `onlinefix_${id || parsed.id || parsed.slug || Date.now()}`,
			originalId: id || parsed.id || '',
			title: decodeBasicHtmlEntitiesWorker(title || 'No title'),
			excerpt: decodeBasicHtmlEntitiesWorker(excerpt || description || ''),
			link: parsed.link,
			date: date || null,
			slug: parsed.slug || '',
			description: decodeBasicHtmlEntitiesWorker(description || excerpt || ''),
			categories: [],
			tags: [],
			downloadLinks: [],
			source: 'Online-Fix',
			siteType: 'onlinefix',
			image: image || null
		};
	}

	async function fetchOnlineFixRecentForWorker(site) {
		try {
			const response = await fetch(`${ONLINE_FIX_BASE}/rss.xml`, {
				headers: {
					'User-Agent': 'Cloudflare-Workers-Search-API/2.0',
					'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8'
				}
			});

			if (!response.ok) {
				throw new Error(`Online-Fix RSS returned ${response.status}`);
			}

			const xml = decodeWindows1251Worker(await response.arrayBuffer(), response.headers.get('content-type'));
			const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
			const posts = items.map(match => {
				const item = match[1] || '';
				const title = (item.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
				const link = (item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
				const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
				const descriptionRaw = (item.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '';
				const image = (descriptionRaw.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || null;
				const description = stripHtml(descriptionRaw.replace(/<!\[CDATA\[|\]\]>/g, ''));
				const parsed = parseOnlineFixLinkWorker(link);

				return buildOnlineFixPostForWorker({
					id: parsed.id,
					title,
					link,
					date: pubDate ? new Date(pubDate).toISOString() : null,
					image,
					description,
					excerpt: description
				});
			});

			return { site: site.name, posts, error: null };
		} catch (error) {
			console.error('Error fetching Online-Fix recent:', error);
			return { site: site.name, posts: [], error: error.message };
		}
	}

	async function fetchOnlineFixSearchForWorker(site, searchQuery) {
		try {
			const url = `${ONLINE_FIX_BASE}/index.php?do=search&subaction=search&story=${encodeURIComponent(searchQuery)}`;
			const response = await fetch(url, {
				headers: {
					'User-Agent': 'Cloudflare-Workers-Search-API/2.0',
					'Accept': 'text/html,*/*;q=0.8'
				}
			});

			if (!response.ok) {
				throw new Error(`Online-Fix search returned ${response.status}`);
			}

			const html = decodeWindows1251Worker(await response.arrayBuffer(), response.headers.get('content-type'));
			const cards = html.split(/<div class="news news-search">/i).slice(1);
			const seen = new Set();
			const posts = [];

			for (const card of cards) {
				const link =
					(card.match(/<a class="img" href="(https?:\/\/online-fix\.me\/games\/[^"]+)"/i) || [])[1] ||
					(card.match(/<a class="big-link" href="(https?:\/\/online-fix\.me\/games\/[^"]+)"/i) || [])[1] ||
					'';
				if (!link) continue;
				if (seen.has(link)) continue;
				seen.add(link);

				const title = decodeBasicHtmlEntitiesWorker(((card.match(/<h2 class="title">\s*([\s\S]*?)\s*<\/h2>/i) || [])[1] || '').replace(/<[^>]*>/g, ''));
				const datetime = (card.match(/<time[^>]+datetime="([^"]+)"/i) || [])[1] || null;
				const image =
					(card.match(/<img[^>]+data-src="([^"]+)"/i) || [])[1] ||
					(card.match(/<img[^>]+src="([^"]+)"/i) || [])[1] ||
					null;
				const previewRaw = (card.match(/<div class="preview-text">([\s\S]*?)<\/div>/i) || [])[1] || '';
				const preview = stripHtml(previewRaw);
				const parsed = parseOnlineFixLinkWorker(link);

				if (!slugMatchesQueryWorker(parsed.slug || '', searchQuery)) {
					continue;
				}

				posts.push(buildOnlineFixPostForWorker({
					id: parsed.id,
					title: title || parsed.slug || 'No title',
					link,
					date: datetime,
					image,
					description: preview,
					excerpt: preview
				}));
			}

			return { site: site.name, posts, error: null };
		} catch (error) {
			console.error('Error searching Online-Fix:', error);
			return { site: site.name, posts: [], error: error.message };
		}
	}

	// ─── GOG-Games.to helpers (worker-local) ────────────────────────────────
	const GOG_GAMES_BASE = 'https://gog-games.to';
	const GOG_GAMES_IMAGE_BASE = 'https://images.gog-statics.com';

	async function fetchGogGamesRecentForWorker(site) {
		try {
			const response = await fetch(`${GOG_GAMES_BASE}/api/web/recent-torrents`, {
				headers: { 'User-Agent': 'Cloudflare-Workers-Search-API/2.0', 'Accept': 'application/json' }
			});
			if (!response.ok) {
				throw new Error(`GOG-Games API returned ${response.status}`);
			}
			const items = await response.json();
			console.log(`Got ${items.length} items from GOG-Games`);
			const posts = items.map(item => transformGogGamesPostForWorker(item));
			return { site: site.name, posts, error: null };
		} catch (error) {
			console.error('Error fetching GOG-Games recent:', error);
			return { site: site.name, posts: [], error: error.message };
		}
	}

	function transformGogGamesPostForWorker(item) {
		const torrentUrl = item.torrent_filename
			? `${GOG_GAMES_BASE}/downloads/torrents/${item.torrent_filename}`
			: null;
		const image = item.image
			? `${GOG_GAMES_IMAGE_BASE}/${item.image}.jpg`
			: null;
		const date = item.torrent_date || item.last_update || null;

		const descParts = [];
		if (item.developer) descParts.push(`Developer: ${item.developer}`);
		if (item.publisher) descParts.push(`Publisher: ${item.publisher}`);
		if (item.is_new) descParts.push('New release');
		if (item.is_updated) descParts.push('Updated');
		if (item.is_indev) descParts.push('In development');

		return {
			id: `goggames_${item.id}`,
			originalId: item.id,
			title: item.title || 'No title',
			excerpt: descParts.join(' · ') || '',
			link: `${GOG_GAMES_BASE}/game/${item.slug}`,
			date,
			slug: item.slug,
			description: descParts.join(' · ') || '',
			categories: [],
			tags: [],
			downloadLinks: torrentUrl ? [{ url: torrentUrl, label: 'Torrent', service: 'GOG-Games' }] : [],
			source: 'GOG-Games',
			siteType: 'goggames',
			image
		};
	}

	// Background revalidation functions
	async function revalidateRecentUploadsComplete(cacheKey, workerUrl) {
		const cache = caches.default;
		const freshData = await fetchAllRecentUploads(workerUrl);
		const cacheResponse = new Response(JSON.stringify(freshData), {
			headers: {
				'Content-Type': 'application/json',
				'x-cache-date': Date.now().toString(),
				'Cache-Control': `max-age=${CACHE_CONFIG.STALE_WHILE_REVALIDATE}`
			}
		});
		await cache.put(new Request(`https://cache.internal/${cacheKey}`), cacheResponse);
	}

	async function revalidateSearchComplete(cacheKey, searchQuery, siteParam, workerUrl = null) {
		const cache = caches.default;
		const freshData = await fetchAllSearchResults(searchQuery, siteParam, workerUrl);
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
				// Check if this is a SteamRip or SkidrowReloaded image that needs Cloudflare clearance cookie
				if (imageUrl.includes('steamrip.com')) {
					// Get a valid cookie for SteamRip
					const cookie = await getValidSteamripCookie();
					
					response = await fetch(imageUrl, {
						headers: {
							'User-Agent': 'Cloudflare-Workers-Image-Proxy/2.0',
							'Cookie': `cf_clearance=${cookie.cf_clearance}`,
							'Referer': 'https://steamrip.com/'
						}
					});

					// If the request fails with a 403, try with a fresh cookie
					if (response.status === 403) {
						console.log('Image proxy received 403, trying with fresh SteamRip cookie');
						const freshCookie = await getFreshSteamripCookie();
						
						response = await fetch(imageUrl, {
							headers: {
								'User-Agent': 'Cloudflare-Workers-Image-Proxy/2.0',
								'Cookie': `cf_clearance=${freshCookie.cf_clearance}`,
								'Referer': 'https://steamrip.com/'
							}
						});
					}
				} else if (imageUrl.includes('skidrowreloaded.com')) {
					// Try direct fetch first (no cookie)
					response = await fetch(imageUrl, {
						headers: {
							'User-Agent': 'Cloudflare-Workers-Image-Proxy/2.0',
							'Referer': 'https://www.skidrowreloaded.com/'
						}
					});

					// If direct fetch fails (403/503), try with cf_clearance cookie
					if (response.status === 403 || response.status === 503) {
						console.log('Direct fetch failed for SkidrowReloaded image, trying with cf_clearance cookie');
						const cookie = await getValidSkidrowCookie();
						
						response = await fetch(imageUrl, {
							headers: {
								'User-Agent': 'Cloudflare-Workers-Image-Proxy/2.0',
								'Cookie': `cf_clearance=${cookie.cf_clearance}`,
								'Referer': 'https://www.skidrowreloaded.com/'
							}
						});

						// If the request still fails with a 403, try with a fresh cookie
						if (response.status === 403) {
							console.log('Image proxy received 403, trying with fresh SkidrowReloaded cookie');
							const freshCookie = await getFreshSkidrowCookie();
							
							response = await fetch(imageUrl, {
								headers: {
									'User-Agent': 'Cloudflare-Workers-Image-Proxy/2.0',
									'Cookie': `cf_clearance=${freshCookie.cf_clearance}`,
									'Referer': 'https://www.skidrowreloaded.com/'
								}
							});
						}
					}
				} else {
					// Use regular fetch for other images
					response = await fetch(imageUrl, {
						headers: {
							'Referer': 'https://www.skidrowreloaded.com/',
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
						}
					});
				}

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
			'datavaults.co': 'DataVaults',
			'vikingfile.com': 'VikingFile',
			'akirabox.com': 'AkiraBox',
			'filecrypt.co': 'FileCrypt',
			'megadb.net': 'MegaDB',
			// Additional requested hosters
			'hitfile.net': 'HitFile',
			'ufile.io': 'UFile',
			'clicknupload.site': 'ClicknUpload'
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

	// Function to detect torrent-related URLs
	function isValidTorrentUrl(url) {
		if (url.startsWith('magnet:')) return true;
		if (url.includes('.torrent')) return true;
		
		// Check for known torrent sites
		const torrentSites = [
			'1337x.to',
			'thepiratebay.org',
			'rarbg.to',
			'kickasstorrents.to',
			'torrentgalaxy.to',
			'torrent.cybar.xyz',
			'eztv.re',
			'yts.mx',
			'torrentz2.eu'
		];
		
		try {
			const hostname = new URL(url).hostname.toLowerCase();
			return torrentSites.some(site => hostname.includes(site));
		} catch {
			return torrentSites.some(site => url.includes(site));
		}
	}

	async function fetchWithFlareSolverr(url) {
		const flaresolverrUrl = env.FLARESOLVERR_URL;
		if (!flaresolverrUrl) {
			throw new Error('FLARESOLVERR_URL environment variable is required. Please set it in wrangler.toml or via wrangler secret');
		}
		
		const attempts = parseInt(env.FLARE_RETRIES || DEFAULT_FLARE_RETRIES, 10) || DEFAULT_FLARE_RETRIES;
		const timeoutMs = parseInt(env.FLARE_TIMEOUT_MS || DEFAULT_FLARE_TIMEOUT_MS, 10) || DEFAULT_FLARE_TIMEOUT_MS;

		try {
			const response = await retryableFetch(flaresolverrUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					cmd: 'request.get',
					url: url,
					userAgent: 'Cloudflare-Workers-Search-API/2.0'
				})
			}, attempts, timeoutMs);

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

						// Use the reliable hostname-based service name instead of HTML parsing
						const serviceName = service;

						// Add to our download links list
						downloadLinks.push({
							type: 'hosting',
							service: serviceName,
							url: url,
							text: serviceName // Use service name as display text for consistency
						});
					}

					// Also check for torrent links
					if (url.startsWith('magnet:') || url.includes('.torrent')) {
						const torrentData = classifyTorrentLink(url, linkText);
						if (torrentData && !downloadLinks.some(l => l.url === url)) {
							downloadLinks.push(torrentData);
						}
					}
				}
			} else {
				// Handle site-specific fetching due to Cloudflare protection
				let response;
				if (siteType === 'skidrow') {
					// Use our consolidated function to fetch SkidrowReloaded pages
					response = await fetchSkidrow(postUrl, true);
				} else {
					// Normal fetch for other sites
					response = await fetch(postUrl, {
						headers: {
							'User-Agent': 'Cloudflare-Workers-Link-Extractor/2.0'
						}
					});
				}

				if (!response) {
					console.warn(`Failed to fetch post content from ${postUrl}`);
					return [];
				}

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
				// Updated regex to match crypt.cybar.xyz, crypt.cybar.to, and similar variations
				const cryptRegex = /https?:\/\/crypt\.cybar\.([a-z]{2,})\/(?:link)?\#?([A-Za-z0-9_\-\+\/=]+)/gi;
				let match;
				while ((match = cryptRegex.exec(html)) !== null) {
					const domain = match[1]; // xyz, to, etc.
					const cryptId = match[2];
					const cryptUrl = `https://crypt.cybar.${domain}/link#${cryptId}`;
					if (!downloadLinks.some(l => l.url === cryptUrl)) {
						downloadLinks.push({
							type: 'crypt', service: 'Crypt', url: cryptUrl, text: 'Encrypted Link'
						});
					}
				}					const approvedHosters = [
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
						'hitfile.net',
						'ufile.io',
						'clicknupload.site',
						'1337x.to',
						'datanodes.to',
						'datavaults.co',
						'vikingfile.com',
						'akirabox.com'
					];
					const hosterRegex = new RegExp(`<a[^>]+href=["'](https?://[^"']*(?:${approvedHosters.join('|')})[^"']*)["']`, 'gi');
					while ((match = hosterRegex.exec(html)) !== null) {
						const url = match[1];
						const service = extractServiceName(url);

						// Use reliable hostname-based service name
						const serviceName = service;

						if (!downloadLinks.some(l => l.url === url)) {
							downloadLinks.push({
								type: 'hosting',
								service: serviceName,
								url: url,
								text: serviceName
							});
						}
					}

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
								
								// Only add valid download URLs (exclude source site URLs)
								if (isValidDownloadUrl(url)) {
									const service = extractServiceName(url);

									// Use reliable hostname-based service name
									const serviceName = service;

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
					}

					// Also extract regular links with service names
					const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
					let hrefMatch;
					while ((hrefMatch = hrefRegex.exec(html)) !== null) {
						const url = hrefMatch[1].trim();
						const linkText = stripHtml(hrefMatch[2]).trim();

						if (isValidDownloadUrl(url) && !downloadLinks.some(l => l.url === url)) {
							const service = extractServiceName(url);

							// Use reliable hostname-based service name
							const serviceName = service;

							downloadLinks.push({
								type: 'hosting',
								service: serviceName,
								url: url,
								text: serviceName // Use service name for consistency
							});
						}

						// Also check for torrent links
						if (isValidTorrentUrl(url) && !downloadLinks.some(l => l.url === url)) {
							const torrentData = classifyTorrentLink(url, linkText);
							if (torrentData) {
								downloadLinks.push(torrentData);
							}
						}
					}
				} else if (siteType === 'freegog') {
					// FreeGOG patterns
					const downloadRegex = /<a[^>]*href=["'](https?:\/\/[^"']*(?:mediafire|mega|1fichier|rapidgator|uploaded|turbobit|nitroflare|katfile|pixeldrain|gofile|mixdrop|krakenfiles|filefactory|dailyuploads|multiup|drive\.google|dropbox|onedrive|hitfile|ufile|clicknupload|torrents?)[^"']*?)["'][^>]*>([^<]*)<\/a>/gi;
					let m;
					while ((m = downloadRegex.exec(html)) !== null) {
						const url = m[1];
						const linkText = stripHtml(m[2]).trim();
						const service = extractServiceName(url);

						// Use reliable hostname-based service name
						const serviceName = service;

						if (isValidDownloadUrl(url) && !downloadLinks.some(l => l.url === url)) {
							downloadLinks.push({
								type: 'hosting',
								service: serviceName,
								url: url,
								text: serviceName // Use service name for consistency
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
							const torrentData = classifyTorrentLink(url, linkText);
							if (torrentData) {
								downloadLinks.push(torrentData);
							}
						}
					}

					// FreeGOG download-gen.php links — these are usable download pages
					const freegogGenRegex = /<a[^>]+href=["'](https?:\/\/gdl\.freegogpcgames\.xyz\/[^"']+)["'][^>]*>([^<]*)<\/a>/gi;
					let fb;
					while ((fb = freegogGenRegex.exec(html)) !== null) {
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

						// Use reliable hostname-based service name
						const serviceName = service;

						if (isValidDownloadUrl(url) && !downloadLinks.some(l => l.url === url)) {
							downloadLinks.push({
								type: 'hosting',
								service: serviceName,
								url: url,
								text: serviceName // Use service name for consistency
							});
						}
					}
					} else if (siteType === 'reloadedsteam') {
					// ReloadedSteam uses styled buttons linking to datanodes.to / datavaults.co
					const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
					let m;
					while ((m = hrefRegex.exec(html)) !== null) {
						let url = m[1].trim();
						const linkText = stripHtml(m[2]).trim();

						// Normalize protocol-relative URLs
						if (url.startsWith('//')) {
							url = 'https:' + url;
						}

						// Skip if already in our list
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

						// Also check for torrent links
						if (isValidTorrentUrl(url) && !downloadLinks.some(l => l.url === url)) {
							const torrentData = classifyTorrentLink(url, linkText);
							if (torrentData) {
								downloadLinks.push(torrentData);
							}
						}
					}
				} else if (siteType === 'steamunderground') {
					// SteamUnderground uses styled buttons linking to datanodes.to / akirabox.com
					const hrefRegex2 = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
					let m2;
					while ((m2 = hrefRegex2.exec(html)) !== null) {
						let url = m2[1].trim();
						const linkText = stripHtml(m2[2]).trim();

						// Normalize protocol-relative URLs
						if (url.startsWith('//')) {
							url = 'https:' + url;
						}

						// Skip if already in our list
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

						// Also check for torrent links
						if (isValidTorrentUrl(url) && !downloadLinks.some(l => l.url === url)) {
							const torrentData = classifyTorrentLink(url, linkText);
							if (torrentData) {
								downloadLinks.push(torrentData);
							}
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
					'onedrive.live.com',
					'hitfile.net',
					'ufile.io',
					'clicknupload.site',
					'datanodes.to',
					'datavaults.co',
					'vikingfile.com',
					'akirabox.com'
				];
				const hostingRegex = new RegExp(`<a[^>]+href=["'](https?://[^"']*(?:${hostingServices.join('|')})[^"']*?)["'][^>]*>`, 'gi');
				let hm;
				while ((hm = hostingRegex.exec(html)) !== null) {
					const url = hm[1];
					const service = extractServiceName(url);

					// Use reliable hostname-based service name
					const serviceName = service;

					if (!downloadLinks.some(l => l.url === url)) {
						downloadLinks.push({
							type: 'hosting',
							service: serviceName,
							url: url,
							text: serviceName
						});
					}
				}

				const torrentRegex = /<a[^>]+href=["'](magnet:[^"']*?)["'][^>]*>([^<]*)<\/a>|<a[^>]+href=["'](https?:\/\/[^"']*\.torrent[^"']*?)["'][^>]*>([^<]*)<\/a>/gi;
				let tm;
				while ((tm = torrentRegex.exec(html)) !== null) {
					const url = tm[1] || tm[3];
					const linkText = stripHtml(tm[2] || tm[4]).trim();
					if (url && !downloadLinks.some(l => l.url === url)) {
						const torrentData = classifyTorrentLink(url, linkText);
						if (torrentData) {
							downloadLinks.push(torrentData);
						}
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
			const maxLinks = (siteType === 'gamedrive' || siteType === 'freegog' || siteType === 'reloadedsteam' || siteType === 'steamunderground') ? 20 : 15;
			return downloadLinks.slice(0, maxLinks);

		} catch (err) {
			console.error(`Error extracting download links from ${postUrl}:`, err);
			return [];
		}
	}