// Player feed: game results, highlight videos and news for the current and previous week.
// Everything comes from ESPN's public site API and is the same for every visitor,
// so it is cached at Vercel's edge (the page adds a 5-minute time bucket to the URL).

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const TEAM = { WSH: 'WAS', LA: 'LAR', JAC: 'JAX' };
const fix = t => TEAM[t] || t;

const mem = new Map();
async function cj(url, ttl) {
  const hit = mem.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'TradeMetric/1.0' } });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  const data = await r.json();
  mem.set(url, { at: Date.now(), data });
  return data;
}

const pick = (...xs) => xs.find(x => x != null && x !== '');
function eventsOf(board, week) {
  const evs = (board && (board.events || (board.leagues && board.leagues[0] && board.leagues[0].events))) || [];
  return evs.map(ev => {
    const c = (ev.competitions && ev.competitions[0]) || {};
    const st = (ev.status && ev.status.type) || {};
    const teams = (c.competitors || []).map(x => ({ t: fix(x.team && x.team.abbreviation), score: +x.score || 0, home: x.homeAway === 'home' }));
    return { id: ev.id, week, start: ev.date, state: st.state || 'pre', detail: st.shortDetail || st.detail || '', teams };
  });
}
const names = cats => (cats || []).filter(c => c && (c.type === 'athlete' || c.athleteId || c.athlete))
  .map(c => pick(c.athlete && c.athlete.description, c.description, c.athlete && c.athlete.displayName)).filter(Boolean);
const img = o => pick(o && o.thumbnail, o && o.images && o.images[0] && o.images[0].url, o && o.posterImages && o.posterImages.default && o.posterImages.default.href);

function videoOf(v, ev) {
  const links = v.links || {};
  return {
    id: v.id, ev: ev.id, week: ev.week, teams: ev.teams.map(x => x.t),
    title: v.headline || v.title || '', desc: v.description || '', dur: v.duration || 0,
    thumb: img(v) || null, url: pick(links.web && links.web.href, links.web && links.web.self && links.web.self.href) || null,
    athletes: names(v.categories), at: pick(v.originalPublishDate, v.lastModified, v.published) || null,
  };
}
function articleOf(a) {
  const links = a.links || {};
  return {
    title: a.headline || a.title || '', desc: a.description || a.story || '', at: pick(a.published, a.lastModified) || null,
    url: pick(links.web && links.web.href, links.mobile && links.mobile.href) || null,
    img: img(a) || null, athletes: names(a.categories), type: a.type || null,
  };
}

export default async function handler(req, res) {
  try {
    const state = await cj('https://api.sleeper.app/v1/state/nfl', 10 * 60e3);
    const season = +state.season;
    let week = parseInt((req.query && req.query.week) || state.week, 10);
    if (!(week >= 1 && week <= 18)) week = state.week;
    const weeks = [week, week - 1].filter(w => w >= 1);
    const boards = await Promise.all(weeks.map(w =>
      cj(`${SITE}/scoreboard?seasontype=2&week=${w}&dates=${season}`, w === week ? 2 * 60e3 : 60 * 60e3).catch(() => null)));
    const games = boards.flatMap((b, i) => eventsOf(b, weeks[i]));
    const played = games.filter(g => g.state !== 'pre');
    const sums = await Promise.all(played.map(g =>
      cj(`${SITE}/summary?event=${g.id}`, g.state === 'post' ? 6 * 3600e3 : 2 * 60e3).catch(() => null)));
    const videos = [];
    sums.forEach((s, i) => (s && s.videos || []).forEach(v => videos.push(videoOf(v, played[i]))));

    const [fan, gen] = await Promise.all([
      cj('https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?limit=200', 5 * 60e3).catch(() => null),
      cj(`${SITE}/news?limit=100`, 5 * 60e3).catch(() => null),
    ]);
    const raw = [].concat((fan && (fan.feed || fan.articles || fan.news)) || [], (gen && (gen.articles || gen.feed)) || []);
    const seen = new Set(), news = [];
    for (const a of raw) { const n = articleOf(a); const k = n.title + n.at; if (!n.title || seen.has(k)) continue; seen.add(k); news.push(n); }
    news.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));

    const out = { season, week, updated: new Date().toISOString(), games, videos, news: news.slice(0, 250) };
    if (req.query && req.query.debug) out.debug = {
      fanKeys: fan && Object.keys(fan), genKeys: gen && Object.keys(gen),
      video0: sums.find(s => s && s.videos && s.videos.length)?.videos[0] || null,
      fan0: fan && (fan.feed || fan.articles || [])[0] || null,
    };
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: 'Feed unavailable' });
  }
}
