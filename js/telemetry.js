/* Behind-the-scenes monitoring. Nothing here changes what visitors see.
   - Sentry: tells the owner when the site breaks (errors, failed data feeds).
   - PostHog: counts what people do (tabs used, imports, trades rated) and records a sample of visits.
   Loaded first, before the app. Both services are optional: ad blockers block them, and the site must work the
   same without them, so every call goes through `safe()` and quietly does nothing when a service is missing.
   Never sends emails, usernames, league names, team names or league codes.
   The rest of the site talks to this file through window.TMT (each call site checks that it exists). */
(function () {
  'use strict';
  var noop = function () {};
  var safe = function (f) { return function () { try { return f.apply(null, arguments); } catch (e) { /* never let monitoring break the site */ } }; };

  /* ---------- where are we running ---------- */
  var host = location.hostname;
  var ENV = /(^|\.)trademetric\.app$/.test(host) ? 'production' : /\.vercel\.app$/.test(host) ? 'preview' : null;   // localhost and anything else: send nothing
  var API = { ev: noop, page: noop, auth: noop, people: noop, reset: noop, imp: noop, rated: noop, env: ENV };
  window.TMT = API;
  if (!ENV) return;

  var SENTRY_DSN = 'https://1576ac15d5510fadbe24991ccf8dcba2@o4512492752535552.ingest.us.sentry.io/4512492764397568';
  var SENTRY_SRC = 'https://browser.sentry-cdn.com/11.17.0/bundle.tracing.min.js';
  var SENTRY_SRI = 'sha384-+zTukjoNQLRt+RvEW1AeK6Q2NkfCRdUfYWq15RXq2d4w7AAXp7P6HB4JVJiVaRzu';
  var PH_TOKEN = 'phc_BGgxBRAvtxPWREP6TqHWFPi2vrpUmshLSbRRh533oj4r';
  var PH_HOST = 'https://us.i.posthog.com';

  /* Do Not Track / Global Privacy Control: still counted anonymously, but never recorded or identified */
  var DNT = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1';

  /* ---------- helpers that read the app's state (all optional) ---------- */
  var g = function (name) { try { return (0, eval)('typeof ' + name + "!=='undefined'?" + name + ':undefined'); } catch (e) { return undefined; } };
  var curTab = function () { return g('tab') || (location.hash.slice(1).replace(/-.*/, '') || null); };
  var layout = function () { try { return matchMedia('(max-width:700px)').matches ? 'phone' : 'desktop'; } catch (e) { return 'desktop'; } };
  var platform = function () { var S = g('S'); var t = S && S.real && S.real.src && S.real.src.type; return t || (S && !S.noLeague && S.teams && S.teams.length ? 'custom' : 'none'); };
  var platforms = function () {
    var S = g('S'), out = [];
    ((S && S.leagues) || []).forEach(function (l) { var t = (l && l.snap && l.snap.real && l.snap.real.src && l.snap.real.src.type) || 'custom'; if (out.indexOf(t) < 0) out.push(t); });
    return out;
  };
  /* "c46.n28.a38.m4.p5.t1": the ?v= numbers of the files this page loaded, so each report says which version it came from */
  var BUILD = '';
  var build = function () {
    var v = {}, keys = { 'css/styles.css': 'c', 'js/news.js': 'n', 'js/app.js': 'a', 'js/mobile.js': 'm', 'js/polish.js': 'p', 'js/deadline.js': 'd', 'js/telemetry.js': 't', 'js/plan.js': 'l' };
    var txt = [].map.call(document.querySelectorAll('link[rel=stylesheet],script'), function (el) { return (el.getAttribute('href') || el.getAttribute('src') || '') + ' ' + (el.src ? '' : el.textContent); }).join(' ');
    var re = /((?:css|js)\/[a-z]+\.(?:css|js))\?v=(\d+)/g, m;
    while ((m = re.exec(txt))) if (keys[m[1]]) v[keys[m[1]]] = m[2];
    BUILD = ['c', 'n', 'a', 'd', 'm', 'p', 't', 'l'].filter(function (k) { return v[k]; }).map(function (k) { return k + v[k]; }).join('.') || 'unknown';
    return BUILD;
  };
  build();

  /* strip anything personal out of text before it leaves the browser */
  var scrub = function (s) {
    if (typeof s !== 'string') return s;
    return s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      .replace(/(api\.sleeper\.app\/v1\/user\/)[^/?#\s]+/g, '$1:user')
      .replace(/(\/(?:leagues?|league_id=|leagueId=))\/?\d{3,}/gi, '$1:id')
      .replace(/(espn_s2|swid)=[^&\s;]+/gi, '$1=[x]');
  };

  /* ================= Sentry ================= */
  var sentryReady = false, early = [];
  var onEarly = function (e) { if (early.length < 10) early.push(e && (e.error || e.reason || e.message)); };
  addEventListener('error', onEarly);
  addEventListener('unhandledrejection', onEarly);
  var S_ = function () { return sentryReady && window.Sentry; };   // Sentry, only once it's set up
  var sentryTags = function (ev) {
    ev.tags = ev.tags || {};
    ev.tags.tab = ev.tags.tab || curTab() || 'none';
    ev.tags.platform = ev.tags.platform || platform();
    ev.tags.layout = layout();
    ev.tags.build = BUILD;
    return ev;
  };
  var sentryInit = safe(function () {
    var Sentry = window.Sentry;
    if (!Sentry || !Sentry.init || sentryReady) return;
    build();
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: ENV,
      release: 'trademetric@' + BUILD,
      dataCollection: { userInfo: false, httpBodies: [], httpHeaders: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user', 'cookie', 'authorization'] }, cookies: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] }, urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user', 'apikey', 'token'] } },   // no IP addresses or other personal data
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: 0.05,                                  // 1 in 20 page loads timed; keeps volume low
      tracePropagationTargets: [/^\/api\//],
      denyUrls: [/extensions\//i, /^chrome(-extension)?:\/\//i, /^moz-extension:\/\//i, /^safari-(web-)?extension:\/\//i, /^webkit-masked-url:/i],
      ignoreErrors: [
        'ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications',
        /^AbortError\b/, 'The user aborted a request', 'The operation was aborted', 'signal is aborted without reason',
        'Non-Error promise rejection captured', /^Script error\.?$/,
        /instantSearchSDKJSBridgeClearHighlight/, /__gCrWeb/, /zaloJSV2/,             // in-app browsers and extensions
      ],
      beforeBreadcrumb: function (b) {
        if (!b) return b;
        if (b.data && b.data.url) b.data.url = scrub(b.data.url);
        if (b.message) b.message = scrub(b.message);
        return b;
      },
      beforeSend: function (ev) {
        if (ev.request) { if (ev.request.url) ev.request.url = scrub(ev.request.url); delete ev.request.cookies; }
        if (ev.message) ev.message = scrub(ev.message);
        (ev.exception && ev.exception.values || []).forEach(function (x) { x.value = scrub(x.value); });
        ev.user = ev.user && ev.user.id ? { id: ev.user.id, ip_address: null } : { ip_address: null };   // the Supabase user id only; null stops Sentry from filling in the IP
        return sentryTags(ev);
      },
    });
    sentryReady = true;
    Sentry.setTags({ layout: layout(), build: BUILD });                  // also on timing data; tab and platform update as they change
    removeEventListener('error', onEarly);
    removeEventListener('unhandledrejection', onEarly);
    early.splice(0).forEach(function (e) { if (e) Sentry.captureException(e); });
    var U = g('USER');
    if (U && U.id && !DNT) Sentry.setUser({ id: U.id });
  });
  var sentryLoaded = false, domReady = document.readyState !== 'loading';
  var trySentry = function () { if (sentryLoaded && domReady) sentryInit(); };
  if (!domReady) document.addEventListener('DOMContentLoaded', function () { domReady = true; build(); trySentry(); });
  safe(function () {
    var s = document.createElement('script');
    s.src = SENTRY_SRC; s.integrity = SENTRY_SRI; s.crossOrigin = 'anonymous'; s.async = true;
    s.onload = function () { sentryLoaded = true; trySentry(); };
    s.onerror = noop;                                           // blocked: the site carries on without it
    document.head.appendChild(s);
  })();

  /* A league platform or data feed called straight from the browser failed: its own named issue, so "their feed is
     down" is easy to tell apart from "our bug". Not reported: private ESPN leagues (401/403), unknown leagues (404),
     the visitor cancelling, or being offline. Each kind at most once per visit. */
  var FEEDS = [
    [/(^|\.)api\.sleeper\.(app|com)$/, 'sleeper'],
    [/^lm-api-reads\.fantasy\.espn\.com$/, 'espn-fantasy'],
    [/^site\.api\.espn\.com$/, 'espn-site'],
  ];
  var feedSeen = {};
  var feedFail = safe(function (url, status, err) {
    var u = new URL(url, location.href), src = null;
    FEEDS.forEach(function (f) { if (!src && f[0].test(u.hostname)) src = f[1]; });
    if (!src) return;
    if (status === 401 || status === 403 || status === 404) return;
    if (!status && (!navigator.onLine || (err && err.name === 'AbortError'))) return;
    var what = status ? String(status) : 'unreachable', key = src + what;
    if (feedSeen[key]) return; feedSeen[key] = 1;
    var Sentry = S_(); if (!Sentry) return;
    var path = scrub(u.pathname).replace(/\/\d+(?=\/|$)/g, '/:n');
    Sentry.captureEvent({
      message: 'Feed failed: ' + src + ' ' + what + ' (from the browser)', level: 'warning',
      fingerprint: ['upstream-feed', 'browser', src, what],
      tags: { kind: 'upstream', upstream: src, upstream_status: what, route: 'browser:' + path },
    });
  });
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, opts) {
      var url = ''; try { url = String(input && input.url || input); } catch (e) {}
      var p = origFetch.apply(this, arguments);
      if (!/^https:\/\/(api\.sleeper\.|lm-api-reads\.fantasy\.espn|site\.api\.espn)/.test(url)) return p;
      return p.then(function (r) { if (!r.ok) feedFail(url, r.status); return r; }, function (e) { feedFail(url, 0, e); throw e; });
    };
  }

  /* ================= PostHog ================= */
  /* Official snippet (posthog.com/docs/libraries/js), unchanged */
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group identify setPersonProperties setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags resetGroups onFeatureFlags addFeatureFlagsHandler onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  /* the sign-in and account screens are never recorded and their clicks are never counted */
  var PRIVATE = '#v-signin, #v-account, .acc-shell, .espn-priv';
  safe(function () {
    posthog.init(PH_TOKEN, {
      api_host: PH_HOST,
      defaults: '2026-08-30',
      person_profiles: 'identified_only',
      capture_pageview: false,                                  // sent by hand on every tab change (below)
      capture_pageleave: true,
      capture_exceptions: false,                                // errors go to Sentry
      autocapture: { css_selector_ignorelist: ['.ph-no-autocapture', '[data-ph-no-autocapture]', '#v-signin', '#v-account', '.acc-shell', '.espn-priv'] },
      mask_all_text: true,                                      // button text can hold league or team names
      disable_session_recording: DNT,
      disable_surveys: true,
      session_recording: { sampleRate: 0.25, maskAllInputs: true, blockSelector: PRIVATE },
      before_send: function (ev) {
        if (!ev || !ev.properties) return ev;
        var p = ev.properties;
        Object.keys(p).forEach(function (k) { if (typeof p[k] === 'string') p[k] = scrub(p[k]); });
        if (ev.$set) Object.keys(ev.$set).forEach(function (k) { if (typeof ev.$set[k] === 'string') ev.$set[k] = scrub(ev.$set[k]); });
        return ev;
      },
    });
    posthog.register({ environment: ENV, build: BUILD, layout: layout() });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { safe(function () { posthog.register({ build: build() }); })(); });
  })();
  var PH = function () { return window.posthog && window.posthog.capture ? window.posthog : null; };

  /* ================= the API the app calls ================= */
  var ev = safe(function (name, props) {
    var ph = PH(); if (!ph) return;
    props = props || {};
    if (props.tab === undefined) props.tab = curTab();
    props.layout = layout();
    ph.capture(name, props);
  });
  API.ev = ev;

  var lastPage = null, lockedTab = null, signinShown = false;
  API.page = safe(function (t) {
    var Sentry = S_(); if (Sentry) Sentry.setTags({ tab: t, platform: platform(), layout: layout() });
    if (t === lastPage) return;
    var from = lastPage; lastPage = t;
    var ph = PH();
    if (ph) {
      ph.register({ layout: layout() });
      ph.capture('$pageview', { tab: t, from_tab: from, $current_url: location.origin + location.pathname + '#' + t });
    }
    var signedIn = !!(g('USER'));
    if (t === 'rankings') ev('rankings_viewed', { view: g('plView') || 'rank', signed_in: signedIn });
    if (t === 'signin' && !signedIn) {
      signinShown = true;
      var want = lockedTab || (g('INTENDED') || '').replace(/-.*/, '') || null;
      ev('signin_prompt_shown', { reason: lockedTab ? 'locked_tab' : want && want !== 'signin' ? 'link_to_tab' : 'visit', wanted_tab: want && want !== 'signin' ? want : null });
      lockedTab = null;
    } else if (from === 'signin' && signinShown && !signedIn) { signinShown = false; ev('signin_prompt_dismissed', { how: 'navigated' }); }
  });
  addEventListener('pagehide', safe(function () {
    if (signinShown && lastPage === 'signin' && !g('USER')) { var ph = PH(); if (ph) ph.capture('signin_prompt_dismissed', { how: 'left_site', tab: 'signin', layout: layout() }, { transport: 'sendBeacon' }); signinShown = false; }
  }));

  /* person properties: plan, when the account was made, how many leagues and which platforms. Nothing else. */
  API.people = safe(function () {
    var U = g('USER'); if (!U || !U.id || DNT) return;
    var ph = PH(); if (!ph) return;
    var S = g('S'), planKey = g('tmPlanKey'), plan = 'beta';
    try { plan = typeof planKey === 'function' ? planKey() : 'beta'; } catch (e) {}   // 'beta' (Pro unlocked during the beta), 'free' or 'pro'
    var n = ((S && S.leagues) || []).length, P = g('TM_PLAN');
    ph.setPersonProperties({ plan: plan, beta_user: !!(P && P.betaUser), leagues: n, platforms: platforms(), account_created: U.created_at ? String(U.created_at).slice(0, 10) : null });
  });

  API.auth = safe(function (user, fresh) {
    if (!user || !user.id) return;
    signinShown = false;
    var Sentry = S_();
    if (!DNT) {
      if (Sentry) Sentry.setUser({ id: user.id });
      var ph = PH(); if (ph) ph.identify(user.id);
    }
    API.people();
    if (!fresh) return;
    var method = (user.app_metadata && user.app_metadata.provider) || 'email';
    var age = Date.now() - Date.parse(user.created_at || 0);
    ev(age >= 0 && age < 3600e3 ? 'signup_completed' : 'signin_completed', { method: method });   // an account made in the last hour = a new sign-up
  });

  API.reset = safe(function () {
    var Sentry = S_(); if (Sentry) Sentry.setUser(null);
    var ph = PH(); if (ph) ph.reset();
    lastPage = null;
  });

  /* league import: started (clicks, below), succeeded (app calls ev), failed (from the message the importer shows) */
  var impPlatform = null;
  API.imp = safe(function (html) {
    if (!impPlatform) return;
    var h = String(html || ''), reason = null;
    if (/Can't reach that site/.test(h)) reason = 'blocked';
    else if (/espn-priv/.test(h)) reason = /color:var\(--bad\)/.test(h) ? 'espn_codes_rejected' : 'private_league';
    else if (/No Sleeper user/.test(h)) reason = 'user_not_found';
    else if (/has no \d+ leagues/.test(h)) reason = 'no_leagues';
    else if (/league ID is a number/.test(h)) reason = 'bad_league_id';
    else if (/didn't answer|didn't return/.test(h)) reason = 'platform_error';
    else if (/color:var\(--bad\)/.test(h)) reason = 'error';
    if (reason) { ev('league_import_failed', { platform: impPlatform, reason: reason }); if (reason !== 'private_league') impPlatform = null; }
  });
  var impStart = function (p) { impPlatform = p; ev('league_import_started', { platform: p }); };

  /* trade rated: once per finished deal (unchanged for 2 seconds), not on every click while building it */
  var rateT = null, rateSig = '', rateDone = {};
  API.rated = safe(function (give, get, grade) {
    var TD = g('TD'), sig = TD ? (TD.give || []).slice().sort().join(',') + '|' + (TD.get || []).slice().sort().join(',') : give + '|' + get;
    if (sig === rateSig) return;
    rateSig = sig; clearTimeout(rateT);
    rateT = setTimeout(function () {
      if (rateDone[sig]) return; rateDone[sig] = 1;
      var n = Object.keys(rateDone).length;
      ev('trade_rated', { players_given: give, players_received: get, platform: platform(), grade: grade, nth_this_visit: n });
    }, 2000);
  });

  /* ---------- clicks the app already handles; watched here so the app's code stays as it is ---------- */
  var ssBefore = null;
  addEventListener('click', safe(function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var c;
    if (document.body.classList.contains('signed-out') && (c = t.closest('.nav button[data-tab]')) && c.dataset.tab && c.dataset.tab !== 'signin' && !(document.body.classList.contains('tm-open') && ['rankings', 'news'].indexOf(c.dataset.tab) >= 0)) {
      lockedTab = c.dataset.hash || c.dataset.tab; ev('locked_tab_clicked', { wanted_tab: lockedTab });
    }
    if ((c = t.closest('[data-imp]'))) impStart(c.dataset.imp === 'sleeper' || c.dataset.imp === 'espn' ? c.dataset.imp : 'screenshot');
    else if (t.closest('[data-imp-league]')) impStart('sleeper');
    else if (t.closest('[data-espn-private]')) impStart('espn');
    else if (t.closest('#shot-replace, #shot-add')) ev('league_import_succeeded', { platform: 'screenshot' });
    if ((c = t.closest('#suggestions [data-load]'))) ev('trade_idea_opened', { from: 'trade_ideas', rank: [].indexOf.call(document.querySelectorAll('#suggestions [data-load]'), c) + 1 });
    else if (t.closest('[data-load]')) ev('trade_idea_opened', { from: 'player_card' });
    else if (t.closest('[data-ntrade]')) ev('trade_idea_opened', { from: 'news' });
    if (t.closest('[data-open]') || (t.closest('[data-ncard]') && !t.closest('a,button,select,input'))) ev('player_card_opened', { from: curTab() });
    if ((c = t.closest('#startsit [data-sstap]'))) {
      var SS = g('SS'), id = c.dataset.sstap; ssBefore = SS ? SS.slice() : [];
      setTimeout(safe(function () { var now = g('SS') || []; if (now.indexOf(id) >= 0 && ssBefore.indexOf(id) < 0) ev('startsit_player_added', { players_on_board: now.length }); }), 0);
    }
    if (t.closest('[data-mu-all]') && !g('MU_ALL')) ev('matchup_opened', { how: 'see_all' });
    else if ((c = t.closest('[data-act]')) && /matchup/.test(c.dataset.act)) ev('matchup_opened', { how: 'briefing' });
    if ((c = t.closest('[data-nf]'))) ev('news_filter_changed', { filter: c.dataset.nf });
    else if ((c = t.closest('[data-nshow]'))) ev('news_filter_changed', { filter: 'show:' + c.dataset.nshow });
    else if (t.closest('[data-nlg]')) ev('news_filter_changed', { filter: 'league' });
    if ((c = t.closest('a.hthumb[href], a[href*="youtube.com/watch"], a[href*="espn.com/video"]'))) ev('clip_watched', { source: /youtube/.test(c.href) ? 'youtube' : 'espn', from: curTab() });
    if (t.closest('#alert-btn')) { var pop = document.getElementById('alert-pop'); if (pop && pop.hidden) { var an = document.getElementById('alert-n'); ev('alert_opened', { unread: an && !an.hidden ? an.textContent : '0' }); } }
    if (t.closest('#dr-start')) { var DR = g('DR'); ev('mock_draft_started', { mode: (DR && DR.mode) || 'mock', teams: DR && DR.n, fast: !!(DR && DR.fast) }); }
  }), true);
  /* signed out, the tabs are hidden; a link or typed address to a tab still counts as wanting that tab */
  addEventListener('hashchange', safe(function () {
    var t = location.hash.slice(1).replace(/-.*/, '');
    if (t && t !== 'signin' && document.body.classList.contains('signed-out') && !g('USER') && !(document.body.classList.contains('tm-open') && ['rankings', 'players', 'news', 'help'].indexOf(t) >= 0)) { lockedTab = t; ev('locked_tab_clicked', { wanted_tab: t, how: 'link' }); }
  }), true);
  addEventListener('submit', safe(function (e) {
    if (e.target && e.target.id === 'tw-form') {
      var v = (document.getElementById('tw-in') || {}).value || '', chips = g('TW_CHIPS') || [];
      if (v.trim()) ev('trade_request_submitted', { from_chip: chips.indexOf(v.trim()) >= 0, length: v.trim().length });
    }
  }), true);
  addEventListener('change', safe(function (e) {
    var t = e.target; if (!t) return;
    if (t.id === 'wl-shot' || t.id === 'shot-file') { if (t.files && t.files[0]) impStart('screenshot'); }
    if (t.id === 'tmn-lg') ev('news_filter_changed', { filter: 'league' });
  }), true);
})();
