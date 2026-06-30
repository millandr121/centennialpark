/* Root middleware — runs on every request to the site.

   wrangler.toml serves the whole repo root (directory = "."), which would
   otherwise expose internal files by URL (schema*.sql, SETUP.md, CLAUDE.md,
   wrangler.toml, package.json, the test/ and db/ folders). The _headers file
   only adds `noindex`; it does NOT block fetching. This blocks fetching.

   Everything else passes straight through to the normal asset/Function handler. */

const BLOCKED = [
  /\.sql$/i,
  /\.toml$/i,
  /\.md$/i,
  /^\/db\//i,
  /^\/test\//i,
  /^\/\.github\//i,
  /^\/functions\//i,   // server source (Pages compiles these — never serve raw)
  /^\/workers\//i,     // digest worker source
  /(^|\/)package(-lock)?\.json$/i,
];

export async function onRequest(context) {
  const { request, next } = context;
  const path = new URL(request.url).pathname;

  if (BLOCKED.some((re) => re.test(path))) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }
    });
  }

  return next();
}
