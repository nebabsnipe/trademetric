/* ===== Push notifications: real alerts on the lock screen or desktop, even when TradeMetric is closed =====
   Loaded after app.js. Draws the "Push notifications" card inside Account -> Leagues (pushHtml()).
   - The browser is only asked for permission when the user taps "Turn on notifications on this device".
   - Which kinds of alert are on is saved on the account (S.acct.push), so it applies to every device.
   - Each device that's switched on is saved on the server (/api/push/subscribe), tied to the account.
   - If anything here fails, or notifications are off or blocked, the rest of the site is untouched. */
var PUSH={sub:null,devices:null,setup:null,busy:'',msg:'',loaded:false,token:''};
const PUSH_TYPES=[
  ['plays','Big plays','A long run or catch, or a huge game from one of your starters'],
  ['inj','Injuries and status changes','When one of your players is questionable, doubtful, out or on injured reserve',true],
  ['trade','Trades involving your players','When a player on your team is traded in the NFL'],
  ['dl','Trade deadlines','A week out, 3 days out, and a last call on deadline day',true],
  ['lineup','Lineup fixes','An empty spot, a starter who is out or on bye, or a bench player projected 5+ more. 6 pm the night before (Friday for weekend games), again before kickoff, and right away if something changes',true],
  ['top','#1 finishes','When your player outscores everyone at his position']];
const PUSH_ID_LS='tm-push-device',PUSH_SEEN_LS='tm-push-seen',PUSH_HINT_LS='tm-push-ios-hint';
const pushLs=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}return null};

const pushSupported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const pushIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const pushStandalone=()=>navigator.standalone===true||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches);
/* "iPhone · Safari", "Mac · Chrome": how this device shows in the list */
function pushLabel(){const u=navigator.userAgent;
  const dev=/iPhone|iPod/.test(u)?'iPhone':pushIOS()?'iPad':/Android/.test(u)?'Android':/Macintosh|Mac OS X/.test(u)?'Mac':/Windows/.test(u)?'Windows':/CrOS/.test(u)?'Chromebook':/Linux/.test(u)?'Linux':'Device';
  const br=/Edg\//.test(u)?'Edge':/OPR\//.test(u)?'Opera':/SamsungBrowser/.test(u)?'Samsung Internet':/Firefox\/|FxiOS/.test(u)?'Firefox':/Chrome\/|CriOS/.test(u)?'Chrome':/Safari\//.test(u)?'Safari':'Browser';
  return dev+' · '+br}
const pushTz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){return ''}};
function pushPrefs(){const p=typeof acctGet==='function'?acctGet('push',null):null;return {off:(p&&Array.isArray(p.off)?p.off:[])}}
const pushTypeOn=k=>!pushPrefs().off.includes(k);

/* ---- talking to the server ---- */
async function pushApi(what,body){
  try{if(typeof SB!=='undefined'&&SB){const {data}=await SB.auth.getSession();PUSH.token=(data&&data.session&&data.session.access_token)||''}}catch(e){}
  const h={};if(PUSH.token)h.authorization='Bearer '+PUSH.token;if(body)h['content-type']='application/json';
  try{const r=await fetch('/api/push/'+what,{method:body?'POST':'GET',headers:h,body:body?JSON.stringify(body):undefined,cache:'no-store'});
    let j=null;try{j=await r.json()}catch(e){}
    return {ok:r.ok,status:r.status,j:j||{}}}catch(e){return {ok:false,status:0,j:{}}}}
const pushKeyBytes=k=>{const s=atob((k+'='.repeat((4-k.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(s,c=>c.charCodeAt(0))};

/* what this device has right now (never asks for permission, never registers anything) */
async function pushRead(){if(!pushSupported())return;
  try{const reg=await navigator.serviceWorker.getRegistration('/');PUSH.sub=reg?await reg.pushManager.getSubscription():null}catch(e){PUSH.sub=null}}
const pushOnHere=()=>!!PUSH.sub&&Notification.permission==='granted';

/* the account's devices and whether the server is set up: fetched the first time the card is shown */
async function pushLoad(force){if(PUSH.loading||(PUSH.loaded&&!force)||typeof USER==='undefined'||!USER)return;PUSH.loading=true;
  const [k,d]=await Promise.all([PUSH.key?{ok:true,j:{key:PUSH.key}}:pushApi('key'),pushApi('devices'),pushRead()]);
  PUSH.key=k.ok?k.j.key:null;PUSH.setup=k.ok&&d.ok;PUSH.devices=d.ok?d.j.devices||[]:null;PUSH.loaded=true;PUSH.loading=false;pushPaint()}
function pushPaint(){const el=document.getElementById('acc-push');if(el)el.outerHTML=pushHtml()}

/* ---- turning it on: the only place the browser's permission prompt can appear ---- */
async function pushEnable(){if(PUSH.busy)return;PUSH.msg='';
  /* ask first, straight from the tap (browsers only show the prompt in direct response to a tap or click) */
  let perm=Notification.permission;
  if(perm==='default'){try{perm=await Notification.requestPermission()}catch(e){perm=Notification.permission}}
  if(perm!=='granted'){pushPaint();return}
  PUSH.busy='on';pushPaint();
  try{if(!PUSH.key){const k=await pushApi('key');if(!k.ok)throw new Error('setup');PUSH.key=k.j.key}
    const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;
    const opt={userVisibleOnly:true,applicationServerKey:pushKeyBytes(PUSH.key)};let sub;
    try{sub=await reg.pushManager.subscribe(opt)}
    catch(e){/* subscribed under an older key: start clean */const old=await reg.pushManager.getSubscription();if(!old)throw e;await old.unsubscribe();sub=await reg.pushManager.subscribe(opt)}
    const r=await pushApi('subscribe',{subscription:sub.toJSON(),label:pushLabel(),tz:pushTz()});
    if(!r.ok){await sub.unsubscribe().catch(()=>{});throw new Error(r.status===401?'signin':'save')}
    PUSH.sub=sub;if(r.j.id)pushLs(PUSH_ID_LS,r.j.id);pushLs(PUSH_SEEN_LS,String(Date.now()));
    PUSH.busy='';toast('Notifications are on for this device');await pushLoad(true)}
  catch(e){PUSH.busy='';PUSH.msg=e&&e.message==='setup'?'Notifications aren\'t available on this copy of the site yet.':e&&e.message==='signin'?'Sign in again, then turn notifications on.':'Couldn\'t turn notifications on. Check your connection and try again.';pushPaint()}}

async function pushDisable(quiet){const sub=PUSH.sub;if(!sub)return;PUSH.busy='off';if(!quiet)pushPaint();
  const ep=sub.endpoint;try{await sub.unsubscribe()}catch(e){}
  PUSH.sub=null;pushLs(PUSH_ID_LS,null);await pushApi('unsubscribe',{endpoint:ep});
  PUSH.busy='';if(!quiet){toast('Notifications are off for this device');await pushLoad(true)}}

async function pushRemove(id){if(id===pushLs(PUSH_ID_LS)&&PUSH.sub){await pushDisable();return}
  PUSH.devices=(PUSH.devices||[]).filter(d=>d.id!==id);pushPaint();await pushApi('unsubscribe',{id});toast('Device removed')}

async function pushTest(){if(PUSH.busy)return;PUSH.busy='test';PUSH.msg='';pushPaint();const r=await pushApi('test',{});PUSH.busy='';
  if(r.ok&&r.j.sent)toast(r.j.sent>1?'Test sent to '+r.j.sent+' devices':'Test sent. It should show up in a few seconds.');
  else PUSH.msg=r.ok?'No device could be reached. Turn notifications on again on this device.':'Couldn\'t send the test. Try again in a minute.';
  if(r.ok&&r.j.removed)await pushLoad(true);else pushPaint()}

/* Once a day, on a device that's already on: tell the server it's still in use (keeps "last used" and the time
   zone fresh, and re-saves the device if the browser quietly gave it a new push address). */
async function pushSeen(){if(typeof USER==='undefined'||!USER||!pushSupported())return;await pushRead();
  if(!pushOnHere()||Date.now()-(+pushLs(PUSH_SEEN_LS)||0)<20*3600e3)return;
  const r=await pushApi('subscribe',{subscription:PUSH.sub.toJSON(),label:pushLabel(),tz:pushTz()});
  if(r.ok){pushLs(PUSH_SEEN_LS,String(Date.now()));if(r.j.id)pushLs(PUSH_ID_LS,r.j.id)}}

/* ---- the card ---- */
function pushWhen(d){const t=Date.parse(d);if(!t)return '';const days=Math.floor((Date.now()-t)/864e5);return days<1?'today':days<2?'yesterday':days<30?days+' days ago':new Date(t).toLocaleDateString([],{month:'short',day:'numeric'})}
function pushDeviceRow(){const sup=pushSupported(),ios=pushIOS();
  const row=(t,n,act)=>`<div class="push-dev"><span class="acc-lg-t"><b>${t}</b><span class="note">${n}</span></span>${act||''}</div>`;
  if(ios&&!pushStandalone()){if(pushLs(PUSH_HINT_LS))return row('Add TradeMetric to your Home Screen','On iPhone and iPad, notifications work from the Home Screen icon. Tap Share, then Add to Home Screen.',`<button class="btn small" type="button" data-push-hint="show">Show steps</button>`);
    return `<div class="push-hint"><b>Get notifications on this ${/iPad/.test(pushLabel())?'iPad':'iPhone'}</b>
      <ol><li>Tap the <b>Share</b> button in your browser's toolbar.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open TradeMetric from the new Home Screen icon and turn notifications on here.</li></ol>
      <button class="btn small" type="button" data-push-hint="hide">Got it</button></div>`}
  if(!sup)return row('Not available in this browser',ios?'Notifications need iOS 16.4 or later. Update your device, then open TradeMetric from your Home Screen.':'This browser can\'t show notifications. Try a current version of Chrome, Safari, Edge or Firefox.');
  if(PUSH.setup===false)return row('Not available yet','Notifications aren\'t switched on for this copy of the site.');
  if(Notification.permission==='denied'){const how=ios?'Open the Settings app, tap Notifications, then TradeMetric, and switch on Allow Notifications.':/Android/.test(navigator.userAgent)?'Tap the icon at the left of the address bar, then Permissions, and allow Notifications. Then reload this page.':/Safari/.test(pushLabel())?'In the Safari menu choose Settings, then Websites, then Notifications, and set TradeMetric to Allow. Then reload this page.':'Click the icon at the left of the address bar, set Notifications to Allow, then reload this page.';
    return row('Notifications are blocked on this device',how)}
  if(pushOnHere())return row('On for this device',esc(pushLabel()),`<span class="push-acts"><button class="btn small" type="button" data-push-test ${PUSH.busy?'disabled':''}>${PUSH.busy==='test'?'Sending...':'Send test notification'}</button><button class="btn small" type="button" data-push-off ${PUSH.busy?'disabled':''}>Turn off</button></span>`);
  return row('This device','Get alerts on your lock screen or desktop, even when TradeMetric is closed.',`<button class="btn primary" type="button" data-push-on ${PUSH.busy?'disabled':''}>${PUSH.busy==='on'?'Turning on...':'Turn on notifications on this device'}</button>`)}
function pushHtml(){if(typeof USER==='undefined'||!USER)return '';
  if(typeof tmIsPro==='function'&&!tmIsPro())return `<section class="card acc-sec" id="acc-push"><header class="acc-sec-h"><h2>Push notifications</h2><p>Alerts on your phone or computer, even when the site is closed. Part of Pro.</p></header><div class="acc-row"><div class="acc-v"><a class="btn small" href="#upgrade-push">See Pro</a></div></div></section>`;
  if(!PUSH.loaded)setTimeout(pushLoad,0);
  const here=pushLs(PUSH_ID_LS),D=PUSH.devices||[];
  const others=D.length>0;
  return `<section class="card acc-sec" id="acc-push"><header class="acc-sec-h"><h2>Push notifications</h2><p>Alerts on your phone or computer, even when the site is closed.</p></header>
    ${pushDeviceRow()}${PUSH.msg?`<p class="auth-msg bad" role="alert">${esc(PUSH.msg)}</p>`:''}
    <h3 class="push-h">What to send</h3>
    <ul class="tmn-nl push-types">${PUSH_TYPES.map(([k,t,n,live])=>`<li><span class="acc-lg-t"><b>${t}${live?'':' <span class="push-soon">Coming soon</span>'}</b><span class="note">${n}</span></span><label class="tmn-sw sm"><input type="checkbox" data-push-type="${k}" ${pushTypeOn(k)?'checked':''}><i aria-hidden="true"></i><span class="sr">${t}</span></label></li>`).join('')}</ul>
    <p class="note tmn-nl-f">These apply to every device on your account. Alerts pause from 11pm to 8am your time.</p>
    ${others?`<h3 class="push-h">Your devices</h3><ul class="tmn-nl push-devs">${D.map(d=>`<li><span class="acc-lg-t"><b>${esc(d.label||'Device')}${d.id===here&&pushOnHere()?' <span class="pill-ok">This device</span>':''}</b><span class="note">Added ${esc(pushWhen(d.created_at))} · last used ${esc(pushWhen(d.last_used_at))}</span></span><button class="btn small" type="button" data-push-rm="${esc(d.id)}">Remove</button></li>`).join('')}</ul>`:''}</section>`}

/* ---- events ---- */
document.addEventListener('click',e=>{const t=e.target;if(!t.closest)return;
  if(t.closest('[data-push-on]')){pushEnable();return}
  if(t.closest('[data-push-off]')){pushDisable();return}
  if(t.closest('[data-push-test]')){pushTest();return}
  const rm=t.closest('[data-push-rm]');if(rm){pushRemove(rm.dataset.pushRm);return}
  const h=t.closest('[data-push-hint]');if(h){pushLs(PUSH_HINT_LS,h.dataset.pushHint==='hide'?'1':null);pushPaint();return}});
document.addEventListener('change',e=>{const t=e.target,k=t&&t.dataset&&t.dataset.pushType;if(!k)return;
  const off=pushPrefs().off.filter(x=>x!==k);if(!t.checked)off.push(k);acctSet('push',{off})});
/* signing out: this device stops getting the account's alerts (runs before the page's own sign-out handler) */
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#auth-out')&&PUSH.sub&&PUSH.token){const ep=PUSH.sub.endpoint;
  try{fetch('/api/push/unsubscribe',{method:'POST',keepalive:true,headers:{authorization:'Bearer '+PUSH.token,'content-type':'application/json'},body:JSON.stringify({endpoint:ep})}).catch(()=>{})}catch(err){}
  PUSH.sub.unsubscribe().catch(()=>{});PUSH.sub=null;PUSH.loaded=false;PUSH.devices=null;pushLs(PUSH_ID_LS,null)}},true);
/* tapping a notification while a TradeMetric tab is open: the service worker asks that tab to go to the right section */
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{const d=e.data;if(d&&d.type==='tm-go'&&typeof d.hash==='string'&&/^#[\w-]*$/.test(d.hash)&&d.hash.length>1)location.hash=d.hash});

/* keep the saved sign-in token handy for the sign-out step, and check in once a day */
setTimeout(()=>{pushSeen().then(()=>{if(PUSH.sub&&!PUSH.token)pushApi('key')})},6000);
/* the Account page may already be on screen from before this file loaded */
if(document.getElementById('acc-notif')&&!document.getElementById('acc-push')&&typeof renderAccount==='function'&&typeof ACC_EDIT!=='undefined'&&!ACC_EDIT)renderAccount();
