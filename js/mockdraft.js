/* Mock drafts (offseason Draft Tools tab). Loaded after offseason.js, before app.js.
   Styles: css/mockdraft.css (every class starts with md-). Server: api/draft.js. Tables: supabase/mockdraft.sql.

   One draft room for three ways to draft: solo against CPU teams, a private room with friends, or a public lobby.
   The server decides everything (whose turn, what is legal, CPU picks, the clock); this file draws it and asks.
   Pages: home (the three mode cards, lobbies, history) -> lobby (friends / online) -> room -> results.

   Motion is ported by hand from 21st.dev component patterns (ring countdown, number ticker, animated list,
   marquee strip, command-style search, avatar group, drag-to-reorder, bottom sheet, toasts, spotlight cards,
   shine). No libraries. Everything respects "reduce motion". */
var MD={page:'home',home:null,room:null,picks:[],shown:0,fresh:-1,pool:[],by:{},you:-1,queue:[],off:0,carry:null,busy:false,
  ui:{pos:'ALL',q:'',sort:'adp',hide:true,tab:'team',ptab:'players',board:false,mine:false,team:null,limit:80,confirm:null,sheet:null,set:null,setMode:'solo',dlg:null,res:null},
  delays:[],revT:null,paused:false,loopT:null,ch:null,chId:null,rt:false,present:null,lastSync:0,syncing:false,tickAt:0,title:null,titleT:null,wasTurn:false,join:null,err:null};
var MD_POS=['QB','RB','WR','TE','K','DST'],MD_SLOTS=['QB','RB','WR','TE','FLEX','SF','K','DST','BN'];
var MD_DEF={teams:12,scoring:'ppr',roster:{QB:1,RB:2,WR:2,TE:1,FLEX:1,SF:0,K:1,DST:1,BN:6},clock:60,speed:'fast',slot:0};
var MD_SLOT_MAX={QB:2,RB:4,WR:4,TE:2,FLEX:3,SF:1,K:1,DST:1,BN:10};
var MD_SC={ppr:'PPR',half:'Half PPR',std:'Standard'},MD_EMOJI=['🔥','😂','😬','👏','💀','🧊'];
var MD_IC={
  star:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/></svg>',
  plus:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5.500v13M5.500 12h13"/></svg>',
  check:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>',
  grip:'<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  x:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  board:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M3.5 14.7h17M9.2 4.5v15M14.8 4.5v15"/></svg>',
  sound:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path class="md-snd-on" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/><path class="md-snd-off" d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>',
  cpu:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M10 2.5v4M14 2.5v4M10 17.5v4M14 17.5v4M2.5 10h4M2.5 14h4M17.5 10h4M17.5 14h4"/></svg>',
  friends:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.5-3.4 2.8-5.2 6-5.2s5.500 1.800 6 5.200"/><circle cx="17" cy="9.500" r="2.500"/><path d="M17.500 14.400c2 .300 3.200 1.700 3.600 4.100"/></svg>',
  globe:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.500"/><path d="M3.500 12h17M12 3.500c2.600 2.400 3.800 5.200 3.800 8.500S14.600 18.100 12 20.500c-2.600-2.400-3.800-5.200-3.800-8.500S9.400 5.900 12 3.500z"/></svg>'};

/* ---------- small helpers ---------- */
function mdRoot(){return document.getElementById('pro-drafttools')}
function mdOn(){return document.body.dataset.tab==='drafttools'}
function mdNow(){return Date.now()+MD.off}
function mdCalm(){try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}}
function mdPhone(){try{return matchMedia('(max-width:700px)').matches}catch(e){return false}}
function mdSeatAt(k,n){const r=Math.floor(k/n),i=k%n;return r%2?n-1-i:i}
function mdTotal(){return MD.room?MD.room.settings.teams*MD.room.rounds:0}
function mdSolo(){return !!MD.room&&MD.room.mode==='solo'}
function mdOrd(n){const t=n%100;return n+(t>=11&&t<=13?'th':['th','st','nd','rd'][n%10]||'th')}
function mdPickLabel(k){const n=MD.room.settings.teams;return (Math.floor(k/n)+1)+'.'+String(k%n+1).padStart(2,'0')}
function mdInit(name){const w=String(name||'?').replace(/[^A-Za-z0-9 ]/g,'').split(' ').filter(Boolean);return ((w[0]||'?')[0]+(w.length>1?w[w.length-1][0]:'')).toUpperCase()}
function mdAv(s,cls){if(!s||s.k==='o')return `<span class="md-av md-av-open ${cls||''}" aria-hidden="true">+</span>`;return `<span class="md-av ${cls||''}" style="--c:${esc(s.color||'#5A6E96')}" aria-hidden="true">${esc(mdInit(s.name))}</span>`}
function mdSeatName(i){const s=MD.room.seats[i];return s&&s.name?s.name:'Open seat'}
function mdShort(n){const p=String(n).split(' ');if(p.length<2)return n;const suf=/^(Jr\.?|Sr\.?|II|III|IV|V)$/.test(p[p.length-1])?p.pop():'';return p[0][0]+'. '+p.slice(1).join(' ')+(suf?' '+suf:'')}
function mdPosChip(pos){return `<i class="md-pos md-p-${pos}">${pos==='DST'?'DEF':pos}</i>`}
/* his jersey in team colors (the same drawing the rest of the site uses) and a team tag in the team's color */
function mdJy(o,cls){try{if(typeof jersey==='function')return `<span class="md-jy ${cls||''}">${jersey({id:o.id,n:o.n,pos:o.pos,t:o.t},false)}</span>`}catch(e){}return mdPosChip(o.pos)}
function mdTm(t){let c=null;try{c=TC[t]}catch(e){}return t?`<i class="md-tmc" style="--tc:${c?c[0]:'#3a3f47'};--tt:${c?c[2]:'#fff'}">${esc(t)}</i>`:'<i class="md-tmc md-fa">FA</i>'}
/* favorites: the players you follow on the site (saved on the account). They get a star in the room and their own filter. */
function mdFavs(){try{return new Set(typeof USER!=='undefined'&&USER&&typeof S!=='undefined'&&S&&S.following||[])}catch(e){return new Set()}}
function mdFavToggle(id,name){try{if(typeof S==='undefined'||!S||typeof USER==='undefined'||!USER){location.hash='signin';return}S.following=S.following||[];const i=S.following.indexOf(id);if(i>=0)S.following.splice(i,1);else S.following.unshift(id);if(typeof save==='function')save();mdToast(i>=0?`Removed ${name} from your favorites`:`${name} is a favorite. His news comes first, and he’s starred in your drafts.`,i>=0?'':'good')}catch(e){}}
var MD_FAV='<svg class="md-favm" viewBox="0 0 24 24" width="12" height="12" aria-label="Favorite"><path fill="currentColor" d="M12 2.800l2.800 5.900 6.400.800-4.700 4.400 1.200 6.300L12 17.200l-5.700 3 1.200-6.300L2.800 9.500l6.400-.800z"/></svg>';
var MD_CLOCKS=[15,30,45,60,75,90,105,120];
function mdCounts(ids){const c={QB:0,RB:0,WR:0,TE:0,K:0,DST:0};ids.forEach(id=>{const o=MD.by[id];if(o)c[o.pos]++});return c}
/* how a set of position counts sits in the roster (the same sum the server does) */
function mdFit(c,R){const over={},open={};MD_POS.forEach(p=>{const d=c[p]-(R[p]||0);over[p]=Math.max(0,d);open[p]=Math.max(0,-d)});
  const fp=over.RB+over.WR+over.TE,uf=Math.min(R.FLEX||0,fp);open.FLEX=(R.FLEX||0)-uf;const sp=fp-uf+over.QB,us=Math.min(R.SF||0,sp);open.SF=(R.SF||0)-us;
  return {open,bench:sp-us+over.K+over.DST,openN:Object.values(open).reduce((a,b)=>a+b,0)}}
function mdLegal(ids,pos){const c=mdCounts(ids);c[pos]++;return mdFit(c,MD.room.settings.roster).bench<=(MD.room.settings.roster.BN||0)}
function mdSeatIds(seat,n){const out=[],N=MD.room.settings.teams,lim=n==null?MD.shown:n;for(let k=0;k<lim&&k<MD.picks.length;k++)if(mdSeatAt(k,N)===seat)out.push(MD.picks[k][0]);return out}
function mdTaken(){return new Set(MD.picks.slice(0,MD.shown).map(p=>p[0]))}
function mdMyTurn(){const r=MD.room;return !!r&&r.status==='live'&&MD.shown===MD.picks.length&&MD.shown===r.cur&&r.cur<mdTotal()&&mdSeatAt(r.cur,r.settings.teams)===MD.you}
function mdNextIn(){const r=MD.room,n=r.settings.teams,T=mdTotal();for(let k=MD.shown;k<T;k++)if(mdSeatAt(k,n)===MD.you)return k-MD.shown;return -1}
function mdAcct(k,d){try{return typeof acctGet==='function'?acctGet(k,d):d}catch(e){return d}}
function mdAcctSet(k,v){try{if(typeof acctSet==='function'&&typeof S!=='undefined'&&S)acctSet(k,v)}catch(e){}}
/* a roster laid out by slot, in the order the players were drafted */
function mdLayout(ids){const R=MD.room.settings.roster,slots=[];MD_SLOTS.forEach(s=>{for(let i=0;i<(R[s]||0);i++)slots.push({slot:s,id:null})});
  ids.forEach(id=>{const o=MD.by[id];if(!o)return;const ok=s=>s.slot===o.pos||(s.slot==='FLEX'&&/RB|WR|TE/.test(o.pos))||(s.slot==='SF'&&/QB|RB|WR|TE/.test(o.pos));
    const s=slots.find(x=>!x.id&&x.slot===o.pos)||slots.find(x=>!x.id&&x.slot!=='BN'&&ok(x))||slots.find(x=>!x.id&&x.slot==='BN');if(s)s.id=id});return slots}

/* ---------- talking to the server ---------- */
async function mdApi(action,body){
  const tok=typeof tmoToken==='function'?await tmoToken():null;
  if(!tok)return {ok:false,code:'signin',msg:'Sign in to use mock drafts.'};
  const b=Object.assign({action},body||{});if(MD.carry&&MD.room&&b.room===MD.carry.room.id)b.carry=MD.carry;
  try{const r=await fetch('/api/draft',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+tok},body:JSON.stringify(b)});
    const j=await r.json().catch(()=>null);return j||{ok:false,code:'net',msg:'The draft server didn’t answer. Try again.'}}
  catch(e){return {ok:false,code:'net',msg:'You look offline. Check your connection and try again.'}}
}
function mdSetPool(list){
  const R=typeof tmoRows==='function'?tmoRows().slice():[];if(R.length&&typeof tmoTiers==='function')tmoTiers(R);const tm={};R.forEach(o=>tm[o.id]=o);
  MD.pool=list.map(a=>{const t=tm[a[0]];return {id:a[0],n:a[1],pos:a[2],t:a[3],bye:a[4],adp:a[5],ppg:a[6],tm:t?t.rank:null,diff:t?t.diff:0,tier:t?t.tier:null,tierStart:t?!!t.tierStart:false,score:t?t.score:null,grade:t?t.grade:null,age:t&&t.age1!=null?Math.floor(t.age1):null}});
  MD.by={};MD.pool.forEach(o=>MD.by[o.id]=o);
}
/* takes a reply from the server and makes it the truth on this page */
function mdApply(j,o){
  o=o||{};if(!j||!j.ok||!j.room)return false;
  MD.off=j.now-Date.now();if(j.carry!==undefined){MD.carry=j.carry;mdSaveCarry()}
  if(j.pool)mdSetPool(j.pool);
  const prev=MD.room,page0=MD.page,same=prev&&prev.id===j.room.id,was=same?prev.status:null,prevN=same?MD.picks.length:0;
  MD.room=j.room;MD.you=j.you;MD.queue=j.queue||[];MD.picks=j.picks||[];
  if(!same){MD.ui.team=null;MD.ui.board=false;MD.ui.res=null;MD.shown=MD.picks.length;MD.fresh=-1;MD.paused=false;MD.wasTurn=false}
  const made=j.made||[];
  if(mdSolo()&&made.length&&!o.instant&&made.some(m=>m[2]>0)&&!mdCalm()){
    MD.shown=Math.min(MD.shown,MD.picks.length-made.length);if(MD.shown<MD.picks.length-made.length)MD.shown=MD.picks.length-made.length;
    MD.delays=made.map(m=>m[2]||0);MD.fresh=MD.shown;mdReveal()}
  else{clearTimeout(MD.revT);MD.fresh=same&&MD.picks.length>prevN?prevN:-1;MD.shown=MD.picks.length;MD.delays=[];
    if(same&&!mdSolo()&&MD.fresh>=0)for(let k=MD.fresh;k<MD.picks.length;k++)mdPickToast(k)}
  if(MD.shown>MD.picks.length)MD.shown=MD.picks.length;
  const st=j.room.status;
  if(st==='lobby')MD.page='lobby';
  else if(st==='done'&&MD.shown>=MD.picks.length)MD.page='results';
  else if(was==='lobby'&&st!=='lobby'&&!mdCalm()){MD.page='room';MD.ui.shuffle=Date.now()}
  else MD.page='room';
  mdConnect();mdLoopStart();
  if(!o.quiet||MD.page!==page0||!same)mdRender();else mdPaint();
  return true;
}
function mdFail(j){const m=(j&&j.msg)||'Something went wrong. Try again.';mdToast(m,'bad');return false}
var MD_SAVE_T=null;
function mdSaveCarry(){const c=MD.carry;mdAcctSet('mdSolo',c&&c.room&&c.room.status!=='done'?c:null)}
/* solo: CPU picks arrive as one list and are shown one at a time at the chosen speed */
function mdReveal(){
  clearTimeout(MD.revT);if(MD.paused||MD.shown>=MD.picks.length)return;
  const d=MD.delays.length?MD.delays[0]:0;
  MD.revT=setTimeout(()=>{MD.delays.shift();MD.fresh=MD.shown;MD.shown++;
    if(MD.shown>=MD.picks.length&&MD.room.status==='done'){MD.page='results';mdRender();return}
    mdPaint();mdReveal()},Math.max(120,d));
}
function mdFlush(){clearTimeout(MD.revT);MD.delays=[];MD.fresh=-1;MD.shown=MD.picks.length;if(MD.room&&MD.room.status==='done'){MD.page='results';mdRender()}else mdPaint()}
async function mdSync(){
  if(!MD.room||MD.syncing||mdSolo()&&MD.shown<MD.picks.length)return;MD.syncing=true;MD.lastSync=Date.now();
  const id=MD.room.id,j=await mdApi('state',{room:id});MD.syncing=false;
  if(!MD.room||MD.room.id!==id)return;
  if(j.ok)mdApply(j,{quiet:MD.page!=='lobby'&&j.room.status===MD.room.status&&j.room.status!=='done'});
  else if(j.code==='no_room'||j.code==='not_member'){mdLeaveLocal();mdToast(j.code==='not_member'?'You were removed from the room.':'That room has closed.','bad')}
}
async function mdTick(){
  if(!MD.room||Date.now()-MD.tickAt<900)return;MD.tickAt=Date.now();
  const id=MD.room.id,j=await mdApi('tick',{room:id});if(!MD.room||MD.room.id!==id)return;
  if(j.ok){mdApply(j,{quiet:j.room.status===MD.room.status&&j.room.status!=='done'&&MD.page==='room'});mdPing()}
}
/* live updates: Supabase Realtime tells everyone in the room to reload its state; presence shows who is here.
   If the channel drops the page checks every 2 seconds instead. */
function mdConnect(){
  const r=MD.room;if(!r||r.mode==='solo'||r.status==='done'||typeof SB==='undefined'||!SB||!SB.channel){if(!r||r.mode==='solo'||r.status==='done')mdDisconnect();return}
  if(MD.ch&&MD.chId===r.id)return;mdDisconnect();
  try{const ch=SB.channel('md-'+r.id,{config:{presence:{key:String(MD.you)}}});MD.ch=ch;MD.chId=r.id;
    ch.on('broadcast',{event:'sync'},()=>mdSync()).on('presence',{event:'sync'},()=>{try{MD.present=new Set(Object.keys(ch.presenceState()));if(MD.page==='lobby')mdRender()}catch(e){}})
      .subscribe(st=>{MD.rt=st==='SUBSCRIBED';if(MD.rt){try{ch.track({seat:MD.you})}catch(e){}mdSync()}})}catch(e){MD.ch=null}
}
function mdDisconnect(){if(MD.ch){try{SB.removeChannel(MD.ch)}catch(e){}}MD.ch=null;MD.chId=null;MD.rt=false;MD.present=null}
function mdPing(){if(MD.ch&&MD.rt){try{MD.ch.send({type:'broadcast',event:'sync',payload:{}})}catch(e){}}}
function mdLoopStart(){if(MD.loopT)return;MD.loopT=setInterval(mdLoop,250)}
function mdLoop(){
  const r=MD.room;if(!r||!mdOn()||(MD.page!=='room'&&MD.page!=='lobby')){if(!r){clearInterval(MD.loopT);MD.loopT=null}mdTitle(false);return}
  const now=mdNow();
  if(MD.page==='lobby'){mdLobbyClock();if(r.startsAt&&now>=r.startsAt)mdTick()}
  else{mdClock();
    if(r.status==='live'&&r.deadline!=null&&now>=r.deadline&&MD.shown>=MD.picks.length)mdTick();
    if(r.status==='paused'&&r.pauseUntil&&now>=r.pauseUntil)mdTick()}
  if(r.mode!=='solo'&&r.status!=='done'&&Date.now()-MD.lastSync>(MD.rt?8000:2000))mdSync();
}
function mdLeaveLocal(){clearTimeout(MD.revT);mdDisconnect();MD.room=null;MD.picks=[];MD.shown=0;MD.page='home';MD.home=null;mdTitle(false);if(mdOn())mdRender()}

/* ---------- toasts, sound, tab title ---------- */
function mdToast(msg,kind,av){
  let box=document.getElementById('md-toasts');if(!box){box=document.createElement('div');box.id='md-toasts';box.className='md-toasts';box.setAttribute('aria-live','polite');document.body.appendChild(box)}
  const t=document.createElement('div');t.className='md-toast'+(kind?' md-toast-'+kind:'');t.innerHTML=(av||'')+'<span>'+esc(msg)+'</span>';box.appendChild(t);
  while(box.children.length>3)box.firstChild.remove();
  setTimeout(()=>{t.classList.add('md-out');setTimeout(()=>t.remove(),260)},kind==='turn'?4200:3000);
}
function mdPickToast(k){const r=MD.room,p=MD.picks[k];if(!r||!p)return;const s=mdSeatAt(k,r.settings.teams),o=MD.by[p[0]];if(!o||s===MD.you)return;
  mdToast(`${mdSeatName(s)} picked ${o.n}`,'',mdAv(r.seats[s],'md-av-xs'))}
function mdBeep(){if(!mdAcct('mdSound',false))return;try{const C=window.AudioContext||window.webkitAudioContext,c=MD.ac||(MD.ac=new C());[0,.16].forEach((d,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=i?880:660;g.gain.setValueAtTime(.0001,c.currentTime+d);g.gain.exponentialRampToValueAtTime(.16,c.currentTime+d+.02);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+d+.22);o.connect(g);g.connect(c.destination);o.start(c.currentTime+d);o.stop(c.currentTime+d+.25)})}catch(e){}}
function mdTitle(on){if(on&&!MD.titleT){MD.title=document.title;let f=false;MD.titleT=setInterval(()=>{f=!f;document.title=f?'You’re on the clock':MD.title},900)}
  else if(!on&&MD.titleT){clearInterval(MD.titleT);MD.titleT=null;document.title=MD.title||'TradeMetric'}}

/* ---------- entry page ---------- */
function mdRender(){
  const el=mdRoot();if(!el)return;
  document.body.classList.toggle('md-in-room',mdOn()&&(MD.page==='room'||MD.page==='lobby'));
  if(MD.join&&MD.page==='home'){const c=MD.join;MD.join=null;mdJoinCode(c)}
  if(MD.page==='room'&&MD.room)return mdRoomRender(el);
  if(MD.page==='lobby'&&MD.room)return mdLobbyRender(el);
  if(MD.page==='results'&&MD.room)return mdResultsRender(el);
  MD.page='home';mdHomeRender(el);
}
function mdAgo(t){const d=(Date.now()-t)/864e5;return d<1?'Today':d<2?'Yesterday':new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
function mdCountdown(ms){const s=Math.max(0,Math.ceil(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function mdHomeRender(el){
  const H=MD.home,pro=tmoIsPro(),localSolo=mdAcct('mdSolo',null),resume=(H&&H.solo)||(localSolo&&localSolo.room&&localSolo.room.status!=='done'?{carry:true,cur:(localSolo.picks||[]).length,total:localSolo.room.settings.teams*MD_SLOTS.reduce((a,k)=>a+(localSolo.room.settings.roster[k]||0),0),teams:localSolo.room.settings.teams}:null);
  const hist=(H&&H.results)||mdAcct('mdHist',[])||[],lob=(H&&H.lobbies)||[],rooms=!H||H.rooms;
  const card=(k,ic,h,p,body)=>`<section class="md-mode" data-md-spot><span class="md-mode-ic md-mode-${k}">${ic}</span><h2>${h}</h2><p>${p}</p>${body}</section>`;
  el.innerHTML=`<div class="md-home">
    <div class="md-hero"><div><div class="kicker">TradeMetric Pro · Draft Tools</div><h1>Mock drafts</h1>
      <p>Practice against teams that draft like real leagues, with a live clock and a board that fills in. Finish and get your draft graded.</p></div></div>
    ${resume?`<div class="md-resume"><div><b>You have a draft in progress</b><span>${resume.teams} teams · pick ${Math.min(resume.cur+1,resume.total)} of ${resume.total}</span></div><div class="md-resume-b"><button class="btn accent" type="button" data-md="resume">Resume draft</button><button class="btn ghost" type="button" data-md="discard">Discard</button></div></div>`:''}
    <div class="md-modes">
      ${card('solo',MD_IC.cpu,'Draft vs CPU','You against computer teams that change strategy every run. Starts right away.',`<div class="md-mode-b"><button class="btn accent md-big" type="button" data-md="solo">Start now</button><button class="btn md-big" type="button" data-md="set-solo">Settings</button></div>`)}
      ${card('friends',MD_IC.friends,'Draft with friends','A private room with an invite link. Empty seats are filled by CPU teams.',`<div class="md-mode-b"><button class="btn primary md-big" type="button" data-md="set-friends"${pro?'':' disabled title="Creating a room is part of TradeMetric Pro"'}>Create room</button></div>
        <form class="md-code" data-md-form="code"><input type="text" name="code" maxlength="8" placeholder="Have a code?" aria-label="Room code" autocomplete="off" autocapitalize="characters"><button class="btn" type="submit">Join</button></form>`)}
      ${card('online',MD_IC.globe,'Join an online draft','Public lobbies anyone can join. Empty seats are filled by CPU teams, so every draft starts on time.',`<div class="md-mode-b"><button class="btn primary md-big" type="button" data-md="quick">Quick join</button></div>
        <ul class="md-lobbies">${!H?'<li class="md-lob md-sk"><i class="skel"></i></li><li class="md-lob md-sk"><i class="skel"></i></li>':!rooms?'<li class="md-lob-note">Online drafts aren’t switched on yet.</li>':lob.length?lob.map(l=>`<li><button class="md-lob" type="button" data-md="lobby" data-id="${esc(l.room)}"><span class="md-lob-n"><b>${esc(l.name)}</b><small>${l.clock}s clock · ${l.filled} of ${l.teams} seats</small></span><span class="md-avs">${l.seats.slice(0,4).map(s=>mdAv(s,'md-av-xs')).join('')}</span><span class="md-lob-t" data-md-until="${l.startsAt||''}">${l.startsAt?'Starts in '+mdCountdown(l.startsAt-mdNow()):'Open'}</span></button></li>`).join(''):'<li class="md-lob-note">No lobbies right now.</li>'}</ul>`)}
    </div>
    <div class="md-under">
      <section class="card md-hist"><div class="card-h"><h2>My mock drafts</h2>${hist.length?`<span class="note">Last ${hist.length}</span>`:''}</div>
        ${!H&&!hist.length?'<div class="md-sk"><i class="skel"></i><i class="skel"></i></div>':hist.length?`<ul class="md-hist-l">${hist.map(h=>`<li><button type="button" class="md-hist-i" ${h.room&&rooms?`data-md="past" data-id="${esc(h.room)}"`:'disabled'}><span class="md-g md-g-${esc((h.grade||'C')[0])}">${esc(h.grade||'')}</span><span class="md-hist-m"><b>${esc(h.team||'My team')}</b><small>${mdAgo(h.at)} · ${h.teams} teams · ${MD_SC[h.scoring]||''} · ${h.mode==='solo'?'vs CPU':h.mode==='friends'?'With friends':'Online'}</small></span><span class="md-hist-r">${mdOrd(h.rank)} of ${h.teams}</span></button></li>`).join('')}</ul>`:'<p class="note md-empty">Your finished drafts show up here with their grades.</p>'}
      </section>
      <section class="card md-soon"><div class="card-h"><h2>Draft pick values</h2><span class="tmo-soon-chip">Coming soon</span></div><p class="note">Is 1.04 worth more than 1.07 plus a 3rd? Pick values for every slot in your draft, and a grade for any pick trade.</p></section>
    </div>
    <a class="how md-how" href="#help-mock">How mock drafts work</a></div>`;
  if(!H&&!MD.homeLoading)mdHomeLoad();
}
async function mdHomeLoad(){MD.homeLoading=true;const j=await mdApi('home');MD.homeLoading=false;MD.home=j.ok?j:{rooms:false,results:null,lobbies:[],solo:null};MD.off=j.ok?j.now-Date.now():MD.off;
  clearInterval(MD.homeT);MD.homeT=setInterval(()=>{if(!mdOn()||MD.page!=='home'){clearInterval(MD.homeT);return}
    document.querySelectorAll('[data-md-until]').forEach(e=>{const t=+e.dataset.mdUntil;if(t)e.textContent=t>mdNow()?'Starts in '+mdCountdown(t-mdNow()):'Starting'});
    if(MD.home&&MD.home.rooms&&Date.now()-(MD.homeAt||0)>8000){MD.homeAt=Date.now();mdApi('lobbies').then(x=>{if(x.ok&&MD.home&&MD.page==='home'){MD.home.lobbies=x.lobbies;if(mdOn()&&!MD.ui.dlg)mdRender()}})}},1000);
  MD.homeAt=Date.now();if(mdOn()&&MD.page==='home')mdRender()}

/* ---------- settings sheet ---------- */
function mdSetInit(mode){const saved=mdAcct('mdSet2',null),s=JSON.parse(JSON.stringify(saved&&saved.roster?saved:MD_DEF));s.roster=Object.assign({},MD_DEF.roster,s.roster);if(mode!=='solo'&&!s.clock)s.clock=60;MD.ui.set=s;MD.ui.setMode=mode}
function mdLeagueSet(){try{if(typeof S==='undefined'||!S||S.noLeague||S.example||!S.league)return null;const L=S.league,sl=L.slots||{},sc=L.sc||{},rec=sc.recWR!=null?sc.recWR:sc.rec;
  const n=[8,10,12,14].reduce((a,b)=>Math.abs(b-(L.teams||12))<Math.abs(a-(L.teams||12))?b:a,12),cl=(k,v)=>Math.min(MD_SLOT_MAX[k],Math.max(0,Math.round(v||0)));
  return {name:L.name||'your league',teams:n,scoring:rec>=.9?'ppr':rec>=.4?'half':'std',roster:{QB:cl('QB',sl.QB),RB:cl('RB',sl.RB),WR:cl('WR',sl.WR),TE:cl('TE',sl.TE),FLEX:cl('FLEX',(sl.FLEX||0)+(sl.WRT||0)+(sl.RWT||0)),SF:cl('SF',(sl.SF||0)+(sl.SFLEX||0)+(sl.OP||0)),K:cl('K',sl.K),DST:cl('DST',(sl.DST||0)+(sl.DEF||0)),BN:cl('BN',sl.BN!=null?sl.BN:sl.BENCH!=null?sl.BENCH:6)}}}catch(e){return null}}
function mdSeg(key,cur,opts){return `<div class="seg md-seg" role="group">${opts.map(([v,l])=>`<button type="button" data-md="set" data-k="${key}" data-v="${v}" aria-pressed="${String(v)===String(cur)}">${l}</button>`).join('')}</div>`}
function mdSetHtml(){
  const s=MD.ui.set,mode=MD.ui.setMode,other=!!MD.ui.tOther||![8,10,12,14].includes(s.teams),CL=MD_CLOCKS.concat(mode==='solo'?[0]:[]),ci=Math.max(0,CL.indexOf(s.clock)>=0?CL.indexOf(s.clock):CL.findIndex(v=>v>=s.clock)),lg=mdLeagueSet(),rounds=MD_SLOTS.reduce((a,k)=>a+(s.roster[k]||0),0),host=mode==='lobby';
  const step=(k,l)=>`<div class="md-step"><span>${l}</span><div><button type="button" data-md="step" data-k="${k}" data-d="-1" aria-label="Fewer ${l}"${s.roster[k]<=0?' disabled':''}>−</button><b>${s.roster[k]}</b><button type="button" data-md="step" data-k="${k}" data-d="1" aria-label="More ${l}"${s.roster[k]>=MD_SLOT_MAX[k]?' disabled':''}>+</button></div></div>`;
  return `<div class="md-sheet-h"><h2>${mode==='solo'?'Draft settings':host?'Room settings':'Create a room'}</h2><button class="md-x" type="button" data-md="close" aria-label="Close">${MD_IC.x}</button></div>
  <div class="md-sheet-b">
    ${lg?`<button class="btn md-uselg" type="button" data-md="uselg">Use ${esc(lg.name)}’s settings</button>`:''}
    <div class="md-f"><label>Teams</label><div class="md-teams"><div class="seg md-seg" role="group">${[8,10,12,14].map(v=>`<button type="button" data-md="set" data-k="teams" data-v="${v}" aria-pressed="${!other&&s.teams===v}">${v}</button>`).join('')}<button type="button" data-md="teams-other" aria-pressed="${other}">Other</button></div>
      ${other?`<div class="md-stepper"><button type="button" data-md="tstep" data-d="-1" aria-label="Fewer teams"${s.teams<=4?' disabled':''}>−</button><span class="md-stepper-n"><b class="${MD.ui.tAnim?'md-roll md-roll-'+MD.ui.tAnim:''}">${s.teams}</b><small>teams</small></span><button type="button" data-md="tstep" data-d="1" aria-label="More teams"${s.teams>=20?' disabled':''}>+</button></div>`:''}</div></div>
    <div class="md-f"><label>Scoring</label>${mdSeg('scoring',s.scoring,[['ppr','PPR'],['half','Half PPR'],['std','Standard']])}</div>
    <div class="md-f"><label>Roster <small>${rounds} rounds</small></label><div class="md-steps">${step('QB','QB')}${step('RB','RB')}${step('WR','WR')}${step('TE','TE')}${step('FLEX','Flex')}${step('SF','Superflex')}${step('K','K')}${step('DST','D/ST')}${step('BN','Bench')}</div></div>
    <div class="md-f"><label for="md-clock-r">Pick clock <b class="md-range-v" id="md-clock-v">${s.clock?s.clock+' seconds':'No limit'}</b></label>
      <input type="range" class="md-range" id="md-clock-r" min="0" max="${CL.length-1}" step="1" value="${ci}" style="--p:${100*ci/(CL.length-1)}%" data-md-vals="${CL.join(',')}" aria-valuetext="${s.clock?s.clock+' seconds':'No limit'}">
      <div class="md-range-t"><span>15s</span><span>${mode==='solo'?'No limit':'120s'}</span></div></div>
    <div class="md-f"><label>CPU pick speed</label>${mdSeg('speed',s.speed,[['instant','Instant'],['fast','Fast'],['real','Realistic']])}</div>
    ${mode==='solo'?`<div class="md-f"><label for="md-slot">Your draft slot</label><select id="md-slot" data-md-change="slot"><option value="0">Random</option>${Array.from({length:s.teams},(_,i)=>`<option value="${i+1}"${s.slot===i+1?' selected':''}>Pick ${i+1}</option>`).join('')}</select></div>`:''}
  </div>
  <div class="md-sheet-f"><button class="btn accent md-big" type="button" data-md="${mode==='solo'?'solo':host?'save-set':'create-friends'}">${mode==='solo'?'Start draft':host?'Save settings':'Create room'}</button></div>`;
}
function mdDlg(kind,html){mdDlgClose();const w=document.createElement('div');w.className='md-scrim';w.id='md-dlg';w.innerHTML=`<div class="md-sheet md-sheet-${kind}" role="dialog" aria-modal="true">${html}</div>`;document.body.appendChild(w);MD.ui.dlg=kind;requestAnimationFrame(()=>w.classList.add('md-open'))}
function mdDlgPaint(html){const s=document.querySelector('#md-dlg .md-sheet');if(s){const y=s.querySelector('.md-sheet-b'),top=y?y.scrollTop:0;s.innerHTML=html;const y2=s.querySelector('.md-sheet-b');if(y2)y2.scrollTop=top}}
function mdDlgClose(){const w=document.getElementById('md-dlg');if(w)w.remove();MD.ui.dlg=null;MD.ui.sheet=null}
function mdConfirm(title,text,yes,act){mdDlg('confirm',`<div class="md-sheet-h"><h2>${esc(title)}</h2></div><div class="md-sheet-b"><p class="md-confirm-t">${esc(text)}</p></div><div class="md-sheet-f md-two"><button class="btn md-big" type="button" data-md="close">Cancel</button><button class="btn accent md-big" type="button" data-md="${act}">${esc(yes)}</button></div>`)}

/* ---------- starting, joining, leaving ---------- */
async function mdBusy(fn){if(MD.busy)return;MD.busy=true;document.body.classList.add('md-busy');try{await fn()}finally{MD.busy=false;document.body.classList.remove('md-busy')}}
function mdStartSolo(){return mdBusy(async()=>{if(!MD.ui.set)mdSetInit('solo');const set=MD.ui.set;mdAcctSet('mdSet2',set);mdDlgClose();MD.carry=null;
  const j=await mdApi('create',{mode:'solo',settings:set});if(!j.ok)return mdFail(j);MD.home=null;MD.ui.spot=!set.slot;MD.ui.spotAnim=true;mdApply(j,{instant:!set.slot})})}
/* solo, random spot: say where you landed and let you take a different spot before you start */
function mdSpotHtml(){const r=MD.room,n=r.settings.teams;return `<div class="md-shuffle-in md-spot-in"><div class="kicker">Draft order</div>
  <h2 class="md-spot-t">You pick <b id="md-spot-n">${mdOrd(MD.you+1)}</b></h2><p class="note">That spot was picked at random. Keep it, or choose the one you want.</p>
  <div class="md-spot-g" role="group" aria-label="Draft spot">${Array.from({length:n},(_,i)=>`<button type="button" data-md="spot" data-v="${i+1}" aria-pressed="${i===MD.you}">${i+1}</button>`).join('')}</div>
  <button class="btn accent md-big md-wide" type="button" data-md="spot-go">Start drafting</button></div>`}
function mdSpot(){const box=document.getElementById('md-spot'),r=MD.room;if(!box)return;box.innerHTML=mdSpotHtml();
  if(MD.ui.spotAnim&&!mdCalm()){MD.ui.spotAnim=false;const e=document.getElementById('md-spot-n'),n=r.settings.teams,t0=Date.now(),iv=setInterval(()=>{const x=document.getElementById('md-spot-n');if(!x){clearInterval(iv);return}
    if(Date.now()-t0>900){clearInterval(iv);x.textContent=mdOrd(MD.you+1);x.classList.add('md-land')}else x.textContent=mdOrd(1+Math.floor(Math.random()*n))},70)}else MD.ui.spotAnim=false}
function mdSpotPick(v){if(v===MD.you+1)return;return mdBusy(async()=>{clearTimeout(MD.revT);const j=await mdApi('slot',{room:MD.room.id,slot:v});if(j.ok){MD.paused=false;mdApply(j,{instant:true})}else{if(j.code==='late')MD.ui.spot=false;mdFail(j);mdRender()}})}
function mdCreateFriends(){return mdBusy(async()=>{const set=MD.ui.set;mdAcctSet('mdSet2',set);mdDlgClose();const j=await mdApi('create',{mode:'friends',settings:set});if(!j.ok)return mdFail(j);MD.home=null;mdApply(j);try{history.replaceState(null,'','#draft/'+j.room.code)}catch(e){}})}
function mdJoinCode(code){return mdBusy(async()=>{code=String(code||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();if(code.length<4)return mdToast('That code looks too short.','bad');
  const j=await mdApi('join',{code});if(!j.ok){try{history.replaceState(null,'','#drafttools')}catch(e){}return mdFail(j)}MD.home=null;mdApply(j)})}
function mdJoinRoom(id,quick){return mdBusy(async()=>{const j=await mdApi(quick?'quick':'join',quick?{}:{room:id});if(!j.ok)return mdFail(j);MD.home=null;mdApply(j)})}
function mdResume(){return mdBusy(async()=>{const H=MD.home,c=mdAcct('mdSolo',null);
  if(H&&H.solo){const j=await mdApi('join',{room:H.solo.room});if(j.ok)return mdApply(j,{instant:true});return mdFail(j)}
  if(c&&c.room){MD.carry=c;MD.room={id:c.room.id,mode:'solo'};const j=await mdApi('state',{room:c.room.id,pool:1});MD.room=null;if(j.ok)return mdApply(j,{instant:true});MD.carry=null;mdAcctSet('mdSolo',null);mdFail(j);mdRender()}})}
function mdDiscard(){return mdBusy(async()=>{mdDlgClose();const H=MD.home,id=MD.room?MD.room.id:H&&H.solo?H.solo.room:null;if(id&&!(MD.carry&&!H))await mdApi('abandon',{room:id});MD.carry=null;mdAcctSet('mdSolo',null);MD.home=null;mdLeaveLocal()})}
function mdLeave(){return mdBusy(async()=>{mdDlgClose();const r=MD.room;if(!r)return;if(r.mode!=='solo'&&r.status!=='done'){await mdApi('leave',{room:r.id});mdPing()}try{if(location.hash.startsWith('#draft/'))history.replaceState(null,'','#drafttools')}catch(e){}MD.home=null;mdLeaveLocal()})}
function mdAskLeave(){const r=MD.room;if(!r)return;if(r.status==='done'||r.status==='lobby'&&r.mode==='solo')return mdLeave();
  if(r.mode==='solo')return mdConfirm('Leave this draft?','Your draft is saved. You can pick it up again from Draft Tools.','Leave','leave-yes');
  if(r.status==='lobby')return mdConfirm('Leave the room?',r.host===MD.you?'The next person in the room becomes the host.':'Your seat opens up for someone else.','Leave','leave-yes');
  mdConfirm('Leave this draft?','The draft keeps going and your team is picked automatically.','Leave draft','leave-yes')}

/* ---------- lobby (friends and online) ---------- */
function mdLobbyRender(el){
  const r=MD.room,pub=r.mode==='public',host=!pub&&r.host===MD.you,n=r.settings.teams,filled=r.seats.filter(s=>s.k==='h').length,link=location.origin+location.pathname+'#draft/'+(r.code||'');
  const here=i=>!MD.present||MD.present.has(String(i));
  el.innerHTML=`<div class="md-lobby">
    <div class="md-lobby-h"><div><div class="kicker">${pub?'Online draft':'Private room'}</div><h1>${pub?esc((MD.home&&MD.home.lobbies||[]).filter(l=>l.room===r.id).map(l=>l.name)[0]||n+'-team draft'):'Draft lobby'}</h1>
      <p class="md-lobby-s">${n} teams · ${MD_SC[r.settings.scoring]} · ${r.rounds} rounds · ${r.settings.clock}s clock${r.settings.roster.SF?' · Superflex':''}</p></div>
      <button class="btn" type="button" data-md="ask-leave">Leave</button></div>
    <div class="md-lobby-g">
      <section class="card md-seats-c"><div class="card-h"><h2>${pub?'Choose your spot':'Seats'}</h2><span class="note">${filled} of ${n} filled${host?' · drag to set the draft order':''}</span></div>
        ${pub?`<p class="note md-seats-n">You’re in spot ${MD.you+1}, so you pick ${mdOrd(MD.you+1)} in round 1. Tap any open spot to draft from there instead.</p>`:''}
        <ol class="md-seats${host?' md-sortable':''}" data-md-sort="seats">${r.seats.map((s,i)=>`<li class="md-seat${i===MD.you?' md-me':''}${s.k==='o'?' md-open':''}" data-i="${i}">
          ${host?`<span class="md-grip" data-md-grip aria-hidden="true">${MD_IC.grip}</span>`:''}<span class="md-seat-n">${i+1}</span>
          <span class="md-av-w">${mdAv(s)}${s.k==='h'?`<i class="md-dot${here(i)?' md-on':''}" title="${here(i)?'Here':'Away'}"></i>`:''}</span>
          <span class="md-seat-m"><b>${s.k==='o'?(pub?'Open spot':'Open seat'):esc(s.name)}</b><small>${s.k==='o'?(pub?'CPU team if nobody takes it':'Waiting for a friend'):s.k==='c'?'CPU team':i===r.host?'Host':i===MD.you?'You':'Joined'}</small></span>
          ${s.k==='c'?'<span class="md-cpu">CPU</span>':''}
          ${pub&&s.k==='o'?`<button class="btn small" type="button" data-md="seat" data-i="${i}">Draft here</button>`:''}
          ${i===MD.you&&!pub?`<button class="btn small" type="button" data-md="rename">Rename</button>`:''}
          ${host&&s.k!=='h'?`<button class="btn small ghost" type="button" data-md="cpu" data-i="${i}">${s.k==='c'?'Open seat':'Make CPU'}</button>`:''}
          ${host&&s.k==='h'&&i!==MD.you?`<button class="btn small ghost" type="button" data-md="kick" data-i="${i}">Remove</button>`:''}</li>`).join('')}</ol>
      </section>
      <div class="md-lobby-side">
        ${pub?`<section class="card md-count"><div class="md-count-t" id="md-count">${r.startsAt?mdCountdown(r.startsAt-mdNow()):'3:00'}</div><b>${r.startsAt?'Draft starts in':'Countdown starts when someone joins'}</b><p class="note">Empty seats are filled by CPU teams, so the draft always starts on time. The spot you choose is your pick in round 1.</p></section>`
        :`<section class="card md-invite"><div class="card-h"><h2>Invite friends</h2></div><p class="note">Anyone with this link and a free account can join.</p>
          <div class="md-link"><input type="text" readonly value="${esc(link)}" aria-label="Invite link" onfocus="this.select()"><button class="btn" type="button" data-md="copy" data-v="${esc(link)}">Copy</button>${navigator.share?`<button class="btn" type="button" data-md="share-link" data-v="${esc(link)}">Share</button>`:''}</div>
          <div class="md-codebig"><span>Room code</span><b>${esc(r.code||'')}</b></div></section>
          <section class="card md-go">${host?`<button class="btn accent md-big md-wide" type="button" data-md="start">Start draft</button><div class="md-go-b"><button class="btn" type="button" data-md="randomize">Randomize order</button><button class="btn" type="button" data-md="set-lobby">Change settings</button></div><p class="note">Empty seats are filled by CPU teams when you start.</p>`
            :`<div class="md-wait"><span class="md-wait-d"><i></i><i></i><i></i></span><b>Waiting for host</b><p class="note">${esc(mdSeatName(r.host))} starts the draft.</p></div>`}</section>`}
      </div>
    </div></div>`;
  if(host)mdSortable(el.querySelector('.md-seats'),order=>mdBusy(async()=>{const j=await mdApi('order',{room:r.id,order});if(j.ok){mdApply(j);mdPing()}else{mdFail(j);mdRender()}}));
}
function mdLobbyClock(){const e=document.getElementById('md-count'),r=MD.room;if(e&&r&&r.startsAt)e.textContent=mdCountdown(r.startsAt-mdNow())}
function mdLobbyAct(action,body){return mdBusy(async()=>{const j=await mdApi(action,Object.assign({room:MD.room.id},body||{}));if(j.ok){mdApply(j);mdPing()}else mdFail(j)})}

/* drag to reorder (pointer events, so it works with a finger too). done(order) gets the old indexes in their new order. */
function mdSortable(list,done){
  if(!list)return;
  list.addEventListener('pointerdown',e=>{
    const grip=e.target.closest('[data-md-grip]');if(!grip)return;const li=grip.closest('li');if(!li)return;e.preventDefault();
    const items=()=>[...list.children],start=items().indexOf(li),r0=li.getBoundingClientRect(),y0=e.clientY;let moved=false;
    li.classList.add('md-drag');try{grip.setPointerCapture(e.pointerId)}catch(x){}
    const move=ev=>{const dy=ev.clientY-y0;if(Math.abs(dy)>3)moved=true;li.style.transform=`translateY(${dy}px)`;
      const mid=r0.top+dy+r0.height/2;let to=li;for(const o of items()){if(o===li)continue;const b=o.getBoundingClientRect();if(mid>b.top&&mid<b.bottom){to=o;break}}
      if(to!==li){const all=items(),a=all.indexOf(li),b=all.indexOf(to);list.insertBefore(li,a<b?to.nextSibling:to);const r1=li.getBoundingClientRect();li.style.transform='';const off=li.getBoundingClientRect().top;li.style.transform=`translateY(${r0.top+dy-off}px)`}};
    const up=()=>{grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',up);grip.removeEventListener('pointercancel',up);li.classList.remove('md-drag');li.style.transform='';
      const order=items().map(x=>x.dataset.i!=null?+x.dataset.i:x.dataset.id);if(moved&&items().indexOf(li)!==start)done(order)};
    grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',up);grip.addEventListener('pointercancel',up);
  });
}

/* ---------- the draft room ---------- */
function mdRoomRender(el){
  const r=MD.room,solo=mdSolo(),friends=r.mode==='friends',host=friends&&r.host===MD.you;
  if(!friends&&MD.ui.tab==='chat')MD.ui.tab='team';
  const tabs=[['team','My team'],['queue','Queue'],['picks','Picks']].concat(friends?[['chat','Chat']]:[]);
  const ptabs=[['players','Players'],['team','Team'],['queue','Queue'],['board','Board']].concat(friends?[['chat','Chat']]:[]);
  el.innerHTML=`<div class="md-room" data-ptab="${MD.ui.ptab}">
    <header class="md-top" id="md-top">
      <div class="md-clock" id="md-clock"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="md-ring-bg" cx="22" cy="22" r="19"/><circle class="md-ring" id="md-ring" cx="22" cy="22" r="19" pathLength="100"/></svg><b id="md-secs"></b></div>
      <div class="md-otc" id="md-otc"></div>
      <div class="md-hl" id="md-hl" aria-live="polite"></div>
      <div class="md-top-r">
        <span class="md-next" id="md-next"></span>
        ${solo?`<button class="btn small" type="button" data-md="sim" id="md-sim">Sim to my pick</button><button class="btn small" type="button" data-md="pause" id="md-pause">Pause</button><button class="btn small" type="button" data-md="undo" id="md-undo">Undo</button>`:''}
        ${host?`<button class="btn small" type="button" data-md="pause" id="md-pause">Pause</button>`:''}
        <button class="btn small md-board-btn" type="button" data-md="board">${MD_IC.board}<span>Board</span></button>
        <button class="md-icon" type="button" data-md="sound" id="md-sound" aria-label="Sound">${MD_IC.sound}</button>
        <button class="btn small ghost" type="button" data-md="ask-leave">Leave</button>
      </div>
    </header>
    <div class="md-strip" id="md-strip" aria-label="Upcoming picks"></div>
    <div class="md-turnbar" id="md-turnbar" hidden>You’re on the clock</div>
    <div class="md-main">
      <section class="md-pool md-pane" data-pane="players">
        <div class="md-assist" id="md-assist" hidden></div>
        <div class="md-tools">
          <label class="md-search">${MD_IC.search}<input type="search" id="md-q" placeholder="Search players" autocomplete="off" value="${esc(MD.ui.q)}" aria-label="Search players"><kbd>/</kbd></label>
          <div class="seg md-seg md-posseg" role="group" aria-label="Position">${['ALL','QB','RB','WR','TE','FLEX'].concat(r.settings.roster.K?['K']:[],r.settings.roster.DST?['DST']:[]).map(p=>`<button type="button" data-md="pos" data-v="${p}" aria-pressed="${MD.ui.pos===p}">${p==='ALL'?'All':p==='DST'?'DEF':p}</button>`).join('')}<button type="button" data-md="pos" data-v="FAV" aria-pressed="${MD.ui.pos==='FAV'}" title="Your favorites" aria-label="Your favorites">★</button></div>
          <div class="md-tools-r"><div class="seg md-seg" role="group" aria-label="Sort"><button type="button" data-md="sort" data-v="adp" aria-pressed="${MD.ui.sort==='adp'}">ADP</button><button type="button" data-md="sort" data-v="tm" aria-pressed="${MD.ui.sort==='tm'}">TM rank</button></div>
          <label class="md-check"><input type="checkbox" id="md-hide"${MD.ui.hide?' checked':''}> Hide drafted</label></div>
        </div>
        <div class="md-list-h"><span>ADP</span><span>Player</span><span class="md-c-bye">Bye</span><span class="md-c-tm">TM rank</span><span class="md-c-ppg">Pts/G</span><span></span></div>
        <div class="md-list" id="md-list"></div>
      </section>
      <aside class="md-side">
        <div class="seg md-seg md-sidetabs" role="tablist">${tabs.map(([k,l])=>`<button type="button" role="tab" data-md="tab" data-v="${k}" aria-pressed="${MD.ui.tab===k}">${l}${k==='queue'?'<i class="md-n" id="md-qn"></i>':''}</button>`).join('')}</div>
        <div class="md-side-b md-pane" id="md-side"></div>
      </aside>
      <section class="md-pane md-pboard" data-pane="board" id="md-pboard"></section>
      <div class="md-overlay" id="md-overlay" hidden></div>
    </div>
    <nav class="md-ptabs" aria-label="Draft room">${ptabs.map(([k,l])=>`<button type="button" data-md="ptab" data-v="${k}" aria-pressed="${MD.ui.ptab===k}">${l}</button>`).join('')}</nav>
    ${MD.ui.shuffle?'<div class="md-shuffle" id="md-shuffle"></div>':''}
    ${solo&&MD.ui.spot&&r.status!=='done'?'<div class="md-shuffle md-spot" id="md-spot"></div>':''}
  </div>`;
  mdSize();mdPaint();if(MD.ui.shuffle)mdShuffle();mdSpot();
}
function mdSize(){const rm=document.querySelector('.md-room');if(!rm)return;const top=rm.getBoundingClientRect().top+window.scrollY;rm.style.setProperty('--md-h',Math.max(420,window.innerHeight-top-(parseFloat(getComputedStyle(document.body).marginBottom)||0)-(mdPhone()?0:14))+'px')}
addEventListener('resize',()=>{if(MD.page==='room'&&mdOn())mdSize()});
/* the draft order reveal: names shuffle for a moment, then settle in order */
function mdShuffle(){const box=document.getElementById('md-shuffle'),r=MD.room;if(!box)return;const t0=MD.ui.shuffle,names=r.seats.map(s=>s.name);
  const paint=final=>{const L=final?r.seats:r.seats.slice().sort(()=>Math.random()-.5);box.innerHTML=`<div class="md-shuffle-in"><div class="kicker">Draft order</div><ol>${L.map((s,i)=>`<li class="${final&&r.seats.indexOf(s)===MD.you?'md-me':''}"><span>${i+1}</span>${mdAv(s,'md-av-sm')}<b>${esc(s.name)}</b></li>`).join('')}</ol></div>`};
  paint(false);const iv=setInterval(()=>{if(Date.now()-t0>1500){clearInterval(iv);paint(true);box.classList.add('md-set');setTimeout(()=>{MD.ui.shuffle=null;box.remove()},1700)}else paint(false)},130)}
function mdPaint(){if(MD.page!=='room'||!MD.room||!document.getElementById('md-top'))return;mdPaintTop();mdPaintStrip();mdPaintPool();mdPaintSide();mdPaintBoard();mdClock()}
function mdPaintTop(){
  const r=MD.room,n=r.settings.teams,k=Math.min(MD.shown,mdTotal()-1),seat=mdSeatAt(k,n),s=r.seats[seat],turn=mdMyTurn(),nx=mdNextIn(),paused=r.status==='paused'||MD.paused;
  const top=document.getElementById('md-top');top.classList.toggle('md-turn',turn);top.classList.toggle('md-paused',paused);
  document.getElementById('md-otc').innerHTML=`${mdAv(s,'md-av-lg')}<div><small>Round ${Math.floor(k/n)+1} · Pick ${k%n+1} · ${k+1} overall${!turn&&nx>0?` · <span class="md-nx">you pick in ${nx}</span>`:!turn&&nx===0?' · <span class="md-nx">you’re up next</span>':''}</small><b>${paused?'Draft paused':turn?'You’re on the clock':esc(s.name)+' is on the clock'}${s.k==='c'&&!turn&&!paused?'<span class="md-cpu">CPU</span>':''}${s.auto&&s.k==='h'?'<span class="md-cpu">Auto</span>':''}</b></div>`;
  const me=r.seats[MD.you];
  document.getElementById('md-next').innerHTML=me&&me.auto?`<button class="btn small accent" type="button" data-md="back">I’m back</button>`:'';mdPaintHeadline();
  const pb=document.getElementById('md-pause');if(pb)pb.textContent=paused?'Resume':'Pause';
  const sim=document.getElementById('md-sim');if(sim)sim.disabled=MD.shown>=MD.picks.length;
  const un=document.getElementById('md-undo');if(un)un.disabled=!MD.picks.some((p,i)=>p[1]==='user'&&mdSeatAt(i,n)===MD.you);
  const sd=document.getElementById('md-sound');sd.classList.toggle('md-on',!!mdAcct('mdSound',false));sd.title=mdAcct('mdSound',false)?'Sound on':'Sound off';
  const tb=document.getElementById('md-turnbar');tb.hidden=!turn;
  if(turn&&!MD.wasTurn){if(!mdPhone())mdToast('You’re on the clock','turn');mdBeep();try{navigator.vibrate&&navigator.vibrate([120,60,120])}catch(e){}}
  MD.wasTurn=turn;mdTitle(turn&&mdOn());
}
/* the headline in the middle of the top bar: the pick that was just made, with his jersey */
function mdPaintHeadline(){
  const el=document.getElementById('md-hl');if(!el)return;const r=MD.room,k=MD.shown-1;
  if(k<0){if(el.dataset.k!=='-1'){el.dataset.k='-1';el.innerHTML='<div class="md-hl-in md-hl-0"><small>Latest pick</small><b>The first pick is coming up</b></div>'}return}
  if(el.dataset.k===String(k))return;const p=MD.picks[k],o=MD.by[p[0]],si=mdSeatAt(k,r.settings.teams);if(!o)return;
  const anim=el.dataset.k!==undefined&&!mdCalm();el.dataset.k=String(k);
  el.innerHTML=`<div class="md-hl-in${anim?' md-hl-new':''}${si===MD.you?' md-me':''}" data-md="sheet" data-id="${esc(o.id)}">${mdJy(o,'md-jy-lg')}<div class="md-hl-t"><small>Pick ${mdPickLabel(k)} · ${si===MD.you?'You':esc(mdSeatName(si))}</small><b>${esc(o.n)}</b></div><span class="md-hl-r">${mdPosChip(o.pos)}${mdTm(o.t)}</span></div>`;
}
function mdClock(){
  const r=MD.room,ring=document.getElementById('md-ring'),secs=document.getElementById('md-secs'),box=document.getElementById('md-clock');if(!r||!ring)return;
  const turnSeat=r.seats[mdSeatAt(Math.min(MD.shown,mdTotal()-1),r.settings.teams)],revealing=MD.shown<MD.picks.length,clock=r.settings.clock;
  let left=null;
  if(r.status==='paused')left=r.pausedLeft!=null?r.pausedLeft/1000:null;
  else if(r.deadline!=null&&!revealing)left=Math.max(0,(r.deadline-mdNow())/1000);
  const human=turnSeat&&turnSeat.k==='h'&&!turnSeat.auto;
  if(left!=null&&human&&clock){left=Math.min(left,clock);const s=Math.ceil(left);ring.style.strokeDashoffset=String(100-100*left/clock);if(secs.textContent!==String(s)){secs.textContent=s;secs.classList.remove('md-tick');void secs.offsetWidth;secs.classList.add('md-tick')}box.className='md-clock'+(left<=10?' md-low':'')+(mdMyTurn()?' md-mine':'')}
  else{ring.style.strokeDashoffset='0';secs.textContent=human&&!clock?'∞':'';box.className='md-clock'+(human?'':' md-think')+(mdMyTurn()?' md-mine':'')}
}
function mdPaintStrip(){
  const r=MD.room,n=r.settings.teams,T=mdTotal(),el=document.getElementById('md-strip'),from=MD.shown,items=[];
  for(let k=from;k<Math.min(T,from+16);k++){const si=mdSeatAt(k,n),s=r.seats[si],now=k===from;
    if(k>from&&k%n===0)items.push(`<div class="md-up-rd"><span>R${k/n+1}</span></div>`);
    items.push(`<div class="md-up${now?' md-now':''}${si===MD.you?' md-me':''}" data-k="${k}"><small>${now?'On the clock':mdPickLabel(k)}</small><b>${si===MD.you?'You':esc(s.name)}</b></div>`)}
  if(el.dataset.from!==String(from)&&el.dataset.from!==undefined&&!mdCalm()){el.classList.remove('md-slide');void el.offsetWidth;el.classList.add('md-slide')}
  el.dataset.from=String(from);el.innerHTML=items.length?`<div class="md-strip-in">${items.join('')}</div>`:'<div class="md-strip-in"><div class="md-up md-now"><small>Final</small><b>Draft complete</b></div></div>';
}
function mdValueTag(o,k){const d=(k+1)-o.adp;return o.pos!=='K'&&o.pos!=='DST'&&d>=Math.max(6,.15*(k+1))}
function mdIsReach(o,k){return o.pos!=='K'&&o.pos!=='DST'&&o.adp-(k+1)>=Math.max(8,.25*(k+1))}
function mdTmCell(o){return o.tm?`<span class="md-tmr">${o.tm}</span>${typeof tmoDiff==='function'&&o.diff?tmoDiff(o.diff):''}`:'<span class="md-tmr md-dim">—</span>'}
function mdFiltered(){
  const u=MD.ui,taken=mdTaken(),q=u.q.trim().toLowerCase();
  const favs=u.pos==='FAV'?mdFavs():null;
  let L=MD.pool.filter(o=>(u.pos==='ALL'||(u.pos==='FAV'?favs.has(o.id):u.pos==='FLEX'?/RB|WR|TE/.test(o.pos):o.pos===u.pos))&&(!u.hide||!taken.has(o.id))&&(!q||o.n.toLowerCase().includes(q)||(o.t||'').toLowerCase()===q));
  if(u.sort==='tm')L=L.slice().sort((a,b)=>(a.tm||900+a.adp)-(b.tm||900+b.adp));
  return {L,taken};
}
function mdPaintPool(){
  const el=document.getElementById('md-list');if(!el)return;const u=MD.ui,{L,taken}=mdFiltered(),turn=mdMyTurn(),k=MD.shown,qs=new Set(MD.queue),mine=mdSeatIds(MD.you),favs=mdFavs();
  const tiers=u.sort==='tm'&&u.pos==='ALL'&&!u.q;
  el.innerHTML=L.slice(0,u.limit).map(o=>{const gone=taken.has(o.id),ok=turn&&!gone&&mdLegal(mine,o.pos),conf=u.confirm===o.id;
    return (tiers&&o.tierStart&&o.tier>1?`<div class="md-tier"><span>Tier ${o.tier}</span></div>`:'')+`<div class="md-row${gone?' md-gone':''}${qs.has(o.id)?' md-q':''}" data-md="sheet" data-id="${esc(o.id)}" tabindex="0">
      <span class="md-adp">${o.adp}</span>
      <span class="md-pl">${mdJy(o)}<span class="md-pl-n"><b>${esc(o.n)}${favs.has(o.id)?MD_FAV:''}</b><small>${mdPosChip(o.pos)}${mdTm(o.t)}${conf?`<em class="md-rch">Reach · usually pick ${o.adp}</em>`:!gone&&mdValueTag(o,k)?'<em class="md-val">Value</em>':''}</small></span></span>
      <span class="md-c-bye">${o.bye||'—'}</span>
      <span class="md-c-tm">${mdTmCell(o)}</span>
      <span class="md-c-ppg">${o.ppg?o.ppg.toFixed(1):'—'}</span>
      <span class="md-acts">${gone?'<span class="md-took">Drafted</span>':`<button class="md-star${qs.has(o.id)?' md-on':''}" type="button" data-md="q" data-id="${esc(o.id)}" title="${qs.has(o.id)?'In your queue':'Add to queue'}" aria-label="${qs.has(o.id)?'Remove from queue':'Add to queue'}" aria-pressed="${qs.has(o.id)}">${qs.has(o.id)?MD_IC.check:MD_IC.plus}</button><button class="md-draft${conf?' md-arm':''}" type="button" data-md="draft" data-id="${esc(o.id)}"${ok?'':' disabled'}>${conf?MD_IC.check+'<span>Confirm</span>':'Draft'}</button>`}</span></div>`}).join('')
    +(L.length>u.limit?`<button class="btn md-more" type="button" data-md="more">Show more</button>`:'')||`<p class="note md-empty">${u.pos==='FAV'?'No favorites here yet. Open a player and tap Favorite, or star players on the Rankings page.':'No players match.'}</p>`;
  mdPaintAssist();
}
/* Pro assist: up to three suggestions on your turn, from TM rank and what your roster still needs */
function mdSuggest(){
  const r=MD.room,R=r.settings.roster,mine=mdSeatIds(MD.you),c=mdCounts(mine),f=mdFit(c,R),taken=mdTaken(),round=Math.floor(MD.shown/r.settings.teams)+1,left=r.rounds-mine.length,out=[];
  for(const o of MD.pool){if(taken.has(o.id)||!mdLegal(mine,o.pos))continue;const kd=o.pos==='K'||o.pos==='DST';if(kd&&round<=r.rounds-3&&left>f.openN)continue;
    const d=Object.assign({},c);d[o.pos]++;const a=mdFit(d,R),fills=a.openN<f.openN;if(left<=f.openN&&!fills)continue;
    let w=100/((o.tm||o.adp+20)+12);w*=fills?(f.open[o.pos]>0?1.35:1.12):((o.pos==='QB'||o.pos==='TE')?.35:.8);
    out.push({o,w,why:fills?(f.open[o.pos]>0?'Fills your '+(o.pos==='DST'?'defense':o.pos):'Fills your flex'):mdValueTag(o,MD.shown)?'Fell past ADP':'Best available'});if(out.length>60)break}
  return out.sort((a,b)=>b.w-a.w).slice(0,3);
}
function mdPaintAssist(){const el=document.getElementById('md-assist');if(!el)return;const on=mdMyTurn()&&typeof tmoIsPro==='function'&&tmoIsPro();el.hidden=!on;if(!on)return;
  el.innerHTML=`<span class="md-assist-l">Best available for your team</span>${mdSuggest().map(x=>`<button type="button" class="md-sug" data-md="sheet" data-id="${esc(x.o.id)}">${mdJy(x.o,'md-jy-sm')}<b>${esc(mdShort(x.o.n))}</b><small>${x.o.pos} · ${x.why}</small></button>`).join('')}`}
function mdRosterHtml(seat,n){
  const r=MD.room,ids=mdSeatIds(seat,n),L=mdLayout(ids),c=mdCounts(ids);
  return `<ul class="md-roster">${L.map(s=>{const o=s.id&&MD.by[s.id];return `<li class="${o?'':'md-emp'}"><span class="md-slot">${s.slot==='DST'?'DEF':s.slot==='SF'?'SFLX':s.slot}</span>${o?`${mdJy(o,'md-jy-sm')}<b>${esc(o.n)}</b>${mdTm(o.t)}<small>${o.bye?'Bye '+o.bye:''}</small>`:'<b class="md-dim">Empty</b>'}</li>`}).join('')}</ul>
    <p class="md-count-line">${['QB','RB','WR','TE'].concat(r.settings.roster.K?['K']:[],r.settings.roster.DST?['DST']:[]).map(p=>`${p==='DST'?'DEF':p} <b>${c[p]}</b>`).join(' · ')}</p>`;
}
function mdPickRow(k,fresh){const r=MD.room,p=MD.picks[k],o=MD.by[p[0]],si=mdSeatAt(k,r.settings.teams),s=r.seats[si],re=r.reacts&&r.reacts[k];if(!o)return '';
  return `<li class="md-pk${fresh?' md-in':''}${si===MD.you?' md-me':''}"><span class="md-pk-n">${mdPickLabel(k)}</span>${mdJy(o,'md-jy-sm')}<span class="md-pk-m"><b>${esc(o.n)}</b><small>${mdPosChip(o.pos)}${mdTm(o.t)} ${si===MD.you?'You':esc(s.name)}${p[1]==='auto'||p[1]==='queue'?' · auto':''}</small></span>
    ${r.mode!=='solo'?`<span class="md-re">${re?Object.keys(re).map(e=>`<i>${e}<small>${re[e]}</small></i>`).join(''):''}<button type="button" class="md-re-b" data-md="react-open" data-k="${k}" aria-label="React">+</button></span>`:''}</li>`}
function mdPaintSide(){
  const el=document.getElementById('md-side');if(!el)return;const r=MD.room,tab=mdPhone()?(MD.ui.ptab==='players'||MD.ui.ptab==='board'?null:MD.ui.ptab):MD.ui.tab;
  const qn=document.getElementById('md-qn');if(qn){const taken=mdTaken(),n=MD.queue.filter(id=>!taken.has(id)).length;qn.textContent=n||'';qn.hidden=!n}
  if(!tab){el.innerHTML='';return}
  if(tab==='queue'){const taken=mdTaken(),Q=MD.queue.filter(id=>MD.by[id]&&!taken.has(id));
    const favQ=[...mdFavs()].filter(id=>MD.by[id]&&!taken.has(id)&&!MD.queue.includes(id)),favB=favQ.length?`<button class="btn small md-qfav" type="button" data-md="q-favs">★ Add my ${favQ.length} favorite${favQ.length===1?'':'s'}</button>`:'';
    el.innerHTML=Q.length?`<p class="md-side-note">The top of your queue is taken if your clock runs out.</p>${favB}<ol class="md-queue md-sortable">${Q.map((id,i)=>{const o=MD.by[id];return `<li data-id="${esc(id)}"><span class="md-grip" data-md-grip aria-hidden="true">${MD_IC.grip}</span><span class="md-pk-m" data-md="sheet" data-id="${esc(id)}"><b>${esc(o.n)}</b><small>${mdPosChip(o.pos)}${mdTm(o.t)} ADP ${o.adp}</small></span>${i===0?'<em class="md-nextup">Next</em>':''}<button type="button" class="md-x" data-md="q" data-id="${esc(id)}" aria-label="Remove ${esc(o.n)}">${MD_IC.x}</button></li>`}).join('')}</ol>`
      :`<div class="md-side-empty">${MD_IC.plus}<b>Your queue is empty</b><p>Tap + next to a player to line him up. If your clock runs out, the top of your queue is picked for you.</p>${favB}</div>`;
    mdSortable(el.querySelector('.md-queue'),order=>{const taken2=mdTaken();MD.queue=order.concat(MD.queue.filter(id=>taken2.has(id)));mdQueueSave();mdPaintSide()});return}
  if(tab==='team'){const seat=MD.ui.team==null?MD.you:MD.ui.team;
    el.innerHTML=`<select class="md-teamsel" data-md-change="team" aria-label="Team">${r.seats.map((s,i)=>`<option value="${i}"${i===seat?' selected':''}>${i===MD.you?'My team':esc(s.name)}</option>`).join('')}</select>${mdRosterHtml(seat)}`;return}
  if(tab==='picks'){const n=MD.shown;el.innerHTML=n?`<ol class="md-picks">${Array.from({length:Math.min(n,60)},(_,i)=>mdPickRow(n-1-i,MD.fresh>=0&&n-1-i>=MD.fresh&&!mdCalm())).join('')}</ol>`:'<div class="md-side-empty"><b>No picks yet</b><p>Picks show up here as they happen, newest first.</p></div>';return}
  if(tab==='chat'){const had=el.querySelector('#md-chat-in'),val=had?had.value:'',foc=had&&document.activeElement===had;
    el.innerHTML=`<div class="md-chat"><ol class="md-chat-l" id="md-chat-l">${(r.chat||[]).map(m=>`<li class="${m.s===MD.you?'md-me':''}">${mdAv(r.seats[m.s],'md-av-xs')}<span><small>${esc(mdSeatName(m.s))}</small>${esc(m.t)}</span></li>`).join('')||'<li class="md-chat-0">Say hi to the room.</li>'}</ol>
      <form class="md-chat-f" data-md-form="chat"><input type="text" id="md-chat-in" maxlength="200" placeholder="Message the room" autocomplete="off" aria-label="Message"><button class="btn small accent" type="submit">Send</button></form></div>`;
    const inp=el.querySelector('#md-chat-in');inp.value=val;if(foc)inp.focus();const l=el.querySelector('#md-chat-l');l.scrollTop=l.scrollHeight}
}
/* the board: one column per team, one row per round, snake order */
function mdBoardHtml(n,opts){
  opts=opts||{};const r=MD.room,N=r.settings.teams,RN=r.rounds,cur=opts.done?-1:n,mineOnly=opts.mine;
  if(mineOnly){const ids=[];for(let k=0;k<n;k++)if(mdSeatAt(k,N)===MD.you)ids.push(k);
    return `<ol class="md-mypicks">${ids.map(k=>{const o=MD.by[MD.picks[k][0]];return o?`<li class="md-cell md-p-${o.pos}"><small>${mdPickLabel(k)}</small><b>${esc(o.n)}</b><span>${o.pos==='DST'?'DEF':o.pos} · ${esc(o.t||'')}</span></li>`:''}).join('')||'<li class="note">Your picks show up here.</li>'}</ol>`}
  let h=`<div class="md-board" style="--n:${N}"><div class="md-bh md-bcorner"></div>${r.seats.map((s,i)=>`<div class="md-bh${i===MD.you?' md-me':''}">${mdAv(s,'md-av-sm')}<b>${i===MD.you?'You':esc(s.name)}</b></div>`).join('')}`;
  for(let rd=0;rd<RN;rd++){h+=`<div class="md-br"><b>${rd+1}</b><i>${rd%2?'←':'→'}</i></div>`;
    for(let c=0;c<N;c++){const k=rd*N+(rd%2?N-1-c:c),p=k<n?MD.picks[k]:null,o=p&&MD.by[p[0]];
      h+=o?`<div class="md-cell md-p-${o.pos}${c===MD.you?' md-mycol':''}${k===MD.fresh&&k===n-1&&!opts.done?' md-pop':''}" data-md="sheet" data-id="${esc(o.id)}"><small>${mdPickLabel(k)}</small><b>${esc(mdShort(o.n))}</b><span>${o.pos==='DST'?'DEF':o.pos} · ${esc(o.t||'')}</span></div>`
        :`<div class="md-cell md-cell-e${k===cur?' md-cur':''}${c===MD.you?' md-mycol':''}"><small>${mdPickLabel(k)}</small></div>`}}
  return h+'</div>';
}
function mdPaintBoard(){
  const ov=document.getElementById('md-overlay'),pb=document.getElementById('md-pboard');if(!ov)return;
  const phone=mdPhone(),show=phone?MD.ui.ptab==='board':MD.ui.board,tgt=phone?pb:ov;ov.hidden=phone||!MD.ui.board;
  if(!show){if(!phone)ov.innerHTML='';return}
  const sc=tgt.querySelector('.md-board-w'),sx=sc?sc.scrollLeft:0,sy=sc?sc.scrollTop:0;
  tgt.innerHTML=`<div class="md-board-top"><h2>Draft board</h2><div class="md-board-top-r">${phone?`<div class="seg md-seg"><button type="button" data-md="bmine" data-v="0" aria-pressed="${!MD.ui.mine}">Full board</button><button type="button" data-md="bmine" data-v="1" aria-pressed="${!!MD.ui.mine}">My picks</button></div>`:`<button class="btn small" type="button" data-md="board">Back to players</button>`}</div></div><div class="md-board-w">${mdBoardHtml(MD.shown,{mine:phone&&MD.ui.mine})}</div>`;
  const s2=tgt.querySelector('.md-board-w');if(sc){s2.scrollLeft=sx;s2.scrollTop=sy}else{const c=s2.querySelector('.md-cur');if(c&&c.scrollIntoView)c.scrollIntoView({block:'nearest',inline:'nearest'})}
}
/* the player card: a centered card on desktop, a sheet from the bottom on a phone */
function mdSheet(id){
  const o=MD.by[id];if(!o)return;MD.ui.sheet=id;const fav=mdFavs().has(id),gone=mdTaken().has(id),turn=mdMyTurn()&&!gone&&MD.page==='room'&&mdLegal(mdSeatIds(MD.you),o.pos),q=MD.queue.includes(id),take=typeof TMO!=='undefined'&&TMO.takes&&TMO.takes[id]&&TMO.takes[id].st==='ok'?TMO.takes[id]:null,k=MD.shown;
  const f=(l,v)=>`<div><dt>${l}</dt><dd>${v}</dd></div>`;
  mdDlg('player',`<div class="md-sheet-h"><div class="md-ps-h">${mdJy(o,'md-jy-xl')}<div><h2>${esc(o.n)}</h2><small>${mdPosChip(o.pos)}${mdTm(o.t)} ${esc(TMO_TEAM(o.t))}${o.age?' · Age '+o.age:''}${o.bye?' · Bye '+o.bye:''}</small></div></div><button class="md-favb${fav?' md-on':''}" type="button" data-md="fav" data-id="${esc(id)}" aria-pressed="${fav}">${fav?'★ Favorite':'☆ Favorite'}</button><button class="md-x" type="button" data-md="close" aria-label="Close">${MD_IC.x}</button></div>
  <div class="md-sheet-b"><dl class="md-ps-g">${f('ADP',o.adp)}${f('TM rank',o.tm?mdTmCell(o):'—')}${f('Pts/G',o.ppg?o.ppg.toFixed(1):'—')}${o.score!=null?f('TM Score',o.score.toFixed(1)):''}</dl>
    ${!gone&&MD.page==='room'&&mdValueTag(o,k)?`<p class="md-ps-tag md-val-t">Value: he usually goes around pick ${o.adp}.</p>`:''}${!gone&&MD.page==='room'&&mdIsReach(o,k)?`<p class="md-ps-tag md-reach-t">Reach: he usually goes around pick ${o.adp}.</p>`:''}
    ${take?`<div class="md-ps-take"><h4>TradeMetric take</h4><p>${esc(take.take)}</p></div>`:''}</div>
  ${MD.page==='room'?`<div class="md-sheet-f md-two">${gone?'<span class="md-took">Already drafted</span>':`<button class="btn md-big" type="button" data-md="q" data-id="${esc(id)}">${q?'Remove from queue':'Add to queue'}</button><button class="btn accent md-big" type="button" data-md="draft" data-id="${esc(id)}" data-sure="1"${turn?'':' disabled'}>Draft</button>`}</div>`:''}`);
}
function TMO_TEAM(t){try{return typeof teamName==='function'&&t?teamName(t):t||'Free agent'}catch(e){return t||'Free agent'}}

/* ---------- room actions ---------- */
var MD_Q_T=null;
function mdQueueSave(){clearTimeout(MD_Q_T);const id=MD.room.id;MD_Q_T=setTimeout(async()=>{const q=MD.queue.slice();if(MD.carry&&MD.room&&MD.room.id===id){MD.carry.queue=q;mdSaveCarry();return}const j=await mdApi('queue',{room:id,ids:q});if(j.ok&&j.carry!==undefined){MD.carry=j.carry;mdSaveCarry()}},500)}
function mdQueueToggle(id){const i=MD.queue.indexOf(id);if(i>=0)MD.queue.splice(i,1);else MD.queue.push(id);mdQueueSave();mdPaintPool();mdPaintSide();if(MD.ui.sheet===id)mdSheet(id)}
function mdDraft(id,sure){
  const o=MD.by[id];if(!o||!mdMyTurn())return;
  if(!sure&&mdIsReach(o,MD.shown)&&MD.ui.confirm!==id){MD.ui.confirm=id;mdPaintPool();clearTimeout(MD.confT);MD.confT=setTimeout(()=>{if(MD.ui.confirm===id){MD.ui.confirm=null;mdPaintPool()}},4000);return}
  MD.ui.confirm=null;mdDlgClose();
  return mdBusy(async()=>{const j=await mdApi('pick',{room:MD.room.id,player:id});
    if(j.ok){const i=MD.queue.indexOf(id);if(i>=0)MD.queue.splice(i,1);mdApply(j,{quiet:j.room.status!=='done'||(j.made||[]).length>0});mdPing()}
    else{mdFail(j);if(j.code==='taken'||j.code==='turn'||j.code==='paused')mdSync()}})
}
function mdPause(){const r=MD.room;if(!r)return;const paused=r.status==='paused'||MD.paused;
  return mdBusy(async()=>{if(mdSolo()){MD.paused=!paused;if(MD.paused)clearTimeout(MD.revT)}
    const j=await mdApi(paused?'resume':'pause',{room:r.id});if(j.ok){mdApply(j,{quiet:true,instant:true});mdPing()}else if(!mdSolo())mdFail(j);
    if(mdSolo()){mdPaint();if(!MD.paused)mdReveal()}})}
function mdUndo(){return mdBusy(async()=>{clearTimeout(MD.revT);const j=await mdApi('undo',{room:MD.room.id});if(j.ok){MD.paused=false;mdApply(j,{instant:true})}else mdFail(j)})}

/* ---------- results ---------- */
function mdResultsRender(el){
  const r=MD.room,res=r.results||[],seat=MD.ui.res==null?(MD.you>=0?MD.you:0):MD.ui.res,g=res[seat],n=r.settings.teams,mine=seat===MD.you;
  if(!g){el.innerHTML=`<div class="md-results"><p class="note">This draft has no grade yet.</p><button class="btn" type="button" data-md="home">Back to Draft Tools</button></div>`;return}
  const nm=id=>MD.by[id]?MD.by[id].n:'—',first=!MD.ui.revealed||MD.ui.revealed!==r.id;MD.ui.revealed=r.id;
  const picks=[];for(let k=0;k<MD.picks.length;k++)if(mdSeatAt(k,n)===seat)picks.push(k);
  const bar=(k,l)=>{const p=g.pos[k];return p?`<li><span>${l}</span><span class="md-bar"><i style="--w:${Math.max(6,p.bar)}%"></i></span><b class="md-g md-g-${p.grade[0]}">${p.grade}</b><small>${mdOrd(p.rank)}</small></li>`:''};
  const s=r.seats[seat];
  el.innerHTML=`<div class="md-results${first&&!mdCalm()?' md-reveal':''}">
    <div class="md-res-top"><div><div class="kicker">Draft complete · ${n} teams · ${MD_SC[r.settings.scoring]}</div><h1>${mine?'Your draft grade':esc(s.name)}</h1></div>
      <div class="md-res-act"><select data-md-change="res" aria-label="Team">${r.seats.map((x,i)=>`<option value="${i}"${i===seat?' selected':''}>${i===MD.you?'My team':esc(x.name)}${res[i]?' · '+res[i].grade:''}</option>`).join('')}</select>
        <button class="btn accent" type="button" data-md="again">Draft again</button><button class="btn" type="button" data-md="share-card">Share</button><button class="btn ghost" type="button" data-md="home">Back to Draft Tools</button></div></div>
    <div class="md-bento">
      <section class="md-tile md-grade" id="md-grade"><span class="md-grade-l md-g-${g.grade[0]}">${esc(g.grade)}</span><div class="md-grade-m"><b><span data-md-num="${g.rank}">${g.rank}</span>${mdOrd(g.rank).replace(/\d+/,'')} of ${n}</b><span>${mine?'Your team':esc(s.name)} ranks ${mdOrd(g.rank)} in this draft room.</span>${s.strat?`<span class="md-strat">Drafted like: ${esc(s.strat)}</span>`:''}</div></section>
      <section class="md-tile"><h3>Best value</h3>${g.best?`<b class="md-tile-b">${esc(nm(g.best.id))}</b><p>Picked ${mdOrd(g.best.pick)} overall, <span class="md-up-t">${g.best.d} later</span> than his ADP of ${g.best.adp}.</p>`:'<p class="note">No pick fell past his ADP.</p>'}</section>
      <section class="md-tile"><h3>Biggest reach</h3>${g.reach?`<b class="md-tile-b">${esc(nm(g.reach.id))}</b><p>Picked ${mdOrd(g.reach.pick)} overall, <span class="md-dn-t">${-g.reach.d} earlier</span> than his ADP of ${g.reach.adp}.</p>`:'<p class="note">No reaches. Every pick was at or after ADP.</p>'}</section>
      <section class="md-tile md-posg"><h3>By position</h3><ul class="md-bars">${bar('QB','QB')}${bar('RB','RB')}${bar('WR','WR')}${bar('TE','TE')}${bar('BN','Bench')}</ul></section>
      <section class="md-tile md-lineup"><h3>Projected starting lineup</h3><p class="md-lu-pts"><b><span data-md-num="${g.pts}" data-md-dec="1">${g.pts.toFixed(1)}</span></b> points a week · ${mdOrd(g.ptsRank)} of ${n}</p>
        <ul class="md-roster">${g.start.map(x=>{const o=x.id&&MD.by[x.id];return `<li class="${o?'':'md-emp'}"><span class="md-slot">${x.slot==='DST'?'DEF':x.slot==='SF'?'SFLX':x.slot}</span>${o?`${mdPosChip(o.pos)}<b>${esc(o.n)}</b><small>${o.ppg?o.ppg.toFixed(1):''}</small>`:'<b class="md-dim">Empty</b>'}</li>`}).join('')}</ul></section>
      <section class="md-tile md-rounds"><h3>Round by round</h3><ol class="md-rbr">${picks.map(k=>{const o=MD.by[MD.picks[k][0]];if(!o)return '';const d=(k+1)-o.adp,kd=o.pos==='K'||o.pos==='DST';return `<li><span class="md-pk-n">${mdPickLabel(k)}</span>${mdPosChip(o.pos)}<b>${esc(o.n)}</b><small>ADP ${o.adp}</small><span class="md-d ${kd||!d?'':d>0?'md-up-t':'md-dn-t'}">${kd||!d?'—':(d>0?'+':'−')+Math.abs(d)}</span></li>`}).join('')}</ol></section>
    </div>
    <section class="md-res-board"><div class="md-board-top"><h2>Draft board</h2></div><div class="md-board-w">${mdBoardHtml(MD.picks.length,{done:true})}</div></section>
  </div>`;
  mdNumbers(el);
  if(first&&mine&&/^A/.test(g.grade)&&!mdCalm()&&typeof window.tmConfetti==='function'){const b=document.getElementById('md-grade').getBoundingClientRect();setTimeout(()=>window.tmConfetti(b.left+70,b.top+60),700)}
  if(mine&&!(MD.home&&MD.home.rooms)){const H=(mdAcct('mdHist',[])||[]).filter(h=>h.id!==r.id);H.unshift({id:r.id,at:Date.now(),mode:r.mode,teams:n,scoring:r.settings.scoring,team:s.name,grade:g.grade,rank:g.rank});if(JSON.stringify(H.slice(0,20))!==JSON.stringify(mdAcct('mdHist',[])))mdAcctSet('mdHist',H.slice(0,20))}
  if(mdSolo()&&mdAcct('mdSolo',null))mdAcctSet('mdSolo',null);
}
/* number ticker: counts up to the value once */
function mdNumbers(root){if(mdCalm())return;root.querySelectorAll('[data-md-num]').forEach(e=>{const to=+e.dataset.mdNum,dec=+e.dataset.mdDec||0,t0=performance.now(),dur=900;
  const step=t=>{const p=Math.min(1,(t-t0)/dur),v=to*(1-Math.pow(1-p,3));e.textContent=dec?v.toFixed(dec):String(Math.max(1,Math.round(v)));if(p<1&&e.isConnected)requestAnimationFrame(step);else e.textContent=dec?to.toFixed(dec):String(to)};requestAnimationFrame(step)})}
/* the share image: the grade card with the roster and the TradeMetric wordmark, drawn on a canvas */
function mdShareCard(){
  const r=MD.room,seat=MD.ui.res==null?MD.you:MD.ui.res,g=r.results[seat],s=r.seats[seat],W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const col={A:'#3CD88A',B:'#5BA4FF',C:'#F5BA42',D:'#FF6B6E',F:'#FF6B6E'}[g.grade[0]]||'#fff',POSC={QB:'#8A4FD8',RB:'#0E9E6E',WR:'#2F74E0',TE:'#D9731A',K:'#6B7280',DST:'#4B5563'};
  x.fillStyle='#0B0C0E';x.fillRect(0,0,W,H);const gr=x.createRadialGradient(W*.85,0,0,W*.85,0,700);gr.addColorStop(0,'rgba(255,79,18,.38)');gr.addColorStop(1,'rgba(255,79,18,0)');x.fillStyle=gr;x.fillRect(0,0,W,H);
  x.fillStyle='#FF4F12';x.font='italic 800 30px Kanit, Arial';x.fillText('MOCK DRAFT GRADE',72,110);
  x.fillStyle='#fff';x.font='italic 800 64px Kanit, Arial';x.fillText(String(s.name).toUpperCase().slice(0,22),72,186);
  x.fillStyle='#949AA3';x.font='500 28px Inter, Arial';x.fillText(`${r.settings.teams} teams · ${MD_SC[r.settings.scoring]} · ${r.rounds} rounds`,72,236);
  x.fillStyle=col;x.font='italic 800 300px Kanit, Arial';x.fillText(g.grade,64,520);
  x.fillStyle='#fff';x.font='italic 700 54px Kanit, Arial';x.fillText(`${mdOrd(g.rank)} of ${r.settings.teams}`.toUpperCase(),560,400);
  x.fillStyle='#B7BCC4';x.font='500 30px Inter, Arial';x.fillText(`${g.pts.toFixed(1)} projected points a week`,560,452);
  let y=640;x.fillStyle='#949AA3';x.font='700 24px Inter, Arial';x.fillText('STARTING LINEUP',72,y-30);
  g.start.filter(z=>z.id&&MD.by[z.id]).slice(0,10).forEach(z=>{const o=MD.by[z.id];x.fillStyle='rgba(255,255,255,.06)';x.fillRect(72,y,W-144,52);x.fillStyle=POSC[o.pos]||'#666';x.fillRect(72,y,10,52);
    x.fillStyle='#949AA3';x.font='700 22px Inter, Arial';x.fillText(z.slot==='DST'?'DEF':z.slot==='SF'?'SFLX':z.slot,104,y+34);x.fillStyle='#fff';x.font='600 28px Inter, Arial';x.fillText(o.n,200,y+36);
    x.fillStyle='#949AA3';x.font='500 24px Inter, Arial';x.textAlign='right';x.fillText(o.t||'',W-96,y+35);x.textAlign='left';y+=60});
  x.fillStyle='#fff';x.font='italic 800 44px Kanit, Arial';x.fillText('TRADE',72,H-70);const w=x.measureText('TRADE').width;x.fillStyle='#FF4F12';x.fillText('METRIC',72+w,H-70);
  x.fillStyle='#949AA3';x.font='500 24px Inter, Arial';x.textAlign='right';x.fillText('trademetric.app',W-72,H-74);
  c.toBlob(async b=>{if(!b)return;const file=new File([b],'trademetric-mock-draft.png',{type:'image/png'});
    try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'My mock draft grade'});return}}catch(e){if(e&&e.name==='AbortError')return}
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);mdToast('Saved the grade card image','good')},'image/png');
}

/* ---------- signed out: a short looping preview of the board ---------- */
function mdPreview(el){
  if(!el||el.querySelector('.md-preview'))return;const R=(typeof tmoRows==='function'?tmoRows():[]).slice().sort((a,b)=>a.mRank-b.mRank).slice(0,24);if(R.length<24)return;
  const box=document.createElement('div');box.className='md-preview';box.setAttribute('aria-hidden','true');el.querySelector('.tmo-pp-main').appendChild(box);
  const N=6,cell=k=>{const r=Math.floor(k/N),c=k%N;return r*N+(r%2?N-1-c:c)};let n=mdCalm()?24:0;
  const paint=()=>{box.innerHTML=`<div class="md-board md-board-mini" style="--n:${N}">${Array.from({length:24},(_,i)=>{const rd=Math.floor(i/N),c=i%N,k=rd*N+(rd%2?N-1-c:c),o=k<n?R[k]:null;return o?`<div class="md-cell md-p-${o.pos}${k===n-1?' md-pop':''}"><small>${rd+1}.${String(k%N+1).padStart(2,'0')}</small><b>${esc(mdShort(o.n))}</b><span>${o.pos} · ${esc(o.t||'')}</span></div>`:`<div class="md-cell md-cell-e${k===n?' md-cur':''}"></div>`}).join('')}</div>`};
  paint();if(mdCalm())return;clearInterval(MD.prevT);MD.prevT=setInterval(()=>{if(!box.isConnected||!mdOn()){clearInterval(MD.prevT);return}n=n>=27?0:n+1;paint()},650);
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const sc=e.target.closest('.md-scrim');if(sc&&e.target===sc){mdDlgClose();return}
  const b=e.target.closest('[data-md]');if(!b)return;const a=b.dataset.md,id=b.dataset.id,u=MD.ui;
  if(b.disabled)return;
  switch(a){
    case 'solo':if(!MD.ui.set||MD.ui.setMode!=='solo')mdSetInit('solo');mdStartSolo();break;
    case 'set-solo':mdSetInit('solo');mdDlg('settings',mdSetHtml());break;
    case 'set-friends':mdSetInit('friends');mdDlg('settings',mdSetHtml());break;
    case 'set-lobby':u.set=JSON.parse(JSON.stringify(MD.room.settings));u.setMode='lobby';mdDlg('settings',mdSetHtml());break;
    case 'save-set':{const set=u.set;mdDlgClose();mdLobbyAct('settings',{settings:set});break}
    case 'create-friends':mdCreateFriends();break;
    case 'set':{const k=b.dataset.k,v=b.dataset.v;u.set[k]=k==='scoring'||k==='speed'?v:+v;if(k==='teams'){u.tOther=false;if(u.set.slot>u.set.teams)u.set.slot=0}mdDlgPaint(mdSetHtml());break}
    case 'teams-other':u.tOther=true;if([8,10,12,14].includes(u.set.teams))u.set.teams=16;u.tAnim='up';mdDlgPaint(mdSetHtml());u.tAnim=null;break;
    case 'tstep':{const d=+b.dataset.d;u.set.teams=Math.min(20,Math.max(4,u.set.teams+d));if(u.set.slot>u.set.teams)u.set.slot=0;u.tOther=true;u.tAnim=d>0?'up':'dn';mdDlgPaint(mdSetHtml());u.tAnim=null;break}
    case 'fav':{const o=MD.by[id];if(o){mdFavToggle(id,o.n);mdSheet(id);mdPaintPool();mdPaintSide()}break}
    case 'q-favs':{const tk=mdTaken();[...mdFavs()].forEach(x=>{if(MD.by[x]&&!tk.has(x)&&!MD.queue.includes(x))MD.queue.push(x)});mdQueueSave();mdPaintPool();mdPaintSide();break}
    case 'step':{const k=b.dataset.k;u.set.roster[k]=Math.min(MD_SLOT_MAX[k],Math.max(0,u.set.roster[k]+(+b.dataset.d)));mdDlgPaint(mdSetHtml());break}
    case 'uselg':{const lg=mdLeagueSet();if(lg){u.set.teams=lg.teams;u.set.scoring=lg.scoring;u.set.roster=lg.roster;if(u.set.slot>lg.teams)u.set.slot=0;mdDlgPaint(mdSetHtml());mdToast('Filled in from '+lg.name,'good')}break}
    case 'close':mdDlgClose();break;
    case 'quick':mdJoinRoom(null,true);break;
    case 'lobby':mdJoinRoom(id);break;
    case 'resume':mdResume();break;
    case 'discard':mdConfirm('Discard this draft?','The draft in progress is thrown away. This can’t be undone.','Discard','discard-yes');break;
    case 'discard-yes':mdDiscard();break;
    case 'past':mdBusy(async()=>{const j=await mdApi('result',{room:id});if(j.ok)mdApply(j,{instant:true});else mdFail(j)});break;
    case 'ask-leave':mdAskLeave();break;
    case 'leave-yes':mdLeave();break;
    case 'home':mdDlgClose();mdDisconnect();MD.room=null;MD.picks=[];MD.page='home';MD.home=null;try{if(location.hash.startsWith('#draft/'))history.replaceState(null,'','#drafttools')}catch(x){}mdRender();window.scrollTo(0,0);break;
    case 'again':{const set=Object.assign({},MD.room.settings),mode=MD.room.mode;MD.ui.set=set;MD.ui.setMode='solo';MD.room=null;MD.picks=[];MD.page='home';if(mode==='solo')mdStartSolo();else{MD.home=null;mdRender()}break}
    case 'share-card':mdShareCard();break;
    case 'copy':(navigator.clipboard?navigator.clipboard.writeText(b.dataset.v):Promise.reject()).then(()=>mdToast('Invite link copied','good')).catch(()=>mdToast('Select the link and copy it.','bad'));break;
    case 'share-link':try{navigator.share({title:'Join my TradeMetric mock draft',url:b.dataset.v}).catch(()=>{})}catch(x){}break;
    case 'start':mdLobbyAct('start',{});break;
    case 'randomize':mdLobbyAct('order',{random:true});break;
    case 'cpu':mdLobbyAct('cpu',{seat:+b.dataset.i});break;
    case 'kick':mdLobbyAct('kick',{seat:+b.dataset.i});break;
    case 'rename':{const cur=mdSeatName(MD.you);mdDlg('confirm',`<div class="md-sheet-h"><h2>Team name</h2></div><form data-md-form="rename"><div class="md-sheet-b"><input class="md-input" type="text" name="name" maxlength="24" value="${esc(cur)}" aria-label="Team name" autocomplete="off"></div><div class="md-sheet-f md-two"><button class="btn md-big" type="button" data-md="close">Cancel</button><button class="btn accent md-big" type="submit">Save</button></div></form>`);const i=document.querySelector('#md-dlg input');if(i){i.focus();i.select()}break}
    case 'pos':u.pos=b.dataset.v;u.limit=80;u.confirm=null;document.querySelectorAll('.md-posseg button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));mdPaintPool();document.getElementById('md-list').scrollTop=0;break;
    case 'sort':u.sort=b.dataset.v;u.limit=80;b.parentNode.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));mdPaintPool();document.getElementById('md-list').scrollTop=0;break;
    case 'more':u.limit+=80;mdPaintPool();break;
    case 'tab':u.tab=b.dataset.v;b.parentNode.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));mdPaintSide();break;
    case 'ptab':u.ptab=b.dataset.v;document.querySelector('.md-room').dataset.ptab=u.ptab;b.parentNode.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));mdPaintSide();mdPaintBoard();break;
    case 'board':u.board=!u.board;mdPaintBoard();break;
    case 'bmine':u.mine=b.dataset.v==='1';mdPaintBoard();break;
    case 'sound':{const on=!mdAcct('mdSound',false);mdAcctSet('mdSound',on);if(typeof acctSet!=='function'||typeof S==='undefined'||!S)MD.snd=on;mdPaintTop();if(on)mdBeep();break}
    case 'sim':mdFlush();break;
    case 'pause':mdPause();break;
    case 'undo':mdUndo();break;
    case 'spot':mdSpotPick(+b.dataset.v);break;
    case 'spot-go':{MD.ui.spot=false;const x=document.getElementById('md-spot');if(x)x.remove();break}
    case 'seat':mdLobbyAct('seat',{seat:+b.dataset.i});break;
    case 'back':mdBusy(async()=>{const j=await mdApi('back',{room:MD.room.id});if(j.ok){mdApply(j,{quiet:true});mdPing()}else mdFail(j)});break;
    case 'q':e.stopPropagation();mdQueueToggle(id);break;
    case 'draft':e.stopPropagation();mdDraft(id,b.dataset.sure==='1');break;
    case 'sheet':if(!e.target.closest('button:not([data-md="sheet"])'))mdSheet(id);break;
    case 'react-open':{const old=document.querySelector('.md-re-pop');if(old)old.remove();const p=document.createElement('span');p.className='md-re-pop';p.innerHTML=MD_EMOJI.map(m=>`<button type="button" data-md="react" data-k="${b.dataset.k}" data-v="${m}">${m}</button>`).join('');b.parentNode.appendChild(p);break}
    case 'react':{const k=+b.dataset.k;const pop=b.closest('.md-re-pop');if(pop)pop.remove();mdApi('react',{room:MD.room.id,pick:k,emoji:b.dataset.v}).then(j=>{if(j.ok){MD.room.reacts=j.reacts;mdPaintSide();mdPing()}else mdFail(j)});break}
  }
});
document.addEventListener('submit',e=>{const f=e.target.closest('[data-md-form]');if(!f)return;e.preventDefault();const k=f.dataset.mdForm;
  if(k==='code')mdJoinCode(f.code.value);
  if(k==='rename'){const name=f.name.value;mdDlgClose();mdLobbyAct('rename',{name})}
  if(k==='chat'){const inp=f.querySelector('input'),text=inp.value.trim();if(!text)return;inp.value='';mdApi('chat',{room:MD.room.id,text}).then(j=>{if(j.ok){MD.room.chat=j.chat;mdPaintSide();mdPing()}else mdFail(j)})}});
document.addEventListener('input',e=>{const t=e.target;if(t.id==='md-q'){MD.ui.q=t.value;MD.ui.limit=80;mdPaintPool()}
  if(t.id==='md-clock-r'){const V=t.dataset.mdVals.split(',').map(Number),v=V[+t.value];MD.ui.set.clock=v;t.style.setProperty('--p',(100*t.value/(V.length-1))+'%');const l=v?v+' seconds':'No limit';t.setAttribute('aria-valuetext',l);const o=document.getElementById('md-clock-v');if(o)o.textContent=l}});
/* the favorite star on the Rankings page */
document.addEventListener('click',e=>{const b=e.target.closest('[data-md-fav]');if(!b)return;e.preventDefault();e.stopPropagation();mdFavToggle(b.dataset.mdFav,b.dataset.n||'He');if(typeof renderTmRank==='function'&&document.body.dataset.tab==='tmrank')renderTmRank()},true);
document.addEventListener('change',e=>{const t=e.target;if(t.id==='md-hide'){MD.ui.hide=t.checked;mdPaintPool();return}
  const k=t.dataset&&t.dataset.mdChange;if(!k)return;
  if(k==='slot')MD.ui.set.slot=+t.value;if(k==='team'){MD.ui.team=+t.value;mdPaintSide()}if(k==='res'){MD.ui.res=+t.value;mdRender()}});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(MD.ui.dlg)mdDlgClose();else if(MD.ui.board&&MD.page==='room'){MD.ui.board=false;mdPaintBoard()}return}
  if(MD.page!=='room'||!mdOn()||MD.ui.dlg)return;const tg=e.target;
  if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(tg.tagName)){const q=document.getElementById('md-q');if(q){e.preventDefault();q.focus();q.select()}}
  if(e.key==='Enter'&&tg.classList&&tg.classList.contains('md-row'))mdSheet(tg.dataset.id)});
document.addEventListener('pointermove',e=>{const c=e.target.closest&&e.target.closest('[data-md-spot]');if(!c)return;const r=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-r.left)+'px');c.style.setProperty('--my',(e.clientY-r.top)+'px')});
addEventListener('beforeunload',e=>{const r=MD.room;if(r&&r.mode!=='solo'&&(r.status==='live'||r.status==='paused')&&MD.page==='room'){e.preventDefault();e.returnValue=''}});
addEventListener('hashchange',()=>setTimeout(()=>{if(!mdOn()){mdTitle(false);document.body.classList.remove('md-in-room')}},0));
