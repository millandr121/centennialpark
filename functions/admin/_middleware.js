/* HTTP Basic Auth guard for everything under /admin */

export async function onRequest(context) {
  const { request, env, next } = context;

  const pw       = env.ADMIN_PASSWORD || 'changeme';
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
