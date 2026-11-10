// Player news from several free sources, de-duplicated, with a plain-English title and a factual summary
// for each story written by Claude. Results are cached (30 min per player) so each story is summarized once,
// not every time someone opens a player card.
//
// GET /api/news?name=Wan'Dale%20Robinson&team=TEN&pos=WR
// GET /api/news?probe=1&name=...   -> which sources answered and how many stories matched (no AI)

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.APIKEY1;
const MODEL = process.env.NEWS_MODEL || 'claude-haiku-5-5';
const UA = 'Mozilla/5.0 (compatible; TradeMetric/1.0; +https://www.trademetric.app)';
const ESPN_TEAM = { ARI: 22, ATL: 1, BAL: 33, BUF: 2, CAR: 29, CHI: 3, CIN: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8, GB: 9, HOU: 34, IND: 11, JAX: 30, KC: 12, LV: 13, LAC: 24, LAR: 14, MIA: 15, MIN: 16, NE: 17, NO: 18, NYG: 19, NYJ: 20, PHI: 21, PIT: 23, SF: 25, SEA: 26, TB: 27, TEN: 10, WAS: 28 };

// League-wide feeds are shared by every player, so they are cached in memory for a few minutes.
const SHARED = [
  { src: 'ESPN', kind: 'espn', url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=100' },
  { src: 'CBS Sports', kind: 'rss', url: 'https://www.cbssports.com/rss/headlines/nfl/' },
  { src: 'Yahoo Sports', kind: 'rss', url: 'https://sports.yahoo.com/nfl/rss/' },
  { src: 'ProFootballTalk', kind: 'rss', url: 'https://www.nbcsports.com/profootballtalk.rss' },
  { src: 'RotoBaller', kind: 'rss', url: 'https://www.rotoballer.com/player-news/feed?sport=nfl' },
  { src: 'RotoBaller', kind: 'rss', url: 'https://www.rotoballer.com/category/nfl/feed' },
  { src: 'Pro Football Network', kind: 'rss', url: 'https://www.profootballnetwork.com/feed/' },
  { src: 'The Athletic', kind: 'rss', url: 'https://www.nytimes.com/athletic/rss/nfl/' },
  { src: 'NFL Trade Rumors', kind: 'rss', url: 'https://nfltraderumors.co/feed/' },
];
const FOCUS = {
  inj: '(injury OR injured OR practice OR "ruled out" OR questionable OR doubtful OR status OR return)',
  role: '(snaps OR role OR "depth chart" OR targets OR carries OR workload OR starter OR usage)',
};
const perPlayer = (name, team, focus) => [
  { src: 'Google News', kind: 'rss', url: `https://news.google.com/rss/search?q=${encodeURIComponent(focus ? `"${name}" ${FOCUS[focus]} when:7d` : `"${name}" NFL when:14d`)}&hl=en-US&gl=US&ceid=US:en` },
  ...(ESPN_TEAM[team] ? [{ src: 'ESPN', kind: 'espn', url: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?team=${ESPN_TEAM[team]}&limit=50` }] : []),
];

const mem = new Map();
const inflight = new Map();
function getText(url, ttl) {
  const c = mem.get(url); if (c && Date.now() - c.at < ttl) return Promise.resolve(c.v);
  if (inflight.has(url)) return inflight.get(url);          // many players share one league-wide feed: fetch it once
  const pr = fetchText(url).finally(() => inflight.delete(url));
  inflight.set(url, pr); return pr;
}
async function fetchText(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': url.includes('espn.com') ? 'TradeMetric/1.0' : UA, Accept: url.includes('espn.com') ? 'application/json' : 'application/rss+xml, application/xml, text/xml, */*' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = await r.text(); mem.set(url, { at: Date.now(), v }); return v;
  } finally { clearTimeout(t); }
}

const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;|&rsquo;/g, "'")
  .replace(/&#8216;|&lsquo;/g, "'").replace(/&#822[01];|&[lr]dquo;/g, '"').replace(/&#8211;|&ndash;/g, '-').replace(/&#8212;|&mdash;/g, '-')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1] : ''; };

function parseRSS(xml, src) {
  const out = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0]; let title = decode(tag(it, 'title')); let outlet = decode(tag(it, 'source')) || src;
    if (src === 'Google News') { const k = title.lastIndexOf(' - '); if (k > 20) { outlet = outlet === src ? title.slice(k + 3) : outlet; title = title.slice(0, k); } }
    const rawBody = tag(it, 'content:encoded') + tag(it, 'description');
    const img = (it.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i) || it.match(/<enclosure[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i) || rawBody.match(/<img[^>]*src=["']([^"']+)["']/i) || rawBody.replace(/&lt;/g, '<').replace(/&quot;/g, '"').match(/<img[^>]*src=["']([^"']+)["']/i) || [])[1] || null;
    let desc = decode(tag(it, 'description') || tag(it, 'content:encoded'));
    if (src === 'Google News') desc = '';                       // Google's description just repeats the headline
    title = title.replace(/\s+[-|]\s+(NFL News|Fantasy Football|Fantasy).*$/i, '').trim();
    const link = decode(tag(it, 'link')) || (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
    const at = tag(it, 'pubDate') || tag(it, 'dc:date') || tag(it, 'updated');
    out.push({ title, desc, url: link, at: at ? new Date(decode(at)).toISOString() : null, src, outlet, img: img && /^https?:/.test(img) ? img.replace(/&amp;/g, '&') : null });
  }
  return out;
}
function parseESPN(txt) {
  let j; try { j = JSON.parse(txt); } catch { return []; }
  const raw = j.feed || j.articles || j.news || [];
  return raw.map(a => ({
    title: decode(a.headline || a.title), desc: decode(a.story || a.description || ''), src: 'ESPN', outlet: 'ESPN',
    url: (a.links && ((a.links.web && a.links.web.href) || (a.links.mobile && a.links.mobile.href))) || '',
    at: a.published || a.lastModified || null, img: (a.images && a.images[0] && a.images[0].url) || null, video: a.type === 'Media',
    athletes: (a.categories || []).filter(c => c.type === 'athlete').map(c => c.description || (c.athlete && c.athlete.displayName) || ''),
  }));
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’.]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const words = s => new Set(norm(s).split(' ').filter(w => w.length > 2));
// same story? compare headline words, ignoring the player's own name and filler words
const STOP = new Set(['the', 'and', 'for', 'with', 'his', 'from', 'after', 'week', 'nfl', 'fantasy', 'football', 'game', 'vs']);
function similar(a, b, skip) { const f = s => new Set([...words(s)].filter(w => !skip.has(w) && !STOP.has(w))); const A = f(a), B = f(b); if (A.size < 2 || B.size < 2) return false; let n = 0; A.forEach(w => B.has(w) && n++); return n >= 2 && n / Math.min(A.size, B.size) >= .6; }

function matches(item, name) {
  const full = norm(name); if (!full) return false;
  if ((item.athletes || []).some(x => norm(x) === full)) return true;
  const hay = ' ' + norm(item.title + ' ' + item.desc) + ' ';
  return hay.includes(' ' + full + ' ');
}

const RANK = { ESPN: 0, RotoBaller: 1, ProFootballTalk: 2, 'The Athletic': 2, 'CBS Sports': 2, 'Yahoo Sports': 2, 'NFL Trade Rumors': 2, 'Pro Football Network': 3, 'Google News': 4 };
const FANTASY = /\b(injur|ruled out|out for|questionable|doubtful|practice|limited|ir\b|reserve|return|snap|target|carries|touches|role|depth chart|start|sit|waiver|pick ?up|week \d+|touchdown|td\b|yards|suspend|trade|released|signed|benched|concussion|hamstring|ankle|knee)/i;
const FLUFF = /\b(costume|halloween|podcast|mailbag|power rankings|odds|betting|picks against|mock draft)/i;
const score = i => (Date.parse(i.at || 0) / 864e5) + (i.desc ? 1.2 : 0) + (FANTASY.test(i.title + ' ' + i.desc) ? 1.5 : 0) - (FLUFF.test(i.title) ? 4 : 0) - (RANK[i.src] ?? 4) * .15;

async function collect(name, team, probe, noGoogle, focus, days) {
  const list = [...SHARED.map(s => ({ ...s, ttl: 5 * 60e3 })), ...perPlayer(name, team, focus).filter(s => !noGoogle || s.src !== 'Google News').map(s => ({ ...s, ttl: 20 * 60e3 }))];
  const report = [];
  const got = await Promise.all(list.map(async s => {
    try {
      const txt = await getText(s.url, s.ttl); const items = s.kind === 'espn' ? parseESPN(txt) : parseRSS(txt, s.src);
      const hit = items.filter(i => i.title && matches(i, name));
      report.push({ src: s.src, url: s.url.slice(0, 90), ok: true, items: items.length, matched: hit.length, sample: probe ? items.slice(0, 2).map(i => i.title) : undefined });
      return hit;
    } catch (e) { report.push({ src: s.src, url: s.url.slice(0, 90), ok: false, error: String(e.message || e).slice(0, 80) }); return []; }
  }));
  const cutoff = Date.now() - (days || 21) * 864e5;
  // stories with real text first, so a duplicate keeps the version that has the article text
  const all = got.flat().filter(i => !i.at || Date.parse(i.at) > cutoff).sort((a, b) => (!!b.desc - !!a.desc) || ((RANK[a.src] ?? 5) - (RANK[b.src] ?? 5)));
  const out = [], skip = words(name);
  for (const i of all) {                                   // de-duplicate the same story from different outlets
    const d = out.find(o => similar(o.title, i.title, skip) || o.alts.some(t => similar(t, i.title, skip)));
    if (d) { if (!d.img && i.img) d.img = i.img; if (!d.also.includes(i.outlet) && d.outlet !== i.outlet) d.also.push(i.outlet); if (d.alts.length < 4 && !d.alts.includes(i.title) && i.title !== d.title) d.alts.push(i.title); if (i.at && (!d.at || i.at > d.at)) d.at = i.at; continue; }
    out.push({ ...i, also: [], alts: [] });
  }
  out.sort((a, b) => score(b) - score(a));
  return { items: out.slice(0, focus ? 10 : 7), report };
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

let LAST_ERR = null;
async function summarize(name, team, pos, items) {
  if (!API_KEY || !items.length) return null;
  const list = items.map((x, i) => `[${i}] ${x.outlet}, ${x.at ? x.at.slice(0, 10) : 'date unknown'}\nHeadline: ${x.title}${x.alts.length ? '\nOther outlets\' headlines for the same story: ' + x.alts.join(' | ') : ''}\nText: ${(x.desc || '(headline only)').slice(0, 1200)}`).join('\n\n');
  const prompt = `You write the news section of a fantasy football app. Player: ${name} (${pos}, ${team}).

For each story below, write:
- "title": a plain statement of what happened, under 70 characters, written from the facts (for example "Ruled out Sunday with a hamstring injury" or "Played 82% of snaps in Week 8 win"). No clickbait, no questions, no outlet names.
- "summary": one to three short sentences giving the actual information in the story: what happened, any numbers, injury details and timelines, who is affected and what it means for his role. Use only facts in the headline and text. Never comment on what other outlets did or did not say. If the story only has a headline, write one short sentence and do not add anything the headline does not say.
- "relevant": false if the story is not really about ${name} (he is only mentioned in passing) or has nothing useful for fantasy football (costumes, off-field fluff, general opinion pieces with no new facts); otherwise true.

Reply with only a JSON array like [{"i":0,"title":"...","summary":"...","relevant":true}].

${list}`;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) { LAST_ERR = 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200); return null; }
    const j = await r.json(); const text = (j.content || []).map(c => c.text || '').join('');
    const arr = parseJSON(text); if (!Array.isArray(arr)) LAST_ERR = 'unparsed: ' + text.slice(0, 150) + ' | stop=' + j.stop_reason + ' types=' + (j.content || []).map(c => c.type).join(',') + ' model=' + j.model; return Array.isArray(arr) ? arr : null;
  } catch (e) { LAST_ERR = String(e && e.message || e).slice(0, 150); return null; } finally { clearTimeout(t); }
}

/* What a story is about, for the News tab feed: an injury (status, practice, return) or the player's role
   (snaps, targets, carries, depth chart). Anything else is left out of the feed. */
const INJ_RE = /\b(injur(y|ies|ed)|hurt|ruled out|out (for|vs\.?|against|sunday|monday|thursday|this week|indefinitely|again)|questionable|doubtful|injured reserve|placed on (ir|reserve)|activated|designated (him |for )?(to )?return|return(s|ed|ing)? (to|from) (practice|injury|ir)|did not practice|dnp|limited (in )?practice|limited participant|full participant|practic(e|ed|ing)|game-time decision|week-to-week|day-to-day|setback|mri|surgery|concussion|protocol|hamstring|ankle|knee|groin|calf|quad|shoulder|elbow|wrist|thumb|foot|toe|hip|ribs?|sprain(ed)?|strain(ed)?|torn|tear|fracture[d]?|illness|sidelined|status for|health(y)?)\b/i;
const ROLE_RE = /\b(depth chart|snaps?|snap (share|count)|target share|targets|carries|touches|workload|role|usage|starter|starting|backup|lead back|bell-?cow|committee|split|rb1|wr1|wr2|te1|promoted|benched|demoted|elevated|first-team|reps|opportunit(y|ies)|volume|red zone|rotation|expected to (start|play|see)|featured|pecking order|takes over|step(s)? in|fill(s)? in)\b/i;
/* League news: the moves that change who scores fantasy points. Order matters: a trade story that mentions an
   injury is still a trade. Rumors ("could", "interest in", "would") stay out: only things that happened. */
const MOVE = [
  ['trade', /\b(traded|trade (for|sends|lands|brings)|trades? (him|for)|acquired?s?|acquiring|deal sends|sent to|dealt|in a trade|blockbuster)\b/i],
  ['inj', /\b(season-ending|out for the (season|year)|torn (acl|achilles)|tears? (his )?(acl|achilles)|(places?|placed|placing|puts?|lands?|goes|going) [\w'. -]{0,40}?on (injured reserve|ir)\b|to (injured reserve|ir)\b|out (\d+|several|multiple) (weeks|games)|weeks? to (heal|recover)|ruptured)\b/i],
  ['move', /\b(signs?|signed|signing|re-signs?|released|releases|waived|waives|claimed|claims .* off waivers|cut by|cuts|suspended|suspension|reinstated|activated from|retires?|retirement)\b/i],
  ['role', /\b(names? [\w'. -]{2,40} (the |as )?(starting \w+|starter)|named (the )?starter|new starter|will start|to start (at|for|week)|benched|takes over (as|at)|starting (qb|quarterback|job)|demoted|promoted to|depth chart change)\b/i],
];
const RUMOR = /\b(could|might|would|interest(ed)? in|rumou?rs?|potential|candidates?|should|predict|trade targets?|ideas|deadline (buyers|sellers)|what if|mock)\b/i;
function moveOf(t) { for (const [k, re] of MOVE) if (re.test(t || '')) return k; return null; }
function kindOf(x) {
  const t = x.title || '', d = x.desc || '';
  if (FLUFF.test(t)) return null;
  if (INJ_RE.test(t)) return 'inj';
  if (ROLE_RE.test(t)) return 'role';
  if (INJ_RE.test(d)) return 'inj';
  if (ROLE_RE.test(d)) return 'role';
  return null;
}

/* Recaps for the News tab: the story's biggest takeaway as the title, plus a few key points, so the card is worth
   reading without clicking through. One Claude call per batch of up to 12 stories, cached per story URL. */
const RECAPS = new Map();
async function recapBatch(list) {
  const body = list.map((x, i) => `[${i}] Player: ${x.n} (${x.pos || '?'}, ${x.t || '?'}) · ${x.outlet || 'unknown outlet'}\nHeadline: ${x.title}\nText: ${x.desc || '(headline only)'}`).join('\n\n');
  const prompt = `You write the news feed of a fantasy football app. For each story below, write a recap so a fantasy manager gets the news at face value without opening the article.

- "title": the single biggest takeaway as a plain statement, under 80 characters (for example "Ruled out Sunday with a high ankle sprain; Week 12 return possible" or "Out-snapped Johnson 41-22 and got 9 of 11 red-zone touches"). No clickbait, no questions, no outlet names.
- "points": 1 to 3 short bullet points, each under 95 characters, with the other key facts: numbers, injury details, practice status, timelines, who is affected. The last point may be the fantasy takeaway, but only when it follows directly from the facts given. If the story is only a headline with no text, return just one point or an empty array; never add anything the headline and text do not say.

Use only facts in the headline and text. Reply with only a JSON array like [{"i":0,"title":"...","points":["...","..."]}].

${body}`;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2500, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) { LAST_ERR = 'HTTP ' + r.status; return null; }
    const j = await r.json(); const arr = parseJSON((j.content || []).map(c => c.text || '').join(''));
    return Array.isArray(arr) ? arr : null;
  } catch (e) { LAST_ERR = String(e && e.message || e).slice(0, 150); return null; } finally { clearTimeout(t); }
}
const cleanLine = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
async function recapAll(items) {
  const out = {}, todo = [];
  items.forEach(x => { const c = RECAPS.get(x.u); if (c && Date.now() - c.at < 7 * 864e5) out[x.u] = c.v; else todo.push(x); });
  if (todo.length && API_KEY) {
    const chunks = []; for (let i = 0; i < todo.length; i += 12) chunks.push(todo.slice(i, i + 12));
    await Promise.all(chunks.map(async ch => {
      const arr = await recapBatch(ch); if (!arr) return;
      arr.forEach(a => { const x = a && ch[a.i]; if (!x || !a.title) return;
        const v = { t: cleanLine(a.title, 110), pts: (Array.isArray(a.points) ? a.points : []).map(p => cleanLine(p, 140)).filter(Boolean).slice(0, 3) };
        RECAPS.set(x.u, { at: Date.now(), v }); out[x.u] = v; });
    }));
    if (RECAPS.size > 3000) [...RECAPS.keys()].slice(0, 1000).forEach(k => RECAPS.delete(k));
  }
  return out;
}

const clip = (s, n) => { s = String(s || ''); if (s.length <= n) return s; const c = s.slice(0, n); const k = Math.max(c.lastIndexOf('. '), c.lastIndexOf(' ')); return c.slice(0, k > n * .6 ? k + 1 : n).trim() + '…'; };
const cache = new Map();

export default async function handler(req, res) {
  const q = req.query || {};
  /* recap mode for the News tab: POST {items:[{u,n,pos,t,title,desc,outlet}]} -> {items:{[url]:{t,pts}}} */
  if (req.method === 'POST' && q.recap) {
    if (!API_KEY) return res.status(200).json({ ai: false, items: {} });
    const raw = (req.body && Array.isArray(req.body.items)) ? req.body.items : [];
    const items = raw.slice(0, 30).filter(x => x && typeof x.u === 'string' && /^https?:/.test(x.u) && x.title).map(x => ({
      u: x.u.slice(0, 600), n: cleanLine(x.n, 60), pos: cleanLine(x.pos, 4), t: cleanLine(x.t, 4),
      title: cleanLine(x.title, 220), desc: cleanLine(x.desc, 900), outlet: cleanLine(x.outlet, 60) }));
    const v = await recapAll(items);
    return res.status(200).json({ ai: true, items: v, err: Object.keys(v).length < items.length ? LAST_ERR : undefined });
  }
  const name = String(q.name || '').slice(0, 60), team = String(q.team || '').toUpperCase().slice(0, 4), pos = String(q.pos || '').slice(0, 4);
  /* batch mode for the AI Helper: raw headlines for many players at once, no AI summaries (so no cost).
     GET /api/news?batch=Name|TEAM;Name|TEAM  (first 6 also search Google News) */
  if (q.batch) {
    const list = String(q.batch).split(';').map(x => x.split('|')).filter(x => x[0]).slice(0, 30).map(([n, t]) => [String(n).slice(0, 60), String(t || '').toUpperCase().slice(0, 4)]);
    const out = {};
    await Promise.all(list.map(async ([n, t], i) => {
      try { const { items } = await collect(n, t, false, i >= 6); out[n] = items.slice(0, 3).map(x => ({ title: x.title, desc: clip(x.desc, 300), outlet: x.outlet, at: x.at })); } catch { out[n] = []; }
    }));
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).json({ updated: new Date().toISOString(), items: out });
  }
  /* feed mode for the News tab: injury and role stories for everyone on your rosters, from every outlet above
     plus a Google News search per player (which itself spans dozens of sites). No AI, so no cost.
     GET /api/news?feed=Name|TEAM|POS|i;Name|TEAM|POS;...   (i = currently injured: search injury news for him) */
  if (q.feed) {
    const list = String(q.feed).split(';').map(x => x.split('|')).filter(x => x[0]).slice(0, 40)
      .map(([n, t, p, f]) => ({ n: String(n).slice(0, 60), t: String(t || '').toUpperCase().slice(0, 4), inj: f === 'i' }));
    const key = 'feed:' + list.map(x => norm(x.n) + (x.inj ? '!' : '')).sort().join(',');
    const c = cache.get(key);
    if (c && Date.now() - c.at < 10 * 60e3) { res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600'); return res.status(200).json(c.v); }
    let healthy = 0;
    const per = await Promise.all(list.map(async x => {
      // every injured player gets his own injury search; the first 12 healthy ones get a role search
      const google = x.inj || healthy++ < 12;
      try {
        const { items } = await collect(x.n, x.t, false, !google, x.inj ? 'inj' : 'role', 10);
        return items.map(i => ({ ...i, kind: kindOf(i) })).filter(i => i.kind).slice(0, 5).map(i => ({
          n: x.n, kind: i.kind, title: i.title, desc: clip(i.desc, 700), url: i.url, outlet: i.outlet, also: i.also.slice(0, 3),
          at: i.at, img: i.img || null, video: !!i.video,
        }));
      } catch { return []; }
    }));
    const v = { updated: new Date().toISOString(), items: per.flat() };
    cache.set(key, { at: Date.now(), v });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
    return res.status(200).json(v);
  }
  /* league mode for the News tab's Activity: league-wide moves a fantasy manager cares about (trades, signings,
     releases, season-ending injuries, new starters) from the shared outlets. No AI, no player list: the client
     matches the stories to fantasy-relevant players and decides what to show. GET /api/news?league=1 */
  if (q.league) {
    const c = cache.get('league');
    if (c && Date.now() - c.at < 10 * 60e3) { res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600'); return res.status(200).json(c.v); }
    const got = await Promise.all(SHARED.map(async s => {
      try { const txt = await getText(s.url, 5 * 60e3); return s.kind === 'espn' ? parseESPN(txt) : parseRSS(txt, s.src); } catch { return []; }
    }));
    const cutoff = Date.now() - 7 * 864e5, out = [];
    for (const i of got.flat().sort((a, b) => (!!b.desc - !!a.desc) || ((RANK[a.src] ?? 5) - (RANK[b.src] ?? 5)))) {
      if (!i.title || !i.url || (i.at && Date.parse(i.at) < cutoff) || FLUFF.test(i.title) || RUMOR.test(i.title)) continue;
      const kind = moveOf(i.title) || moveOf(i.desc.slice(0, 260)); if (!kind) continue;
      if (out.some(o => similar(o.title, i.title, new Set()))) continue;
      out.push({ kind, title: i.title, desc: clip(i.desc, 700), url: i.url, outlet: i.outlet, at: i.at, img: i.img || null, athletes: i.athletes || [] });
    }
    out.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
    const v = { updated: new Date().toISOString(), items: out.slice(0, 80) };
    cache.set('league', { at: Date.now(), v });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
    return res.status(200).json(v);
  }
  if (!name) return res.status(400).json({ error: 'Missing name' });
  if (q.probe) {
    const { items, report } = await collect(name, team, true);
    return res.status(200).json({ name, ai: !!API_KEY, model: MODEL, report, items: items.map(i => ({ src: i.src, outlet: i.outlet, title: i.title, desc: (i.desc || '').slice(0, 160), at: i.at, also: i.also })) });
  }
  const key = norm(name) + '|' + team;
  const c = cache.get(key);
  if (c && Date.now() - c.at < 30 * 60e3) { res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600'); return res.status(200).json(c.v); }
  const { items } = await collect(name, team, false);
  const ai = await summarize(name, team, pos, items);
  let out = items.map((x, i) => {
    const a = ai && ai.find(z => z && z.i === i);
    return { title: (a && a.title) || x.title, summary: (a && a.summary) || clip(x.desc, 260), headline: x.title, outlet: x.outlet, also: x.also.slice(0, 3), url: x.url, at: x.at, relevant: a ? a.relevant !== false : true, ai: !!a };
  }).filter(x => x.relevant);
  const v = { name, updated: new Date().toISOString(), ai: !!ai, items: out.slice(0, 4) };
  if (!ai && items.length) { v.aiError = LAST_ERR; }
  cache.set(key, { at: Date.now(), v });
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  return res.status(200).json(v);
}
