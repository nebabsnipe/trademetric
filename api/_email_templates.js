// Every TradeMetric email, in one place. Helper for api/_email.js (files in /api that start with "_" are not
// endpoints). One layout for all of them: wordmark at the top, a headline, a few plain sentences, one button,
// a quiet footer. Works in light and dark mail apps and on a phone, and every email also has a plain-text
// version. No image is needed to understand any of them.
//
// What gets emailed (the full list, nothing else):
//   account, always sent      welcome · sync_broke        (sign-in codes come from Supabase, see supabase/email/)
//   updates, each can be off  weekly (matchup, standout games, #1 at his position, highlights) · injury · deadline
//                             · clinch · champ · recap · moves · draft
//   billing, always sent      trial_ending · receipt · payment_failed · renewal · cancelled   (api/_billing.js)
//
// render(type, data, ctx) -> { subject, html, text }
//   data: the facts for this email (league name, record ...). Everything is escaped here.
//   ctx:  { base, unsubUrl, allUrl, postal }  base = the site address the buttons open.

const SITE = 'https://www.trademetric.app';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const money = v => (typeof v === 'number' ? '$' + (Number.isInteger(v) ? v : v.toFixed(2)) : String(v || ''));
const rec = d => [d.wins, d.losses].every(x => Number.isFinite(+x)) ? `${+d.wins}-${+d.losses}${+d.ties ? '-' + +d.ties : ''}` : '';

/* What each kind of email is called in the footer and on the unsubscribe page. */
export const LABEL = { clinch: 'playoff clinch', champ: 'championship', recap: 'season recap', draft: 'draft season', announce: 'update', weekly: 'weekly recap', injury: 'injury', deadline: 'trade deadline', moves: 'player moves' };

/* ---- the words ---- each returns { subject, pre, h1, p: [paragraphs], btn: [label, path], code?, foot? } */
const COPY = {
  welcome: d => ({
    subject: 'Welcome to TradeMetric',
    pre: 'Connect your league and get trade grades built on your exact settings.',
    h1: d.name ? `Welcome, ${d.name}` : 'Welcome to TradeMetric',
    p: ['TradeMetric reads your league\'s real rosters and scoring, then grades trades for both sides, ranks players for your settings and points out lineup fixes on your team.',
      'It takes about a minute to bring your league in.'],
    btn: ['Connect your league', '/#hub'],
    foot: 'You\'re getting this because you created a TradeMetric account.',
  }),
  sync_broke: d => ({
    subject: `We can't update ${clip(d.league, 60)}`,
    pre: 'Your league has not updated for two days. Reconnect it to keep your rosters current.',
    h1: 'Your league stopped updating',
    p: [`TradeMetric hasn't been able to read **${clip(d.league, 80)}**${d.since ? ` since ${d.since}` : ' for two days'}.`,
      'Until it\'s reconnected, the rosters, records and alerts for this league will be out of date. This usually means the league was made private, its ID changed, or it was removed.'],
    btn: ['Reconnect your league', '/#hub'],
    foot: 'This is an account email about a league saved on your TradeMetric account.',
  }),
  clinch: d => ({
    subject: `You clinched a playoff spot in ${clip(d.league, 60)}`,
    pre: 'It is mathematically locked. Nothing left in the regular season can knock you out.',
    h1: 'You\'re in the playoffs',
    p: [`**${clip(d.team || 'Your team', 60)}** has clinched a playoff spot in **${clip(d.league, 80)}**${rec(d) ? ` at ${rec(d)}` : ''}.`,
      d.final ? 'The regular season is over and you\'re in the bracket.' : 'It\'s locked: no result left in the regular season can knock you out.'],
    btn: ['See your playoff picture', '/#season'],
  }),
  champ: d => ({
    subject: `You won ${clip(d.league, 60)}`,
    pre: 'League champion. Congratulations.',
    h1: 'League champion',
    p: [`**${clip(d.team || 'Your team', 60)}** won the ${d.season ? d.season + ' ' : ''}**${clip(d.league, 80)}** championship${d.score ? `, ${d.score}` : ''}.`,
      'Congratulations on the title.'],
    btn: ['See your season', '/#season'],
  }),
  recap: d => ({
    subject: `Your ${d.season ? d.season + ' ' : ''}season recap is ready`,
    pre: 'Your best trade, your biggest weeks and how your season unfolded.',
    h1: 'Your season recap is ready',
    p: [`Your ${d.season ? d.season + ' ' : ''}recap for **${clip(d.league, 80)}** is ready: your best and worst trades, your biggest weeks and how the season unfolded.`],
    btn: ['Open your recap', d.path || '/#team'],
  }),
  draft: d => ({
    subject: 'Draft season is here',
    pre: `${d.season ? d.season + ' ' : ''}rankings are up, scored to your league's settings.`,
    h1: 'Draft season is here',
    p: [`Drafts are starting, and the ${d.season ? d.season + ' ' : ''}rankings are up. Bring in this year's league and they're scored to its exact settings.`],
    btn: ['See the rankings', '/#rankings'],
  }),

  /* the one-time note to people who already have an account: what's starting, and how to turn it all off */
  announce: (d, ctx = {}) => ({
    subject: 'TradeMetric will now email you about your leagues',
    pre: 'A weekly recap and a few big moments. One click to turn them all off.',
    h1: d.name ? `${d.name}, TradeMetric is starting to send email` : 'TradeMetric is starting to send email',
    p: ['Starting this week, TradeMetric will send you a few emails about your leagues, and only these:',
      '**A weekly recap** after Monday night\'s game: your result, standout games, who was #1 at his position, and highlights of your players.',
      '**Trade deadline reminders**, **playoff and championship news**, and in the offseason, **player moves** and a **draft season reminder**.',
      'Injury emails are off unless you turn them on. We never email lineup alerts, live plays or news.',
      'You don\'t need to do anything to keep getting them. If you\'d rather not, you can turn them all off in one click, or pick the ones you want.'],
    btn: ['Choose your emails', '/#account-notifications'],
    link: ['No thanks, turn off all update emails', ctx.unsubUrl || ''],
    who: 'you have a TradeMetric account. This is the only email like this we\'ll send.',
  }),
  weekly: d => {
    const on = d.on || { matchup: true, perf: true, top: true, clips: true }, sec = [];
    const M = on.matchup ? d.matchup || [] : [], P = on.perf ? d.perf || [] : [], T = on.top ? d.top || [] : [], C = on.clips ? d.clips || [] : [];
    const many = new Set([...M, ...P, ...T].map(x => x.league)).size > 1;
    const res = x => x.won == null ? 'Tie' : x.won ? 'Win' : 'Loss';
    if (M.length) sec.push({ label: M.length > 1 ? 'Your matchups' : 'Your matchup', rows: M.map(x => ({ tag: x.won == null ? ['T', 'tie'] : x.won ? ['W', 'win'] : ['L', 'loss'], t: `**${x.team}** ${x.won == null ? 'tied' : x.won ? 'beat' : 'lost to'} ${x.oppName}`, s: `${x.league}${x.playoff ? ' · playoffs' : ` · now ${x.record}`}`, v: `${x.me.toFixed(1)}–${x.opp.toFixed(1)}`, plain: `${res(x)}: ${x.team} ${x.me.toFixed(1)}, ${x.oppName} ${x.opp.toFixed(1)} (${x.league}${x.playoff ? ', playoffs' : `, now ${x.record}`})` })) });
    if (T.length) sec.push({ label: '#1 at his position', rows: T.map(p => ({ t: `**${p.name}** was the ${p.tied ? 'co-' : ''}#1 ${p.pos} of the week`, s: `${p.pos}${p.team ? ' · ' + p.team : ''}${many ? ' · ' + p.league : ''}`, v: `${p.pts.toFixed(1)} pts` })) });
    if (P.length) sec.push({ label: 'Standout games', rows: P.map(p => ({ t: `**${p.name}**${p.starter ? '' : ' (on your bench)'}`, s: `${p.pos}${p.team ? ' · ' + p.team : ''}${p.proj > 0 ? ` · projected ${p.proj.toFixed(1)}` : ''}${many ? ' · ' + p.league : ''}`, v: `${p.pts.toFixed(1)} pts` })) });
    if (C.length) sec.push({ label: 'Highlights', rows: C.map(c => ({ t: c.title, s: c.player, href: c.url, play: true })) });
    const one = M.length === 1 ? M[0] : null;
    return {
      subject: one ? `Week ${d.week}: ${one.won == null ? 'a tie' : one.won ? 'you won' : 'you lost'}, ${one.me.toFixed(1)} to ${one.opp.toFixed(1)}` : `Your Week ${d.week} recap`,
      pre: [one && `${one.team} ${one.won == null ? 'tied' : one.won ? 'beat' : 'lost to'} ${one.oppName}.`, T[0] && `${T[0].name} was the #1 ${T[0].pos}.`, P[0] && `${P[0].name} scored ${P[0].pts.toFixed(1)}.`].filter(Boolean).join(' ') || `Your Week ${d.week} in one place.`,
      h1: `Week ${d.week} recap`, p: [], sections: sec,
      btn: ['See your team', '/#team'],
    };
  },
  injury: d => {
    const L = d.list || [], w = x => x.st === 'IR' ? 'placed on injured reserve' : 'ruled out';
    return {
      subject: L.length === 1 ? `${L[0].name} ${w(L[0])}` : `Injury report: ${L.length} of your players`,
      pre: L.map(x => `${x.name} ${w(x)}`).join('. ') + '.',
      h1: L.length === 1 ? 'Injury report' : `${L.length} of your players are hurt`, p: [],
      sections: [{ label: 'Since yesterday', rows: L.map(x => ({ tag: [x.st === 'IR' ? 'IR' : 'OUT', 'loss'], t: `**${x.name}** ${w(x)}`, s: [x.team, x.body, x.leagues && x.leagues.length ? (x.leagues.length === 1 ? x.leagues[0] : `${x.leagues.length} of your leagues`) : ''].filter(Boolean).join(' · ') })) }],
      btn: ['Check your lineup', '/#team'],
    };
  },
  deadline: d => ({
    subject: `Trade deadline: ${clip(d.league, 60)}`,
    pre: `The trade deadline is ${d.when}.`,
    h1: 'The trade deadline is close',
    p: [`The trade deadline in **${clip(d.league, 80)}** is **${d.when}**.`, 'If there\'s a deal you\'ve been thinking about, now is the time to make it.'],
    btn: ['Build a trade', '/#trade'],
  }),
  moves: d => {
    const L = d.list || [];
    return {
      subject: L.length === 1 ? `${L[0].name} is now with ${L[0].to}` : `Player moves: ${L.length} of your players`,
      pre: L.map(x => `${x.name}: ${x.from} to ${x.to}`).join('. ') + '.',
      h1: L.length === 1 ? 'A player from your team moved' : 'Players from your team moved',
      p: ['These players from your team are now listed on a new NFL team.'],
      sections: [{ label: 'New teams', rows: L.map(x => ({ t: `**${x.name}**`, s: `${x.pos}${x.leagues && x.leagues.length ? ' · ' + (x.leagues.length === 1 ? x.leagues[0] : `${x.leagues.length} of your leagues`) : ''}`, v: `${x.from} → ${x.to}` })) }],
      btn: ['See the rankings', '/#rankings'],
    };
  },

  /* ---- billing: sent by api/_billing.js with the amounts and dates Stripe reports ---- */
  trial_ending: d => ({
    subject: `Your free trial ends ${d.when || 'soon'}`,
    pre: `Your card will be charged ${money(d.amount)} unless you cancel first.`,
    h1: 'Your free trial is almost over',
    p: [`Your TradeMetric Pro trial ends **${d.when || 'soon'}**. After that your card${d.last4 ? ` ending in ${d.last4}` : ''} will be charged **${money(d.amount)}** ${d.period === 'year' ? 'for the year' : 'a month'}.`,
      'Nothing to do if you want to keep Pro. If you don\'t, cancel before then and you won\'t be charged.'],
    btn: ['Manage your subscription', '/#account-plan'],
    foot: 'This is a billing email for your TradeMetric account.',
  }),
  receipt: d => ({
    subject: `Your TradeMetric receipt (${money(d.amount)})`,
    pre: `Thanks. ${money(d.amount)} paid for TradeMetric Pro.`,
    h1: 'Thanks for your payment',
    p: [`We charged **${money(d.amount)}** to your card${d.last4 ? ` ending in ${d.last4}` : ''}${d.date ? ` on ${d.date}` : ''} for TradeMetric Pro (${d.period === 'year' ? 'yearly' : 'monthly'}).`,
      d.next ? `Your plan renews on ${d.next}.` : ''],
    btn: ['View billing', '/#account-plan'],
    foot: 'This is a billing email for your TradeMetric account.',
  }),
  payment_failed: d => ({
    subject: 'Your TradeMetric payment didn\'t go through',
    pre: 'Update your card to keep Pro.',
    h1: 'Your payment didn\'t go through',
    p: [`We couldn't charge **${money(d.amount)}** to your card${d.last4 ? ` ending in ${d.last4}` : ''}.`,
      `Update your card${d.until ? ` by ${d.until}` : ''} to keep TradeMetric Pro. We'll try again automatically once it's updated.`],
    btn: ['Update your card', '/#account-plan'],
    foot: 'This is a billing email for your TradeMetric account.',
  }),
  renewal: d => ({
    subject: `Your TradeMetric plan renews ${d.when || 'soon'}`,
    pre: `${money(d.amount)} will be charged to your card.`,
    h1: 'Your plan renews soon',
    p: [`Your TradeMetric Pro ${d.period === 'year' ? 'yearly' : 'monthly'} plan renews on **${d.when || 'its renewal date'}**. Your card${d.last4 ? ` ending in ${d.last4}` : ''} will be charged **${money(d.amount)}**.`,
      'Nothing to do if you want to keep Pro. You can change or cancel your plan any time before then.'],
    btn: ['Manage your subscription', '/#account-plan'],
    foot: 'This is a billing email for your TradeMetric account.',
  }),
  cancelled: d => ({
    subject: 'Your TradeMetric plan is cancelled',
    pre: d.until ? `You keep Pro until ${d.until}.` : 'You won\'t be charged again.',
    h1: 'Your plan is cancelled',
    p: [`Your TradeMetric Pro plan is cancelled and you won't be charged again.${d.until ? ` You keep Pro until **${d.until}**.` : ''}`,
      'Rankings stay free, and your leagues stay saved if you ever come back.'],
    btn: ['Restart your plan', '/#account-plan'],
    foot: 'This is a billing email for your TradeMetric account.',
  }),

  /* ---- sign-in emails: sent by Supabase, which fills in the {{ }} parts (see scripts/build-auth-emails.mjs) ---- */
  auth_confirm: () => ({
    subject: 'Your TradeMetric code: {{ .Token }}', raw: true,
    pre: 'Type this code on the TradeMetric page you signed up on.',
    h1: 'Confirm your email',
    p: ['Type this code on the TradeMetric page you just signed up on:'],
    code: '{{ .Token }}',
    after: ['Or tap the button. The page you signed up on signs you in by itself, even if you tap it on your phone.'],
    btn: ['Confirm my email', '{{ .ConfirmationURL }}'],
    foot: 'You\'re getting this because someone created a TradeMetric account with {{ .Email }}. If that wasn\'t you, ignore this email.',
  }),
  auth_reset: () => ({
    subject: 'Your TradeMetric reset code: {{ .Token }}', raw: true,
    pre: 'Type this code on the TradeMetric page to pick a new password.',
    h1: 'Reset your password',
    p: ['Type this code on the TradeMetric page to pick a new password:'],
    code: '{{ .Token }}',
    after: ['Or tap the button to set a new password in a new tab.'],
    btn: ['Set a new password', '{{ .ConfirmationURL }}'],
    foot: 'Didn\'t ask to reset your password? You can ignore this email. Your password won\'t change.',
  }),
};
export const TEMPLATES = Object.keys(COPY);

/* **bold** in a paragraph. Everything else is escaped. */
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const plain = s => String(s).replace(/\*\*(.+?)\*\*/g, '$1');

/* a section of rows (the weekly recap, injuries, player moves): a small label, then one row per item */
const TAG = { win: ['#E3F6EA', '#137A3B', 'tm-win'], loss: ['#FDE7E7', '#B42318', 'tm-loss'], tie: ['#EEF0F3', '#4A4F57', 'tm-tie'] };
function secHtml(sec) {
  const row = (r, i) => {
    const tg = r.tag ? TAG[r.tag[1]] : null;
    const main = r.href ? `<a class="tm-ink" href="${esc(r.href)}" style="color:#0B0C0E;text-decoration:none;font-weight:600">${r.play ? '<span style="color:#FF4F12">&#9654;</span>&nbsp;' : ''}${esc(r.t)}</a>` : rich(r.t);
    return `<tr><td class="tm-row" style="padding:11px 0;${i ? 'border-top:1px solid #E2E4E8;' : ''}vertical-align:top">
${tg ? `<span class="${tg[2]}" style="display:inline-block;min-width:22px;margin:0 8px 0 0;padding:2px 6px;border-radius:6px;background:${tg[0]};color:${tg[1]};font-size:12px;font-weight:700;text-align:center;line-height:18px">${esc(r.tag[0])}</span>` : ''}<span class="tm-ink" style="font-size:15px;line-height:1.45;color:#0B0C0E">${main}</span>
${r.s ? `<div class="tm-mut" style="margin-top:2px;font-size:13px;line-height:1.45;color:#636872">${esc(r.s)}</div>` : ''}
</td>${r.v ? `<td class="tm-row tm-ink" align="right" style="padding:11px 0 11px 12px;${i ? 'border-top:1px solid #E2E4E8;' : ''}vertical-align:top;white-space:nowrap;font-family:${F_MONO};font-size:14px;font-weight:600;color:#0B0C0E">${esc(r.v)}</td>` : ''}</tr>`;
  };
  return `<div class="tm-mut" style="margin:22px 0 4px;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#636872">${esc(sec.label)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px">${sec.rows.map(row).join('')}</table>`;
}
const secText = sec => [sec.label.toUpperCase(), ...sec.rows.map(r => '- ' + (r.plain || [plain(r.t), r.v ? `(${r.v})` : '', r.s ? `· ${r.s}` : '', r.href ? `\n  ${r.href}` : ''].filter(Boolean).join(' '))), ''];

const F_BODY = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const F_HEAD = "Kanit,'Arial Black','Helvetica Neue',Arial,sans-serif";
const F_MONO = "'IBM Plex Mono',Menlo,Consolas,monospace";

export function render(type, data = {}, ctx = {}) {
  const make = COPY[type];
  if (!make) throw new Error('unknown email: ' + type);
  const c = make(data || {}, ctx), base = (ctx.base || SITE).replace(/\/+$/, '');
  const url = p => (/^(https?:|\{\{)/.test(p) ? p : base + p);
  const paras = (c.p || []).filter(Boolean), after = (c.after || []).filter(Boolean);
  const big = !!LABEL[type] && !!ctx.unsubUrl;
  const P = s => `<p class="tm-mut" style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#3D424A">${c.raw ? s : rich(s)}</p>`;

  const footHtml = big
    ? `You're getting this because ${c.who ? esc(c.who) : esc(LABEL[type]) + ' emails are on for your TradeMetric account.'} <a class="tm-foot-a" href="${esc(ctx.unsubUrl)}" style="color:#636872;text-decoration:underline">Unsubscribe from these</a> or <a class="tm-foot-a" href="${esc(base + '/#account-notifications')}" style="color:#636872;text-decoration:underline">change your email settings</a>.`
    : (c.raw ? c.foot : esc(c.foot || 'This is an account email for your TradeMetric account.'));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${c.raw ? c.h1 : esc(c.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&amp;family=Kanit:ital,wght@1,700;1,800&amp;display=swap" rel="stylesheet">
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0}
a{text-decoration:none}
@media (prefers-color-scheme:dark){
.tm-bg{background:#050607!important}
.tm-card{background:#0F1113!important;border-color:#22262A!important}
.tm-ink{color:#F2F3F5!important}
.tm-mut{color:#B4B9C1!important}
.tm-foot,.tm-foot-a{color:#949AA3!important}
.tm-foot{border-color:#22262A!important}
.tm-code{background:#2B1409!important;color:#F2F3F5!important}
.tm-btn{background:#FF6A33!important;color:#170700!important}
.tm-btn-td{background:#FF6A33!important}
.tm-row{border-color:#22262A!important}
.tm-win{background:#0F2E1B!important;color:#6FD99A!important}
.tm-loss{background:#3A1414!important;color:#FF8A80!important}
.tm-tie{background:#1F2327!important;color:#B4B9C1!important}
}
@media (max-width:520px){
.tm-out{padding:16px 10px!important}
.tm-pad{padding-left:22px!important;padding-right:22px!important}
.tm-h1{font-size:23px!important}
.tm-btn{display:block!important;text-align:center!important}
.tm-btn-t{width:100%!important}
}
</style>
</head>
<body class="tm-bg" style="margin:0;padding:0;background:#F4F5F7">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${c.raw ? c.pre : esc(c.pre || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="tm-bg" style="background:#F4F5F7">
<tr><td align="center" class="tm-out" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="tm-card" style="max-width:520px;background:#FFFFFF;border:1px solid #E2E4E8;border-radius:14px;overflow:hidden">
<tr><td class="tm-pad" style="background:#0B0C0E;padding:20px 32px;border-radius:13px 13px 0 0">
<a href="${esc(base)}" style="font-family:${F_HEAD};font-style:italic;font-weight:800;font-size:23px;line-height:1;letter-spacing:.04em;text-transform:uppercase;color:#FFFFFF;text-decoration:none">TRADE<span style="color:#FF4F12">METRIC</span></a>
</td></tr>
<tr><td class="tm-pad" style="padding:32px 32px 12px;font-family:${F_BODY}">
<h1 class="tm-ink tm-h1" style="margin:0 0 14px;font-family:${F_BODY};font-size:25px;line-height:1.2;font-weight:700;letter-spacing:-.01em;color:#0B0C0E">${c.raw ? c.h1 : esc(c.h1)}</h1>
${paras.map(P).join('\n')}
${(c.sections || []).map(secHtml).join('\n')}
${c.code ? `<div class="tm-code" style="margin:4px 0 20px;background:#FFEDE4;border-radius:10px;padding:18px 12px;text-align:center;font-family:${F_MONO};font-size:32px;line-height:1.1;font-weight:700;letter-spacing:8px;color:#0B0C0E">${c.code}</div>` : ''}
${after.map(P).join('\n')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="tm-btn-t" style="margin:8px 0 20px"><tr><td class="tm-btn-td" bgcolor="#FF4F12" style="background:#FF4F12;border-radius:10px">
<a class="tm-btn" href="${esc(url(c.btn[1]))}" style="display:inline-block;padding:14px 26px;font-family:${F_BODY};font-size:16px;line-height:1.2;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;background:#FF4F12">${esc(c.btn[0])}</a>
</td></tr></table>
${c.link && c.link[1] ? `<p style="margin:-6px 0 18px;font-size:14px;line-height:1.5"><a class="tm-ink" href="${esc(c.link[1])}" style="color:#4A4F57;text-decoration:underline">${esc(c.link[0])}</a></p>` : ''}
</td></tr>
<tr><td class="tm-pad tm-foot" style="padding:18px 32px 26px;border-top:1px solid #E2E4E8;font-family:${F_BODY};font-size:12.5px;line-height:1.55;color:#636872">
${footHtml}${ctx.postal ? `<br><br>${esc(ctx.postal)}` : ''}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    'TRADEMETRIC', '',
    c.h1, '',
    ...paras.map(plain).flatMap(s => [s, '']),
    ...(c.sections || []).flatMap(secText),
    ...(c.code ? [c.code, ''] : []),
    ...after.map(plain).flatMap(s => [s, '']),
    `${c.btn[0]}: ${url(c.btn[1])}`, '',
    ...(c.link && c.link[1] ? [`${c.link[0]}: ${c.link[1]}`, ''] : []),
    '--',
    big ? `You're getting this because ${c.who || LABEL[type] + ' emails are on for your TradeMetric account.'}\nUnsubscribe from these: ${ctx.unsubUrl}\nEmail settings: ${base}/#account-notifications`
      : (c.foot || 'This is an account email for your TradeMetric account.'),
    ...(ctx.postal ? ['', ctx.postal] : []),
  ].join('\n');

  return { subject: c.subject, html, text };
}

/* Made-up facts for previews and test sends. */
export const SAMPLE = {
  welcome: { name: 'nebab' },
  sync_broke: { league: 'Sunday Scaries League', since: 'Monday, Nov 23' },
  clinch: { league: 'Sunday Scaries League', team: 'Gridiron Gurus', wins: 9, losses: 3 },
  champ: { league: 'Sunday Scaries League', team: 'Gridiron Gurus', season: 2026, score: '142.6 to 118.2' },
  recap: { league: 'Sunday Scaries League', season: 2026 },
  draft: { season: 2027 },
  announce: { name: 'nebab' },
  weekly: { week: 12, season: 2026,
    matchup: [{ league: 'Sunday Scaries League', team: 'Gridiron Gurus', won: true, me: 131.4, opp: 118.2, oppName: 'Fourth and Wrong', record: '8-4', playoff: false }],
    top: [{ name: 'Ja\'Marr Chase', pos: 'WR', team: 'CIN', pts: 38.4, tied: false, league: 'Sunday Scaries League' }],
    perf: [{ name: 'Ja\'Marr Chase', pos: 'WR', team: 'CIN', pts: 38.4, proj: 17.2, starter: true, league: 'Sunday Scaries League' }, { name: 'Bijan Robinson', pos: 'RB', team: 'ATL', pts: 29.6, proj: 18.0, starter: true, league: 'Sunday Scaries League' }],
    clips: [{ title: 'Ja\'Marr Chase breaks free for a 64-yard touchdown', url: 'https://www.trademetric.app/#news', player: 'Ja\'Marr Chase' }, { title: 'Bijan Robinson\'s best runs from Week 12', url: 'https://www.trademetric.app/#news', player: 'Bijan Robinson' }] },
  injury: { list: [{ name: 'Puka Nacua', team: 'LAR', st: 'O', body: 'ankle', leagues: ['Sunday Scaries League'] }, { name: 'Mark Andrews', team: 'BAL', st: 'IR', body: 'shoulder', leagues: ['Sunday Scaries League', 'Work League'] }] },
  deadline: { league: 'Sunday Scaries League', when: 'Friday, Nov 27 at 3:00 PM ET' },
  moves: { list: [{ name: 'Tony Pollard', pos: 'RB', from: 'TEN', to: 'KC', leagues: ['Sunday Scaries League'] }, { name: 'Darnell Mooney', pos: 'WR', from: 'ATL', to: 'CHI', leagues: ['Sunday Scaries League'] }] },
  trial_ending: { when: 'Friday, Dec 4', amount: 7, period: 'month', last4: '4242' },
  receipt: { amount: 50, period: 'year', last4: '4242', date: 'Dec 4, 2026', next: 'Dec 4, 2027' },
  payment_failed: { amount: 7, last4: '4242', until: 'Dec 11' },
  renewal: { when: 'Dec 4, 2027', amount: 50, period: 'year', last4: '4242' },
  cancelled: { until: 'Jan 4, 2027' },
  auth_confirm: {}, auth_reset: {},
};
