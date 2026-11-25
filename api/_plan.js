// Plans: who gets Pro. The one place on the server that decides it.
//
// THE BETA SWITCH is the TM_BETA_PRO setting in Vercel (Settings -> Environment Variables).
//   not set, or anything but "off"  -> the beta is ON: every signed-in account has Pro, and every route below
//                                      answers exactly as it did before plans existed.
//   "off"                           -> the beta is OVER: only accounts whose profiles.plan is 'pro' have Pro.
// Change it in Vercel and redeploy. Nothing in the page decides this; the page asks /api/plan.
//
// profiles.plan (Supabase) is the single record of what someone pays for. People can't write it themselves
// (see supabase/accounts_v2.sql); only the server can.
//
// Files in /api that start with "_" are helpers, not endpoints.

import { createHash } from 'node:crypto';

const SUPA = (process.env.SUPABASE_URL || 'https://rltmfnmgbfgecbaevfvc.supabase.co').replace(/\/+$/, '');
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_AFX79aKgqorAx3zgOyKatw_o_3_ERWG';   // public by design (same one the page uses)
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

export const betaOn = () => !/^(off|0|false|no)$/i.test(String(process.env.TM_BETA_PRO || '').trim());
/* does this plan get Pro right now? (for server jobs that already hold the plan, like the push schedule) */
export const isProPlan = plan => betaOn() || plan === 'pro';

export const tokenOf = req => { const m = /^Bearer\s+(.+)$/i.exec((req.headers && req.headers.authorization) || ''); return m ? m[1].trim() : ''; };

async function getJson(url, headers, ms = 4000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    let data = null; try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: null }; } finally { clearTimeout(t); }
}

/* Who is asking, and what they get. Checked with the person's own sign-in token, so Supabase is what vouches for
   them and its row-level security is what lets them read only their own plan. Remembered for a minute per token.
   -> { signedIn, id, plan, pro, beta, betaUser, error } */
const seen = new Map();
export async function viewerOf(req, { fresh = false } = {}) {
  const beta = betaOn(), token = tokenOf(req);
  const out = { signedIn: false, id: null, plan: null, pro: false, beta, betaUser: false };
  if (!token) return out;
  const key = createHash('sha1').update(token).digest('hex'), hit = seen.get(key);
  if (!fresh && hit && Date.now() - hit.at < 60e3) return { ...hit.v, beta, pro: beta || hit.v.plan === 'pro' };
  const h = { apikey: PUB, authorization: 'Bearer ' + token };
  const u = await getJson(`${SUPA}/auth/v1/user`, h);
  if (!u.ok || !u.data || !u.data.id) return u.status === 0 || u.status >= 500 ? { ...out, error: true } : out;   // not a real sign-in
  const id = u.data.id, f = encodeURIComponent(id);
  const [p, b] = await Promise.all([
    getJson(`${SUPA}/rest/v1/profiles?id=eq.${f}&select=plan`, h),
    getJson(`${SUPA}/rest/v1/beta_users?user_id=eq.${f}&select=user_id`, h),
  ]);
  if (!p.ok) return { ...out, signedIn: true, id, pro: beta, error: !beta };   // can't read the plan: during the beta it doesn't matter
  const plan = (Array.isArray(p.data) && p.data[0] && p.data[0].plan) || 'free';
  const v = { signedIn: true, id, plan, pro: beta || plan === 'pro', beta, betaUser: Array.isArray(b.data) && b.data.length > 0 };
  if (seen.size > 500) seen.clear();
  seen.set(key, { at: Date.now(), v });
  return v;
}

/* Once the beta is over, a Pro answer must never be kept by the shared cache and handed to someone else. */
function keepPrivate(res) {
  const set = res.setHeader.bind(res);
  res.setHeader = (k, v) => set(k, String(k).toLowerCase() === 'cache-control'
    ? (/no-store/.test(String(v)) ? v : 'private, max-age=' + ((/(?:^|[\s,])max-age=(\d+)/.exec(String(v)) || [])[1] || 0))
    : v);
  set('Vary', 'Authorization');
}

/* Use at the top of any route that returns Pro data:  if (!(await requirePro(req, res))) return;
   During the beta it lets everything through untouched (same answers, same caching as before). After it,
   signed-out callers get 401 and free accounts get 403, and no data. */
export async function requirePro(req, res) {
  if (betaOn()) return true;
  keepPrivate(res);
  const v = await viewerOf(req);
  if (v.pro) return true;
  res.setHeader('Cache-Control', 'no-store');
  if (v.error) res.status(503).json({ error: 'plan_unavailable', message: 'Couldn\'t check your plan. Try again in a moment.' });
  else if (!v.signedIn) res.status(401).json({ error: 'signed_out', message: 'Sign in to use this.' });
  else res.status(403).json({ error: 'pro_required', message: 'This is part of TradeMetric Pro.' });
  return false;
}
/* Wraps a whole route. `when(req)` says which requests need Pro (default: all of them). */
export const proOnly = (handler, when) => async (req, res) => {
  if ((!when || when(req)) && !(await requirePro(req, res))) return;
  return handler(req, res);
};

/* Marks an account as having been here during the beta (the beta_users table, supabase/plans.sql), so those
   accounts can be given a deal later. Needs the server's secret key; without it (previews) nothing is written. */
async function markBetaUser(id) {
  if (!SECRET) return false;
  try {
    const headers = { apikey: SECRET, 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=minimal' };
    if (!SECRET.startsWith('sb_')) headers.authorization = 'Bearer ' + SECRET;
    const r = await fetch(`${SUPA}/rest/v1/beta_users?on_conflict=user_id`, { method: 'POST', headers, body: JSON.stringify({ user_id: id }) });
    return r.ok;
  } catch { return false; }
}

/* GET /api/plan: what the page asks to learn whether the beta is on and what this person gets. */
export async function planRoute(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const v = await viewerOf(req, { fresh: true });
  if (v.error) return res.status(503).json({ error: 'plan_unavailable' });
  if (v.beta && v.signedIn && !v.betaUser) v.betaUser = await markBetaUser(v.id);
  return res.status(200).json({ beta: v.beta, signedIn: v.signedIn, plan: v.signedIn ? v.plan : null, pro: v.pro, betaUser: v.betaUser });
}
