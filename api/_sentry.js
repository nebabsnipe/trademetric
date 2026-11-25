// Error reporting for the server functions in /api (Sentry). Each route's default export is wrapped with
// withSentry(handler, 'name'), so the handlers themselves are unchanged.
//
// What gets reported, tagged with the route, environment (production / preview) and commit:
//   1. A route that crashes (throws). The visitor gets the same error as before.
//   2. A route that answers 500 or more without any outside feed failing: most likely our own bug.
//   3. An outside data feed that fails (the league platforms, play-by-play, clips, injuries, market values,
//      the AI service, news outlets, our database): its own issue, "Feed failed: <feed> <status>", so
//      "their feed is down" is easy to tell apart from "our bug". Each feed + status is reported at most once
//      every 10 minutes per server instance, so a feed that is down all game day doesn't flood the inbox.
// Not reported (expected): wrong or expired ESPN private-league codes and unknown leagues (401/403/404 on
// /api/espn), the AI not being set up on previews, and anything on a local machine (`vercel dev`).
//
// Sentry's code is only loaded when there is something to report, so normal requests pay nothing for it.
// The DSN is public by design (it only lets you send reports). No secret is needed.
// Files in /api that start with "_" are helpers, not endpoints.

import { AsyncLocalStorage } from 'node:async_hooks';

const DSN = process.env.SENTRY_DSN || 'https://1576ac15d5510fadbe24991ccf8dcba2@o4512492752535552.ingest.us.sentry.io/4512492764397568';
const ENV = process.env.VERCEL_ENV || '';                                // 'production' | 'preview' | 'development'
const ON = !!DSN && (ENV === 'production' || ENV === 'preview') && process.env.SENTRY_DISABLED !== '1';
const SHA = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);

/* the outside services each route reads, by host; anything else is labelled by its host */
const FEEDS = [
  [/(^|\.)sleeper\.(app|com)$/, 'sleeper'],
  [/^lm-api-reads\.fantasy\.espn\.com$/, 'espn-fantasy'],
  [/^site\.api\.espn\.com$/, 'espn-site'],
  [/(^|\.)espn\.com$/, 'espn'],
  [/(^|\.)youtube\.com$|^www\.googleapis\.com$/, 'youtube'],
  [/(^|\.)fantasycalc\.com$/, 'market-values'],
  [/^api\.anthropic\.com$/, 'ai'],
  [/\.supabase\.co$/, 'database'],
  [/^api\.resend\.com$/, 'email-service'],
  [/^api\.stripe\.com$/, 'stripe'],
];
const feedOf = host => { for (const [re, name] of FEEDS) if (re.test(host)) return name; return host; };

/* expected answers that are not failures */
const SELF = /(^|\.)trademetric\.app$|\.vercel\.app$/;
const EXPECTED = (route, feed, status, host, path = '') =>
  (SELF.test(host) && (status === 401 || status === 403)) ||          // our own site behind preview password protection

  (route === 'espn' && feed === 'espn-fantasy' && (status === 401 || status === 403 || status === 404)) ||
  (feed === 'database' && status === 409) ||
  (feed === 'database' && (status === 401 || status === 403) && path === '/auth/v1/user') ||   // a stale or made-up sign-in token asking for Pro data
  (feed === 'database' && status === 404 && path === '/rest/v1/beta_users');                  // supabase/plans.sql not run yet                              // "already saved": the shared store uses this on purpose

const als = new AsyncLocalStorage();
let Sentry = null, loading = null;
async function sdk() {
  if (Sentry) return Sentry;
  if (!loading) loading = import('@sentry/node').then(S => {
    S.init({
      dsn: DSN,
      environment: ENV,
      release: SHA ? 'trademetric-api@' + SHA : undefined,
      dataCollection: { userInfo: false, httpBodies: [], httpHeaders: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user', 'cookie', 'authorization'] }, cookies: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] }, urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user', 'apikey', 'token'] } },   // no IP addresses or other personal data
      defaultIntegrations: false,                                      // only what we report by hand
      beforeSend(ev) { if (ev.request) { delete ev.request.cookies; delete ev.request.headers; delete ev.request.data; } ev.user = { ip_address: null }; return ev; },
    });
    return (Sentry = S);
  }).catch(() => (loading = null));
  return loading;
}

/* ---- watch outgoing requests made while a route runs ---- */
const realFetch = globalThis.fetch;
if (realFetch && !realFetch.__tm) {
  const watched = async function (input, init) {
    const ctx = als.getStore();
    if (!ctx) return realFetch(input, init);
    let url = '';
    try { url = String((input && input.url) || input); } catch {}
    try {
      const r = await realFetch(input, init);
      if (!r.ok) note(ctx, url, r.status);
      return r;
    } catch (e) {
      note(ctx, url, e && (e.name === 'AbortError' || e.name === 'TimeoutError') ? 'timeout' : 'unreachable', e);
      throw e;
    }
  };
  watched.__tm = true;
  globalThis.fetch = watched;
}
function note(ctx, url, status, err) {
  try {
    const u = new URL(url), feed = feedOf(u.hostname);
    if (EXPECTED(ctx.route, feed, status, u.hostname, u.pathname)) return;
    // the path with numbers and long ids taken out, so league ids and the like never leave the server
    const path = u.pathname.replace(/\/\d+(?=\/|$)/g, '/:n').replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:id').slice(0, 120);
    ctx.feeds.push({ feed, status: String(status), path, err: err ? String(err.message || err).slice(0, 200) : undefined });
  } catch {}
}

const lastSent = new Map();                 // feed|status -> time, so a feed that is down is reported every 10 minutes at most
const due = key => { const t = lastSent.get(key) || 0; if (Date.now() - t < 10 * 60e3) return false; lastSent.set(key, Date.now()); return true; };

async function report(ctx, res, thrown) {
  if (!ON) return;
  const failed = res && res.statusCode >= 500 && !(ctx.body && ctx.body.code === 'not_configured');
  const feeds = ctx.feeds.filter(f => due(f.feed + '|' + f.status));
  if (!thrown && !feeds.length && !(failed && !ctx.feeds.length)) return;
  const S = await sdk();
  if (!S) return;
  const base = { route: '/api/' + ctx.route, build: SHA || 'unknown' };
  for (const f of feeds) {
    S.captureEvent({
      message: `Feed failed: ${f.feed} ${f.status}`, level: 'warning',
      fingerprint: ['upstream-feed', f.feed, f.status],
      tags: { ...base, kind: 'upstream', upstream: f.feed, upstream_status: f.status },
      contexts: { feed: { path: f.path, error: f.err, route_status: res && res.statusCode } },
    });
  }
  if (thrown) {
    S.withScope(sc => {
      sc.setTags({ ...base, kind: 'crash' });
      sc.setContext('request', { method: ctx.method, query: ctx.query });
      S.captureException(thrown);
    });
  } else if (failed && !ctx.feeds.length && due('route|' + ctx.route + '|' + res.statusCode)) {
    // the route caught its own error and answered 5xx with no outside feed failing: most likely our bug
    const b = ctx.body && typeof ctx.body === 'object' ? ctx.body : {};
    S.captureEvent({
      message: `/api/${ctx.route} answered ${res.statusCode}: ${String(b.detail || b.error || 'no details').slice(0, 160)}`, level: 'error',
      fingerprint: ['route-failed', ctx.route, String(res.statusCode)],
      tags: { ...base, kind: 'route_error', status: String(res.statusCode) },
      contexts: { response: { error: b.error, code: b.code, detail: b.detail } },
    });
  }
  await S.flush(2000).catch(() => {});
}

export function withSentry(handler, route) {
  if (!ON) return handler;
  return async function wrapped(req, res) {
    const q = req.query || {};
    const ctx = { route, method: req.method, query: Object.keys(q).join(','), feeds: [], body: undefined };
    // hold the reply back only when there is something to send, so the report goes out before the function can be frozen
    const json = res.json && res.json.bind(res), end = res.end.bind(res);
    if (json) res.json = b => { ctx.body = b; return json(b); };
    res.end = (...a) => {
      // after a crash the crash itself is the report; the platform's own error reply must not count again
      const needs = !ctx.thrown && (ctx.feeds.length || (res.statusCode >= 500 && res.statusCode < 600));
      if (!needs || ctx.ended) return end(...a);
      ctx.ended = true;
      report(ctx, res).catch(() => {}).finally(() => end(...a));
      return res;
    };
    try {
      return await als.run(ctx, () => handler(req, res));
    } catch (e) {
      ctx.thrown = true;
      await report(ctx, null, e).catch(() => {});
      throw e;
    }
  };
}

/* A one-off report from inside a route that isn't wrapped (api/email.js answers in the web-standard style):
   a failed email send, or a crash. Same rules: only on the real site and previews, never personal data. */
export async function reportIssue(message, { level = 'error', route = '', tags = {}, extra, error } = {}) {
  if (!ON) return;
  if (!error && !due('issue|' + message)) return;
  const S = await sdk();
  if (!S) return;
  const base = { route: '/api/' + route, build: SHA || 'unknown', ...tags };
  if (error) S.withScope(sc => { sc.setTags({ ...base, kind: 'crash' }); S.captureException(error); });
  else S.captureEvent({ message, level, fingerprint: [message], tags: base, contexts: extra ? { details: extra } : undefined });
  await S.flush(2000).catch(() => {});
}
