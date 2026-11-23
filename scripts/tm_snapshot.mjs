// Daily TradeMetric Rankings snapshot, for the offseason News tab's impact line ("TM rank 34 → 27").
// Runs after the nightly data update (.github/workflows/update-data.yml). It loads js/offseason.js as is and calls
// tmoBuild(), so the ranks are exactly the ones the Rankings page shows; nothing about the score is written here.
//
// data/tmhist.json = {days:[{d:"YYYY-MM-DD", ids:[player keys in rank order]}]}, newest last, kept 32 days.
// A player's rank on a day is his position in that day's list + 1.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const OUT = 'data/tmhist.json', KEEP = 32;
const nfl = JSON.parse(readFileSync('data/nfl.json', 'utf8'));
const market = existsSync('data/market.json') ? JSON.parse(readFileSync('data/market.json', 'utf8')) : null;

/* just enough of a browser for offseason.js to load; it only touches the page in event handlers */
const el = { classList: { toggle() { } }, dataset: {}, querySelector: () => null, insertAdjacentHTML() { } };
const ctx = {
  window: { NFL_DATA: nfl }, location: { hostname: 'snapshot' }, console,
  document: { addEventListener() { }, querySelectorAll: () => [], getElementById: () => null, querySelector: () => null, body: el },
  localStorage: { getItem: () => null, setItem() { } }, fetch: () => new Promise(() => { }),
};
vm.createContext(ctx);
vm.runInContext(readFileSync('js/offseason.js', 'utf8'), ctx);
ctx.TMO.market = market;
const rows = vm.runInContext('tmoBuild()', ctx) || [];
if (rows.length < 50) { console.error('tm snapshot skipped: only', rows.length, 'players'); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
let hist = { days: [] };
try { hist = JSON.parse(readFileSync(OUT, 'utf8')); } catch { }
hist.days = (hist.days || []).filter(x => x.d !== today);
hist.days.push({ d: today, ids: rows.map(o => o.id) });
hist.days.sort((a, b) => a.d.localeCompare(b.d));
hist.days = hist.days.slice(-KEEP);
writeFileSync(OUT, JSON.stringify(hist));
console.error('tm snapshot', today, rows.length, 'players,', hist.days.length, 'days kept');
