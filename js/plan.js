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

/* ---- price and plan details ----
   Payments go through Stripe (api/_billing.js). The amounts the page shows come from Stripe itself (GET
   /api/billing/status), so they always match what Stripe charges. TM_PRICES below is only the fallback for the
   beta's pricing grid before Stripe is connected; nobody can pay against it. */
var TM_PRICES={
  base:{monthly:5,annual:40,trialDays:7},
  higher:{monthly:7,annual:50,trialDays:7}};      /* the second arm of the PostHog "price-test" flag (off for now) */
var TM_PRO_LIST=['Trade analyzer, Trade Score and trade ideas','My Team: lineup, matchups and start or sit','Waiver wire, trade values and Season Sim','News on your players, alerts and big-play banners','AI Helper, mock drafts and your season recap'];
/* what each locked thing is called on the upgrade screen */
var TM_FEAT={drafttools:'Mock drafts',leaguefit:'League Fit',team:'My Team',trade:'Trades',season:'Season Sim',hub:'League',waivers:'The waiver wire',values:'Trade values',following:'Following your players',injuries:'Injury news',clips:'Clips',alerts:'Alerts',ai:'The AI Helper',push:'Push notifications',draft:'Mock drafts',recap:'Your season recap',news:'Player news'};
var TM_PRO_TABS=['team','trade','season','hub','draft','recap'];
var TM_OPEN_TABS=['rankings','news','help'];             /* open to signed-out visitors once the beta is over */

var TM_PLAN={beta:null,signedIn:false,plan:null,pro:null,betaUser:false,billing:null,uid:null,at:0,busy:null};
var TM_UPG={feat:'',shown:'',choice:'yearly',busy:false,err:''};
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
      Object.assign(TM_PLAN,{beta:j.beta,signedIn:!!j.signedIn,plan:j.plan||null,pro:!!j.pro,betaUser:!!j.betaUser,billing:j.billing||null,uid:j.signedIn&&now?now.id:null,at:Date.now()});tmGraceBanner();
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

/* ---- billing: what Stripe says about this person (GET /api/billing/status) ---- */
var TM_BILL={data:null,uid:null,at:0,busy:null};
function tmBillLoad(force,extra){const u=tmUser();if(!u)return Promise.resolve(null);
  if(!force&&TM_BILL.uid===u.id&&Date.now()-TM_BILL.at<60e3)return Promise.resolve(TM_BILL.data);
  if(TM_BILL.busy&&!extra)return TM_BILL.busy;
  TM_BILL.busy=(async()=>{try{const t=await tmToken(),r=await fetch('/api/billing/status'+(extra||''),{headers:t?{authorization:'Bearer '+t}:{},cache:'no-store'});
      const j=r.ok?await r.json():null;if(j&&tmUser()&&tmUser().id===u.id){TM_BILL.data=j;TM_BILL.uid=u.id;TM_BILL.at=Date.now()}return j}
    catch(e){return null}finally{TM_BILL.busy=null;tmBillRerender()}})();
  return TM_BILL.busy}
const tmBill=()=>{const u=tmUser();return u&&TM_BILL.uid===u.id?TM_BILL.data:null};
function tmBillRerender(){try{if(typeof tab==='undefined')return;if(tab==='upgrade')tmRenderUpgrade();
  else if(tab==='account'&&typeof ACC_TAB!=='undefined'&&ACC_TAB==='plan'&&typeof renderAccount==='function')renderAccount()}catch(e){}}
/* money and dates exactly as Stripe gave them (amounts in cents) */
function tmMoney(c,cur){if(typeof c!=='number')return '';const v=c/100;
  try{return new Intl.NumberFormat('en-US',{style:'currency',currency:(cur||'usd').toUpperCase(),minimumFractionDigits:Number.isInteger(v)?0:2}).format(v)}catch(e){return '$'+tmPrice(v)}}
function tmDay(d){const x=new Date(d);return isNaN(x)?'':x.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
function tmDate(d){const x=new Date(d);return isNaN(x)?'':x.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}
const tmLiveSub=s=>!!s&&['trialing','active','past_due','unpaid'].includes(s.status);

function tmRenderUpgrade(into){const el=into||document.getElementById('upgrade-body');if(!el)return;
  const f=TM_UPG.feat,name=TM_FEAT[f],B=tmBill(),P=B&&B.prices,ready=!!(B&&B.ready&&P);
  if(!B||Date.now()-TM_BILL.at>60e3)tmBillLoad();
  const check='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const ch=TM_UPG.choice==='monthly'?'monthly':'yearly',trial=!B||B.trialEligible!==false,days=(B&&B.trialDays)||7;
  let price,how,btn;
  if(ready){const m=P.monthly,y=P.yearly,save=Math.round((1-y.amount/(m.amount*12))*100),pick=ch==='yearly'?y:m;
    const first=new Date(Date.now()+days*864e5);
    price=`<div class="upg-price" role="radiogroup" aria-label="How to pay">
        <button type="button" class="upg-opt" role="radio" data-upg-plan="monthly" aria-checked="${ch==='monthly'}"><span class="upg-opt-t">Monthly</span><b>${tmMoney(m.amount,m.currency)}</b><span>a month</span></button>
        <button type="button" class="upg-opt" role="radio" data-upg-plan="yearly" aria-checked="${ch==='yearly'}"><span class="upg-opt-t">Yearly${save>0?` <em>Best value · save ${save}%</em>`:''}</span><b>${tmMoney(y.amount,y.currency)}</b><span>a year</span></button>
      </div>`;
    how=trial?`<p class="upg-terms"><b>Your card is needed now.</b> Your first charge is <b>${tmMoney(pick.amount,pick.currency)}</b> on <b>${tmDay(first)}</b>. Cancel any time before then and you won't be charged. After that it renews ${ch==='yearly'?'every year':'every month'} until you cancel.</p>`
      :`<p class="upg-terms">You've already had your free trial. <b>${tmMoney(pick.amount,pick.currency)}</b> is charged today, then ${ch==='yearly'?'every year':'every month'} until you cancel.</p>`;
    btn=`<button type="button" class="btn accent upg-go" id="upg-go" ${TM_UPG.busy?'disabled':''}>${TM_UPG.busy?'Opening secure checkout...':trial?`Start ${days}-day free trial`:'Subscribe'}</button>
      ${TM_UPG.err?`<p class="note upg-soon on bad" id="upg-soon" role="alert">${esc_(TM_UPG.err)}</p>`:''}
      <p class="note upg-secure">Payment is handled by Stripe. Your card details never reach TradeMetric.</p>`}
  else{price=B?'':'<p class="note upg-terms">Loading prices...</p>';how='';
    btn=`<button type="button" class="btn accent upg-go" id="upg-go" aria-describedby="upg-soon" ${B?'':'disabled'}>${B?'Coming soon':'Loading...'}</button>
      <p class="note upg-soon" id="upg-soon">Pro sign-up opens soon.</p>`}
  el.innerHTML=`<div class="upg">
    <div class="upg-head"><div class="kicker">TradeMetric Pro</div><h1>${name?`${name} ${/s$/.test(name)&&!/news$/i.test(name)?'are':'is'} part of Pro`:'Get TradeMetric Pro'}</h1>
      <p>Rankings and top stories stay free. Pro adds every tool for winning trades and your league.</p></div>
    <div class="card upg-card">
      <ul class="upg-list">${TM_PRO_LIST.map(x=>`<li>${check}<span>${x}</span></li>`).join('')}</ul>
      ${price}${how}${btn}
    </div>
    <p class="upg-back"><a href="#rankings">Back to the free rankings</a></p></div>`;
  document.querySelectorAll('.nav button').forEach(b=>{if(b.dataset.tab===f)b.setAttribute('aria-current','page')});
  const key=f+'|'+location.hash;if(TM_UPG.shown!==key){TM_UPG.shown=key;window.TMT&&TMT.ev('upgrade_screen_shown',{feature:f||'pro',price_variant:ready?'stripe':tmPrices().variant})}}
const esc_=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* Account -> Subscription: the current plan, straight from Stripe */
function tmPlanCard(){const k=tmPlanKey(),B=tmBill(),s=B&&B.sub;
  if(!B||Date.now()-TM_BILL.at>60e3)tmBillLoad();
  if(s&&(tmLiveSub(s)||s.status==='canceled')){
    const per=s.plan==='yearly'?'Yearly':'Monthly',amt=tmMoney(s.amount,s.currency),sched=s.cancel_at_period_end||s.cancel_at;
    const endDate=s.cancel_at||(s.status==='trialing'?s.trial_end:s.current_period_end);
    let title,lines=[],acts='';
    if(s.status==='canceled'){title='Free';lines.push(`Your Pro plan ended${s.ended_at?` on ${tmDate(s.ended_at)}`:''}.`)}
    else{
      title=s.status==='trialing'?`Pro · free trial (${per.toLowerCase()})`:`Pro · ${per}`;
      if(s.status==='past_due'||s.status==='unpaid')lines.push(`<span class="bill-bad">Your last payment didn't go through.</span> Update your card${s.grace_until?` by <b>${tmDate(s.grace_until)}</b>`:''} to keep Pro.`);
      if(sched)lines.push(`Cancelled. You keep Pro until <b>${tmDate(endDate)}</b> and won't be charged again.`);
      else if(s.status==='trialing')lines.push(`Your trial ends <b>${tmDate(s.trial_end)}</b>.`+(s.next?` First charge: <b>${tmMoney(s.next.amount,s.next.currency)}</b> on <b>${tmDate(s.next.date)}</b>.`:''));
      else if(s.next&&s.status==='active')lines.push(`Next charge: <b>${tmMoney(s.next.amount,s.next.currency)}</b> on <b>${tmDate(s.next.date)}</b>.`);
      else if(s.current_period_end&&s.status==='active')lines.push(`Renews <b>${tmDate(s.current_period_end)}</b>.`);
      if(amt&&!sched)lines.push(`Plan price: ${amt} ${s.plan==='yearly'?'a year':'a month'}${s.last4?` · card ending ${esc_(s.last4)}`:''}`);
      acts=`<button class="btn primary" type="button" data-bill-portal="">${sched?'Keep my plan':'Manage billing'}</button>${sched?'':'<button class="btn" type="button" data-bill-portal="cancel">Cancel plan</button>'}`}
    if(k==='beta'&&s.status==='canceled')title='Beta: Pro features unlocked';
    return `<section class="card acc-sec upg-plan"><header class="acc-sec-h"><h2>Your plan</h2></header>
      <div class="upg-plan-row"><div><b class="upg-plan-name">${title}</b>${lines.map(l=>`<p class="note">${l}</p>`).join('')}</div></div>
      ${acts?`<div class="acc-sec-f bill-acts">${acts}</div><p class="note bill-err" id="bill-err" role="status"></p>`:''}</section>`}
  const t={beta:['Beta: Pro features unlocked','Every Pro feature is free for your account while TradeMetric is in beta.'],
    pro:['Pro','Every TradeMetric feature is unlocked.'],
    free:['Free','Rankings, top news stories and joining a friend\'s mock draft. Pro unlocks the rest.']}[k]||['Free',''];
  const ready=!!(B&&B.ready&&B.prices),trial=!B||B.trialEligible!==false;
  return `<section class="card acc-sec upg-plan"><header class="acc-sec-h"><h2>Your plan</h2></header>
    <div class="upg-plan-row"><div><b class="upg-plan-name">${t[0]}</b><p class="note">${t[1]}</p></div>${k==='free'?`<a class="btn accent" href="#upgrade-pro">${ready?(trial?`Start ${(B&&B.trialDays)||7}-day free trial`:'Get Pro'):'See Pro'}</a>`:''}</div></section>`}
/* someone with a plan that will charge again can't delete their account until it's cancelled (or it would keep charging) */
function tmBillBlocksDelete(){const s=tmBill()&&tmBill().sub;return !!(s&&tmLiveSub(s)&&!s.cancel_at_period_end&&!s.cancel_at)}

/* the banner while a failed payment is inside its 7-day grace period */
function tmGraceBanner(){const g=TM_PLAN.billing&&TM_PLAN.billing.grace_until,u=tmUser(),show=!!(g&&u&&TM_PLAN.uid===u.id);
  let el=document.getElementById('tm-grace');
  if(!show){if(el)el.remove();return}
  if(!el){el=document.createElement('div');el.id='tm-grace';el.className='tm-grace';el.setAttribute('role','alert');const m=document.querySelector('main');if(!m)return;m.parentNode.insertBefore(el,m)}
  el.innerHTML=`<div class="tm-grace-in"><span><b>Your payment didn't go through.</b> Update your card by ${tmDate(g)} to keep Pro.</span><button class="btn" type="button" data-bill-portal="">Update card</button></div>`}

/* back from Stripe Checkout: confirm it with the server (which asks Stripe), then refresh the plan */
async function tmCheckoutReturn(){const q=new URLSearchParams(location.search);if(q.get('checkout')!=='done')return;
  const sid=q.get('session_id')||'';
  try{history.replaceState(null,'',location.pathname+location.hash)}catch(e){}
  const j=await tmBillLoad(true,'?session_id='+encodeURIComponent(sid));
  await tmPlanLoad();
  const st=j&&j.sub&&j.sub.status;
  if(typeof toast==='function')toast(st==='trialing'?'Your free trial has started. Pro is on.':st==='active'?'Thanks! Pro is on.':'Payment received. Pro turns on in a moment.');
  if(!(j&&j.synced&&j.synced.ok))setTimeout(()=>{tmPlanLoad();tmBillLoad(true)},4000)}

async function tmPortal(flow,btn){const err=document.getElementById('bill-err');if(btn)btn.disabled=true;
  try{const t=await tmToken(),r=await fetch('/api/billing/portal',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+t},body:JSON.stringify({flow})});
    const j=await r.json().catch(()=>({}));if(r.ok&&j.url){location.href=j.url;return}
    if(err)err.textContent=j.message||'Couldn\'t open billing. Try again in a moment.';else if(typeof toast==='function')toast(j.message||'Couldn\'t open billing.')}
  catch(e){if(typeof toast==='function')toast('Couldn\'t open billing. Check your connection.')}
  if(btn)btn.disabled=false}

async function tmCheckout(){if(TM_UPG.busy)return;TM_UPG.busy=true;TM_UPG.err='';tmRenderUpgrade();
  try{const t=await tmToken(),r=await fetch('/api/billing/checkout',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+t},body:JSON.stringify({plan:TM_UPG.choice})});
    const j=await r.json().catch(()=>({}));if(r.ok&&j.url){location.href=j.url;return}
    TM_UPG.err=j.message||'Couldn\'t open checkout. Try again in a moment.';if(j.error==='already')tmBillLoad(true)}
  catch(e){TM_UPG.err='Couldn\'t open checkout. Check your connection.'}
  TM_UPG.busy=false;tmRenderUpgrade()}

/* ---- clicks on locked things: send them to the upgrade screen (or sign-in) instead ---- */
document.addEventListener('click',e=>{const t=e.target;if(!t||!t.closest||tmIsPro()||!(tmUser()||tmOpen()))return;
  let feat=null,el;
  if((el=t.closest('#pl-seg [data-pl]'))&&el.dataset.pl!=='rank')feat=el.dataset.pl==='waiv'?'waivers':'values';
  else if((el=t.closest('#tmn-seg [data-nf]'))&&el.dataset.nf!=='all')feat=el.dataset.nf==='inj'?'injuries':'clips';
  else if(t.closest('#tmn-tog [data-nshow="mine"]')||t.closest('[data-tm-follow]'))feat='following';
  else if(t.closest('.tmn-gear'))feat='alerts';
  else if(t.closest('#ai-fab'))feat='ai';
  else if(tmUser()&&t.closest('[data-md="solo"],[data-md="set-solo"],[data-md="set-friends"]'))feat='drafttools';   /* mock drafts: starting one is Pro, joining a friend's room is free */
  else if(t.closest('#alert-btn'))feat='alerts';
  else if((el=t.closest('.nav button[data-tab], .m-sheet a[data-m]'))){const w=el.dataset.tab||el.dataset.m;
    if(TM_PRO_TABS.includes(w)&&tmUser())window.TMT&&TMT.ev('locked_tab_clicked',{wanted_tab:w,plan:'free'});return}
  if(!feat)return;
  e.preventDefault();e.stopPropagation();
  if(!tmUser()){window.TMT&&TMT.ev('locked_tab_clicked',{wanted_tab:feat,how:'feature'});if(typeof INTENDED!=='undefined')INTENDED=null;if(typeof showSignin==='function')showSignin();return}
  tmUpgrade(feat)},true);
document.addEventListener('click',e=>{const t=e.target;if(!t||!t.closest)return;
  const pick=t.closest('[data-upg-plan]');if(pick){TM_UPG.choice=pick.dataset.upgPlan;TM_UPG.err='';tmRenderUpgrade();const n=document.querySelector(`[data-upg-plan="${TM_UPG.choice}"]`);n&&n.focus();return}
  const portal=t.closest('[data-bill-portal]');if(portal){tmPortal(portal.dataset.billPortal,portal);return}
  const b=t.closest('#upg-go');if(!b)return;
  const B=tmBill(),ready=!!(B&&B.ready&&B.prices&&b.closest('#upgrade-body'));
  window.TMT&&TMT.ev('upgrade_button_clicked',{feature:TM_UPG.feat||'pro',price_variant:ready?'stripe':tmPrices().variant,plan:ready?TM_UPG.choice:undefined});
  if(ready){tmCheckout();return}
  if(!b.closest('#upgrade-body')){location.hash='upgrade-pro';return}
  const n=document.getElementById('upg-soon');if(n){n.classList.add('on')}});
/* arrow keys move between the monthly / yearly choice */
document.addEventListener('keydown',e=>{const r=e.target&&e.target.closest&&e.target.closest('[data-upg-plan]');if(!r||!/^Arrow(Left|Right|Up|Down)$/.test(e.key))return;
  e.preventDefault();TM_UPG.choice=TM_UPG.choice==='yearly'?'monthly':'yearly';tmRenderUpgrade();const n=document.querySelector(`[data-upg-plan="${TM_UPG.choice}"]`);n&&n.focus()});

/* first answer at load (signed out: is the beta on?), then every 30 minutes and when the tab comes back */
document.addEventListener('DOMContentLoaded',tmBodyFlags);
setTimeout(()=>{if(!tmUser())tmPlanLoad()},0);
setInterval(()=>{if(!document.hidden)tmPlanLoad()},30*60e3);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-TM_PLAN.at>10*60e3)tmPlanLoad()});
