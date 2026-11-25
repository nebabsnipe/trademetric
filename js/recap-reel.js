/* TradeMetric Season Recap: the short preview "video" shown in the phone frame on the site's Recap tab.
   It is not a video file. It is the real recap page (recap.html, opened with ?reel=1) with its real cards, moved like
   the designed clip: the cover fills the screen, pulls back into a stack of cards, the stack flicks through with each
   card's name underneath, and the view pushes in on the best trade, the standings race and the share card. Then it loops.
   Because the cards are the real ones, the same clip plays the sample league (?sample=1) or the user's own league.
   js/recap.js hands over a small set of controls (cover, show a card, move the clock, speed). Styles: css/recap-reel.css. */
(function () {
  var STACK = 'translateY(72px) scale(.7)', HOLD = 'translateY(56px) scale(.74)', FULL = 'translateY(0px) scale(1)';
  var EASE = 'cubic-bezier(.3,.8,.3,1)';
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function two(n) { return (n < 10 ? '0' : '') + n; }

  function run(api) {
    var root = api.root, stage = api.stage, cards = api.cards, n = cards.length;
    var bg = document.createElement('div'); bg.className = 'rc-reel-bg'; bg.innerHTML = '<i></i><i></i>';
    var e2 = document.createElement('div'); e2.className = 'rc-reel-edge rc-e2';
    var e1 = document.createElement('div'); e1.className = 'rc-reel-edge rc-e1';
    var lbl = document.createElement('div'); lbl.className = 'rc-reel-lbl'; lbl.innerHTML = '<small></small><b></b>';
    stage.insertBefore(bg, root); stage.insertBefore(e2, root); stage.insertBefore(e1, root); stage.appendChild(lbl);

    function idx(keys) { for (var i = 0; i < keys.length; i++) for (var j = 0; j < n; j++) if (cards[j].key === keys[i]) return j; return -1; }
    function glow() { var s = root.style, b = bg.children; b[0].style.backgroundColor = s.getPropertyValue('--rc-ga') || '#7c3aed'; b[1].style.backgroundColor = s.getPropertyValue('--rc-gb') || '#f59e0b'; }
    function label(i) { lbl.firstChild.textContent = i < 0 ? api.year : two(i + 1) + ' / ' + two(n); lbl.lastChild.textContent = i < 0 ? 'Season Recap' : cards[i].title; }
    function pose(t, ms, ease) { root.style.transition = ms ? 'transform ' + ms + 'ms ' + (ease || EASE) : 'none'; root.style.transform = t; stage.classList.toggle('rc-reel-on', t !== FULL); }
    function anims() { return root.getAnimations ? root.getAnimations({ subtree: true }) : []; }
    function finite(a) { try { return a.effect.getComputedTiming().iterations !== Infinity; } catch (e) { return false; } }
    /* a card shown already finished (for the ones the stack only flicks past) */
    function settled(i) { api.speed(1); api.show(i); api.seek(3400); anims().forEach(function (a) { if (finite(a)) { try { a.finish(); } catch (e) {} } }); }
    /* a card shown from its start, playing k times faster than normal */
    function fresh(i, k) { api.show(i); api.speed(k); anims().forEach(function (a) { if (finite(a)) a.playbackRate = k; }); }
    /* the top card flies off the stack and the next one is underneath */
    function flick(next, i) {
      var g = root.cloneNode(true); g.removeAttribute('id'); g.classList.add('rc-ghost');
      g.style.transition = 'transform .44s cubic-bezier(.5,0,.8,.4),opacity .44s ease-in'; g.style.transform = root.style.transform;
      stage.appendChild(g);
      next(); glow(); label(i);
      if (root.animate) root.animate([{ transform: 'translateY(86px) scale(.66)' }, { transform: STACK }], { duration: 340, easing: EASE });
      requestAnimationFrame(function () { requestAnimationFrame(function () { g.style.transform = 'translateY(-640px) scale(.7) rotate(-6deg)'; g.style.opacity = '0'; }); });
      setTimeout(function () { g.remove(); }, 520);
    }
    /* push in on a card, let it play, pull back */
    async function focus(i, k, ms) {
      flick(function () { fresh(i, k); }, i); await sleep(380);
      pose(FULL, 460); await sleep(ms);
      pose(STACK, 420); await sleep(520); api.speed(1);
    }
    async function pass(i) { flick(function () { settled(i); }, i); await sleep(520); }

    var a = idx(['myTrades', 'leagueTrades']), b = idx(['best', 'worst', 'defining']), c = idx(['fleece']), d = idx(['waivers']),
      r = idx(['timelapse', 'bestWeeks']), f = idx(['beatdown', 'clutch']), sh = idx(['share']);

    async function once() {
      api.speed(1); pose(FULL, 0); api.cover(); glow(); label(-1);
      await sleep(2200);
      pose(STACK, 480); await sleep(760);
      if (a >= 0 && a !== b) await pass(a);
      if (b >= 0) await focus(b, 2, 2700);
      if (c >= 0) await pass(c);
      if (d >= 0) await pass(d);
      if (r >= 0) await focus(r, cards[r].key === 'timelapse' ? 4 : 2, 2600);
      if (f >= 0 && f !== r) await pass(f);
      if (sh >= 0) { flick(function () { fresh(sh, 1.5); }, sh); await sleep(380); pose(HOLD, 2800, 'ease-out'); await sleep(3000); pose(STACK, 300); await sleep(300); }
      flick(function () { api.speed(1); api.cover(); anims().forEach(function (x) { if (finite(x)) { try { x.finish(); } catch (e) {} } }); }, -1);
      await sleep(620);
    }

    if (api.reduce) { pose(FULL, 0); api.cover(); glow(); return; }   // "reduce motion": the cover, still
    (async function () { for (;;) { try { await once(); } catch (e) { await sleep(1000); } } })();
  }
  window.rcReel = { run: run };
})();
