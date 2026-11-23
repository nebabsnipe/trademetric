/* Checks the News tab's league-story labels. Run: node scripts/test-news-kind.mjs
   1. the label code is the same in api/news.js and js/news.js
   2. each sample story gets the label it should (from the keywords alone, for the player the story is matched to)
   3. the recap step passes the AI's kind through (the AI is faked here, so this costs nothing) */
import { readFileSync } from 'node:fs';
process.env.ANTHROPIC_API_KEY = 'test';   /* the AI is faked below; this only switches the recap step on */
const cut = f => { const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8'); return s.slice(s.indexOf('/* LGKIND-START'), s.indexOf('/* LGKIND-END */')); };
const srv = cut('api/news.js'), cli = cut('js/news.js');
let bad = 0;
if (!srv || srv !== cli) { bad++; console.log('FAIL  the label code differs between api/news.js and js/news.js'); }
const lgKind = new Function(cli + '\nreturn lgKind;')();
const LBL = { trade: 'Trade', inj: 'Injury', role: 'Depth chart', move: 'Roster move', disc: 'Discipline', game: 'Game recap', team: 'Team news', news: 'News' };
const AT = '2026-11-22T20:00:00Z';
const T = [
  ['D.K. Metcalf', 'disc', 'Steelers WR DK Metcalf ejected after shoving Bengals cornerback', 'Metcalf was ejected Sunday in the third quarter after a scuffle near the sideline. The league will review the play; Metcalf served a two-game suspension in 2025 for an incident with a fan.'],
  ['Cam Skattebo', 'game', 'Skattebo backflips into the end zone in Giants win', 'Skattebo backflipped after his second touchdown Sunday, then said he will retire the celebration after his coach asked him to stop.'],
  ['Tyler Shough', 'team', 'Shough says he\'s confident Saints offense will turn it around', 'Shough says he\'s confident in the group heading into the bye, even as veteran safety Justin Reid is being released, a source said.'],
  /* the real headlines from the night this was fixed */
  ['D.K. Metcalf', 'disc', "DK Metcalf's 2025 suspension can be factor in discipline for Sunday's ejection", "Steelers receiver DK Metcalf was ejected from Sunday's 19-16 loss to the Eagles."],
  ['Cam Skattebo', 'game', 'Cam Skattebo flips: Giants RB celebrates game-clinching drive with backflip days after retiring it', "Skattebo said he'd retire his celebration in the wake of Aidan Hutchinson's injury"],
  ['Tyler Shough', 'team', 'Tyler Shough voices confidence in Saints, Kellen Moore after 3-7 start', "Two straight losses. Justin Reid being released. Run game a mess. Despite the challenges, there's belief New Orleans can turn things around."],
  ['Puka Nacua', 'move', "Rams' Puka Nacua suspended 3 games for violating NFL's personal conduct policy", "Nacua was suspended as a result of a New Year's Eve incident."],
  ['Diego Pavia', 'news', 'Diego Pavia, Heisman finalist and former Vanderbilt star, picked No. 1 in UFL draft', 'Pavia briefly signed with the Baltimore Ravens after going undrafted, but was waived in July.'],
  ['Justin Reid', 'move', 'Saints release Justin Reid', 'The Saints are releasing the veteran safety after two seasons, the team announced Monday.'],
  ['Justin Reid', 'move', 'Source: Veteran safety Justin Reid is being released by the Saints', ''],
  ['Jameson Williams', 'move', 'Jameson Williams suspended 2 games for violating league policy', 'The NFL announced the suspension Tuesday.'],
  ['Jameson Williams', 'move', 'NFL suspends Lions WR Jameson Williams two games', ''],
  ['Jameson Williams', 'disc', 'Jameson Williams could be suspended two games after ejection', ''],
  ['Jameson Williams', 'disc', 'Williams\' suspension under review by the league', ''],
  ['D.K. Metcalf', 'disc', 'Metcalf fined $25,000 for unsportsmanlike conduct', ''],
  ['Odell Beckham Jr.', 'move', 'Odell Beckham Jr. signs one-year deal with Dolphins', ''],
  ['Kareem Hunt', 'move', 'Chiefs waive Kareem Hunt', ''],
  ['Kareem Hunt', 'move', 'Kareem Hunt claimed off waivers by Browns', ''],
  ['Travis Kelce', 'news', 'Travis Kelce released a statement on his charity work', ''],
  ['Cam Skattebo', 'team', 'Skattebo says he will retire the backflip celebration', ''],
  ['Brock Purdy', 'team', 'Kyle Shanahan: 49ers plan to keep Purdy as starter after signing Mac Jones', ''],
  ['Derrick Henry', 'game', 'Derrick Henry rushes for 180 yards as Ravens beat Browns 31-17', ''],
];
console.log('\nLabel from the keywords (no AI):\n');
for (const [n, want, title, desc] of T) {
  const got = lgKind(title, desc, [n], AT), ok = got === want; if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${LBL[got].padEnd(12)} ${ok ? '' : '(wanted ' + LBL[want] + ') '}${n}: "${title}"`);
}
/* an injury card only for the player's own injury */
const js = readFileSync(new URL('../js/news.js', import.meta.url), 'utf8');
const lgInjHis = new Function(js.slice(js.indexOf('/* LGINJ-START'), js.indexOf('/* LGINJ-END */')) + '\nreturn lgInjHis;')();
const I = [
  ['Cam Skattebo', false, "Cam Skattebo renews backflip celebration days after vowing to shelve it: 'It’s hard to hold back from'", 'Skattebo vowed in the aftermath of Aidan Hutchinson’s season-ending celebration injury that he was done doing backflips. That promise lasted less than four quarters.'],
  ['Cam Skattebo', false, 'Skattebo keeps flipping', 'Aidan Hutchinson is out for the season after tearing his ACL on a celebration. Skattebo said he would stop.'],
  ['Drake Maye', true, "Adam Schefter: Drake Maye's injury is likely season-ending", "Adam Schefter: Drake Maye's injury is likely season-ending"],
  ['Puka Nacua', true, "Rams' Puka Nacua out for the season with torn ACL", 'Sean McVay said Monday the star receiver will have surgery.'],
  ['Puka Nacua', true, 'Rams place Puka Nacua on injured reserve', ''],
  ['Puka Nacua', true, 'Rams lose star receiver', 'Coach Sean McVay said he is out for the season. Puka Nacua had 80 catches.'],
  ['Amon-Ra St. Brown', true, 'Lions WR Amon-Ra St. Brown out 4 weeks with knee sprain', ''],
  ['Joe Mixon', true, 'Season-ending surgery for Joe Mixon, Texans announce', ''],
  ['Drake Maye', false, 'NFL news, live updates: Aidan Hutchinson reportedly suffers torn ACL on sack celebration; Patriots QB Drake Maye out indefinitely with ankle injury', ''],
  ['Jahmyr Gibbs', false, "Lions lose Aidan Hutchinson to torn ACL; Gibbs scores twice in win", ''],
];
console.log('\nInjury card kept only for his own injury:\n');
for (const [n, want, title, desc] of I) { const got = lgInjHis(title, desc, n), ok = got === want; if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${(got ? 'kept' : 'left out').padEnd(9)} ${n}: "${title}"`); }
/* celebration-only stories stay out */
const { celebOnly, lgKind: srvKind } = await import('../api/news.js');
const C = [
  ['Cam Skattebo', true, 'Cam Skattebo flips: Giants RB celebrates game-clinching drive with backflip days after retiring it', "Skattebo said he'd retire his celebration in the wake of Aidan Hutchinson's injury"],
  ['Cam Skattebo', true, 'Skattebo says he will retire the backflip celebration', ''],
  ['D.K. Metcalf', false, 'Metcalf fined $25,000 for taunting during touchdown celebration', ''],
  ['Derrick Henry', false, 'Derrick Henry rushes for 180 yards as Ravens beat Browns 31-17', ''],
  ['Tyler Shough', false, 'Tyler Shough voices confidence in Saints, Kellen Moore after 3-7 start', ''],
  ['Justin Reid', false, 'Saints release Justin Reid', ''],
];
console.log('\nCelebration-only stories:\n');
for (const [n, want, title, desc] of C) { const got = celebOnly(srvKind(title, desc, [n], AT), title), ok = got === want; if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${(got ? 'left out' : 'kept').padEnd(9)} ${n}: "${title}"`); }
/* the AI's kind comes back on the recap as "k" */
globalThis.fetch = async (u, o) => {
  if (!String(u).includes('api.anthropic.com')) return { ok: false, status: 500, json: async () => null, text: async () => '' };
  const prompt = JSON.parse(o.body).messages[0].content;
  if (!prompt.includes('"kind"')) throw new Error('prompt does not ask for a kind');
  return { ok: true, json: async () => ({ content: [{ type: 'text', text: '[{"i":0,"title":"Metcalf ejected Sunday","kind":"discipline","points":["League will review"]},{"i":1,"title":"Reid released by the Saints","kind":"move","points":[]},{"i":2,"title":"Shough confident","kind":"banana","fluff":true,"points":[]}]' }] }) };
};
const { recapAll } = await import('../api/news.js');
const r = await recapAll([{ u: 'https://x.test/1', n: 'D.K. Metcalf', title: 'a' }, { u: 'https://x.test/2', n: 'Justin Reid', title: 'b' }, { u: 'https://x.test/3', n: 'Tyler Shough', title: 'c' }]);
const k = [r['https://x.test/1'], r['https://x.test/2'], r['https://x.test/3']].map(x => x && x.k);
const aiOk = k[0] === 'disc' && k[1] === 'move' && k[2] === undefined && r['https://x.test/3'].fluff === 1 && !r['https://x.test/1'].fluff; if (!aiOk) bad++;
console.log(`\n${aiOk ? 'ok  ' : 'FAIL'}  recap step returns the AI's kind (discipline -> Discipline, move -> Roster move, an unknown kind is ignored, the fluff flag comes through): ${JSON.stringify(k)}`);
console.log(bad ? `\n${bad} FAILED` : '\nAll passed'); process.exit(bad ? 1 : 0);
