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
     Top of his position: once every game of the week is final, any player of yours who outscored everyone at his
       position (in that league's scoring) gets a special orange banner and a pinned card at the top of the Feed
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
  top:['{p} was the best {posn} in football in Week {w}.','Nobody at {posn} outscored {last} in Week {w}.','The #1 {posn} of Week {w} is on your team: {p}.','{last} topped every {posn} in the NFL with {pts} points.','Week {w}\'s top {posn}? {p}. {pts} points.'],
  second:['{p} finished second among every {posn} in football in Week {w}.','Only one {posn} outscored {last} in Week {w}.','#2 {posn} in the NFL in Week {w}: {p}, {pts} points.','{last} was the second-best {posn} of Week {w} with {pts}.'],
  topAll:['{p} outscored everyone in the NFL in Week {w}.','The top scorer in all of football in Week {w}: {p}, with {pts}.','No one in the league touched {last} in Week {w}. {pts} points, #1 overall.'],
};
const TMN_LBL={mytrade:['Traded','accent'],mymove:['New team','accent'],clinch:['Clincher','gold'],clinch0:['Clincher','gold'],swing:['Lead change','good'],longtd:['Long touchdown','good'],td:['Touchdown','good'],td2:['Second TD','good'],td3:['Hat trick','good'],tdN:['Touchdown','good'],
  bigrun:['Breakaway','accent'],run:['Big run','accent'],catch:['Deep ball','accent'],game:['Going off','accent'],gameX:['Going off','accent'],oinj:['Opponent hurt','warn'],myinj:['New injury','bad'],myworse:['Downgraded','bad'],mybetter:['Upgraded','good'],myclear:['Cleared','good'],opp:['Against you','muted'],oppTd:['Against you','muted'],
  top:['#1 at his position','top'],second:['#2 at his position','silver'],topAll:['#1 in the NFL','top'],res:['Final','muted']};
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
    tmnAdd({k,type:'play',cls,pid:id,pts:hit.pts,pr:hit.pr,x,ev:gm&&gm.id,sub:[tmnOver(hit.pts,hit.pr),statLineTxt(p.pos,LIVEST[id]),tmnVs(gm)].filter(Boolean).join(' · '),leagues:tmnLg(mine,id),at,
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
  /* 5. finished matchups go into the Feed; 6. once the whole week is final, anyone of yours who topped his position */
  tmnResults(Ls,fresh,at);
  if(tmnWeekOver(WEEK,LIVE.games))tmnTopFind(WEEK,LIVEST,LIVE.games,Ls,null,true);
  /* remember this check for the next one */
  TMN.prevOpp=TMN.prevOpp||{};Ls.forEach(c=>{if(c.opp){TMN.prev[c.key]={...(TMN.prev[c.key]||{}),mu:c.opp.m-c.opp.om,wp:c.opp.wp};TMN.prevOpp[c.key]=[...new Set([...c.oppStarters,...(TMN.prevOpp[c.key]||[])])].filter(id=>{const p=byId[id],g=p&&LIVE.games[p.t];return c.oppStarters.has(id)||(g&&g.state!=='pre')})}});
  TMN.prevSt=JSON.parse(JSON.stringify(LIVEST||{}));Ls.forEach(c=>(TMN.prevOpp[c.key]||[]).forEach(id=>TMN.prevStat[id]=stOf(id)||''));Object.keys(own).forEach(id=>TMN.prevStat[id]=stOf(id)||'');
  TMN.first=false;
  if(fresh.length){tmnSave();fresh.filter(e=>!first&&tmnShould(e)).forEach(e=>tmnQueue(e,true));tmnPump();if(typeof renderAlerts==='function')renderAlerts();if(tab==='news')tmnRender()}
  tmnTopCatchUp(Ls);tmnTopBanners();
}catch(err){console.warn('news tick',err)}}
const tmnOver=(pts,pr)=>pr>0&&pts-pr>=.5?`Scored ${f1(pts-pr)} over projected`:'';
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
function tmnShould(ev){if(typeof USER!=='undefined'&&!USER)return false;if(ev.type==='res'||ev.quiet)return false;const on=ev.leagues.filter(l=>tmnOn(l.key));
  if(ev.type==='opp')return tmnNotif().opp&&on.length>0;if(ev.type==='minj')return (ev.cls==='myinj'||ev.cls==='myworse')&&on.some(l=>l.st);if(ev.type==='play')return on.some(l=>l.st);return on.length>0}

/* ---------- your players' injuries ----------
   Every status on your rosters is remembered (across reloads and weeks), so a change made while the site was closed
   still lands in the feed the next time you open it. Players you just added don't count as new injuries. */
const TMN_SEV=['','Q','D','O','SUS','PUP','IR'],TMN_ST_LS='tm-news-st-v1';
const tmnSev=s=>Math.max(0,TMN_SEV.indexOf(s||''));
/* a status that flips one way and straight back (two feeds disagreeing, or a feed's own blip) isn't news: both go */
const TMN_FLIP=6*3600e3;
function tmnFlipClean(){const L=TMN.items,drop=new Set();L.forEach((a,i)=>{if(a.type!=='minj'||drop.has(a))return;
  const b=L.find((x,j)=>j!==i&&!drop.has(x)&&x.type==='minj'&&x.pid===a.pid&&(x.was||'')===(a.st||'')&&(x.st||'')===(a.was||'')&&Math.abs((x.at||0)-(a.at||0))<TMN_FLIP);if(b){drop.add(a);drop.add(b)}});
  if(drop.size){TMN.items=L.filter(e=>!drop.has(e));TMN.queue=TMN.queue.filter(e=>!drop.has(e));TMN.chips=TMN.chips.filter(c=>![...drop].some(e=>e.k===c.k));tmnPaintChips();tmnSave()}return drop.size}
function tmnMyInj(Ls,fresh,at){tmnFlipClean();
  /* only once the live feed has set every status (see liveStatus in app.js): the nightly data is a placeholder, and
     comparing it with the live feed is what made a player "hurt" and "off the report" at the same moment */
  if(typeof STATUS==='undefined'||!STATUS.live)return;
  let snap=null;try{snap=JSON.parse(localStorage.getItem(TMN_ST_LS)||'null')}catch(e){}
  if(snap&&snap.src!==STATUS.src)snap=null;   /* switched feeds (say, an ESPN-only user added a Sleeper league): start over quietly */
  const now={},mine={};Ls.forEach(c=>c.roster.forEach(id=>{if(!byId[id]||byId[id].pos==='DST')return;now[id]=stOf(id)||'';(mine[id]=mine[id]||[]).push({c,st:c.starters.has(id)})}));
  if(snap&&snap.st)Object.keys(now).forEach(id=>{const was=snap.st[id],s=now[id];if(was===undefined||was===s)return;const p=byId[id];
    const cls=!was?'myinj':!s?'myclear':tmnSev(s)>tmnSev(was)?'myworse':'mybetter',lbl=x=>(ST_LABEL[x]||x).toLowerCase();
    const head=cls==='myclear'?`${p.n} is off the injury report.`:s==='IR'?`${p.n} has been placed on injured reserve.`:s==='O'?(cls==='myinj'?`${p.n} has been ruled out.`:`${p.n} downgraded to out.`):
      cls==='myinj'?`${p.n} is hurt. He's now ${lbl(s)}.`:cls==='myworse'?`${p.n} downgraded to ${lbl(s)}.`:`${p.n} upgraded to ${lbl(s)}.`;
    const n=NOTES[id],note=n&&n.note?n.note:p.inj||'';
    tmnAdd({k:`minj:${id}:${was}>${s}:${WEEK}`,type:'minj',cls,pid:id,st:s,was,at,head,sub:[was?`Was ${lbl(was)}`:'',note].filter(Boolean).join(' · '),
      leagues:mine[id].map(o=>({key:o.c.key,name:o.c.name,st:o.st,bench:!o.st}))},fresh)});
  tmnFlipClean();try{localStorage.setItem(TMN_ST_LS,JSON.stringify({st:now,at,src:STATUS.src}))}catch(e){}}
/* every hurt player on your rosters, any league, starter or bench */
function tmnInjured(Ls){const inj={};Ls.forEach(c=>{if(TMN.lg!=='all'&&c.key!==TMN.lg)return;c.roster.forEach(id=>{const s=stOf(id),p=byId[id];if(!s||!p||p.pos==='DST')return;
  (inj[id]=inj[id]||{id,s,L:[]}).L.push({c,st:c.starters.has(id)})})});
  return Object.values(inj).sort((a,b)=>tmnSev(b.s)-tmnSev(a.s)||(b.L.some(l=>l.st)?1:0)-(a.L.some(l=>l.st)?1:0))}

/* ---------- banners: arrive big, hold, shrink to a chip that stays 5 minutes (a #1 chip stays until Thursday) ---------- */
function tmnStage(){let s=$('tmn-stage');if(!s){document.body.insertAdjacentHTML('beforeend','<div class="tmn-stage" id="tmn-stage" aria-live="polite"></div><div class="tmn-chips" id="tmn-chips"></div>');s=$('tmn-stage')}return s}
function tmnQueue(ev,hold){TMN.unread++;TMN.queue.push(ev);if(!hold)tmnPump()}
function tmnPump(){clearTimeout(TMN.timer);if(TMN.showing||!TMN.queue.length)return;
  const wait=TMN.lastShow?TMN.gapFor-(Date.now()-TMN.lastShow):0;
  /* most important first (clincher, then crunch time), newest first; anything older than 3 minutes, or past the next two, goes straight to a chip */
  const pri=e=>e.type==='top'?4:e.type==='mytrade'?3.5:e.type==='clinch'?3:e.type==='swing'?2:1;TMN.queue.sort((a,b)=>pri(b)-pri(a)||b.at-a.at);
  TMN.queue=TMN.queue.filter((e,i)=>{if(e.type==='clinch'||e.type==='top'||(e.type==='mytrade'&&i<2)||(i<2&&Date.now()-e.at<=TMN_R.stale))return true;tmnChip(e);return false});
  if(!TMN.queue.length)return;if(wait>0&&TMN.queue[0].type!=='clinch'&&TMN.queue[0].type!=='top'){TMN.timer=setTimeout(tmnPump,wait);return}
  tmnShow(TMN.queue.shift())}
TMN.gapFor=TMN_R.gap;
function tmnBody(ev,big){const p=ev.pid&&byId[ev.pid],[lbl,tone]=TMN_LBL[ev.cls]||['News','accent'];
  const lg=ev.leagues.map(l=>{const d=l.wp0!=null&&l.wp1!=null&&!l.bench?Math.round((l.wp1-l.wp0)*100):null;
    return `<span class="tmn-lchip${l.bench?' bench':''}${l.their?' their':''}">${esc(l.name)}${l.bench?' · bench':''}${l.wp1!=null&&!l.bench?` · <b>${Math.round(l.wp1*100)}%</b>${d?` <em class="${d>0?'up':'dn'}">${d>0?'+':'−'}${Math.abs(d)}</em>`:''}`:''}</span>`}).join('');
  if(ev.type==='mytrade')return `<div class="tmn-b-av">${p?av(p,big?'lg':''):''}</div>
    <div class="tmn-b-main"><span class="tmn-lbl accent">${ev.how==='move'?'Your player changed teams':'Your player was traded'}</span><h3>${esc(ev.head)}</h3><p><span class="tmn-tr-route">${ev.from?`<b>${esc(ev.from)}</b><i aria-hidden="true">→</i>`:''}<b>${esc(ev.to)}</b></span> ${esc(ev.sub)}</p></div>`;
  if(ev.type==='top')return `<div class="tmn-b-av tmn-top-av"><i class="tmn-rays" aria-hidden="true"></i>${p?av(p,big?'lg':''):''}<span class="tmn-medal">#1</span></div>
    <div class="tmn-b-main"><span class="tmn-lbl top">${ev.overall?'#1 in the NFL':`#1 ${esc(tmnPosN(ev.pos))}`} · Week ${ev.week}</span><h3>${esc(ev.head)}</h3>${ev.sub?`<p>${esc(ev.sub)}</p>`:''}</div>
    <div class="tmn-b-pts"><b class="num">${f1(ev.pts)}</b><small>pts</small></div>`;
  return `<div class="tmn-b-av">${p?av(p,big?'lg':''):'<span class="tmn-seal">W</span>'}</div>
    <div class="tmn-b-main"><span class="tmn-lbl ${tone}">${lbl}</span><h3>${esc(ev.head)}</h3>${ev.sub?`<p>${esc(ev.sub)}</p>`:''}${lg?`<div class="tmn-lgs">${lg}</div>`:''}</div>
    ${ev.pts!=null&&ev.type!=='clinch'&&ev.type!=='swing'&&ev.type!=='oinj'?`<div class="tmn-b-pts"><b class="num">${ev.type==='play'&&(ev.cls==='game'||ev.cls==='gameX')?'':'+'}${f1(ev.pts)}</b><small>pts</small></div>`:''}`}
function tmnShow(ev){const s=tmnStage(),tone=(TMN_LBL[ev.cls]||[])[1]||'accent',hold=ev.type==='clinch'?TMN_R.clinchHold:ev.type==='top'?14e3:TMN_R.hold;
  TMN.showing=ev;TMN.lastShow=Date.now();
  s.innerHTML=`<div class="tmn-ban tone-${tone} ${ev.type==='clinch'?'clinch':''}${ev.type==='top'?' top'+(ev.overall?' all':''):''}" role="status" data-nk="${esc(ev.k)}" tabindex="0">${ev.type==='top'?tmnConfetti():''}${tmnBody(ev,true)}<button class="tmn-x" type="button" data-nx="1" aria-label="Dismiss">×</button><i class="tmn-timer" style="animation-duration:${hold}ms"></i></div>`;
  const b=s.firstElementChild;requestAnimationFrame(()=>b.classList.add('in'));
  TMN.hideT=setTimeout(()=>tmnMin(),hold)}
function tmnMin(dismiss){clearTimeout(TMN.hideT);const s=$('tmn-stage'),b=s&&s.firstElementChild,ev=TMN.showing;TMN.showing=null;if(ev&&dismiss)tmnTopDismiss(ev.k);
  if(b){b.classList.remove('in');b.classList.add(dismiss?'out':'min');setTimeout(()=>{if(b.parentNode)b.remove()},420)}
  if(ev&&!dismiss)setTimeout(()=>tmnChip(ev),260);setTimeout(tmnPump,500)}
function tmnChip(ev){const box=$('tmn-chips')||(tmnStage(),$('tmn-chips'));TMN.chips=TMN.chips.filter(c=>c.k!==ev.k);TMN.chips.push({k:ev.k,until:ev.type==='top'||ev.type==='mytrade'?(ev.at||Date.now())+TMN_POP:Date.now()+TMN_R.chipLife});tmnPaintChips()}
function tmnPaintChips(){const box=$('tmn-chips');if(!box)return;TMN.chips=TMN.chips.filter(c=>c.until>Date.now());const show=TMN.chips.slice(-1),more=TMN.chips.length-show.length;
  box.innerHTML=show.map(c=>{const ev=TMN.items.find(x=>x.k===c.k)||tmnTop().items.find(x=>x.k===c.k);if(!ev)return '';const p=ev.pid&&byId[ev.pid],tone=(TMN_LBL[ev.cls]||[])[1]||'accent';
    return `<div class="tmn-chip tone-${tone}${ev.type==='top'?' top':''}" data-nk="${esc(ev.k)}" role="button" tabindex="0"><i></i><span>${p?esc(p.pos==='DST'?p.n:tmnShort(p.n)):'Your week'}</span>${ev.type==='top'?`<b>#1 ${esc(ev.overall?'overall':tmnPosN(ev.pos))}</b>`:ev.pts!=null&&ev.type==='play'?`<b class="num">${ev.cls==='game'||ev.cls==='gameX'?'':'+'}${f1(ev.pts)}</b>`:`<b>${esc((TMN_LBL[ev.cls]||['News'])[0])}</b>`}<button type="button" data-nxc="${esc(ev.k)}" aria-label="Dismiss">×</button></div>`}).join('')
    +(more>0?`<a class="tmn-chip more" href="#news" aria-label="${more} more alerts in News">+${more}</a>`:'');
  clearTimeout(TMN.chipT);if(TMN.chips.length)TMN.chipT=setTimeout(tmnPaintChips,15e3)}
function tmnUnread(){return TMN.unread||0}
function tmnOpen(k){TMN.focus=String(k).startsWith('mytr:')?'tr:'+String(k).split(':')[1]:k;tmnTopDismiss(k);TMN.chips=TMN.chips.filter(c=>c.k!==k);tmnPaintChips();if(TMN.showing&&TMN.showing.k===k)tmnMin(true);
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

/* ---------- finished matchups: one Feed item per league once every starter is done ---------- */
function tmnResults(Ls,fresh,at){Ls.forEach(c=>{const o=c.opp;if(!o||!o.final)return;const k='res:'+c.key+':'+WEEK;if(TMN.fired.has(k))return;
  tmnAdd({k,type:'res',cls:'res',lkey:c.key,leagues:[{key:c.key,name:c.name}],now:o.now,onow:o.onow,oname:o.name,team:c.team,at},fresh)})}

/* ---------- top of his position ----------
   Runs once per week, after every game is final. Ranks everyone who played at each position in that league's scoring.
   If the #1 is on one of your rosters he gets the orange treatment: a banner, a bell count and a pinned card in the Feed.
   Kept in its own store so it survives the week rolling over. A visitor who wasn't on the site when the week ended
   gets it on their next visit (fetched from /api/live for last week). */
const TMN_TOP_LS='tm-news-top-v1';
function tmnTop(){if(TMN.top)return TMN.top;try{TMN.top=JSON.parse(localStorage.getItem(TMN_TOP_LS)||'null')}catch(e){}TMN.top=TMN.top||{done:[],items:[]};return TMN.top}
function tmnTopSave(){const T=tmnTop();T.done=T.done.slice(-8);T.done2=(T.done2||[]).slice(-8);T.items=T.items.slice(0,30);try{localStorage.setItem(TMN_TOP_LS,JSON.stringify(T))}catch(e){}}
const tmnPosN=pos=>pos==='DST'?'defense':pos==='K'?'kicker':pos||'';
/* the #1 stays up from the moment the week ends (Monday night) until the very start of Thursday, in the viewer's own
   time zone: pinned at the top of the Feed and as a corner chip on every page. Then it moves into the timeline. */
function tmnTopUntil(e){const d=new Date(e.at||Date.now());d.setHours(0,0,0,0);do d.setDate(d.getDate()+1);while(d.getDay()!==4);
  const w=tmnWeekThu(e.week);return w?Math.min(d.getTime(),w):d.getTime()}
/* the Thursday that starts week w+1 (midnight, local), from this week's kickoff dates. Used as a hard cap so a #1 saved
   with a late timestamp (older builds stamped when the browser noticed it, not when the week ended) can't outlive its week */
function tmnWeekThu(w){if(!w||typeof KICK==='undefined'||typeof DATA==='undefined')return 0;
  const ds=Object.values(KICK).map(k=>k&&k[1]).filter(Boolean).sort();if(!ds.length)return 0;
  const d=new Date(ds[0]+'T00:00:00');if(isNaN(d))return 0;while(d.getDay()!==4)d.setDate(d.getDate()-1);
  d.setDate(d.getDate()+7*(w+1-DATA.week));return d.getTime()}
const tmnTopLive=e=>e&&e.type==='top'&&Date.now()<tmnTopUntil(e);
/* closing the #1 banner or chip (or tapping through to it) keeps it off the corner until Thursday; it stays pinned in News */
function tmnTopDismiss(k){const e=tmnTop().items.find(x=>x.k===k&&(x.type==='top'||x.type==='mytrade'));if(e&&!e.dis){e.dis=true;tmnTopSave()}}
const TMN_SEC_POS=['QB','RB','WR','TE'];
/* the week is over only when every team with a game that week (from the schedule, so Monday night counts even
   before ESPN lists it) has a final, and the last of those games kicked off on Monday or later */
function tmnWeekOver(week,games){const gs=Object.values(games||{});if(!gs.length||!gs.every(g=>g.state==='post'))return false;
  const D=window.NFL_DATA,sch=D&&D.sched;if(sch){const need=Object.keys(sch).filter(t=>sch[t]&&sch[t][week-1]);if(need.some(t=>!games[t]||games[t].state!=='post'))return false}
  const last=Math.max(0,...gs.map(g=>Date.parse(g.start||0)||0));if(!last)return true;
  const day=new Date(last).toLocaleDateString('en-US',{weekday:'short',timeZone:'America/New_York'});return day==='Mon'||day==='Tue'}
function tmnTopFind(week,stats,games,Ls,fresh,live){const T=tmnTop();T.done2=T.done2||[];
  const do1=!T.done.includes(week),do2=!T.done2.includes(week);
  if((!do1&&!do2)||!Ls.length||(typeof USER!=='undefined'&&!USER))return;
  const gs=Object.values(games||{});if(!tmnWeekOver(week,games))return;
  const found={},sec={};
  Ls.forEach(c=>{const by={};Object.keys(stats||{}).forEach(id=>{const p=byId[id];if(!p||!stats[id])return;let pts=0;try{pts=linePts(stats[id],p.pos,c.sc)}catch(e){}(by[p.pos]=by[p.pos]||[]).push({id,pts})});
    let best=null;
    Object.entries(by).forEach(([pos,L])=>{L.sort((a,b)=>b.pts-a.pts);const a=L[0],b=L[1];if(!a||a.pts<=0)return;if(!best||a.pts>best.pts)best={...a,pos};
      const lg={key:c.key,name:c.name,st:live?c.starters.has(a.id):true,bench:false};
      /* #2 at QB, RB, WR or TE on one of your rosters: a silver card in the Feed, no banner */
      if(b&&b.pts>0&&TMN_SEC_POS.includes(pos)&&c.roster.has(b.id)){const y=sec[b.id]=sec[b.id]||{id:b.id,pos,pts:b.pts,first:a.id,gap:a.pts-b.pts,leagues:[]};
        y.leagues.push({...lg,st:live?c.starters.has(b.id):true,bench:live?!c.starters.has(b.id):false})}
      if(!c.roster.has(a.id))return;
      const x=found[a.id]=found[a.id]||{id:a.id,pos,pts:a.pts,second:b?b.id:null,gap:b?a.pts-b.pts:a.pts,leagues:[],overall:false};
      x.leagues.push({...lg,bench:live?!c.starters.has(a.id):false})});
    if(best&&found[best.id]&&found[best.id].leagues.some(l=>l.key===c.key))found[best.id].overall=true});
  /* when the week ended: the last kickoff plus a game's length (never in the future) */
  const lastKick=Math.max(0,...gs.map(g=>Date.parse(g.start||g.date||0)||0)),at=lastKick?Math.min(Date.now(),lastKick+3.4*3600e3):Date.now();
  /* a banner while it's news: right after the week ends, or before the next week's games start */
  const quiet=false;
  if(do1){T.done.push(week);
    Object.values(found).forEach(x=>{const p=byId[x.id],k='top:'+week+':'+x.id,cls=x.overall?'topAll':'top',sec=x.second&&byId[x.second];
      const ev={k,type:'top',cls,pid:x.id,pos:x.pos,pts:x.pts,gap:x.gap,second:x.second,overall:x.overall,week,leagues:x.leagues,at,quiet,
        sub:[sec?`${f1(x.gap)} ahead of ${sec.n}`:'',statLineTxt(x.pos,stats[x.id])].filter(Boolean).join(' · '),
        head:tmnHead(cls,k,tmnVars(p,null,{posn:tmnPosN(x.pos),w:week,pts:tmnN(x.pts),...(x.pos==='DST'?{last:p.n}:{})}))};
      if(!T.items.some(e=>e.k===k))T.items.unshift(ev)})}
  if(do2){T.done2.push(week);
    Object.values(sec).forEach(x=>{const p=byId[x.id],k='second:'+week+':'+x.id,one=byId[x.first];
      const ev={k,type:'second',cls:'second',pid:x.id,pos:x.pos,pts:x.pts,gap:x.gap,first:x.first,week,leagues:x.leagues,at,shown:true,quiet:true,
        sub:[one?`${f1(x.gap)} behind ${one.n}`:'',statLineTxt(x.pos,stats[x.id])].filter(Boolean).join(' · '),
        head:tmnHead('second',k,tmnVars(p,null,{posn:tmnPosN(x.pos),w:week,pts:tmnN(x.pts)}))};
      if(!T.items.some(e=>e.k===k))T.items.unshift(ev)})}
  tmnTopSave();if(do1)tmnTopBanners();else if(tab==='news'&&$('tmn-feed'))tmnRenderBody()}
/* pop each #1 banner once, as soon as someone is signed in to see it (the week can end before sign-in finishes loading) */
/* ---------- your players traded ----------
   Any player on one of your rosters who changed NFL teams in the last 7 days: one banner (or a corner chip if a
   bigger one is up), a row in the bell, and a louder card in the Feed. Each trade alerts once. */
function tmnMyTrades(){try{const Ls=tmnLeagues();return tmnTrades(Ls,tmnLeagueNews(Ls,[])).filter(x=>x.yours&&x.at>Date.now()-7*864e5)}catch(e){return []}}
function tmnTradeAlerts(){if(typeof USER!=='undefined'&&!USER)return;const T=tmnTop(),Ls=tmnLeagues();T.trd=T.trd||[];let n=0;
  tmnMyTrades().forEach(x=>{const p=byId[x.pid],k='mytr:'+x.pid+':'+x.to;if(!p||T.trd.includes(k))return;T.trd.push(k);n++;
    const L=Ls.filter(c=>c.roster.has(x.pid)).map(c=>({key:c.key,name:c.name,st:c.starters.has(x.pid)}));
    /* builds before this one alerted from the weekly store: those were already seen */
    const tn=typeof teamName==='function'?'the '+teamName(x.to):x.to;
    T.items.unshift({k,type:'mytrade',cls:x.how==='move'?'mymove':'mytrade',how:x.how,pid:x.pid,from:x.from,to:x.to,leagues:L,at:x.at,shown:TMN.fired.has(k),
      head:x.how==='move'?`${p.n} is now with ${tn}`:`${p.n} was traded to ${tn}`,sub:L.length>1?`Still on your roster in ${L.length} leagues`:'Still on your roster'})});
  if(n){T.trd=T.trd.slice(-60);tmnTopSave()}}
/* #1 finishes and your players' trades pop up the first time you're on the site after they happen (even if that's days
   later), then sit in the corner on every visit until you close them or 7 days have passed since it happened */
const TMN_POP=7*864e5;
const tmnPopOK=e=>(e.type==='top'||e.type==='mytrade')&&Date.now()-(e.at||0)<TMN_POP&&tmnShould({...e,quiet:false});
function tmnTopBanners(){if(typeof USER!=='undefined'&&!USER)return;tmnTradeAlerts();const T=tmnTop();
  const pops=T.items.filter(tmnPopOK),fresh=pops.filter(e=>!e.shown).sort((a,b)=>(a.type==='top'?0:1)-(b.type==='top'?0:1)||(b.overall-a.overall)||((b.pts||0)-(a.pts||0))||(b.at-a.at));
  let n=0;T.items.forEach(e=>{if(!e.shown&&(e.type==='top'||e.type==='mytrade')){e.shown=true;n++}});
  /* one #1 banner (the overall #1, else the biggest score; other #1s go to chips); every new trade of yours gets one too */
  let one=false;fresh.forEach(e=>{if(e.type==='top'&&one){TMN.unread++;tmnChip(e);return}if(e.type==='top')one=true;tmnQueue(e,true)});
  /* seen before, not closed, still inside 7 days: back in the corner */
  pops.forEach(e=>{if(e.dis||fresh.includes(e))return;if(TMN.chips.some(c=>c.k===e.k)||(TMN.showing&&TMN.showing.k===e.k)||TMN.queue.some(q=>q.k===e.k))return;tmnChip(e)});
  if(n)tmnTopSave();if(fresh.length){tmnPump();if(typeof renderAlerts==='function')renderAlerts()}if(n&&tab==='news'&&$('tmn-feed'))tmnRenderBody()}
async function tmnTopCatchUp(Ls){const w=WEEK-1,T=tmnTop();if((typeof USER!=='undefined'&&!USER)||w<1||(T.done.includes(w)&&(T.done2||[]).includes(w))||TMN.topBusy||Date.now()-(TMN.topAt||0)<10*60e3)return;
  Ls=Ls||tmnLeagues();if(!Ls.length)return;TMN.topBusy=true;TMN.topAt=Date.now();
  try{const r=await fetch('/api/live?week='+w+'&b='+Math.floor(Date.now()/600000));const j=r.ok?await r.json():null;
    if(j&&j.week===w&&j.games&&Array.isArray(j.players)){const st={};j.players.forEach(x=>{const p=x.pos==='DST'?byId['dst-'+String(x.t).toLowerCase()]:findExact(x.n);if(p&&p.pos===x.pos)st[p.id]=x.s});
      tmnTopFind(w,st,j.games,Ls,null,false)}}catch(e){}
  TMN.topBusy=false}
/* the most recent week anyone of yours topped his position */
function tmnTopNow(){return tmnTop().items.filter(tmnTopLive)}
/* older #1s and every #2 sit in the timeline with everything else (last 10 days) */
function tmnRankFeed(){const cut=Date.now()-10*864e5;return tmnTop().items.filter(e=>(e.type==='second'||(e.type==='top'&&!tmnTopLive(e)))&&(e.at||0)>cut)}
function tmnConfetti(){return `<span class="tmn-conf" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</span>`}

/* ---------- articles and videos about your players ----------
   /api/news?feed=… pulls injury and role stories for everyone on your rosters from ESPN, CBS Sports, Yahoo,
   ProFootballTalk, The Athletic, Pro Football Network, NFL Trade Rumors, RotoBaller and a Google News search per player
   (which spans dozens of local and national sites). Videos come from ESPN and the NFL's and teams' YouTube channels.
   The Feed keeps roughly 70% injury news and 30% role news: snaps, targets, depth chart, workload. */
const TMN_ART_LS='tm-news-art-v1';
const TMN_INJ=/\b(injur(y|ies|ed)|hurt|ruled out|out (for|vs\.?|against|sunday|monday|thursday|this week|indefinitely|again)|questionable|doubtful|injured reserve|placed on (ir|reserve)|activated|designated (him |for )?(to )?return|return(s|ed|ing)? (to|from) (practice|injury|ir)|did not practice|dnp|limited (in )?practice|limited participant|full participant|practic(e|ed|ing)|game-time decision|week-to-week|day-to-day|setback|mri|surgery|concussion|protocol|hamstring|ankle|knee|groin|calf|quad|shoulder|elbow|wrist|thumb|foot|toe|hip|ribs?|sprain(ed)?|strain(ed)?|torn|tear|fracture[d]?|illness|sidelined|status for|health(y)?)\b/i;
const TMN_ROLE=/\b(depth chart|snaps?|snap (share|count)|target share|targets|carries|touches|workload|role|usage|starter|starting|backup|lead back|bell-?cow|committee|split|rb1|wr1|wr2|te1|promoted|benched|demoted|elevated|first-team|reps|opportunit(y|ies)|volume|red zone|rotation|expected to (start|play|see)|featured|pecking order|takes over|steps? in|fills? in)\b/i;
const TMN_FLUFF=/\b(costume|halloween|podcast|mailbag|power rankings|odds|betting|picks against|mock draft)/i;
function tmnKind(t,d){if(TMN_FLUFF.test(t))return null;if(TMN_INJ.test(t))return 'inj';if(TMN_ROLE.test(t))return 'role';if(d&&TMN_INJ.test(d))return 'inj';if(d&&TMN_ROLE.test(d))return 'role';return null}
try{const c=JSON.parse(localStorage.getItem(TMN_ART_LS)||'null');if(c&&c.items&&Date.now()-c.at<12*3600e3)TMN.art={...c,at:c.at-10*60e3}}catch(e){}
function tmnArtPlayers(Ls){const m=new Map();Ls.forEach(c=>c.roster.forEach(id=>{const p=byId[id];if(!p||p.pos==='DST'||p.pos==='K')return;const x=m.get(id)||{id,st:false,inj:!!stOf(id)};if(c.starters.has(id))x.st=true;m.set(id,x)}));
  const rk=id=>(typeof V!=='undefined'&&V&&V.rank&&V.rank[id])||999;
  return [...m.values()].sort((a,b)=>(b.inj-a.inj)||(b.st-a.st)||(rk(a.id)-rk(b.id))).slice(0,40)}
async function tmnLoadArt(Ls){const L=tmnArtPlayers(Ls);if(!L.length||TMN.artBusy)return;
  const q=L.map(x=>{const p=byId[x.id];return [p.n,p.t,p.pos,x.inj?'i':''].join('|')}).join(';');
  if(TMN.art&&TMN.art.key===q&&Date.now()-TMN.art.at<10*60e3)return;TMN.artBusy=true;
  try{const r=await fetch('/api/news?feed='+encodeURIComponent(q)+'&b='+Math.floor(Date.now()/600000));const j=r.ok?await r.json():null;
    if(j&&Array.isArray(j.items)){TMN.art={key:q,at:Date.now(),items:j.items};try{localStorage.setItem(TMN_ART_LS,JSON.stringify(TMN.art))}catch(e){}}}catch(e){}
  TMN.artBusy=false;if(tab==='news')tmnRenderBody()}
/* ---------- same story, different outlet ----------
   Two headlines are the same story when most of their meaningful words match (the player's name and filler words
   don't count). Also compares the AI recap titles, since two outlets' different headlines often recap the same way.
   Used everywhere the Feed merges sources, so only one card per story ever shows. */
const TMN_STOP=new Set(['the','and','for','with','his','her','from','after','before','week','nfl','fantasy','football','game','games','vs','will','has','have','had','are','was','but','not','this','that','what','why','how','its','into','out','over','about','says','said','report','reports','update','news','latest','could','should','would','may','set','gets','get']);
const tmnWords=(s,skip)=>{const o=new Set();String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['’.]/g,'').replace(/[^a-z0-9]+/g,' ').split(' ').forEach(w=>{if(w.length>2&&!TMN_STOP.has(w)&&!(skip&&skip.has(w)))o.add(w.endsWith('s')&&w.length>4?w.slice(0,-1):w)});return o};
function tmnSimT(a,b,skip,same){const A=tmnWords(a,skip),B=tmnWords(b,skip);if(A.size<2||B.size<2)return false;let n=0;A.forEach(w=>B.has(w)&&n++);
  const r=n/Math.min(A.size,B.size);return same?(n>=2&&r>=.5):(n>=3&&r>=.6)}
/* subscriber-only stories (The Athletic, ESPN+, newspaper paywalls): no link, since the reader can't open them. The card's
   own title and points carry the news, and only the important ones get in: moves, and injury news with a real status */
const TMN_BIG_INJ=/\b(ruled out|out (for|vs\.?|against|sunday|monday|thursday|this week|indefinitely)|doubtful|injured reserve|placed on (ir|reserve)|to ir\b|activated|designated (him |for )?(to )?return|surgery|torn|tear|fracture[d]?|ruptured|season-ending|week-to-week|weeks? to (heal|recover)|out (\d+|several|multiple) (weeks|games)|concussion protocol|mri|setback|will (not )?play|expected to (play|return)|game-time decision)\b/i;
function tmnPayOK(x){if(!x.pay)return true;if(x.type==='trade'||x.type==='lg')return true;return x.kind==='inj'&&TMN_BIG_INJ.test((x.title||'')+' '+String(x.desc||'').slice(0,300))}
const tmnPayNote=x=>`<span class="tmn-src"><b>${esc(x.outlet||'Subscriber story')}</b> · subscribers only, so the key facts are here</span>`;
function tmnSameStory(a,b){if(!a||!b)return false;if(a.url&&a.url===b.url)return true;
  const same=a.pid&&a.pid===b.pid,pa=a.pid&&byId[a.pid],pb=b.pid&&byId[b.pid];
  /* a trade card and a story about that player's trade are the same news */
  if(same&&(a.kind==='trade'||a.type==='trade')&&(b.kind==='trade'||b.type==='trade'))return true;
  const skip=new Set([...(pa?tmnWords(pa.n):[]),...(pb?tmnWords(pb.n):[])]);
  const R=tmnRecaps(),ta=[a.title,R[a.url]&&R[a.url].t].filter(Boolean),tb=[b.title,R[b.url]&&R[b.url].t].filter(Boolean);
  if(!ta.length||!tb.length)return false;
  /* far apart in time is a new development, not a repeat */
  if(a.at&&b.at&&Math.abs(a.at-b.at)>4*864e5)return false;
  return ta.some(x=>tb.some(y=>tmnSimT(x,y,skip,same)))}
/* keeps the first of every group of matching stories (call with the list in priority order) */
function tmnDedupe(list){const keep=[];list.forEach(x=>{const i=keep.findIndex(k=>tmnSameStory(k,x));if(i<0)keep.push(x);
    else if(keep[i].pay&&!x.pay&&keep[i].type===x.type)keep[i]=x});return keep}

/* every story and video about your players (league filter applied), newest first */
function tmnStories(Ls){const ids=[];Ls.forEach(c=>{if(TMN.lg!=='all'&&c.key!==TMN.lg)return;c.roster.forEach(id=>{const p=byId[id];if(p&&p.pos!=='DST'&&!ids.includes(id))ids.push(id)})});
  const byName={},names=ids.map(id=>{const n=norm(byId[id].n);byName[n]=id;return [n,id]});
  const who=(t,ath)=>{if(ath&&ath.length){const a=ath.map(norm).find(x=>byName[x]);if(a)return byName[a]}const h=normT(t);const hit=names.find(([n])=>wordIn(h,n));return hit?hit[1]:null};
  const cut=Date.now()-10*864e5,out=[],seen=new Set();
  const add=x=>{if(!x.pid||!x.kind||!x.at||x.at<cut||!x.url||!tmnPayOK(x))return;const tk=norm(x.title).slice(0,70);if(seen.has(x.url)||seen.has(tk))return;seen.add(x.url);seen.add(tk);
    /* basically the same story as one already in: keep the first, credit the second outlet on it */
    const d=out.find(o=>tmnSameStory(o,x));if(d){
      /* the free version of a subscriber-only story takes its place */
      if(d.pay&&!x.pay){const o=d.outlet;Object.assign(d,{url:x.url,outlet:x.outlet,title:x.title,desc:x.desc||d.desc,img:x.img||d.img,pay:false,type:x.type});if(o&&!(d.also||[]).includes(o))d.also=[...(d.also||[]),o];return}
      if(x.outlet&&d.outlet!==x.outlet&&!(d.also||[]).includes(x.outlet))d.also=[...(d.also||[]),x.outlet];if(!d.img&&x.img)d.img=x.img;return}
    out.push(x)};
  (TMN.art&&TMN.art.items||[]).forEach(a=>add({type:a.video?'vid':'art',kind:a.kind,pid:byName[norm(a.n)],title:a.title,desc:a.desc,url:a.url,outlet:a.outlet,also:a.also||[],img:a.img,at:Date.parse(a.at||0),pay:!!a.pay}));
  if(typeof FEED!=='undefined'&&FEED){
    (FEED.news||[]).forEach(a=>{const pid=who(a.title+' '+(a.desc||''),a.athletes);add({type:a.type==='Media'?'vid':'art',kind:tmnKind(a.title,a.desc),pid,title:a.title,desc:a.desc&&a.desc!==a.title?a.desc.slice(0,700):'',url:a.url,outlet:a.pay?'ESPN+':'ESPN',also:[],img:a.img,at:Date.parse(a.at||0),pay:!!a.pay})});
    /* injury and role videos: coach and team updates on the NFL's and teams' channels, ESPN segments (not play clips) */
    (FEED.videos||[]).forEach(v=>{const pid=who(v.title,v.athletes);if(!pid)return;const k=tmnKind(v.title,'');if(!k)return;
      add({type:'vid',kind:k,pid,title:v.title,desc:'',url:v.url,outlet:v.src==='espn'?'ESPN':chName(v)+' on YouTube',also:[],img:v.thumb,at:Date.parse(v.at||0),dur:v.dur})})}
  return out.sort((a,b)=>b.at-a.at)}
/* the Feed's share: about 70% injury news, 30% role news, at most 3 per player */
function tmnPickStories(all){const per={},ok=x=>(per[x.pid]=(per[x.pid]||0)+1)<=3,hurt=x=>stOf(x.pid)?1:0;
  const inj=all.filter(x=>x.kind==='inj').sort((a,b)=>hurt(b)-hurt(a)||b.at-a.at).filter(ok).slice(0,17);
  const role=all.filter(x=>x.kind==='role').filter(ok).slice(0,Math.max(4,Math.ceil(inj.length*3/7)));
  return [...inj,...role].map(x=>({...x,k:'s:'+x.url})).sort((a,b)=>b.at-a.at)}
function tmnStoriesFor(pid,all){return all.filter(x=>x.pid===pid&&x.type==='art')}

/* ---------- injury opportunities: who gets the work while a starter is out ----------
   From the same model the Rankings "UP" badge uses (OPPS in app.js): carries and targets the missing player leaves
   behind, split by depth chart and by what actually happened in games he missed. Ownership is for the league on screen. */
function tmnOppGroups(Ls){if(typeof OPPS==='undefined'||!OPPS.length)return [];const mine=new Set();Ls.forEach(c=>c.roster.forEach(id=>mine.add(id)));
  const g={};OPPS.forEach(o=>{if(!byId[o.id]||!byId[o.from])return;(g[o.from]=g[o.from]||{from:o.from,long:o.long,rows:[]}).rows.push(o)});
  const own=id=>OWN[id]===S.me?'mine':OWN[id]==null?'fa':'other';
  return Object.values(g).map(x=>{x.rows.sort((a,b)=>b.dp-a.dp);x.rows=x.rows.slice(0,3);const best=x.rows[0].dp;
    x.score=(mine.has(x.from)?100:0)+(x.rows.some(r=>mine.has(r.id))?60:0)+(x.rows.some(r=>own(r.id)==='fa')?30:0)+best;return x})
    .filter(x=>x.score>=30||x.rows[0].dp>=3).sort((a,b)=>b.score-a.score).slice(0,8)}
function tmnOppCard(x,Ls){const f=byId[x.from],s=stOf(x.from),mine=Ls.some(c=>c.roster.has(x.from));
  const why=s==='IR'?'on injured reserve':s==='O'?'out this week':s==='D'?'doubtful':s==='SUS'?'suspended':s==='PUP'?'on PUP':'out';
  const row=o=>{const p=byId[o.id],ow=OWN[o.id]===S.me?'mine':OWN[o.id]==null?'fa':'other',T=ow==='other'&&typeof teamById==='function'?teamById(OWN[o.id]):null,role=typeof roleTxt2==='function'?roleTxt2(o.id):'';
    const work=[o.dc>=1?`+${Math.round(o.dc)} carr${Math.round(o.dc)===1?'y':'ies'}`:'',o.dt>=1?`+${Math.round(o.dt)} target${Math.round(o.dt)===1?'':'s'}`:''].filter(Boolean).join(', ');
    return `<li class="tmn-op-r" data-ncard="${o.id}" tabindex="0">${av(p,'sm')}<span class="tmn-op-who"><b>${esc(p.n)}</b><span class="psub">${p.pos} · ${p.t}${role?` · <em>${esc(role)}</em>`:''}${work?` · ${work} a game`:''}</span></span>
      <span class="tmn-op-gain num">+${f1(o.dp)}<small>pts/g</small></span>
      ${ow==='mine'?'<span class="tmn-own mine">Yours</span>':ow==='fa'?'<a class="tmn-own fa" href="#waivers">Free agent</a>':`<span class="tmn-own">${esc(T?T.name:'Rostered')}</span>`}</li>`};
  return `<article class="tmn-op${mine?' mine':''}"><header class="tmn-op-h" data-ncard="${f.id}" tabindex="0">${av(f,'sm')}<span><span class="tmn-op-k">With ${esc(f.n)} ${why}${mine?' · your player':''}</span><b>His work goes to</b></span><span class="tmn-lbl ${s==='Q'||s==='D'?'warn':'bad'}">${esc(ST_LABEL[s]||s||'Out')}</span></header>
    <ul class="tmn-op-l">${x.rows.map(row).join('')}</ul></article>`}

/* ---------- the News tab ---------- */
const TMN_F=[['all','Feed'],['team','Your team'],['inj','Injuries'],['clips','Clips']];
function tmnMood(){const gs=LIVE&&LIVE.week===WEEK?Object.values(LIVE.games||{}):[];if(gs.some(g=>g.state==='in'))return 'live';if(gs.some(g=>g.state==='post'))return 'after';return 'quiet'}
/* 8-tooth gear, drawn on the same 24px grid and stroke as the other line icons */
const TMN_GEAR='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M10.15 4.84L10.18 2.17A10 10 0 0 1 13.82 2.17L13.85 4.84A7.4 7.4 0 0 1 15.76 5.62L17.66 3.76A10 10 0 0 1 20.24 6.34L18.38 8.24A7.4 7.4 0 0 1 19.16 10.15L21.83 10.18A10 10 0 0 1 21.83 13.82L19.16 13.85A7.4 7.4 0 0 1 18.38 15.76L20.24 17.66A10 10 0 0 1 17.66 20.24L15.76 18.38A7.4 7.4 0 0 1 13.85 19.16L13.82 21.83A10 10 0 0 1 10.18 21.83L10.15 19.16A7.4 7.4 0 0 1 8.24 18.38L6.34 20.24A10 10 0 0 1 3.76 17.66L5.62 15.76A7.4 7.4 0 0 1 4.84 13.85L2.17 13.82A10 10 0 0 1 2.17 10.18L4.84 10.15A7.4 7.4 0 0 1 5.62 8.24L3.76 6.34A10 10 0 0 1 6.34 3.76L8.24 5.62A7.4 7.4 0 0 1 10.15 4.84Z"/><circle cx="12" cy="12" r="3.1"/></svg>';
/* Feed filter: Yours and League can each be switched off, never both. Remembered on this device. */
const TMN_SHOW_LS='tm-news-show-v1';
function tmnFilt(){if(TMN.show)return TMN.show;let v=null;try{v=JSON.parse(localStorage.getItem(TMN_SHOW_LS)||'null')}catch(e){}
  return TMN.show=v&&(v.mine||v.lg)?{mine:!!v.mine,lg:!!v.lg}:{mine:true,lg:true}}
function tmnFiltFlip(k){const sh=tmnFilt(),o=k==='mine'?'lg':'mine';sh[k]=!sh[k];if(!sh[k]&&!sh[o])sh[o]=true;try{localStorage.setItem(TMN_SHOW_LS,JSON.stringify(sh))}catch(e){}tmnRenderBody()}
function tmnRender(){const el=$('news-body');if(!el)return;tmnWeek();TMN.unread=0;
  if(typeof FEED!=='undefined'&&typeof loadFeed==='function'&&(!FEED||Date.now()-FEED_AT>4*60e3))Promise.resolve(loadFeed()).then(()=>{if(tab==='news'&&FEED)tmnRenderBody()});
  const Ls=tmnLeagues();if(TMN.lg!=='all'&&!Ls.some(c=>c.key===TMN.lg))TMN.lg='all';const mood=tmnMood();
  try{const fr=[];tmnMyInj(Ls,fr,Date.now());tmnResults(Ls,fr,Date.now());if(fr.length)tmnSave()}catch(e){}
  tmnLoadArt(Ls);tmnLoadLeague();tmnTopCatchUp(Ls);tmnTopBanners();
  const sh=tmnFilt();
  el.innerHTML=`<div class="tmn-lay"><aside class="tmn-side" aria-label="News sections">
      <header class="hero tmn-head"><div class="kicker">Week ${WEEK} · ${Ls.length>1?`all ${Ls.length} leagues`:'your league'}</div><h1>News${mood==='live'?' <span class="tmn-live"><span class="live-dot on"></span>Live</span>':''}</h1></header>
      <div class="tmn-nav" role="group" aria-label="Show" id="tmn-seg"></div>
      ${Ls.length>1?`<select id="tmn-lg" class="tmn-lgsel" aria-label="League"><option value="all">All leagues</option>${Ls.map(c=>`<option value="${esc(c.key)}" ${TMN.lg===c.key?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`:''}
      <div class="tmn-tog" role="group" aria-label="Filter the Feed" id="tmn-tog"><button type="button" class="y" data-nshow="mine" aria-pressed="${sh.mine}"><i aria-hidden="true"></i>Yours</button><button type="button" data-nshow="lg" aria-pressed="${sh.lg}"><i aria-hidden="true"></i>League</button></div>
      <a class="tmn-gear" href="#account-leagues" data-notif-go="1" title="Notification settings" aria-label="Notification settings">${TMN_GEAR}</a></aside>
    <div class="tmn-feed" id="tmn-feed"></div></div>`;
  tmnRenderBody(Ls)}
function tmnRenderBody(Ls){const el=$('tmn-feed');if(!el)return;Ls=Ls||tmnLeagues();
  const inLg=l=>TMN.lg==='all'||(l||[]).some(x=>(x.key||x)===TMN.lg),f=TMN.f;tmnBuildClips(Ls);const CM=tmnClipMap();
  /* big plays: your players' plays, crunch-time swings, clinchers, opponents hurt (and their plays if you turned that on) */
  const PLAY_T=['play','clinch','swing','oinj','opp'];
  const evs=TMN.items.filter(e=>PLAY_T.includes(e.type)&&inLg(e.leagues)&&(e.type!=='opp'||tmnNotif().opp));
  const injList=tmnInjured(Ls),injUp=TMN.items.filter(e=>e.type==='minj'&&inLg(e.leagues));
  const res=TMN.items.filter(e=>e.type==='res'&&inLg(e.leagues));
  const tops=tmnTopNow().filter(e=>inLg(e.leagues));
  const stories=tmnStories(Ls),picked=tmnPickStories(stories);
  const opps=tmnOppGroups(Ls);
  const clipsAll=typeof CLIPS!=='undefined'?CLIPS.filter(v=>!v.game):[];
  const cnt={all:0,team:evs.length,inj:injList.length,clips:clipsAll.length};
  const seg=$('tmn-seg');if(seg)seg.innerHTML=TMN_F.map(([k,l])=>`<button type="button" data-nf="${k}" aria-pressed="${f===k}">${l}${cnt[k]?` <span class="tmn-n">${cnt[k]}</span>`:''}</button>`).join('');
  const sh=tmnFilt(),feedTab=f==='all';document.querySelectorAll('#tmn-tog [data-nshow]').forEach(b=>{b.setAttribute('aria-pressed',String(!!sh[b.dataset.nshow]));b.disabled=!feedTab;b.title=feedTab?'':'Filters the Feed tab'});
  const tg=$('tmn-tog');if(tg)tg.classList.toggle('off',!feedTab);
  const sec=(id,title,note,html)=>html?`<section class="tmn-sec" data-sec="${id}"><div class="tmn-sec-h"><h2>${title}</h2>${note?`<span class="note">${note}</span>`:''}</div>${html}</section>`:'';
  const card=e=>e.type==='second'||e.type==='top'?tmnRankCard(e):e.type==='res'?tmnResultCard(e):e.type==='trade'?tmnTradeCard(e):e.type==='lg'?tmnLeagueCard(e):e.type==='art'||e.type==='vid'?tmnStoryCard(e):tmnEvCard(e,CM.map.get(e.k));
  const whose=e=>e.type==='lg'||e.type==='trade'?(e.yours?'mine lg':'lg'):e.type==='opp'||e.type==='oinj'?'opp':'mine';
  const tl=(list,act)=>list.length?`<ol class="tmn-tl${act?' act':''}">${tmnGroups(list).map((g,i)=>`<li class="tmn-day"><span>${g.label}<small>${esc(g.sub)}</small></span>${i===0?`<em class="tmn-newest">Newest first<b aria-hidden="true">↓</b></em>`:''}</li>${g.items.map(e=>`<li class="${act?whose(e):''}">${card(e)}</li>`).join('')}`).join('')}</ol>`:'';
  let html='';
  if(f==='inj'){const arts=stories.filter(x=>x.kind==='inj'&&stOf(x.pid));
    html=sec('injup','Latest updates',injUp.length?'Newest first':'',tl(injUp))
      +sec('inj','Your injured players',injList.length?'Every league, starters and bench':'',injList.length?`<div class="tmn-injg">${injList.map(x=>tmnInjCard(x,tmnStoriesFor(x.id,arts))).join('')}</div>`:'')
      +sec('opp','Injury opportunities',opps.length?`Who gets the work while they're out${Ls.length>1?` · ownership in ${esc(S.league&&S.league.name||'this league')}`:''}`:'',opps.length?`<div class="tmn-opg">${opps.map(x=>tmnOppCard(x,Ls)).join('')}</div>`:'')}
  else if(f==='clips')html=sec('clips','Clips',clipsAll.length?`${CM.map.size} matched to a play · opens on ESPN or YouTube`:'',tmnClipsGrid(clipsAll,CM));
  else{/* Your team: everything about your players. Feed: the same plus league news a fantasy manager cares about,
       with every card about your team flagged on the rail so the two are easy to tell apart. */
    const act=f==='all',lgAll=tmnLeagueNews(Ls,picked),trades=tmnTrades(Ls,lgAll).filter(x=>act||x.yours),lgNews=act?lgAll.filter(x=>x.kind!=='trade'):[];
    const news=tmnDedupe([...trades,...picked,...lgNews]);
    const all0=tmnBundle([...evs,...injUp,...res,...news,...tmnRankFeed().filter(e=>inLg(e.leagues))].sort((a,b)=>tmnAt(b)-tmnAt(a)));tmnLoadRecaps([...picked,...lgNews,...trades]);
    /* the Yours / League switches in the rail (Feed only). A league story about one of your players counts as both. */
    const keep=e=>{const w=whose(e);return w==='mine'?sh.mine:w==='mine lg'?(sh.mine||sh.lg):sh.lg},cut=act&&!(sh.mine&&sh.lg),all=cut?all0.filter(keep):all0;
    if(cut&&!sh.mine)tops.length=0;
    /* the biggest #1 gets the full card; any others this week sit in a row of smaller orange cards under it */
    const tp=[...tops].sort((a,b)=>(b.overall-a.overall)||(b.pts-a.pts));
    html=(tp.length?`<div class="tmn-tops">${tmnTopCard(tp[0])}${tp.length>1?`<div class="tmn-tops-more">${tp.slice(1).map(tmnTopMini).join('')}</div>`:''}</div>`:'')+tl(all,act)
      +(cut&&!all.length&&!tops.length&&all0.length?`<div class="card tmn-empty"><h2>${sh.mine?'Nothing about your team yet':'No league news right now'}</h2><p class="note">${sh.mine?'League news is switched off. Turn <b>League</b> back on in the rail to see trades, signings and injuries around the league.':'Your team is switched off. Turn <b>Yours</b> back on in the rail to see your players.'}</p></div>`:'')
      +(!picked.length&&TMN.artBusy?'<p class="note tmn-loading"><span class="spin"></span> Pulling the latest on your players…</p>':'')}
  const empty={all:['Nothing yet this week','Everything about your team lands here as it happens, plus the trades, signings and big injuries around the league that move fantasy value.'],
    team:['Nothing yet this week','Big plays, injury news, role changes and results for your players show up here as they happen, from outlets all over the web.'],
    inj:['Everyone is healthy','Any player on your rosters who gets hurt shows up here right away, with every status change, the latest news on him, and who picks up his work.'],
    clips:['No clips yet','Clips of your players show up here as games are played. Each one opens on ESPN or YouTube. When a clip shows one of their big plays, it is attached to that play too.']}[f];
  const lastWk=TMN.last&&TMN.last.items.length&&(f==='all'||f==='team')?(()=>{const L=TMN.last.items.filter(e=>PLAY_T.includes(e.type)&&inLg(e.leagues)).slice(0,30);
    return L.length?`<details class="tmn-last"><summary>Week ${TMN.last.week} big plays <span class="tmn-n">${L.length}</span></summary><div class="tmn-last-l">${L.map(e=>tmnEvCard(e,null,true)).join('')}</div></details>`:''})():'';
  el.innerHTML=(html||`<div class="card tmn-empty"><h2>${empty[0]}</h2><p class="note">${empty[1]}</p></div>`)+lastWk;
  el.querySelectorAll('.tmn-tl .tmn-ev').forEach(a=>{const r=a.querySelector(':scope>.tmn-ev-rail'),t=a.querySelector('.tmn-ev-top');if(r&&t){r.className='tmn-when';t.appendChild(r)}});
  if(TMN.focus){const k=TMN.focus;TMN.focus=null;const it=el.querySelector(`[data-nkf="${CSS.escape(k)}"]`);if(it){it.classList.add('focus');setTimeout(()=>it.scrollIntoView({behavior:'smooth',block:'center'}),40);setTimeout(()=>it.classList.remove('focus'),2600)}}}
const tmnAt=e=>(e.wall&&Date.parse(e.wall))||e.at||0;
/* One card per player per story line per day. A status change and every injury story about him that day become one
   card: the status change leads (else the newest story), the other stories sit under it as short links. Same for
   role stories. Keeps a single injury from filling the Feed with four cards that say the same thing. */
function tmnBundleKey(e){if(!e.pid)return null;const kind=e.type==='minj'?'inj':(e.type==='art'||e.type==='vid'||e.type==='lg')?e.kind:null;
  if(kind!=='inj'&&kind!=='role')return null;return e.pid+'|'+kind+'|'+new Date(tmnAt(e)).toDateString()}
function tmnBundle(list){const by=new Map(),out=[];
  list.forEach(e=>{const k=tmnBundleKey(e);if(!k){out.push(e);return}const g=by.get(k);if(g){g.push(e);return}const a=[e];by.set(k,a);out.push(a)});
  return out.map(x=>{if(!Array.isArray(x))return x;if(x.length===1)return x[0];
    const lead=x.find(e=>e.type==='minj')||x.find(e=>e.url&&!e.pay)||x[0];
    return {...lead,more:x.filter(e=>e!==lead&&e.url).map(e=>({url:e.pay?'':e.url,t:(tmnRecaps()[e.url]||{}).t||e.title,o:tmnSrcOf(e),vid:e.type==='vid'}))}})}
function tmnMore(x){const m=(x.more||[]).filter(a=>a.t);if(!m.length)return '';const show=m.slice(0,2),rest=m.length-show.length;
  return `<ul class="tmn-more">${show.map(a=>`<li>${a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener">`:'<span>'}<b>${esc(a.o||'')}</b>${esc(a.t)}${a.vid?' <i>video</i>':''}${a.url?'</a>':'</span>'}</li>`).join('')}${rest>0?`<li class="tmn-more-n">+${rest} more ${rest===1?'story':'stories'}</li>`:''}</ul>`}
/* day headers for the timeline */
function tmnGroups(evs){const out=[],today=new Date().toDateString(),yest=new Date(Date.now()-864e5).toDateString();
  evs.forEach(e=>{const d=new Date(tmnAt(e)||Date.now()),ds=d.toDateString(),md=d.toLocaleDateString([], {month:'short',day:'numeric'}),label=ds===today?'Today':ds===yest?'Yesterday':d.toLocaleDateString([], {weekday:'long'}),sub=ds===today||ds===yest?d.toLocaleDateString([], {weekday:'short'})+' '+md:md;
    let g=out[out.length-1];if(!g||g.label!==label)out.push(g={label,sub,items:[]});g.items.push(e)});return out}
function tmnClock(t){return t?new Date(t).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}).replace(/\s?([AP])M$/i,(m,x)=>x.toLowerCase()+'m'):''}
/* the rail: one quiet time per card. Inside the last hour it reads "12m ago", after that the clock time; the full date is the tooltip */
function tmnTime(t){if(!t)return '';const m=(Date.now()-t)/60e3;return m<1?'now':m<60?Math.round(m)+'m ago':tmnClock(t)}
const tmnRail=t=>`<div class="tmn-ev-rail"><time datetime="${t?new Date(t).toISOString():''}" title="${t?esc(new Date(t).toLocaleString([], {weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})):''}">${tmnTime(t)}</time></div>`;
const tmnMulti=()=>!!(S.leagues&&S.leagues.length>1);
function tmnEvCard(e,clip,old){const [lbl,tone]=TMN_LBL[e.cls]||['News','accent'],p=e.pid&&byId[e.pid];
  const lg=(e.leagues||[]).filter(l=>tmnMulti()||l.bench||l.their||l.wp1!=null).map(l=>{const d=l.wp0!=null&&l.wp1!=null&&!l.bench?Math.round((l.wp1-l.wp0)*100):null;
    return `<span class="tmn-lchip${l.bench?' bench':''}${l.their?' their':''}">${esc(l.name)}${l.bench?' · bench':''}${l.wp1!=null&&!l.bench?` · <b>${Math.round(l.wp1*100)}%</b>${d?` <em class="${d>0?'up':'dn'}">${d>0?'▲':'▼'}${Math.abs(d)}</em>`:''}`:''}</span>`}).join('');
  const showPts=e.pts!=null&&(e.type==='play'||e.type==='opp'),big=e.cls==='game'||e.cls==='gameX';
  const v=clip?`<div class="tmn-vid">${tmnClipThumb(clip)}</div>`:'';
  const gm=p&&!old&&LIVE&&LIVE.week===WEEK&&LIVE.games&&LIVE.games[p.t],sc=tmnScOf(e),now=p&&!old&&gm?tmnPts(e.pid,sc):null;
  const tot=p&&(e.type==='play'||e.type==='opp')&&!big?(old?e.tot:now):null;
  const totH=tot!=null?`<span class="tmn-tot"><b class="num">${f1(tot)}</b> pts ${gm&&gm.state==='post'?'final':'so far'}</span>`:'';
  /* going off: what he has scored over his projection, never the projection itself */
  let sub=e.sub||'';if(big&&p){const pts=now!=null&&now>e.pts?now:e.pts,pr=e.pr!=null?e.pr:(old?null:projPts(p,sc));
    const rest=!old&&LIVEST[e.pid]?[statLineTxt(p.pos,LIVEST[e.pid]),tmnVs(gm)].filter(Boolean).join(' · '):sub.replace(/^Scored [\d.]+ over projected( · )?/,'');
    sub=[pr!=null?tmnOver(pts,pr):'',rest].filter(Boolean).join(' · ')}
  const ptsShow=big&&now!=null&&now>e.pts?now:e.pts;
  return `<article class="tmn-ev tone-${tone}${e.type==='play'?' is-play':''}${e.type==='opp'?' their':''}${e.type==='clinch'?' clinch':''}${v?' has-vid':''}${p?' tap':''}" data-nkf="${esc(e.k)}"${p?` data-ncard="${p.id}"`:e.type==='clinch'||e.type==='swing'?` data-nres="${esc(e.lkey||'')}"`:''}>
    ${tmnRail(tmnAt(e))}
    <div class="tmn-ev-card"><div class="tmn-ev-top"><span class="tmn-lbl ${tone}">${lbl}</span>${showPts?`<b class="tmn-ev-pts num">${big?'':'+'}${f1(ptsShow)}<small>${big?' pts total':' pts'}</small></b>`:''}</div>
      <div class="tmn-ev-main"><div class="tmn-b-av">${p?av(p):`<span class="tmn-seal">W</span>`}${e.type==='play'?TMN_BOLT:''}</div><div class="tmn-ev-txt"><h3>${esc(e.head)}</h3>${sub?`<p class="tmn-clamp">${esc(sub)}</p>`:''}${lg?`<div class="tmn-lgs">${lg}</div>`:''}${tmnMore(e)}</div>${v}</div>
      ${totH?`<div class="tmn-ev-f">${totH}</div>`:''}</div></article>`}
const TMN_BOLT='<i class="tmn-bolt" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M9.6 1 3.5 9.1h3.9L6.4 15l6.1-8.1H8.6z"/></svg></i>';
/* #1 (once Thursday starts) and #2 at a position, in the timeline: orange for #1, silver for #2 */
function tmnRankCard(e){const p=byId[e.pid];if(!p)return '';const one=e.type==='top',posn=tmnPosN(e.pos);
  const lbl=one?(e.overall?'#1 in the NFL':`#1 ${posn}`):`#2 ${posn}`;
  return `<article class="tmn-ev tmn-rank ${one?'tmn-n1 tone-top':'tmn-n2 tone-silver'} tap" data-ncard="${p.id}" data-nkf="${esc(e.k)}" tabindex="0">${tmnRail(tmnAt(e))}
    <div class="tmn-ev-card"><div class="tmn-ev-top"><span class="tmn-lbl ${one?'top':'silver'}">${esc(lbl)} · Week ${e.week}</span><b class="tmn-ev-pts num">${f1(e.pts)}<small> pts</small></b></div>
      <div class="tmn-ev-main"><div class="tmn-b-av tmn-rank-av">${av(p)}<span class="tmn-rmedal">${one?1:2}</span></div><div class="tmn-ev-txt"><h3>${esc(e.head)}</h3>${e.sub?`<p>${esc(e.sub)}</p>`:''}
        ${tmnMulti()||(e.leagues||[]).some(l=>l.bench)?`<div class="tmn-lgs">${(e.leagues||[]).map(l=>`<span class="tmn-lchip${l.bench?' bench':''}">${esc(l.name)}${l.bench?' · bench':''}</span>`).join('')}</div>`:''}</div></div></div></article>`}
/* recaps: each story's biggest takeaway as its title plus a few key points, written once per story by /api/news */
const TMN_RC_LS='tm-news-recap-v2';
function tmnRecaps(){if(TMN.rc)return TMN.rc;try{TMN.rc=JSON.parse(localStorage.getItem(TMN_RC_LS)||'null')}catch(e){}TMN.rc=TMN.rc||{};return TMN.rc}
async function tmnLoadRecaps(list){const R=tmnRecaps();TMN.rcTried=TMN.rcTried||new Set();
  const todo=list.filter(x=>(x.type==='art'||x.type==='lg'||x.type==='trade')&&x.url&&!R[x.url]&&!TMN.rcTried.has(x.url)).slice(0,30);if(!todo.length||TMN.rcBusy)return;
  TMN.rcBusy=true;todo.forEach(x=>TMN.rcTried.add(x.url));
  try{const r=await fetch('/api/news?recap=1',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({items:todo.map(x=>{const p=byId[x.pid];return {u:x.url,n:p&&p.n,pos:p&&p.pos,t:p&&p.t,title:x.title,desc:x.desc||'',outlet:x.outlet,pay:!!x.pay,...(x.type==='trade'||x.kind==='trade'?{f:'trade',from:x.from||'',to:x.to||''}:{})}})})});
    const j=r.ok?await r.json():null;
    if(j&&j.items&&Object.keys(j.items).length){Object.assign(R,j.items);
      const keys=Object.keys(R);if(keys.length>400)keys.slice(0,keys.length-400).forEach(k=>delete R[k]);
      try{localStorage.setItem(TMN_RC_LS,JSON.stringify(R))}catch(e){}}}catch(e){}
  TMN.rcBusy=false;if(tab==='news'&&$('tmn-feed'))tmnRenderBody()}
/* ---------- league news and trades for the Feed ----------
   /api/news?league=1 returns this week's trades, signings, releases, season-ending injuries and new starters from
   the shared outlets. Only stories about fantasy-relevant players are kept (ranked inside the top 220, top 150 for
   injuries), each tagged with who has him in the league on screen: you, another team, or nobody (a waiver add). */
const TMN_LG_LS='tm-news-league-v1';
try{const c=JSON.parse(localStorage.getItem(TMN_LG_LS)||'null');if(c&&c.items&&Date.now()-c.at<12*3600e3)TMN.lgn={...c,at:c.at-10*60e3}}catch(e){}
async function tmnLoadLeague(){if(TMN.lgBusy||(TMN.lgn&&Date.now()-TMN.lgn.at<10*60e3))return;TMN.lgBusy=true;
  try{const r=await fetch('/api/news?league=1&b='+Math.floor(Date.now()/600000));const j=r.ok?await r.json():null;
    if(j&&Array.isArray(j.items)){TMN.lgn={at:Date.now(),items:j.items};try{localStorage.setItem(TMN_LG_LS,JSON.stringify(TMN.lgn))}catch(e){}}}catch(e){}
  TMN.lgBusy=false;if(tab==='news'&&(TMN.f==='all'||TMN.f==='team')&&$('tmn-feed'))tmnRenderBody()}
const TMN_LGK={trade:['Trade','accent'],inj:['Injury','bad'],move:['Roster move','muted'],role:['Depth chart','warn']};
function tmnLeagueNews(Ls,picked){const raw=TMN.lgn&&TMN.lgn.items;if(!raw||!raw.length)return [];
  const rk=id=>(typeof V!=='undefined'&&V&&V.rank&&V.rank[id])||999;
  if(!TMN.lgIdx||TMN.lgIdx.n!==POOL.length){const L=POOL.filter(p=>p.pos!=='DST'&&p.pos!=='K'&&rk(p.id)<=TMN_TRADE_TOP).map(p=>[norm(p.n),p.id]).filter(x=>x[0].includes(' '));
    TMN.lgIdx={n:POOL.length,L,by:Object.fromEntries(L)}}
  const {L,by}=TMN.lgIdx,mine=new Set();Ls.forEach(c=>c.roster.forEach(id=>mine.add(id)));
  const seen=new Set((picked||[]).map(x=>x.url)),cut=Date.now()-7*864e5,out=[];
  raw.forEach(a=>{const at=Date.parse(a.at||0);if(!at||at<cut||seen.has(a.url))return;
    let pid=null;const ath=(a.athletes||[]).map(norm).find(n=>by[n]);if(ath)pid=by[ath];
    if(!pid){const h=normT(a.title);const hit=L.filter(([n])=>wordIn(h,n)).sort((x,y)=>rk(x[1])-rk(y[1]))[0];if(hit)pid=hit[1]}
    if(!pid){const h=normT(String(a.desc||'').slice(0,220));const hit=L.filter(([n])=>wordIn(h,n)).sort((x,y)=>rk(x[1])-rk(y[1]))[0];if(hit)pid=hit[1]}
    if(!pid||(a.kind==='inj'&&rk(pid)>150)||(a.kind!=='trade'&&rk(pid)>220)||out.some(o=>o.pid===pid&&o.kind===a.kind))return;
    const x={type:'lg',k:'lg:'+a.url,kind:a.kind,pid,yours:mine.has(pid),title:a.title,desc:a.desc,url:a.url,outlet:a.outlet,img:a.img,at,leagues:[],pay:!!a.pay};
    if((picked||[]).some(o=>tmnSameStory(o,x))||out.some(o=>tmnSameStory(o,x)))return;
    seen.add(a.url);out.push(x)});
  const tr=out.filter(x=>x.kind==='trade'),rest=out.filter(x=>x.kind!=='trade').sort((a,b)=>b.at-a.at).slice(0,14);
  return [...rest,...tr].sort((a,b)=>b.at-a.at)}
/* Trades of top-500 players (overall fantasy rank, kickers and defenses aside). Two sources: team changes the nightly data update saw (DATA.moves: [id, from, to, day]),
   and trade stories from the outlets. Each trade gets one card. It carries a story about that trade when there is a
   good one (from the shared outlets, else /api/news?trades= searches for it); with none it still shows, without a link. */
const TMN_TR_LS='tm-news-trades-v1';
const TMN_TRADE_TOP=500;   /* trade cards for anyone ranked inside this */
try{const c=JSON.parse(localStorage.getItem(TMN_TR_LS)||'null');if(c&&c.items)TMN.tra=c}catch(e){}
async function tmnLoadTradeArts(list){const need=list.filter(x=>!x.url&&!(TMN.tra&&TMN.tra.items&&TMN.tra.items[x.pid]&&Date.now()-TMN.tra.items[x.pid].at<30*60e3));
  if(!need.length||TMN.traBusy)return;TMN.traBusy=true;
  const q=need.slice(0,12).map(x=>[byId[x.pid].n,x.from||'',x.to||''].join('|')).join(';');
  try{const r=await fetch('/api/news?trades='+encodeURIComponent(q)+'&b='+Math.floor(Date.now()/1200000));const j=r.ok?await r.json():null;
    if(j&&j.items){TMN.tra=TMN.tra||{items:{}};need.slice(0,12).forEach(x=>{TMN.tra.items[x.pid]={at:Date.now(),a:j.items[byId[x.pid].n]||null}});
      try{localStorage.setItem(TMN_TR_LS,JSON.stringify(TMN.tra))}catch(e){}}}catch(e){}
  TMN.traBusy=false;if(tab==='news'&&$('tmn-feed'))tmnRenderBody()}
function tmnTrades(Ls,lg){const rk=id=>(typeof V!=='undefined'&&V&&V.rank&&V.rank[id])||999,mine=new Set();Ls.forEach(c=>c.roster.forEach(id=>mine.add(id)));
  const cut=Date.now()-14*864e5,by={},D=window.NFL_DATA;
  ((D&&D.moves)||[]).forEach(([id,from,to,day])=>{const p=byId[id],at=Date.parse(day+'T12:00:00');if(!p||rk(id)>TMN_TRADE_TOP||!at||at<cut)return;by[id]={from,to,at}});
  (lg||[]).filter(x=>x.kind==='trade').forEach(x=>{const m=by[x.pid]||(by[x.pid]={from:'',to:byId[x.pid].t,at:x.at});if(!m.url||(m.pay&&!x.pay)){m.url=x.url;m.title=x.title;m.desc=x.desc;m.outlet=x.outlet;m.img=x.img;m.pay=!!x.pay;m.at=Math.min(m.at,x.at)}});
  const out=Object.entries(by).map(([pid,m])=>{let a=m.url?null:TMN.tra&&TMN.tra.items&&TMN.tra.items[pid]&&TMN.tra.items[pid].a;
    if(a&&Date.parse(a.at||0)<m.at-5*864e5)a=null;    /* a story from long before the move is about something else */
    const how=m.url||(a&&/\btrade[ds]?\b|\bdealt\b|\bacquire/i.test((a.title||'')+' '+(a.desc||'')))?'trade':'move';
    const x={type:'trade',kind:'trade',how,k:'tr:'+pid,pid,from:m.from,to:m.to||byId[pid].t,yours:mine.has(pid),at:m.at,leagues:[],url:m.url||(a&&a.url)||'',title:m.title||(a&&a.title)||'',desc:m.desc||(a&&a.desc)||'',outlet:m.outlet||(a&&a.outlet)||'',img:m.img||(a&&a.img)||null,pay:m.url?!!m.pay:!!(a&&a.pay)};
    if(a&&a.at){const t=Date.parse(a.at);if(t&&t<x.at)x.at=t}return x}).sort((a,b)=>b.at-a.at).slice(0,20);
  tmnLoadTradeArts(out);return out}
/* a story's title, always about the player on the card: when the headline doesn't name him, lead with his name */
function tmnTitleFor(p,t){if(!p||!t)return t||'';const last=norm(p.n).split(' ').filter(w=>w.length>1).pop()||'';return last&&wordIn(normT(t),last)?t:`${p.n}: ${t}`}
/* stories, league news and trades share one layout: kind + source on top, the player's face and the headline, nothing underneath */
const tmnHost=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return ''}};
const tmnSrcOf=x=>x.outlet&&x.outlet!=='Google News'?x.outlet:tmnHost(x.url);
function tmnOwnChip(x){const ow=x.yours?'mine':typeof OWN==='undefined'||OWN[x.pid]==null?'fa':OWN[x.pid]===S.me?'mine':'other';
  const T=ow==='other'&&S.teams&&S.teams.find(t=>t.id===OWN[x.pid]);
  return ow==='mine'?'<span class="tmn-own mine">Your team</span>':ow==='fa'?'<span class="tmn-own fa" data-go-waivers="1">Free agent ↗</span>':`<span class="tmn-own">${esc(T?T.name:'Rostered')}</span>`}
function tmnBodyOf(p,x,rc,fallback){return rc?`<h3>${esc(tmnTitleFor(p,rc.t))}</h3>${rc.pts.length?`<ul class="tmn-pts">${rc.pts.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}`
  :`<h3>${esc(x.title?tmnTitleFor(p,x.title):fallback)}</h3>${x.desc&&x.desc!==x.title?`<p class="tmn-clamp">${esc(x.desc)}</p>`:''}`}
function tmnStoryShell({x,p,cls,tone,lbl,right,body,link,pay,vid}){
  const src=pay?`${esc(x.outlet||'Subscriber story')} · key facts here`:link?`${esc(tmnSrcOf(x))}${x.also&&x.also.length?` +${x.also.length}`:''}`:'';
  const more=tmnMore(x);if(more&&link&&!pay){body=body.replace(/<h3>([\s\S]*?)<\/h3>/,`<h3><a class="tmn-hl" href="${esc(x.url)}" target="_blank" rel="noopener">$1</a></h3>`);link=false}
  const open=link&&!pay?`<a class="tmn-ev tmn-story ${cls} tone-${tone}" href="${esc(x.url)}" target="_blank" rel="noopener" data-nkf="${esc(x.k||'')}" title="${esc(x.title||'')}">`
    :`<article class="tmn-ev tmn-story ${cls} tone-${tone} tap${pay?' pay':''}" data-ncard="${p.id}" data-nkf="${esc(x.k||'')}" tabindex="0">`;
  return `${open}${tmnRail(x.at)}
    <div class="tmn-ev-card"><div class="tmn-ev-top"><span class="tmn-kick"><span class="tmn-lbl ${tone}">${lbl}</span>${src?`<span class="tmn-src">${src}${link&&!pay?' <i aria-hidden="true">↗</i>':''}</span>`:''}</span>${right||''}</div>
      <div class="tmn-ev-main"><div class="tmn-b-av">${av(p)}</div><div class="tmn-ev-txt">${body}${more}</div>
        ${x.img?`<span class="tmn-sthumb${vid?' vid':''}"><img src="${esc(x.img)}" alt="" loading="lazy" decoding="async" onerror="this.parentNode.remove()">${vid?'<span class="vplay" aria-hidden="true"></span>':''}</span>`:''}</div></div>${link&&!pay?'</a>':'</article>'}`}
function tmnTradeCard(x){const p=byId[x.pid];if(!p)return '';const rc=x.url&&tmnRecaps()[x.url];
  const route=`<span class="tmn-tr-route">${x.from?`<b>${esc(x.from)}</b><i aria-hidden="true">→</i>`:'<i aria-hidden="true">→</i>'}<b>${esc(x.to)}</b></span>`;
  /* yours: a louder card, and it says plainly that he's still on your roster */
  const tn=typeof teamName==='function'?'the '+teamName(x.to):x.to,mv=x.how==='move';
  const body=tmnBodyOf(p,x,rc,mv?`${p.n} is now with ${tn}`:x.yours?`${p.n} was traded to ${tn}`:`${p.n} traded${x.from?' from '+x.from:''} to ${x.to}`)
    +(x.yours?`<p class="tmn-mytr-n">Still on your roster.</p>`:'');
  return tmnStoryShell({x,p,cls:'tmn-trade'+(x.yours?' tmn-mytr':'')+(rc?' recap':''),tone:'accent',lbl:x.yours?(mv?'Your player changed teams':'Your player was traded'):(mv?'New team':'Trade'),
    right:`<span class="tmn-right">${route}${x.yours?'':tmnOwnChip(x)}</span>`,body,link:!!x.url,pay:!!(x.url&&x.pay)})}
function tmnLeagueCard(x){const p=byId[x.pid],[lbl,tone]=TMN_LGK[x.kind]||['League news','muted'],rc=tmnRecaps()[x.url];
  return tmnStoryShell({x,p,cls:'tmn-lgn'+(rc?' recap':''),tone,lbl,right:tmnOwnChip(x),body:tmnBodyOf(p,x,rc,''),link:true,pay:!!x.pay})}
/* a story or a video: the whole card is the link */
function tmnStoryCard(x){const p=byId[x.pid],inj=x.kind==='inj',vid=x.type==='vid',tone=inj?'warn':'muted',rc=tmnRecaps()[x.url],st=stOf(x.pid);
  const lbl=vid?(inj?'Injury video':'Video'):inj?(st?'Injury update':'Health'):'Role & usage';
  return tmnStoryShell({x,p,cls:(vid?'vid':'')+(rc?' recap':''),tone,lbl,right:st?`<span class="tmn-stb">${esc(ST_LABEL[st]||st)}</span>`:'',body:tmnBodyOf(p,x,rc,''),link:true,pay:!!(x.pay&&!vid),vid})}
/* the clip that shows a play: a link out to ESPN or YouTube */
function tmnClipThumb(v){return `<span class="tmn-vid-l">Watch the play ↗</span>${thumbHtml(v,'xs')}`}
function tmnClipsGrid(list,CM){if(!list.length)return '';const playOf={};CM.map.forEach((v,k)=>playOf[v.id]=TMN.items.find(e=>e.k===k));
  const sorted=[...list].sort((a,b)=>(playOf[b.id]?1:0)-(playOf[a.id]?1:0));
  return `<div class="tmn-cgrid">${sorted.slice(0,40).map(v=>{const e=playOf[v.id];return `<div class="tmn-cl${e?' on':''}">${thumbHtml(v,'sm')}${e?`<button class="tmn-cl-play linkish" data-nk-go="${esc(e.k)}">${esc(e.head)}</button>`:''}</div>`}).join('')}</div>`}
function tmnWhen(t){const d=new Date(t),m=(Date.now()-t)/60e3;return m<1?'Just now':m<60?Math.round(m)+'m ago':d.toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'})}
function tmnScOf(e){const k=e.leagues&&e.leagues[0]&&e.leagues[0].key,c=k&&k!==S.leagueKey&&S.leagues&&S.leagues.find(l=>l.key===k),snap=c&&c.snap;
  return {...BASE_SC,...(((snap||S).league&&(snap||S).league.sc)||{})}}
function tmnInjCard(x,arts){const p=byId[x.id],n=NOTES[x.id],sev=tmnSev(x.s),out=sev>=3,tone=out?'bad':'warn',gm=LIVE&&LIVE.week===WEEK&&LIVE.games&&LIVE.games[p.t],starts=x.L.some(l=>l.st);
  const head=x.s==='IR'?`${p.n} is on injured reserve.`:x.s==='O'?`${p.n} is out this week.`:x.s==='D'?`${p.n} is doubtful.`:x.s==='Q'?`${p.n} is questionable.`:`${p.n}: ${ST_LABEL[x.s]||x.s}.`;
  const what=p.inj&&!(n&&n.note&&n.note.includes(p.inj))?p.inj:'';
  const when=gm&&gm.start&&gm.state==='pre'?`Kicks off ${new Date(gm.start).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'})} ${tmnVs(gm)}`:'';
  const scored=gm&&gm.state!=='pre'&&LIVEST[x.id]?`${f1(tmnPts(x.id,x.L[0].c.sc))} pts ${gm.state==='post'?'final':'so far'}`:'';
  const stories=(arts&&arts.length?arts.map(a=>({title:(tmnRecaps()[a.url]||{}).t||a.title,url:a.pay?'':a.url,at:a.at,outlet:a.pay?a.outlet+' (subscribers)':a.outlet})):typeof playerNews==='function'?playerNews(p).map(a=>({...a,outlet:'ESPN'})):[]).slice(0,2);
  const op=typeof OPPS!=='undefined'?OPPS.filter(o=>o.from===x.id).sort((a,b)=>b.dp-a.dp)[0]:null;
  return `<article class="tmn-ev tone-${tone} flat tmn-inj tap" data-ncard="${p.id}"><div class="tmn-ev-card"><div class="tmn-ev-top"><span class="tmn-lbl ${tone}">${esc(ST_LABEL[x.s]||x.s)}</span>${n&&n.at?`<span class="tmn-upd">Updated ${tmnWhen(Date.parse(n.at))}</span>`:''}</div>
    <div class="tmn-ev-main"><div class="tmn-b-av">${av(p)}</div><div class="tmn-ev-txt"><h3>${esc(head)}</h3>${what?`<p>${esc(what)}</p>`:''}${n&&n.note?`<p class="tmn-note">${esc(n.note)}</p>`:''}${when||scored?`<p>${esc(scored||when)}</p>`:''}
    ${stories.length?`<ul class="tmn-stories">${stories.map(a=>`<li>${a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>`:esc(a.title)}<span class="note"> · ${esc(a.outlet||'')}${a.at?` · ${tmnWhen(typeof a.at==='number'?a.at:Date.parse(a.at))}`:''}</span></li>`).join('')}</ul>`:''}
    ${op&&sev>=3?`<p class="tmn-inj-op">Picking up his work: <button class="linkish" data-open="${op.id}">${esc(byId[op.id].n)}</button> <span class="num">+${f1(op.dp)} pts/g</span></p>`:''}
    <div class="tmn-lgs">${x.L.map(l=>`<span class="tmn-lchip${l.st?'':' bench'}">${esc(l.c.name)} · ${l.st?'starting':'bench'}</span>`).join('')}</div></div></div>
    <div class="tmn-ev-f"><span class="tmn-go">Player card →</span>${starts&&sev>=3&&!(gm&&gm.state!=='pre')?'<a class="linkish" href="#team">Set lineup</a>':''}</div></div></article>`}
function tmnResultCard(e){const w=e.now>e.onow,t=e.now===e.onow,m=Math.abs(e.now-e.onow),o=e.oname;
  const head=w?(m<5?`Survived. You edged ${o} by ${f1(m)}.`:m>30?`Blowout. You buried ${o} by ${f1(m)}.`:`W. You beat ${o} by ${f1(m)}.`):t?`Dead even with ${o}.`:(m<5?`Heartbreaker. ${o} got you by ${f1(m)}.`:`${o} took this one by ${f1(m)}.`);
  const tone=w?'good':t?'accent':'bad';
  return `<article class="tmn-ev tmn-res tone-${tone} tap" data-nkf="${esc(e.k)}" data-nres="${esc(e.lkey)}">${tmnRail(e.at)}<div class="tmn-ev-card"><div class="tmn-ev-top"><span class="tmn-lbl ${tone}">Final · Week ${String(e.k).split(':').pop()}</span></div><div class="tmn-ev-main"><div class="tmn-b-av"><span class="tmn-seal ${w?'':'l'}">${w?'W':t?'T':'L'}</span></div>
    <div class="tmn-ev-txt"><h3>${esc(head)}</h3><p class="num">${esc(e.team||'You')} ${f1(e.now)} – ${f1(e.onow)} ${esc(o)}</p>${tmnMulti()?`<div class="tmn-lgs"><span class="tmn-lchip">${esc(e.leagues[0].name)}</span></div>`:''}</div></div></div></article>`}
/* the orange one: pinned at the top of the Feed */
function tmnTopCard(e){const p=byId[e.pid];if(!p)return '';const sec=e.second&&byId[e.second];
  return `<article class="tmn-top${e.overall?' all':''} tap" data-ncard="${p.id}" data-nkf="${esc(e.k)}" tabindex="0">${tmnConfetti()}<i class="tmn-top-glow" aria-hidden="true"></i>
    <div class="tmn-top-av"><i class="tmn-rays" aria-hidden="true"></i>${av(p,'lg')}<span class="tmn-medal">#1</span></div>
    <div class="tmn-top-t"><span class="tmn-top-k">Week ${e.week} · ${e.overall?'#1 scorer in the NFL':`#1 ${esc(tmnPosN(e.pos))} in the NFL`}</span><h3>${esc(e.head)}</h3>
      <p>${sec?`${f1(e.gap)} points clear of ${esc(sec.n)}`:''}${e.sub&&sec?' · ':''}${esc(e.sub.replace(/^[\d.]+ ahead of [^·]+·?\s*/,''))}</p>
      <div class="tmn-lgs">${e.leagues.map(l=>`<span class="tmn-lchip">${esc(l.name)}${l.bench?' · on your bench':''}</span>`).join('')}</div></div>
    <div class="tmn-top-pts"><b class="num">${f1(e.pts)}</b><small>pts</small></div></article>`}
function tmnTopMini(e){const p=byId[e.pid];if(!p)return '';
  return `<article class="tmn-topm tap" data-ncard="${p.id}" data-nkf="${esc(e.k)}" tabindex="0"><span class="tmn-topm-av">${av(p,'md')}<span class="tmn-medal">#1</span></span>
    <span class="tmn-topm-t"><small>#1 ${esc(tmnPosN(e.pos))} · Week ${e.week}</small><b>${esc(p.n)}</b></span><span class="tmn-topm-p num">${f1(e.pts)}<small>pts</small></span></article>`}
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
  const xc=t.closest('[data-nxc]');if(xc){e.stopPropagation();tmnTopDismiss(xc.dataset.nxc);TMN.chips=TMN.chips.filter(c=>c.k!==xc.dataset.nxc);tmnPaintChips();return}
  const nk=t.closest('.tmn-ban[data-nk],.tmn-chip[data-nk]');if(nk){tmnOpen(nk.dataset.nk);return}
  const nr=t.closest('[data-nres]');if(nr&&!t.closest('a,button')){const k=nr.dataset.nres;if(k&&k!==S.leagueKey&&typeof switchLeague==='function')switchLeague(k);location.hash='team';return}
  const nc=t.closest('[data-ncard]');if(nc&&!t.closest('a,button,select,input')&&typeof openCard==='function'){openCard(nc.dataset.ncard);return}
  const ng=t.closest('[data-nk-go]');if(ng){TMN.f='team';TMN.focus=ng.dataset.nkGo;tmnRender();return}
  const gw=t.closest('[data-go-waivers]');if(gw){e.preventDefault();e.stopPropagation();location.hash='waivers';return}
  const ns=t.closest('[data-nshow]');if(ns){if(!ns.disabled)tmnFiltFlip(ns.dataset.nshow);return}
  const nf=t.closest('[data-nf]');if(nf){TMN.f=nf.dataset.nf;tmnRender();return}
  const ml=t.closest('[data-nlg]');if(ml){e.preventDefault();TMN.lg=TMN.lg===ml.dataset.nlg?'all':ml.dataset.nlg;tmnRender();return}
  if(t.closest('[data-notif-go]'))TMN.goNotif=true;
  if(t.closest('.tmn-chip.more')){TMN.f='team';if(location.hash==='#news')tmnRender()}});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('.tmn-ban[data-nk],.tmn-chip[data-nk]')){e.preventDefault();tmnOpen(e.target.dataset.nk);return}
  if(e.key==='Enter'&&e.target.matches&&e.target.matches('[data-ncard]')&&typeof openCard==='function'){e.preventDefault();openCard(e.target.dataset.ncard)}});
document.addEventListener('change',e=>{const t=e.target;
  if(t.id==='tmn-lg'){TMN.lg=t.value;tmnRender();return}
  if(t.dataset&&t.dataset.notif!==undefined){const n=tmnNotif(),k=t.dataset.notif;n.off=n.off.filter(x=>x!==k);if(!t.checked)n.off.push(k);save();
    const s=t.closest('li').querySelector('.note');if(s)s.textContent=t.checked?'Banners on':'News tab only';toast(t.checked?'Banners on for this league':'Banners off. It still shows in News.');return}
  if(t.dataset&&t.dataset.notifOpp){tmnNotif().opp=t.checked;save();toast(t.checked?'Opponent banners on':'Opponent banners off')}});
