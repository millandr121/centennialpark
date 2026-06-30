/* HTTP Basic Auth guard for everything under /admin */

export async function onRequest(context) {
  const { request, env, next } = context;

  const pw = env.ADMIN_PASSWORD;
  /* Fail CLOSED: if the password isn't configured, lock the panel rather than
     fall back to a guessable default. A misconfigured env var must never expose
     guest PII, financial controls, or the DB-wipe endpoint. */
  if (!pw) {
    return new Response('Admin panel is not configured (ADMIN_PASSWORD is unset). Set it in the Cloudflare dashboard.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const expected = 'Basic ' + btoa('admin:' + pw);
  const actual   = request.headers.get('Authorization') || '';

  if (actual !== expected) {
    return new Response('Park Admin — login required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Park Admin", charset="UTF-8"' }
    });
  }

  /* CSRF defense for state-changing requests. HTTP Basic Auth is "ambient" —
     a browser re-sends the cached credentials on cross-site requests too, so a
     malicious page could POST to /admin/api/cleanup (DB wipe) without a token.
     We require the Origin (or Referer) host to match the request host on every
     mutating method. Same-origin admin-panel calls always send a matching
     Origin; cross-site forgeries do not. */
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const here   = new URL(request.url).host;
    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    let sourceHost = '';
    try { if (origin)  sourceHost = new URL(origin).host; }
    catch (_) { /* malformed */ }
    if (!sourceHost && referer) {
      try { sourceHost = new URL(referer).host; } catch (_) { /* malformed */ }
    }
    if (sourceHost !== here) {
      return new Response('Cross-origin request blocked.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  return next();
}
