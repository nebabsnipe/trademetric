// Player news from several free sources, de-duplicated, with a plain-English title and a factual summary
// for each story written by Claude. Results are cached (30 min per player) so each story is summarized once,
// not every time someone opens a player card.
//
// GET /api/news?name=Wan'Dale%20Robinson&team=TEN&pos=WR
// GET /api/news?probe=1&name=...   -> which sources answered and how many stories matched (no AI)

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.APIKEY1;
const MODEL = process.env.NEWS_MODEL || 'claude-haiku-5-5';
const UA = 'Mozilla/5.0 (compatible; TradeMetric/1.0; +https://trademetric-rho.vercel.app)';
const ESPN_TEAM = { ARI: 22, ATL: 1, BAL: 33, BUF: 2, CAR: 29, CHI: 3, CIN: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8, GB: 9, HOU: 34, IND: 11, JAX: 30, KC: 12, LV: 13, LAC: 24, LAR: 14, MIA: 15, MIN: 16, NE: 17, NO: 18, NYG: 19, NYJ: 20, PHI: 21, PIT: 23, SF: 25, SEA: 26, TB: 27, TEN: 10, WAS: 28 };

// League-wide feeds are shared by every player, so they are cached in memory for a few minutes.
const SHARED = [
  { src: 'ESPN', kind: 'espn', url: 'https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?limit=200' },
  { src: 'ESPN', kind: 'espn', url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=100' },
  { src: 'CBS Sports', kind: 'rss', url: 'https://www.cbssports.com/rss/headlines/nfl/' },
  { src: 'Yahoo Sports', kind: 'rss', url: 'https://sports.yahoo.com/nfl/rss/' },
  { src: 'ProFootballTalk', kind: 'rss', url: 'https://www.nbcsports.com/profootballtalk.rss' },
  { src: 'RotoBaller', kind: 'rss', url: 'https://www.rotoballer.com/player-news/feed?sport=nfl' },
  { src: 'CBS Sports', kind: 'rss', url: 'https://www.cbssports.com/rss/headlines/fantasy/football/' },
  { src: 'RotoBaller', kind: 'rss', url: 'https://www.rotoballer.com/category/nfl/feed' },
  { src: 'FantasyPros', kind: 'rss', url: 'https://www.fantasypros.com/nfl/rss/news.xml' },
  { src: 'FantasyPros', kind: 'rss', url: 'https://www.fantasypros.com/rss/nfl/news.xml' },
  { src: 'Pro Football Network', kind: 'rss', url: 'https://www.profootballnetwork.com/feed/' },
  { src: 'Sports Illustrated', kind: 'rss', url: 'https://www.si.com/nfl/rss' },
  { src: 'Bleacher Report', kind: 'rss', url: 'https://bleacherreport.com/articles/feed?tag_id=16' },
  { src: 'The Athletic', kind: 'rss', url: 'https://www.nytimes.com/athletic/rss/nfl/' },
];
const perPlayer = (name, team) => [
  { src: 'Google News', kind: 'rss', url: `https://news.google.com/rss/search?q=${encodeURIComponent(`"${name}" NFL when:14d`)}&hl=en-US&gl=US&ceid=US:en` },
  ...(ESPN_TEAM[team] ? [{ src: 'ESPN', kind: 'espn', url: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?team=${ESPN_TEAM[team]}&limit=50` }] : []),
];

const mem = new Map();
async function getText(url, ttl) {
  const c = mem.get(url); if (c && Date.now() - c.at < ttl) return c.v;
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
    let desc = decode(tag(it, 'description') || tag(it, 'content:encoded'));
    if (src === 'Google News') desc = '';                       // Google's description just repeats the headline
    const link = decode(tag(it, 'link')) || (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
    const at = tag(it, 'pubDate') || tag(it, 'dc:date') || tag(it, 'updated');
    out.push({ title, desc, url: link, at: at ? new Date(decode(at)).toISOString() : null, src, outlet });
  }
  return out;
}
function parseESPN(txt) {
  let j; try { j = JSON.parse(txt); } catch { return []; }
  const raw = j.feed || j.articles || j.news || [];
  return raw.map(a => ({
    title: decode(a.headline || a.title), desc: decode(a.story || a.description || ''), src: 'ESPN', outlet: 'ESPN',
    url: (a.links && ((a.links.web && a.links.web.href) || (a.links.mobile && a.links.mobile.href))) || '',
    at: a.published || a.lastModified || null,
    athletes: (a.categories || []).filter(c => c.type === 'athlete').map(c => c.description || (c.athlete && c.athlete.displayName) || ''),
  }));
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’.]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const words = s => new Set(norm(s).split(' ').filter(w => w.length > 2));
function similar(a, b) { const A = words(a), B = words(b); if (!A.size || !B.size) return false; let n = 0; A.forEach(w => B.has(w) && n++); return n / Math.min(A.size, B.size) >= .7; }

function matches(item, name) {
  const full = norm(name); if (!full) return false;
  if ((item.athletes || []).some(x => norm(x) === full)) return true;
  const hay = ' ' + norm(item.title + ' ' + item.desc) + ' ';
  return hay.includes(' ' + full + ' ');
}

const RANK = { ESPN: 0, RotoBaller: 1, FantasyPros: 1, ProFootballTalk: 2, 'CBS Sports': 2, 'Yahoo Sports': 2, 'Sports Illustrated': 3, 'Google News': 4 };

async function collect(name, team, probe) {
  const list = [...SHARED.map(s => ({ ...s, ttl: 5 * 60e3 })), ...perPlayer(name, team).map(s => ({ ...s, ttl: 20 * 60e3 }))];
  const report = [];
  const got = await Promise.all(list.map(async s => {
    try {
      const txt = await getText(s.url, s.ttl); const items = s.kind === 'espn' ? parseESPN(txt) : parseRSS(txt, s.src);
      const hit = items.filter(i => i.title && matches(i, name));
      report.push({ src: s.src, url: s.url.slice(0, 90), ok: true, items: items.length, matched: hit.length, sample: probe ? items.slice(0, 2).map(i => i.title) : undefined });
      return hit;
    } catch (e) { report.push({ src: s.src, url: s.url.slice(0, 90), ok: false, error: String(e.message || e).slice(0, 80) }); return []; }
  }));
  const cutoff = Date.now() - 21 * 864e5;
  const all = got.flat().filter(i => !i.at || Date.parse(i.at) > cutoff)
    .sort((a, b) => (Date.parse(b.at || 0) - Date.parse(a.at || 0)) || ((RANK[a.src] ?? 5) - (RANK[b.src] ?? 5)));
  const out = [];
  for (const i of all) {                                   // de-duplicate the same story from different outlets
    const d = out.find(o => similar(o.title, i.title));
    if (d) { if (!d.also.includes(i.outlet) && d.outlet !== i.outlet) d.also.push(i.outlet); if (!d.desc && i.desc) { d.desc = i.desc; } continue; }
    out.push({ ...i, also: [] });
  }
  return { items: out.slice(0, 8), report };
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

async function summarize(name, team, pos, items) {
  if (!API_KEY || !items.length) return null;
  const list = items.map((x, i) => `[${i}] ${x.outlet}, ${x.at ? x.at.slice(0, 10) : 'date unknown'}\nHeadline: ${x.title}\nText: ${(x.desc || '(headline only)').slice(0, 1200)}`).join('\n\n');
  const prompt = `You write the news section of a fantasy football app. Player: ${name} (${pos}, ${team}).

For each story below, write:
- "title": a plain statement of what happened, under 70 characters, written from the facts (for example "Ruled out Sunday with a hamstring injury" or "Played 82% of snaps in Week 8 win"). No clickbait, no questions, no outlet names.
- "summary": one to three short sentences giving the actual information in the story: what happened, any numbers, injury details and timelines, who is affected and what it means for his role. Use only facts in the headline and text. If the story only has a headline, write one short sentence and do not add anything the headline does not say.
- "relevant": false if the story is not really about ${name} (for example he is only mentioned in passing), otherwise true.

Reply with only a JSON array like [{"i":0,"title":"...","summary":"...","relevant":true}].

${list}`;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return null;
    const j = await r.json(); const text = (j.content || []).map(c => c.text || '').join('');
    const arr = parseJSON(text); return Array.isArray(arr) ? arr : null;
  } catch { return null; } finally { clearTimeout(t); }
}

const clip = (s, n) => { s = String(s || ''); if (s.length <= n) return s; const c = s.slice(0, n); const k = Math.max(c.lastIndexOf('. '), c.lastIndexOf(' ')); return c.slice(0, k > n * .6 ? k + 1 : n).trim() + '…'; };
const cache = new Map();

export default async function handler(req, res) {
  const q = req.query || {};
  const name = String(q.name || '').slice(0, 60), team = String(q.team || '').toUpperCase().slice(0, 4), pos = String(q.pos || '').slice(0, 4);
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
  const v = { name, updated: new Date().toISOString(), ai: !!ai, items: out.slice(0, 6) };
  cache.set(key, { at: Date.now(), v });
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  return res.status(200).json(v);
}
