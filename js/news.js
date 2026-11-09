/* ===== News tab, big-play banners and per-league notifications =====
   Loaded before app.js. Nothing here runs until app.js calls tmnTick() after each live update,
   tmnRender() for the News tab, or tmnNotifHtml() inside Account → Leagues.

   The feed is GLOBAL: every saved league at once. Banners can be switched off per league.
   Trigger rules (the owner's list, 2026-11-09):
     Rush 30+ yds (50+ is a breakaway) · Catch 40+ yds
     1st TD only if 20+ yds or worth 12+ pts · 2nd and later TDs always
     Big game: 28+ pts, or 2.2x his projection (and at least 12 pts)
     Clincher: win chance 99%+ and nothing left on their side can catch you · once per matchup
     Crunch swing: you were behind or tied, it's late, your player's play puts you ahead
     Heads up: an opponent's starter is ruled out during his game
   Not built yet (no live data for them): 25+ yd catch with 20+ yards after the catch, bench player at 70%+ snaps. */

const TMN_R={rush:30,rushBig:50,rec:40,td1Yds:20,td1Pts:12,game:28,gameX:2.2,gameMin:12,late:30,clinch:.99,gap:90e3,hold:8e3,clinchHold:20e3,chipLife:5*60e3,stale:3*60e3};
const TMN_LS='tm-news-v1';
let TMN={week:null,items:[],fired:new Set(),prev:{},prevSt:null,prevStat:{},first:true,plays:null,ok:null,playsAt:0,queue:[],showing:null,lastShow:0,chips:[],unread:0,f:'all',lg:'all',last:null,focus:null,timer:null};

/* ---------- storage: this week's events survive a reload ---------- */
function tmnLoad(){try{const d=JSON.parse(localStorage.getItem(TMN_LS)||'null');if(!d)return;
  if(d.week===WEEK){TMN.items=d.items||[];TMN.fired=new Set(d.fired||[])}else if(d.week===WEEK-1&&d.items&&d.items.length)TMN.last={week:d.week,items:d.items};
  if(d.last&&d.last.week===WEEK-1&&!TMN.last)TMN.last=d.last}catch(e){}TMN.week=WEEK}
function tmnSave(){try{localStorage.setItem(TMN_LS,JSON.stringify({week:TMN.week,items:TMN.items.slice(0,120),fired:[...TMN.fired].slice(-600),last:TMN.last}))}catch(e){}}
function tmnWeek(){if(TMN.week===null)tmnLoad();if(TMN.week===WEEK)return;
  if(TMN.items.length)TMN.last={week:TMN.week,items:TMN.items.slice(0,60)};TMN.items=[];TMN.fired=new Set();TMN.prev={};TMN.prevOpp={};TMN.prevSt=null;TMN.prevStat={};TMN.first=true;TMN.plays=null;TMN.week=WEEK;tmnSave()}

/* ---------- settings: banners per league (the feed always shows every league) ---------- */
function tmnNotif(){S.notif=S.notif||{off:[],opp:false};S.notif.off=S.notif.off||[];return S.notif}
const tmnOn=key=>!tmnNotif().off.includes(key);

/* ---------- leagues: rosters, lineups and this week's matchup for every saved league ---------- */
function tmnLeagues(){const out=[],L=S.leagues&&S.leagues.length?S.leagues:[{key:S.leagueKey,name:S.league&&S.league.name}];
  L.forEach(e=>{const cur=e.key===S.leagueKey,snap=cur?S:e.snap;if(!snap||!snap.teams||!snap.teams.length)return;const me=snap.teams.find(T=>T.id===snap.me);if(!me)return;
    const c={key:e.key,name:(cur&&S.league&&S.league.name)||e.name||'League',cur,sc:{...BASE_SC,...((snap.league&&snap.league.sc)||{})},roster:new Set(me.players),starters:new Set(),oppStarters:new Set(),opp:null,team:me.name};
    try{if(cur)tmnCurMatch(c);else tmnSnapMatch(c,snap)}catch(err){}
    out.push(c)});
  return out}
/* the league on screen: the exact numbers the My Team matchup card shows */
function tmnCurMatch(c){const me=myTeam();if(!me)return;const A=weekLine(me.players,WEEK,S.me);A.lu.slots.forEach(x=>x.p&&c.starters.add(x.p.id));
  const oid=oppOf(S.me,WEEK),O=oid&&teamById(oid);if(!O)return;const B=weekLine(O.players,WEEK,oid);B.lu.slots.forEach(x=>x.p&&c.oppStarters.add(x.p.id));
  const f=pickVal(WEEK),side=lu=>{const s={now:0,rem:0,ceil:0,live:0,done:0,n:0};lu.slots.forEach(x=>{if(!x.p)return;s.n++;const id=x.p.id,l=liveOf(id),v=f(id)||0;
      if(l){s.now+=l.pts;if(l.state==='post'){s.done++;return}s.live++;const r=Math.max(0,v-l.pts);s.rem+=r;s.ceil+=Math.max(3*r,8*l.rem)}else if(v>0){s.rem+=v;s.ceil+=Math.max(3*v,8)}});return s};
  const a=side(A.lu),b=side(B.lu),sd=Math.sqrt(A.sd**2+B.sd**2)||1;
  c.opp={id:oid,name:O.name,m:A.m,om:B.m,sd,wp:Phi((A.m-B.m)/sd),now:a.now,onow:b.now,rem:a.rem,orem:b.rem,oceil:b.ceil,started:a.live+a.done+b.live+b.done>0,live:a.live+b.live>0,final:a.n>0&&a.done===a.n&&b.done===b.n}}
/* other saved leagues: their own scoring, real lineups when the import has them, otherwise best projected lineup */
function tmnSnapMatch(c,snap){const sl=(snap.league&&snap.league.slots)||{},real=snap.real;
  const pairs=real&&real.sched&&real.sched[WEEK],pr=pairs&&pairs.find(p=>p.includes(snap.me)),oid=pr?(pr[0]===snap.me?pr[1]:pr[0]):null;
  const luOf=tid=>{const r=real&&real.lineups&&real.lineupWeek===WEEK&&real.lineups[tid];if(r&&r.length)return r.map(x=>x.id).filter(id=>id&&byId[id]);const T=snap.teams.find(t=>t.id===tid);return T?tmnGreedy(T.players,sl,c.sc):[]};
  luOf(snap.me).forEach(id=>c.starters.add(id));if(!oid)return;const O=snap.teams.find(t=>t.id===oid);if(!O)return;luOf(oid).forEach(id=>c.oppStarters.add(id));
  const a=tmnSide([...c.starters],c.sc),b=tmnSide([...c.oppStarters],c.sc),sd=Math.sqrt(a.v+b.v)||1;
  c.opp={id:oid,name:O.name,m:a.m,om:b.m,sd,wp:Phi((a.m-b.m)/sd),now:a.now,onow:b.now,rem:a.rem,orem:b.rem,oceil:b.ceil,started:a.live+a.done+b.live+b.done>0,live:a.live+b.live>0,final:a.n>0&&a.done===a.n&&b.done===b.n}}
function tmnExp(id,sc){const p=byId[id];if(!p)return null;const proj=BYE[p.t]===WEEK||isOut(id)?0:Math.max(0,projPts(p,sc)),gm=LIVE&&LIVE.week===WEEK&&LIVE.games&&LIVE.games[p.t];
  if(!gm||gm.state==='pre')return {now:0,m:proj,rem:proj,rf:1,pre:true,proj};
  const now=tmnPts(id,sc);if(gm.state==='post')return {now,m:now,rem:0,rf:0,post:true,proj};
  return {now,m:now+proj*gm.rem,rem:proj*gm.rem,rf:gm.rem,proj}}
function tmnSide(ids,sc){const s={m:0,v:0,now:0,rem:0,ceil:0,live:0,done:0,n:0};ids.forEach(id=>{const e=tmnExp(id,sc);if(!e)return;s.n++;s.m+=e.m;s.now+=e.now;s.rem+=e.rem;s.v+=((CV[byId[id].pos]||.5)*e.rem)**2;
  if(e.rem>0)s.ceil+=Math.max(3*e.rem,8*e.rf);if(e.post)s.done++;else if(!e.pre)s.live++});return s}
function tmnGreedy(ids,sl,sc){const ps=ids.map(id=>byId[id]).filter(Boolean).map(p=>({p,v:BYE[p.t]===WEEK||isOut(p.id)?0:projPts(p,sc)})).sort((a,b)=>b.v-a.v),used=new Set(),out=[];
  const fill=(el,n)=>{for(let i=0;i<n;i++){const c=ps.find(x=>el.includes(x.p.pos)&&!used.has(x.p.id));if(c){used.add(c.p.id);out.push(c.p.id)}}};
  OFF.forEach(x=>fill([x],sl[x]||0));fill(['RB','WR','TE'],sl.FLEX||0);fill(OFF,sl.SFLEX||0);fill(['K'],sl.K||0);fill(['DST'],sl.DST||0);return out}
/* points so far in a given league's scoring */
function tmnPts(id,sc){const p=byId[id];if(!p)return 0;if(p.pos==='DST')return (G[id]&&G[id].live&&G[id].live.pts)||0;const st=LIVEST[id];return st?linePts(st,p.pos,sc):0}
/* id -> who has him: your roster (starter or bench) or your opponent's lineup, per league */
function tmnOwners(Ls){const o={};Ls.forEach(c=>{c.roster.forEach(id=>(o[id]=o[id]||[]).push({c,side:'me',st:c.starters.has(id)}));if(c.opp)c.oppStarters.forEach(id=>{if(!c.roster.has(id))(o[id]=o[id]||[]).push({c,side:'opp',st:true})})});return o}

/* ---------- names in ESPN play text → players ---------- */
let TMN_IDX=null;
function tmnIndex(){if(TMN_IDX&&TMN_IDX.n===POOL.length)return TMN_IDX.m;const m={};
  POOL.forEach(p=>{if(p.pos==='DST'||p.pos==='K')return;const w=norm(p.n).split(' ').filter(Boolean);if(w.length<2)return;(m[p.t]=m[p.t]||[]).push({id:p.id,w,full:w.join('')})});TMN_IDX={n:POOL.length,m};return m}
function tmnFind(name,team){if(!name||!team)return null;const L=tmnIndex()[team]||[],key=s=>norm(s).replace(/ /g,'');
  const full=L.find(x=>x.full===key(name));if(full)return full.id;
  const i=name.indexOf('.');if(i<1||/\s/.test(name.slice(0,i)))return null;const ini=name.slice(0,i).toLowerCase().replace(/[^a-z]/g,''),last=key(name.slice(i+1));
  const hit=L.filter(x=>{for(let k=1;k<x.w.length;k++)if(x.w.slice(k).join('')===last&&x.w.slice(0,k).join('').startsWith(ini))return true;return false});
  return hit.length?hit[0].id:null}

/* ---------- play-by-play ---------- */
async function tmnLoadPlays(){if(TMN.plays&&Date.now()-TMN.playsAt<55e3)return;
  try{const r=await fetch('/api/plays?week='+WEEK+'&b='+Math.floor(Date.now()/60000));const j=r.ok?await r.json():null;
    if(j&&j.ok&&Array.isArray(j.plays)&&(!j.week||j.week===WEEK)){TMN.plays=j.plays;TMN.ok=true}else TMN.ok=false}catch(e){TMN.ok=false}
  TMN.playsAt=Date.now()}

/* ---------- the rules ---------- */
function tmnPlayPts(kind,yds,td,pos,sc){if(kind==='rush')return per(yds,sc.ryd)+(sc.ratt||0)+(td?sc.rtd:0);return (sc['rec'+pos]||0)+per(yds,sc.recyd)+(td?sc.rectd:0)}
function tmnRule(kind,yds,td,tdNum,pts){
  if(td){if(tdNum>=2)return tdNum>=3?'td3':'td2';if(yds>=TMN_R.td1Yds||pts>=TMN_R.td1Pts)return yds>=40?'longtd':'td';return null}
  if(kind==='rush'&&yds>=TMN_R.rush)return yds>=TMN_R.rushBig?'bigrun':'run';
  if(kind==='pass'&&yds>=TMN_R.rec)return 'catch';return null}

/* ---------- copy ---------- */
const TMN_COPY={
  clinch:['It\'s over. {p} just clinched your week.','Lock it in. {p} just ended it.','W secured. {p} put you out of reach.'],
  clinch0:['Sealed. Nothing can catch you now.','It\'s over. This one is yours.'],
  swing:['{p} just flipped it. You\'re winning now.','Momentum shift. {p} puts you in front.','That changes everything. {p} takes you to {wp}.','Clutch. {p} swings you to {wp} to win.'],
  longtd:['Gone. {p} takes it {y} yards to the house.','Nobody touched him. {p}, {y}-yard TD.','That\'s a highlight. {p} just went the distance.'],
  td:['{p} finds the end zone from {y} out.','Touchdown {p}. {y} yards.'],
  td2:['Again. {p}\'s second TD of the day.','{p} is on one right now. Score number two.'],
  td3:['Hat trick. {p} scores his third.','{p} again. Third TD of the day.'],
  tdN:['{p} again. That\'s {n} touchdowns.'],
  bigrun:['{p} just broke one. {y}-yard run.','Nobody could catch him. {p}, {y} yards.'],
  run:['{p} breaks off a {y}-yard run.','Big gain. {p} for {y} on the ground.'],
  catch:['Deep shot connected. {p}, {y}-yard catch.','{p} hauls in a {y}-yarder.'],
  game:['{p} is going off. {pts} pts and counting.','Outperforming. {p} already has {pts} pts.'],
  gameX:['Outperforming by {x}x. {p} already has {pts} pts.','{p} is going off. {x}x his projection.'],
  oinj:['Heads up: {p} is out. Your matchup just changed.'],
  opp:['Their {p} just made a big play.','Heads up: {p} hit them for {pts}.'],
  oppTd:['Their {p} just scored.','Heads up: {p} found the end zone for them.'],
};
const TMN_LBL={clinch:['Clincher','gold'],clinch0:['Clincher','gold'],swing:['Crunch time','good'],longtd:['Touchdown','good'],td:['Touchdown','good'],td2:['Touchdown','good'],td3:['Touchdown','good'],tdN:['Touchdown','good'],
  bigrun:['Big play','accent'],run:['Big play','accent'],catch:['Big play','accent'],game:['Big game','accent'],gameX:['Big game','accent'],oinj:['Heads up','warn'],opp:['Their big play','muted'],oppTd:['Their big play','muted']};
function tmnHash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}
function tmnHead(cls,k,v){const L=TMN_COPY[cls]||['{p}'];return L[tmnHash(k)%L.length].replace(/\{(\w+)\}/g,(_,x)=>v[x]??'')}
const tmnShort=n=>{const w=String(n||'').replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/,'').split(' ');return w.length>1?w.slice(1).join(' '):n};

/* ---------- detection: runs after every live update ---------- */
async function tmnTick(){try{
  if(!S||!S.teams||!LIVE||LIVE.week!==WEEK)return;tmnWeek();const gs=Object.values(LIVE.games||{});
  const Ls=tmnLeagues(),own=tmnOwners(Ls),fresh=[],first=TMN.first;
  const started=gs.some(g=>g.state!=='pre');
  if(started){await tmnLoadPlays();if(!LIVE||LIVE.week!==WEEK)return}
  const at=Date.now();
  /* 1. single plays */
  const tdCount={},seenPlay=new Set();
  if(TMN.ok&&TMN.plays){TMN.plays.forEach(pl=>{const roles=pl.kind==='rush'?[['ball',pl.ball]]:[['rec',pl.rec]];
    roles.forEach(([role,nm])=>{const id=tmnFind(nm,pl.t);if(!id)return;if(pl.td){const g=id+':'+pl.ev;tdCount[g]=(tdCount[g]||0)+1}
      const n=pl.td?tdCount[id+':'+pl.ev]:0,O=own[id];if(!O)return;seenPlay.add(id);
      tmnPlayEvent({id,kind:pl.kind,yds:pl.yds,td:pl.td,tdNum:n,k:'p:'+pl.id+':'+id,q:pl.q,clk:pl.clk,txt:pl.txt,O,at},fresh)})})}
  else if(TMN.ok===false&&TMN.prevSt){/* fallback: compare stat totals between checks */
    Object.keys(own).forEach(id=>{const a=TMN.prevSt[id],b=LIVEST[id];if(!a||!b)return;const O=own[id],dR=(b.ratt||0)-(a.ratt||0),dC=(b.rec||0)-(a.rec||0);
      const tA=(a.rtd||0)+(a.rectd||0),tB=(b.rtd||0)+(b.rectd||0);
      for(let n=tA+1;n<=tB;n++){const kind=(b.rtd||0)>(a.rtd||0)?'rush':'pass',one=dR+dC===1,yds=one?(kind==='rush'?b.ryd-a.ryd:b.recyd-a.recyd):0;
        tmnPlayEvent({id,kind,yds,td:true,tdNum:n,k:`f:${id}:td${n}`,O,at},fresh)}
      if(tB===tA){if(dR===1&&dC===0)tmnPlayEvent({id,kind:'rush',yds:b.ryd-a.ryd,td:false,k:`f:${id}:r${b.ratt}`,O,at},fresh);
        if(dC===1&&dR===0)tmnPlayEvent({id,kind:'pass',yds:b.recyd-a.recyd,td:false,k:`f:${id}:c${b.rec}`,O,at},fresh)}})}
  /* 2. big games, from stat totals in each league's own scoring */
  Object.keys(own).forEach(id=>{const p=byId[id],mine=own[id].filter(o=>o.side==='me');if(!p||!mine.length||!LIVEST[id]&&p.pos!=='DST')return;const k='game:'+id;if(TMN.fired.has(k))return;
    let hit=null;mine.forEach(o=>{const pts=tmnPts(id,o.c.sc),pr=projPts(p,o.c.sc);if(pts>=TMN_R.game||(pr>0&&pts>=TMN_R.gameMin&&pts>=TMN_R.gameX*pr)){if(!hit||pts>hit.pts)hit={pts,pr,o}}});
    if(!hit)return;const x=hit.pr>0?hit.pts/hit.pr:0,cls=hit.pts>=TMN_R.game?'game':'gameX';
    tmnAdd({k,type:'play',cls,pid:id,pts:hit.pts,x,sub:statLineTxt(p.pos,LIVEST[id]),leagues:tmnLg(mine,id),at,head:tmnHead(cls,k,{p:p.n,pts:f1(hit.pts),x:f1(x)})},fresh)});
  /* 3. matchups: crunch swing, clincher, opponent starter ruled out mid-game */
  Ls.forEach(c=>{const o=c.opp;if(!o)return;const mu=o.m-o.om,pv=TMN.prev[c.key],mineHere=fresh.filter(e=>e.type==='play'&&e.pid&&c.starters.has(e.pid)&&e.leagues.some(l=>l.key===c.key));
    const star=mineHere.sort((a,b)=>(b.pts||0)-(a.pts||0))[0];
    const ck='clinch:'+c.key,clinched=o.started&&!TMN.fired.has(ck)&&o.wp>=TMN_R.clinch&&o.now-o.onow>o.oceil+2;
    if(clinched){const who=star?byId[star.pid]:null;
      tmnAdd({k:ck,type:'clinch',cls:who?'clinch':'clinch0',pid:who?who.id:null,lkey:c.key,leagues:[{key:c.key,name:c.name,st:true,wp0:pv?pv.wp:null,wp1:o.wp}],at,
        sub:`${c.team} ${f1(o.now)} – ${f1(o.onow)} ${o.name}${o.final?' · final':''}`,head:tmnHead(who?'clinch':'clinch0',ck,{p:who?who.n:''})},fresh)}
    if(!clinched&&pv&&o.started&&pv.mu<=0&&mu>0&&o.rem+o.orem<=TMN_R.late&&star&&at-(pv.swingAt||0)>10*60e3){const k='swing:'+c.key+':'+star.k;
      tmnAdd({k,type:'swing',cls:'swing',pid:star.pid,lkey:c.key,leagues:[{key:c.key,name:c.name,st:true,wp0:pv.wp,wp1:o.wp}],at,
        sub:`Now projected to win by ${f1(mu)} · ${f1(o.now)}–${f1(o.onow)} with about ${Math.round(o.rem+o.orem)} pts left to play`,head:tmnHead('swing',k,{p:byId[star.pid].n,wp:Math.round(o.wp*100)+'%'})},fresh);(TMN.prev[c.key]=TMN.prev[c.key]||{}).swingAt=at}
    new Set([...c.oppStarters,...(TMN.prevOpp&&TMN.prevOpp[c.key]||[])]).forEach(id=>{const p=byId[id],gm=p&&LIVE.games[p.t];if(!gm||gm.state!=='in'||c.roster.has(id))return;const s=stOf(id),was=TMN.prevStat[id];
      if((s==='O'||s==='IR')&&was!==undefined&&was!=='O'&&was!=='IR'){const k='oinj:'+id;tmnAdd({k,type:'oinj',cls:'oinj',pid:id,leagues:[{key:c.key,name:c.name,st:true,wp0:pv?pv.wp:null,wp1:o.wp}],at,
        sub:`${o.name} started him. ${NOTES[id]&&NOTES[id].note?NOTES[id].note:'Ruled out during the game.'}`,head:tmnHead('oinj',k,{p:p.n})},fresh)}})});
  /* remember this check for the next one */
  TMN.prevOpp=TMN.prevOpp||{};Ls.forEach(c=>{if(c.opp){TMN.prev[c.key]={...(TMN.prev[c.key]||{}),mu:c.opp.m-c.opp.om,wp:c.opp.wp};TMN.prevOpp[c.key]=[...new Set([...c.oppStarters,...(TMN.prevOpp[c.key]||[])])].filter(id=>{const p=byId[id],g=p&&LIVE.games[p.t];return c.oppStarters.has(id)||(g&&g.state!=='pre')})}});
  TMN.prevSt=JSON.parse(JSON.stringify(LIVEST||{}));Ls.forEach(c=>(TMN.prevOpp[c.key]||[]).forEach(id=>TMN.prevStat[id]=stOf(id)||''));Object.keys(own).forEach(id=>TMN.prevStat[id]=stOf(id)||'');
  TMN.first=false;
  if(fresh.length){tmnSave();if(!first){fresh.filter(tmnShould).forEach(e=>tmnQueue(e,true));tmnPump()}if(typeof renderAlerts==='function')renderAlerts();if(tab==='news')tmnRender()}
}catch(err){console.warn('news tick',err)}}
function tmnLg(list,id){return list.map(o=>({key:o.c.key,name:o.c.name,st:o.st,wp0:TMN.prev[o.c.key]?TMN.prev[o.c.key].wp:null,wp1:o.c.opp?o.c.opp.wp:null,bench:!o.st}))}
function tmnPlayEvent(e,fresh){const p=byId[e.id];if(!p||TMN.fired.has(e.k))return;const mine=e.O.filter(o=>o.side==='me'),theirs=e.O.filter(o=>o.side==='opp');
  const lc=(mine.find(o=>o.c.cur)||mine[0]||theirs[0]).c,pts=tmnPlayPts(e.kind,e.yds,e.td,p.pos,lc.sc),cls=tmnRule(e.kind,e.yds,e.td,e.tdNum||0,pts);if(!cls)return;
  const what=e.kind==='rush'?(e.td?'rushing TD':'run'):(e.td?'TD catch':'catch'),gm=LIVE.games[p.t];
  const sub=`${e.yds?e.yds+'-yd ':''}${what}${e.q?` · Q${e.q} ${e.clk||''}`:''}${gm&&gm.opp?` · ${gm.home?'vs':'at'} ${gm.opp}`:''}`;
  if(mine.length){const n=e.tdNum||0;tmnAdd({k:e.k,type:'play',cls:n>3?'tdN':cls,pid:e.id,pts,yds:e.yds,td:e.td,sub,txt:e.txt||'',leagues:tmnLg(mine,e.id),at:e.at,
    head:tmnHead(n>3?'tdN':cls,e.k,{p:p.n,y:e.yds||'',n})},fresh)}
  else if(theirs.length){const k=e.k+':opp',oc=e.td?'oppTd':'opp';tmnAdd({k,type:'opp',cls:oc,pid:e.id,pts,yds:e.yds,td:e.td,sub,txt:e.txt||'',
    leagues:theirs.map(o=>({key:o.c.key,name:o.c.name,st:true,wp0:TMN.prev[o.c.key]?TMN.prev[o.c.key].wp:null,wp1:o.c.opp?o.c.opp.wp:null,their:true})),at:e.at,head:tmnHead(oc,k,{p:p.n,pts:f1(pts)})},fresh)}}
function tmnAdd(ev,fresh){if(TMN.fired.has(ev.k))return;TMN.fired.add(ev.k);ev.at=ev.at||Date.now();TMN.items.unshift(ev);fresh.push(ev)}
/* a banner only for leagues with banners on, and only when he's in your lineup there */
function tmnShould(ev){if(typeof USER!=='undefined'&&!USER)return false;const on=ev.leagues.filter(l=>tmnOn(l.key));
  if(ev.type==='opp')return tmnNotif().opp&&on.length>0;if(ev.type==='play')return on.some(l=>l.st);return on.length>0}

/* ---------- banners: arrive big, hold, shrink to a chip that stays 5 minutes ---------- */
function tmnStage(){let s=$('tmn-stage');if(!s){document.body.insertAdjacentHTML('beforeend','<div class="tmn-stage" id="tmn-stage" aria-live="polite"></div><div class="tmn-chips" id="tmn-chips"></div>');s=$('tmn-stage')}return s}
function tmnQueue(ev,hold){TMN.unread++;TMN.queue.push(ev);if(!hold)tmnPump()}
function tmnPump(){clearTimeout(TMN.timer);if(TMN.showing||!TMN.queue.length)return;
  const wait=TMN.lastShow?TMN.gapFor-(Date.now()-TMN.lastShow):0;
  /* most important first (clincher, then crunch time), newest first; anything older than 3 minutes, or past the next two, goes straight to a chip */
  const pri=e=>e.type==='clinch'?3:e.type==='swing'?2:1;TMN.queue.sort((a,b)=>pri(b)-pri(a)||b.at-a.at);
  TMN.queue=TMN.queue.filter((e,i)=>{if(e.type==='clinch'||(i<2&&Date.now()-e.at<=TMN_R.stale))return true;tmnChip(e);return false});
  if(!TMN.queue.length)return;if(wait>0&&TMN.queue[0].type!=='clinch'){TMN.timer=setTimeout(tmnPump,wait);return}
  tmnShow(TMN.queue.shift())}
TMN.gapFor=TMN_R.gap;
function tmnBody(ev,big){const p=ev.pid&&byId[ev.pid],[lbl,tone]=TMN_LBL[ev.cls]||['News','accent'];
  const lg=ev.leagues.map(l=>{const d=l.wp0!=null&&l.wp1!=null&&!l.bench?Math.round((l.wp1-l.wp0)*100):null;
    return `<span class="tmn-lchip${l.bench?' bench':''}${l.their?' their':''}">${esc(l.name)}${l.bench?' · bench':''}${l.wp1!=null&&!l.bench?` · <b>${Math.round(l.wp1*100)}%</b>${d?` <em class="${d>0?'up':'dn'}">${d>0?'+':'−'}${Math.abs(d)}</em>`:''}`:''}</span>`}).join('');
  return `<div class="tmn-b-av">${p?av(p,big?'lg':''):'<span class="tmn-seal">W</span>'}</div>
    <div class="tmn-b-main"><span class="tmn-lbl ${tone}">${lbl}</span><h3>${esc(ev.head)}</h3>${ev.sub?`<p>${esc(ev.sub)}</p>`:''}${lg?`<div class="tmn-lgs">${lg}</div>`:''}</div>
    ${ev.pts!=null&&ev.type!=='clinch'&&ev.type!=='swing'&&ev.type!=='oinj'?`<div class="tmn-b-pts"><b class="num">${ev.type==='play'&&(ev.cls==='game'||ev.cls==='gameX')?'':'+'}${f1(ev.pts)}</b><small>pts</small></div>`:''}`}
function tmnShow(ev){const s=tmnStage(),tone=(TMN_LBL[ev.cls]||[])[1]||'accent',hold=ev.type==='clinch'?TMN_R.clinchHold:TMN_R.hold;
  TMN.showing=ev;TMN.lastShow=Date.now();
  s.innerHTML=`<div class="tmn-ban tone-${tone} ${ev.type==='clinch'?'clinch':''}" role="status" data-nk="${esc(ev.k)}" tabindex="0">${tmnBody(ev,true)}<button class="tmn-x" type="button" data-nx="1" aria-label="Dismiss">×</button><i class="tmn-timer" style="animation-duration:${hold}ms"></i></div>`;
  const b=s.firstElementChild;requestAnimationFrame(()=>b.classList.add('in'));
  TMN.hideT=setTimeout(()=>tmnMin(),hold)}
function tmnMin(dismiss){clearTimeout(TMN.hideT);const s=$('tmn-stage'),b=s&&s.firstElementChild,ev=TMN.showing;TMN.showing=null;
  if(b){b.classList.remove('in');b.classList.add(dismiss?'out':'min');setTimeout(()=>{if(b.parentNode)b.remove()},420)}
  if(ev&&!dismiss)setTimeout(()=>tmnChip(ev),260);setTimeout(tmnPump,500)}
function tmnChip(ev){const box=$('tmn-chips')||(tmnStage(),$('tmn-chips'));TMN.chips=TMN.chips.filter(c=>c.k!==ev.k);TMN.chips.push({k:ev.k,until:Date.now()+TMN_R.chipLife});tmnPaintChips()}
function tmnPaintChips(){const box=$('tmn-chips');if(!box)return;TMN.chips=TMN.chips.filter(c=>c.until>Date.now());const show=TMN.chips.slice(-4).reverse(),more=TMN.chips.length-show.length;
  box.innerHTML=show.map(c=>{const ev=TMN.items.find(x=>x.k===c.k);if(!ev)return '';const p=ev.pid&&byId[ev.pid],tone=(TMN_LBL[ev.cls]||[])[1]||'accent';
    return `<div class="tmn-chip tone-${tone}" data-nk="${esc(ev.k)}" role="button" tabindex="0"><i></i><span>${p?esc(tmnShort(p.n)):'Your week'}</span>${ev.pts!=null&&ev.type==='play'?`<b class="num">${ev.cls==='game'||ev.cls==='gameX'?'':'+'}${f1(ev.pts)}</b>`:`<b>${esc((TMN_LBL[ev.cls]||['News'])[0])}</b>`}<button type="button" data-nxc="${esc(ev.k)}" aria-label="Dismiss">×</button></div>`}).join('')
    +(more>0?`<a class="tmn-chip more" href="#news">+${more} more</a>`:'');
  clearTimeout(TMN.chipT);if(TMN.chips.length)TMN.chipT=setTimeout(tmnPaintChips,15e3)}
function tmnUnread(){return TMN.unread||0}
function tmnOpen(k){TMN.focus=k;TMN.chips=TMN.chips.filter(c=>c.k!==k);tmnPaintChips();if(TMN.showing&&TMN.showing.k===k)tmnMin(true);
  if(location.hash==='#news'){TMN.f='all';TMN.lg='all';tmnRender()}else location.hash='news'}

/* ---------- the News tab ---------- */
const TMN_F=[['all','All'],['big','Big plays'],['inj','Injuries'],['final','Finals'],['clips','Clips']];
function tmnMood(){const gs=LIVE&&LIVE.week===WEEK?Object.values(LIVE.games||{}):[];if(gs.some(g=>g.state==='in'))return 'live';if(gs.some(g=>g.state==='post'))return 'after';return 'quiet'}
function tmnRender(){const el=$('news-body');if(!el)return;tmnWeek();TMN.unread=0;
  if(typeof FEED!=='undefined'&&typeof loadFeed==='function'&&(!FEED||Date.now()-FEED_AT>4*60e3))Promise.resolve(loadFeed()).then(()=>{if(tab==='news'&&FEED)tmnRenderBody()});
  const Ls=tmnLeagues();if(TMN.lg!=='all'&&!Ls.some(c=>c.key===TMN.lg))TMN.lg='all';const mood=tmnMood();
  el.innerHTML=`<div class="hero"><div><div class="kicker">Week ${WEEK} · ${Ls.length>1?`all ${Ls.length} leagues`:'your league'}</div><h1>News</h1><p>Big plays, injuries and results for your players, the moment they happen.</p></div>
      <div class="toolbar"><a class="btn tmn-gear" href="#account-leagues" data-notif-go="1" title="Notification settings"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg><span>Notifications</span></a></div></div>
    ${tmnNowHtml(Ls,mood)}
    <div class="tmn-bar"><div class="seg" role="group" aria-label="Show">${TMN_F.map(([k,l])=>`<button type="button" data-nf="${k}" aria-pressed="${TMN.f===k}">${l}</button>`).join('')}</div>
      ${Ls.length>1?`<select id="tmn-lg" class="tmn-lgsel" aria-label="League"><option value="all">All leagues</option>${Ls.map(c=>`<option value="${esc(c.key)}" ${TMN.lg===c.key?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`:''}</div>
    <div class="tmn-feed" id="tmn-feed"></div>`;
  tmnRenderBody(Ls,mood)}
function tmnNowHtml(Ls,mood){const M=Ls.filter(c=>c.opp);if(!M.length)return '';
  return `<div class="tmn-now" aria-label="Your matchups">${M.map(c=>{const o=c.opp,st=o.final?'Final':o.live?'Live':o.started?'In progress':'Projected',show=o.started,a=show?o.now:o.m,b=show?o.onow:o.om,on=tmnOn(c.key);
    return `<a class="tmn-mu${o.final?(o.now>o.onow?' won':o.now<o.onow?' lost':''):''}" href="#news" data-nlg="${esc(c.key)}"><div class="tmn-mu-h"><b>${esc(c.name)}</b><span class="tmn-mu-st${o.live?' on':''}">${o.live?'<span class="live-dot on"></span>':''}${st}</span></div>
      <div class="tmn-mu-sc"><span class="num">${f1(a)}</span><span class="tmn-mu-vs">${esc(o.name)}</span><span class="num">${f1(b)}</span></div>
      <div class="tmn-mu-bar"><i style="width:${Math.round(o.wp*100)}%"></i></div><div class="tmn-mu-f"><span>${o.final?(o.now>o.onow?'You won':o.now<o.onow?'You lost':'Tie'):Math.round(o.wp*100)+'% to win'}</span>${on?'':'<span class="note">Banners off</span>'}</div></a>`}).join('')}</div>`}
function tmnRenderBody(Ls,mood){const el=$('tmn-feed');if(!el)return;Ls=Ls||tmnLeagues();mood=mood||tmnMood();
  const inLg=l=>TMN.lg==='all'||l.some(x=>(x.key||x)===TMN.lg),f=TMN.f,cards=[];tmnBuildClips(Ls);
  /* events */
  const evs=TMN.items.filter(e=>inLg(e.leagues)&&(e.type!=='opp'||tmnNotif().opp));
  const evCards=evs.map(e=>({at:e.at,cat:e.type==='oinj'?'inj':'big',html:tmnEvCard(e)}));
  /* injuries on your lineups, any league */
  const inj={};Ls.forEach(c=>{if(TMN.lg!=='all'&&c.key!==TMN.lg)return;c.starters.forEach(id=>{const s=stOf(id),p=byId[id],gm=p&&LIVE&&LIVE.week===WEEK&&LIVE.games[p.t];if(!s||!p||(gm&&gm.state==='post')||BYE[p.t]===WEEK)return;(inj[id]=inj[id]||{id,s,L:[]}).L.push(c)})});
  const injCards=Object.values(inj).sort((a,b)=>'OIRPUPSUSDQ'.indexOf(a.s)-'OIRPUPSUSDQ'.indexOf(b.s)).map(x=>({at:Date.parse((NOTES[x.id]&&NOTES[x.id].at)||0)||0,cat:'inj',html:tmnInjCard(x)}));
  /* finals and results */
  const finCards=[],done=[];Ls.forEach(c=>{if(TMN.lg!=='all'&&c.key!==TMN.lg)return;if(c.opp&&c.opp.final)finCards.push({at:1,cat:'final',html:tmnResultCard(c)});
    c.starters.forEach(id=>{const p=byId[id],gm=p&&LIVE&&LIVE.week===WEEK&&LIVE.games[p.t];if(gm&&gm.state==='post'&&!done.some(d=>d.id===id))done.push({id,c})})});
  if(done.length)finCards.push({at:0,cat:'final',html:tmnFinalsCard(done)});
  /* trade and waiver signals for the league on screen */
  const sig=(TMN.lg==='all'||TMN.lg===S.leagueKey)&&typeof alertsList==='function'?alertsList().filter(a=>/^(sell|pick)-/.test(a.k)).slice(0,4).map(a=>({at:0,cat:'sig',html:tmnSigCard(a)})):[];
  /* clips */
  const clip=tmnClipsCard();
  const order=mood==='live'?[evCards,injCards,finCards,sig]:mood==='after'?[finCards,evCards,sig,injCards]:[injCards,sig,evCards,finCards];
  order.forEach(g=>cards.push(...g));if(clip)cards.push({cat:'clips',html:clip});
  const show=cards.filter(c=>f==='all'||f===c.cat);
  const lastWk=TMN.last&&TMN.last.items.length&&(f==='all'||f==='big')?`<details class="card tmn-last"><summary>Week ${TMN.last.week} big plays <span class="note">${TMN.last.items.length}</span></summary><div class="tmn-last-l">${TMN.last.items.filter(e=>inLg(e.leagues)).slice(0,30).map(tmnEvCard).join('')}</div></details>`:'';
  el.innerHTML=(show.length?show.map(c=>c.html).join(''):`<div class="card tmn-empty"><h2>${f==='big'?'No big plays yet':f==='inj'?'Everyone is healthy':f==='final'?'No final lines yet':f==='clips'?'No clips yet':'Nothing yet this week'}</h2><p class="note">${f==='big'||f==='all'?'When one of your players breaks a long run, catches a deep ball, scores again or clinches your week, it shows up here and pops up wherever you are on the site.':f==='inj'?'Starters in any of your leagues who are questionable or worse show up here.':f==='final'?'Each player\'s closing line shows up here when his game ends.':'Clips of your players show up here as games are played.'}</p></div>`)+lastWk;
  if(TMN.focus){const k=TMN.focus;TMN.focus=null;const it=el.querySelector(`[data-nkf="${CSS.escape(k)}"]`);if(it){it.classList.add('focus');setTimeout(()=>it.scrollIntoView({behavior:'smooth',block:'center'}),40);setTimeout(()=>it.classList.remove('focus'),2600)}}}
function tmnEvCard(e){const tone=(TMN_LBL[e.cls]||[])[1]||'accent',p=e.pid&&byId[e.pid];
  let clip='';if(p&&typeof playerVideos==='function'&&typeof FEED!=='undefined'&&FEED){const latest=TMN.items.find(x=>x.pid===p.id&&x.type==='play')===e,v=playerVideos(p).find(v=>{if(v.week!==WEEK||(e.at&&v.at&&Date.parse(v.at)<e.at-15*60e3))return false;const n=(v.title.match(/\b(\d{1,2})[- ]?(?:yard|yd)/i)||[])[1];return n?e.yds&&+n===e.yds:latest&&e.cls!=='game'&&e.cls!=='gameX'});if(v){clip=`<div class="tmn-clip">${thumbHtml({...v,player:p.id},'sm')}</div>`}}
  return `<article class="card tmn-ev tone-${tone}${e.type==='opp'?' their':''}" data-nkf="${esc(e.k)}"><div class="tmn-ev-in">${tmnBody(e,false)}</div>
    <div class="tmn-ev-f"><span class="note">${e.at?tmnWhen(e.at):''}</span>${p?`<button class="linkish" data-open="${p.id}">Player card</button>`:''}${e.txt?`<span class="tmn-txt" title="${esc(e.txt)}">${esc(e.txt)}</span>`:''}</div>${clip}</article>`}
function tmnWhen(t){const d=new Date(t),m=(Date.now()-t)/60e3;return m<1?'Just now':m<60?Math.round(m)+'m ago':d.toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'})}
function tmnInjCard(x){const p=byId[x.id],n=NOTES[x.id],out=x.s!=='Q'&&x.s!=='D',cur=x.L.find(c=>c.cur);
  const what=out?'He\'s in your starting lineup. Swap him out before his game.':x.s==='D'?'Doubtful. Line up a backup now.':'Check his status before kickoff and have a backup ready.';
  return `<article class="card tmn-ev tone-${out?'bad':'warn'}"><div class="tmn-ev-in"><div class="tmn-b-av">${av(p)}</div><div class="tmn-b-main"><span class="tmn-lbl ${out?'bad':'warn'}">${esc(ST_LABEL[x.s]||x.s)}</span>
    <h3>${esc(p.n)} ${out?'is out':x.s==='D'?'is doubtful':'is questionable'}</h3><p>${esc(what)}</p>${n&&n.note?`<p class="tmn-note">${esc(n.note)}</p>`:''}
    <div class="tmn-lgs">${x.L.map(c=>`<span class="tmn-lchip">${esc(c.name)}</span>`).join('')}</div></div></div>
    <div class="tmn-ev-f"><span class="note">${n&&n.at?tmnWhen(Date.parse(n.at)):''}</span><button class="linkish" data-open="${p.id}">Player card</button>${cur?'<a class="linkish" href="#team">Set lineup</a>':''}</div></article>`}
function tmnResultCard(c){const o=c.opp,w=o.now>o.onow,t=o.now===o.onow;
  return `<article class="card tmn-ev tmn-res tone-${w?'good':t?'accent':'bad'}"><div class="tmn-ev-in"><div class="tmn-b-av"><span class="tmn-seal ${w?'':'l'}">${w?'W':t?'T':'L'}</span></div><div class="tmn-b-main"><span class="tmn-lbl ${w?'good':'bad'}">Final</span>
    <h3>${w?'You beat':t?'You tied':'You lost to'} ${esc(o.name)}</h3><p class="num">${f1(o.now)} – ${f1(o.onow)}</p><div class="tmn-lgs"><span class="tmn-lchip">${esc(c.name)}</span></div></div></div></article>`}
function tmnFinalsCard(done){const rows=done.map(({id,c})=>({id,c,pts:tmnPts(id,c.sc)})).sort((a,b)=>b.pts-a.pts),many=rows.length>8;
  const row=r=>{const p=byId[r.id];return `<li>${av(p,'sm')}<span class="tmn-fn"><button class="pname" data-open="${p.id}">${esc(p.n)}</button><span class="psub">${esc(statLineTxt(p.pos,LIVEST[r.id]))}</span></span><b class="num">${f1(r.pts)}</b></li>`};
  return `<article class="card tmn-fin"><div class="card-h"><h2>Final lines</h2><span class="note">${rows.length} of your starters are done</span></div><ul class="tmn-fl">${rows.slice(0,8).map(row).join('')}</ul>
    ${many?`<details><summary class="linkish">Show all ${rows.length}</summary><ul class="tmn-fl">${rows.slice(8).map(row).join('')}</ul></details>`:''}</article>`}
function tmnSigCard(a){const p=a.open&&byId[a.open],sell=/^sell-/.test(a.k);
  return `<article class="card tmn-ev tone-${sell?'accent':'good'}"><div class="tmn-ev-in"><div class="tmn-b-av">${p?av(p):''}</div><div class="tmn-b-main"><span class="tmn-lbl ${sell?'accent':'good'}">${sell?'Trade signal':'Waiver'}</span><h3>${esc(a.t)}</h3><p>${esc(a.d)}</p>
    <div class="tmn-lgs"><span class="tmn-lchip">${esc(S.league&&S.league.name||'League')}</span></div></div></div><div class="tmn-ev-f">${p?`<button class="linkish" data-open="${p.id}">Player card</button>`:''}<a class="linkish" href="#${sell?'trade':'waivers'}">${sell?'Find a trade':'Waivers'}</a></div></article>`}
function tmnBuildClips(Ls){if(typeof FEED==='undefined'||!FEED||typeof buildClips!=='function')return;const ids=new Set();Ls.forEach(c=>{if(TMN.lg!=='all'&&c.key!==TMN.lg)return;c.roster.forEach(id=>ids.add(id))});buildClips([...ids].filter(id=>byId[id]).map(id=>({id})))}
function tmnClipsCard(){if(typeof FEED==='undefined'||!FEED||!CLIPS.length)return '';
  return `<article class="card tmn-clips"><div class="card-h"><h2>Clips of your players</h2><span class="note">${CLIPS.length} clip${CLIPS.length>1?'s':''} · official NFL and team channels</span></div><div class="tmn-cgrid">${CLIPS.slice(0,TMN.f==='clips'?40:6).map(v=>thumbHtml(v,'sm')).join('')}</div>${TMN.f!=='clips'&&CLIPS.length>6?`<button class="linkish" data-nf="clips">See all ${CLIPS.length}</button>`:''}</article>`}

/* ---------- Account → Leagues: which leagues can pop up ---------- */
function tmnNotifHtml(){const L=S.leagues&&S.leagues.length?S.leagues:[{key:S.leagueKey,name:S.league&&S.league.name}],n=tmnNotif();
  return `<section class="card acc-sec" id="acc-notif"><header class="acc-sec-h"><h2>Notifications</h2><p>Pick which leagues can pop up a banner for big plays, crunch-time swings and clinchers. The News tab always shows every league.</p></header>
    <ul class="tmn-nl">${L.map(x=>`<li><span class="acc-lg-t"><b>${esc(x.name||'League')}</b><span class="note">${tmnOn(x.key)?'Banners on':'News tab only'}</span></span><label class="tmn-sw"><input type="checkbox" data-notif="${esc(x.key)}" ${tmnOn(x.key)?'checked':''}><i aria-hidden="true"></i><span class="sr">Banners for ${esc(x.name||'League')}</span></label></li>`).join('')}
      <li class="tmn-nl-opp"><span class="acc-lg-t"><b>Your opponents' big plays</b><span class="note">A quieter banner when the team you're playing hits a big one</span></span><label class="tmn-sw"><input type="checkbox" data-notif-opp="1" ${n.opp?'checked':''}><i aria-hidden="true"></i><span class="sr">Opponent banners</span></label></li></ul>
    <p class="note tmn-nl-f">Banners show while TradeMetric is open in a tab. Phone alerts come with the app.</p></section>`}

/* ---------- events ---------- */
document.addEventListener('click',e=>{const t=e.target;if(!t.closest)return;
  if(t.closest('[data-nx]')){e.stopPropagation();tmnMin(true);return}
  const xc=t.closest('[data-nxc]');if(xc){e.stopPropagation();TMN.chips=TMN.chips.filter(c=>c.k!==xc.dataset.nxc);tmnPaintChips();return}
  const nk=t.closest('.tmn-ban[data-nk],.tmn-chip[data-nk]');if(nk){tmnOpen(nk.dataset.nk);return}
  const nf=t.closest('[data-nf]');if(nf){TMN.f=nf.dataset.nf;tmnRender();return}
  const ml=t.closest('[data-nlg]');if(ml){e.preventDefault();TMN.lg=TMN.lg===ml.dataset.nlg?'all':ml.dataset.nlg;tmnRender();return}
  if(t.closest('[data-notif-go]'))TMN.goNotif=true;
  if(t.closest('.tmn-chip.more')){TMN.f='big';if(location.hash==='#news')tmnRender()}});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('.tmn-ban[data-nk],.tmn-chip[data-nk]')){e.preventDefault();tmnOpen(e.target.dataset.nk)}});
document.addEventListener('change',e=>{const t=e.target;
  if(t.id==='tmn-lg'){TMN.lg=t.value;tmnRender();return}
  if(t.dataset&&t.dataset.notif!==undefined){const n=tmnNotif(),k=t.dataset.notif;n.off=n.off.filter(x=>x!==k);if(!t.checked)n.off.push(k);save();
    const s=t.closest('li').querySelector('.note');if(s)s.textContent=t.checked?'Banners on':'News tab only';toast(t.checked?'Banners on for this league':'Banners off. It still shows in News.');return}
  if(t.dataset&&t.dataset.notifOpp){tmnNotif().opp=t.checked;save();toast(t.checked?'Opponent banners on':'Opponent banners off')}});
