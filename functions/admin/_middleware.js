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

  return next();
}
