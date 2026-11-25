/* ===== Phone and desktop alerts (web push) =====
   Loaded after app.js. Lives in Account → Leagues → Notifications. Turning alerts on registers sw.js (the background
   worker that shows the alerts), asks the browser for permission, and saves this device in Supabase (push_subs).
   The server (api/notify.js, run every 30 minutes) then sends trade deadline notices and lineup fixes, even when
   TradeMetric is closed. Choices (which kinds, and the time zone used for quiet hours) are saved in S.notif.
   iPhone: Apple only allows this for sites added to the Home Screen, so Safari tabs get the steps for that instead. */

const PUSH={key:undefined,state:null,busy:false,msg:''};
const pushIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const pushApp=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const pushCan=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
function pushPref(){const n=tmnNotif();n.push=n.push&&typeof n.push==='object'?n.push:{};return n.push}
async function pushKeyGet(){if(PUSH.key!==undefined)return PUSH.key;try{const r=await fetch('/api/push');const j=r.ok?await r.json():null;PUSH.key=j&&j.on&&j.key?j.key:null}catch(e){PUSH.key=null}return PUSH.key}
async function pushSub(){try{const r=await navigator.serviceWorker.getRegistration('/');return r?await r.pushManager.getSubscription():null}catch(e){return null}}
/* where this device stands: ios (needs Home Screen first), no (browser can't), blocked, ready (can turn on), on, soon (server not set up) */
async function pushCheck(){if(pushIOS()&&!pushApp())return 'ios';if(!pushCan())return 'no';if(Notification.permission==='denied')return 'blocked';
  if(await pushSub())return 'on';return (await pushKeyGet())?'ready':'soon'}
function pushB64(s){const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))}
function pushTz(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){return ''}}

async function pushTurnOn(){if(PUSH.busy)return;PUSH.busy=true;PUSH.msg='';pushPaint();
  try{/* the permission prompt has to come straight from the tap (Safari ignores it otherwise), so it goes first */
    const perm=await Notification.requestPermission();if(perm!=='granted'){PUSH.msg=perm==='denied'?'Alerts were blocked. You can allow them in your settings.':'';return}
    const key=await pushKeyGet();if(!key){PUSH.msg='Alerts aren\'t switched on for the site yet. Try again later.';return}
    const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;
    const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushB64(key)});
    const j=sub.toJSON();if(!SB||!USER)throw new Error('Sign in first.');
    const {error}=await SB.from('push_subs').upsert({endpoint:j.endpoint,user_id:USER.id,keys:j.keys,ua:navigator.userAgent.slice(0,200)});if(error)throw new Error(error.message);
    const p=pushPref();if(p.dl===undefined)p.dl=true;if(p.lu===undefined)p.lu=true;tmnNotif().tz=pushTz();save();toast('Alerts are on for this device')}
  catch(e){PUSH.msg='Couldn\'t turn alerts on ('+String(e&&e.message||e).slice(0,80)+').'}
  finally{PUSH.busy=false;pushPaint()}}
async function pushTurnOff(){if(PUSH.busy)return;PUSH.busy=true;pushPaint();
  try{const sub=await pushSub();if(sub){const ep=sub.endpoint;await sub.unsubscribe().catch(()=>{});if(SB)await SB.from('push_subs').delete().eq('endpoint',ep)}toast('Alerts are off for this device')}
  catch(e){}finally{PUSH.busy=false;PUSH.msg='';pushPaint()}}
async function pushTest(){if(PUSH.busy)return;PUSH.busy=true;PUSH.msg='';pushPaint();
  try{const s=SB&&(await SB.auth.getSession()).data.session;const r=await fetch('/api/push',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+(s?s.access_token:'')},body:'{"test":true}'});
    const j=await r.json().catch(()=>({}));PUSH.msg=r.ok?'Test sent. It should arrive in a few seconds.':(j.error||'The test didn\'t send.')}
  catch(e){PUSH.msg='The test didn\'t send.'}finally{PUSH.busy=false;pushPaint()}}

/* ---------- Account → Leagues → Notifications ---------- */
const PUSH_SHARE='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
function pushBody(st){const p=pushPref(),dis=PUSH.busy?' disabled':'',msg=PUSH.msg?`<p class="note push-msg">${esc(PUSH.msg)}</p>`:'';
  const sw=(k,t,d)=>`<li><span class="acc-lg-t"><b>${t}</b><span class="note">${d}</span></span><label class="tmn-sw"><input type="checkbox" data-push-pref="${k}" ${p[k]!==false?'checked':''}><i aria-hidden="true"></i><span class="sr">${t}</span></label></li>`;
  if(st==='ios')return `<p class="note">On iPhone, Apple only sends alerts to sites added to your Home Screen. It takes a few seconds:</p>
    <ol class="push-steps"><li>In Safari, tap the Share button ${PUSH_SHARE}</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b></li><li>Open TradeMetric from your Home Screen, sign in, and come back here to turn alerts on</li></ol>`;
  if(st==='no')return `<p class="note">This browser can't show alerts. Chrome, Edge, Firefox and Safari can.</p>`;
  if(st==='blocked')return `<p class="note">Alerts are blocked for TradeMetric. ${pushIOS()?'Open your iPhone Settings → Notifications → TradeMetric and allow them':'Allow notifications for this site in your browser settings'}, then come back here.</p>`;
  if(st==='soon')return `<p class="note">Phone alerts are almost ready. Check back soon.</p>`;
  if(st==='ready')return `<p class="note">Trade deadlines and lineup fixes, even when TradeMetric is closed. Nothing between 10 pm and 8 am.</p><button class="btn primary" data-push="on"${dis}>${PUSH.busy?'Turning on…':'Turn on phone alerts'}</button>${msg}`;
  if(st==='on')return `<p class="push-on"><i aria-hidden="true"></i>Alerts are on for this device</p><ul class="tmn-nl">${sw('dl','Trade deadlines','A week out, 3 days out and on the final day')}${sw('lu','Lineup fixes','Empty slots, starters who can\'t play, and bench players projected 5+ more, before kickoff')}</ul>
    <div class="toolbar push-tb"><button class="btn" data-push="test"${dis}>Send a test</button><button class="btn" data-push="off"${dis}>Turn off on this device</button></div>${msg}`;
  return '<div class="skel" style="height:40px"></div>'}
async function pushPaint(){const el=document.getElementById('push-box');if(!el)return;PUSH.state=await pushCheck();const b=document.getElementById('push-box');if(b)b.innerHTML=pushBody(PUSH.state)}
function pushHtml(){setTimeout(pushPaint,0);return `<div class="push-sec"><h3>Phone alerts</h3><div id="push-box">${pushBody(PUSH.state)}</div></div>`}

document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-push]');if(!b)return;e.preventDefault();
  const a=b.dataset.push;if(a==='on')pushTurnOn();else if(a==='off')pushTurnOff();else if(a==='test')pushTest()});
document.addEventListener('change',e=>{const t=e.target;if(!t.dataset||!t.dataset.pushPref)return;pushPref()[t.dataset.pushPref]=t.checked;save();
  toast(t.checked?'Turned on':'Turned off. You can switch it back here any time.')});
/* tapping an alert while the site is already open */
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.go)location.href=e.data.go});
/* keep the time zone current (quiet hours) for accounts that have alerts on */
setTimeout(async()=>{try{if(typeof USER==='undefined'||!USER||!S||!pushCan())return;const n=tmnNotif(),tz=pushTz();if(n.push&&tz&&n.tz!==tz&&(await pushSub())){n.tz=tz;save()}}catch(e){}},8000);
