/* TradeMetric Season Recap: the slideshow player.
   The player (timing, animation restarts, navigation) is the approved reference's, unchanged;
   the cards are filled from /api/recap. Open as /recap?league=<id>&year=<yyyy>
   (or /recap/<id>/<yyyy>); with no league it uses the signed-in user's current ESPN league. */
(function () {
  var SUPA_URL = 'https://rltmfnmgbfgecbaevfvc.supabase.co', SUPA_KEY = 'sb_publishable_AFX79aKgqorAx3zgOyKatw_o_3_ERWG';
  var root = document.getElementById('rc-root');
  var stage = document.getElementById('rc-stage');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var AUTOPLAY = !reduce;

  // Every possible card, in order. `on` decides whether this recap has real data for it.
  var ALL = [
    { key: 'leagueTrades', flag: 's1', dur: 5000, glow: ['#7c3aed', '#2563eb'], bg: 'bgAurora' },
    { key: 'myTrades', flag: 's2', dur: 6500, glow: ['#f59e0b', '#7c3aed'], bg: 'bgAurora' },
    { key: 'best', flag: 's3', dur: 7500, glow: ['#22c55e', '#22c55e'], bg: 'bgGrid' },
    { key: 'worst', flag: 's4', dur: 7500, glow: ['#ef4444', '#ef4444'], bg: 'bgGrid' },
    { key: 'defining', flag: 's5', dur: 7000, glow: ['#f59e0b', '#f59e0b'], bg: 'bgGrid' },
    { key: 'fleece', flag: 's6', dur: 7500, glow: ['#ef4444', '#f59e0b'], bg: 'bgGrid' },
    { key: 'waivers', flag: 's7', dur: 8500, glow: ['#22c55e', '#0ea5e9'], bg: 'bgGrid' },
    { key: 'timelapse', flag: 's8', dur: 10000, glow: ['#8b5cf6', '#8b5cf6'], bg: null },
    { key: 'bestWeeks', flag: 's9', dur: 7500, glow: ['rgba(245,158,11,.35)', '#f59e0b'], bg: 'bgStadium' },
    { key: 'beatdown', flag: 'sBeat', dur: 6500, glow: ['rgba(239,68,68,.4)', '#ef4444'], bg: 'bgStadium' },
    { key: 'clutch', flag: 's10', dur: 7000, glow: ['rgba(34,197,94,.3)', '#22c55e'], bg: 'bgStadium' },
    { key: 'share', flag: 's11', dur: 999999, glow: ['#7c3aed', '#7c3aed'], bg: 'bgAurora' }
  ];
  var CARDS = [], LAST = 0, D = null;
  var st = { card: 0, elapsed: 0, paused: false };
  var toastTimer = null, lastCallKey = null, last = 0, running = false;
  var COUNTS = {}, RACE = null, barRows = [], segEls = [];

  // ---------- tiny DOM helpers (from the reference; list values are now escaped) ----------
  function all(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function one(sel) { return root.querySelector(sel); }
  function setV(name, val) { all('[data-v="' + name + '"]').forEach(function (el) { val = String(val); if (el.textContent !== val) el.textContent = val; }); }
  function setIf(name, on) { all('[data-if="' + name + '"]').forEach(function (el) { if (el.hidden === on) el.hidden = !on; }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function renderList(name, items) {
    var tpl = root.querySelector('template[data-for="' + name + '"]');
    var box = tpl.nextElementSibling;
    var html = tpl.innerHTML;
    box.innerHTML = items.map(function (it) {
      return html.replace(/\{\{\s*\w+\.(\w+)\s*\}\}/g, function (m, k) { return esc(it[k]); });
    }).join('');
    return Array.prototype.slice.call(box.children);
  }

  // ---------- maths ----------
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function ease(e, d) { if (reduce) return 1; var x = Math.min(1, Math.max(0, e / d)); return 1 - Math.pow(1 - x, 3); }
  function f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function rec(r) { return r.wins + '–' + r.losses; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function lastName(n) { var w = String(n || '').split(' ').filter(function (x) { return !/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(x); }); return w.length > 1 ? w[w.length - 1] : (w[0] || ''); }
  function dCls(i) { return 'rc-d' + Math.min(8, Math.max(1, i)); }

  // Grade colours: A and B green, C gold, D and F red
  function gradeTone(g) { g = String(g || ''); return /^[AB]/.test(g) ? ['#4ade80', '74,222,128'] : /^C/.test(g) ? ['#fbbf24', '251,191,36'] : ['#f87171', '248,113,113']; }
  function setStamp(key, grade, big) {
    var el = one('[data-stamp="' + key + '"]'); if (!el) return;
    var t = gradeTone(grade), span = el.firstElementChild;
    span.textContent = grade;
    span.style.color = t[0];
    el.style.borderColor = t[0];
    if (big) {
      span.style.fontSize = grade.length > 1 ? '64px' : '72px';
      el.style.boxShadow = '0 0 40px rgba(' + t[1] + ',.35), inset 0 0 22px rgba(' + t[1] + ',.18)';
    } else el.style.boxShadow = '0 0 ' + (key === 'mgr' ? 22 : 26) + 'px rgba(' + t[1] + ',.3)';
  }

  // ---------- fill the cards from the API ----------
  function chips(list, start) { return list.map(function (p, i) { return { pos: p.pos, name: p.name, ppw: f1(p.ptsPerWeekAfter), d: dCls(start + i) }; }); }
  function tradeChips(t, key) {
    renderList(key + 'Gave', chips(t.gave, 2));
    var gl = one('[data-dl="' + key + 'GotLbl"]');
    gl.className = 'rc-lbl rc-fu ' + dCls(2 + t.gave.length);
    renderList(key + 'Got', chips(t.got, 2 + t.gave.length));
    one('[data-tight="' + key + '"]').classList.toggle('rc-tight', t.gave.length + t.got.length > 4);
  }

  function fill(R) {
    var T = R.trades, me = R.me.teamId, yr = R.league.year, done = R.league.seasonComplete;
    var flags = R.cards || {};
    CARDS = ALL.filter(function (c) { return c.key === 'share' || flags[c.key]; });
    LAST = CARDS.length - 1;
    setV('year', yr);

    // 1 + 2: trade volume
    COUNTS.n1 = [T.leagueTotal, 300, 1800, 0];
    COUNTS.n2 = [T.mine, 500, 900, 0];
    setV('tradesWord', T.leagueTotal === 1 ? 'trade' : 'trades');
    setV('s1Sub', R.league.teamCount + ' managers. ' + R.league.weeksPlayed + ' weeks. Every deal run through the TradeMetric grade.');
    // podium in awards order: 2nd, 1st, 3rd
    var pod = T.podium || [], slots = [1, 0, 2];
    var STEP = [
      { h: 170, bg: 'linear-gradient(#78350f,#3b1d07)', bt: '2px solid #fbbf24', fs: 48, nc: '#fde68a', pt: 10, dIn: 'rc-d6', dRise: 'rc-d5' },
      { h: 120, bg: 'linear-gradient(#3f3f46,#27272a)', bt: '0', fs: 40, nc: '#d4d4d8', pt: 10, dIn: 'rc-d5', dRise: 'rc-d4' },
      { h: 88, bg: 'linear-gradient(#3f3f46,#27272a)', bt: '0', fs: 36, nc: '#d4d4d8', pt: 8, dIn: 'rc-d4', dRise: 'rc-d3' }
    ];
    renderList('podium', slots.map(function (i) {
      var p = pod[i], s = STEP[i];
      if (!p) return { vis: 'hidden', h: s.h, place: '', crown: 'none' };
      var mine = p.isMine, first = i === 0;
      // "you" on 2nd or 3rd keeps the reference's purple step
      var bg = mine && !first ? 'linear-gradient(#312e81,#1e1b4b)' : s.bg, nc = mine && !first ? '#c4b5fd' : s.nc;
      return { vis: 'visible', dIn: s.dIn, dRise: s.dRise, crown: first ? 'block' : 'none',
        av: first ? 60 : 52, avFs: first ? 18 : 16, avBg: mine && !first ? '#1e1b4b' : '#27272a',
        avBd: first ? '#fbbf24' : mine ? '#a78bfa' : '#a1a1aa', avGlow: first ? '0 0 30px rgba(251,191,36,.35)' : 'none',
        ini: p.initials, name: mine ? 'You' : p.teamName, count: p.count + (p.count === 1 ? ' trade' : ' trades'), cc: first ? '#fbbf24' : '#a1a1aa',
        h: s.h, stepBg: bg, stepBt: s.bt, pt: s.pt, fs: s.fs, nc: nc, place: i + 1 };
    }));

    // 3: best trade
    if (T.best) {
      var b = T.best, bt = b.got.slice().sort(function (x, y) { return y.ptsPerWeekAfter - x.ptsPerWeekAfter; })[0];
      setV('bestWeek', b.week);
      tradeChips(b, 'best');
      setStamp('best', b.grade, true);
      setV('bestLine', /^A/.test(b.grade) ? 'You saw something nobody else did.' : /^B/.test(b.grade) ? 'A sharp piece of business.' : 'Your best deal of the year.');
      setV('bestSub', b.lineupDelta > 0 ? '+' + f1(b.lineupDelta) + ' pts/wk to your starting lineup' : bt ? bt.name + ': ' + f1(bt.ptsPerWeekAfter) + ' pts/wk after the deal' : '');
    }
    // 4: worst trade
    if (T.worst) {
      var w = T.worst, wg = w.gave.slice().sort(function (x, y) { return y.ptsPerWeekAfter - x.ptsPerWeekAfter; })[0];
      var wgot = Math.max.apply(null, w.got.map(function (p) { return p.ptsPerWeekAfter; }).concat([0]));
      setV('worstWeek', w.week);
      tradeChips(w, 'worst');
      setStamp('worst', w.grade, true);
      setV('worstSub', wg && wg.ptsPerWeekAfter > wgot + 2 ? "We've all been there. " + lastName(wg.name) + ' went off right after.' : "We've all been there.");
    }
    // 5: defining trade
    if (T.defining) {
      var df = T.defining, meta = function (p) { return { name: p.name, meta: p.pos + ' · ' + p.team }; };
      setV('defWeek', df.week);
      renderList('defGave', df.gave.map(meta));
      renderList('defGot', df.got.map(meta));
      setV('defFrom', ord(df.rankBefore));
      setV('defTo', ord(df.rankFinal));
      setV('finishLbl', done ? 'Finish' : 'Now');
      setV('defLine', 'You were ' + ord(df.rankBefore) + ' when you made this deal. ' + (done ? 'You finished ' : "You're ") + ord(df.rankFinal) + (done ? '.' : ' now.'));
    }
    // 6: biggest fleece
    if (T.fleece) {
      var fl = T.fleece, pp = function (p) { return { name: p.name, ppw: f1(p.ptsPerWeekAfter) }; };
      setV('flWeek', fl.week);
      setV('flWinName', fl.winner.isMine ? 'You' : fl.winner.teamName);
      setV('flLoseName', fl.loser.isMine ? 'You' : fl.loser.teamName);
      renderList('flWin', fl.winner.got.map(pp));
      renderList('flLose', fl.loser.got.map(pp));
      setStamp('flWin', fl.winner.grade);
      setStamp('flLose', fl.loser.grade);
      setV('flWinPct', fl.winner.valueShare);
      setV('flLosePct', fl.loser.valueShare);
      one('[data-bar="fleece"]').style.width = fl.winner.valueShare + '%';
    }
    // 7: waivers
    var WV = R.waivers || {};
    if (WV.myBest) {
      var mb = WV.myBest;
      setV('wPos', mb.player.pos); setV('wName', mb.player.name);
      setV('wMeta', 'Added Week ' + mb.week + (mb.faab != null ? ' · $' + mb.faab + ' FAAB' : ''));
      COUNTS.n7 = [mb.pointsAfter, 900, 1600, 1];
      setV('wRank', '#' + mb.leagueRank + ' waiver add in your league.');
    }
    var top = WV.top5 || [];
    setV('wTopTitle', "Your league's top " + (top.length === 1 ? 'waiver add' : top.length + ' waiver adds'));
    renderList('wTop', top.map(function (x, i) {
      return { rank: i + 1, player: x.player, mgr: x.isMine ? 'You' : x.teamName, wk: x.week, pts: f1(x.pointsAfter), cls: 'rc-fu rc-d' + (i + 1), bg: x.isMine ? 'rgba(34,197,94,.1)' : '#141417', bd: x.isMine ? '#22c55e' : '#2a2a30', rc: i === 0 ? '#4ade80' : '#71717a' };
    }));

    // 8: standings timelapse
    buildRace(R);

    // 9: best weeks
    var BW = R.bestWeeks || [];
    if (BW.length) {
      var b1 = BW[0];
      setV('bw1Lbl', 'Week ' + b1.week + ' · ' + (b1.won ? 'Win' : 'Loss'));
      setV('bw1Opp', b1.oppName); setV('bw1OppScore', f1(b1.oppScore));
      one('[data-bw1score]').style.color = b1.won ? '#a1a1aa' : '#f87171';
      COUNTS.n9 = [b1.myScore, 600, 1400, 1];
      setIf('bw1Top', !!b1.topPlayer);
      if (b1.topPlayer) setV('bw1TopLine', b1.topPlayer.name + ' dropped ' + f1(b1.topPlayer.points) + ' for you.');
      renderList('bwRest', BW.slice(1).map(function (g, i) {
        return { d: dCls(4 + i), me: f1(g.myScore), wk: g.week, res: g.won ? 'Win' : 'Loss', wc: g.won ? '#4ade80' : '#f87171', opp: g.oppName, os: f1(g.oppScore), oc: g.won ? '#a1a1aa' : '#f87171' };
      }));
    }
    // 10: beatdown
    if (R.beatdown) {
      var bd = R.beatdown;
      setV('bdWeek', bd.week); setV('bdMe', f1(bd.myScore)); setV('bdOpp', bd.oppName); setV('bdOppScore', f1(bd.oppScore));
      COUNTS.nBeat = [bd.margin, 700, 1500, 1];
      one('[data-bar="beat"]').style.width = Math.max(4, bd.oppScore / bd.myScore * 100).toFixed(1) + '%';
    }
    // 11: clutch
    var CL = R.clutch || {}, cr = CL.closeRecord, er = CL.eliminationRecord, cb = CL.comeback;
    var hasClose = !!(cr && cr.wins + cr.losses > 0), hasElim = !!(er && er.wins + er.losses > 0);
    setIf('clClose', hasClose); setIf('clElim', hasElim);
    if (hasClose) setV('clCloseRec', rec(cr));
    if (hasElim) setV('clElimRec', rec(er));
    // a lone tile spans the full row
    one('[data-span="clClose"]').style.gridColumn = hasElim ? '' : '1 / -1';
    one('[data-span="clElim"]').style.gridColumn = hasClose ? '' : '1 / -1';
    setIf('clCome', !!cb);
    if (cb) {
      setV('clComeWeek', cb.week);
      setV('clComeLine', 'Down ' + f1(cb.deficit) + ' going into ' + cb.goingInto + '. Won by ' + f1(cb.finalMargin) + '.');
      setIf('clComePlayer', !!cb.player);
      if (cb.player) setV('clComeSub', 'Clutch player: ' + cb.player + ', ' + f1(cb.playerPoints) + (cb.goingInto === 'Monday night' ? ' on MNF' : cb.goingInto === 'Sunday night' ? ' on SNF' : ''));
    }

    // 12: share card
    var S = R.summary || {};
    setV('leagueName', R.league.name);
    setV('avLetter', String(R.me.managerName || R.me.teamName || '?').charAt(0).toUpperCase());
    setV('mgrName', cap(R.me.managerName));
    setV('teamName', R.me.teamName);
    one('[data-stamp="mgr"]').firstElementChild.textContent = S.managerGrade || '–'; // always gold, as in the reference
    setV('smTrades', S.tradesMade); setV('smTradesLbl', S.tradesMade === 1 ? 'trade made' : 'trades made');
    setV('smHigh', f1(S.highScore));
    setV('finalOrd', ord(S.finalStanding)); setV('standingLbl', done ? 'final standing' : 'current standing');
    setIf('smBp', !!S.bestPlayer);
    if (S.bestPlayer) { setV('smBpName', S.bestPlayer.name); setV('smBpPpw', f1(S.bestPlayer.ptsPerWeek)); }
    setIf('smBt', !!S.bestTrade);
    if (S.bestTrade) { setV('smBtLabel', S.bestTrade.label); setV('smBtGrade', S.bestTrade.grade); one('[data-grade-color]').style.color = gradeTone(S.bestTrade.grade)[0]; }
    setIf('smBd', !!S.beatdown);
    if (S.beatdown) { setV('smBdLabel', S.beatdown.label); setV('smBdMargin', f1(S.beatdown.margin)); }
    buildNetwork(R);

    segEls = renderList('segs', CARDS.map(function () { return { w: '0%' }; })).map(function (s) { return s.firstElementChild; });
  }

  // Trade network: managers on an oval (me at the top), one curved line per trade.
  function buildNetwork(R) {
    var teams = R.standingsByWeek[0].teams.map(function (t) { return t; }), me = R.me.teamId;
    teams.sort(function (a, b) { return (b.teamId === me) - (a.teamId === me); });
    var N = teams.length, idx = {}, cx = 230, cy = 110, rad = 68, pos = [], nodes = [], n;
    for (n = 0; n < N; n++) {
      var a = -Math.PI / 2 + n * (Math.PI * 2 / N), t = teams[n];
      var x = cx + Math.cos(a) * rad * 1.35, y = cy + Math.sin(a) * rad, mine = t.teamId === me;
      idx[t.teamId] = n; pos.push([x, y]);
      var ini = String(t.teamName).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase() || '?';
      nodes.push({ x: x.toFixed(1), y: y.toFixed(1), s: mine ? 30 : 22, m: mine ? -15 : -11, bg: mine ? '#f5b301' : '#18181b', bd: mine ? '#fde68a' : '#a78bfa', tc: mine ? '#111' : '#ddd6fe',
        ini: ini, d: (0.15 + n * 0.12).toFixed(2) + 's', glow: mine ? '0 0 22px rgba(245,179,1,.6)' : 'none' });
    }
    renderList('nodes', nodes);
    var d = (R.trades.network || []).map(function (p) {
      var A = pos[idx[p[0]]], B = pos[idx[p[1]]]; if (!A || !B) return '';
      var mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      var qx = mx + (cx - mx) * 0.35, qy = my + (cy - my) * 0.35;
      return 'M' + A[0].toFixed(1) + ' ' + A[1].toFixed(1) + ' Q' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' ' + B[0].toFixed(1) + ' ' + B[1].toFixed(1);
    }).join(' ');
    one('[data-edges]').setAttribute('d', d);
  }

  // Standings race from the real week-by-week table.
  function buildRace(R) {
    var weeks = R.standingsByWeek, me = R.me.teamId, teams = weeks[0].teams;
    var W = weeks.length - 1, at = weeks.map(function (w) { var m = {}; w.teams.forEach(function (t) { m[t.teamId] = t; }); return m; });
    var maxW = Math.max.apply(null, weeks[W].teams.map(function (t) { return t.wins; }).concat([1]));
    RACE = { W: W, at: at, teams: teams, denom: maxW / 0.82, me: me, callouts: R.callouts || [] };
    one('[data-race]').style.height = teams.length * 26 + 'px';
    barRows = renderList('bars', teams.map(function (t) {
      var mine = t.teamId === me, r0 = at[0][t.teamId];
      return { top: (r0.rank - 1) * 26, rank: r0.rank, name: mine ? 'You' : t.teamName, w: 2, col: mine ? '#a78bfa' : '#3f3f46', glow: mine ? '0 0 16px rgba(167,139,250,.7)' : 'none', fw: mine ? 800 : 500, tc: mine ? '#ede9fe' : '#a1a1aa', rec: '0–0' };
    }));
  }

  // ---------- per-frame drawing ----------
  function drawRace(e) {
    var R = RACE; if (!R) return;
    var wf = reduce ? R.W : Math.max(0, Math.min(R.W, (e - 700) / 520));
    var wk = Math.floor(wf), fr = wf - wk, wn = Math.min(R.W, wk + 1);
    barRows.forEach(function (row, i) {
      var id = R.teams[i].teamId, a = R.at[wk][id], b = R.at[wn][id];
      var wv = a.wins + (b.wins - a.wins) * fr;
      var top = (a.rank - 1) * 26 + 'px';
      if (row.style.top !== top) row.style.top = top;
      row.children[0].textContent = a.rank;
      row.children[2].children[0].style.width = Math.max(2, wv / R.denom * 100).toFixed(1) + '%';
      row.children[2].children[1].textContent = a.wins + '–' + a.losses + (a.ties ? '–' + a.ties : '');
    });
    var mine = R.at[wk][R.me];
    setV('raceWeek', wk === 0 ? 'KICKOFF' : 'WEEK ' + wk);
    setV('raceYou', 'You: ' + ord(mine.rank) + ' · ' + mine.wins + '–' + mine.losses);
    var shown = R.callouts.filter(function (x) { return x.week <= wk; }).slice(-2);
    var key = shown.map(function (x) { return x.text; }).join('|');
    if (key !== lastCallKey) { lastCallKey = key; renderList('callouts', shown); }
  }

  function draw() {
    var c = st.card, e = st.elapsed, k = CARDS[c].key;
    segEls.forEach(function (el, i) { el.style.width = i < c ? '100%' : i > c ? '0%' : (i === LAST ? '100%' : Math.min(100, e / CARDS[i].dur * 100).toFixed(1) + '%'); });
    Object.keys(COUNTS).forEach(function (n) { var v = COUNTS[n]; setV(n, (v[0] * ease(e - v[1], v[2])).toFixed(v[3])); });
    if (k === 'waivers') {
      var hasMine = !!D.waivers.myBest, hasTop = D.waivers.top5.length > 0;
      var mineNow = hasMine && (!hasTop || e < 4200);
      setIf('waiverMine', mineNow); setIf('waiverTop', !mineNow);
    }
    if (k === 'timelapse') drawRace(e);
  }

  // Showing a card un-hides it, which restarts all of its CSS animations.
  function show(c) {
    c = Math.max(0, Math.min(LAST, c));
    st.card = c; st.elapsed = 0; lastCallKey = null;
    var card = CARDS[c];
    ALL.forEach(function (x) { setIf(x.flag, x === card); });
    ['bgAurora', 'bgGrid', 'bgStadium'].forEach(function (f) { setIf(f, card.bg === f); });
    root.style.setProperty('--rc-ga', card.glow[0]);
    root.style.setProperty('--rc-gb', card.glow[1]);
    setV('counter', (c + 1) + ' / ' + CARDS.length);
    setIf('toast', false);
    draw();
  }

  function setPaused(p) {
    st.paused = p;
    setIf('paused', p); setIf('playing', !p);
    one('[data-act="togglePause"]').setAttribute('aria-label', p ? 'Resume' : 'Pause');
  }

  function toast(msg) { setV('toastText', msg); setIf('toast', true); clearTimeout(toastTimer); toastTimer = setTimeout(function () { setIf('toast', false); }, 2600); }

  var ACTIONS = {
    next: function () { if (st.card < LAST) show(st.card + 1); },
    prev: function () { show(st.card - 1); },
    replay: function () { show(0); },
    togglePause: function () { setPaused(!st.paused); },
    saveImage: function () { exportCard().then(function (blob) { download(blob); toast('Image saved.'); }).catch(function () { toast("Couldn't make the image. Try again."); }); },
    shareImage: function () {
      exportCard().then(function (blob) {
        var file = new File([blob], fileName(), { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: 'My ' + D.league.year + ' recap' }).catch(function () {});
        download(blob); toast('Image saved. Share it from your downloads.');
      }).catch(function () { toast("Couldn't make the image. Try again."); });
    }
  };

  root.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (el && running && ACTIONS[el.getAttribute('data-act')]) ACTIONS[el.getAttribute('data-act')]();
  });
  document.addEventListener('keydown', function (ev) {
    if (!running) return;
    if (ev.key === 'ArrowRight') ACTIONS.next();
    else if (ev.key === 'ArrowLeft') ACTIONS.prev();
    else if (ev.key === ' ' && ev.target === document.body) { ev.preventDefault(); ACTIONS.togglePause(); }
  });

  function tick(now) {
    var dt = Math.min(100, now - last); last = now;
    if (!st.paused) {
      var e = st.elapsed + dt;
      if (AUTOPLAY && st.card < LAST && e >= CARDS[st.card].dur) show(st.card + 1);
      else if (e < 20000) { st.elapsed = e; draw(); }
    }
    requestAnimationFrame(tick);
  }

  // ---------- fit the 390x844 card to the window ----------
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / 390, vh / 844);
    if (vw > 500) s = Math.min(1, (vh - 32) / 844, (vw - 32) / 390);
    stage.style.transform = 'scale(' + s.toFixed(4) + ')';
    stage.style.margin = ((844 * s - 844) / 2) + 'px ' + ((390 * s - 390) / 2) + 'px';
  }
  window.addEventListener('resize', fit); fit();

  // ---------- share card -> PNG (drawn by hand on a canvas, no libraries) ----------
  function fileName() { return 'trademetric-recap-' + D.league.year + '.png'; }
  function download(blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName();
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function parseShadow(s) {
    // "rgba(245, 179, 1, 0.6) 0px 0px 22px 0px" -> outer glow only
    if (!s || s === 'none' || /inset/.test(s.split(/,(?![^(]*\))/)[0])) return null;
    var m = s.match(/^(rgba?\([^)]*\)|#\w+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/);
    return m ? { color: m[1], blur: +m[4] } : null;
  }
  function rrect(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function boxOf(el, base) {
    // layout box relative to the card, ignoring animation transforms and the window scaling
    var x = 0, y = 0, n = el;
    while (n && n !== base) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function rotOf(el) { var m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || ''); return m ? +m[1] * Math.PI / 180 : 0; }
  function exportCard() {
    var card = one('[data-share-card]');
    return document.fonts.ready.then(function () {
      var PAD = 20, SC = 3, W = card.offsetWidth, H = card.offsetHeight;
      var cv = document.createElement('canvas'); cv.width = (W + PAD * 2) * SC; cv.height = (H + PAD * 2) * SC;
      var ctx = cv.getContext('2d');
      ctx.scale(SC, SC); ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, W + PAD * 2, H + PAD * 2);
      ctx.translate(PAD, PAD);
      var cardBox = card.getBoundingClientRect(), k = cardBox.width / W; // window scale
      function drawEl(el, clip) {
        if (el.hidden || el.tagName === 'TEMPLATE') return;
        var cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        if (cs.display === 'contents') { Array.prototype.forEach.call(el.childNodes, function (c) { if (c.nodeType === 1) drawEl(c, clip); else if (c.nodeType === 3) drawText(c, el, clip); }); return; }
        var b = el === card ? { x: 0, y: 0, w: W, h: H } : boxOf(el, card);
        ctx.save();
        var rot = rotOf(el);
        if (rot) { ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.rotate(rot); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2)); }
        if (el.tagName === 'svg') {
          var path = el.querySelector('path[data-edges]');
          if (path && path.getAttribute('d')) { ctx.translate(b.x, b.y); ctx.strokeStyle = 'rgba(167,139,250,.5)'; ctx.lineWidth = 1.1; ctx.stroke(new Path2D(path.getAttribute('d'))); }
          ctx.restore(); return;
        }
        var r = parseFloat(cs.borderTopLeftRadius) || 0; if (/%/.test(cs.borderTopLeftRadius)) r = b.w / 2;
        var bg = cs.backgroundColor, bw = parseFloat(cs.borderTopWidth) || 0;
        var sh = parseShadow(cs.boxShadow);
        if (sh) { ctx.save(); ctx.shadowColor = sh.color; ctx.shadowBlur = sh.blur; rrect(ctx, b.x, b.y, b.w, b.h, r); ctx.fillStyle = bg !== 'rgba(0, 0, 0, 0)' ? bg : 'rgba(0,0,0,0.01)'; ctx.fill(); ctx.restore(); }
        if (bg && bg !== 'rgba(0, 0, 0, 0)') { rrect(ctx, b.x, b.y, b.w, b.h, r); ctx.fillStyle = bg; ctx.fill(); }
        if (bw > 0 && cs.borderTopStyle !== 'none') { rrect(ctx, b.x + bw / 2, b.y + bw / 2, b.w - bw, b.h - bw, Math.max(0, r - bw / 2)); ctx.strokeStyle = cs.borderTopColor; ctx.lineWidth = bw; ctx.stroke(); }
        if (cs.overflow === 'hidden') { rrect(ctx, b.x, b.y, b.w, b.h, r); ctx.clip(); }
        var rotated = rot ? b : null;
        Array.prototype.forEach.call(el.childNodes, function (c) { if (c.nodeType === 1) drawEl(c, rotated || clip); else if (c.nodeType === 3) drawText(c, el, rotated || clip); });
        ctx.restore();
      }
      function drawText(node, parent, rotBox) {
        var txt = node.textContent.replace(/\s+/g, ' '); if (!txt.trim()) return;
        var cs = getComputedStyle(parent);
        if (cs.textTransform === 'uppercase') txt = txt.toUpperCase();
        var range = document.createRange(); range.selectNodeContents(node);
        var rects = range.getClientRects(); if (!rects.length) return;
        var rr = rects[0];
        ctx.save();
        ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        if ('letterSpacing' in ctx && cs.letterSpacing !== 'normal') ctx.letterSpacing = cs.letterSpacing;
        ctx.fillStyle = cs.color; ctx.textBaseline = 'middle';
        var x, y, maxW;
        if (rotBox) { // text inside the rotated grade stamp: centre it
          ctx.textAlign = 'center'; x = rotBox.x + rotBox.w / 2; y = rotBox.y + rotBox.h / 2; maxW = 999;
        } else {
          // position from the live layout, mapped back to unscaled card coordinates
          x = (rr.left - cardBox.left) / k; y = (rr.top - cardBox.top + rr.height / 2) / k;
          // clip ellipsis text to its container
          var box = parent; while (box && getComputedStyle(box).display === 'inline') box = box.parentElement;
          maxW = box ? (box.getBoundingClientRect().right - rr.left) / k : 999;
        }
        if (rects.length > 1) { // wrapped onto more lines: draw each line from its own rect (word by word)
          var words = txt.trim().split(' '), line = '', li = 0;
          words.forEach(function (wd) {
            var test = line ? line + ' ' + wd : wd;
            var lr = rects[li]; var lw = lr ? lr.width / k : 999;
            if (ctx.measureText(test).width > lw + 1 && line) { ctx.fillText(line, (rects[li].left - cardBox.left) / k, (rects[li].top - cardBox.top + rects[li].height / 2) / k); li++; line = wd; }
            else line = test;
          });
          var L = rects[Math.min(li, rects.length - 1)];
          ctx.fillText(line, (L.left - cardBox.left) / k, (L.top - cardBox.top + L.height / 2) / k);
          ctx.restore(); return;
        }
        if (ctx.measureText(txt).width > maxW + 1) { while (txt.length > 1 && ctx.measureText(txt + '…').width > maxW) txt = txt.slice(0, -1); txt = txt.trimEnd() + '…'; }
        ctx.fillText(txt, x, y);
        ctx.restore();
      }
      drawEl(card, null);
      return new Promise(function (res, rej) { cv.toBlob(function (b) { b ? res(b) : rej(new Error('blob')); }, 'image/png'); });
    });
  }

  // ---------- load: sign-in, owner check, data ----------
  function gate(title, msg, link, linkText, lbl) {
    setIf('gate', true); setIf('gateLoading', false);
    setV('gateLbl', lbl || 'Season Recap'); setV('gateTitle', title);
    setIf('gateMsg', !!msg); setV('gateMsg', msg || '');
    setIf('gateBtn', !!link);
    if (link) { var a = one('[data-gate-link]'); a.href = link; a.textContent = linkText; }
  }
  function params() {
    var q = new URLSearchParams(location.search), m = location.pathname.match(/\/recap\/(\d+)(?:\/(\d{4}))?/);
    var now = new Date(), season = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return { league: q.get('league') || (m && m[1]) || '', year: +(q.get('year') || (m && m[2]) || season), dev: q.get('dev') };
  }
  function espnCreds() { try { var c = JSON.parse(localStorage.getItem('tm-espn-login') || 'null'); return c && c.s2 && c.swid ? c : null; } catch (e) { return null; } }

  async function load() {
    var p = params();
    // local testing only: build straight from the league's public data for a given team
    if (p.dev && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      window.process = window.process || { env: {} };
      var mod = await import('/api/recap.js');
      return mod.buildRecap({ league: p.league, year: p.year, teamId: +p.dev });
    }
    var sb;
    try { var lib = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm'); sb = lib.createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'implicit' } }); }
    catch (e) { throw { code: 'upstream' }; }
    var ses = (await sb.auth.getSession()).data.session;
    if (!ses) throw { code: 'sign_in' };
    if (!p.league) { // no league in the address: use the signed-in user's current ESPN league
      var row = (await sb.from('user_state').select('state').maybeSingle()).data;
      var S = row && row.state, src = S && S.real && S.real.src;
      if (src && src.type === 'espn') p.league = src.league;
      else { var e2 = ((S && S.leagues) || []).find(function (x) { return /^espn:/.test(x.key); }); if (e2) p.league = e2.key.slice(5); }
      if (!p.league) throw { code: src ? 'unsupported' : 'no_league' };
    }
    var creds = espnCreds();
    var r = await fetch('/api/recap?league=' + encodeURIComponent(p.league) + '&year=' + p.year, {
      method: creds ? 'POST' : 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + ses.access_token }, creds ? { 'content-type': 'application/json' } : {}),
      body: creds ? JSON.stringify({ s2: creds.s2, swid: creds.swid }) : undefined
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw { code: j.code || 'upstream' };
    return j;
  }

  function start(R) {
    D = R;
    fill(R);
    setIf('gate', false); setIf('ready', true);
    running = true;
    var s = parseInt((location.hash.match(/card=(\d+)/) || [])[1], 10); // #card=6 jumps to card 6
    setPaused(false);
    show(s ? s - 1 : 0);
    last = performance.now();
    requestAnimationFrame(tick);
    // local testing only: jump to card c (1-based) at time ms, paused, for screenshots
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__rcSeek = function (c, ms) { setPaused(true); show(c - 1); st.elapsed = ms; draw(); };
  }

  load().then(start).catch(function (e) {
    var c = (e && e.code) || 'upstream';
    if (c === 'sign_in') gate('Sign in to see your recap', 'Your Season Recap is private to your account.', '/#signin', 'Sign in');
    else if (c === 'not_owner') gate('Not your recap', 'This recap belongs to another account. Sign in with the account that imported this league.', '/', 'Back to TradeMetric');
    else if (c === 'private') gate('Private league', 'Import this league on TradeMetric with your ESPN codes on this device, then open your recap again.', '/#welcome', 'Import league');
    else if (c === 'unsupported') gate('ESPN leagues only, for now', 'Season Recap works with ESPN leagues. More platforms are coming.', '/', 'Back to TradeMetric');
    else if (c === 'no_league') gate('No league yet', 'Import your league on TradeMetric, then come back for your recap.', '/#welcome', 'Import league');
    else if (c === 'not_found' || c === 'team_not_found') gate('League not found', "We couldn't find that league for this season.", '/', 'Back to TradeMetric');
    else gate("Couldn't load your recap", 'Something went wrong on our side. Try again in a minute.', location.href, 'Try again');
  });
})();
