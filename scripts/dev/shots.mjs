/* Runs the site locally with every outside service faked, and takes screenshots.

   node scripts/dev/shots.mjs --out <folder> [--widths 1440,390] [--tabs team,news,...] [--state league|noleague|signedout]
                              [--theme dark|light] [--full] [--serve]

   --serve keeps the fake site running at http://localhost:3000 (static files only; the fakes need the script's browser).
   Needs Playwright (already present in Claude's cloud sessions). Nothing here is used by the live site. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { sleeper, api, USER, LEAGUE_ID, NOW } from './fixtures.mjs';

const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const OUT = path.resolve(arg('out', 'shots')), WIDTHS = String(arg('widths', '1440')).split(',').map(Number);
const STATE = arg('state', 'league'), THEME = arg('theme', 'dark'), FULL = !!arg('full', false), PORT = +arg('port', 3000);
const ALL = ['team', 'news', 'players', 'trade', 'season', 'hub', 'account', 'help', 'league', 'signin', 'welcome', 'upgrade'];
const TABS = arg('tabs', '') ? String(arg('tabs')).split(',') : ALL;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }); });
await new Promise(r => server.listen(PORT, r));
const BASE = 'http://localhost:' + PORT;

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
async function wire(ctx, signedIn) {
  await ctx.route('**/*', route => { const u = new URL(route.request().url());
    if (u.origin === BASE) { if (u.pathname.startsWith('/api/')) { if (signedIn) u.searchParams.set('_in', '1'); const v = api(u.pathname, u.searchParams); return v === null ? json(route, { error: 'off' }, 404) : json(route, v); } return route.continue(); }
    if (u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('supabase')) return route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(HERE, 'fake-supabase.js')) });
    if (u.hostname.endsWith('supabase.co')) return json(route, u.pathname.endsWith('/settings') ? { external: { google: true, apple: true, discord: true, email: true } } : {});
    if (u.hostname === 'api.sleeper.app') { const p = u.pathname.replace('/v1/', ''); let m;
      if (p === 'state/nfl') return json(route, { season: '2026', week: 12, season_type: 'regular' });
      if (p === 'players/nfl') return json(route, sleeper.players);
      if ((m = p.match(/^user\/[^/]+$/))) return json(route, sleeper.user);
      if (/^user\/.+\/leagues\/nfl\//.test(p)) return json(route, [sleeper.league]);
      if ((m = p.match(/^league\/\d+\/matchups\/(\d+)$/))) return json(route, sleeper.matchups[+m[1]] || []);
      if (/^league\/\d+\/rosters$/.test(p)) return json(route, sleeper.rosters);
      if (/^league\/\d+\/users$/.test(p)) return json(route, sleeper.users);
      if (/^league\/\d+$/.test(p)) return json(route, sleeper.league);
      return json(route, null); }
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.continue();
    return route.abort(); });
  await ctx.addInitScript(([cfg, now, theme]) => { window.__TM_FAKE = cfg;
    /* freeze "now" at the fixture's moment so week, countdowns and game states never drift */
    const RD = Date, off = now - RD.now(); class FD extends RD { constructor(...a) { a.length ? super(...a) : super(RD.now() + off); } static now() { return RD.now() + off; } } window.Date = FD;
    try { if (!localStorage.getItem('tm-theme-set')) { localStorage.setItem('tm-theme-set', '1'); localStorage.setItem('tm-theme', theme); } } catch (e) {} },
    [{ signedIn, user: USER }, NOW, THEME]);
}

const errors = [];
async function run(width) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height: width <= 700 ? 844 : 900 }, deviceScaleFactor: width <= 700 ? 2 : 1, colorScheme: THEME, isMobile: width <= 700, hasTouch: width <= 700 });
  const signedIn = STATE !== 'signedout'; await wire(ctx, signedIn);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(`[${width}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${width}] PAGE ${e.message}`));
  await page.goto(BASE + '/#team'); await page.waitForFunction(() => typeof go === 'function' && typeof S === 'object' && S, null, { timeout: 20000 }); await page.waitForTimeout(1200);
  if (STATE === 'league') { await page.evaluate(async u => { await sleeperConnect(u); await sleeperImport(0); }, USER.name); await page.waitForTimeout(2500); }
  await page.evaluate(t => { try { themePref = t; applyTheme(); } catch (e) {} }, THEME);
  if (arg('eval', '')) { await page.evaluate(h => { location.hash = h; }, TABS[0]); await page.waitForTimeout(1200); console.log(JSON.stringify(await page.evaluate(String(arg('eval'))), null, 1)); await browser.close(); return; }
  fs.mkdirSync(OUT, { recursive: true });
  for (const t of TABS) { await page.evaluate(h => { location.hash = h; }, t); await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    const f = path.join(OUT, `${t}-${width}-${THEME}${STATE === 'league' ? '' : '-' + STATE}.png`);
    await page.screenshot({ path: f, fullPage: FULL || width <= 700 }); console.log('saved', path.relative(process.cwd(), f)); }
  await browser.close();
}
if (arg('serve', false)) console.log('Serving ' + BASE + ' (Ctrl+C to stop)');
else { for (const w of WIDTHS) await run(w); if (errors.length) { console.log('\nConsole errors:'); [...new Set(errors)].forEach(e => console.log('  ' + e)); } else console.log('\nNo console errors.'); server.close(); }
