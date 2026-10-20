/**
 * Cloudflare Edge Worker for SPETRO Geoportal
 * 
 * 1. Edge Reverse Proxy: Forwards all `/api/*`, `/docs`, and `/openapi.json`
 *    traffic directly to the FastAPI backend (Render or Google Cloud Run).
 * 2. Zero-CORS: Browser makes same-origin requests to /api/ on Cloudflare.
 * 3. Edge Tile Caching: Automatically caches GEE & Native Raster map tiles
 *    for 7 days across Cloudflare's global edge network (330+ datacenters).
 * 4. Static Asset Delivery: Serves Vite React SPA directly via Cloudflare Assets (ASSETS binding).
 * 5. WebSocket Upgrades: Seamlessly proxies WebSocket connections for community chat.
 */

const DEFAULT_BACKEND_ORIGIN = "https://geoportal-api-ygzi.onrender.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- 1. Proxy API, Documentation, and OpenAPI endpoints to Backend ---
    if (path.startsWith("/api/") || path === "/api" || path.startsWith("/docs") || path.startsWith("/openapi.json")) {
      const backendOrigin = (env.BACKEND_ORIGIN || env.CLOUD_RUN_ORIGIN || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, "");
      const targetUrl = new URL(url.pathname + url.search, backendOrigin);

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

      // Prepare forwarded headers
      const headers = new Headers(request.headers);
      headers.set("Host", new URL(backendOrigin).host);
      headers.set("X-Forwarded-Host", url.host);
      headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

      // Forward request to backend
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: headers,
        body: (request.method !== "GET" && request.method !== "HEAD") ? request.body : undefined,
        redirect: "follow",
      });

      // Cache map tiles at Cloudflare Edge for 7 days (604,800s)
      if (isTileRequest && response.status === 200) {
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
        responseHeaders.set("X-CF-Tile-Cache", "MISS");

        const cachedCopy = new Response(response.clone().body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
        ctx.waitUntil(cache.put(request, cachedCopy));

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
      }

      return response;
    }

    // --- 2. Serve Static Frontend Assets from Cloudflare CDN Edge ---
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },

  // --- 3. Automated 24/7 Keep-Alive: Pings backend every 10 min to prevent sleep ---
  async scheduled(controller, env, ctx) {
    const backendOrigin = (env.BACKEND_ORIGIN || env.CLOUD_RUN_ORIGIN || DEFAULT_BACKEND_ORIGIN).replace(/\/$/, "");
    const healthUrl = `${backendOrigin}/api/health`;

    ctx.waitUntil(
      fetch(healthUrl, {
        method: "GET",
        headers: { "User-Agent": "Cloudflare-Edge-KeepAlive/2.0" },
      })
      .then((res) => {
        console.log(`[Keep-Alive] Pinged ${healthUrl} -> Status: ${res.status}`);
      })
      .catch((err) => {
        console.error(`[Keep-Alive] Ping failed:`, err);
      })
    );
  },
};
