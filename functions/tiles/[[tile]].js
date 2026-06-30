/* Cached map-tile proxy.  ──────────────────────────────────────────────────
   Without this, every visitor's browser pulls map tiles straight from the
   provider (CARTO / OSM). Under a traffic spike that's tens of thousands of
   direct hits, which providers throttle or block.

   This proxies tiles through our own origin and caches each one at the
   Cloudflare edge (Cache API), so the upstream provider is hit only a handful
   of times per tile — ever — no matter how many visitors load the maps. Tiles
   are immutable, so we can cache them hard.

   Route: /tiles/<z>/<x>/<y>.png  (Leaflet template: /tiles/{z}/{x}/{y}.png)
   The map layer falls back to the provider directly if this ever fails, so a
   proxy hiccup degrades gracefully instead of breaking the map. */

const UPSTREAM = 'https://basemaps.cartocdn.com/rastertiles/voyager';

// Strict z/x/y.png — refuse anything that isn't a tile path so the proxy can't
// be turned into an open relay to arbitrary upstream URLs.
const TILE_RE = /^\d{1,2}\/\d{1,7}\/\d{1,7}(@2x)?\.png$/;

export async function onRequestGet(context) {
  const { request, params, waitUntil } = context;

  const tile = Array.isArray(params.tile) ? params.tile.join('/') : String(params.tile || '');
  if (!TILE_RE.test(tile)) {
    return new Response('Not a tile', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}/${tile}`, {
      headers: {
        'Accept': 'image/png,image/*',
        'User-Agent': 'CentennialParkTileProxy/1.0 (+https://bamfieldparks.com)'
      },
      // Let Cloudflare also cache the upstream fetch independently of our Cache API copy.
      cf: { cacheEverything: true, cacheTtl: 2592000 }
    });
  } catch (e) {
    return new Response('Tile fetch failed', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!upstream.ok) {
    // Don't cache provider errors — let Leaflet's tileerror fallback kick in.
    return new Response('Tile unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  const resp = new Response(upstream.body, upstream);
  resp.headers.set('Cache-Control', 'public, max-age=604800, s-maxage=2592000, immutable');
  resp.headers.set('Content-Type', 'image/png');
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.delete('set-cookie');

  waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}
