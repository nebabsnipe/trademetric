/* Recap tab: the screen people see before they start the recap slideshow.
   A wide dark stage plays the approved recap video (media/recap-sample.mp4) in the middle, with a soft blurred copy of
   the same picture filling the space around it. See-through "glass" buttons sit on that glow just under the video (the
   video itself is never covered, its caption stays readable): a big Play button that opens the slideshow and a small
   pause button, with a label saying it is the sample league.
   One side card per recap card sits either side of the stage (locked until the recap has been watched).
   Drawn by renderProTab (js/offseason.js) through rcTabRender. Styles: css/recap-tab.css. */
(function () {
  // The recap's cards, in order (same names as the slideshow's own card list).
  var CARDS = [['leagueTrades', 'League trades'], ['myTrades', 'Your trades'], ['best', 'Best trade'], ['worst', 'Worst trade'], ['defining', 'Defining trade'], ['fleece', 'Biggest fleece'],
    ['waivers', 'Waiver wire'], ['timelapse', 'Season timelapse'], ['bestWeeks', 'Best weeks'], ['beatdown', 'Biggest beatdown'], ['clutch', 'Clutch'], ['share', 'Your recap card']];
  var LOCK = '<svg class="rc-lock" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var CHEV = function (d) { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };
  var reduce = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var T = { el: null, cards: CARDS, off: 0, unlocked: false, clip: '', mine: false, fresh: false, noReal: '', inView: true, io: null, paused: false, amb: 0 };
  /* The stage always plays the video file (owner's request, 2026-11-27). Set this to true to go back to playing a live
     clip of the user's own league (/recap?reel=1) once they have watched their recap. */
  var OWN_CLIP = false;
  var ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>';
  var SEEN_LS = 'tm-recap-seen';   // this browser's copy of "watched", so the screen does not flash the locked look on load

  function season() { var n = new Date(); return n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1; }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function q(sel) { return T.el.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(T.el.querySelectorAll(sel)); }
  function mode() { var w = window.innerWidth; return w < 700 ? 'phone' : w < 1280 ? 'tablet' : 'desk'; }
  /* how many side cards fit beside the stage: four on a very wide window, two on most, none on a phone */
  function shown() {
    if (mode() === 'phone' || !T.el) return 0;
    var rail = q('.rc-rail'), fr = q('.rc-frame'); if (!rail || !fr) return 2;
    var room = rail.clientWidth / 2 - fr.offsetWidth / 2;
    return room >= 20 + 200 + 20 + 150 ? 4 : room >= 20 + 120 ? 2 : 0;
  }
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
  /* what the stage plays: the video file (T.clip is empty). Only with OWN_CLIP on: the user's own league once they
     have watched it (a live page, T.clip is its address). */
  function clipSrc() { var l = myLeague(); return OWN_CLIP && T.unlocked && l && T.noReal !== l ? '/recap?reel=1&league=' + encodeURIComponent(l) + '&year=' + season() : ''; }
  function setClip() {
    var f = q('.rc-clip'), u = clipSrc(); if (!f) return;
    if (T.clip !== u) { T.clip = u; T.mine = false; if (u) f.src = u; else f.removeAttribute('src'); badge(); }
    sync();
  }
  /* the video only runs while it can be seen: not when the browser tab is hidden, the stage is off screen, another site
     tab is showing, the slideshow is open on top, or it has been paused with the small pause button. With "reduce motion"
     on it starts paused on the still image, and the same button plays it. */
  function sync() {
    var v = q('.rc-vid'), fr = q('.rc-frame'); if (!v || !fr) return;
    var vid = !T.clip; fr.dataset.play = vid ? 'video' : 'clip';
    var on = vid && !T.paused && !document.hidden && T.inView && live() && !isOpen();
    if (on) { if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } glow(); }
    else if (!v.paused) v.pause();
    var b = q('.rc-pause'); if (b) { b.hidden = !vid; b.innerHTML = T.paused ? ICON_PLAY : ICON_PAUSE; b.setAttribute('aria-label', T.paused ? 'Play the preview' : 'Pause the preview'); }
  }
  /* the soft glow either side of the video: the video's own picture, copied small onto a canvas that the styles blur and stretch */
  function glow() {
    if (T.amb) return;
    var v = q('.rc-vid'), c = q('.rc-amb canvas'); if (!v || !c) return;
    var g = c.getContext('2d'), last = -1;
    (function tick() {
      T.amb = 0;
      if (!T.el || !c.isConnected || v.paused) return;
      if (v.readyState >= 2 && v.currentTime !== last) { last = v.currentTime; try { g.drawImage(v, 0, 0, c.width, c.height); c.dataset.on = '1'; } catch (e) {} }
      T.amb = requestAnimationFrame(tick);
    })();
  }
  function badge() { var b = q('.rc-badge b'); if (b) b.textContent = T.mine ? 'Your league' : 'Sample league'; }
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
            /* the soft glow: the still image first, then the video's own picture once it is playing */
            '<div class="rc-amb" aria-hidden="true"><canvas width="39" height="84"></canvas></div>' +
            /* the screen is exactly the video's shape (390:844), in the middle of the stage; the video is never cropped or covered */
            '<div class="rc-screen">' +
              '<video class="rc-vid" src="/media/recap-sample.mp4?v=3" poster="/media/recap-sample-poster.jpg?v=1" muted loop playsinline' + (reduce() ? ' preload="none"' : ' autoplay preload="auto"') + ' tabindex="-1" aria-hidden="true" disablepictureinpicture disableremoteplayback></video>' +
              '<iframe class="rc-clip" title="" tabindex="-1" aria-hidden="true" loading="eager"></iframe>' +
            '</div>' +
            /* under the video, on the glow: which league is playing, and the see-through buttons. Nothing sits on the video itself. */
            '<div class="rc-ctl">' +
              '<button class="rc-save rc-glass" type="button" hidden>Save video</button>' +
              '<span class="rc-badge"><b></b></span>' +
              '<div class="rc-btns">' +
                '<button class="rc-play rc-glass" type="button"><span class="rc-play-i">' + ICON_PLAY + '</span><span class="rc-play-t"></span></button>' +
                '<button class="rc-pause rc-glass" type="button"></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button class="rc-arrow" type="button" data-rc-move="1" aria-label="More cards">' + CHEV('M9.5 5.5L16 12l-6.5 6.5') + '</button>' +
      '</div>' +
      '<p class="rc-hint"></p>' +
      '<div class="rc-chips" aria-label="Recap cards">' + chipHtml() + '</div>' +
    '</div>';
    T.off = 0; T.clip = ''; T.paused = reduce(); T.going = false;
    if (T.amb) { cancelAnimationFrame(T.amb); T.amb = 0; }
    var v = q('.rc-vid'); v.muted = true; v.defaultMuted = true; v.controls = false;
    v.addEventListener('playing', glow);
    if (T.io) T.io.disconnect();
    T.inView = true; T.io = null;
    if ('IntersectionObserver' in window) { T.io = new IntersectionObserver(function (en) { T.inView = en[en.length - 1].isIntersecting; sync(); }, { threshold: .01 }); T.io.observe(q('.rc-frame')); }
    paint();
    setClip();
  }

  /* everything that differs between "not watched yet" and "watched" */
  function paint() {
    var u = T.unlocked, root = q('.rc-tab');
    root.dataset.state = u ? 'unlocked' : 'locked';
    badge();
    q('.rc-play-t').textContent = u ? 'Watch again' : 'Play your recap';
    /* "Save it" joins this line when the Save video button ships (phase 3) */
    q('.rc-hint').textContent = u ? (OWN_CLIP ? 'This one is yours. Pick any card to jump in.' : 'Pick any card to jump in.') : 'The preview shows a sample league. Press play to watch yours.';
    qa('.rc-side-s').forEach(function (s) { s.innerHTML = u ? 'Open card' : LOCK + 'Locked'; });
    qa('.rc-chip').forEach(function (c) { c.disabled = !u; });
    place();
  }

  /* where each side card sits: four beside the stage on a very wide window (small, large | large, small), two on most, none on a phone */
  function place() {
    var m = mode(), vis = shown(), u = T.unlocked, rail = q('.rc-rail'), fw = q('.rc-frame').offsetWidth || 300;
    var sw = q('.rc-screen').clientWidth; if (sw) q('.rc-frame').style.setProperty('--rc-fs', (sw / 390).toFixed(4));   // the live page is drawn at 390 wide and shrunk to the screen
    var gap = m === 'tablet' ? 12 : 20, sL = 1;
    if (vis === 2) sL = Math.max(.6, Math.min(1, (rail.clientWidth / 2 - fw / 2 - gap) / 200));
    var xL = fw / 2 + gap + 100 * sL, sS = .75, xS = xL + 100 * sL + gap + 100 * sS, far = xS + 190;
    T.off = Math.max(0, Math.min(T.cards.length - Math.max(vis, 1), T.off));
    var slots = vis === 4 ? [[-xS, sS, 0], [-xL, sL, 1], [xL, sL, 1], [xS, sS, 0]] : vis === 2 ? [[-xL, sL, 1], [xL, sL, 1]] : [];
    qa('.rc-side').forEach(function (b, i) {
      var k = i - T.off, s = slots[k], on = !!s && m !== 'phone';
      if (!s) s = [k < 0 ? -(vis === 4 ? far : xL + 260) : (vis === 4 ? far : xL + 260), vis === 4 ? .6 : sL * .8, -1];
      b.style.setProperty('--x', s[0].toFixed(1) + 'px'); b.style.setProperty('--s', s[1].toFixed(3));
      b.style.setProperty('--o', s[2] < 0 ? 0 : u ? (s[2] ? 1 : .7) : (s[2] ? .38 : .2));
      if (s[2] < 0) b.setAttribute('data-off', ''); else b.removeAttribute('data-off');
      /* locked cards do nothing */
      var can = on && u;
      b.tabIndex = can ? 0 : -1;
      if (can) { b.removeAttribute('aria-disabled'); b.removeAttribute('aria-hidden'); b.setAttribute('aria-label', 'Open card ' + (i + 1) + ', ' + T.cards[i][1]); }
      else { b.setAttribute('aria-disabled', 'true'); b.removeAttribute('aria-label'); if (!on) b.setAttribute('aria-hidden', 'true'); else b.removeAttribute('aria-hidden'); }
    });
    var ar = qa('.rc-arrow'); if (ar[0]) ar[0].disabled = T.off <= 0; if (ar[1]) ar[1].disabled = T.off >= T.cards.length - vis;
    q('.rc-row').dataset.sides = vis;
  }

  /* open the slideshow on top of the site (the layer is drawn by js/offseason.js) */
  function openAt(card) { if (isOpen() || typeof tmoRecapOpen !== 'function') return; tmoRecapOpen(card || 1); sync(); }

  /* ---------- the Play button ---------- */
  function play() {
    if (T.going || isOpen()) return;
    T.going = true;
    var b = q('.rc-play'); if (b && !reduce()) b.classList.add('rc-go');
    setTimeout(function () { openAt(1); }, reduce() ? 0 : 220);
  }
  function playReset() { T.going = false; var b = T.el && q('.rc-play'); if (b) b.classList.remove('rc-go'); }

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
      else if (T.clip) { T.noReal = myLeague(); setClip(); }   // their own recap would not load: the sample video plays instead
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
    if (e.target.closest('.rc-play') && T.el.contains(e.target)) { play(); return; }
    if (e.target.closest('.rc-pause') && T.el.contains(e.target)) { T.paused = !T.paused; sync(); return; }
    var mv = e.target.closest('[data-rc-move]');
    if (mv && T.el.contains(mv)) { T.off += +mv.dataset.rcMove; place(); return; }
    var c = e.target.closest('[data-rc-card]');
    if (c && T.el.contains(c) && T.unlocked && !c.hasAttribute('aria-disabled') && !c.disabled) openAt(+c.dataset.rcCard);
  });
  /* Enter anywhere on the screen starts the recap, unless another control has the focus */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.defaultPrevented || !live() || isOpen()) return;
    var a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement) return;
    e.preventDefault(); play();
  });
  /* back from the slideshow: the Play button is ready again */
  document.addEventListener('tm-recap-close', function () { if (!T.el || !T.el.isConnected) return; playReset(); if (T.fresh) unlock(); sync(); });
  document.addEventListener('visibilitychange', function () { if (T.el && T.el.isConnected) sync(); });
  var rz = 0;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (live()) place(); }, 80); });
})();
