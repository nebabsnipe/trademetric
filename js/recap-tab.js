/* Recap tab: the screen people see before they start the recap slideshow.
   A phone-shaped frame plays a small, silent loop of the real recap cards (recap.html in its "demo" mode), a slide-to-play
   track opens the slideshow, and one side card per recap card sits either side (locked until the recap has been watched).
   Drawn by renderProTab (js/offseason.js) through rcTabRender. Styles: css/recap-tab.css. */
(function () {
  // The recap's cards, in order (same names as the slideshow's own card list).
  var CARDS = [['leagueTrades', 'League trades'], ['myTrades', 'Your trades'], ['best', 'Best trade'], ['worst', 'Worst trade'], ['defining', 'Defining trade'], ['fleece', 'Biggest fleece'],
    ['waivers', 'Waiver wire'], ['timelapse', 'Season timelapse'], ['bestWeeks', 'Best weeks'], ['beatdown', 'Biggest beatdown'], ['clutch', 'Clutch'], ['share', 'Your recap card']];
  var LOCK = '<svg class="rc-lock" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var CHEV = function (d) { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };
  var reduce = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var T = { el: null, cards: CARDS, off: 0, unlocked: false, track: null, clip: '', mine: false, fresh: false, noReal: '' };
  var SEEN_LS = 'tm-recap-seen';   // this browser's copy of "watched", so the screen does not flash the locked look on load

  function season() { var n = new Date(); return n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1; }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function q(sel) { return T.el.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(T.el.querySelectorAll(sel)); }
  function mode() { var w = window.innerWidth; return w < 700 ? 'phone' : w < 1280 ? 'tablet' : 'desk'; }
  function shown() { return mode() === 'desk' ? 4 : 2; }
  function isOpen() { return !!document.getElementById('rcx'); }
  function live() { return T.el && T.el.isConnected && document.body.dataset.tab === 'recap' && !T.el.closest('[hidden]'); }

  /* ---------- has this account watched its recap? ----------
     Kept per league and season ("<league id>:<year>") in the account's saved data (S.acct.recapSeen, the same place as the
     other per-account settings), so it follows the user to every device. The slideshow also notes it in this browser. */
  function myLeague() {   // the league the recap opens for: the same choice js/recap.js makes
    try {
      var src = S && S.real && S.real.src;
      if (src && src.type === 'espn' && src.league) return String(src.league);
      var e = ((S && S.leagues) || []).find(function (x) { return /^espn:/.test(x.key); });
      return e ? e.key.slice(5) : '';
    } catch (x) { return ''; }
  }
  function seenKey() { var l = myLeague(); return l ? l + ':' + season() : ''; }
  function localSeen() { try { return JSON.parse(localStorage.getItem(SEEN_LS) || '{}') || {}; } catch (e) { return {}; } }
  function acctSeen() { try { return (typeof acctGet === 'function' && acctGet('recapSeen', null)) || {}; } catch (e) { return {}; } }
  function markSeen(k) {
    if (!k) return;
    var l = localSeen(); if (!l[k]) { l[k] = Date.now(); try { localStorage.setItem(SEEN_LS, JSON.stringify(l)); } catch (e) {} }
    var a = acctSeen(); if (!a[k] && typeof acctSet === 'function') { var n = {}; for (var x in a) n[x] = a[x]; n[k] = l[k]; try { acctSet('recapSeen', n); } catch (e) {} }
  }
  function unlockedNow() {
    var k = seenKey(); if (!k) return false;
    var a = !!acctSeen()[k], l = !!localSeen()[k];
    if (a !== l) markSeen(k);   // one copy has it and the other does not: bring them level
    return a || l;
  }
  /* what the frame plays: the user's own league once they have watched it, the sample league before that */
  function clipSrc() { var l = myLeague(); return T.unlocked && l && T.noReal !== l ? '/recap?reel=1&league=' + encodeURIComponent(l) + '&year=' + season() : '/recap?reel=1&sample=1'; }
  function setClip() { var f = q('.rc-clip'), u = clipSrc(); if (f && T.clip !== u) { T.clip = u; T.mine = false; f.src = u; badge(); } }
  function badge() { var b = q('.rc-badge'); if (b) b.textContent = T.mine ? 'Your league' : 'Sample league'; }
  function sideHtml() { var n = T.cards.length; return T.cards.map(function (c, i) { return '<button class="rc-side" type="button" data-rc-card="' + (i + 1) + '"><span class="rc-side-n">' + two(i + 1) + ' / ' + two(n) + '</span><span class="rc-side-t">' + c[1] + '</span><span class="rc-side-s"></span></button>'; }).join(''); }
  function chipHtml() { return T.cards.map(function (c, i) { return '<button class="rc-chip" type="button" data-rc-card="' + (i + 1) + '"><b>' + two(i + 1) + '</b>' + c[1] + '</button>'; }).join(''); }
  /* the side cards and chips follow the cards the playing recap really has (a recap can leave some out) */
  function setCards(keys) {
    var keep = CARDS.filter(function (c) { return c[0] === 'share' || keys.indexOf(c[0]) >= 0; });
    if (!keep.length || keep.map(function (c) { return c[0]; }).join() === T.cards.map(function (c) { return c[0]; }).join()) return;
    T.cards = keep; T.off = 0;
    qa('.rc-side').forEach(function (b) { b.remove(); });
    q('.rc-rail').insertAdjacentHTML('afterbegin', sideHtml());
    q('.rc-chips').innerHTML = chipHtml();
    paint();
  }

  function build() {
    T.el.innerHTML = '<div class="rc-tab">' +
      '<h1 class="rc-h">Recap <span>' + season() + '</span></h1>' +
      '<div class="rc-row">' +
        '<button class="rc-arrow" type="button" data-rc-move="-1" aria-label="Previous cards">' + CHEV('M14.5 5.5L8 12l6.5 6.5') + '</button>' +
        '<div class="rc-rail">' +
          sideHtml() +
          '<div class="rc-frame">' +
            '<iframe class="rc-clip" title="" tabindex="-1" aria-hidden="true" loading="eager"></iframe>' +
            '<span class="rc-badge"></span>' +
            '<button class="rc-save" type="button" hidden>Save video</button>' +
            '<button class="rc-track" type="button"><span class="rc-trail"></span><span class="rc-tlabel"></span><span class="rc-ring"></span>' +
              '<span class="rc-knob"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg></span></button>' +
          '</div>' +
        '</div>' +
        '<button class="rc-arrow" type="button" data-rc-move="1" aria-label="More cards">' + CHEV('M9.5 5.5L16 12l-6.5 6.5') + '</button>' +
      '</div>' +
      '<p class="rc-hint"></p>' +
      '<div class="rc-chips" aria-label="Recap cards">' + chipHtml() + '</div>' +
    '</div>';
    T.off = 0; T.clip = '';
    bindTrack(q('.rc-track'));
    paint();
    setClip();
  }

  /* everything that differs between "not watched yet" and "watched" */
  function paint() {
    var u = T.unlocked, root = q('.rc-tab');
    root.dataset.state = u ? 'unlocked' : 'locked';
    badge();
    q('.rc-tlabel').textContent = u ? 'Slide to watch again' : 'Slide to play';
    q('.rc-track').setAttribute('aria-label', u ? 'Watch your recap again' : 'Play your recap');
    /* "Save it" joins this line when the Save video button ships (phase 3) */
    q('.rc-hint').textContent = u ? 'This one is yours. Pick any card to jump in.' : 'This preview uses a sample league. Watch your recap once to get your own.';
    qa('.rc-side-s').forEach(function (s) { s.innerHTML = u ? 'Open card' : LOCK + 'Locked'; });
    qa('.rc-chip').forEach(function (c) { c.disabled = !u; });
    place();
  }

  /* where each side card sits: four beside the frame on desktop (small, large | large, small), two on tablet, two peeking in on phone */
  function place() {
    var m = mode(), vis = shown(), u = T.unlocked, rail = q('.rc-rail'), fw = q('.rc-frame').offsetWidth || 300;
    var gap = m === 'desk' ? 20 : m === 'tablet' ? 12 : 20, sL = 1;
    if (m === 'tablet') sL = Math.max(.6, Math.min(1, (rail.clientWidth / 2 - fw / 2 - gap) / 200));
    var xL = fw / 2 + gap + 100 * sL, sS = .75, xS = xL + 100 * sL + gap + 100 * sS, far = xS + 190;
    T.off = Math.max(0, Math.min(T.cards.length - vis, T.off));
    var slots = vis === 4 ? [[-xS, sS, 0], [-xL, sL, 1], [xL, sL, 1], [xS, sS, 0]] : [[-xL, sL, 1], [xL, sL, 1]];
    qa('.rc-side').forEach(function (b, i) {
      var k = i - T.off, s = slots[k], on = !!s && m !== 'phone';
      if (!s) s = [k < 0 ? -(vis === 4 ? far : xL + 260) : (vis === 4 ? far : xL + 260), vis === 4 ? .6 : sL * .8, -1];
      b.style.setProperty('--x', s[0].toFixed(1) + 'px'); b.style.setProperty('--s', s[1].toFixed(3));
      b.style.setProperty('--o', s[2] < 0 ? 0 : u ? (s[2] ? 1 : .7) : (s[2] ? .38 : .2));
      if (s[2] < 0) b.setAttribute('data-off', ''); else b.removeAttribute('data-off');
      /* locked cards do nothing; on a phone the two that peek in are decoration only */
      var can = on && u;
      b.tabIndex = can ? 0 : -1;
      if (can) { b.removeAttribute('aria-disabled'); b.removeAttribute('aria-hidden'); b.setAttribute('aria-label', 'Open card ' + (i + 1) + ', ' + T.cards[i][1]); }
      else { b.setAttribute('aria-disabled', 'true'); b.removeAttribute('aria-label'); if (!on) b.setAttribute('aria-hidden', 'true'); else b.removeAttribute('aria-hidden'); }
    });
    var ar = qa('.rc-arrow'); if (ar[0]) ar[0].disabled = T.off <= 0; if (ar[1]) ar[1].disabled = T.off >= T.cards.length - vis;
  }

  /* open the slideshow on top of the site (the layer is drawn by js/offseason.js) */
  function openAt(card) { if (isOpen() || typeof tmoRecapOpen !== 'function') return; tmoRecapOpen(card || 1); }

  /* ---------- the slide-to-play track ---------- */
  function bindTrack(tr) {
    var S = T.track = { tr: tr, x: 0, max: 0, drag: false, moved: false, done: false, sx: 0, x0: 0, timer: 0 };
    function travel() { return Math.max(1, tr.clientWidth - 48 - 8); }
    function set(px) { S.x = px; tr.style.setProperty('--kx', px.toFixed(1) + 'px'); tr.style.setProperty('--p', (px / S.max).toFixed(3)); }
    function cls(c) { tr.classList.remove('rc-go', 'rc-back'); if (c && !reduce()) tr.classList.add(c); }
    S.reset = function () { clearTimeout(S.timer); S.done = false; S.drag = false; S.max = travel(); cls(''); set(0); };
    S.complete = function () {
      if (S.done || isOpen()) return;
      S.done = true; S.max = travel(); cls('rc-go'); set(S.max);
      S.timer = setTimeout(function () { openAt(1); }, reduce() ? 0 : 450);
    };
    tr.addEventListener('pointerdown', function (e) {
      if (S.done || (e.pointerType === 'mouse' && e.button !== 0)) return;
      S.drag = true; S.moved = false; S.max = travel(); S.sx = e.clientX; S.x0 = S.x; cls('');
      try { tr.setPointerCapture(e.pointerId); } catch (x) {}
    });
    tr.addEventListener('pointermove', function (e) {
      if (!S.drag) return;
      var d = e.clientX - S.sx;
      if (Math.abs(d) > 5) S.moved = true;
      if (S.moved) set(Math.max(0, Math.min(S.max, S.x0 + d)));
    });
    function up(e) {
      if (!S.drag) return;
      S.drag = false;
      if (e.type === 'pointercancel') { cls('rc-back'); set(0); return; }
      if (!S.moved || S.x / S.max >= .75) S.complete();   // a plain tap, or a slide past three quarters
      else { cls('rc-back'); set(0); }
    }
    tr.addEventListener('pointerup', up); tr.addEventListener('pointercancel', up);
    /* Enter or Space on the track (a real button). Taps and clicks were already handled above. */
    tr.addEventListener('click', function (e) { if (e.detail === 0) S.complete(); });
    S.reset();
  }

  /* drawn by renderProTab whenever the Recap tab is shown to a signed-in user */
  window.rcTabRender = function (el) {
    T.el = el;
    document.body.classList.add('rc-on');
    var u = unlockedNow();
    if (isOpen() && u && !T.unlocked && el.querySelector('.rc-tab')) return;   // just watched: the unlock plays when the slideshow closes
    if (!el.querySelector('.rc-tab')) { T.unlocked = u; build(); return; }
    if (u !== T.unlocked) { T.unlocked = u; paint(); } else place();
    setClip();
  };
  /* called when the Recap tab shows something else (signed out) */
  window.rcTabOff = function () { document.body.classList.remove('rc-on'); T.el = null; };

  /* messages from the recap pages this screen loads (js/recap.js): the small preview says what it is playing,
     and the slideshow says when the last card was reached */
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.origin !== location.origin || !d || !T.el || !T.el.isConnected) return;
    if (d.rc === 'clip') {
      var f = q('.rc-clip'); if (!f || e.source !== f.contentWindow) return;
      if (d.ok) { T.mine = !d.sample; badge(); if (d.cards) setCards(d.cards); }
      else if (T.clip.indexOf('sample=1') < 0) { T.noReal = myLeague(); setClip(); }   // their own recap would not load: keep the sample playing
    } else if (d.rc === 'watched' && d.league) {
      var k = d.league + ':' + d.year;
      markSeen(k);
      if (!T.unlocked && k === seenKey()) T.fresh = true;
    }
  });

  /* the one-time unlock, played when the user comes back from watching: side cards fade up left to right, locks fade out, badge flips */
  function unlock() {
    T.fresh = false; T.noReal = '';
    if (T.unlocked || !unlockedNow()) return;
    var root = q('.rc-tab'), sides = qa('.rc-side:not([data-off])'), chips = qa('.rc-chip'), step = reduce() ? 0 : 80;
    sides.sort(function (a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
    sides.forEach(function (b, i) { b.style.setProperty('--d', i * step + 'ms'); });
    chips.forEach(function (c, i) { c.style.setProperty('--d', Math.min(i, 6) * step / 2 + 'ms'); });
    root.classList.add('rc-unlocking');
    T.unlocked = true; paint(); setClip();
    setTimeout(function () { root.classList.remove('rc-unlocking'); qa('.rc-side,.rc-chip').forEach(function (b) { b.style.removeProperty('--d'); }); }, sides.length * step + 900);
  }

  document.addEventListener('click', function (e) {
    if (!live()) return;
    var mv = e.target.closest('[data-rc-move]');
    if (mv && T.el.contains(mv)) { T.off += +mv.dataset.rcMove; place(); return; }
    var c = e.target.closest('[data-rc-card]');
    if (c && T.el.contains(c) && T.unlocked && !c.hasAttribute('aria-disabled') && !c.disabled) openAt(+c.dataset.rcCard);
  });
  /* Enter anywhere on the screen starts the recap, unless another control has the focus */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.defaultPrevented || !live() || isOpen() || !T.track) return;
    var a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement) return;
    e.preventDefault(); T.track.complete();
  });
  /* back from the slideshow: put the knob back at the start */
  document.addEventListener('tm-recap-close', function () { if (!T.el || !T.el.isConnected || !T.track) return; T.track.reset(); if (T.fresh) unlock(); });
  var rz = 0;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (live()) { place(); if (T.track && !T.track.done) T.track.reset(); } }, 80); });
})();
