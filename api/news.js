// Player news from several free sources, de-duplicated, with a plain-English title and a factual summary
// for each story written by Claude. Results are cached (30 min per player) so each story is summarized once,
// not every time someone opens a player card.
//
// GET /api/news?name=Wan'Dale%20Robinson&team=TEN&pos=WR
// GET /api/news?probe=1&name=...   -> which sources answered and how many stories matched (no AI)

import { sharedOn, recapsGet, recapsPut, archiveMerge } from './_shared.js';
import { withSentry } from './_sentry.js';
import { proOnly } from './_plan.js';

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
  trade: '(traded OR trade OR acquire OR acquired OR acquires OR deal)',
  /* offseason outlook (api/take.js): how the team talks about his role, and moves at his position */
  outlook: '(role OR usage OR workload OR touches OR targets OR starter OR "depth chart" OR coach OR signs OR signed OR drafted OR extension OR trade)',
};
const perPlayer = (name, team, focus) => [
  { src: 'Google News', kind: 'rss', url: `https://news.google.com/rss/search?q=${encodeURIComponent(focus ? `"${name}" ${FOCUS[focus]} when:${focus === 'outlook' ? '30d' : '7d'}` : `"${name}" NFL when:14d`)}&hl=en-US&gl=US&ceid=US:en` },
  ...(ESPN_TEAM[team] ? [{ src: 'ESPN', kind: 'espn', url: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?team=${ESPN_TEAM[team]}&limit=50` }] : []),
];

/* Subscriber-only outlets. These stories get no link (the reader can't open them): the card's own title and points
   carry the news, and only the important ones are kept (trades, signings and releases, real injury news, new starters). */
const PAY_OUTLET = /^(the athletic|espn\+|new york times|the new york times|nytimes|wall street journal|the wall street journal|wsj|washington post|the washington post|boston globe|the boston globe|los angeles times|la times|bloomberg|financial times|san francisco chronicle|sf chronicle|houston chronicle|dallas morning news|the dallas morning news|star tribune|philadelphia inquirer|the philadelphia inquirer|seattle times|the seattle times|denver post|the denver post|chicago tribune|baltimore sun|the baltimore sun|baltimore banner|the baltimore banner|pittsburgh post-gazette|buffalo news|the buffalo news|newsday|tampa bay times|the boston herald|boston herald|sports business journal|footballguys|pff\+|the information)$/i;
const PAY_HOST = /(^|\.)(theathletic\.com|wsj\.com|washingtonpost\.com|bostonglobe\.com|latimes\.com|bloomberg\.com|ft\.com|sfchronicle\.com|houstonchronicle\.com|dallasnews\.com|startribune\.com|inquirer\.com|seattletimes\.com|denverpost\.com|chicagotribune\.com|baltimoresun\.com|thebaltimorebanner\.com|post-gazette\.com|buffalonews\.com|newsday\.com|tampabay\.com|bostonherald\.com|sportsbusinessjournal\.com|footballguys\.com)$/i;
function payOf(i) {
  if (i.pay) return true;
  if (PAY_OUTLET.test(String(i.outlet || '').trim())) return true;
  let h = ''; try { const u = new URL(i.url); h = u.hostname.replace(/^www\./, ''); if (h === 'nytimes.com') return true; if (u.pathname.includes('/insider/')) return true; } catch { }
  return PAY_HOST.test(h);
}
/* worth a subscriber-only card: a move, or injury news with a real status in it (not a role or usage piece) */
const BIG_INJ = /\b(ruled out|out (for|vs\.?|against|sunday|monday|thursday|this week|indefinitely)|doubtful|injured reserve|placed on (ir|reserve)|to ir\b|activated|designated (him |for )?(to )?return|surgery|torn|tear|fracture[d]?|ruptured|season-ending|week-to-week|weeks? to (heal|recover)|out (\d+|several|multiple) (weeks|games)|concussion protocol|mri|setback|will (not )?play|expected to (play|return)|game-time decision)\b/i;
function payWorth(i) { const t = (i.title || '') + ' ' + String(i.desc || '').slice(0, 300); return !RUMOR.test(i.title || '') && !!(moveOf(t) || BIG_INJ.test(t)); }

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
    const o = { title, desc, url: link, at: at ? new Date(decode(at)).toISOString() : null, src, outlet, img: img && /^https?:/.test(img) ? img.replace(/&amp;/g, '&') : null };
    o.pay = payOf(o); out.push(o);
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
    pay: !!(a.premium || a.isPremium),
  })).map(o => (o.pay = payOf(o), o));
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
  const all = got.flat().filter(i => (!i.at || Date.parse(i.at) > cutoff) && (!i.pay || payWorth(i))).sort((a, b) => (!!a.pay - !!b.pay) || (!!b.desc - !!a.desc) || ((RANK[a.src] ?? 5) - (RANK[b.src] ?? 5)));
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
  const list = items.map((x, i) => `[${i}] ${x.outlet}, ${x.at ? x.at.slice(0, 10) : 'date unknown'}${x.pay ? ' · SUBSCRIBER-ONLY' : ''}\nHeadline: ${x.title}${x.alts.length ? '\nOther outlets\' headlines for the same story: ' + x.alts.join(' | ') : ''}\nText: ${(x.desc || '(headline only)').slice(0, 1200)}`).join('\n\n');
  const prompt = `You write the news section of a fantasy football app. Player: ${name} (${pos}, ${team}).

For each story below, write:
- "title": a plain statement of what happened, under 70 characters, written from the facts (for example "Ruled out Sunday with a hamstring injury" or "Played 82% of snaps in Week 8 win"). No clickbait, no questions, no outlet names.
- "summary": one to three short sentences giving the actual information in the story: what happened, any numbers, injury details and timelines, who is affected and what it means for his role. Use only facts in the headline and text. Never comment on what other outlets did or did not say. If the story only has a headline, write one short sentence and do not add anything the headline does not say.
- A story marked SUBSCRIBER-ONLY gets no link, so its title and summary must carry all of the news in it on their own (still using only the facts given).
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
/* trade cards: the story has to say it happened, in so many words */
const TR_WORD = /\b(traded|dealt|acquired?|acquires|acquiring)\b/i;
const TR_RUMOR = /\b(could|might|would|may|interest(ed)?\s+in|potential(ly)?|talks?|rumou?rs?|considering|exploring|shopping|candidates?|trade targets?|speculat\w*|eyeing|linked)\b/i;
function moveOf(t) { for (const [k, re] of MOVE) if (re.test(t || '')) return k; return null; }
/* Offseason News: the moves that change fantasy value between seasons. Order matters: a coach who retires is a
   coach change, a re-signing is a contract, and a trade story that mentions an injury is still a trade. */
const COACH = '(head coach|offensive coordinator|oc|play-?caller)';
const OFF_MOVE = [
  ['coach', new RegExp(`\\b(hire[sd]?|hiring|to hire|fire[sd]?|firing|dismiss(es|ed)?|part(s|ed)? ways with|promot(e|es|ed|ing)|finaliz\\w* (a )?deal with|agree(s|d)? to terms with)\\b[^.]{0,70}\\b${COACH}\\b|\\b${COACH}\\b[^.]{0,40}\\b(fired|hired|dismissed|let go|steps? down|stepping down|resigns?|resigned|retires?|retiring|leaves|leaving)\\b|\\bnam(e|es|ed|ing) [\\w'. -]{2,40}?(as )?((its|their|the|new) )*${COACH}\\b`, 'i')],
  ['retire', /\b(retires?|retired|retiring|retirement|calls? it a career|hangs? (it|them|up)( up)?)\b/i],
  ['susp', /\b(suspended|suspension|suspends|banned for)\b/i],
  ['trade', MOVE[0][1]],
  ['contract', /\b(re-signs?|re-signed|re-signing|extension|extends|extended|restructur\w*|franchise tag\w*|transition tag\w*|tags?|tagged|fifth-year option|holdout|holds out|holding out)\b/i],
  ['release', /\b(release|released|releases|releasing|waived|waives|waiving|cut by|cuts|parts? ways with|parted ways with)\b/i],
  ['sign', /\b(signs?|signed|signing|agrees? to (terms|a deal|a contract)|agreed to (terms|a deal)|lands with|joins|claimed off waivers|claims [\w'. -]{2,40} off waivers)\b/i],
  ['inj', /\b(season-ending|out for the (season|year)|torn (acl|achilles)|tears? (his )?(acl|achilles)|ruptured|(place|placed|places|lands|goes|put|puts) [\w'. -]{0,40}?on (injured reserve|ir)\b|undergoes? surgery|surgery on)\b/i],
];
/* offseason rumor words the in-season list doesn't catch: talk about moves that haven't happened */
const OFF_RUMOR = /\b(expected to|likely to|eyeing|eyes|linked to|in talks|considering|meeting with|meets with|visit(s|ing|ed)? with|top targets?|plans to|hopes to|wants to|open to|landing spots?|projections?|predictions?|winners and losers|best available|should)\b/i;
function offKindOf(t) { for (const [k, re] of OFF_MOVE) if (re.test(t || '')) return k; return null; }
const TEAM_NICK = { ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers', HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs', LV: 'Raiders', LAC: 'Chargers', LAR: 'Rams', MIA: 'Dolphins', MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants', NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SF: '49ers', SEA: 'Seahawks', TB: 'Buccaneers', TEN: 'Titans', WAS: 'Commanders' };
/* NFL teams a headline names, in the order it names them */
function teamsIn(t) { const s = String(t || ''); return Object.entries(TEAM_NICK).map(([k, n]) => [k, s.search(new RegExp('\\b' + n + '\\b', 'i'))]).filter(x => x[1] >= 0).sort((a, b) => a[1] - b[1]).map(x => x[0]); }
/* A story that is only about a celebration (a backflip, a dance) tells a fantasy manager nothing, so it stays out.
   Only for stories labeled game, team or news: an injury, ejection or fine that happened on a celebration is real news. */
const CELEB = /\b(backflip\w*|celebrat(es?|ed|ions?|ing|ory)|(touchdown|td|end zone|sack) dance|dance moves|griddy|somersault\w*|cartwheel\w*)\b/i;
const celebOnly = (kind, title) => (kind === 'game' || kind === 'team' || kind === 'news') && CELEB.test(title || '');
/* LGKIND-START  The label for a league story that isn't a trade, an injury or a depth-chart change.
   This block is kept word for word the same in api/news.js and js/news.js (scripts/test-news-kind.mjs checks it).
   "move" (Roster move) only when the move happens to the named player, with the move word next to his name in the
   headline or the first sentence: signed, released, waived, claimed, cut, placed on IR, activated, reinstated, retired,
   or suspended for a set number of games. A move by someone else in the story, an old suspension, a possible one, or a
   figure of speech ("retire the celebration", "released a statement") doesn't count. Otherwise: "disc" (ejected, fined,
   suspension under review), "game" (what he did in a game), "team" (quotes, coach and team-outlook stories), or "news". */
function lgKind(title, desc, names, at) {
  const low = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nz = s => (' ' + low(s) + ' ').replace(/['’`]/g, '').replace(/\b([a-z])\.(?=[\sa-z]|$)/g, '$1').replace(/\b(jr|sr|st|vs|no)\./g, '$1')
    .replace(/[.!?;:]+(?=\s|$)|\s[-–—]+\s|[–—]/g, ' | ').replace(/,/g, ' , ').replace(/[^a-z0-9|,]+/g, ' ').replace(/\s+/g, ' ').trim();
  const d = String(desc || ''), fm = /^[\s\S]{20,}?[a-z0-9)"’'%]{2}[.!?]["’']?(?=\s+[A-Z"“]|\s*$)/.exec(d), first = (fm ? fm[0] : d).slice(0, 320);
  const S = nz(title) + ' | ' + nz(first);
  const yr = new Date(at && !isNaN(Date.parse(at)) ? at : Date.now()).getFullYear();
  const nm = [];
  (names || []).forEach(n => { const w = nz(n).replace(/[^a-z0-9 ]/g, '').replace(/ (jr|sr|ii|iii|iv)$/, '').trim().split(' ').filter(Boolean);
    if (w.length) { nm.push(w.join(' ')); if (w.length > 1 && w[w.length - 1].length > 2) nm.push(w[w.length - 1]); } });
  const NM = nm.length ? '(?:' + nm.join('|') + ')' : '[a-z]+', SUF = '(?: (?:jr|sr|ii|iii|iv))?';
  const AUX = '(?:(?:has|had|have|was|were|is|are|will|be|been|being|gets|got|to|officially|reportedly|now|also|just|expected|set) ){0,4}';
  const FILL = '(?:(?:the|veteran|former|pro|bowl|all|star|rookie|backup|starting|starter|wr|rb|qb|te|k|fb|wide|receiver|wideout|running|back|quarterback|tight|end|kicker|free|agent|their|his|standout|injured|struggling|embattled|longtime|second|third|fourth|year|[a-z0-9]+ time|ex [a-z0-9]+|cardinals|falcons|ravens|bills|panthers|bears|bengals|browns|cowboys|broncos|lions|packers|texans|colts|jaguars|chiefs|raiders|chargers|rams|dolphins|vikings|patriots|saints|giants|jets|eagles|steelers|49ers|niners|seahawks|buccaneers|bucs|titans|commanders) ){0,5}';
  const NUM = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|multiple|several)';
  const LEN = '(?:' + NUM + ' (?:[a-z]+ )?(?:games?|weeks?)|indefinitely|(?:rest|remainder) of|for the (?:season|year))';
  const NOBJ = '(?! (?:(?:a|an|his|the|new|this|that|its|their) )?(?:[a-z]+ )?(?:statement|video|apology|footage|photos?|report|details|song|album|book|trailer|schedule|list|chart|rankings?|autographs?|jerseys?|footballs?)\\b)';
  const SIGNQ = '(?= (?:[a-z0-9]+ ){0,5}?(?:with|by|deal|contract|extension|year|squad|roster|tender|offer)\\b)';
  const WAS = '(?:was|were|been|being|be|gets|got|is|are) (?:officially |reportedly |being |now )?';
  const plain = [
    '\\b' + NM + SUF + ' ' + AUX + '(?:(?:re )?sign(?:s|ed|ing)?' + SIGNQ + '|released' + NOBJ + '|waived|claimed(?= (?:off|by)\\b)|cut(?= by\\b)|activated|reinstated|placed on (?:ir|injured reserve|reserve|the [a-z ]{0,24}list)|retir(?:e|es|ed|ing)(?= (?:\\||from|after|at|following|as)\\b|$)|announc(?:es|ed) (?:his )?retirement)',
    '\\b' + NM + SUF + ' ' + AUX + WAS + '(?:cut|claimed|signed|released' + NOBJ + '|waived)\\b',
    '\\b(?:(?:re )?sign(?:s|ed|ing)?|releas(?:e|es|ed|ing)|waiv(?:e|es|ed|ing)|cut(?:s|ting)?|claim(?:s|ed|ing)?|activat(?:e|es|ed|ing)|reinstat(?:e|es|ed|ing)|add(?:s|ed|ing)?|part(?:s|ed|ing)? ways with|mov(?:e|es|ed|ing) on from) ' + FILL + NM + '\\b',
    '\\bplac(?:e|es|ed|ing) ' + FILL + NM + SUF + ' (?:[a-z]+ ){0,2}?on (?:ir|injured reserve|reserve|the )',
  ];
  const susp = [
    '\\b' + NM + SUF + ' ' + AUX + 'suspended (?:[a-z0-9]+ ){0,5}?' + LEN,
    '\\bsuspend(?:s|ed|ing)? ' + FILL + NM + SUF + ' (?:[a-z0-9]+ ){0,5}?' + LEN,
    '\\b' + NM + SUF + ' (?:[a-z]+ ){0,5}?' + NUM + ' game (?:suspension|ban)\\b',
    '\\b' + NUM + ' game (?:suspension|ban) (?:for|to) ' + FILL + NM + '\\b',
  ];
  const old = t => /\b(last (season|year|spring|summer|offseason|month)|years? ago|previously|back in)\b/.test(t) || (t.match(/\b20\d\d\b/g) || []).some(y => +y < yr);
  const unsure = t => /\b(could|may|might|possible|possibly|potential|faces?|facing|risks?|whether|if)\b/.test(t);
  const hit = (list, bad) => list.some(src => { const re = new RegExp(src, 'g'); let m;
    while ((m = re.exec(S))) { const a = S.lastIndexOf('|', m.index) + 1, b = S.indexOf('|', m.index + m[0].length), seg = S.slice(a, b < 0 ? S.length : b);
      if (!bad(seg)) return true; if (!m[0].length) re.lastIndex++; }
    return false; });
  if (hit(plain, old) || hit(susp, t => old(t) || unsure(t))) return 'move';
  const D1 = /\b(ejected|ejection|disqualified|fined|fine of|unsportsmanlike|arrested|charged with|disciplin\w+|league review|under review)\b|\$[\d,.]+k? fine/;
  const D2 = /\bsuspen(d|ds|ded|sion|sions)\b/;
  const QUOTE = /\b(says?|said|told|tells|explains?|admits?|address(es|ed)?|reacts?|responds?|insists?|believes?|voices?|confidence|confident|comments?|complain\w*|blasts?|criticiz\w+)\b/;
  const GAME = /\b(touchdowns?|tds?|yards?|yds|catch(es)?|caught|receptions?|carries|rush(ed|es|ing)|threw|throws?|scor(ed|es|ing)|interceptions?|sacks?|fumbles?|stat line|backflip\w*|celebrat\w+|hurdl\w+|highlights?|wins?|won|loss|lost|loses|beats?|victory|defeat(ed|s)?|overtime|comeback|game-winn\w+|walk-off|blowout|\d{1,2}-\d{1,2})\b/;
  const TEAM = /\b(says?|said|told|tells|explains?|believes?|thinks?|confident|expects?|admits?|address(es|ed)?|press conference|presser|reporters|coach(es|ing)?|coordinator|gm|general manager|front office|owner|locker room|outlook|plans?|future|comments?|reacts?|responds?|insists?|praises?|defends?|interview|offense)\b/;
  const tl = low(title), fl = tl + ' ' + low(first);
  const disc = t => D1.test(t) || (D2.test(t) && !old(nz(t)));
  if (disc(tl)) return 'disc';
  if (QUOTE.test(tl)) return 'team';
  if (GAME.test(tl)) return 'game';
  if (TEAM.test(tl)) return 'team';
  if (disc(fl)) return 'disc';
  if (GAME.test(fl)) return 'game';
  if (TEAM.test(fl)) return 'team';
  return 'news';
}
/* LGKIND-END */
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
  const body = list.map((x, i) => `[${i}] Player: ${x.n} (${x.pos || '?'}, ${x.t || '?'}) · ${x.outlet || 'unknown outlet'}${x.f === 'trade' ? ' · TRADE' + (x.from && x.to ? ` (${x.from} to ${x.to})` : '') : ''}${x.pay ? ' · SUBSCRIBER-ONLY' : ''}${x.ctx ? `\nWhat we know about him (recent games newest first, then his situation): ${x.ctx}` : ''}\nHeadline: ${x.title}\nText: ${x.desc || '(headline only)'}`).join('\n\n');
  const prompt = `You write the news feed of a fantasy football app. For each story below, write a recap so a fantasy manager gets the news at face value without opening the article.

- "title": the single biggest takeaway for the named player as a plain statement, under 85 characters. It must start with the player's name (full name, or last name if the full title would run long) and say what is happening to him, even when the original headline is about someone else, a team or a coach (for example "Achane ruled out Sunday with a high ankle sprain; Week 12 return possible" or "Jeanty out-snapped Mitchell 41-22 and got 9 of 11 red-zone touches" or "Pittman traded from the Colts to the Steelers for a 2027 3rd"). When a story is marked as a trade, the title says who he was traded from and to, and the points cover what was sent back and how his role changes. No clickbait, no questions, no outlet names.
- "kind": what the story is for the named player, one of:
  "move": the news is that THIS player was signed, released, waived, claimed, cut, placed on or activated from a reserve list, reinstated, retired, or suspended for a set number of games. Not when the move happens to a different player in the story, not for a past suspension or release that is only background, not for a possible or pending suspension, and not for a figure of speech (such as retiring a celebration).
  "discipline": he was ejected, fined, or faces a suspension that is under review or not decided.
  "game": what he did in a game: a big play, a celebration, a stat line, a win or loss.
  "team": a coach, quarterback or team-outlook story, quotes, a press conference.
  "trade", "injury" or "role" (depth chart, snaps, usage) when that is what the story is.
  "news": none of the above.
- "fluff": true only when the story is just color with nothing a fantasy manager needs to know: a celebration (a backflip, a dance), a gesture, an outfit, a fan or social-media reaction, and nothing new about his health, role, playing time, discipline, contract or team. An injury, ejection or fine that happened during a celebration is real news, not fluff. Otherwise false.
- "points": 1 to 3 short bullet points, each under 95 characters, with the other key facts: numbers, injury details, practice status, timelines, who is affected. The last point may be the fantasy takeaway, but only when it follows directly from the facts given. If the story is only a headline, or has very little text, still write 2 or 3 points that describe what is going on, like a beat writer explaining it to a reader: what the headline is saying and WHY it is happening (his role and spot on the depth chart, snap share changes, teammates who are hurt or out, a trade or move, practice status), and what it means for him next (his next opponent and how tough that defense is). Write these as plain explanation, not a stat list. When the headline makes a claim about how he is playing (he is becoming a starter, breaking out, heating up, slumping, losing work), say in words how he has been trending and back it up with numbers that show the progression from earlier games to his latest ones (for example "Ward has found a rhythm: after topping 200 passing yards once in his first five starts, he threw for 304 and 231 with 4 TDs in his last two"). Otherwise use only the one or two numbers that best support a point. Never write that there are no details, that it is headline only, or that information is unavailable. Word each one for that player and story; don't reuse a stock phrase. Never add facts that the headline, the text or what we know about him do not give.

A story marked SUBSCRIBER-ONLY can't be opened by the reader (it's behind a paywall), so its title and points are all they get: put every key fact from the headline and text into them, and give 2 or 3 points whenever the text has that much.

Use only facts in the headline and text. Reply with only a JSON array like [{"i":0,"title":"...","kind":"...","fluff":false,"points":["...","..."]}].

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
/* v4: recaps also carry the story's kind (the card label), so everything written before is redone once */
const rk = x => (x.pay ? 'v5p|' : 'v5|') + x.u;   /* v5: plus a fluff flag */
/* old recaps that said "headline only / no details" instead of describing the story: written again */
const RC_EMPTY = /\b(headline only|no (supporting |further |additional |other )?(details?|information|text|context)|details? (are |were )?(not |un)available)\b/i;
const rcBad = v => !v || !v.t || (v.pts || []).some(p => RC_EMPTY.test(p));
const RC_KIND = { move: 'move', discipline: 'disc', disc: 'disc', game: 'game', team: 'team', news: 'news', trade: 'trade', injury: 'inj', inj: 'inj', role: 'role' };
async function recapAll(items) {
  const out = {}, todo = [];
  items.forEach(x => { const c = RECAPS.get(rk(x)); if (c && Date.now() - c.at < 7 * 864e5 && !rcBad(c.v)) out[x.u] = c.v; else todo.push(x); });
  /* a story someone else already had recapped: read it from the shared store instead of paying to write it again */
  if (todo.length && sharedOn()) {
    const got = await recapsGet(todo.map(rk));
    for (let i = todo.length - 1; i >= 0; i--) { const v = got[rk(todo[i])]; if (!rcBad(v)) { RECAPS.set(rk(todo[i]), { at: Date.now(), v }); out[todo[i].u] = v; todo.splice(i, 1); } }
  }
  if (todo.length && API_KEY) {
    const made = {};
    const chunks = []; for (let i = 0; i < todo.length; i += 12) chunks.push(todo.slice(i, i + 12));
    await Promise.all(chunks.map(async ch => {
      const arr = await recapBatch(ch); if (!arr) return;
      arr.forEach(a => { const x = a && ch[a.i]; if (!x || !a.title) return;
        const v = { t: cleanLine(a.title, 110), pts: (Array.isArray(a.points) ? a.points : []).map(p => cleanLine(p, 140)).filter(p => p && !RC_EMPTY.test(p)).slice(0, 3) };
        const k = RC_KIND[String(a.kind || '').toLowerCase().trim()]; if (k) v.k = k; if (a.fluff === true) v.fluff = 1;
        RECAPS.set(rk(x), { at: Date.now(), v }); out[x.u] = v; made[rk(x)] = v; });
    }));
    if (sharedOn()) await recapsPut(made);
    if (RECAPS.size > 3000) [...RECAPS.keys()].slice(0, 1000).forEach(k => RECAPS.delete(k));
  }
  return out;
}

/* One plain Claude call (same model and settings as the recaps above). Used by api/take.js. Returns the reply text or null. */
async function askClaude(prompt, maxTokens = 600, ms = 20000) {
  if (!API_KEY) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) { LAST_ERR = 'HTTP ' + r.status; return null; }
    const j = await r.json(); return (j.content || []).map(c => c.text || '').join('');
  } catch (e) { LAST_ERR = String(e && e.message || e).slice(0, 150); return null; } finally { clearTimeout(t); }
}
const lastErr = () => LAST_ERR;
export { API_KEY, ESPN_TEAM, collect, getText, parseRSS, parseESPN, norm, similar, moveOf, FLUFF, RUMOR, askClaude, lastErr, cleanLine };

const clip = (s, n) => { s = String(s || ''); if (s.length <= n) return s; const c = s.slice(0, n); const k = Math.max(c.lastIndexOf('. '), c.lastIndexOf(' ')); return c.slice(0, k > n * .6 ? k + 1 : n).trim() + '…'; };
const cache = new Map();

export { lgKind, recapAll, celebOnly };

async function handler(req, res) {
  const q = req.query || {};
  /* recap mode for the News tab: POST {items:[{u,n,pos,t,title,desc,outlet}]} -> {items:{[url]:{t,pts}}} */
  if (req.method === 'POST' && q.recap) {
    if (!API_KEY && !sharedOn()) return res.status(200).json({ ai: false, items: {} });
    const raw = (req.body && Array.isArray(req.body.items)) ? req.body.items : [];
    const items = raw.slice(0, 30).filter(x => x && typeof x.u === 'string' && /^https?:/.test(x.u) && x.title).map(x => ({
      u: x.u.slice(0, 600), n: cleanLine(x.n, 60), pos: cleanLine(x.pos, 4), t: cleanLine(x.t, 4),
      title: cleanLine(x.title, 220), desc: cleanLine(x.desc, 900), outlet: cleanLine(x.outlet, 60),
      pay: !!x.pay, f: x.f === 'trade' ? 'trade' : '', from: cleanLine(x.from, 4), to: cleanLine(x.to, 4), ctx: cleanLine(x.ctx, 1000) }));
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
          at: i.at, img: i.img || null, video: !!i.video, pay: !!i.pay,
        }));
      } catch { return []; }
    }));
    const v = { updated: new Date().toISOString(), items: per.flat() };
    cache.set(key, { at: Date.now(), v });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
    return res.status(200).json(v);
  }
  /* trade mode for the News tab's Feed: the best story about each fantasy-relevant player who just changed teams,
     so the trade card can carry an article about that trade. No AI. GET /api/news?trades=Name|FROM|TO|DAY;...
     A story only counts if it names the player, says traded / dealt / acquired, has no rumour words ("could",
     "interest in", "potential", "talks"...), and is dated on or after the move (DAY, the day the nightly update first
     saw him on the new team; the day before also counts, since that run happens the morning after).
     -> {items:{[name]:{title,desc,url,outlet,at,img}}}; a player with no good story is simply left out. */
  if (q.trades) {
    const list = String(q.trades).split(';').map(x => x.split('|')).filter(x => x[0]).slice(0, 12)
      .map(([n, f, t, d]) => ({ n: String(n).slice(0, 60), from: String(f || '').toUpperCase().slice(0, 4), to: String(t || '').toUpperCase().slice(0, 4), day: /^\d{4}-\d\d-\d\d$/.test(d || '') ? d : '' }));
    const key = 'trades:' + list.map(x => norm(x.n) + x.to + x.day).sort().join(',');
    const c = cache.get(key);
    if (c && Date.now() - c.at < 20 * 60e3) { res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1200'); return res.status(200).json(c.v); }
    const out = {};
    await Promise.all(list.map(async x => {
      try {
        const { items } = await collect(x.n, x.to || x.from, false, false, 'trade', 21);
        const last = norm(x.n).split(' ').pop(), full = norm(x.n), since = x.day ? Date.parse(x.day + 'T00:00:00Z') - 864e5 : 0;
        const good = items.filter(i => {
          const t = i.title || '', d = (i.desc || '').slice(0, 400), at = Date.parse(i.at || 0);
          return !RUMOR.test(t) && !TR_RUMOR.test(t) && !TR_RUMOR.test(d.slice(0, 220)) && !FLUFF.test(t) && TR_WORD.test(t + ' ' + d)
            && (' ' + norm(t + ' ' + d) + ' ').includes(' ' + full + ' ') && (!since || (at && at >= since));
        })
          .map(i => ({ i, s: (i.pay ? -3 : 0) + (norm(i.title).includes(last) ? 2 : 0) + (moveOf(i.title) === 'trade' ? 2 : 0) + (i.desc ? 1 : 0) + Date.parse(i.at || 0) / 864e5 / 100 }))
          .sort((a, b) => b.s - a.s);
        const b = good[0] && good[0].i;
        if (b) out[x.n] = { title: b.title, desc: clip(b.desc, 700), url: b.url, outlet: b.outlet, at: b.at, img: b.img || null, pay: !!b.pay };
      } catch { }
    }));
    const v = { updated: new Date().toISOString(), items: out };
    cache.set(key, { at: Date.now(), v });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1200');
    return res.status(200).json(v);
  }
  /* league mode for the News tab's Feed: league-wide moves a fantasy manager cares about (trades, signings,
     releases, season-ending injuries, new starters) from the shared outlets. No AI, no player list: the client
     matches the stories to fantasy-relevant players and decides what to show. GET /api/news?league=1 */
  if (q.league) {
    const c = cache.get('league');
    if (c && Date.now() - c.at < 10 * 60e3) { res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600'); return res.status(200).json(c.v); }
    const got = await Promise.all(SHARED.map(async s => {
      try { const txt = await getText(s.url, 5 * 60e3); return s.kind === 'espn' ? parseESPN(txt) : parseRSS(txt, s.src); } catch { return []; }
    }));
    const cutoff = Date.now() - 7 * 864e5, out = [];
    for (const i of got.flat().sort((a, b) => (!!a.pay - !!b.pay) || (!!b.desc - !!a.desc) || ((RANK[a.src] ?? 5) - (RANK[b.src] ?? 5)))) {
      if (!i.title || !i.url || (i.at && Date.parse(i.at) < cutoff) || FLUFF.test(i.title) || RUMOR.test(i.title) || (i.pay && !payWorth(i))) continue;
      /* the same stories get in as before; a story let in by a move word is then labeled by what it really is */
      let kind = moveOf(i.title) || moveOf(i.desc.slice(0, 260)); if (!kind) continue;
      if (kind === 'move') kind = lgKind(i.title, i.desc, i.athletes, i.at);
      if (celebOnly(kind, i.title)) continue;
      if (out.some(o => similar(o.title, i.title, new Set()))) continue;
      out.push({ kind, title: i.title, desc: clip(i.desc, 700), url: i.url, outlet: i.outlet, at: i.at, img: i.img || null, athletes: i.athletes || [], pay: !!i.pay });
    }
    out.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
    /* outlets only list their newest stories, so the last week of them is kept in the shared store: everyone gets
       the same seven days, however recently they first opened the site */
    let items = out.slice(0, 80);
    try { items = await archiveMerge('league_news', items, { days: 7, max: 300, same: (a, b) => similar(a.title, b.title, new Set()) }); } catch { }
    /* stories saved before the labels changed get the new ones too */
    items.forEach(x => { if (x && x.kind !== 'trade' && x.kind !== 'inj' && x.kind !== 'role') x.kind = lgKind(x.title, x.desc, x.athletes, x.at); });
    items = items.filter(x => !celebOnly(x.kind, x.title));
    const v = { updated: new Date().toISOString(), items };
    cache.set('league', { at: Date.now(), v });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
    return res.status(200).json(v);
  }
  /* offseason mode for the offseason News tab (js/offnews.js): moves only, from the shared outlets, no rumors.
     GET /api/news?off=1[&days=30]  (default 14 days, at most 30)
     -> {items:[{kind,title,desc,url,outlet,outlets,at,img,athletes,teams,pay}]}
     kind: trade, sign, release, retire, coach (HC or OC change), inj (season-ending), susp, contract.
     outlets = every outlet that ran the same story; the client counts it as verified at two or more. No AI. */
  if (q.off) {
    const days = Math.min(30, Math.max(1, parseInt(q.days, 10) || 14)), ck = 'off:' + days;
    const c = cache.get(ck);
    if (c && Date.now() - c.at < 10 * 60e3) { res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600'); return res.status(200).json(c.v); }
    const got = await Promise.all(SHARED.map(async s => {
      try { const txt = await getText(s.url, 5 * 60e3); return s.kind === 'espn' ? parseESPN(txt) : parseRSS(txt, s.src); } catch { return []; }
    }));
    const cutoff = Date.now() - days * 864e5, out = [];
    for (const i of got.flat().sort((a, b) => (!!a.pay - !!b.pay) || (!!b.desc - !!a.desc) || ((RANK[a.src] ?? 5) - (RANK[b.src] ?? 5)))) {
      if (!i.title || !i.url || (i.at && Date.parse(i.at) < cutoff) || FLUFF.test(i.title) || RUMOR.test(i.title) || OFF_RUMOR.test(i.title)) continue;
      const kind = offKindOf(i.title) || offKindOf(String(i.desc || '').slice(0, 260)); if (!kind) continue;
      const d = out.find(o => o.kind === kind && similar(o.title, i.title, new Set()));
      if (d) { if (i.outlet && !d.outlets.includes(i.outlet)) d.outlets.push(i.outlet); if (!d.img && i.img) d.img = i.img; if (d.pay && !i.pay) Object.assign(d, { url: i.url, outlet: i.outlet, pay: false, desc: clip(i.desc, 700) || d.desc }); continue; }
      out.push({ kind, title: i.title, desc: clip(i.desc, 700), url: i.url, outlet: i.outlet, outlets: [i.outlet], at: i.at, img: i.img || null, athletes: i.athletes || [], teams: teamsIn(i.title + ' ' + String(i.desc || '').slice(0, 200)), pay: !!i.pay });
    }
    out.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
    const v = { updated: new Date().toISOString(), days, items: out.slice(0, 150) };
    cache.set(ck, { at: Date.now(), v });
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
    return { title: (a && a.title) || x.title, summary: (a && a.summary) || clip(x.desc, 260), headline: x.title, outlet: x.outlet, also: x.also.slice(0, 3), url: x.pay ? null : x.url, pay: !!x.pay, at: x.at, relevant: a ? a.relevant !== false : true, ai: !!a };
  }).filter(x => x.relevant);
  const v = { name, updated: new Date().toISOString(), ai: !!ai, items: out.slice(0, 4) };
  if (!ai && items.length) { v.aiError = LAST_ERR; }
  cache.set(key, { at: Date.now(), v });
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  return res.status(200).json(v);
}

/* Free for everyone: the league-wide top stories (league, trades) and their recaps. Pro: news about your own
   players (feed, batch, one player's card). Refused for non-Pro callers once the beta switch is off (api/_plan.js). */
export default withSentry(proOnly(handler, req => { const q = req.query || {}; return !(q.league || q.trades || q.recap || q.probe || q.off); }), 'news');
