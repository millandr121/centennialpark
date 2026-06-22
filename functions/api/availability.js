/* GET /api/availability?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD[&type=campsite|moorage|all] */

export async function onRequestGet(context) {
  const { env, request } = context;
  const url      = new URL(request.url);
  const checkIn  = url.searchParams.get('checkin')  || '';
  const checkOut = url.searchParams.get('checkout') || '';
  const type     = url.searchParams.get('type')     || 'all';

  if (!checkIn || !checkOut) return err('checkin and checkout are required', 400);
  if (checkIn >= checkOut)   return err('checkout must be after checkin', 400);
  if (!env.DB)               return err('Booking system unavailable', 503);

  const typeFilter = type === 'all'
    ? 'SELECT id,name,type,description,max_people,max_length,notes FROM sites WHERE active=1'
    : 'SELECT id,name,type,description,max_people,max_length,notes FROM sites WHERE active=1 AND type=?';

  const sitesRes = await env.DB.prepare(typeFilter)
    .bind(...(type === 'all' ? [] : [type])).all();
  const sites = sitesRes.results || [];

  /* Conflict: existing check_in < requested checkout AND existing check_out+1day > requested checkin */
  const bookedRes = await env.DB.prepare(
    `SELECT DISTINCT site_id FROM reservations
     WHERE status='confirmed'
       AND check_in < ?
       AND date(check_out,'+1 day') > ?`
  ).bind(checkOut, checkIn).all();

  const booked = new Set((bookedRes.results || []).map(r => r.site_id));

  return json({
    checkin:   checkIn,
    checkout:  checkOut,
    available: sites.filter(s => !booked.has(s.id)),
    booked:    sites.filter(s =>  booked.has(s.id))
  });
}

function json(obj, s) {
  return new Response(JSON.stringify(obj), {
    status: s || 200,
    headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
  });
}
function err(msg, s) { return json({ error: msg }, s); }
