/* Season recap: "Save video". A short vertical highlight reel (1080x1920, about 15 seconds) drawn on a canvas and
   recorded in the browser. No libraries, nothing is uploaded: the video is made on the person's own device.

   Scenes: title -> final standing -> best week -> up to two highlights (biggest comeback, best trade, biggest
   beatdown) -> manager grade. Only scenes with real data are included.

   window.rcVideo.make(data)        opens the "making your video" sheet, records, then offers Save / Share
   window.rcVideo.frame(data, ms)   draws one frame and returns the canvas (used for checks) */
(function () {
  var W = 1080, H = 1920, FPS = 30;
  var KANIT = 'Kanit, "Arial Narrow", Arial, sans-serif', INTER = 'Inter, system-ui, Arial, sans-serif';
  var clamp = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var outCubic = function (x) { x = clamp(x); return 1 - Math.pow(1 - x, 3); };
  var outBack = function (x) { x = clamp(x); var c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  var f1 = function (n) { return (Math.round(n * 10) / 10).toFixed(1); };
  var ord = function (n) { var t = n % 100; return n + (t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
  var GRADE_COL = { A: '#4ade80', B: '#60a5fa', C: '#fbbf24', D: '#f87171', F: '#f87171' };

  /* ---------- what goes in the video ---------- */
  function scenes(D) {
    var S = D.summary || {}, L = D.league || {}, me = D.me || {}, out = [];
    var last = (D.standingsByWeek || []).slice(-1)[0], row = last && (last.teams || []).filter(function (t) { return t.teamId === me.teamId; })[0];
    out.push({ k: 'intro', dur: 2400, tone: '#8b5cf6', team: me.teamName || 'My team', league: L.name || '', year: L.year });
    if (S.finalStanding) out.push({ k: 'finish', dur: 2500, tone: '#3b82f6', place: S.finalStanding, of: L.teamCount, rec: row ? row.wins + '–' + row.losses + (row.ties ? '–' + row.ties : '') : null, note: (D.callouts || []).map(function (c) { return c.text; }).slice(-1)[0] || null });
    var bw = (D.bestWeeks || [])[0];
    if (bw) out.push({ k: 'high', dur: 2500, tone: '#f59e0b', score: bw.myScore, week: bw.week, opp: bw.oppName, won: bw.won, star: bw.topPlayer });
    var extra = [], cb = D.clutch && ((D.clutch.comebacks || [])[0] || D.clutch.comeback);
    if (D.cards && D.cards.clutch !== false && cb) extra.push({ k: 'comeback', dur: 2600, tone: '#22c55e', cb: cb });
    if (S.bestTrade && S.bestTrade.label) extra.push({ k: 'trade', dur: 2400, tone: '#a855f7', label: S.bestTrade.label, grade: S.bestTrade.grade });
    if (D.beatdown) extra.push({ k: 'beat', dur: 2400, tone: '#ef4444', b: D.beatdown });
    extra.slice(0, 2).forEach(function (x) { out.push(x); });
    out.push({ k: 'grade', dur: 3800, tone: '#fbbf24', grade: S.managerGrade || '–', team: me.teamName || '', year: L.year, league: L.name || '' });
    var t = 0; out.forEach(function (s) { s.at = t; t += s.dur; });
    out.total = t; return out;
  }

  /* ---------- drawing ---------- */
  function fit(x, text, font, size, maxW, min) {
    for (var s = size; s >= (min || 40); s -= 4) { x.font = font.replace('%', s); if (x.measureText(text).width <= maxW) return s; }
    x.font = font.replace('%', min || 40); return min || 40;
  }
  function wrap(x, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  function label(x, text, y, col, a) {
    x.save(); x.globalAlpha *= a == null ? 1 : a; x.fillStyle = col || '#a1a1aa'; x.font = '700 34px ' + INTER; try { x.letterSpacing = '7px'; } catch (e) { }
    x.fillText(String(text).toUpperCase(), 84, y); x.restore();
  }
  function head(x, text, y, size, col, maxW) {
    x.save(); x.fillStyle = col || '#fafafa'; var s = fit(x, text, 'italic 800 %px ' + KANIT, size, maxW || W - 168, 60); x.fillText(text, 84, y); x.restore(); return s;
  }
  function headWrap(x, text, y, size, col, maxLines) {
    x.save(); x.fillStyle = col || '#fafafa'; var s = size, lines;
    for (; s >= 64; s -= 6) { x.font = 'italic 800 ' + s + 'px ' + KANIT; lines = wrap(x, text, W - 168); if (lines.length <= (maxLines || 3)) break; }
    lines.forEach(function (l, i) { x.fillText(l, 84, y + i * s * 1.02); }); x.restore(); return y + lines.length * s * 1.02;
  }
  function body(x, text, y, col, size) { x.save(); x.fillStyle = col || '#a1a1aa'; x.font = '500 ' + (size || 44) + 'px ' + INTER; var lines = wrap(x, text, W - 168); lines.forEach(function (l, i) { x.fillText(l, 84, y + i * (size || 44) * 1.3); }); x.restore(); return y + lines.length * (size || 44) * 1.3; }
  /* a block of the scene: fades and rises in after `delay` ms */
  function enter(x, lt, delay, fn) { var p = outCubic((lt - delay) / 420); if (p <= 0) return; x.save(); x.globalAlpha *= p; x.translate(0, (1 - p) * 46); fn(p); x.restore(); }

  function background(x, t, tone, tone0, mix) {
    x.fillStyle = '#09090b'; x.fillRect(0, 0, W, H);
    var gx = W * (.72 + .1 * Math.sin(t / 2600)), gy = H * (.16 + .04 * Math.cos(t / 3100));
    var glow = function (col, a, cx, cy, r) { var g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.globalAlpha = a; x.fillStyle = g; x.fillRect(0, 0, W, H); x.restore(); };
    if (tone0 && mix < 1) glow(tone0, .5 * (1 - mix), gx, gy, 980);
    glow(tone, .5 * (tone0 ? mix : 1), gx, gy, 980);
    glow(tone, .22, W * .1, H * (.92 + .02 * Math.sin(t / 2100)), 760);
    /* faint grid, drifting */
    x.save(); x.strokeStyle = 'rgba(255,255,255,.035)'; x.lineWidth = 2; var off = (t / 60) % 72; x.beginPath();
    for (var gx2 = -72 + off; gx2 < W; gx2 += 72) { x.moveTo(gx2, 0); x.lineTo(gx2, H); }
    for (var gy2 = -72 + off; gy2 < H; gy2 += 72) { x.moveTo(0, gy2); x.lineTo(W, gy2); }
    x.stroke(); x.restore();
    var v = x.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,.35)'); v.addColorStop(.25, 'rgba(0,0,0,0)'); v.addColorStop(.8, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = v; x.fillRect(0, 0, W, H);
  }
  function chrome(x, SC, t, idx) {
    /* story-style progress bars, the mark and the address */
    var n = SC.length, gap = 10, w = (W - 168 - gap * (n - 1)) / n;
    SC.forEach(function (s, i) { var p = i < idx ? 1 : i === idx ? clamp((t - s.at) / s.dur) : 0, bx = 84 + i * (w + gap);
      x.fillStyle = 'rgba(255,255,255,.2)'; rr(x, bx, 84, w, 7, 4); x.fill(); if (p > 0) { x.fillStyle = '#fafafa'; rr(x, bx, 84, Math.max(7, w * p), 7, 4); x.fill(); } });
    x.save(); x.fillStyle = '#fafafa'; x.font = 'italic 800 46px ' + KANIT; x.fillText('TM', 84, 172); x.restore();
    if (SC[idx].k !== 'grade') { x.save(); x.fillStyle = 'rgba(255,255,255,.42)'; x.font = '600 30px ' + INTER; x.textAlign = 'right'; x.fillText('trademetric.app', W - 84, 166); x.restore(); }
  }
  function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function chip(x, text, cx, y, col) { x.save(); x.font = '700 38px ' + INTER; var w = x.measureText(text).width + 56; x.fillStyle = 'rgba(255,255,255,.07)'; rr(x, cx, y, w, 76, 38); x.fill(); x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 2; x.stroke(); x.fillStyle = col || '#fafafa'; x.fillText(text, cx + 28, y + 52); x.restore(); return w; }

  var DRAW = {
    intro: function (x, s, lt) {
      enter(x, lt, 120, function () { label(x, 'Season recap · ' + (s.year || ''), 640, s.tone); });
      enter(x, lt, 280, function () { headWrap(x, s.team.toUpperCase(), 800, 176, '#fafafa', 3); });
      enter(x, lt, 620, function () { x.save(); x.fillStyle = s.tone; x.fillRect(84, 1300, 150 * outCubic((lt - 620) / 500), 8); x.restore(); body(x, s.league, 1390, '#d4d4d8', 50); });
    },
    finish: function (x, s, lt) {
      enter(x, lt, 80, function () { label(x, 'Final standing', 560, s.tone); });
      enter(x, lt, 220, function (p) { var n = Math.max(1, Math.round(s.place + (1 - outCubic((lt - 220) / 900)) * Math.min(6, (s.of || 10) - s.place)));
        x.save(); x.fillStyle = '#fafafa'; x.font = 'italic 900 430px ' + KANIT; var txt = String(n), w = x.measureText(txt).width; x.fillText(txt, 70, 980); x.font = 'italic 800 150px ' + KANIT; x.fillStyle = s.tone; x.fillText(ord(n).replace(/\d+/, '').toUpperCase(), 90 + w, 800); x.restore(); });
      enter(x, lt, 620, function () { body(x, 'of ' + (s.of || '') + ' teams', 1090, '#d4d4d8', 56); });
      enter(x, lt, 820, function () { var cx = 84; if (s.rec) cx += chip(x, s.rec + ' record', cx, 1220) + 18; if (s.note) { x.save(); x.font = '700 38px ' + INTER; var fits = x.measureText(s.note).width + 56 <= W - 84 - cx; x.restore(); chip(x, s.note, fits ? cx : 84, fits ? 1220 : 1316, s.tone); } });
    },
    high: function (x, s, lt) {
      enter(x, lt, 80, function () { label(x, 'Best week · Week ' + s.week, 560, s.tone); });
      enter(x, lt, 220, function () { var v = s.score * outCubic((lt - 220) / 1100); x.save(); x.fillStyle = '#fafafa'; x.font = 'italic 900 380px ' + KANIT; var txt = f1(v); fit(x, txt, 'italic 900 %px ' + KANIT, 380, W - 150, 200); x.fillText(txt, 70, 960); x.restore(); });
      enter(x, lt, 560, function () { body(x, 'points' + (s.opp ? (s.won ? ' to beat ' : ' against ') + s.opp : ''), 1070, '#d4d4d8', 52); });
      if (s.star && s.star.name) enter(x, lt, 860, function () { x.save(); x.fillStyle = 'rgba(255,255,255,.06)'; rr(x, 84, 1250, W - 168, 190, 30); x.fill(); x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 2; x.stroke(); x.restore();
        label(x, 'Top player', 1322, '#a1a1aa'); head(x, s.star.name, 1400, 70, '#fafafa', W - 470); x.save(); x.fillStyle = s.tone; x.font = 'italic 800 96px ' + KANIT; x.textAlign = 'right'; x.fillText(f1(s.star.points), W - 124, 1388); x.restore(); });
    },
    comeback: function (x, s, lt) {
      var c = s.cb;
      enter(x, lt, 80, function () { label(x, 'Biggest comeback · Week ' + c.week, 560, s.tone); });
      enter(x, lt, 220, function () { var out = clamp((lt - 1250) / 300); x.save(); x.globalAlpha *= 1 - .62 * out; var hs = head(x, 'DOWN ' + f1(c.deficit), 800, 220, '#f87171'); x.font = 'italic 800 ' + hs + 'px ' + KANIT; var w = x.measureText('DOWN ' + f1(c.deficit)).width;
        if (out > 0) { x.strokeStyle = '#fafafa'; x.lineWidth = 12; x.beginPath(); x.moveTo(70, 800 - hs * .34); x.lineTo(70 + (w + 30) * out, 800 - hs * .34); x.stroke(); } x.restore(); });
      enter(x, lt, 480, function () { body(x, 'going into ' + c.goingInto, 890, '#d4d4d8', 52); });
      enter(x, lt, 1350, function (p) { x.save(); var sc = .8 + .2 * outBack((lt - 1350) / 420); x.translate(84, 1200); x.scale(sc, sc); x.translate(-84, -1200); head(x, 'WON BY ' + f1(c.finalMargin), 1200, 200, s.tone); x.restore(); });
      if (c.player) enter(x, lt, 1700, function () { body(x, c.player + ' put up ' + f1(c.playerPoints) + ' to finish it.', 1310, '#d4d4d8', 46); });
    },
    trade: function (x, s, lt) {
      enter(x, lt, 80, function () { label(x, 'Best trade', 560, s.tone); });
      var end = 0; enter(x, lt, 220, function () { end = headWrap(x, s.label.replace(/,\s*Wk\s*\d+$/i, '').toUpperCase(), 760, 170, '#fafafa', 3); });
      var wk = /Wk\s*(\d+)/i.exec(s.label);
      enter(x, lt, 620, function () { body(x, wk ? 'Week ' + wk[1] : '', 1210, '#d4d4d8', 52); });
      if (s.grade) enter(x, lt, 900, function () { stamp(x, s.grade, 84 + 150, 1470, 150, (lt - 900) / 520, GRADE_COL[s.grade[0]] || '#fafafa'); });
    },
    beat: function (x, s, lt) {
      var b = s.b;
      enter(x, lt, 80, function () { label(x, 'Biggest beatdown · Week ' + b.week, 560, s.tone); });
      enter(x, lt, 220, function () { var v = b.margin * outCubic((lt - 220) / 1000); x.save(); x.fillStyle = '#fafafa'; x.font = 'italic 900 360px ' + KANIT; var txt = '+' + f1(v); fit(x, txt, 'italic 900 %px ' + KANIT, 360, W - 150, 200); x.fillText(txt, 70, 960); x.restore(); });
      enter(x, lt, 560, function () { body(x, 'over ' + b.oppName, 1070, '#d4d4d8', 52); });
      enter(x, lt, 860, function () { var p = outCubic((lt - 860) / 700), full = W - 168; x.save(); x.fillStyle = 'rgba(255,255,255,.1)'; rr(x, 84, 1230, full, 26, 13); x.fill(); x.fillStyle = s.tone; rr(x, 84, 1230, Math.max(26, full * p), 26, 13); x.fill(); x.fillStyle = 'rgba(255,255,255,.1)'; rr(x, 84, 1330, full, 26, 13); x.fill(); x.fillStyle = '#71717a'; rr(x, 84, 1330, Math.max(26, full * p * b.oppScore / b.myScore), 26, 13); x.fill();
        x.fillStyle = '#fafafa'; x.font = '700 36px ' + INTER; x.fillText('You  ' + f1(b.myScore), 84, 1212); x.fillStyle = '#a1a1aa'; x.fillText('Them  ' + f1(b.oppScore), 84, 1312); x.restore(); });
    },
    grade: function (x, s, lt) {
      enter(x, lt, 80, function () { label(x, 'Manager grade', 470, s.tone); });
      enter(x, lt, 240, function () { headWrap(x, s.team.toUpperCase(), 600, 110, '#fafafa', 2); });
      var st = 700; if (lt > st) { var p = (lt - st) / 560, col = GRADE_COL[String(s.grade)[0]] || '#fbbf24';
        /* ring burst behind the stamp */
        var bp = clamp((lt - st - 260) / 900); if (bp > 0 && bp < 1) { x.save(); x.globalAlpha = (1 - bp) * .7; x.strokeStyle = col; x.lineWidth = 10 * (1 - bp) + 2; x.beginPath(); x.arc(W / 2, 1120, 300 + 420 * outCubic(bp), 0, 7); x.stroke(); x.restore(); }
        stamp(x, s.grade, W / 2, 1120, 300, p, col);
        /* one sweep of light across the stamp */
        var sh = clamp((lt - st - 700) / 700); if (sh > 0 && sh < 1) { x.save(); rr(x, W / 2 - 300, 820, 600, 600, 90); x.clip(); var gx = W / 2 - 500 + 1000 * sh, g = x.createLinearGradient(gx - 160, 0, gx + 160, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.transform(1, 0, -.35, 1, 0, 0); x.fillRect(0, 700, W * 2, 900); x.restore(); } }
      enter(x, lt, 1500, function () { x.save(); x.textAlign = 'center'; x.fillStyle = '#d4d4d8'; x.font = '500 46px ' + INTER; x.fillText((s.league ? s.league + ' · ' : '') + (s.year || ''), W / 2, 1560); x.restore(); });
      enter(x, lt, 1800, function () { x.save(); x.font = 'italic 800 84px ' + KANIT; var a = 'TRADE', b = 'METRIC', wa = x.measureText(a).width, wb = x.measureText(b).width, sx = (W - wa - wb) / 2; x.fillStyle = '#fafafa'; x.fillText(a, sx, 1740); x.fillStyle = '#FF4F12'; x.fillText(b, sx + wa, 1740);
        x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '600 36px ' + INTER; x.fillText('trademetric.app', W / 2, 1806); x.restore(); });
    }
  };
  /* the grade stamp: slams in oversized, settles with a small shake */
  function stamp(x, grade, cx, cy, r, p, col) {
    if (p <= 0) return; var k = clamp(p), sc = 2.6 - 1.6 * outCubic(k), rot = (-10 + 4 * outBack(k)) * Math.PI / 180, shake = k >= 1 ? 0 : Math.sin(k * 40) * 10 * (1 - k);
    x.save(); x.globalAlpha *= clamp(k * 3); x.translate(cx + shake, cy); x.rotate(rot); x.scale(sc, sc);
    x.shadowColor = col; x.shadowBlur = 70; x.fillStyle = 'rgba(12,12,14,.92)'; rr(x, -r, -r, r * 2, r * 2, r * .3); x.fill(); x.shadowBlur = 0;
    x.strokeStyle = col; x.lineWidth = r * .07; rr(x, -r, -r, r * 2, r * 2, r * .3); x.stroke();
    x.lineWidth = r * .02; rr(x, -r * .86, -r * .86, r * 1.72, r * 1.72, r * .22); x.stroke();
    x.fillStyle = col; x.textAlign = 'center'; var g = String(grade); x.font = 'italic 900 ' + (g.length > 1 ? r * 1.18 : r * 1.4) + 'px ' + KANIT; x.fillText(g, -r * .04, r * (g.length > 1 ? .42 : .5)); x.restore();
  }
  function drawFrame(x, SC, t) {
    t = Math.max(0, Math.min(SC.total - 1, t));
    var i = 0; while (i < SC.length - 1 && t >= SC[i].at + SC[i].dur) i++;
    var s = SC[i], lt = t - s.at, prev = SC[i - 1];
    background(x, t, s.tone, prev && prev.tone, clamp(lt / 500));
    var out = s.k === 'grade' ? 0 : clamp((lt - (s.dur - 260)) / 260);
    x.save(); x.globalAlpha = 1 - out; x.translate(0, -40 * out); DRAW[s.k](x, s, lt); x.restore();
    chrome(x, SC, t, i);
  }
  function canvasFor() { var c = document.createElement('canvas'); c.width = W; c.height = H; return c; }

  /* ---------- recording ---------- */
  function mime() {
    if (typeof MediaRecorder === 'undefined') return null;
    var L = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < L.length; i++) { try { if (MediaRecorder.isTypeSupported(L[i])) return L[i]; } catch (e) { } }
    return null;
  }
  function record(D, canvas, onProgress, ctl) {
    return new Promise(function (resolve, reject) {
      var type = mime(); if (!type || !canvas.captureStream) return reject(new Error('unsupported'));
      var SC = scenes(D), x = canvas.getContext('2d'), stream = canvas.captureStream(FPS), chunks = [], rec;
      try { rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 }); } catch (e) { return reject(e); }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = function () { reject(new Error('record')); };
      rec.onstop = function () { stream.getTracks().forEach(function (t) { t.stop(); }); if (ctl.cancelled) return reject(new Error('cancelled')); resolve(new Blob(chunks, { type: type.split(';')[0] })); };
      drawFrame(x, SC, 0); rec.start(250);
      var t0 = performance.now();
      (function tick() {
        if (ctl.cancelled) { try { rec.stop(); } catch (e) { } return; }
        var t = performance.now() - t0;
        drawFrame(x, SC, t); onProgress(clamp(t / SC.total));
        if (t >= SC.total + 250) { try { rec.stop(); } catch (e) { reject(e); } return; }
        requestAnimationFrame(tick);
      })();
    });
  }

  /* ---------- the sheet ---------- */
  function sheet() {
    var el = document.createElement('div'); el.className = 'rcv';
    el.innerHTML = '<div class="rcv-in" role="dialog" aria-modal="true" aria-label="Recap video"><div class="rcv-stage"></div>' +
      '<div class="rcv-t"><b data-rcv="title">Making your video</b><span data-rcv="sub">Keep this tab open. It takes about 15 seconds.</span></div>' +
      '<div class="rcv-bar"><i data-rcv="bar"></i></div><div class="rcv-btns" data-rcv="btns"><button type="button" class="rcv-b" data-rcv-act="cancel">Cancel</button></div></div>';
    document.body.appendChild(el); requestAnimationFrame(function () { el.classList.add('rcv-open'); }); return el;
  }
  function make(D) {
    if (document.querySelector('.rcv')) return Promise.resolve();
    var el = sheet(), q = function (k) { return el.querySelector('[data-rcv="' + k + '"]'); }, stage = el.querySelector('.rcv-stage'), ctl = { cancelled: false }, url = null;
    var close = function () { ctl.cancelled = true; if (url) URL.revokeObjectURL(url); el.remove(); };
    var year = (D.league && D.league.year) || '';
    el.addEventListener('click', function (ev) { var b = ev.target.closest('[data-rcv-act]'); if (b && (b.getAttribute('data-rcv-act') === 'cancel' || b.getAttribute('data-rcv-act') === 'done')) close(); });
    var canvas = canvasFor(); stage.appendChild(canvas);
    var ready = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('italic 800 100px Kanit'), document.fonts.load('italic 900 100px Kanit'), document.fonts.load('700 40px Inter'), document.fonts.load('500 40px Inter')]).catch(function () { }) : Promise.resolve();
    return ready.then(function () { return record(D, canvas, function (p) { q('bar').style.width = (p * 100).toFixed(1) + '%'; }, ctl); }).then(function (blob) {
      var ext = /mp4/.test(blob.type) ? 'mp4' : 'webm', name = 'trademetric-recap-' + year + '.' + ext, file = null;
      try { file = new File([blob], name, { type: blob.type }); } catch (e) { }
      url = URL.createObjectURL(blob);
      var v = document.createElement('video'); v.src = url; v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.controls = false; stage.innerHTML = ''; stage.appendChild(v); v.play().catch(function () { });
      q('title').textContent = 'Your video is ready'; q('sub').textContent = ext === 'mp4' ? 'Save it, or share it straight to your league chat.' : 'Save it to your device. Some apps may ask you to convert it before posting.';
      el.querySelector('.rcv-bar').hidden = true;
      var canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
      q('btns').innerHTML = '<button type="button" class="rcv-b rcv-p" data-rcv-act="save">Save video</button>' + (canShare ? '<button type="button" class="rcv-b" data-rcv-act="share">Share</button>' : '') + '<button type="button" class="rcv-b rcv-g" data-rcv-act="done">Done</button>';
      el.addEventListener('click', function (ev) { var b = ev.target.closest('[data-rcv-act]'); if (!b) return; var a = b.getAttribute('data-rcv-act');
        if (a === 'save') { var l = document.createElement('a'); l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove(); q('sub').textContent = 'Saved. Look in your downloads.'; }
        if (a === 'share') navigator.share({ files: [file], title: 'My ' + year + ' season recap' }).catch(function () { }); });
    }).catch(function (e) {
      if (ctl.cancelled) return;
      q('title').textContent = "Couldn't make the video"; q('sub').textContent = e && e.message === 'unsupported' ? 'This browser can’t record video. Save the image instead, or try Chrome or Safari.' : 'Something went wrong while recording. Try again.';
      el.querySelector('.rcv-bar').hidden = true; q('btns').innerHTML = '<button type="button" class="rcv-b" data-rcv-act="done">Close</button>';
    });
  }
  window.rcVideo = { make: make, scenes: scenes, supported: function () { return !!mime(); }, frame: function (D, t) { var c = canvasFor(); drawFrame(c.getContext('2d'), scenes(D), t); return c; } };
})();
