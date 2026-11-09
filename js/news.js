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
  if(d.week===WEEK){TMN.items=d.items||[];TMN.fired=new Set(d.fired||[]);TMN.used=d.used||{}}else if(d.week===WEEK-1&&d.items&&d.items.length)TMN.last={week:d.week,items:d.items};
  if(d.last&&d.last.week===WEEK-1&&!TMN.last)TMN.last=d.last}catch(e){}TMN.week=WEEK}
function tmnSave(){try{localStorage.setItem(TMN_LS,JSON.stringify({week:TMN.week,items:TMN.items.slice(0,120),fired:[...TMN.fired].slice(-600),last:TMN.last,used:TMN.used||{}}))}catch(e){}}
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

/* ---------- copy ----------
   Every headline is written from what actually happened: who, how far, against whom, when, and what it did to your matchup.
   A template is skipped when it needs a detail this play doesn't have. "r|" = runs only, "c|" = catches only.
   Within a type, the site rotates through every template before any repeats (remembered across reloads). */
const TMN_COPY={
  clinch:['It\'s over. {p} just put {opp} away.','Ballgame. {last} seals it for {team}.','That\'s the dagger. {last} clinches your week.','{opp} can\'t catch you now. {last} made sure of it.','Lights out on {opp}. {p} finished the job.'],
  clinch0:['Sealed. {opp} has no way back.','Lock it in. This week belongs to {team}.','Mathematically done. You beat {opp}.','Nothing left on {opp}\'s side can catch you. W.'],
  swing:['{last} just flipped it. You\'re ahead of {opp}.','Lead change. {p} puts you in front, {wp} to win.','Clutch. {last} swings you from {wp0} to {wp}.','{opp} had you, until {last} showed up.','Late and huge. {p} takes the lead back from {opp}.'],
  longtd:['Gone. {last} goes {y} yards and nobody lays a finger on him.','{y}-yard house call. {p} just torched the {nick}.','r|See ya. {last} outruns the entire {nick} defense for {y}.','c|{last} catches it in stride and takes it {y} yards to the house.','Daylight, then the end zone. {p} from {y} out.','{p} just ripped the {nick} for a {y}-yard score.','r|One cut and gone. {last} breaks a {y}-yard TD run.','c|Burned them deep. {last} with a {y}-yard touchdown.'],
  td:['r|{last} powers in from {y} out. Six on the board.','c|{last} hauls in a {y}-yard touchdown against the {nick}.','Touchdown, {p}. {pts} points on one snap.','{last} hits paydirt, and you\'re now {wp} to win.','Six for {last}. {y} yards, {qtxt}.','{p} finds the end zone against the {nick}.','c|Pitch and catch. {last} scores from {y}.','r|Nobody\'s stopping {last} at the goal line. Touchdown.'],
  td2:['Back for more. {last} scores again.','Two-touchdown day for {p}.','{last} doubles up on the {nick}.','Same guy, same result. {p} finds the end zone again.','The {nick} still can\'t stop {last}. That\'s TD number two.','{last} again. Two scores and {pts} more points for you.'],
  td3:['Hat trick. {p} has three touchdowns.','{last} is putting together a career day. Score number three.','Three for three. {last} keeps finding the end zone.','Somebody stop {last}. Third TD against the {nick}.'],
  tdN:['{last} has {n} touchdowns. This is getting silly.','{n} scores for {p}. Frame this box score.','Touchdown number {n} for {last}. The {nick} have no answers.'],
  bigrun:['Breakaway. {p} rips off {y} yards.','{last} hits the hole and is gone for {y}.','{y} yards on one carry. {last} left the {nick} grabbing air.','Home-run swing. {p} bursts for {y}.','{last} just broke the {nick} defense in half. {y}-yard run.'],
  run:['{last} finds a crease and picks up {y}.','Chunk run. {p} for {y} yards.','{last} bounces it outside for {y}.','{p} shakes loose for {y} against the {nick}.','Big gain on the ground. {last} for {y}, {qtxt}.','{last} breaks two tackles and rumbles for {y}.'],
  catch:['Deep shot connects. {p} hauls in {y}.','{last} gets behind the {nick} secondary for {y}.','Moonball. {last} tracks it down for {y} yards.','{p} climbs the ladder for a {y}-yard grab.','{y} yards through the air to {last}.','Big-time catch. {last} goes up and gets it for {y}.'],
  game:['{p} is having a monster day. {pts} points and counting.','{pts} already. {last} is carrying your lineup.','League-winner stuff. {p} is up to {pts}.','{last} just crossed {pts}, and he\'s not done.','{p} is cooking the {nick}. {pts} points so far.'],
  gameX:['{p} is going off. {pts} points and counting.','{pts} for {last} today, and he\'s not slowing down.','Found money. {last} is up to {pts}.','{last} is carrying your lineup with {pts}.','Big day for {p}: {pts} points against the {nick}.'],
  oinj:['Break your way: {p} is out for {opp}.','{opp} just lost {p}. Your odds go up.','{p} won\'t return. {opp} is down a starter.','Bad news for {opp}: {p} is done for the day.'],
  opp:['{opp}\'s {last} rips off {y}. Hang in there.','Their {p} hits one for {y}.','{last} just gained {y} for {opp}.'],
  oppTd:['{opp}\'s {p} scores. Time to answer.','Touchdown against you. {p} for {opp}.','{last} finds the end zone for {opp}.'],
};
const TMN_LBL={clinch:['Clincher','gold'],clinch0:['Clincher','gold'],swing:['Lead change','good'],longtd:['Long touchdown','good'],td:['Touchdown','good'],td2:['Second TD','good'],td3:['Hat trick','good'],tdN:['Touchdown','good'],
  bigrun:['Breakaway','accent'],run:['Big run','accent'],catch:['Deep ball','accent'],game:['Going off','accent'],gameX:['Going off','accent'],oinj:['Opponent hurt','warn'],myinj:['New injury','bad'],myworse:['Downgraded','bad'],mybetter:['Upgraded','good'],myclear:['Cleared','good'],opp:['Against you','muted'],oppTd:['Against you','muted']};
function tmnHash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}
const TMN_Q=['','in the 1st','in the 2nd','in the 3rd','in the 4th','in overtime'];
/* pick a template this play has every detail for, skipping ones used recently for this type */
function tmnHead(cls,k,v){const all=TMN_COPY[cls]||['{p}'],kind=v.kind==='rush'?'r':v.kind==='pass'?'c':'';
  const fits=all.map((t,i)=>{const m=t.match(/^([rc])\|/);if(m&&m[1]!==kind)return null;const body=m?t.slice(2):t;
    return (body.match(/\{(\w+)\}/g)||[]).every(x=>{const val=v[x.slice(1,-1)];return val!=null&&val!==''})?{i,body}:null}).filter(Boolean);
  const pool=fits.length?fits:[{i:-1,body:'{p}'}];TMN.used=TMN.used||{};const used=TMN.used[cls]||[],keep=Math.max(0,Math.min(pool.length-1,all.length-1));
  const fresh=pool.filter(x=>!used.slice(-keep).includes(x.i)),pick=(fresh.length?fresh:pool)[tmnHash(k)%(fresh.length||pool.length)];
  TMN.used[cls]=[...used,pick.i].slice(-8);
  return pick.body.replace(/\{(\w+)\}/g,(_,x)=>v[x]??'')}
const tmnN=x=>String(Math.round((+x||0)*10)/10);
const tmnShort=n=>{const w=String(n||'').replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/,'').split(' ');return w.length>1?w.slice(1).join(' '):n};
/* the details a headline can use */
function tmnVars(p,c,extra){const gm=p&&LIVE&&LIVE.games&&LIVE.games[p.t],o=c&&c.opp;
  return {p:p?p.n:'',last:p?tmnShort(p.n):'',nick:gm&&gm.opp&&typeof NICK!=='undefined'?NICK[gm.opp]||gm.opp:'',team:c?c.team:'',opp:o?o.name:'',wp:o?Math.round(o.wp*100)+'%':'',...extra}}

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
      tmnPlayEvent({id,kind:pl.kind,yds:pl.yds,td:pl.td,tdNum:n,k:'p:'+pl.id+':'+id,q:pl.q,clk:pl.clk,txt:pl.txt,ev:pl.ev,wall:pl.at,O,at},fresh)})})}
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
    if(!hit)return;const x=hit.pr>0?hit.pts/hit.pr:0,cls=hit.pts>=TMN_R.game?'game':'gameX',gm=LIVE.games[p.t];
    tmnAdd({k,type:'play',cls,pid:id,pts:hit.pts,x,ev:gm&&gm.id,sub:[statLineTxt(p.pos,LIVEST[id]),tmnVs(gm)].filter(Boolean).join(' · '),leagues:tmnLg(mine,id),at,
      head:tmnHead(cls,k,tmnVars(p,hit.o.c,{pts:tmnN(hit.pts),x:tmnN(x),pr:hit.pr>0?tmnN(hit.pr):''}))},fresh)});
  /* 3. matchups: crunch swing, clincher, opponent starter ruled out mid-game */
  Ls.forEach(c=>{const o=c.opp;if(!o)return;const mu=o.m-o.om,pv=TMN.prev[c.key],mineHere=fresh.filter(e=>e.type==='play'&&e.pid&&c.starters.has(e.pid)&&e.leagues.some(l=>l.key===c.key));
    const star=mineHere.sort((a,b)=>(b.pts||0)-(a.pts||0))[0];
    const ck='clinch:'+c.key,clinched=o.started&&!TMN.fired.has(ck)&&o.wp>=TMN_R.clinch&&o.now-o.onow>o.oceil+2;
    if(clinched){const who=star?byId[star.pid]:null;
      tmnAdd({k:ck,type:'clinch',cls:who?'clinch':'clinch0',pid:who?who.id:null,lkey:c.key,leagues:[{key:c.key,name:c.name,st:true,wp0:pv?pv.wp:null,wp1:o.wp}],at,
        sub:`${c.team} ${f1(o.now)} – ${f1(o.onow)} ${o.name}${o.final?' · final':` · up ${f1(o.now-o.onow)} with ${Math.round(o.orem)} projected left on their side`}`,head:tmnHead(who?'clinch':'clinch0',ck,tmnVars(who,c,{}))},fresh)}
    if(!clinched&&pv&&o.started&&pv.mu<=0&&mu>0&&o.rem+o.orem<=TMN_R.late&&star&&at-(pv.swingAt||0)>10*60e3){const k='swing:'+c.key+':'+star.k;
      tmnAdd({k,type:'swing',cls:'swing',pid:star.pid,lkey:c.key,leagues:[{key:c.key,name:c.name,st:true,wp0:pv.wp,wp1:o.wp}],at,
        sub:`Now projected to win by ${f1(mu)} · ${f1(o.now)}–${f1(o.onow)} with about ${Math.round(o.rem+o.orem)} pts left to play`,head:tmnHead('swing',k,tmnVars(byId[star.pid],c,{wp0:pv.wp!=null?Math.round(pv.wp*100)+'%':'',kind:star.kind}))},fresh);(TMN.prev[c.key]=TMN.prev[c.key]||{}).swingAt=at}
    new Set([...c.oppStarters,...(TMN.prevOpp&&TMN.prevOpp[c.key]||[])]).forEach(id=>{const p=byId[id],gm=p&&LIVE.games[p.t];if(!gm||gm.state!=='in'||c.roster.has(id))return;const s=stOf(id),was=TMN.prevStat[id];
      if((s==='O'||s==='IR')&&was!==undefined&&was!=='O'&&was!=='IR'&&!TMN.fired.has('oinj:'+id)){const k='oinj:'+id;tmnAdd({k,type:'oinj',cls:'oinj',pid:id,leagues:[{key:c.key,name:c.name,st:true,wp0:pv?pv.wp:null,wp1:o.wp}],at,
        sub:`${o.name} started him. ${NOTES[id]&&NOTES[id].note?NOTES[id].note:'Ruled out during the game.'}`,head:tmnHead('oinj',k,tmnVars(p,c,{}))},fresh)}})});
  /* 4. your players: a new injury, or any change to a hurt player's status */
  tmnMyInj(Ls,fresh,at);
  /* remember this check for the next one */
  TMN.prevOpp=TMN.prevOpp||{};Ls.forEach(c=>{if(c.opp){TMN.prev[c.key]={...(TMN.prev[c.key]||{}),mu:c.opp.m-c.opp.om,wp:c.opp.wp};TMN.prevOpp[c.key]=[...new Set([...c.oppStarters,...(TMN.prevOpp[c.key]||[])])].filter(id=>{const p=byId[id],g=p&&LIVE.games[p.t];return c.oppStarters.has(id)||(g&&g.state!=='pre')})}});
  TMN.prevSt=JSON.parse(JSON.stringify(LIVEST||{}));Ls.forEach(c=>(TMN.prevOpp[c.key]||[]).forEach(id=>TMN.prevStat[id]=stOf(id)||''));Object.keys(own).forEach(id=>TMN.prevStat[id]=stOf(id)||'');
  TMN.first=false;
  if(fresh.length){tmnSave();if(!first){fresh.filter(tmnShould).forEach(e=>tmnQueue(e,true));tmnPump()}if(typeof renderAlerts==='function')renderAlerts();if(tab==='news')tmnRender()}
}catch(err){console.warn('news tick',err)}}
function tmnLg(list,id){return list.map(o=>({key:o.c.key,name:o.c.name,st:o.st,wp0:TMN.prev[o.c.key]?TMN.prev[o.c.key].wp:null,wp1:o.c.opp?o.c.opp.wp:null,bench:!o.st}))}
const tmnVs=gm=>gm&&gm.opp?`${gm.home?'vs':'at'} ${gm.opp}`:'';
function tmnPlayEvent(e,fresh){const p=byId[e.id];if(!p||TMN.fired.has(e.k))return;const mine=e.O.filter(o=>o.side==='me'),theirs=e.O.filter(o=>o.side==='opp');
  const lc=(mine.find(o=>o.c.cur)||mine[0]||theirs[0]).c,pts=tmnPlayPts(e.kind,e.yds,e.td,p.pos,lc.sc),cls=tmnRule(e.kind,e.yds,e.td,e.tdNum||0,pts);if(!cls)return;
  const what=e.kind==='rush'?(e.td?'rushing TD':'run'):(e.td?'TD catch':'catch'),gm=LIVE.games[p.t];
  const sub=[`${e.yds?e.yds+'-yd ':''}${what}`,e.q?`Q${e.q}${e.clk?' '+e.clk:''}`:'',tmnVs(gm)].filter(Boolean).join(' · ');
  const n=e.tdNum||0,base={pid:e.id,pts,tot:tmnPts(e.id,lc.sc),yds:e.yds,td:e.td,kind:e.kind,tdNum:n,q:e.q||0,ev:e.ev||(gm&&gm.id)||null,wall:e.wall||null,sub,txt:e.txt||'',at:e.at};
  const vars=c=>tmnVars(p,c,{y:e.yds||'',n:n||'',kind:e.kind,pts:tmnN(pts),qtxt:TMN_Q[Math.min(e.q||0,5)]||''});
  if(mine.length){const c2=n>3?'tdN':cls;tmnAdd({...base,k:e.k,type:'play',cls:c2,leagues:tmnLg(mine,e.id),head:tmnHead(c2,e.k,vars(lc))},fresh)}
  else if(theirs.length){const k=e.k+':opp',oc=e.td?'oppTd':'opp';tmnAdd({...base,k,type:'opp',cls:oc,
    leagues:theirs.map(o=>({key:o.c.key,name:o.c.name,st:true,wp0:TMN.prev[o.c.key]?TMN.prev[o.c.key].wp:null,wp1:o.c.opp?o.c.opp.wp:null,their:true})),head:tmnHead(oc,k,vars(lc))},fresh)}}
function tmnAdd(ev,fresh){if(TMN.fired.has(ev.k))return;TMN.fired.add(ev.k);ev.at=ev.at||Date.now();TMN.items.unshift(ev);fresh.push(ev)}
/* a banner only for leagues with banners on, and only when he's in your lineup there */
function tmnShould(ev){if(typeof USER!=='undefined'&&!USER)return false;const on=ev.leagues.filter(l=>tmnOn(l.key));
  if(ev.type==='opp')return tmnNotif().opp&&on.length>0;if(ev.type==='minj')return (ev.cls==='myinj'||ev.cls==='myworse')&&on.some(l=>l.st);if(ev.type==='play')return on.some(l=>l.st);return on.length>0}

/* ---------- your players' injuries ----------
   Every status on your rosters is remembered (across reloads and weeks), so a change made while the site was closed
   still lands in the feed the next time you open it. Players you just added don't count as new injuries. */
const TMN_SEV=['','Q','D','O','SUS','PUP','IR'],TMN_ST_LS='tm-news-st-v1';
const tmnSev=s=>Math.max(0,TMN_SEV.indexOf(s||''));
function tmnMyInj(Ls,fresh,at){let snap=null;try{snap=JSON.parse(localStorage.getItem(TMN_ST_LS)||'null')}catch(e){}
  const now={},mine={};Ls.forEach(c=>c.roster.forEach(id=>{if(!byId[id]||byId[id].pos==='DST')return;now[id]=stOf(id)||'';(mine[id]=mine[id]||[]).push({c,st:c.starters.has(id)})}));
  if(snap&&snap.st)Object.keys(now).forEach(id=>{const was=snap.st[id],s=now[id];if(was===undefined||was===s)return;const p=byId[id];
    const cls=!was?'myinj':!s?'myclear':tmnSev(s)>tmnSev(was)?'myworse':'mybetter',lbl=x=>(ST_LABEL[x]||x).toLowerCase();
    const head=cls==='myclear'?`${p.n} is off the injury report.`:s==='IR'?`${p.n} has been placed on injured reserve.`:s==='O'?(cls==='myinj'?`${p.n} has been ruled out.`:`${p.n} downgraded to out.`):
      cls==='myinj'?`${p.n} is hurt. He's now ${lbl(s)}.`:cls==='myworse'?`${p.n} downgraded to ${lbl(s)}.`:`${p.n} upgraded to ${lbl(s)}.`;
    const n=NOTES[id],note=n&&n.note?n.note:p.inj||'';
    tmnAdd({k:`minj:${id}:${was}>${s}:${WEEK}`,type:'minj',cls,pid:id,st:s,was,at,head,sub:[was?`Was ${lbl(was)}`:'',note].filter(Boolean).join(' · '),
      leagues:mine[id].map(o=>({key:o.c.key,name:o.c.name,st:o.st,bench:!o.st}))},fresh)});
  try{localStorage.setItem(TMN_ST_LS,JSON.stringify({st:now,at}))}catch(e){}}
/* every hurt player on your rosters, any league, starter or bench */
function tmnInjured(Ls){const inj={};Ls.forEach(c=>{if(TMN.lg!=='all'&&c.key!==TMN.lg)return;c.roster.forEach(id=>{const s=stOf(id),p=byId[id];if(!s||!p||p.pos==='DST')return;
  (inj[id]=inj[id]||{id,s,L:[]}).L.push({c,st:c.starters.has(id)})})});
  return Object.values(inj).sort((a,b)=>tmnSev(b.s)-tmnSev(a.s)||(b.L.some(l=>l.st)?1:0)-(a.L.some(l=>l.st)?1:0))}

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

/* ---------- clips → the play they show ----------
   Each clip goes to at most one play, and only when it clearly shows that play: same player, same game,
   matching yardage in the title (or the only big play he had that game), right kind of play, posted after it happened. */
const TMN_TD=/\b(touchdowns?|td|tds|scores?|end zone|house|pay ?dirt)\b/i,TMN_RUSH=/\b(runs?|rush(es|ing)?|scampers?|bursts?|carr(y|ies)|breaks? (free|loose)|jukes?|hurdles?)\b/i,TMN_REC=/\b(catch(es)?|grabs?|receptions?|hauls?|snags?|deep|bombs?|dimes?|toe-tap|one-handed|connects?|pass(es)?)\b/i;
let TMN_CM={key:'',map:new Map(),used:new Set()};
function tmnClipMap(){if(typeof FEED==='undefined'||!FEED||typeof playerVideos!=='function')return TMN_CM;const evs=TMN.items.filter(e=>(e.type==='play'||e.type==='opp')&&e.pid&&e.kind);
  const key=FEED_AT+'|'+evs.length+'|'+(evs[0]&&evs[0].k);if(TMN_CM.key===key)return TMN_CM;
  const cand=[],byP={};evs.forEach(e=>(byP[e.pid+'|'+(e.ev||'')]=byP[e.pid+'|'+(e.ev||'')]||[]).push(e));
  evs.forEach(e=>{const p=byId[e.pid];if(!p)return;const solo=byP[e.pid+'|'+(e.ev||'')].length===1,t0=(e.wall&&Date.parse(e.wall))||e.at||0;
    playerVideos(p).forEach(v=>{if(v.week!==WEEK||v.game)return;if(v.ev&&e.ev&&String(v.ev)!==String(e.ev))return;const t=v.title+' '+(v.desc||'');
      const ny=(v.title.match(/\b(\d{1,2})[- ]?(?:yards?|yds?)\b/i)||[])[1];let sc=0;
      const ord=(t.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th)\b(?= (?:td|touchdown|score))/i)||[])[1],on=ord?{first:1,'1st':1,second:2,'2nd':2,third:3,'3rd':3,fourth:4,'4th':4}[ord.toLowerCase()]:0;
      if(ny){if(!e.yds||Math.abs(+ny-e.yds)>1)return;sc+=5}else if(on&&e.td){if(on!==e.tdNum)return;sc+=4}else if(!solo)return;
      const isTd=TMN_TD.test(t);if(e.td&&isTd)sc+=2;else if(!e.td&&isTd&&!ny)return;else if(e.td&&!isTd)sc-=1;
      const r=TMN_RUSH.test(t),c=TMN_REC.test(t);if(e.kind==='rush'?r:c)sc+=1;if(e.kind==='rush'?c&&!r:r&&!c)sc-=2;
      const ta=Date.parse(v.at||0);if(ta&&t0){if(ta<t0-10*60e3)return;sc+=ta-t0<4*3600e3?1:-1}
      if(v.ev&&e.ev)sc+=1;if(sc>=2)cand.push({e,v,sc})})});
  cand.sort((a,b)=>b.sc-a.sc);const map=new Map(),used=new Set();cand.forEach(({e,v})=>{if(map.has(e.k)||used.has(v.id))return;map.set(e.k,{...v,player:e.pid});used.add(v.id)});
  return TMN_CM={key,map,used}}

/* ---------- the News tab ---------- */
const TMN_F=[['all','All'],['big','Big plays'],['inj','Injuries'],['clips','Clips']];
function tmnMood(){const gs=LIVE&&LIVE.week===WEEK?Object.values(LIVE.games||{}):[];if(gs.some(g=>g.state==='in'))return 'live';if(gs.some(g=>g.state==='post'))return 'after';return 'quiet'}
const TMN_GEAR='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
function tmnRender(){const el=$('news-body');if(!el)return;tmnWeek();TMN.unread=0;
  if(typeof FEED!=='undefined'&&typeof loadFeed==='function'&&(!FEED||Date.now()-FEED_AT>4*60e3))Promise.resolve(loadFeed()).then(()=>{if(tab==='news'&&FEED)tmnRenderBody()});
  const Ls=tmnLeagues();if(TMN.lg!=='all'&&!Ls.some(c=>c.key===TMN.lg))TMN.lg='all';const mood=tmnMood();
  try{const fr=[];tmnMyInj(Ls,fr,Date.now());if(fr.length)tmnSave()}catch(e){}
  el.innerHTML=`<header class="tmn-head"><div class="tmn-head-t"><div class="kicker">Week ${WEEK} · ${Ls.length>1?`all ${Ls.length} leagues`:'your league'}</div><h1>News${mood==='live'?' <span class="tmn-live"><span class="live-dot on"></span>Live</span>':''}</h1><p id="tmn-sum"></p></div>
      <a class="btn tmn-gear" href="#account-leagues" data-notif-go="1" title="Notification settings">${TMN_GEAR}<span>Notifications</span></a></header>
    <div class="tmn-bar"><div class="seg" role="group" aria-label="Show" id="tmn-seg"></div>
      ${Ls.length>1?`<select id="tmn-lg" class="tmn-lgsel" aria-label="League"><option value="all">All leagues</option>${Ls.map(c=>`<option value="${esc(c.key)}" ${TMN.lg===c.key?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`:''}</div>
    <div class="tmn-feed" id="tmn-feed"></div>`;
  tmnRenderBody(Ls,mood)}
function tmnRenderBody(Ls,mood){const el=$('tmn-feed');if(!el)return;Ls=Ls||tmnLeagues();mood=mood||tmnMood();
  const inLg=l=>TMN.lg==='all'||l.some(x=>(x.key||x)===TMN.lg),f=TMN.f;tmnBuildClips(Ls);const CM=tmnClipMap();
  /* big plays, newest first */
  const evs=TMN.items.filter(e=>inLg(e.leagues)&&(e.type!=='opp'||tmnNotif().opp)&&e.type!=='minj');
  /* injuries: every hurt player on your rosters, plus status changes as they happen */
  const injList=tmnInjured(Ls),injUp=TMN.items.filter(e=>e.type==='minj'&&inLg(e.leagues));
  /* results, and trade and waiver signals for the league on screen */
  const res=Ls.filter(c=>(TMN.lg==='all'||c.key===TMN.lg)&&c.opp&&c.opp.final);
  const sig=(TMN.lg==='all'||TMN.lg===S.leagueKey)&&typeof alertsList==='function'?alertsList().filter(a=>/^(sell|pick)-/.test(a.k)).slice(0,4):[];
  const clipsAll=typeof CLIPS!=='undefined'?CLIPS.filter(v=>!v.game):[];
  /* summary line + filter counts */
  const nBig=evs.length,nInj=injList.length,nClip=clipsAll.length,cnt={all:0,big:nBig,inj:nInj,clips:nClip};
  const sm=$('tmn-sum');if(sm){const bits=[nBig?`${nBig} big play${nBig>1?'s':''}`:'',nInj?`${nInj} injured player${nInj>1?'s':''}`:'',CM.map.size?`${CM.map.size} with video`:''].filter(Boolean);
    sm.textContent=bits.length?bits.join(' · '):mood==='quiet'?'Injuries, waiver and trade signals until kickoff. Big plays land here live on game day.':'Waiting on the first big play.'}
  const seg=$('tmn-seg');if(seg)seg.innerHTML=TMN_F.map(([k,l])=>`<button type="button" data-nf="${k}" aria-pressed="${f===k}">${l}${cnt[k]?` <span class="tmn-n">${cnt[k]}</span>`:''}</button>`).join('');
  const sec=(id,title,note,html)=>html?`<section class="tmn-sec" data-sec="${id}"><div class="tmn-sec-h"><h2>${title}</h2>${note?`<span class="note">${note}</span>`:''}</div>${html}</section>`:'';
  const S_big=()=>evs.length?`<ol class="tmn-tl">${tmnGroups(evs).map(g=>`<li class="tmn-day"><span>${g.label}</span></li>${g.items.map(e=>`<li>${tmnEvCard(e,CM.map.get(e.k))}</li>`).join('')}`).join('')}</ol>`:'';
  const S_injUp=()=>injUp.length?`<ol class="tmn-tl">${tmnGroups(injUp).map(g=>`<li class="tmn-day"><span>${g.label}</span></li>${g.items.map(e=>`<li>${tmnEvCard(e)}</li>`).join('')}`).join('')}</ol>`:'';
  const S_inj=()=>injList.length?`<div class="tmn-injg">${injList.map(tmnInjCard).join('')}</div>`:'';
  const S_res=()=>res.map(tmnResultCard).join('');
  const S_sig=()=>sig.map(tmnSigCard).join('');
  const S_clips=()=>tmnClipsGrid(clipsAll,CM);
  let html='';
  if(f==='big')html=sec('big','Big plays',nBig?'Newest first':'',S_big());
  else if(f==='inj')html=sec('injup','Latest updates',injUp.length?'Newest first':'',S_injUp())+sec('inj','Your injured players',nInj?'Every league, starters and bench':'',S_inj());
  else if(f==='clips')html=sec('clips','Clips',nClip?`${CM.map.size} matched to a play · official NFL and team channels`:'',S_clips());
  else{const parts={big:sec('big','Big plays','',S_big()),inj:sec('inj','Injuries',nInj?'Your hurt players, every league':'',S_injUp()+S_inj()),res:sec('res','Results','',S_res()),sig:sec('sig','Trade and waiver signals','',S_sig())};
    const order=mood==='live'?['big','inj','res','sig']:mood==='after'?['res','big','sig','inj']:['inj','sig','big','res'];html=order.map(k=>parts[k]).join('')}
  const empty={all:['Nothing yet this week','When one of your players breaks a long run, catches a deep ball, scores again or clinches your week, it lands here and pops up wherever you are on the site.'],
    big:['No big plays yet','Long runs, deep catches, touchdowns, monster games, lead changes and clinchers for your starters show up here as they happen.'],
    inj:['Everyone is healthy','Any player on your rosters who gets hurt shows up here right away, with every status change and the latest news on him until he\'s back.'],
    clips:['No clips yet','Clips of your players show up here as games are played. When a clip shows one of their big plays, it is attached to that play too.']}[f];
  const lastWk=TMN.last&&TMN.last.items.length&&(f==='all'||f==='big')?`<details class="tmn-last"><summary>Week ${TMN.last.week} big plays <span class="tmn-n">${TMN.last.items.length}</span></summary><div class="tmn-last-l">${TMN.last.items.filter(e=>inLg(e.leagues)).slice(0,30).map(e=>tmnEvCard(e,null,true)).join('')}</div></details>`:'';
  el.innerHTML=(html||`<div class="card tmn-empty"><h2>${empty[0]}</h2><p class="note">${empty[1]}</p></div>`)+lastWk;
  if(TMN.focus){const k=TMN.focus;TMN.focus=null;const it=el.querySelector(`[data-nkf="${CSS.escape(k)}"]`);if(it){it.classList.add('focus');setTimeout(()=>it.scrollIntoView({behavior:'smooth',block:'center'}),40);setTimeout(()=>it.classList.remove('focus'),2600)}}}
/* day headers for the timeline */
function tmnGroups(evs){const out=[],today=new Date().toDateString(),yest=new Date(Date.now()-864e5).toDateString();
  evs.forEach(e=>{const d=new Date(e.at||Date.now()),ds=d.toDateString(),label=ds===today?'Today':ds===yest?'Yesterday':d.toLocaleDateString([], {weekday:'long'});
    let g=out[out.length-1];if(!g||g.label!==label)out.push(g={label,items:[]});g.items.push(e)});return out}
function tmnClock(t){return t?new Date(t).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):''}
function tmnEvCard(e,clip,old){const [lbl,tone]=TMN_LBL[e.cls]||['News','accent'],p=e.pid&&byId[e.pid];
  const lg=(e.leagues||[]).map(l=>{const d=l.wp0!=null&&l.wp1!=null&&!l.bench?Math.round((l.wp1-l.wp0)*100):null;
    return `<span class="tmn-lchip${l.bench?' bench':''}${l.their?' their':''}">${esc(l.name)}${l.bench?' · bench':''}${l.wp1!=null&&!l.bench?` · <b>${Math.round(l.wp1*100)}%</b>${d?` <em class="${d>0?'up':'dn'}">${d>0?'▲':'▼'}${Math.abs(d)}</em>`:''}`:''}</span>`}).join('');
  const showPts=e.pts!=null&&(e.type==='play'||e.type==='opp'),big=e.cls==='game'||e.cls==='gameX';
  const v=clip?`<div class="tmn-vid">${tmnClipThumb(clip)}</div>`:'';
  const tot=p&&(e.type==='play'||e.type==='opp')&&!big?(old?e.tot:tmnPts(e.pid,tmnScOf(e))):null,gm=p&&!old&&LIVE&&LIVE.games&&LIVE.games[p.t];
  const totH=tot!=null?`<span class="tmn-tot"><b class="num">${f1(tot)}</b> pts ${gm&&gm.state==='post'?'final':'so far'}</span>`:'';
  return `<article class="tmn-ev tone-${tone}${e.type==='opp'?' their':''}${e.type==='clinch'?' clinch':''}${v?' has-vid':''}" data-nkf="${esc(e.k)}">
    <div class="tmn-ev-rail"><time>${tmnClock(e.wall?Date.parse(e.wall)||e.at:e.at)}</time>${e.q?`<small>Q${e.q}${e.sub&&/Q\d (\S+)/.test(e.sub)?' '+e.sub.match(/Q\d (\S+)/)[1]:''}</small>`:''}</div>
    <div class="tmn-ev-card"><div class="tmn-ev-top"><span class="tmn-lbl ${tone}">${lbl}</span>${showPts?`<b class="tmn-ev-pts num">${big?'':'+'}${f1(e.pts)}<small>${big?' pts total':' pts'}</small></b>`:''}</div>
      <div class="tmn-ev-main"><div class="tmn-b-av">${p?av(p):`<span class="tmn-seal">W</span>`}</div><div class="tmn-ev-txt"><h3>${esc(e.head)}</h3>${e.sub?`<p>${esc(e.sub)}</p>`:''}${lg?`<div class="tmn-lgs">${lg}</div>`:''}</div>${v}</div>
      <div class="tmn-ev-f">${totH}${p?`<button class="linkish" data-open="${p.id}">Player card</button>`:''}${e.txt?`<span class="tmn-txt" title="${esc(e.txt)}">${esc(e.txt)}</span>`:''}</div></div></article>`}
/* a clip thumb wired to the viewer (the clip is added to CLIPS so the viewer can open it) */
function tmnClipThumb(v){if(typeof CLIPS!=='undefined'&&!CLIPS.some(c=>c.id===v.id))CLIPS.push(v);
  return `<span class="tmn-vid-l">Watch the play</span>${thumbHtml(v,'xs')}`}
function tmnClipsGrid(list,CM){if(!list.length)return '';const playOf={};CM.map.forEach((v,k)=>playOf[v.id]=TMN.items.find(e=>e.k===k));
  const sorted=[...list].sort((a,b)=>(playOf[b.id]?1:0)-(playOf[a.id]?1:0));
  return `<div class="tmn-cgrid">${sorted.slice(0,40).map(v=>{const e=playOf[v.id];return `<div class="tmn-cl${e?' on':''}">${thumbHtml(v,'sm')}${e?`<button class="tmn-cl-play linkish" data-nk-go="${esc(e.k)}">${esc(e.head)}</button>`:''}</div>`}).join('')}</div>`}
function tmnWhen(t){const d=new Date(t),m=(Date.now()-t)/60e3;return m<1?'Just now':m<60?Math.round(m)+'m ago':d.toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'})}
function tmnScOf(e){const k=e.leagues&&e.leagues[0]&&e.leagues[0].key,c=k&&k!==S.leagueKey&&S.leagues&&S.leagues.find(l=>l.key===k),snap=c&&c.snap;
  return {...BASE_SC,...(((snap||S).league&&(snap||S).league.sc)||{})}}
function tmnInjCard(x){const p=byId[x.id],n=NOTES[x.id],sev=tmnSev(x.s),out=sev>=3,tone=out?'bad':'warn',gm=LIVE&&LIVE.week===WEEK&&LIVE.games&&LIVE.games[p.t],starts=x.L.some(l=>l.st);
  const head=x.s==='IR'?`${p.n} is on injured reserve.`:x.s==='O'?`${p.n} is out this week.`:x.s==='D'?`${p.n} is doubtful.`:x.s==='Q'?`${p.n} is questionable.`:`${p.n}: ${ST_LABEL[x.s]||x.s}.`;
  const what=p.inj&&!(n&&n.note&&n.note.includes(p.inj))?p.inj:'';
  const when=gm&&gm.start&&gm.state==='pre'?`Kicks off ${new Date(gm.start).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'})} ${tmnVs(gm)}`:'';
  const scored=gm&&gm.state!=='pre'&&LIVEST[x.id]?`${f1(tmnPts(x.id,x.L[0].c.sc))} pts ${gm.state==='post'?'final':'so far'}`:'';
  const stories=typeof playerNews==='function'?playerNews(p).slice(0,2):[];
  return `<article class="tmn-ev tone-${tone} flat tmn-inj"><div class="tmn-ev-card"><div class="tmn-ev-top"><span class="tmn-lbl ${tone}">${esc(ST_LABEL[x.s]||x.s)}</span>${n&&n.at?`<span class="note">Updated ${tmnWhen(Date.parse(n.at))}</span>`:''}</div>
    <div class="tmn-ev-main"><div class="tmn-b-av">${av(p)}</div><div class="tmn-ev-txt"><h3>${esc(head)}</h3>${what?`<p>${esc(what)}</p>`:''}${n&&n.note?`<p class="tmn-note">${esc(n.note)}</p>`:''}${when||scored?`<p>${esc(scored||when)}</p>`:''}
    ${stories.length?`<ul class="tmn-stories">${stories.map(a=>`<li>${a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>`:esc(a.title)}${a.at?` <span class="note">${tmnWhen(Date.parse(a.at))}</span>`:''}</li>`).join('')}</ul>`:''}
    <div class="tmn-lgs">${x.L.map(l=>`<span class="tmn-lchip${l.st?'':' bench'}">${esc(l.c.name)} · ${l.st?'starting':'bench'}</span>`).join('')}</div></div></div>
    <div class="tmn-ev-f"><button class="linkish" data-open="${p.id}">Player card</button>${starts&&sev>=3&&!(gm&&gm.state!=='pre')?'<a class="linkish" href="#team">Set lineup</a>':''}</div></div></article>`}
function tmnResultCard(c){const o=c.opp,w=o.now>o.onow,t=o.now===o.onow,m=Math.abs(o.now-o.onow);
  const head=w?(m<5?`Survived. You edged ${o.name} by ${f1(m)}.`:m>30?`Blowout. You buried ${o.name} by ${f1(m)}.`:`W. You beat ${o.name} by ${f1(m)}.`):t?`Dead even with ${o.name}.`:(m<5?`Heartbreaker. ${o.name} got you by ${f1(m)}.`:`${o.name} took this one by ${f1(m)}.`);
  return `<article class="tmn-ev tmn-res flat tone-${w?'good':t?'accent':'bad'}"><div class="tmn-ev-card"><div class="tmn-ev-main"><div class="tmn-b-av"><span class="tmn-seal ${w?'':'l'}">${w?'W':t?'T':'L'}</span></div>
    <div class="tmn-ev-txt"><h3>${esc(head)}</h3><p class="num">${esc(c.team||'You')} ${f1(o.now)} – ${f1(o.onow)} ${esc(o.name)}</p><div class="tmn-lgs"><span class="tmn-lchip">${esc(c.name)}</span></div></div></div></div></article>`}
function tmnSigCard(a){const p=a.open&&byId[a.open],sell=/^sell-/.test(a.k),tone=sell?'accent':'good';
  return `<article class="tmn-ev tone-${tone} flat"><div class="tmn-ev-card"><div class="tmn-ev-top"><span class="tmn-lbl ${tone}">${sell?'Trade signal':'Waiver signal'}</span></div><div class="tmn-ev-main"><div class="tmn-b-av">${p?av(p):''}</div><div class="tmn-ev-txt"><h3>${esc(a.t)}</h3><p>${esc(a.d)}</p>
    <div class="tmn-lgs"><span class="tmn-lchip">${esc(S.league&&S.league.name||'League')}</span></div></div></div><div class="tmn-ev-f">${p?`<button class="linkish" data-open="${p.id}">Player card</button>`:''}<a class="linkish" href="#${sell?'trade':'waivers'}">${sell?'Find a trade':'Waivers'}</a></div></div></article>`}
function tmnBuildClips(Ls){if(typeof FEED==='undefined'||!FEED||typeof buildClips!=='function')return;const ids=new Set();Ls.forEach(c=>{if(TMN.lg!=='all'&&c.key!==TMN.lg)return;c.roster.forEach(id=>ids.add(id))});buildClips([...ids].filter(id=>byId[id]).map(id=>({id})))}

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
  const ng=t.closest('[data-nk-go]');if(ng){TMN.f='big';TMN.focus=ng.dataset.nkGo;tmnRender();return}
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
