/* ===== Lineup alerts: the rules =====
   One file shared by the site (browser) and the scheduled server check (Node), so both decide the same way.
   No page code in here: it gets a lineup and player facts, and returns the alerts.

   ------------------------------------------------------------------------------------------------
   SETTINGS. The two numbers that decide the alert level. Change them here and nowhere else.
     gap = bench player's projection minus the starter's, in the league's own scoring
     under CONSIDER          -> nothing
     CONSIDER up to START    -> "Consider" (a quiet line in Alerts only: no banner, no bell count, no push)
     over START              -> "Start"    (Alerts + bell count + the My Team banner + a phone push)
   ------------------------------------------------------------------------------------------------ */
var LU_CFG = {
  CONSIDER: 0.7,
  START: 2.3,

  /* phone push timing (Start level only) */
  PUSH_FROM_HOUR: 8,        // no lineup push before 8am in the user's time zone
  PUSH_UNTIL_HOUR: 23,      // ...or at/after 11pm
  PUSH_LEAD_MIN: 90         // at least this many minutes before the first affected player's kickoff
};

(function (root) {
  'use strict';
  var C = LU_CFG;
  /* statuses: a starter with one of these can't play, so it's always Start. Q and D starters are compared on projection. */
  var CANT = { O: 'is out', IR: 'is on IR', SUS: 'is suspended', PUP: 'is on the PUP list' };
  /* a bench player who is Questionable or worse is never suggested */
  var NOT_SAFE = { Q: 1, D: 1, O: 1, IR: 1, SUS: 1, PUP: 1 };
  var NOISY = { K: 1, DST: 1 };   // kicker and defense projections: a gap is Consider at most
  var ELIG = { QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'], SF: ['QB', 'RB', 'WR', 'TE'], K: ['K'], DST: ['DST'] };
  var r1 = function (x) { return Math.round(x * 10) / 10; };
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  var f1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); };
  var slotName = function (l) { return l === 'SF' ? 'superflex' : l === 'DST' ? 'defense' : l === 'K' ? 'kicker' : l; };

  /* the level for a projection gap (rounded to 2 decimals so 0.7 is exactly 0.7) */
  function levelFor(gap, noisy) {
    var g = r2(gap);
    if (g < C.CONSIDER) return null;
    if (g > C.START && !noisy) return 'start';
    return 'consider';
  }

  /*
    evaluate(input) -> alerts for one league's lineup.
    input = {
      week,
      slots: [{label, el?: [positions], p: playerId|null}],   // the starting lineup as set in the league app
      bench: [playerId],
      info:  playerId -> {name, pos, proj, status, bye, started}
              proj    = this week's projection in the league's scoring (the number the site shows)
              status  = '', 'Q', 'D', 'O', 'IR', 'SUS', 'PUP'
              bye     = true when his team doesn't play this week
              started = true once his game has kicked off (or finished)
    }
    Each alert: {level:'start'|'consider', kind:'empty'|'out'|'bye'|'gap', slot, slotIndex, starter, bench, gap,
                 starterProj, benchProj, title, detail, key, swapKey}
  */
  function evaluate(input) {
    var info = input.info || {}, week = input.week, used = {}, out = [];
    var I = function (id) { return info[id] || {}; };
    var elig = function (x) { return x.el || ELIG[x.label] || [x.label]; };
    var canSub = function (id) { var p = I(id); return !!p.pos && !p.bye && !p.started && !NOT_SAFE[p.status || ''] && !used[id]; };
    var options = function (x) {
      return (input.bench || []).filter(function (id) { return canSub(id) && elig(x).indexOf(I(id).pos) >= 0; })
        .sort(function (a, b) { return (I(b).proj || 0) - (I(a).proj || 0); });
    };
    var mk = function (o) {
      var st = o.starter && I(o.starter), bn = o.bench && I(o.bench), lab = slotName(o.slot.label);
      var a = { level: o.level, kind: o.kind, slot: o.slot.label, slotIndex: o.i, starter: o.starter || null, bench: o.bench || null };
      if (bn) a.benchProj = r1(bn.proj || 0);
      if (st) a.starterProj = r1(st.proj || 0);
      if (o.gap != null) a.gap = r1(o.gap);
      if (o.kind === 'empty') {
        a.title = 'You have an empty ' + lab + ' slot';
        a.detail = bn ? 'Start ' + bn.name + ' there (' + f1(a.benchProj) + ' projected).' : 'Pick up a player who fits it.';
      } else if (o.kind === 'out' || o.kind === 'bye') {
        var why = o.kind === 'bye' ? 'is on bye' : CANT[st.status];
        a.title = bn ? 'Start ' + bn.name + ' over ' + st.name : 'Replace ' + st.name;
        a.detail = st.name + ' ' + why + '.' + (bn ? ' ' + bn.name + ' is projected for ' + f1(a.benchProj) + '.' : ' Nobody on your bench fits the ' + lab + ' slot.');
      } else if (o.level === 'start') {
        a.title = 'Start ' + bn.name + ' over ' + st.name;
        a.detail = f1(a.benchProj) + ' vs ' + f1(a.starterProj) + ' projected (' + f1(a.gap) + ' more).';
      } else {
        a.title = 'Consider starting ' + bn.name + ' over ' + st.name + ' (' + f1(a.gap) + ' more projected)';
        a.detail = f1(a.benchProj) + ' vs ' + f1(a.starterProj) + ' projected.';
      }
      /* one line for the bar at the top of My Team */
      a.banner = a.title + (o.kind === 'gap' ? ' (' + f1(a.benchProj) + ' vs ' + f1(a.starterProj) + ' projected)'
        : o.kind === 'empty' ? (bn ? '. Start ' + bn.name + '.' : '. Pick up a player for it.')
        : '. ' + st.name + ' ' + (o.kind === 'bye' ? 'is on bye' : CANT[st.status]) + '.');
      /* swapKey names the change itself, so the same swap is never pushed twice; key adds the level so a
         Consider that grows into a Start shows up as a new alert */
      a.swapKey = 'w' + week + ':' + (o.kind === 'empty' ? 'empty:' + o.i : o.starter) + '>' + (o.bench || '-');
      a.key = 'lu-' + a.swapKey + ':' + o.level;
      return a;
    };

    var forced = [], open = [];
    (input.slots || []).forEach(function (x, i) {
      if (!x.p) { forced.push({ x: x, i: i, kind: 'empty' }); return; }
      var s = I(x.p);
      if (s.started) return;                                    // his game has kicked off: never flag, either direction
      if (s.bye) forced.push({ x: x, i: i, kind: 'bye' });
      else if (CANT[s.status || '']) forced.push({ x: x, i: i, kind: 'out' });
      else open.push({ x: x, i: i });
    });

    /* 1. slots that must change: empty, out, IR, bye. Always Start, whatever the gap (K and DST too). */
    forced.forEach(function (f) {
      var b = options(f.x)[0];
      if (b) used[b] = 1;
      out.push(mk({ level: 'start', kind: f.kind, slot: f.x, i: f.i, starter: f.x.p, bench: b }));
    });

    /* 2. projection gaps. Every (slot, bench player) pair that clears CONSIDER; the biggest gap is taken first,
       so a bench player who is best for two slots goes where he helps most and the other slot gets its next-best option. */
    var pairs = [];
    open.forEach(function (o) {
      var sp = I(o.x.p).proj || 0;
      options(o.x).forEach(function (b) { var g = (I(b).proj || 0) - sp; if (r2(g) >= C.CONSIDER) pairs.push({ o: o, b: b, g: g }); });
    });
    pairs.sort(function (a, b) { return b.g - a.g; });
    var doneSlot = {};
    pairs.forEach(function (pr) {
      if (doneSlot[pr.o.i] || used[pr.b]) return;
      var lvl = levelFor(pr.g, NOISY[pr.o.x.label] || NOISY[I(pr.o.x.p).pos]);
      if (!lvl) return;
      doneSlot[pr.o.i] = 1; used[pr.b] = 1;
      out.push(mk({ level: lvl, kind: 'gap', slot: pr.o.x, i: pr.o.i, starter: pr.o.x.p, bench: pr.b, gap: pr.g }));
    });
    return out.sort(function (a, b) { return (a.level === b.level ? 0 : a.level === 'start' ? -1 : 1) || a.slotIndex - b.slotIndex; });
  }

  /* ---------- phone push planning (Start level only) ---------- */

  /* hour and calendar day of a moment in a time zone */
  function local(ms, tz) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    var o = {}; f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { day: o.year + '-' + o.month + '-' + o.day, hour: +o.hour, min: +o.minute };
  }

  /*
    planPush(opts) -> {send:false, why} or {send:true, title, body, url, swapKeys, urgent}
    opts = {
      now, tz,                      // ms, the user's time zone
      league: {id, name},
      alerts: evaluate(...) output for this league (Consider rows are ignored),
      kickoff: playerId -> kickoff ms (for an empty slot, the kickoff of the bench player suggested, else none),
      sent: [{swapKey, at}]         // this league's earlier lineup pushes (from push_sent)
    }
    Rules: at most one lineup push per league per day, all current Start changes bundled in it. Sent on the game day of the
    earliest affected player, from 8am local, never at or after 11pm, and at least 90 minutes before that kickoff. A starter
    ruled Out inside those 90 minutes goes right away. A swap already pushed is never pushed again.
  */
  function planPush(o) {
    var now = o.now, tz = o.tz, sent = o.sent || [], done = {};
    sent.forEach(function (s) { done[s.swapKey] = 1; });
    var ko = function (a) { var t = (o.kickoff || {})[a.starter] || (o.kickoff || {})[a.bench]; return t || null; };
    var fresh = (o.alerts || []).filter(function (a) { return a.level === 'start' && !done[a.swapKey]; })
      .map(function (a) { return { a: a, k: ko(a) }; })
      .filter(function (x) { return !x.k || x.k > now; });          // never about a game that has started
    if (!fresh.length) return { send: false, why: 'nothing new' };
    var lead = C.PUSH_LEAD_MIN * 6e4, L = local(now, tz);
    var today = sent.some(function (s) { return local(s.at, tz).day === L.day; });
    /* a starter ruled Out inside the 90 minutes: send now, even if a lineup push already went today */
    var urgent = fresh.filter(function (x) { return x.a.kind === 'out' && x.k && x.k - now < lead; });
    var go;
    if (urgent.length) go = urgent;
    else {
      if (today) return { send: false, why: 'already sent a lineup push for this league today' };
      var dated = fresh.filter(function (x) { return x.k; }).sort(function (a, b) { return a.k - b.k; });
      if (!dated.length) return { send: false, why: 'no kickoff time known' };
      var first = dated[0].k, FL = local(first, tz);
      if (L.day !== FL.day) return { send: false, why: 'not the game day yet' };
      if (L.hour < C.PUSH_FROM_HOUR || L.hour >= C.PUSH_UNTIL_HOUR) return { send: false, why: 'outside 8am-11pm' };
      if (first - now < lead) return { send: false, why: 'less than 90 minutes before kickoff' };
      go = fresh;                                                   // bundle every current Start change
    }
    var n = go.length, nm = (o.league && o.league.name) || 'your league';
    return {
      send: true, urgent: !!urgent.length,
      title: 'Lineup',
      body: n === 1 ? go[0].a.title + ' in ' + nm : n + ' lineup changes to make in ' + nm,
      url: '/#team?league=' + encodeURIComponent((o.league && o.league.id) || ''),
      tag: 'lineup-' + ((o.league && o.league.id) || ''),
      swapKeys: go.map(function (x) { return x.a.swapKey; })
    };
  }

  /* =================================================================================================
     PUSH SEND GOES HERE.  >>> sendLineupPush <<<
     Push notifications are built on the `push-notifications` branch, which is not on main yet, so this
     does nothing. When that branch is merged, the server's scheduled check (GET /api/push/cron in api/push.js)
     should, for every account and league:
       1. skip it unless the account's "Lineup alerts" switch is on and the league isn't "News tab only"
       2. build the lineup with evaluate() and get the plan with planPush()
       3. when plan.send: write each plan.swapKeys entry to push_sent FIRST (the table refuses duplicates), then
          sendToDevices(user, {title: plan.title, body: plan.body, url: plan.url, tag: plan.tag}) from api/_push.js
     Lineup alerts never send email.
     ================================================================================================= */
  function sendLineupPush(user, plan) {
    return { sent: false, stub: true, user: user, plan: plan };
  }

  var API = { CFG: C, evaluate: evaluate, levelFor: levelFor, planPush: planPush, sendLineupPush: sendLineupPush, local: local };
  /* the help page quotes the thresholds; keep it in step with the settings above */
  if (typeof document !== 'undefined') [].forEach.call(document.querySelectorAll('[data-lu-cfg]'), function (el) { var v = C[el.getAttribute('data-lu-cfg')]; if (v != null) el.textContent = v; });
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.LineupAlerts = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
