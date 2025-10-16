# Recent Fixes - SteamRip & FreeGOG Issues

## Date: October 16, 2025

### Issues Fixed

#### 1. SteamRip 403 Errors (Even with FlareSolverr Cookie)
**Problem:** FlareSolverr was successfully getting cookies, but requests to SteamRip API were still returning 403.

**Root Cause:** 
- Only sending `cf_clearance` cookie instead of ALL cookies from FlareSolverr
- Not using the same User-Agent that FlareSolverr used
- Missing important headers (Referer, Origin, Accept, etc.)

**Fix:**
- Store ALL cookies from FlareSolverr response (not just cf_clearance)
- Store and reuse the exact User-Agent that FlareSolverr used
- Added proper headers: Referer, Origin, Accept, Accept-Language
- Apply same fix to both initial request and retry after 403

**Files Changed:**
- `lib/helpers.js`: Updated `steamripCookie` structure to store all cookies and userAgent
- `lib/helpers.js`: Updated `getFreshSteamripCookie()` to extract all cookies
- `lib/helpers.js`: Updated `fetchSteamrip()` to use all cookies and proper headers

#### 2. FreeGOG TypeError
**Problem:** `TypeError: (html || "").replace is not a function`

**Root Cause:** 
- WordPress API sometimes returns objects (with `.rendered` property) instead of strings
- `stripHtml()` function was expecting a string but received an object

**Fix:**
- Updated `stripHtml()` to handle:
  - Objects with `.rendered` property
  - Non-string values (return empty string)
  - Proper type checking before calling `.replace()`

**Files Changed:**
- `lib/helpers.js`: Enhanced `stripHtml()` function with type checking

#### 3. Skidrow Cookie Management (Preventive Fix)
Applied the same fixes to Skidrow cookie management to prevent similar issues.

**Files Changed:**
- `lib/helpers.js`: Updated `skidrowCookie` structure
- `lib/helpers.js`: Updated `getFreshSkidrowCookie()` 
- `lib/helpers.js`: Updated `fetchSkidrow()` with proper headers

### Testing Instructions

1. **Test SteamRip Search:**
   ```bash
   curl "https://your-vercel-url.vercel.app/?search=balatro&site=steamrip"
   ```

2. **Test FreeGOG Recent:**
   ```bash
   curl "https://your-vercel-url.vercel.app/recent"
   ```

3. **Check Logs:**
   - Should see: "Total cookies from FlareSolverr: X" (where X > 1)
   - Should NOT see: "403 (even with fresh cookie)"
   - Should NOT see: "TypeError: (html || "").replace is not a function"

### Environment Variables (Optional Tuning)

If you still experience issues, you can increase timeouts:

```bash
# Vercel
vercel env add FLARE_TIMEOUT_MS
# Value: 60000

vercel env add FLARE_RETRIES
# Value: 3

# Then redeploy
vercel --prod
```

### Technical Details

**Cookie Structure Before:**
```javascript
{
  cf_clearance: "abc123...",
  expires_at: 1234567890
}
```

**Cookie Structure After:**
```javascript
{
  cf_clearance: "abc123...",
  cookies: ["cf_clearance=abc123...", "__cf_bm=xyz...", "other=cookie"],
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  expires_at: 1234567890
}
```

**Headers Before:**
```javascript
{
  'User-Agent': 'GameSearch-API-v2/2.0',
  'Cookie': 'cf_clearance=abc123...'
}
```

**Headers After:**
```javascript
{
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...', // From FlareSolverr
  'Cookie': 'cf_clearance=abc123...; __cf_bm=xyz...; other=cookie', // All cookies
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://steamrip.com/',
  'Origin': 'https://steamrip.com'
}
```

### Why This Works

Cloudflare protection checks:
1. ✅ cf_clearance cookie validity
2. ✅ ALL cookies match (not just cf_clearance)
3. ✅ User-Agent matches the one used to get cookies
4. ✅ Proper Referer and Origin headers
5. ✅ Browser-like Accept headers

By matching ALL of these, we appear as a legitimate browser that just solved the Cloudflare challenge.
