/**
 * Cloudflare Edge Worker for SPETRO Geoportal
 * 
 * Functions:
 * 1. Unified Reverse Proxy: Eliminates CORS completely.
 * 2. Routes `/api/*` to Google Cloud Run container.
 * 3. Routes `/*` to GitHub Pages static frontend.
 * 4. Edge Caching: Caches GEE & Native Raster map tiles for 7 days at Cloudflare's edge,
 *    reducing GEE quota consumption and accelerating map zoom/pan speeds.
 * 5. WebSocket Forwarding: Seamlessly upgrades community chat WS connections.
 */

// Replace these two URLs with your actual deployed targets:
const CLOUD_RUN_ORIGIN = "https://geoportal-backend-REPLACE_WITH_YOUR_ID.a.run.app";
const GITHUB_PAGES_ORIGIN = "https://p001x.github.io/portalproject";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- 1. Route API & Tile Requests to Google Cloud Run ---
    if (path.startsWith("/api/") || path.startsWith("/docs") || path.startsWith("/openapi.json")) {
      const targetUrl = new URL(url.pathname + url.search, env.CLOUD_RUN_ORIGIN || CLOUD_RUN_ORIGIN);
      
      // Preserve original request headers (auth, cookies, content-type)
      const headers = new Headers(request.headers);
      headers.set("X-Forwarded-Host", url.host);
      headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
      headers.set("Host", targetUrl.host);

      // Handle WebSocket upgrades (for Community chat)
      if (request.headers.get("Upgrade") === "websocket") {
        return fetch(targetUrl.toString(), {
          headers: request.headers,
        });
      }

      // Check if this is a raster map tile (GEE or Native COG)
      const isTileRequest = path.includes("/gee/tile/") || path.includes("/native/imagery/tiles/");

      // Check Cloudflare Edge Cache for tiles
      const cache = caches.default;
      if (isTileRequest && request.method === "GET") {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          const respHeaders = new Headers(cachedResponse.headers);
          respHeaders.set("X-CF-Tile-Cache", "HIT");
          return new Response(cachedResponse.body, {
            status: cachedResponse.status,
            statusText: cachedResponse.statusText,
            headers: respHeaders,
          });
        }
      }

      // Fetch from Cloud Run
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        redirect: "follow",
      });

      const responseHeaders = new Headers(response.headers);
      
      // Cache map tiles at Cloudflare Edge for 7 days (604,800s)
      if (isTileRequest && response.status === 200) {
        responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
        responseHeaders.set("X-CF-Tile-Cache", "MISS");

        const cachedCopy = new Response(response.clone().body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
        ctx.waitUntil(cache.put(request, cachedCopy));
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // --- 2. Route All Static Frontend Traffic to GitHub Pages ---
    const ghUrl = new URL(url.pathname + url.search, env.GITHUB_PAGES_ORIGIN || GITHUB_PAGES_ORIGIN);
    const ghHeaders = new Headers(request.headers);
    ghHeaders.set("Host", ghUrl.host);

    const ghResponse = await fetch(ghUrl.toString(), {
      method: request.method,
      headers: ghHeaders,
    });

    // If GitHub Pages returns 404 on an SPA sub-route, serve the root index.html
    if (ghResponse.status === 404 && !path.includes(".")) {
      const fallbackUrl = new URL("/", env.GITHUB_PAGES_ORIGIN || GITHUB_PAGES_ORIGIN);
      return fetch(fallbackUrl.toString(), { headers: ghHeaders });
    }

    return ghResponse;
  },
};
