// Player feed: game results, highlight videos and news for the current and previous week.
// Videos: ESPN's game clips (tagged with the players in them) plus the NFL's and 32 teams' official YouTube channels.
// The page keeps only clips of a specific player's plays.
// Game results and news headlines come from ESPN's public site API. Everything is the same for every visitor,
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
    id: String(v.id), src: 'espn', ev: ev.id, week: ev.week, teams: ev.teams.map(x => x.t),
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

/* ---- YouTube: the NFL's and each team's official channel ----
   Channel IDs live in data/yt_channels.json (found by scripts/yt_channels.py in the daily job).
   Without a key each channel's public RSS feed gives its latest 15 uploads.
   With YOUTUBE_API_KEY set in Vercel each channel gives its latest 50 (1 quota unit per channel per refresh). */
const NFL_CHANNEL = 'UCDVYQ4Zhbm3S2dlz7P1GBDg';
const NICKS = { ARI:'Cardinals',ATL:'Falcons',BAL:'Ravens',BUF:'Bills',CAR:'Panthers',CHI:'Bears',CIN:'Bengals',CLE:'Browns',DAL:'Cowboys',DEN:'Broncos',DET:'Lions',GB:'Packers',HOU:'Texans',IND:'Colts',JAX:'Jaguars',KC:'Chiefs',LV:'Raiders',LAC:'Chargers',LAR:'Rams',MIA:'Dolphins',MIN:'Vikings',NE:'Patriots',NO:'Saints',NYG:'Giants',NYJ:'Jets',PHI:'Eagles',PIT:'Steelers',SF:'49ers',SEA:'Seahawks',TB:'Buccaneers',TEN:'Titans',WAS:'Commanders' };
const teamsIn = t => Object.entries(NICKS).filter(([, n]) => new RegExp('\\b' + n + '\\b', 'i').test(t)).map(([k]) => k);
const unxml = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function channelList(host) {
  try { const j = await cj(`https://${host}/data/yt_channels.json`, 6 * 3600e3); if (j && j.NFL) return j; } catch {}
  return { NFL: NFL_CHANNEL };
}
async function channelUploads(cid) {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const j = await cj(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=UU${cid.slice(2)}&key=${key}`, 30 * 60e3);
    return (j.items || []).map(it => { const s = it.snippet || {}; return { id: s.resourceId && s.resourceId.videoId, title: s.title, desc: s.description || '', at: s.publishedAt }; }).filter(v => v.id);
  }
  const k = 'rss:' + cid, hit = mem.get(k);
  if (hit && Date.now() - hit.at < 15 * 60e3) return hit.data;
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`, { headers: { 'User-Agent': 'TradeMetric/1.0' } });
  if (!r.ok) throw new Error('yt rss ' + r.status);
  const xml = await r.text(), out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1], g = re => (e.match(re) || [])[1];
    const id = g(/<yt:videoId>([^<]+)</);
    if (id) out.push({ id, title: unxml(g(/<title>([^<]*)</)), desc: unxml(g(/<media:description>([\s\S]*?)<\/media:description>/)), at: g(/<published>([^<]+)</) });
  }
  mem.set(k, { at: Date.now(), data: out });
  return out;
}
async function ytUploads(host) {
  const chans = await channelList(host);
  const lists = await Promise.all(Object.entries(chans).filter(([, c]) => c).map(([team, c]) =>
    channelUploads(c).then(vs => vs.map(v => ({ ...v, chTeam: team === 'NFL' ? null : team, ch: team }))).catch(() => [])));
  return lists.flat();
}
function ytVideo(v, week, games) {
  const wk = +((v.title.match(/week\s*(\d{1,2})/i) || [])[1]) || null;
  const curStart = Math.min(...games.filter(g => g.week === week).map(g => Date.parse(g.start)).filter(Boolean));
  const w = wk || (Date.parse(v.at) >= curStart - 864e5 ? week : week - 1);
  const teams = [...new Set([...(v.chTeam ? [v.chTeam] : []), ...teamsIn(v.title)])];
  return { id: 'yt:' + v.id, src: 'youtube', yt: v.id, ch: v.ch || 'NFL', ev: null, week: w, teams, title: v.title, desc: (v.desc || '').slice(0, 300), dur: 0,
    thumb: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`, url: `https://www.youtube.com/watch?v=${v.id}`, athletes: [], at: v.at };
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
    const yt = await ytUploads(req.headers && req.headers.host || 'trademetric.app').catch(() => []);
    yt.forEach(v => { const x = ytVideo(v, week, games); if (x.week >= week - 1 && x.week <= week) videos.push(x); });

    const [fan, gen] = await Promise.all([
      cj('https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?limit=200', 5 * 60e3).catch(() => null),
      cj(`${SITE}/news?limit=100`, 5 * 60e3).catch(() => null),
    ]);
    const raw = [].concat((fan && (fan.feed || fan.articles || fan.news)) || [], (gen && (gen.articles || gen.feed)) || []);
    const seen = new Set(), news = [];
    for (const a of raw) { const n = articleOf(a); const k = n.title + n.at; if (!n.title || seen.has(k)) continue; seen.add(k); news.push(n); }
    news.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));

    const vseen = new Set(), uniq = videos.filter(v => { v.id = String(v.id); if (vseen.has(v.id)) return false; vseen.add(v.id); return true; });
    const out = { season, week, updated: new Date().toISOString(), games, videos: uniq, news: news.slice(0, 250) };
    if (req.query && req.query.debug) out.debug = {
      fanKeys: fan && Object.keys(fan), genKeys: gen && Object.keys(gen),
      fan0: fan && (fan.feed || fan.articles || [])[0] || null, yt: yt.length, ytKey: !!process.env.YOUTUBE_API_KEY,
    };
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: 'Feed unavailable' });
  }
}
