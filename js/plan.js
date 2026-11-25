/* ===== Plans: who sees what (free vs Pro) =====
   The server decides; this file only asks it. GET /api/plan answers { beta, signedIn, plan, pro, betaUser }.
   The beta switch (TM_BETA_PRO in Vercel, see api/_plan.js) is the only switch. While it is on, every signed-in
   account has Pro and the site behaves exactly as it did before plans existed. Once it is off:
     signed out    rankings and top news stories; everything else asks them to sign in
     free account  the same, plus their account and joining a friend's mock draft by invite link;
                   everything else shows the upgrade screen
     Pro           everything
   The server's API routes refuse Pro data on their own (api/_plan.js), so hiding things here is only the display.
   Loaded right after telemetry.js, before the app. Everything here reads the app's globals (USER, SB, tab, go) only
   when it is called. */

/* ---- price and plan details (no payments yet: the button says "Coming soon") ---- */
var TM_PRICES={
  base:{monthly:5,annual:40,trialDays:7},
  higher:{monthly:7,annual:50,trialDays:7}};      /* the second arm of the PostHog "price-test" flag (off for now) */
var TM_PRO_LIST=['Trade analyzer, Trade Score and trade ideas','My Team: lineup, matchups and start or sit','Waiver wire, trade values and Season Sim','News on your players, alerts and big-play banners','AI Helper, mock drafts and your season recap'];
/* what each locked thing is called on the upgrade screen */
var TM_FEAT={team:'My Team',trade:'Trades',season:'Season Sim',hub:'League',waivers:'The waiver wire',values:'Trade values',following:'Following your players',injuries:'Injury news',clips:'Clips',alerts:'Alerts',ai:'The AI Helper',push:'Push notifications',draft:'Mock drafts',recap:'Your season recap',news:'Player news'};
var TM_PRO_TABS=['team','trade','season','hub','draft','recap'];
var TM_OPEN_TABS=['rankings','news','help'];             /* open to signed-out visitors once the beta is over */

var TM_PLAN={beta:null,signedIn:false,plan:null,pro:null,betaUser:false,uid:null,at:0,busy:null};
var TM_UPG={feat:'',shown:''};
(function(){try{const c=JSON.parse(localStorage.getItem('tm-plan-v1')||'null');if(c&&typeof c.beta==='boolean')Object.assign(TM_PLAN,c,{at:0,busy:null})}catch(e){}})();

const tmUser=()=>typeof USER!=='undefined'&&USER?USER:null;
/* is the beta on? Until the server has answered once, yes (that is how the site has always behaved). */
function tmBeta(){return TM_PLAN.beta!==false}
/* the one question the page asks: does this person get Pro features right now? */
function tmIsPro(){const u=tmUser();if(!u)return false;if(TM_PLAN.uid!==u.id)return tmBeta();return !!TM_PLAN.pro}
/* a signed-in account without Pro (only possible once the beta is over) */
function tmFree(){return !!tmUser()&&!tmIsPro()}
/* signed out, beta over: rankings and top stories are open to look at */
function tmOpen(){return !tmUser()&&TM_PLAN.beta===false}
/* the plan's name for the account area and for analytics */
function tmPlanKey(){if(!tmUser())return 'none';if(TM_PLAN.uid===tmUser().id&&TM_PLAN.plan==='pro')return 'pro';return tmBeta()?'beta':'free'}
/* prices to show: the "price-test" flag picks one; if it is off or can't load, the $5 / $40 default */
function tmPrices(){let v=null;try{v=window.posthog&&posthog.getFeatureFlag?posthog.getFeatureFlag('price-test'):null}catch(e){}
  return {variant:v==='higher'?'higher':'base',...(v==='higher'?TM_PRICES.higher:TM_PRICES.base)}}

/* the person's own sign-in token, sent with Pro data requests once the beta is over (during it nothing changes) */
async function tmToken(){try{if(typeof SB!=='undefined'&&SB&&tmUser()){const {data}=await SB.auth.getSession();return (data&&data.session&&data.session.access_token)||''}}catch(e){}return ''}
async function tmFetch(url,opts){if(TM_PLAN.beta===true||!tmUser())return fetch(url,opts);
  const t=await tmToken();if(!t)return fetch(url,opts);
  const o={...(opts||{})};o.headers={...(o.headers||{}),authorization:'Bearer '+t};return fetch(url,o)}

/* ask the server. `wait` (ms): how long a caller is willing to wait when nothing is known yet for this person */
function tmPlanLoad(wait){const u=tmUser(),uid=u?u.id:null;
  if(!TM_PLAN.busy)TM_PLAN.busy=(async()=>{try{
      const t=await tmToken(),r=await fetch('/api/plan',{headers:t?{authorization:'Bearer '+t}:{},cache:'no-store'});
      if(!r.ok)return;const j=await r.json();if(typeof j.beta!=='boolean')return;
      const now=tmUser(),before=JSON.stringify([tmIsPro(),tmOpen(),tmPlanKey()]);
      Object.assign(TM_PLAN,{beta:j.beta,signedIn:!!j.signedIn,plan:j.plan||null,pro:!!j.pro,betaUser:!!j.betaUser,uid:j.signedIn&&now?now.id:null,at:Date.now()});
      try{localStorage.setItem('tm-plan-v1',JSON.stringify({beta:TM_PLAN.beta,signedIn:TM_PLAN.signedIn,plan:TM_PLAN.plan,pro:TM_PLAN.pro,betaUser:TM_PLAN.betaUser,uid:TM_PLAN.uid}))}catch(e){}
      if(JSON.stringify([tmIsPro(),tmOpen(),tmPlanKey()])!==before)tmPlanChanged();else tmBodyFlags();
      window.TMT&&TMT.people()}catch(e){}finally{TM_PLAN.busy=null}})();
  const p=TM_PLAN.busy;
  if(!wait||(uid&&TM_PLAN.uid===uid)||(!uid&&TM_PLAN.beta!==null))return Promise.resolve();   /* already known: refresh quietly */
  return Promise.race([p,new Promise(r=>setTimeout(r,wait))])}

function tmBodyFlags(){const b=document.body;if(!b)return;b.classList.toggle('tm-free',tmFree());b.classList.toggle('tm-open',tmOpen())}
/* what someone can see just changed: re-check the page they're on */
function tmPlanChanged(){tmBodyFlags();try{if(typeof go==='function'&&typeof tab!=='undefined'&&tab!=='signin'&&(tmUser()||tmOpen()))go(location.hash.slice(1)||'team');
  else if(typeof tab!=='undefined'&&tab==='account'&&typeof renderAccount==='function')renderAccount()}catch(e){}}

/* where a free account lands after signing in */
function tmHome(){return tmIsPro()?'team':'rankings'}

/* Called by go() in app.js for every page change. Returns the page to show instead (signin or upgrade) when this
   person can't see the one asked for. `want` has its aliases already resolved (players -> rankings, etc.). */
function tmGate(want){const u=tmUser();let t=want||'';
  if(t.startsWith('upgrade')){TM_UPG.feat=t.slice(8)||TM_UPG.feat||'';t='upgrade'}
  if(!u){if(t==='signin')return t;
    if(tmOpen()){
      if(TM_OPEN_TABS.includes(t)&&!(t==='rankings'&&typeof plView!=='undefined'&&plView!=='rank'))return t;
      if(t&&t!=='upgrade'&&typeof INTENDED!=='undefined')INTENDED=want;   /* after signing in, take them where they meant to go */
    }
    return 'signin'}
  if(tmIsPro())return t==='upgrade'?(TM_UPG.feat&&TM_PRO_TABS.includes(TM_UPG.feat)?TM_UPG.feat:'team'):t;
  if(t==='upgrade')return t;
  if(t==='rankings'&&typeof plView!=='undefined'&&plView!=='rank'){TM_UPG.feat=plView==='waiv'?'waivers':'values';plView='rank';return 'upgrade'}
  if(TM_PRO_TABS.includes(t)){TM_UPG.feat=t;return 'upgrade'}
  return t}

/* open the upgrade screen for something that isn't a page (the AI Helper, alerts, a News view) */
function tmUpgrade(feat){if(!tmUser()){if(typeof showSignin==='function')showSignin();return}
  TM_UPG.feat=feat||'';const h='upgrade-'+(feat||'pro');if(location.hash.slice(1)===h&&typeof go==='function')go(h);else location.hash=h}

function tmPrice(n){return Number.isInteger(n)?String(n):n.toFixed(2)}
function tmRenderUpgrade(){const el=document.getElementById('upgrade-body');if(!el)return;
  const f=TM_UPG.feat,name=TM_FEAT[f],P=tmPrices(),save=Math.round((1-P.annual/(P.monthly*12))*100);
  const check='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  el.innerHTML=`<div class="upg">
    <div class="upg-head"><div class="kicker">TradeMetric Pro</div><h1>${name?`${name} ${/s$/.test(name)&&!/news$/i.test(name)?'are':'is'} part of Pro`:'Get TradeMetric Pro'}</h1>
      <p>Rankings and top stories stay free. Pro adds every tool for winning trades and your league.</p></div>
    <div class="card upg-card">
      <ul class="upg-list">${TM_PRO_LIST.map(x=>`<li>${check}<span>${x}</span></li>`).join('')}</ul>
      <div class="upg-price" data-price="${P.variant}">
        <div class="upg-opt"><b>$${tmPrice(P.monthly)}</b><span>a month</span></div>
        <div class="upg-opt"><b>$${tmPrice(P.annual)}</b><span>a year${save>0?` <em>save ${save}%</em>`:''}</span></div>
      </div>
      <p class="upg-trial">Starts with a ${P.trialDays}-day free trial. Cancel anytime.</p>
      <button type="button" class="btn accent upg-go" id="upg-go" aria-describedby="upg-soon">Coming soon</button>
      <p class="note upg-soon" id="upg-soon">Pro sign-up opens soon.</p>
    </div>
    <p class="upg-back"><a href="#rankings">Back to the free rankings</a></p></div>`;
  document.querySelectorAll('.nav button').forEach(b=>{if(b.dataset.tab===f)b.setAttribute('aria-current','page')});
  const key=f+'|'+location.hash;if(TM_UPG.shown!==key){TM_UPG.shown=key;window.TMT&&TMT.ev('upgrade_screen_shown',{feature:f||'pro',price_variant:P.variant})}}

/* Account -> Subscription: the current plan */
function tmPlanCard(){const k=tmPlanKey();
  const t={beta:['Beta: Pro features unlocked','Every Pro feature is free for your account while TradeMetric is in beta.'],
    pro:['Pro','Every TradeMetric feature is unlocked.'],
    free:['Free','Rankings, top news stories and joining a friend\'s mock draft. Pro unlocks the rest.']}[k]||['Free',''];
  return `<section class="card acc-sec upg-plan"><header class="acc-sec-h"><h2>Your plan</h2></header>
    <div class="upg-plan-row"><div><b class="upg-plan-name">${t[0]}</b><p class="note">${t[1]}</p></div>${k==='free'?'<a class="btn accent" href="#upgrade-pro">See Pro</a>':''}</div></section>`}

/* ---- clicks on locked things: send them to the upgrade screen (or sign-in) instead ---- */
document.addEventListener('click',e=>{const t=e.target;if(!t||!t.closest||tmIsPro()||!(tmUser()||tmOpen()))return;
  let feat=null,el;
  if((el=t.closest('#pl-seg [data-pl]'))&&el.dataset.pl!=='rank')feat=el.dataset.pl==='waiv'?'waivers':'values';
  else if((el=t.closest('#tmn-seg [data-nf]'))&&el.dataset.nf!=='all')feat=el.dataset.nf==='inj'?'injuries':'clips';
  else if(t.closest('#tmn-tog [data-nshow="mine"]')||t.closest('[data-tm-follow]'))feat='following';
  else if(t.closest('.tmn-gear'))feat='alerts';
  else if(t.closest('#ai-fab'))feat='ai';
  else if(t.closest('#alert-btn'))feat='alerts';
  else if((el=t.closest('.nav button[data-tab], .m-sheet a[data-m]'))){const w=el.dataset.tab||el.dataset.m;
    if(TM_PRO_TABS.includes(w)&&tmUser())window.TMT&&TMT.ev('locked_tab_clicked',{wanted_tab:w,plan:'free'});return}
  if(!feat)return;
  e.preventDefault();e.stopPropagation();
  if(!tmUser()){window.TMT&&TMT.ev('locked_tab_clicked',{wanted_tab:feat,how:'feature'});if(typeof INTENDED!=='undefined')INTENDED=null;if(typeof showSignin==='function')showSignin();return}
  tmUpgrade(feat)},true);
document.addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('#upg-go');if(!b)return;
  window.TMT&&TMT.ev('upgrade_button_clicked',{feature:TM_UPG.feat||'pro',price_variant:tmPrices().variant});
  const n=document.getElementById('upg-soon');if(n){n.classList.add('on')}});

/* first answer at load (signed out: is the beta on?), then every 30 minutes and when the tab comes back */
document.addEventListener('DOMContentLoaded',tmBodyFlags);
setTimeout(()=>{if(!tmUser())tmPlanLoad()},0);
setInterval(()=>{if(!document.hidden)tmPlanLoad()},30*60e3);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-TM_PLAN.at>10*60e3)tmPlanLoad()});
