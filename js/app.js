/* ===== Teams & colors ===== */
const TC={ARI:['#97233F','#FFB612','#fff'],ATL:['#A71930','#000000','#fff'],BAL:['#241773','#9E7C0C','#fff'],BUF:['#00338D','#C60C30','#fff'],CAR:['#0085CA','#101820','#fff'],CHI:['#0B162A','#C83803','#fff'],CIN:['#FB4F14','#000000','#fff'],CLE:['#311D00','#FF3C00','#fff'],DAL:['#003594','#869397','#fff'],DEN:['#FB4F14','#002244','#fff'],DET:['#0076B6','#B0B7BC','#fff'],GB:['#203731','#FFB612','#fff'],HOU:['#03202F','#A71930','#fff'],IND:['#002C5F','#A2AAAD','#fff'],JAX:['#006778','#D7A22A','#fff'],KC:['#E31837','#FFB81C','#fff'],LV:['#000000','#A5ACAF','#fff'],LAC:['#0080C6','#FFC20E','#fff'],LAR:['#003594','#FFA300','#fff'],MIA:['#008E97','#FC4C02','#fff'],MIN:['#4F2683','#FFC62F','#fff'],NE:['#002244','#C60C30','#fff'],NO:['#D3BC8D','#101820','#101820'],NYG:['#0B2265','#A71930','#fff'],NYJ:['#125740','#000000','#fff'],PHI:['#004C54','#A5ACAF','#fff'],PIT:['#FFB612','#101820','#101820'],SF:['#AA0000','#B3995D','#fff'],SEA:['#002244','#69BE28','#fff'],TB:['#D50A0A','#34302B','#fff'],TEN:['#0C2340','#4B92DB','#fff'],WAS:['#5A1414','#FFB612','#fff']};
const NFL=Object.keys(TC);
const tcVars=t=>{const c=TC[t]||['#333','#666','#fff'];return `--c1:${c[0]};--c2:${c[1]};--ct:${c[2]}`};

/* ===== Real 2026 data: nflverse snapshot ===== */
const DATA=window.NFL_DATA;
document.querySelectorAll('.wk-now').forEach(x=>x.textContent='Week '+DATA.week);document.querySelectorAll('.wk-num').forEach(x=>x.textContent=DATA.week);{const el=document.getElementById('week-pill');if(el){el.innerHTML=`<b>Week ${DATA.week}</b> · stats thru Wk ${DATA.played}`;el.title=`Real ${DATA.asOf.slice(0,4)} stats through Week ${DATA.played}, updated ${DATA.asOf}. Refreshed every morning.`}}
const FUM={QB:.2,RB:.09,WR:.04,TE:.04};
const slug=n=>n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const Z={cmp:0,pyd:0,ptd:0,int:0,ratt:0,ryd:0,rtd:0,tgt:0,rec:0,recyd:0,rectd:0};
const BUILTIN=DATA.players.map(([id,n,pos,t,st,inj,pr])=>{const o={id,n,pos,t,status:st||''};DATA.fields.forEach((f,k)=>o[f]=pr[k]);if(inj)o.inj=inj;return o});
const RAWLOG={};DATA.players.forEach(x=>RAWLOG[x[0]]=x[7]);
const NICK={ARI:'Cardinals',ATL:'Falcons',BAL:'Ravens',BUF:'Bills',CAR:'Panthers',CHI:'Bears',CIN:'Bengals',CLE:'Browns',DAL:'Cowboys',DEN:'Broncos',DET:'Lions',GB:'Packers',HOU:'Texans',IND:'Colts',JAX:'Jaguars',KC:'Chiefs',LV:'Raiders',LAC:'Chargers',LAR:'Rams',MIA:'Dolphins',MIN:'Vikings',NE:'Patriots',NO:'Saints',NYG:'Giants',NYJ:'Jets',PHI:'Eagles',PIT:'Steelers',SF:'49ers',SEA:'Seahawks',TB:'Buccaneers',TEN:'Titans',WAS:'Commanders'};
(DATA.dst||[]).forEach(([t,pr,log])=>{const id='dst-'+t.toLowerCase();BUILTIN.push({id,n:(NICK[t]||t)+' D/ST',pos:'DST',t,status:'',...Z,dsk:pr[0],dint:pr[1],dfr:pr[2],dtd:pr[3],dsf:pr[4],pa:pr[5],fl:0});RAWLOG[id]=log.map(e=>e===0?0:{dst:1,e})});
const KZ={k39:0,k49:0,k50:0,kmiss:0,xpm:0,xpmiss:0};
(DATA.k||[]).forEach(([id,n,t,st,inj,pr,log])=>{const o={id,n,pos:'K',t,status:st||'',...Z,...KZ,fl:0,k39:pr[0],k49:pr[1],k50:pr[2],kmiss:pr[3],xpm:pr[4],xpmiss:pr[5]};if(inj)o.inj=inj;BUILTIN.push(o);RAWLOG[id]=log.map(e=>e===0?0:e.length===2?e:{k:1,e})});

/* ===== Season data: schedule, byes, defenses, game logs ===== */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function seed(str){let h=2166136261;for(const c of str){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return mulberry32(h>>>0)}
function shuffle(arr,r){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const ord=k=>k+((k%100>=11&&k%100<=13)?'th':(['th','st','nd','rd'][k%10]||'th'));
function schedOf(t,from,to){const o=[];for(let w=from;w<=to;w++)o.push({w,g:OPP[t]&&OPP[t][w]||null});return o}
const WEEK=DATA.week,PLAYED=DATA.played,BYE=DATA.bye,DEF=DATA.def,VEGAS=DATA.vegas,OPP={};
Object.entries(DATA.sched).forEach(([t,arr])=>{OPP[t]={};arr.forEach((x,k)=>{if(x)OPP[t][k+1]={opp:x[0],home:!!x[1]}})});
const defRank=(t,pos)=>(DEF[t]&&DEF[t][pos])||16;
const matchF=(t,pos)=>1+((defRank(t,pos)-16.5)/16.5)*.15;
const vegasF=t=>VEGAS[t]?1+(VEGAS[t]-22.5)/22.5*.5:1;
function sosOf(p,from,to){const r=schedOf(p.t,from,to).filter(x=>x.g).map(x=>defRank(x.g.opp,p.pos));return r.length?r.reduce((a,b)=>a+b,0)/r.length:16.5}
const LOGS={};
function genLog(p){
  if(LOGS[p.id])return LOGS[p.id];const raw=RAWLOG[p.id],log=[];
  for(let w=1;w<=PLAYED;w++){const e=raw?raw[w-1]:undefined,sch=OPP[p.t]&&OPP[p.t][w];
    if(e===0||(!raw&&!sch)){log.push({w,bye:true});continue}
    if(e&&e.k){const [opp,home,k39,k49,k50,kmiss,xpm,xpmiss]=e.e;log.push({w,opp,home:!!home,k39,k49,k50,kmiss,xpm,xpmiss,...Z,fl:0});continue}
    if(e&&e.dst){const [opp,home,dsk,dint,dfr,dtd,dsf,pa]=e.e;log.push({w,opp,home:!!home,dsk,dint,dfr,dtd,dsf,pa,cmp:0,pyd:0,ptd:0,int:0,ratt:0,ryd:0,rtd:0,tgt:0,rec:0,recyd:0,rectd:0,fl:0});continue}
    if(!e||e.length===2){const o=e?{opp:e[0],home:!!e[1]}:sch;log.push({w,dnp:true,opp:o.opp,home:o.home});continue}
    const [opp,home,cmp,pyd,ptd,int,ratt,ryd,rtd,tgt,rec,recyd,rectd,fl,ts,snap]=e;
    log.push({w,opp,home:!!home,cmp,pyd,ptd,int,ratt,ryd,rtd,tgt,rec,recyd,rectd,fl,ts,snap})}
  return LOGS[p.id]={trend:'',log};
}

/* ===== League settings ===== */
const POS=['QB','RB','WR','TE','K','DST'],OFF=['QB','RB','WR','TE'],OFFK=['QB','RB','WR','TE','K'];
const BASE_SC={pyd:25,ptd:4,int:-2,cmp:0,p300:0,ryd:10,rtd:6,ratt:0,r100:0,recRB:1,recWR:1,recTE:1,recyd:10,rectd:6,rec100:0,fd:0,fl:-2,k39:3,k49:4,k50:5,kmiss:-1,xpm:1,xpmiss:-1,dsk:1,dint:2,dfr:2,dtd:6,dsf:2,pa0:10,pa6:7,pa13:4,pa20:1,pa27:0,pa34:-1,pa35:-4};
const BASE_SLOTS={QB:1,RB:2,WR:2,TE:1,FLEX:1,SFLEX:0,K:1,DST:1,BN:6};
const PRESETS={std:{sc:{...BASE_SC,recRB:0,recWR:0,recTE:0},slots:{...BASE_SLOTS}},half:{sc:{...BASE_SC,recRB:.5,recWR:.5,recTE:.5},slots:{...BASE_SLOTS}},ppr:{sc:{...BASE_SC},slots:{...BASE_SLOTS}},
  sf:{sc:{...BASE_SC,recTE:1.5},slots:{QB:1,RB:2,WR:3,TE:1,FLEX:2,SFLEX:1,K:1,DST:1,BN:6}},'2qb':{sc:{...BASE_SC,ptd:6},slots:{QB:2,RB:2,WR:3,TE:1,FLEX:1,SFLEX:0,K:1,DST:1,BN:6}}};
const BASELINE={teams:12,sc:{...BASE_SC},slots:{...BASE_SLOTS}};
const SC_FIELDS=[['Passing',[['pyd','Passing yards per point',1,'25 = 1 pt per 25 yds'],['ptd','Passing TD',.5],['int','Interception thrown',.5],['cmp','Per completion',.1],['p300','300+ yard game bonus',1]]],
 ['Rushing',[['ryd','Rushing yards per point',1,'10 = 1 pt per 10 yds'],['rtd','Rushing TD',.5],['ratt','Per carry',.1],['r100','100+ yard game bonus',1]]],
 ['Receiving',[['recRB','Per reception (RB)',.25],['recWR','Per reception (WR)',.25],['recTE','Per reception (TE)',.25,'Above WR = TE premium'],['recyd','Receiving yards per point',1],['rectd','Receiving TD',.5],['rec100','100+ yard game bonus',1]]],
 ['Other',[['fd','Rush or catch for a first down',.25],['fl','Fumble lost',.5]]],
 ['Kicking',[['k39','Field goal made, 0-39 yards',.5],['k49','Field goal made, 40-49 yards',.5],['k50','Field goal made, 50+ yards',.5],['kmiss','Field goal missed',.5],['xpm','Extra point made',.5],['xpmiss','Extra point missed',.5]]],
 ['Team defense',[['dsk','Sack',.5],['dint','Interception',.5],['dfr','Fumble recovery',.5],['dtd','Defensive or return TD',.5],['dsf','Safety',.5],['pa0','0 points allowed',1],['pa6','1-6 points allowed',1],['pa13','7-13 points allowed',1],['pa20','14-20 points allowed',1],['pa27','21-27 points allowed',1],['pa34','28-34 points allowed',1],['pa35','35+ points allowed',1]]]];
const SLOT_FIELDS=[['teams','Teams',4,16],['QB','QB',0,3],['RB','RB',0,4],['WR','WR',0,5],['TE','TE',0,3],['FLEX','Flex',0,4],['SFLEX','Superflex',0,2],['K','K',0,2],['DST','D/ST',0,2],['BN','Bench',0,15]];
const TEAM_NAMES=['Monday Night Miracles','Fourth & Long','Red Zone Regulars','Blitz Brigade','Two-Point Conversion','Waiver Wire Kings','Pick Six Society','The Taxi Squad','Hail Mary Club','Sunday Scaries','End Zone Express','Goal Line Stand','Audible Alert','Play Action Pros','Trick Play Turnover'];
const MY_EXAMPLE=['jalen-hurts','dak-prescott','bryce-young','zach-charbonnet','chase-brown','jaylen-warren','tony-pollard','rhamondre-stevenson','drake-london','tee-higgins','courtland-sutton','dj-moore','jakobi-meyers','jauan-jennings','hunter-henry','dallas-goedert'];

/* ===== State ===== */
const KEY='trademetric-v1';
let S;try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){S=null}
const AUTH_HASH=/access_token=|error_description=/.test(location.hash)?location.hash.slice(1):null;
function save(){S.savedAt=Date.now();try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}if(typeof cloudSave==='function')cloudSave()}
let POOL=BUILTIN,byId={};
function setPool(){const base=(S.custom&&S.custom.length)?S.custom:BUILTIN,have=new Set(base.map(p=>p.id));
  POOL=base.concat((S.extraPlayers||[]).filter(x=>!have.has(x.id)).map(x=>({...Z,...KZ,fl:0,id:x.id,n:x.n,pos:x.pos,t:x.t||'FA',status:'',extra:true})));byId={};POOL.forEach(p=>byId[p.id]=p);
  document.getElementById('dl-players').innerHTML=POOL.map(p=>`<option value="${esc(p.n)}">${p.pos} · ${p.t}</option>`).join('');
  if(S.teams)S.teams.forEach(T=>T.players=T.players.filter(id=>byId[id]))}

/* ===== Injury status & opportunities ===== */
const ST_LABEL={Q:'Questionable',D:'Doubtful',O:'Out',IR:'Injured reserve',PUP:'Physically unable to perform',SUS:'Suspended'};
const stOf=id=>{const s=String((byId[id]&&byId[id].status)||'').toUpperCase().trim();return ST_LABEL[s]?s:null};
const LONG_OUT=['IR','PUP','SUS'],isOut=id=>{const s=stOf(id);return s==='O'||LONG_OUT.includes(s)};
const grpOf=pos=>pos==='RB'?'RB':pos==='QB'?'QB':pos==='DST'?'DST':pos==='K'?'K':'REC';
const volOf=p=>p.pos==='RB'?p.ratt+p.tgt:p.tgt;
const hasStatusData=()=>POOL.some(p=>'status' in p);
let BOOST={},WBOOST={},OPPS=[];
function computeBoosts(){BOOST={};WBOOST={};OPPS=[];
  const recent=x=>{const r=RAWLOG[x.id];if(!r)return true;const last=r.slice(-3).filter(e=>e!==0);return last.filter(e=>e&&e.length>2).length>=Math.min(2,last.length)};
  POOL.filter(x=>isOut(x.id)&&x.pos!=='QB'&&volOf(x)>=(x.pos==='RB'?10:5)&&recent(x)).forEach(x=>{const long=LONG_OUT.includes(stOf(x.id));
    const mates=POOL.filter(q=>q.t===x.t&&q.id!==x.id&&grpOf(q.pos)===grpOf(x.pos)&&!isOut(q.id)&&volOf(q)>=2),tot=mates.reduce((a,q)=>a+volOf(q),0),lost=volOf(x)*.7;if(!tot||!lost)return;
    mates.forEach(q=>{const own=volOf(q)||.5,mult=Math.min(1.4,1+lost*(volOf(q)/tot)/own*.6);if(mult<1.1)return;const map=long?BOOST:WBOOST;map[q.id]=(map[q.id]||1)*mult;OPPS.push({id:q.id,from:x.id,mult,long})})})}
function weekMult(id){const s=stOf(id);return (s==='O'||LONG_OUT.includes(s)?0:s==='D'?.3:s==='Q'?.92:1)*(WBOOST[id]||1)}
function matesOut(p){return POOL.filter(q=>q.t===p.t&&q.id!==p.id&&grpOf(q.pos)===grpOf(p.pos)&&isOut(q.id)&&volOf(q)>=3)}
const stHtml=id=>{const s=stOf(id);return s?`<span class="st st-${s}" title="${ST_LABEL[s]}${byId[id].inj?': '+esc(byId[id].inj):''}">${s}</span>`:''};
const oppTxtLine=o=>`Projected up ${Math.round((o.mult-1)*100)}% with ${byId[o.from].n} ${o.long?'on '+ST_LABEL[stOf(o.from)].toLowerCase():'out this week'}.`;

/* ===== Scoring engine ===== */
function erf(x){const s=Math.sign(x);x=Math.abs(x);const t=1/(1+.3275911*x);return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x))}
const pOver=(m,cv,thr)=>m<=0?0:1-.5*(1+erf((thr-m)/(m*cv)/Math.SQRT2));
const fdEst=(o,pos)=>o.ratt*(pos==='QB'?.33:.22)+o.rec*(pos==='RB'?.4:.6);
const per=(v,d)=>d>0?v/d:0;
const paTier=(x,sc)=>x<=0?sc.pa0:x<=6?sc.pa6:x<=13?sc.pa13:x<=20?sc.pa20:x<=27?sc.pa27:x<=34?sc.pa34:sc.pa35;
function paExpected(m,sc){const sd=9.5,c=x=>.5*(1+erf((x-m)/sd/Math.SQRT2)),b=[[-1e9,.5,sc.pa0],[.5,6.5,sc.pa6],[6.5,13.5,sc.pa13],[13.5,20.5,sc.pa20],[20.5,27.5,sc.pa27],[27.5,34.5,sc.pa34],[34.5,1e9,sc.pa35]];return b.reduce((a,[lo,hi,v])=>a+(c(hi)-c(lo))*v,0)}
function dstPts(p,sc,pa){return p.dsk*sc.dsk+p.dint*sc.dint+p.dfr*sc.dfr+p.dtd*sc.dtd+p.dsf*sc.dsf+paExpected(pa??p.pa,sc)}
const kPts=(L,sc)=>(L.k39||0)*sc.k39+(L.k49||0)*sc.k49+(L.k50||0)*sc.k50+(L.kmiss||0)*sc.kmiss+(L.xpm||0)*sc.xpm+(L.xpmiss||0)*sc.xpmiss;
function projPts(p,sc){if(p.pos==='DST')return dstPts(p,sc);if(p.pos==='K')return kPts(p,sc);return per(p.pyd,sc.pyd)+p.ptd*sc.ptd+p.int*sc.int+p.cmp*sc.cmp+(sc.p300?pOver(p.pyd,.28,300)*sc.p300:0)
  +per(p.ryd,sc.ryd)+p.rtd*sc.rtd+p.ratt*sc.ratt+(sc.r100?pOver(p.ryd,.5,100)*sc.r100:0)
  +p.rec*(sc['rec'+p.pos]||0)+per(p.recyd,sc.recyd)+p.rectd*sc.rectd+(sc.rec100?pOver(p.recyd,.55,100)*sc.rec100:0)+fdEst(p,p.pos)*sc.fd+p.fl*sc.fl}
function linePts(L,pos,sc){if(pos==='K')return kPts(L,sc);if(pos==='DST')return L.dsk*sc.dsk+L.dint*sc.dint+L.dfr*sc.dfr+L.dtd*sc.dtd+L.dsf*sc.dsf+paTier(L.pa,sc);return per(L.pyd,sc.pyd)+L.ptd*sc.ptd+L.int*sc.int+L.cmp*sc.cmp+(L.pyd>=300?sc.p300:0)+per(L.ryd,sc.ryd)+L.rtd*sc.rtd+L.ratt*sc.ratt+(L.ryd>=100?sc.r100:0)
  +L.rec*(sc['rec'+pos]||0)+per(L.recyd,sc.recyd)+L.rectd*sc.rectd+(L.recyd>=100?sc.rec100:0)+fdEst(L,pos)*sc.fd+L.fl*sc.fl}
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const sum=(a,f)=>a.reduce((x,y)=>x+f(y),0);

const ECR=DATA.ecr||{},CONS_W={model:.6,cons:.4},STAR_POW=1.5,STAR_REF=6,QB_1QB=.6;
function valuate(L){
  const pts={};POOL.forEach(p=>pts[p.id]=projPts(p,L.sc)*(BOOST[p.id]||1));
  const desc=(a,b)=>pts[b.id]-pts[a.id],byPos={};POS.forEach(x=>byPos[x]=POOL.filter(p=>p.pos===x).sort(desc));
  const used=new Set();POS.forEach(x=>byPos[x].slice(0,L.teams*(L.slots[x]||0)).forEach(p=>used.add(p.id)));
  const take=(elig,n)=>POOL.filter(p=>elig.includes(p.pos)&&!used.has(p.id)).sort(desc).slice(0,n).forEach(p=>used.add(p.id));
  take(['RB','WR','TE'],L.teams*(L.slots.FLEX||0));take(OFF,L.teams*(L.slots.SFLEX||0));
  const repl={};POS.forEach(x=>{const r=byPos[x].find(p=>!used.has(p.id))||byPos[x][byPos[x].length-1];repl[x]=r?pts[r.id]:0});
  const vor={};POOL.forEach(p=>vor[p.id]=pts[p.id]-repl[p.pos]);
  const list=[...POOL].sort((a,b)=>vor[b.id]-vor[a.id]),rank={};list.forEach((p,i)=>rank[p.id]=i+1);
  const posRank={};POS.forEach(x=>byPos[x].forEach((p,i)=>posRank[p.id]=i+1));
  /* consensus: take the experts' order at each position and give the Nth-ranked player our Nth-best projection, so it still uses your scoring */
  const cons={},crank={},tpts={};POS.forEach(x=>{const all=byPos[x],gone=p=>LONG_OUT.includes(stOf(p.id));
    const listed=all.filter(p=>ECR[p.id]!=null).sort((a,b)=>ECR[a.id]-ECR[b.id]),miss=all.filter(p=>ECR[p.id]==null&&!gone(p)),tail=all.filter(p=>ECR[p.id]==null&&gone(p)),order=[];let i=0,j=0;
    while(i<listed.length||j<miss.length){if(j<miss.length&&(i>=listed.length||pts[miss[j].id]>pts[listed[i].id]))order.push(miss[j++]);else order.push(listed[i++])}
    order.concat(tail).forEach((p,k)=>{cons[p.id]=pts[all[k].id];crank[p.id]=k+1})});
  POOL.forEach(p=>tpts[p.id]=CONS_W.model*pts[p.id]+CONS_W.cons*cons[p.id]);
  return {pts,vor,rank,posRank,repl,list,cons,crank,tpts};
}
let V,B,G={},OWN={},VER=0;
function derive(){
  G={};const sc=S.league.sc;
  POOL.forEach(p=>{const {trend,log}=genLog(p);const games=log.filter(g=>!g.bye&&!g.dnp);
    const pts=log.map(g=>g.bye||g.dnp?null:linePts(g,p.pos,sc));const played=pts.filter(x=>x!==null);
    const l3g=games.slice(-3),last3=avg(played.slice(-3)),season=avg(played),proj=V.pts[p.id];
    const useBase=p.tgt+p.ratt+(p.pos==='QB'?p.cmp:0),useL3=avg(l3g.map(g=>g.tgt+g.ratt+(p.pos==='QB'?g.cmp:0)));
    const ur=useBase?useL3/useBase:1;
    const ros=sosOf(p,WEEK+1,17),po=sosOf(p,15,17),last2=played.slice(-2),sd=Math.sqrt(avg(played.map(x=>(x-season)**2))),cv=season?sd/season:0;
    const mates=matesOut(p),role=last3>1.3*proj&&(ur>=1.15||mates.length)?(mates.length?`More work explains the jump: ${mates.map(q=>q.n).join(' and ')} ${mates.length>1?'are':'is'} out.`:`More work explains the jump: he's getting ${Math.round((ur-1)*100)}% more touches and targets lately.`):null;
    let buy=null,risk=null;const noTags=p.pos==='K';
    if(!noTags&&V.vor[p.id]>0&&proj>=8&&last2.length===2&&last2.every(x=>x<.7*proj)&&ur>=.9){
      buy=[`Scored ${last2.map(f1).join(' and ')} the last two weeks, under his ${f1(proj)} average.`,`Still getting the ball (${Math.round(Math.min(ur,1.3)*100)}% of his usual work), so expect a bounce back.`];
      if(ros>=18)buy.push('Easy schedule coming up.');
      if(po>=20)buy.push('Good playoff matchups in Weeks 15 to 17.')}
    if(!noTags&&!buy&&V.rank[p.id]<=80&&V.vor[p.id]>0){const r=[];
      if(last3>1.3*proj&&ur<=1.05&&!mates.length)r.push(`Scoring ${f1(last3)} lately without getting more work. That usually cools off.`);
      if(ros<=10)r.push('Hard schedule coming up.');
      if(po<=6)r.push('Tough playoff matchups in Weeks 15 to 17.');
      if(r.length&&cv>.55&&played.length>=5)r.push(`Up-and-down weeks: from ${f1(Math.min(...played))} to ${f1(Math.max(...played))}.`);
      if(r.length)risk=r}
    let tag=null;if(buy)tag='buy';else if(!noTags&&V.vor[p.id]>0&&proj>=9&&last3>1.5*proj&&ur<=1.12&&!mates.length)tag='sell';
    const nx=OPP[p.t]&&OPP[p.t][WEEK];const projNext=nx?(p.pos==='DST'?(dstPts(p,S.league.sc,VEGAS[nx.opp]??p.pa)*(V.pts[p.id]/Math.max(.1,projPts(p,S.league.sc)))):proj*matchF(nx.opp,p.pos)*weekMult(p.id)*vegasF(p.t)):0;
    const tshare=p.pos==='QB'||p.pos==='DST'||p.pos==='K'?null:avg(games.map(x=>x.ts||0)),snaps=games.map(x=>x.snap).filter(x=>x>=0),snap=snaps.length?avg(snaps):null,rp=Math.max(1,V.repl[p.pos]);
    const oppg=p.pos==='QB'||p.pos==='DST'||p.pos==='K'||!games.length?null:avg(games.map(x=>x.ratt+x.tgt));
    const trendPct=played.length>=4&&season>0?last3/season-1:null,cons=played.length?played.filter(x=>x>=rp).length/played.length:null,boom=played.length?played.filter(x=>x>=rp*1.75).length/played.length:null;
    G[p.id]={log,pts,last3,season,ur,tag,trend,ros,po,cv,buy,risk,role,tshare,snap,trendPct,cons,boom,oppg,gp:played.length,mates,opp:OPPS.filter(o=>o.id===p.id),next:nx?{...nx,rank:defRank(nx.opp,p.pos)}:null,projNext,mkt:.55*proj+.45*(played.length?last3:proj)}});
}
function recompute(){computeBoosts();V=valuate(S.league);B=valuate(BASELINE);derive();applyLive();rebuildOwn();VER++}
/* ===== Live game-day data (/api/live) ===== */
let LIVE=null,LIVEST={},LIVE_TIMER=null;
function applyLive(){
  if(!LIVE||LIVE.week!==WEEK)return;const sc=S.league.sc;
  POOL.forEach(p=>{const gm=LIVE.games[p.t],g=G[p.id];if(!gm||!g||gm.state==='pre')return;const st=LIVEST[p.id];
    if(p.pos==='DST'){const L=st||{dsk:0,dint:0,dfr:0,dtd:0,dsf:0,pa:gm.oppScore||0},stat=L.dsk*sc.dsk+L.dint*sc.dint+L.dfr*sc.dfr+L.dtd*sc.dtd+L.dsf*sc.dsf,pa=Math.max(L.pa||0,gm.oppScore||0);
      const projStat=p.dsk*sc.dsk+p.dint*sc.dint+p.dfr*sc.dfr+p.dtd*sc.dtd+p.dsf*sc.dsf,estPA=gm.state==='post'?pa:pa+(VEGAS[gm.opp]??p.pa)*gm.rem;
      const pp=PLAT&&PLAT.pts[p.id];g.live={pts:pp!=null?pp:gm.state==='post'?stat+paTier(pa,sc):stat,state:gm.state,detail:gm.detail,rem:gm.rem,src:pp!=null?PLAT.src:null};g.projNext=pp!=null&&gm.state==='post'?pp:stat+projStat*gm.rem+paTier(Math.round(estPA),sc);return}
    const pp=PLAT&&PLAT.pts[p.id],pts=pp!=null?pp:st?linePts(st,p.pos,sc):0;g.live={pts,state:gm.state,detail:gm.detail,rem:gm.rem,src:pp!=null?PLAT.src:null};g.projNext=gm.state==='post'?pts:pts+g.projNext*gm.rem})}
function liveStatus(){if(!LIVE||!LIVE.injuries)return;const keep=['IR','PUP','SUS'];
  LIVE.injuries.forEach(([n,t,st])=>{const p=findExact(n);if(!p||p.pos==='DST'||(p.t!==t&&norm(p.n)!==norm(n)))return;
    if(st)p.status=st;else if(!keep.includes(String(p.status||'').toUpperCase()))p.status=''})}
async function loadLive(){
  clearTimeout(LIVE_TIMER);let next=10*60e3;
  try{const r=await fetch('/api/live?week='+WEEK+'&b='+Math.floor(Date.now()/120000));if(r.ok){const j=await r.json();
    if(j&&j.games){await loadPlatform();LIVE=j;LIVEST={};(j.players||[]).forEach(x=>{const p=x.pos==='DST'?byId['dst-'+String(x.t).toLowerCase()]:findExact(x.n);if(p&&p.pos===x.pos)LIVEST[p.id]=x.s});
      liveStatus();recompute();const a=document.activeElement;if(!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)))render();if(j.live||Object.values(j.games).some(g=>g.state==='pre'&&Date.parse(g.start)-Date.now()<30*60e3))next=2*60e3}}}catch(e){}
  LIVE_TIMER=setTimeout(()=>{if(document.hidden)document.addEventListener('visibilitychange',loadLive,{once:true});else loadLive()},next)}
const liveOf=id=>G[id]&&G[id].live;
/* Real starting lineups from the league's platform. Sleeper refreshes with live data; ESPN is captured at import. */
const SLOT_ORDER=['QB','RB','WR','TE','FLEX','SF','K','DST'];
let LIVE_LU=null,PLAT=null;
const SLEEPER_SLOT={QB:'QB',RB:'RB',WR:'WR',TE:'TE',FLEX:'FLEX',REC_FLEX:'FLEX',WRRB_FLEX:'FLEX',SUPER_FLEX:'SF',K:'K',DEF:'DST'};
function realLineup(tid){let r=LIVE_LU&&LIVE_LU[tid];if(!r&&S.real&&S.real.lineups&&S.real.lineupWeek===WEEK)r=S.real.lineups[tid];if(!r||!r.length)return null;
  return {slots:r.map(x=>({label:x.label,p:x.id&&byId[x.id]||null})),bench:[],total:0,real:true}}
const sleeperDst=pid=>/^[A-Z]{2,3}$/.test(pid)?'dst-'+(pid==='LA'?'lar':pid.toLowerCase()):null;
/* Real lineups and the platform's own fantasy points for this week, so numbers match Sleeper or ESPN exactly */
async function loadSleeperLineups(){const src=S.real&&S.real.src;if(!src||src.type!=='sleeper')return;
  try{const ms=await getJSON(`https://api.sleeper.app/v1/league/${src.league}/matchups/${WEEK}`),out={},pts={},team={};
    (ms||[]).forEach(m=>{const tid=src.rid[m.roster_id];if(!tid)return;team[tid]=+m.points||0;
      Object.entries(m.players_points||{}).forEach(([pid,v])=>{const id=src.pmap[pid]||sleeperDst(pid);if(id)pts[id]=+v||0});
      if(Array.isArray(m.starters))out[tid]=m.starters.map((pid,i)=>({label:SLEEPER_SLOT[src.labels[i]]||null,id:src.pmap[pid]||sleeperDst(pid)})).filter(x=>x.label)});
    LIVE_LU=out;PLAT={src:'Sleeper',pts,team,at:Date.now()}}catch(e){}}
const ESPN_SLOT_MAP={0:'QB',2:'RB',4:'WR',6:'TE',16:'DST',17:'K',23:'FLEX',3:'FLEX',5:'FLEX',7:'SF'};
function readEspnWeek(d){const src=S.real&&S.real.src;if(!d||!src||src.type!=='espn')return;const out={},pts={},team={};
  (d.teams||[]).forEach(t=>{const tid=src.rid[t.id];if(!tid)return;const L=[];
    ((t.roster&&t.roster.entries)||[]).forEach(e=>{const pl=e.playerPoolEntry&&e.playerPoolEntry.player;if(!pl)return;const q=findExact(pl.fullName)||(pl.defaultPositionId===16?byId['dst-'+String(pl.proTeamAbbreviation||'').toLowerCase()]:null);
      const st=(pl.stats||[]).find(x=>x.scoringPeriodId===WEEK&&x.statSourceId===0&&(x.statSplitTypeId===1||x.statSplitTypeId==null));if(q&&st)pts[q.id]=+st.appliedTotal||0;
      if(ESPN_SLOT_MAP[e.lineupSlotId])L.push({label:ESPN_SLOT_MAP[e.lineupSlotId],id:q?q.id:null})});
    L.sort((a,b)=>SLOT_ORDER.indexOf(a.label)-SLOT_ORDER.indexOf(b.label));if(L.length)out[tid]=L});
  (d.schedule||[]).filter(m=>m.matchupPeriodId===WEEK).forEach(m=>[m.home,m.away].forEach(x=>{if(x&&src.rid[x.teamId])team[src.rid[x.teamId]]=+(x.totalPointsLive??x.totalPoints)||0}));
  LIVE_LU=out;PLAT={src:'ESPN',pts,team,at:Date.now()}}
async function loadEspnWeek(){const src=S.real&&S.real.src;if(!src||src.type!=='espn')return;
  const creds=src.priv?(IMP.espnCreds||espnSaved()):null;if(src.priv&&!(creds&&creds.s2))return;
  try{readEspnWeek(await espnFetch(src.league,creds,WEEK))}catch(e){}}
/* ===== Background league sync: rosters, team names, records, starters and points.
   Runs when the site opens and every few minutes. Scoring settings, follows and everything else stay as they are. ===== */
var SLP_IDS=null,SYNC_AT=0,POOL_DIRTY=false;
async function sleeperIds(){if(SLP_IDS)return SLP_IDS;try{const r=await fetch('/api/players');if(r.ok)SLP_IDS=await r.json()}catch(e){}return SLP_IDS||{}}
function rosterChanged(T,ids){const a=[...T.players].sort().join(),b=[...ids].sort().join();if(a===b)return false;T.players=ids;return true}
async function syncSleeper(){const src=S.real&&S.real.src;if(!src||src.type!=='sleeper')return false;
  const [rosters,users]=await Promise.all([getJSON(`https://api.sleeper.app/v1/league/${src.league}/rosters`),getJSON(`https://api.sleeper.app/v1/league/${src.league}/users`)]);
  let changed=false,ids=await sleeperIds();
  /* re-check saved Sleeper-to-player links against Sleeper's real names; drop any that were matched loosely */
  if(ids&&Object.keys(ids).length)for(const [pid,id] of Object.entries(src.pmap)){const x=ids[pid],q=byId[id];if(x&&(!q||norm(q.n)!==norm(x[0])))delete src.pmap[pid]}
  for(const r of rosters){const tid=src.rid[r.roster_id],T=tid&&teamById(tid);if(!T)continue;
    const out=[];for(const pid of (r.players||[])){let id=src.pmap[pid]||sleeperDst(pid);
      if(!id){const x=ids&&ids[pid];const q=x&&findExact(x[0],x[1],x[2]);if(q&&q.pos===x[1]){id=q.id;src.pmap[pid]=id}else if(x&&OFFK.includes(x[1])){id=addExtraPlayer(x[0],x[1],x[2]);src.pmap[pid]=id;POOL_DIRTY=true}}
      if(id&&(byId[id]||POOL_DIRTY))out.push(id)}
    if(rosterChanged(T,[...new Set(out)]))changed=true;
    const us=users.find(x=>x.user_id===r.owner_id),nm=(us&&us.metadata&&us.metadata.team_name)||(us&&us.display_name);if(nm&&nm!==T.name){T.name=nm;changed=true}
    const st=r.settings||{};S.real.rec[tid]={w:st.wins||0,l:st.losses||0,t:st.ties||0,pf:(st.fpts||0)+(st.fpts_decimal||0)/100}}
  return changed}
function syncEspnRosters(d){const src=S.real&&S.real.src;if(!d||!src||src.type!=='espn')return false;let changed=false;
  (d.teams||[]).forEach(t=>{const tid=src.rid[t.id],T=tid&&teamById(tid);if(!T)return;
    const EP={1:'QB',2:'RB',3:'WR',4:'TE',5:'K'};((t.roster&&t.roster.entries)||[]).forEach(e=>{const pl=e.playerPoolEntry&&e.playerPoolEntry.player;if(pl&&EP[pl.defaultPositionId]&&!findExact(pl.fullName,EP[pl.defaultPositionId])){addExtraPlayer(pl.fullName,EP[pl.defaultPositionId]);POOL_DIRTY=true}});if(POOL_DIRTY)setPool();
    const out=((t.roster&&t.roster.entries)||[]).map(e=>e.playerPoolEntry&&e.playerPoolEntry.player).filter(Boolean).map(pl=>{const q=pl.defaultPositionId===16?(byId['dst-'+String(pl.proTeamAbbreviation||'').toLowerCase()]||findExact(pl.fullName)):findExact(pl.fullName);return q&&q.id}).filter(Boolean);
    if(out.length&&rosterChanged(T,[...new Set(out)]))changed=true;
    const nm=t.name||[t.location,t.nickname].filter(Boolean).join(' ');if(nm&&nm!==T.name){T.name=nm;changed=true}
    const o=(t.record&&t.record.overall)||{};S.real.rec[tid]={w:o.wins||0,l:o.losses||0,t:o.ties||0,pf:o.pointsFor||0}});
  return changed}
async function loadPlatform(){const src=S.real&&S.real.src;if(!src)return;let changed=false;
  try{if(src.type==='sleeper'){changed=await syncSleeper();await loadSleeperLineups()}
    else if(src.type==='espn'){const creds=src.priv?(IMP.espnCreds||espnSaved()):null;if(src.priv&&!(creds&&creds.s2))return;
      const d=await espnFetch(src.league,creds,WEEK);changed=syncEspnRosters(d);readEspnWeek(d)}}catch(e){}
  SYNC_AT=Date.now();if(POOL_DIRTY){POOL_DIRTY=false;setPool();changed=true}if(changed){REC_CACHE={v:-1};save();rebuildOwn()}}
async function syncNow(){if(!S.real||!S.real.src)return;await loadPlatform();recompute();const a=document.activeElement;if(!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)))render()}
function lprojHtml(id){const g=G[id],l=liveOf(id);
  if(l)return `<div class="lproj live ${l.state}"><b>${f1(l.pts)}</b><span>${l.state==='post'?'final':'proj '+f1(g.projNext)}</span></div>`;
  return `<div class="lproj">${g.next?`<b>${f1(g.projNext)}</b><span>${f1(g.season)} avg</span>`:'<b class="muted">—</b><span>Bye</span>'}</div>`}
function liveTxt(id){const l=liveOf(id);if(!l)return '';return `<span class="live-tag ${l.state}">${l.state==='post'?'Final':esc(l.detail||'Live')}</span>`}
function rebuildOwn(){OWN={};S.teams.forEach(T=>T.players.forEach(id=>OWN[id]=T.id))}
const teamById=id=>S.teams.find(T=>T.id===id);
const myTeam=()=>teamById(S.me);

/* lineup: val = id -> number */
const projV=id=>V.pts[id],nextV=id=>G[id].projNext,mktV=id=>G[id].mkt;
function lineup(ids,val){
  const ps=ids.map(id=>byId[id]).filter(Boolean).sort((a,b)=>val(b.id)-val(a.id));
  const used=new Set(),slots=[],s=S.league.slots;
  const fill=(label,elig,n)=>{for(let i=0;i<n;i++){const c=ps.find(p=>elig.includes(p.pos)&&!used.has(p.id));if(c)used.add(c.id);slots.push({label,p:c||null})}};
  OFF.forEach(x=>fill(x,[x],s[x]||0));fill('FLEX',['RB','WR','TE'],s.FLEX||0);fill('SF',OFF,s.SFLEX||0);fill('K',['K'],s.K||0);fill('DST',['DST'],s.DST||0);
  const bench=ps.filter(p=>!used.has(p.id)).map(p=>p.id);
  return {slots,bench,total:slots.reduce((a,x)=>a+(x.p?val(x.p.id):0),0)};
}
function rosterSize(){const s=S.league.slots;return POS.reduce((a,x)=>a+(s[x]||0),0)+(s.FLEX||0)+(s.SFLEX||0)+(s.BN||0)}

/* team strength across the league */
let TS_CACHE={v:-1};
function teamStats(){
  if(TS_CACHE.v===VER)return TS_CACHE.d;
  const rows=S.teams.map(T=>{const lu=lineup(T.players,projV),byPos={};POS.forEach(x=>byPos[x]=lu.slots.filter(s=>s.p&&s.p.pos===x).reduce((a,s)=>a+V.pts[s.p.id],0));
    const depth={};POS.forEach(x=>depth[x]=lu.bench.filter(id=>byId[id].pos===x).reduce((a,id)=>a+Math.max(0,V.vor[id]+2),0));return {T,total:lu.total,byPos,depth,lu,n:T.players.length}});
  const filled=rows.filter(r=>r.n>0),mean={};POS.forEach(x=>mean[x]=avg(filled.map(r=>r.byPos[x])));
  const s=S.league.slots;
  rows.forEach(r=>{r.rel={};POS.forEach(x=>r.rel[x]=r.byPos[x]-mean[x]);
    const scale=x=>Math.max(1,(s[x]||0));
    r.needs=POS.filter(x=>r.rel[x]/scale(x)<-1.2).sort((a,b)=>r.rel[a]/scale(a)-r.rel[b]/scale(b)).slice(0,2);
    r.deep=POS.filter(x=>r.depth[x]>3).sort((a,b)=>r.depth[b]-r.depth[a]).slice(0,1);
    r.weak=[...POS].filter(x=>(s[x]||0)>0||x!=='QB'||s.SFLEX).sort((a,b)=>r.rel[a]/scale(a)-r.rel[b]/scale(b))[0]});
  const ranked=[...rows].sort((a,b)=>b.total-a.total);ranked.forEach((r,i)=>r.rank=i+1);
  TS_CACHE={v:VER,d:{rows,ranked,mean}};return TS_CACHE.d;
}

/* ===== Trade engine ===== */
const tv=id=>Math.max(0,V.vor[id]+2);
/* Trade Score building blocks */
const sfLeague=()=>(S.league.slots.SFLEX||0)>0||(S.league.slots.QB||1)>1;
function aboveRepl(id,src){const p=byId[id];let v=(src==='cons'?V.cons[id]:V.tpts[id])-V.repl[p.pos];if(p.pos==='QB'&&!sfLeague())v*=QB_1QB;if(LONG_OUT.includes(stOf(id)))v*=.25;return Math.max(0,v)}
const starW=v=>Math.pow(v,STAR_POW)/Math.pow(STAR_REF,STAR_POW-1);
const tval=id=>starW(aboveRepl(id)),cval=id=>starW(aboveRepl(id,'cons'));
const tptsV=id=>V.tpts[id];
const tradeGrade=x=>x>=3?'A+':x>=2?'A':x>=1.2?'B+':x>=.5?'B':x>=-.5?'C':x>=-1.5?'D':'F';
function subsets(arr,max){const res=[];const rec=(i,cur)=>{if(cur.length)res.push(cur);if(cur.length===max)return;for(let j=i;j<arr.length;j++)rec(j+1,[...cur,arr[j]])};rec(0,[]);return res}
let TR_CACHE={v:-1,list:[]},TR_LOOSE={v:-1,list:[]};
/* ================= Trade model (redraft) =================
   1 Player value   rest-of-season points per game x chance he plays that week x matchup, playoff weeks count 1.75x
   2 Team impact    week-by-week change in the best starting lineup + bench insurance + a freed roster spot
   3 Will they      market value (FantasyCalc, KeepTradeCut, FantasyPros) + their lineup change + filling a need
   4 Final score    season sim odds + playoff-week points, weighted by team mode, minus injury and stacking risk */
var MARKET=null;
fetch('data/market.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(d=>{if(d){MARKET=d;VER++;if(typeof render==='function'&&tab==='trade')render()}}).catch(()=>{});
const PO_WT=1.75;
const poWeeks=()=>{const r=(S.real&&S.real.regWeeks)||14;return [r+1,r+2,r+3].filter(w=>w<=18)};
const tmWeeks=()=>{const out=[];for(let w=WEEK;w<=Math.max(...poWeeks());w++)out.push(w);return out};
const wkWt=w=>poWeeks().includes(w)?PO_WT:1;
/* when a player on IR / PUP / suspended / out should be back (an estimate: the injury feed has no return dates) */
function retWeek(id){const s=stOf(id);return s==='IR'||s==='PUP'?WEEK+4:s==='SUS'?WEEK+2:s==='O'?WEEK+1:WEEK}
function playChance(id,w){const r=retWeek(id);if(w<r)return 0;const s=stOf(id);if(w===WEEK){if(s==='Q')return .8;if(s==='D')return .3}return w===r&&r>WEEK?.85:.96}
let EWK={v:-1,m:{}};
function ewk(id,w){if(EWK.v!==VER)EWK={v:VER,m:{}};const k=id+'|'+w;if(k in EWK.m)return EWK.m[k];const p=byId[id];let v=0;
  if(p&&BYE[p.t]!==w){const o=OPP[p.t]&&OPP[p.t][w];if(o||w===WEEK)v=(w===WEEK&&G[id]?G[id].projNext:V.pts[id]*(o?matchF(o.opp,p.pos):1))*playChance(id,w)}
  return EWK.m[k]=v}
let PVC={v:-1,m:{}},MVC={v:-1,m:{}};
function playerValue(id){if(PVC.v!==VER)PVC={v:VER,m:{}};const c=PVC.m[id];if(c!=null)return c;return PVC.m[id]=sum(tmWeeks(),w=>ewk(id,w)*wkWt(w))}
const ELIG={QB:['QB'],RB:['RB'],WR:['WR'],TE:['TE'],FLEX:['RB','WR','TE'],SF:OFF,K:['K'],DST:['DST']};
/* best lineup for one week plus "bench insurance": a backup's points x the chance the starter ahead of him misses */
function weekTeam(players,w){const f=id=>ewk(id,w),lu=lineup(players,f);let ins=0;
  lu.slots.forEach(x=>{if(!x.p)return;const miss=1-playChance(x.p.id,w)+.04;if(miss<=.05)return;
    const b=lu.bench.filter(id=>ELIG[x.label]&&ELIG[x.label].includes(byId[id].pos)).reduce((m,id)=>Math.max(m,f(id)),0);ins+=Math.min(1,miss)*b*.9});
  return {pts:lu.total,ins,lu}}
/* roster after the deal: drop the least valuable bench player if over the limit, or add the best free agent with a freed spot */
function rosterAfter(players,out,inn,taken){let after=players.filter(x=>!out.includes(x)).concat(inn),drop=null,fa=null;const lim=rosterSize();
  while(after.length>Math.max(lim,players.length)){const st=new Set(lineup(after,id=>playerValue(id)).slots.filter(x=>x.p).map(x=>x.p.id));
    const c=after.filter(id=>!st.has(id)&&!inn.includes(id)).sort((a,b)=>playerValue(a)-playerValue(b))[0];if(!c)break;drop=c;after=after.filter(x=>x!==c)}
  if(after.length<players.length){const best=POOL.filter(p=>!OWN[p.id]&&!taken.has(p.id)&&p.pos!=='DST'&&p.pos!=='K').map(p=>p.id).sort((a,b)=>playerValue(b)-playerValue(a))[0];if(best){fa=best;after=after.concat(best)}}
  return {after,drop,fa}}
function teamImpact(before,after){const W=tmWeeks(),PO=poWeeks();let tot=0,po=0,poB=0,poA=0;const weeks=[];
  W.forEach(w=>{const b=weekTeam(before,w),a=weekTeam(after,w),d=(a.pts+a.ins)-(b.pts+b.ins);tot+=d*wkWt(w);
    if(PO.includes(w)){po+=a.pts-b.pts;poB+=b.pts;poA+=a.pts;weeks.push({w,b:b.pts,a:a.pts})}});
  const wsum=sum(W,wkWt)||1;return {perWeek:tot/wsum,po:po/Math.max(1,PO.length),poB,poA,weeks}}
/* market value: each source's ranking mapped onto this league's points-above-replacement scale, then averaged */
let MKT={v:-1};
function marketTable(){if(MKT.v===VER)return MKT;const sf=sfLeague(),vor=POOL.filter(p=>p.pos!=='K'&&p.pos!=='DST').map(p=>Math.max(0,V.vor[p.id])).sort((a,b)=>b-a);
  const srcs={};const add=(name,vals)=>{if(!vals)return;const ids=Object.keys(vals).filter(id=>byId[id]).sort((a,b)=>vals[b]-vals[a]);if(ids.length<50)return;const m={};ids.forEach((id,i)=>m[id]=vor[i]||0);srcs[name]=m};
  if(MARKET){add('FantasyCalc',MARKET[sf?'fc2':'fc1']);add('KeepTradeCut',MARKET[sf?'ktc2':'ktc1'])}
  const fp={};POOL.forEach(p=>{if(ECR[p.id]!=null)fp[p.id]=Math.max(0,V.cons[p.id]-V.repl[p.pos])});if(Object.keys(fp).length>50)srcs.FantasyPros=fp;
  MKT={v:VER,srcs};return MKT}
function marketValue(id){if(MVC.v!==VER)MVC={v:VER,m:{}};if(MVC.m[id]!=null)return MVC.m[id];return MVC.m[id]=marketValue0(id)}
function marketValue0(id){const m=marketTable().srcs,vals=Object.values(m).map(x=>x[id]).filter(x=>x!=null);
  let v=vals.length?avg(vals):aboveRepl(id);if(byId[id].pos==='QB'&&!sfLeague())v*=QB_1QB;return starW(Math.max(0,v))}
function marketLabel(){const s=(MARKET&&MARKET.sources)||{},d=x=>x?new Date(x+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric'}):'';const parts=[];
  if(marketTable().srcs.FantasyCalc)parts.push(`FantasyCalc ${d(s.fantasycalc&&s.fantasycalc.date)}`);if(marketTable().srcs.KeepTradeCut)parts.push(`KeepTradeCut ${d(s.keeptradecut&&s.keeptradecut.date)}`);
  if(marketTable().srcs.FantasyPros)parts.push(`FantasyPros ${d(DATA.ecrDate)}`);return parts.length?`Market values: saved snapshot from ${parts.join(', ')}`:'Market values: TradeMetric projections (no market snapshot loaded)'}
/* risk: injury-prone players coming in, and too many starters from one NFL team */
function injRisk(id){const g=G[id],s=stOf(id),p=byId[id];let r={Q:.35,D:.7,O:.5,IR:.6,PUP:.6,SUS:.3}[s]||0;
  const teamG=g.log.filter(x=>!x.bye).length;if(teamG)r+=Math.max(0,(teamG-g.gp)/teamG)*1.2;return r*Math.max(.5,V.pts[id]/10)}
function stackPen(players){const st=lineup(players,id=>playerValue(id)).slots.filter(x=>x.p&&x.p.pos!=='DST'&&x.p.pos!=='K').map(x=>x.p.t),c={};st.forEach(t=>c[t]=(c[t]||0)+1);return sum(Object.values(c),n=>Math.max(0,n-2))*.5}
function teamMode(po){return po>=.6?'contender':po<=.25?'longshot':'middle'}
const MODE_W={contender:{L:.4,P:1,PO:.15,T:.6,U:0,SH:0,R:1},middle:{L:.7,P:.6,PO:.3,T:.3,U:.2,SH:.2,R:1},longshot:{L:.6,P:.25,PO:.35,T:.25,U:.5,SH:.6,R:.6}};
const MODE_TXT={contender:'Contender: title odds and playoff weeks count most',middle:'In the hunt: playoff odds count most',longshot:'Long shot: upside and selling high count more'};
function evalTrade(give,get,partnerId,opts={}){
  const me=myTeam(),P=teamById(partnerId),taken=new Set([...give,...get]);
  const mine=rosterAfter(me.players,give,get,taken);if(mine.fa)taken.add(mine.fa);const theirs=P?rosterAfter(P.players,get,give,taken):{after:[],drop:null,fa:null};
  const you=teamImpact(me.players,mine.after),them=P?teamImpact(P.players,theirs.after):{perWeek:0,po:0,weeks:[]};
  const vIn=sum(get,playerValue),vOut=sum(give,playerValue);
  /* will they accept */
  const mIn=sum(give,marketValue),mOut=sum(get,marketValue),tn=P?needsOf(partnerId):[];
  const theirStart=P?new Set(lineup(theirs.after,id=>playerValue(id)).slots.filter(x=>x.p).map(x=>x.p.id)):new Set();
  const fillsNeed=give.some(id=>tn.includes(byId[id].pos)&&theirStart.has(id));
  const themNet=.55*(mIn-mOut)+.45*them.perWeek+(fillsNeed?.6:0);
  /* your side */
  let sb=null,sa=null;if(opts.sim!==false){sb=simulate();sa=simulate({[S.me]:mine.after,...(P?{[partnerId]:theirs.after}:{})})}
  const po0=sb?sb[S.me].playoff:.5,mode=teamMode(po0),Wm=MODE_W[mode];
  const dPO=sb&&sa?(sa[S.me].playoff-sb[S.me].playoff)*100:0,dT=sb&&sa?(sa[S.me].title-sb[S.me].title)*100:0;
  const boom=ids=>sum(ids,id=>(G[id].boom||0)*V.pts[id]);const upside=(boom(get)-boom(give))/3;
  const sellHigh=give.filter(id=>G[id].tag==='sell').length-get.filter(id=>G[id].tag==='sell').length+get.filter(id=>G[id].tag==='buy').length*.5;
  const risk=(sum(get,injRisk)-sum(give,injRisk))*.6+(stackPen(mine.after)-stackPen(me.players));
  const parts={L:Wm.L*you.perWeek,P:Wm.P*you.po,PO:Wm.PO*dPO,T:Wm.T*dT,U:Wm.U*upside,SH:Wm.SH*sellHigh,R:-Wm.R*risk};
  const youNet=sum(Object.values(parts),x=>x);
  return {mode,parts,youNet,themNet,d:youNet-themNet,gYou:tradeGrade(youNet),gThem:tradeGrade(themNet),myLG:you.perWeek,thLG:them.perWeek,
    vIn,vOut,mIn,mOut,fillsNeed,you,them,mine,theirs,dPO,dT,po0,po1:sa?sa[S.me].playoff:null,t0:sb?sb[S.me].title:null,t1:sa?sa[S.me].title:null,risk,upside,sellHigh}}
function fairness(give,get,partnerId,mode=RATE_MODE,pre){
  const e=pre||evalTrade(give,get,partnerId),d=mode==='hm'?e.d:e.myLG-e.thLG,share=1/(1+Math.exp(-d/(mode==='hm'?3:4))),x=share-.5,ad=Math.abs(x);
  const who=x>0?'you':'them',label=ad<.04?'Even trade':ad<.1?`Slightly favors ${who}`:ad<.2?`Favors ${who}`:`Heavily favors ${who}`;
  return {share,label,d,e,mode}}
/* suggestions: a quick screen on value and market, then the full model (with the season sim) on the best candidates */
function allTrades(loose=false){
  if(!loose&&TR_CACHE.v===VER)return TR_CACHE.list;if(loose&&TR_LOOSE.v===VER)return TR_LOOSE.list;
  const me=myTeam();if(!me||me.players.length<2){TR_CACHE={v:VER,list:[]};return []}
  const ok=id=>byId[id].pos!=='DST'&&byId[id].pos!=='K'&&(tval(id)>=.3||marketValue(id)>=.5);
  const mine=me.players.filter(ok).sort((a,b)=>playerValue(b)-playerValue(a)).slice(0,9);
  const mk=arr=>subsets(arr,2).map(s=>({s,pv:sum(s,playerValue),mv:sum(s,marketValue),min:Math.min(...s.map(marketValue))}));
  const mySubs=mk(mine),quick=[],wsum=sum(tmWeeks(),wkWt)||1;
  S.teams.forEach(T=>{if(T.id===S.me||T.players.length<4)return;
    const thSubs=mk(T.players.filter(ok).sort((a,b)=>playerValue(b)-playerValue(a)).slice(0,10));
    for(const g of mySubs)for(const r of thSubs){const n=g.s.length+r.s.length;if(n>3)continue;if(n===3&&Math.min(g.min,r.min)<.6)continue;
      if(g.mv<r.mv*(loose?.75:.85)-(loose?.6:.3))continue;if(g.mv>r.mv*1.8+2.5)continue;
      const q=r.pv-g.pv;if(q<(loose?-30:-15))continue;const youP=q/wsum,themP=.55*(g.mv-r.mv);quick.push({team:T.id,give:g.s,get:r.s,q:Math.min(youP,themP+.6)+.15*(youP+themP)})}});
  quick.sort((a,b)=>b.q-a.q);
  const pre=quick.slice(0,loose?180:160).map(t=>({...t,e:evalTrade(t.give,t.get,t.team,{sim:false})}))
    .filter(t=>t.e.themNet>=(loose?-1.2:-.6)&&t.e.youNet>(loose?-.3:0)).sort((a,b)=>(b.e.youNet+.3*Math.min(b.e.themNet,1.5))-(a.e.youNet+.3*Math.min(a.e.themNet,1.5)));
  const out=[];
  for(const t of pre){const e=t.e;if(e.youNet<(loose?.05:.3)||e.d>(loose?3.2:2.8))continue;
    out.push({team:t.team,give:t.give,get:t.get,e,full:false,myGain:e.myLG,thGain:e.thLG,fillsNeed:e.fillsNeed,score:e.youNet+.4*Math.min(e.themNet,1.5)-.3*(t.give.length+t.get.length-2)})}
  out.sort((a,b)=>b.score-a.score);if(loose){TR_LOOSE={v:VER,list:out};return out}TR_CACHE={v:VER,list:out};return out;
}
function fullEval(t){if(!t.full){t.e=evalTrade(t.give,t.get,t.team);t.full=true;t.myGain=t.e.myLG;t.thGain=t.e.thLG}return t}
function oddsDelta(t){fullEval(t);return (t.e.dPO+t.e.dT)/100}
function pickDiverse(list,n,skip=0,loose=false,qbTaken=0){
  const res=[],usedP=new Set(),usedT=new Set();let qb=qbTaken;const hasQB=t=>t.give.concat(t.get).some(id=>byId[id].pos==='QB');
  for(const t of list.slice(skip).concat(list.slice(0,skip))){if(res.length>=n)break;if(usedT.has(t.team)||t.give.concat(t.get).some(id=>usedP.has(id))||(qb&&hasQB(t)))continue;fullEval(t);if(!loose&&(t.e.dPO<-1||t.e.youNet<.2))continue;res.push(t);if(hasQB(t))qb++;usedT.add(t.team);t.give.concat(t.get).forEach(id=>usedP.add(id))}
  return res}
let RATE_MODE='hm';
function needsOf(teamId){const r=teamStats().rows.find(x=>x.T.id===teamId);if(!r)return [];return r.needs.length?r.needs:(teamId===S.me?weakList(r).slice(0,1):[])}
/* playoff impact panel: before vs after for odds, Weeks 15-17 points and those weeks' matchups */
function playoffPanel(e,give,get,compact){const PO=poWeeks(),d=e.you.poA-e.you.poB,dpo=e.dPO;
  const call=d>=2&&dpo>=-1?['good','Better for your playoff run']:d<=-2&&dpo<=1?['bad','Hurts your playoff run']:d<=-2&&dpo>1?['mixed','Helps you make the playoffs, weaker in the playoff weeks']:d>=2&&dpo<-1?['mixed','Stronger in the playoff weeks, lower odds of getting there']:dpo>=2?['good','Better odds of making the playoffs']:dpo<=-2?['bad','Lowers your playoff odds']:['even','About even for the playoffs'];
  const opp=(id,w)=>{const p=byId[id],o=OPP[p.t]&&OPP[p.t][w];if(!o)return `<span class="mu-chip bye">Bye</span>`;const r=defRank(o.opp,p.pos);return `<span class="mu-chip ${r>=24?'easy':r<=8?'hard':''}">${o.home?'':'@'}${o.opp}</span>`};
  const who=ids=>ids.filter(id=>byId[id].pos!=='DST'&&byId[id].pos!=='K');
  const pr=(l,a,b,fmt)=>`<tr><td>${l}</td><td class="r num">${fmt(a)}</td><td class="r num"><b>${fmt(b)}</b></td><td class="r num ${b-a>=0?'up':'down'}">${b-a>=0?'+':'−'}${fmt(Math.abs(b-a)).replace('%','')}${fmt===pct?' pts':''}</td></tr>`;
  const wkRows=e.you.weeks.map(x=>`<tr><td>Wk ${x.w}</td><td class="r num">${f1(x.b)}</td><td class="r num"><b>${f1(x.a)}</b></td><td class="r num ${x.a-x.b>=0?'up':'down'}">${sgn(x.a-x.b)}</td>${compact?'':`<td class="po-mu">${who(get).map(id=>`<span>${esc(byId[id].n.split(' ').pop())} ${opp(id,x.w)}</span>`).join('')}${who(give).length?`<span class="po-out">${who(give).map(id=>`${esc(byId[id].n.split(' ').pop())} ${opp(id,x.w)}`).join(' ')}</span>`:''}</td>`}</tr>`).join('');
  return `<div class="po-panel"><div class="po-call ${call[0]}">${call[1]}</div>
    <table class="po-t"><thead><tr><th>Playoff impact</th><th class="r">Now</th><th class="r">After</th><th class="r">Change</th>${compact?'':'<th></th>'}</tr></thead><tbody>
    ${e.po1!=null?pr('Playoff odds',e.po0,e.po1,pct)+pr('Title odds',e.t0,e.t1,pct):''}
    ${pr(`Weeks ${PO[0]}–${PO[PO.length-1]} points`,e.you.poB,e.you.poA,f1)}${wkRows}</tbody></table>
    ${compact?`<p class="po-mus">${who(get).map(id=>`<b>${esc(byId[id].n)}</b> ${PO.map(w=>opp(id,w)).join('')}`).join(' ')}</p>`:''}</div>`}
const gcls=g=>g[0]==='A'?'ga':g[0]==='B'?'gb':g==='C'?'gc':'gd';
function tradeWhy(t){const T=teamById(t.team),gp=t.get.map(id=>byId[id]),giv=t.give.map(id=>byId[id]);
  const e=t.e||{},bits=[t.myGain>=.3?`Adds ${t.myGain.toFixed(1)} pts/week to your lineup`:e.you&&e.you.po>=.5?`Adds ${f1(e.you.po)} pts/week in the playoffs`:'Adds rest-of-season value'];
  if(e.mine&&e.mine.fa)bits.push(`frees a spot for ${byId[e.mine.fa].n}`);
  if(t.fillsNeed)bits.push(`gives ${T.name} the ${giv.map(p=>p.pos).filter((v,i,a)=>a.indexOf(v)===i).join('/')} help they need`);else if(t.thGain>.3)bits.push(`improves their lineup too`);
  if(t.get.some(id=>G[id].tag==='buy'))bits.push(`buys low on ${gp.find(p=>G[p.id].tag==='buy').n}`);
  if(t.give.some(id=>G[id].tag==='sell'))bits.push(`sells high on ${giv.find(p=>G[p.id].tag==='sell').n}`);
  return bits.join(', ')+'.'}

/* ===== Helpers ===== */
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const f1=x=>(Math.round(x*10)/10).toFixed(1);
const sgn=x=>(x>0?'+':x<0?'−':'')+f1(Math.abs(x));
const $=id=>document.getElementById(id);
const initials=n=>n.replace(/\b(Jr|Sr|II|III|IV)\.?$/,'').split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase();
const av=(p,cls='')=>`<span class="av ${cls}" style="${tcVars(p.t)}">${esc(initials(p.n))}</span>`;
const posTag=p=>`<span class="pos ${p.pos}">${p.pos}${V.posRank[p.id]}</span>`;
const tagFull=id=>{const t=G[id]&&G[id].tag;return t?`<span class="tag ${t}">${t==='buy'?'Buy low':'Sell high'}</span>`:''};
const tagHtml=id=>{const t=G[id]&&G[id].tag;return stHtml(id)+(t?`<span class="badge ${t}" title="${t==='buy'?'Buy low':'Sell high'}">${t==='buy'?'BL':'SH'}</span>`:'')};
const oppTxt=id=>{const n=G[id].next;return n?`${n.home?'vs':'at'} ${n.opp}`:'BYE'};
function oppHtml(id){const n=G[id].next,p=byId[id];if(!n)return '<span class="tag bye">Bye</span>';const r=n.rank;
  return `${n.home?'vs':'at'} ${n.opp}<span class="drk ${r>=24?'easy':r<=8?'hard':''}" title="${n.opp} defense ranks ${ord(r)} against ${p.pos}s. 1st allows the fewest fantasy points, 32nd the most.">${ord(r)} v ${p.pos}</span>`}
const TEAM_PAL=['#0FA3A3','#7B5CFF','#E0364F','#22A35A','#D14FA3','#D9A21B','#3A6FE0','#1BA7D6','#9A4FD1','#7BB21E','#EC6F8E','#5A6E96','#B0713F','#4B45C8','#8C9430'];
function teamColor(id){const i=S.teams.findIndex(T=>T.id===id);return TEAM_PAL[Math.max(0,i)%TEAM_PAL.length]}
function hueOf(hex){const n=parseInt(hex.slice(1),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return (h*60+360)%360}
function versusColor(a,b){const d=Math.abs(hueOf(a)-hueOf(b));return Math.min(d,360-d)<40?'var(--ink)':b}
function ownerHtml(id,withAssign=true){const o=OWN[id];if(o){const T=teamById(o);return `<span class="owner${o===S.me?' me':''}"><i style="background:${teamColor(o)}"></i>${esc(o===S.me?T.name+' (you)':T.name)}</span>`}
  return withAssign?`<select class="assign" data-assign="${id}" aria-label="Add to a team"><option value="">+ Add to team</option>${S.teams.map(T=>`<option value="${T.id}">${esc(T.name)}${T.id===S.me?' (you)':''}</option>`).join('')}</select>`:'<span class="note">Free agent</span>'}
function plCell(p,sub){return `<div class="pl">${av(p,'sm')}<div class="meta"><button class="pname" data-open="${p.id}">${esc(p.n)}</button><span class="psub">${sub??`${p.t} · ${oppHtml(p.id)}`}</span></div></div>`}
let toastT;function toast(m){const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2400)}
const norm=s=>s.toLowerCase().replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
/* Exact full-name match only. Used for anything automatic (league imports, syncing, live stats, injuries),
   so a player TradeMetric doesn't track is skipped instead of being mistaken for someone else. */
/* A rostered player TradeMetric has no stats for (e.g. a free agent): add him so nobody on a fantasy roster is skipped */
function addExtraPlayer(n,pos,t){if(!n||!OFFK.includes(pos))return null;const ex=findExact(n,pos);if(ex)return ex.id;
  S.extraPlayers=S.extraPlayers||[];const id='x-'+norm(n).replace(/ /g,'-');if(!S.extraPlayers.some(x=>x.id===id))S.extraPlayers.push({id,n,pos,t:t||'FA'});return id}
function findExact(v,pos,team){const q=norm(v||'');if(!q)return null;const m=POOL.filter(x=>norm(x.n)===q);if(m.length<2)return m[0]||null;
  return m.find(x=>(!pos||x.pos===pos)&&(!team||x.t===team))||m.find(x=>!pos||x.pos===pos)||m[0]}
/* Forgiving match for names people type in. Last name must match exactly; with a first name, its first letter must match too. */
function findByName(v){const q=norm(v||'');if(!q)return null;const ex=findExact(v);if(ex)return ex;
  const parts=q.split(' ');
  if(parts.length===1){const m=POOL.filter(x=>norm(x.n).split(' ').includes(q));return m.length===1?m[0]:m.sort((a,b)=>V.rank[a.id]-V.rank[b.id])[0]||null}
  const last=parts[parts.length-1],fi=parts[0][0];
  return POOL.filter(x=>{const n=norm(x.n).split(' ');return n[n.length-1]===last&&n[0][0]===fi}).sort((a,b)=>V.rank[a.id]-V.rank[b.id])[0]||null}
function assign(id,teamId){S.teams.forEach(T=>T.players=T.players.filter(x=>x!==id));if(teamId)teamById(teamId).players.push(id);S.example=false;save();recompute()}
const bump=()=>{save();recompute();render()};

/* ===== Demo league ===== */
function makeTeams(n){const t=[{id:'t1',name:'Your Team',players:[]}];for(let i=1;i<n;i++)t.push({id:'t'+(i+1),name:TEAM_NAMES[i-1]||'Team '+(i+1),players:[]});return t}
function exampleLeague(){
  S.teams=makeTeams(S.league.teams);S.me='t1';S.teams[0].players=MY_EXAMPLE.filter(id=>byId[id]);S.log=[];S.example=true;
  recompute();const r=seed('draft'),taken=new Set(S.teams[0].players);
  const pool=POOL.filter(p=>!taken.has(p.id)).map(p=>({p,v:tv(p.id)*(.8+r()*.4)})).sort((a,b)=>b.v-a.v);
  const others=S.teams.slice(1),caps={QB:S.league.slots.SFLEX||S.league.slots.QB>1?3:2,RB:5,WR:6,TE:2,K:0,DST:0},rounds=Math.min(13,Math.floor((pool.length)/Math.max(1,others.length)));
  for(let round=0;round<rounds;round++){const order=round%2?[...others].reverse():others;order.forEach(T=>{
    const cnt=x=>T.players.filter(id=>byId[id].pos===x).length;const i=pool.findIndex(o=>cnt(o.p.pos)<caps[o.p.pos]);if(i>=0){T.players.push(pool[i].p.id);pool.splice(i,1)}})}
  if(S.league.slots.K){const kk=POOL.filter(p=>p.pos==='K'&&!OWN[p.id]).map(p=>({p,v:V.pts[p.id]*(.85+r()*.3)})).sort((a,b)=>b.v-a.v);S.teams.forEach(T=>{if(!T.players.some(id=>byId[id].pos==='K')&&kk.length)T.players.push(kk.shift().p.id)})}
  if(S.league.slots.DST){const d=POOL.filter(p=>p.pos==='DST').map(p=>({p,v:V.pts[p.id]*(.85+r()*.3)})).sort((a,b)=>b.v-a.v);S.teams.forEach(T=>{if(!T.players.some(id=>byId[id].pos==='DST')&&d.length)T.players.push(d.shift().p.id)})}
  save();recompute();
}
function syncTeamCount(){const n=S.league.teams;while(S.teams.length<n)S.teams.push({id:'t'+Date.now().toString(36)+S.teams.length,name:'Team '+(S.teams.length+1),players:[]});
  while(S.teams.length>n){const i=S.teams.map(T=>T.id).lastIndexOf(S.teams.filter(T=>T.id!==S.me).pop().id);S.teams.splice(i,1)}}

/* ===== MY TEAM ===== */
function renderTeam(){
  const me=myTeam(),st=teamStats(),mine=st.rows.find(r=>r.T.id===S.me),RL=realLineup(S.me);
  const LU=RL?{slots:RL.slots,bench:me.players.filter(id=>!RL.slots.some(x=>x.p&&x.p.id===id)).sort((a,b)=>nextV(b)-nextV(a)),total:sum(RL.slots.filter(x=>x.p),x=>G[x.p.id].projNext),real:true}:lineup(me.players,nextV);
  const started=LU.slots.filter(x=>x.p&&liveOf(x.p.id)),actual=sum(started,x=>liveOf(x.p.id).pts);
  $('team-example').hidden=!S.example;$('team-title').textContent=me.name;$('team-kicker').textContent=`${S.league.name||'My League'} · Week ${WEEK}`;
  const sim=simulate();const byes=me.players.filter(id=>!G[id].next).length,tags=me.players.filter(id=>G[id].tag).length;
  const weak=weakList(mine)[0];
  $('team-tiles').innerHTML=(started.length?`<div class="tile hot"><div class="lab">Week ${WEEK} score <span class="live-dot${LIVE&&LIVE.live?' on':''}"></span></div><div class="val num">${f1(actual)}</div><div class="sub">Projected ${f1(LU.total)} · ${started.length} of ${LU.slots.filter(x=>x.p).length} playing or done</div></div>`
     :`<div class="tile hot"><div class="lab">Week ${WEEK} projection</div><div class="val num">${f1(LU.total)}</div><div class="sub">${LU.real?'Your lineup':'Optimal lineup'}</div></div>`)+`
   <div class="tile"><div class="lab">Playoff odds</div><div class="val">${sim?pct(sim[S.me].playoff):'-'}</div><div class="sub">Record ${recTxt(S.me)} · power rank #${mine.rank}</div></div>
   <div class="tile"><div class="lab">Weakest spot</div><div class="val">${weak}</div><div class="sub">${sgn(mine.rel[weak])} pts/wk vs. league average</div></div>
   <div class="tile"><div class="lab">Byes and alerts</div><div class="val">${byes}<span class="muted" style="font-size:20px"> / ${tags}</span></div><div class="sub">Players on bye · buy/sell alerts</div></div>`;
  const row=(label,p)=>p?`<div class="lrow" data-open="${p.id}"><span class="slot">${label}</span><div class="pl">${av(p)}<div class="meta"><span style="display:flex;gap:6px;align-items:center;min-width:0"><button class="pname" data-open="${p.id}">${esc(p.n)}</button>${tagHtml(p.id)}</span><span class="psub">${p.pos}${V.posRank[p.id]} · ${liveOf(p.id)?liveTxt(p.id)+(liveOf(p.id).state==='post'?'':' live'):oppHtml(p.id)}</span></div></div>${lprojHtml(p.id)}</div>`
    :`<div class="lrow" style="cursor:default"><span class="slot">${label}</span><span class="empty">Empty. Add a player who fits this slot.</span><span></span></div>`;
  $('lineup').innerHTML=LU.slots.map(s=>row(s.label,s.p)).join('');
  $('lineup-total').textContent=f1(started.length?actual:LU.total);$('lineup-total-lab').textContent=started.length?'Score so far':LU.real?'Projected total · your lineup':'Projected total';$('lineup-total-sub').textContent=started.length?'proj '+f1(LU.total):'';
  $('bench').innerHTML=LU.bench.length?LU.bench.map(id=>row('BN',byId[id])).join(''):'<p class="empty">No bench players yet.</p>';
  $('roster-count').textContent=`${me.players.length} of ${rosterSize()} roster spots filled.`;
  const mx=Math.max(4,...POS.map(x=>Math.abs(mine.rel[x])));
  $('strength').innerHTML=POS.map(x=>{const d=mine.rel[x],w=Math.abs(d)/mx*50;return `<div class="strow"><span class="lbl">${x}</span><div class="track"><i style="${d>=0?`left:50%;width:${w}%;background:var(--ink)`:`left:${50-w}%;width:${w}%;background:var(--accent)`}"></i></div><span class="v">${sgn(d)}</span></div>`}).join('');
  renderFix(mine);renderMatchup();renderOppCard();
}
function weakList(r){const s=S.league.slots,sc=x=>Math.max(1,s[x]||0);return POS.filter(x=>x!=='QB'||(s.QB||0)>0||s.SFLEX).sort((a,b)=>r.rel[a]/sc(a)-r.rel[b]/sc(b))}
function dropFor(addId){const me=myTeam(),after=[...me.players,addId],base=lineup(after,projV).total,bench=lineup(me.players,projV).bench;
  const same=bench.filter(id=>byId[id].pos===byId[addId].pos&&tv(id)<tv(addId)).sort((a,b)=>tv(a)-tv(b));if(same.length)return same[0];
  let best=null,bc=Infinity;
  me.players.forEach(id=>{const c=(base-lineup(after.filter(x=>x!==id),projV).total)+.25*tv(id);if(c<bc){bc=c;best=id}});return best}
function tradeTitle(t,focus,used){const gp=t.get.map(id=>byId[id]).sort((a,b)=>tval(b.id)-tval(a.id));const f=gp.find(p=>focus&&focus.includes(p.pos))||gp[0];
  const gpos=[...new Set(gp.map(p=>p.pos))].join('/'),od=oddsDelta(t),c=[];
  if(t.get.some(id=>G[id].tag==='buy'))c.push('Buy the dip');
  if(t.give.some(id=>G[id].tag==='sell'))c.push('Sell high');
  if(t.give.length>t.get.length)c.push('Consolidate depth');
  if(t.get.length>t.give.length)c.push('Spread the value');
  if(focus&&gp.some(p=>focus.includes(p.pos)))c.push(`Shore up ${f.pos}`);
  if(od>.03)c.push('Playoff push');
  if(t.e&&t.e.vIn-t.e.vOut>1.5)c.push('Value play');
  c.push(`${gpos} upgrade`,'Smart swap','Lineup boost');
  const h=c.find(x=>!used||!used.has(x))||c[0];if(used)used.add(h);
  return `<small>Target · ${esc(f.n)}</small>${h}`}
function tradeCardHtml(t,title){const fr=fairness(t.give,t.get,t.team,RATE_MODE,t.e),T=teamById(t.team);
  const side=ids=>ids.map(id=>{const p=byId[id];return `<div class="tp">${av(p,'sm')}<div class="meta"><span style="display:flex;gap:5px;align-items:center;min-width:0"><button class="pname" data-open="${id}">${esc(p.n)}</button>${tagHtml(id)}</span><span class="psub">${p.pos}${V.posRank[id]} · ${f1(V.pts[id])}/G</span></div></div>`}).join('');
  return `<div class="tcard">${title?`<div class="t-title">${title}</div>`:''}<div class="with"><span>Trade with</span><b><i class="tsq" style="background:${teamColor(t.team)}"></i>${esc(T.name)}</b></div>
   <div class="sides"><div><div class="lab">You give</div>${side(t.give)}</div><div><div class="lab get">You get</div>${side(t.get)}</div></div>
   ${balanceHtml(fr,T.name,true)}<div class="t-grades"><span>You <b class="g ${gcls(t.e.gYou)}">${t.e.gYou}</b></span><span>${esc(T.name)} <b class="g ${gcls(t.e.gThem)}">${t.e.gThem}</b></span></div><p class="why">${esc(tradeWhy(t))}</p>${playoffPanel(t.e,t.give,t.get,true)}<button class="btn primary" data-load="${t.give.join(',')}|${t.get.join(',')}">Open in trade builder</button></div>`}
function renderFix(mine){
  const me=myTeam(),before=lineup(me.players,projV).total,wl=weakList(mine),focus=wl.filter((x,i)=>i===0||mine.rel[x]<0).slice(0,2);
  const faFor=pos=>POOL.filter(p=>p.pos===pos&&!OWN[p.id]).map(p=>{const drop=dropFor(p.id);return {p,drop,g:drop?lineup(me.players.filter(x=>x!==drop).concat(p.id),projV).total-before:0}}).sort((a,b)=>b.g-a.g||V.pts[b.p.id]-V.pts[a.p.id]).slice(0,2);
  const faRow=({p,drop,g})=>`<div class="fa-row">${plCell(p,`${p.pos}${V.posRank[p.id]} · ${f1(V.pts[p.id])} pts/G · ${oppHtml(p.id)}`)}${g>.05?`<span class="gain">+${f1(g)}/wk</span>`:'<span class="note">Depth</span>'}<button class="btn small" data-swap="${p.id}|${drop}">Swap</button>${drop?`<div class="swap">Drop <button class="pname" data-open="${drop}">${esc(byId[drop].n)}</button><span>${byId[drop].pos}${V.posRank[drop]} · ${f1(V.pts[drop])} pts/G</span></div>`:''}</div>`;
  const trades=allTrades(),forWeak=pickDiverse(trades.filter(t=>t.get.some(id=>focus.includes(byId[id].pos))),2);
  const used=new Set(forWeak.map(t=>t.team)),other=pickDiverse(trades.filter(t=>!used.has(t.team)&&!t.get.some(id=>focus.includes(byId[id].pos))),1);
  $('fix-card').innerHTML=`<div class="fix-head"><b>${focus.join(' · ')}</b><span>${focus.length>1?'Weakest positions':'Weakest position'}: ${focus.map(x=>`${x}, ${f1(Math.abs(mine.rel[x]))} pts/wk below the league average`).join('; ')}. Recommended moves below.</span></div>
   ${focus.map(x=>{const f=faFor(x);return `<h4>Waiver options · ${x}</h4>${f.length?f.map(faRow).join(''):'<p class="empty">No waiver options improve this position.</p>'}`}).join('')}
   <h4>Trade targets</h4>${forWeak.length?`<div class="fix-trades">${(()=>{const u=new Set();return forWeak.map(t=>tradeCardHtml(t,tradeTitle(t,focus,u)))})().join('')}</div>`:'<p class="empty">No balanced trades available for this position right now.</p>'}
   ${other.length?`<h4>More trade options</h4><div class="fix-trades">${other.map(t=>tradeCardHtml(t,tradeTitle(t))).join('')}</div>`:''}`;
}

/* ===== RANKINGS ===== */
let rankPos='ALL',rankOwn='all';
function renderRankings(){
  $('rank-kicker').textContent=`${S.league.name||'My League'} · ${leagueTagline(S.league)}`;
  const q=$('rank-search').value.trim().toLowerCase();
  const RN={buy:'Buy low: good players who scored less than expected the last two weeks but are still getting the ball. They should bounce back.',
    risk:'Risks: players scoring more than their role supports, or with a hard schedule ahead. A player whose jump comes from more work, like a teammate being out, is not flagged.',
    opp:'Opportunities: players who should get more work because a teammate at their position just got hurt.'};
  $('rank-note').hidden=!RN[rankOwn];$('rank-note').textContent=RN[rankOwn]||'';
  const L=V.list.filter(p=>(rankPos==='ALL'||p.pos===rankPos)&&(!q||p.n.toLowerCase().includes(q)||p.t.toLowerCase()===q)&&(rankOwn==='all'||(rankOwn==='free'&&!OWN[p.id])||(rankOwn==='buy'&&G[p.id].buy)||(rankOwn==='risk'&&G[p.id].risk)||(rankOwn==='opp'&&G[p.id].opp.length)));
  const cap=q||RANK_ALL?L.length:300,more=L.length-cap;L.length=Math.min(L.length,cap);
  setTimeout(()=>{const m=$('rank-more');if(m)m.innerHTML=more>0?`<button class="btn" id="rank-all">Show all ${(L.length+more).toLocaleString()} players</button>`:''},0);
  $('rank-body').innerHTML=L.map(p=>{const g=G[p.id],o=OWN[p.id];return `<tr><td class="r num">${V.rank[p.id]}</td><td data-v="${esc(p.n.toLowerCase())}"><div class="pl">${av(p,'sm')}<div class="meta"><span style="display:flex;gap:6px;align-items:center"><button class="pname" data-open="${p.id}">${esc(p.n)}</button>${o!==S.me?followBtn(p.id,true):''}${tagHtml(p.id)}${g.risk?'<span class="badge risk" title="Risk: open the player to see why">RISK</span>':''}${g.opp.length?'<span class="badge opp" title="More work with a teammate out">UP</span>':''}</span><span class="psub">${p.t} · ${oppHtml(p.id)}</span>${rankOwn==='buy'&&g.buy?`<span class="why-line">${esc(g.buy[0])}</span>`:rankOwn==='risk'&&g.risk?`<span class="why-line">${esc(g.risk[0])}</span>`:rankOwn==='opp'&&g.opp.length?`<span class="why-line">${esc(oppTxtLine(g.opp[0]))}</span>`:''}</div></div></td>
    <td data-v="${p.pos}${String(V.posRank[p.id]).padStart(3,'0')}"><span class="pos ${p.pos}">${p.pos}${V.posRank[p.id]}</span></td><td class="r strong" data-v="${g.next?g.projNext.toFixed(2):-1}">${g.next?f1(g.projNext):'<span class="tag bye">Bye</span>'}</td><td class="r num">${f1(V.pts[p.id])}</td><td class="r" data-v="${g.trendPct===null?-9:g.trendPct.toFixed(3)}">${trendHtml(g.trendPct)}</td><td class="r num" data-v="${g.tshare===null?-1:g.tshare.toFixed(1)}">${g.tshare===null?'<span class="muted">-</span>':Math.round(g.tshare)+'%'}</td><td class="r num" data-v="${g.snap===null?-1:g.snap.toFixed(1)}">${g.snap===null?'<span class="muted">-</span>':Math.round(g.snap)+'%'}</td><td class="r num" data-v="${g.oppg===null?-1:g.oppg.toFixed(2)}">${g.oppg===null?'<span class="muted">-</span>':f1(g.oppg)}</td><td data-v="${o?esc(teamById(o).name.toLowerCase()):'zzzz'}">${ownerHtml(p.id)}</td></tr>`}).join('')||'<tr><td colspan="10" class="empty">No players match.</td></tr>';
  sortTable('rank-table');
}

/* ===== Table sorting ===== */
const SORTS={'tgt-table':{col:2,dir:'desc'},'sim-table':{col:4,dir:'desc'}};
function trendHtml(x){if(x===null)return '<span class="muted">-</span>';const v=Math.round(x*100);return `<span class="delta ${v>=10?'up':v<=-10?'down':'flat'}">${v>0?'▲':v<0?'▼':''}${Math.abs(v)}%</span>`}
function sortTable(id){const tbl=document.getElementById(id);if(!tbl)return;const st=SORTS[id];
  [...tbl.querySelectorAll('thead th')].forEach((th,i)=>{const on=!!st&&st.col===i;th.classList.toggle('sorted',on);if(on)th.dataset.dir=st.dir;else delete th.dataset.dir});
  if(id==='tgt-table')document.querySelectorAll('#tgt-sort button').forEach(b=>b.setAttribute('aria-pressed',!!st&&+b.dataset.tsort===st.col));
  if(!st)return;const tb=tbl.tBodies[0];if(!tb)return;
  const key=r=>{const c=r.cells[st.col];if(!c||r.cells.length===1)return null;const v=c.dataset.v;if(v!==undefined)return isNaN(+v)?v:+v;const tx=c.textContent.trim(),n=parseFloat(tx);return isNaN(n)?tx.toLowerCase():n};
  const rows=[...tb.rows];rows.sort((a,b)=>{const x=key(a),y=key(b);if(x===null)return 1;if(y===null)return -1;
    const r=typeof x==='number'&&typeof y==='number'?x-y:typeof x==='number'?-1:typeof y==='number'?1:String(x).localeCompare(String(y));return st.dir==='asc'?r:-r});
  rows.forEach(r=>tb.appendChild(r))}

/* ===== TRADES ===== */
let tgtPos='ALL',sugSkip=0;
if(!window.__trade)window.__trade={give:[],get:[]};
const TD=window.__trade;
function renderTrade(){
  let sug=pickDiverse(allTrades(),3,sugSkip);
  if(sug.length<3){const used=new Set(sug.map(t=>t.team)),pool=allTrades(true).filter(t=>!used.has(t.team)&&!sug.some(x=>x.give.concat(x.get).some(id=>t.give.includes(id)||t.get.includes(id))));sug=sug.concat(pickDiverse(pool,3-sug.length,0,true,sug.some(t=>t.give.concat(t.get).some(id=>byId[id].pos==='QB'))?1:0))}
  $('suggestions').innerHTML=sug.length?(()=>{const used=new Set();return sug.map(t=>tradeCardHtml(t,tradeTitle(t,null,used))).join('')})()
    :`<div class="card" style="grid-column:1/-1"><p class="empty" style="margin:0">No fair trades found. Fill in the other teams in League Hub and TradeMetric will build ideas from their rosters.</p></div>`;
  const me=myTeam();TD.give=TD.give.filter(id=>me.players.includes(id));TD.get=TD.get.filter(id=>OWN[id]&&OWN[id]!==S.me);
  $('give-chips').innerHTML=me.players.slice().sort((a,b)=>tv(b)-tv(a)).map(id=>{const p=byId[id];return `<button class="chip" data-give="${id}" aria-pressed="${TD.give.includes(id)}">${av(p,'sm')}${esc(p.n)} <span class="v">${p.pos}</span></button>`}).join('')||'<p class="empty">Add players to your team first.</p>';
  const partner=TD.get.length?teamById(OWN[TD.get[0]]):null;
  $('get-chips').innerHTML=TD.get.map(id=>{const p=byId[id];return `<span class="chip" aria-pressed="true">${av(p,'sm')}${esc(p.n)} <span class="v">${p.pos}</span><button class="x" data-unget="${id}" aria-label="Remove ${esc(p.n)}">×</button></span>`}).join('')||'<p class="empty" style="padding:0">Pick players from the list on the right (below on a phone).</p>';
  $('get-hint').textContent=partner?`Trading with ${partner.name}. Players from other teams will start a new deal.`:'';
  renderTargets();
  renderRating(partner);
}
function renderTargets(){const q=($('tgt-search').value||'').trim().toLowerCase();
  const pool=V.list.filter(p=>OWN[p.id]&&OWN[p.id]!==S.me&&(tgtPos==='ALL'||p.pos===tgtPos)&&(!q||p.n.toLowerCase().includes(q)||p.t.toLowerCase()===q||teamById(OWN[p.id]).name.toLowerCase().includes(q)));
  $('tgt-count').textContent=`${pool.length} players`;
  $('targets').innerHTML=pool.map(p=>{const g=G[p.id],T=teamById(OWN[p.id]),inD=TD.get.includes(p.id);
    return `<tr><td data-v="${esc(p.n.toLowerCase())}">${plCell(p,`${p.pos}${V.posRank[p.id]} · ${p.t} ${tagHtml(p.id)}`)}</td><td class="r strong" data-v="${g.next?g.projNext.toFixed(2):-1}">${g.next?f1(g.projNext):'<span class="tag bye">Bye</span>'}</td><td class="r num">${f1(V.pts[p.id])}</td><td class="r num" data-v="${g.snap===null?-1:g.snap.toFixed(1)}">${g.snap===null?'-':Math.round(g.snap)+'%'}</td><td data-v="${esc(T.name.toLowerCase())}">${ownerHtml(p.id,false)}</td><td class="r"><button class="btn small" data-get="${p.id}" ${inD?'disabled':''}>${inD?'Added':'+ Add'}</button></td></tr>`}).join('')||'<tr><td colspan="6" class="empty">No players match. Add rosters in League Hub or change the search.</td></tr>';
  sortTable('tgt-table')}
function balanceHtml(fr,them,compact){const pos=Math.max(4,Math.min(96,(1-fr.share)*100));
  return `<div class="balance">${compact?'':''}<div class="bal-label" style="${compact?'font-size:16px;text-align:left':''}">${fr.label}</div><div class="bal-track"><span class="bal-mark" style="left:${pos}%"></span></div><div class="bl"><span>You</span><span>${esc(them)}</span></div></div>`}
function renderRating(partner){
  const el=$('rating');
  if(!TD.give.length||!TD.get.length){el.innerHTML=`<div class="card-h"><h2>Trade rating</h2></div><p class="empty" style="margin:0">Pick at least one player to give and one to get, and the rating shows who comes out ahead.</p>`;return}
  const me=myTeam(),fr=fairness(TD.give,TD.get,partner.id),e=fr.e,hm=RATE_MODE==='hm',over=me.players.length-TD.give.length+TD.get.length-rosterSize();
  const cls=v=>v>=0?'up':'down',row=(l,v,note)=>`<tr><td>${l}${note?`<span class="note"> · ${note}</span>`:''}</td><td class="r num ${cls(v)}">${sgn(v)}</td></tr>`,P=e.parts;
  el.innerHTML=`<div class="card-h"><h2>Trade rating</h2><div class="seg"><button data-rmode="hm" aria-pressed="${hm}">Trade Score</button><button data-rmode="pw" aria-pressed="${!hm}">Points per week</button></div></div>
   ${balanceHtml(fr,partner.name,false)}
   <div class="kv" style="margin-top:14px">${hm?`<div><span class="note">Your grade</span><b class="${cls(e.youNet)}">${e.gYou} <small style="font-size:.6em">${sgn(e.youNet)}</small></b></div><div><span class="note">${esc(partner.name)}'s grade</span><b class="${cls(e.themNet)}">${e.gThem} <small style="font-size:.6em">${sgn(e.themNet)}</small></b></div>`
     :`<div><span class="note">Your lineup</span><b class="${cls(e.myLG)}">${sgn(e.myLG)}/wk</b></div><div><span class="note">${esc(partner.name)} lineup</span><b class="${cls(e.thLG)}">${sgn(e.thLG)}/wk</b></div>`}</div>
   ${playoffPanel(e,TD.give,TD.get,false)}
   ${hm?`<table class="bd"><thead><tr><th>Your score · ${esc(MODE_TXT[e.mode])}</th><th class="r">Pts</th></tr></thead><tbody>
      ${row('Lineup change, all remaining weeks',P.L,`${sgn(e.myLG)}/wk incl. bench insurance`)}${row('Playoff weeks lineup change',P.P,`${sgn(e.you.po)}/wk in Weeks ${poWeeks()[0]}–${poWeeks().slice(-1)[0]}`)}
      ${row('Playoff odds',P.PO,`${sgn(e.dPO)} pts`)}${row('Title odds',P.T,`${sgn(e.dT)} pts`)}${e.mode!=='contender'?row('Upside',P.U)+row('Sell high / buy low',P.SH):''}${row('Injury and stacking risk',P.R)}</tbody>
      <tfoot><tr><td>Your score</td><td class="r num">${sgn(e.youNet)}</td></tr></tfoot></table>
     <table class="bd"><thead><tr><th>Would ${esc(partner.name)} accept?</th><th class="r">Pts</th></tr></thead><tbody>
      ${row('Market value they get',.55*(e.mIn-e.mOut),Object.keys(marketTable().srcs).join(' / ')||'projections')}${row('Their lineup change',.45*e.thLG,`${sgn(e.thLG)}/wk`)}${e.fillsNeed?row('Fills one of their needs',.6):''}</tbody>
      <tfoot><tr><td>Their score</td><td class="r num">${sgn(e.themNet)}</td></tr></tfoot></table>`:''}
   ${e.mine.fa||e.mine.drop||e.theirs.fa||e.theirs.drop?`<p class="note" style="margin:10px 0 0">${[e.mine.fa?`You'd pick up ${esc(byId[e.mine.fa].n)} with the open roster spot.`:'',e.mine.drop?`You'd drop ${esc(byId[e.mine.drop].n)} to make room.`:'',e.theirs.drop?`${esc(partner.name)} would drop ${esc(byId[e.theirs.drop].n)}.`:'',e.theirs.fa?`${esc(partner.name)} would pick up ${esc(byId[e.theirs.fa].n)}.`:''].filter(Boolean).join(' ')}</p>`:''}
   ${over>0?`<p class="note" style="margin:10px 0 0">You would be ${over} over your roster limit and need to drop ${over>1?'players':'a player'}.</p>`:''}
   <div class="toolbar" style="margin-top:14px"><button class="btn accent" id="accept-trade">Mark as accepted</button><span class="note">Moves the players and adds it to the trade log.</span></div>
   <p class="formula">${hm?`<b>How the Trade Score works</b> (redraft). <b>1 · Player value:</b> rest-of-season points per game in your scoring × the chance he plays each week (injury status; players on IR, PUP or suspended count 0 until an estimated return week, then full value) × that week's matchup. Fantasy playoff weeks ${poWeeks()[0]}–${poWeeks().slice(-1)[0]} count ${PO_WT}x.
     <b>2 · Your team:</b> the week-by-week change in your best starting lineup (bench players who never start add almost nothing), plus bench insurance (a backup's points × the chance the starter misses), plus the best free agent you could add with a spot freed in a 2-for-1.
     <b>3 · Would they accept:</b> the market value they get, blended from FantasyCalc, KeepTradeCut and FantasyPros, plus their own lineup change and a bonus if the deal fills one of their needs.
     <b>4 · Final score:</b> your change in playoff odds and title odds from the Season Sim, plus your Weeks ${poWeeks()[0]}–${poWeeks().slice(-1)[0]} points with matchups, weighted by your team mode (contenders weight title odds and playoff weeks most; long shots weight upside and selling high), minus risk from injury-prone players and stacking one NFL team. Grades run A+ to F; the bar compares your score with theirs.
     <span class="mkt-src">${esc(marketLabel())}.</span>`
     :`<b>How points per week works.</b> It compares how much each team's best starting lineup gains or loses per week over the rest of the season, with injuries and matchups included. It ignores market value, playoff odds and risk.`}</p>`;
}

/* ===== HUB ===== */
let hubSel=null,shotState=null;
function renderHub(){
  $('hub-kicker').textContent=`${S.league.name||'My League'} · ${S.teams.length} teams`;
  const st=teamStats();if(!hubSel||!teamById(hubSel))hubSel=S.me;
  const pr=powerRanks();
  $('power').innerHTML=`<div class="pr-head"><span>#</span><span>Team</span><span class="r">Record</span><span class="r">Pts/wk</span><span class="r">Move</span></div>`+pr.map(r=>{const T=r.T,row=st.rows.find(x=>x.T.id===T.id),mv=r.move;
    return `<div class="pr-line${T.id===hubSel?' sel':''}" data-hub="${T.id}" title="${row&&row.needs.length?'Needs '+row.needs.join(', '):'Balanced roster'}"><span class="rk">${r.rank}</span><span class="nm"><i class="tsq" style="background:${teamColor(T.id)};margin:0"></i><span>${esc(T.name)}</span>${T.id===S.me?'<span class="tag mine">You</span>':''}</span><span class="r num">${recTxt(T.id)}</span><span class="r num">${f1(row?row.total:0)}</span><span class="r mv ${mv>0?'up':mv<0?'down':'flat'}">${mv>0?'▲'+mv:mv<0?'▼'+(-mv):'–'}</span></div>`}).join('');
  const T=teamById(hubSel),byPos={};POS.forEach(x=>byPos[x]=T.players.filter(id=>byId[id].pos===x).sort((a,b)=>V.pts[b]-V.pts[a]));
  $('team-manager').innerHTML=`<div class="card-h"><h2>Team rosters</h2><div class="toolbar"><select id="hub-team" aria-label="Choose team">${S.teams.map(x=>`<option value="${x.id}" ${x.id===hubSel?'selected':''}>${esc(x.name)}${x.id===S.me?' (you)':''}</option>`).join('')}</select>${hubSel!==S.me?'<button class="btn small" id="set-me">This is my team</button>':''}</div></div>
   <div class="field" style="margin-bottom:12px"><label for="hub-name">Team name</label><input type="text" id="hub-name" value="${esc(T.name)}"></div>
   <input type="file" id="shot-file" accept="image/*" hidden>
   <div id="shot-result"></div>
   <div class="addrow" style="margin-top:12px" id="drop"><input type="text" id="hub-add" list="dl-players" placeholder="Add a player by name" autocomplete="off"><button class="btn primary" id="hub-add-btn">Add</button><label class="btn shot-btn" for="shot-file" title="The AI reads a roster screenshot and you review every player before saving"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>Upload screenshot</label></div>
   <p class="note" style="margin:8px 0 4px">${T.players.length} of ${rosterSize()} roster spots</p>
   <div class="roster-scroll">${T.players.length?POS.filter(x=>byPos[x].length).map(x=>`<h4>${x}</h4>${byPos[x].map(id=>{const p=byId[id];return `<div class="rrow">${plCell(p,`${p.pos}${V.posRank[id]} · ${p.t} · ${f1(V.pts[id])} pts/G`)}${tagHtml(id)||'<span></span>'}<button class="x" data-unassign="${id}" aria-label="Remove ${esc(p.n)}">×</button></div>`}).join('')}`).join(''):'<p class="empty">No players yet. Upload a screenshot or add players by name.</p>'}</div>`;
  renderShot();renderImport();
  $('trade-log').innerHTML=(S.log||[]).length?S.log.slice().reverse().map(l=>`<div class="logrow"><b>${esc(l.aName)}</b> sent ${l.give.map(id=>esc(byId[id]?byId[id].n:id)).join(', ')} to <b>${esc(l.bName)}</b> for ${l.get.map(id=>esc(byId[id]?byId[id].n:id)).join(', ')}<div class="note">${new Date(l.ts).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${esc(l.label)}</div></div>`).join(''):'<p class="empty">No trades yet. Accepted trades from the Trades tab show up here.</p>';
  $('dna-list').innerHTML=dnaItems().map(([t,txt])=>`<li><span class="t">${t}</span><span>${txt}</span></li>`).join('');
}
function renderShot(){const el=$('shot-result');if(!el)return;const s=shotState,drop=$('drop');
  if(!s||s.team!==hubSel){el.innerHTML='';if(drop)drop.hidden=false;return}
  if(drop)drop.hidden=true;const T=teamById(s.team);
  const head=(body)=>`<div class="sr-head">${s.img?`<img class="sr-img" src="${s.img}" alt="Your screenshot">`:''}<div><div class="sr-steps"><span class="${s.status==='reading'?'on':'done'}">1 Upload</span><span class="${s.status==='review'?'on':''}">2 Review</span><span>3 Save</span></div>${body}</div></div>`;
  if(s.status==='reading'){el.innerHTML=head(`<b>Reading your screenshot...</b><div class="skel"></div><div class="skel" style="width:70%"></div>`);return}
  if(s.status==='error'){el.innerHTML=head(`<b style="color:var(--bad)">${esc(s.msg)}</b><div class="toolbar"><button class="btn small" id="shot-cancel">Try another screenshot</button></div>`);return}
  const n=s.items.filter(x=>x.on&&x.id).length,miss=s.items.filter(x=>!x.id).length;
  const rows=s.items.map((x,i)=>{const p=x.id&&byId[x.id];return `<div class="sr-row${p?'':' miss'}"><input type="checkbox" class="sr-on" data-i="${i}" ${x.on&&p?'checked':''} ${p?'':'disabled'} aria-label="Include ${esc(x.read)}">
    <div class="sr-read"><span class="note">Read as</span><b>${esc(x.read)}</b>${x.pos||x.nfl?`<span class="note">${esc([x.pos,x.nfl].filter(Boolean).join(' · '))}</span>`:''}</div>
    <div class="sr-match">${p?plCell(p,`${p.pos} · ${p.t}${OWN[p.id]&&OWN[p.id]!==s.team?' · now on '+esc(teamById(OWN[p.id]).name):''}`):'<span class="sr-warn">No match yet</span>'}
     ${!p&&x.sugg.length?`<div class="chips">${x.sugg.map(id=>`<button class="chip" data-srsug="${i}|${id}" style="padding-left:10px">${esc(byId[id].n)} <span class="v">${byId[id].pos} · ${byId[id].t}</span></button>`).join('')}</div>`:''}
     <input type="text" class="sr-pick" data-i="${i}" list="dl-players" placeholder="${p?'Wrong player? Type the right one':'Type the right player'}" autocomplete="off"></div></div>`}).join('');
  el.innerHTML=head(`<b>Found ${s.items.length} players. Check them, then save.</b><span class="note">${miss?`${miss} need${miss>1?'':'s'} your help (highlighted).`:'Every player matched.'} Uncheck anyone you don't want.</span>`)+
   `<div class="sr-list">${rows}</div>${s.teamName&&s.teamName!==T.name?`<label class="sr-rename"><input type="checkbox" id="sr-rename" checked> Rename this team to "${esc(s.teamName)}"</label>`:''}
   <div class="toolbar"><button class="btn primary" id="shot-replace" ${n?'':'disabled'}>Save ${n} players to ${esc(T.name)}</button><button class="btn" id="shot-add" ${n?'':'disabled'}>Add to current roster</button><button class="btn ghost" id="shot-cancel">Cancel</button></div>`}
function dnaItems(){
  const L=S.league,sc=L.sc,s=L.slots,out=[],cy={},cb={};V.list.slice(0,60).forEach(p=>cy[p.pos]=(cy[p.pos]||0)+1);B.list.slice(0,60).forEach(p=>cb[p.pos]=(cb[p.pos]||0)+1);
  POS.forEach(x=>{const d=(cy[x]||0)-(cb[x]||0);if(Math.abs(d)>=3)out.push([x+(d>0?' ▲':' ▼'),`${cy[x]||0} ${x}s rank in your top 60, compared with ${cb[x]||0} on a typical site. ${d>0?`Go after ${x}s earlier than consensus.`:`You can wait on ${x}s.`}`])});
  if(s.SFLEX||s.QB>=2)out.push(['QB',`Replacement QBs score only ${f1(V.repl.QB)} pts/G in your league. Starting QBs are the scarcest asset you can own.`]);
  if(sc.recTE>sc.recWR)out.push(['TE',`Tight ends earn ${f1(sc.recTE)} per catch versus ${f1(sc.recWR)} for receivers, so top TEs play like WR1s.`]);
  if(sc.recWR===0)out.push(['PPR','No points per catch. Goal-line backs and deep threats beat high-volume slot receivers.']);
  if(sc.ptd>=6)out.push(['Pass TD','Six-point passing TDs push big-TD pocket passers up the board.']);
  if(sc.fd)out.push(['1st down',`First downs pay ${f1(sc.fd)} each, which favors workhorse backs and chain-moving receivers.`]);
  if(sc.p300||sc.r100||sc.rec100)out.push(['Bonus','Yardage bonuses reward explosive players. TradeMetric weights each bonus by how often the player hits it.']);
  if(!out.length)out.push(['Standard','Your settings are close to a typical site, so your edge comes from matchups and trades.']);
  return out}

/* ===== AI (sample) ===== */
let AI=null,AIimg=false;
/* On the live site the AI runs through /api/ai (your Anthropic key stays on the server).
   Inside a claude.ai preview it falls back to the built-in sample capability. */
const ServerAI={
  async json(prompt,opts={}){
    const images=[];for(const b of (opts.images||[]))images.push(await blobToB64(b));
    const r=await fetch('/api/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt,images})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw {code:j.code||'error',message:j.error||'AI request failed',text:j.text};
    return j.data},
  async limits(){return {images:true}}};
function blobToB64(b){return new Promise((ok,no)=>{const f=new FileReader();f.onload=()=>{const u=String(f.result);ok({media_type:b.type||'image/png',data:u.slice(u.indexOf(',')+1)})};f.onerror=no;f.readAsDataURL(b)})}
(async()=>{
  try{const r=await fetch('/api/ai');if(r.ok&&(await r.json()).ok)AI=ServerAI}catch(e){}
  if(!AI){try{AI=window.claude?await window.claude.use('sample'):null}catch(e){AI=null}}
  if(AI){try{const l=await AI.limits();AIimg=!!(l&&l.images)}catch(e){}}
  if(!AI){$('helper-status').textContent='The AI Helper is not available in this view.';$('helper-ask').disabled=true}})();
function leagueContext(){
  const L=S.league,sc=L.sc,me=myTeam(),LU=lineup(me.players,nextV),st=teamStats(),mine=st.rows.find(r=>r.T.id===S.me);
  const line=id=>{const p=byId[id],g=G[id];return `${p.n} (${p.pos}${V.posRank[id]}, ${p.t}) proj ${f1(g.projNext)} wk${WEEK} ${g.next?oppTxt(id):'BYE'}, ${f1(V.pts[id])}/G season proj, last3 ${f1(g.last3)}${g.tag?', '+(g.tag==='buy'?'BUY LOW':'SELL HIGH'):''}`};
  return `League "${L.name}": ${L.teams} teams. Slots QB${L.slots.QB} RB${L.slots.RB} WR${L.slots.WR} TE${L.slots.TE} FLEX${L.slots.FLEX} SUPERFLEX${L.slots.SFLEX} BENCH${L.slots.BN}.
Scoring: 1pt/${sc.pyd} pass yds, pass TD ${sc.ptd}, INT ${sc.int}, 1pt/${sc.ryd} rush yds, rush TD ${sc.rtd}, rec RB ${sc.recRB}/WR ${sc.recWR}/TE ${sc.recTE}, 1pt/${sc.recyd} rec yds, rec TD ${sc.rectd}, first down ${sc.fd}, fumble ${sc.fl}, bonuses 300pass ${sc.p300} 100rush ${sc.r100} 100rec ${sc.rec100}.
It is Week ${WEEK}. My team "${me.name}" power rank ${mine.rank}/${S.teams.length}; weakest position ${mine.weak}.
My lineup:\n${LU.slots.map(s=>`- ${s.label}: ${s.p?line(s.p.id):'EMPTY'}`).join('\n')}
My bench:\n${LU.bench.map(id=>'- '+line(id)).join('\n')||'- none'}
Other teams (top players, needs):\n${st.rows.filter(r=>r.T.id!==S.me&&r.n).map(r=>`- ${r.T.name} [needs ${r.needs.join('/')||'none'}]: ${[...r.T.players].sort((a,b)=>tv(b)-tv(a)).slice(0,6).map(id=>`${byId[id].n} ${byId[id].pos}${G[id].tag?' '+G[id].tag.toUpperCase():''}`).join(', ')}`).join('\n')}
Best free agents: ${V.list.filter(p=>!OWN[p.id]).slice(0,8).map(p=>`${p.n} ${p.pos} ${f1(V.pts[p.id])}/G`).join('; ')}`;
}
let asking=false,BRIEF_CACHE={v:-1};
function bestPickups(){if(BRIEF_CACHE.v===VER)return BRIEF_CACHE.d;const me=myTeam(),before=lineup(me.players,projV).total;
  const d=POOL.filter(p=>!OWN[p.id]&&!isOut(p.id)&&V.pts[p.id]>4).map(p=>{const drop=dropFor(p.id);return {p,drop,g:drop?lineup(me.players.filter(x=>x!==drop).concat(p.id),projV).total-before:0}}).sort((a,b)=>b.g-a.g).slice(0,3);
  BRIEF_CACHE={v:VER,d};return d}
function renderBriefing(){const el=$('briefing');if(!el)return;const me=myTeam(),items=[];
  const oid=oppOf(S.me,WEEK);if(oid){const A=weekLine(me.players,WEEK,S.me),Bm=weekLine(teamById(oid).players,WEEK,oid),pw=Phi((A.m-Bm.m)/Math.sqrt(A.sd**2+Bm.sd**2));
    items.push({k:'Matchup',h:`<p>You're <b>${pct(pw)}</b> to beat ${esc(teamById(oid).name)} this week, ${f1(A.m)} to ${f1(Bm.m)} projected.</p>`,acts:[['Open matchup','goto|team|matchup']]})}
  const starters=lineup(me.players,projV).slots.filter(x=>x.p).map(x=>x.p.id),worries=[];
  starters.forEach(id=>{const st=stOf(id),g=G[id],n=esc(byId[id].n);if(st&&st!=='Q')worries.push([id,`${n} is ${({O:'out',D:'doubtful',IR:'on injured reserve',PUP:'on the PUP list',SUS:'suspended'})[st]}.`]);else if(st==='Q')worries.push([id,`${n} is questionable${byId[id].inj?' ('+esc(byId[id].inj).toLowerCase()+')':''}.`]);else if(!g.next)worries.push([id,`${n} is on bye.`]);else if(g.next.rank<=4)worries.push([id,`${n} faces a tough ${g.next.opp} defense.`])});
  items.push({k:'Lineup',h:worries.length?`<ul>${worries.slice(0,3).map(w=>`<li>${w[1]}</li>`).join('')}</ul>`:'<p>No lineup concerns. Your starters are healthy and active.</p>',acts:worries.length?[[`View ${byId[worries[0][0]].n}`,'view|'+worries[0][0]]]:[]});
  const pk=bestPickups()[0];if(pk&&pk.g>.2)items.push({k:'Pickup',h:`<p>Add <b>${esc(pk.p.n)}</b> (${pk.p.pos}, ${pk.p.t})${pk.drop?` and drop ${esc(byId[pk.drop].n)}`:''}. That adds ${f1(pk.g)} points a week to your lineup.</p>`,acts:[[`Add ${pk.p.n}`,`add|${pk.p.id}|${pk.drop||''}`],['View','view|'+pk.p.id]]});
  else items.push({k:'Pickup',h:'<p>No available player improves your lineup this week. Hold your waiver priority.</p>',acts:[]});
  const tr=pickDiverse(allTrades(),1)[0];if(tr){const fr=fairness(tr.give,tr.get,tr.team,RATE_MODE,tr.e);items.push({k:'Trade',h:`<p>Send ${tr.give.map(x=>esc(byId[x].n)).join(' and ')} to ${esc(teamById(tr.team).name)} for ${tr.get.map(x=>esc(byId[x].n)).join(' and ')}. ${fr.label}${tr.myGain>=.3?`, and it adds ${f1(tr.myGain)} points a week`:', and it adds long-term value'}.</p>`,acts:[['Open in trade builder',`trade|${tr.give.join(',')}|${tr.get.join(',')}`]]})}
  const bl=POOL.filter(p=>G[p.id].buy&&OWN[p.id]&&OWN[p.id]!==S.me).sort((a,b)=>V.pts[b.id]-V.pts[a.id])[0];
  if(bl)items.push({k:'Buy low',h:`<p><b>${esc(bl.n)}</b> on ${esc(teamById(OWN[bl.id]).name)}. ${esc(G[bl.id].buy[0])}</p>`,acts:[['View',`view|${bl.id}`]]});
  el.innerHTML=`<div class="card-h"><h2>Week ${WEEK} briefing</h2>${AI?'<button class="btn small" data-q="Walk me through my Week ${WEEK} game plan: my lineup, my matchup, the best pickup and one trade worth making.">Talk me through it</button>':''}</div>
   <div class="brief-grid">${items.map(x=>`<div class="brief"><span class="k">${x.k}</span>${x.h}${x.acts.length?`<div class="acts">${x.acts.map(([l,a])=>`<button class="btn small" data-act="${a}">${esc(l)}</button>`).join('')}</div>`:''}</div>`).join('')}</div>`}
function doAct(a){const [k,x,y]=a.split('|');
  if(k==='goto'){location.hash=x;setTimeout(()=>{const el=$(y);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})},80)}
  else if(k==='view')openCard(x);
  else if(k==='add'){if(OWN[x]){toast(byId[x].n+' is already on a team');return}if(y)assign(y,null);assign(x,S.me);toast(`Added ${byId[x].n}${y?', dropped '+byId[y].n:''}`);render()}
  else if(k==='trade')loadTrade(`${x}|${y||''}`)}
function renderHist(){const done=(S.chat||[]).filter(x=>x.status==='done');$('hist').innerHTML=done.length?done.slice().reverse().map(x=>`<button class="hist-item" data-hjump="${x.id}"><span>${esc(x.q)}</span><span class="note">${new Date(x.ts).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></button>`).join(''):'<p class="empty" style="margin:0">Your questions show up here.</p>'}
function renderHelper(){renderBriefing();renderHist();renderAnswers()}
function sparkSvg(id){const pts=G[id].pts.filter(x=>x!==null);if(pts.length<2)return '';const mx=Math.max(...pts,1),w=200,h=30,step=w/(pts.length-1);
  const xy=pts.map((v,i)=>[i*step,h-3-(v/mx)*(h-6)]);const path=xy.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${path} L${w} ${h} L0 ${h}Z" fill="var(--accent-soft)"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${xy[xy.length-1][0]}" cy="${xy[xy.length-1][1]}" r="3" fill="var(--accent)"/></svg>`}
async function askHelper(q){
  if(!AI||!q||!q.trim()||asking)return;asking=true;$('helper-ask').disabled=true;$('helper-status').textContent='';$('helper-q').value='';
  if(tab!=='helper')location.hash='helper';
  const entry={id:Date.now().toString(36),q:q.trim(),status:'thinking',ts:Date.now()};S.chat.push(entry);renderAnswers();
  setTimeout(()=>{const el=$('msg-'+entry.id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})},50);
  const prior=S.chat.filter(x=>x.status==='done').slice(-2).map(x=>`Earlier question: ${x.q}\nYour answer: ${x.data.headline}. ${x.data.answer}`).join('\n');
  const prompt=`You are the AI Helper inside TradeMetric, a fantasy football app that tailors advice to one league's exact settings. Use only the data below. Stats are real 2026 results through Week ${PLAYED}; projections blend preseason expectations with 2026 production; injury status comes from the Week ${DATA.injWeek} report. There is no live news feed.

${leagueContext()}
${prior?'\n'+prior+'\n':''}
Question: ${q}

Reply with JSON only, in this shape:
{"headline": "3 to 7 word verdict",
 "answer": "2 to 4 plain sentences answering directly and citing this league's scoring, roster slots or matchups",
 "players": [{"name": "exact player name from the data", "verdict": "one of Start, Sit, Target, Offer, Sell, Hold, Add, Drop", "note": "one short sentence"}],
 "points": ["2 or 3 short supporting points"],
 "actions": [{"type":"trade","give":["players from my roster"],"get":["players from ONE other team"]} or {"type":"add","player":"a free agent","drop":"a player from my roster or null"} or {"type":"view","player":"name"}],
 "followups": ["2 or 3 short follow-up questions I might ask next"]}
List 1 to 4 players, each once. In trade answers mark players to get as "Target" and players to give as "Offer". Only include actions that match your advice and use exact names from the data.`;
  try{entry.data=await AI.json(prompt);entry.status='done'}
  catch(e){if(e&&e.code==='invalid_json'&&e.text){entry.data=looseJSON(e.text)||{headline:'Answer',answer:e.text};entry.status='done'}else{entry.status='error';entry.msg=e&&e.code==='not_granted'?'The AI Helper needs your permission to use Claude. Ask again to allow it.':e&&e.code==='rate_limited'?'Too many questions at once. Wait a moment and ask again.':'The AI Helper could not answer. Try again.'}}
  finally{asking=false;$('helper-ask').disabled=!AI;S.chat=S.chat.slice(-20);save();renderAnswers();renderHist()}
}
function actionsFor(d){const out=[];(d.actions||[]).forEach(a=>{if(!a||!a.type)return;
  if(a.type==='trade'){const give=(a.give||[]).map(n=>findByName(n)).filter(p=>p&&OWN[p.id]===S.me).map(p=>p.id),get=(a.get||[]).map(n=>findByName(n)).filter(p=>p&&OWN[p.id]&&OWN[p.id]!==S.me).map(p=>p.id);
    if(give.length&&get.length&&get.every(id=>OWN[id]===OWN[get[0]]))out.push(['Open this trade in the builder',`trade|${give.join(',')}|${get.join(',')}`,true])}
  else if(a.type==='add'){const p=findByName(a.player||'');if(p&&!OWN[p.id]){const dp=a.drop?findByName(a.drop):null,drop=dp&&OWN[dp.id]===S.me?dp.id:'';out.push([`Add ${p.n}${drop?` (drop ${byId[drop].n})`:''}`,`add|${p.id}|${drop}`,true])}}
  else if(a.type==='view'){const p=findByName(a.player||'');if(p)out.push([`View ${p.n}`,`view|${p.id}`,false])}});
  return out.filter((x,i,arr)=>arr.findIndex(y=>y[1]===x[1])===i).slice(0,4)}
function renderAnswers(){const list=S.chat||[];
  $('answers').innerHTML=list.length?list.map(a=>{const q=`<div class="msg-q" id="msg-${a.id}"><span>${esc(a.q)}</span></div>`;
    if(a.status==='thinking')return q+`<div class="ans"><div class="ans-b"><div class="skel" style="height:28px;width:50%"></div><div class="skel"></div><div class="skel" style="width:85%"></div></div></div>`;
    if(a.status==='error')return q+`<div class="ans"><div class="ans-b"><p class="ans-t" style="color:var(--bad)">${esc(a.msg)}</p></div></div>`;
    const d=a.data||{},players=(d.players||[]).map(x=>({...x,p:findByName(x.name||'')}));
    const cards=players.map(x=>{const p=x.p;if(!p)return '';const g=G[p.id];return `<div class="pcard" data-open="${p.id}"><div class="pc-top" style="${tcVars(p.t)}">${av(p)}<div><div class="nm">${esc(p.n)}</div><div class="sm">${p.pos}${V.posRank[p.id]} · ${p.t} · ${g.next?oppTxt(p.id):'Bye'}</div></div>${x.verdict?`<span class="verdict">${esc(x.verdict)}</span>`:''}</div>
       <div class="pc-body"><div class="pc-nums"><div><b>${g.next?f1(g.projNext):'-'}</b><span>Wk ${WEEK}</span></div><div><b>${f1(g.last3)}</b><span>Last 3</span></div><div><b>${f1(V.pts[p.id])}</b><span>Pts/G</span></div></div>${sparkSvg(p.id)}<p class="pc-note">${esc(x.note||'')}</p>${tagHtml(p.id)}</div></div>`}).join('');
    const acts=actionsFor(d);
    return q+`<div class="ans"><div class="ans-b"><div class="ans-h">${esc(d.headline||'Answer')}</div><p class="ans-t">${esc(d.answer||'')}</p>${cards?`<div class="pcards">${cards}</div>`:''}
      ${(d.points||[]).length?`<ul class="points">${d.points.map(t=>`<li><span>${esc(t)}</span></li>`).join('')}</ul>`:''}
      ${acts.length?`<div class="acts">${acts.map(([l,v,main])=>`<button class="btn ${main?'primary':''} small" data-act="${v}">${esc(l)}</button>`).join('')}</div>`:''}
      ${(d.followups||[]).length?`<div class="fu-row"><span class="lab2" style="margin:0">Ask next</span>${d.followups.slice(0,3).map(f=>`<button class="chip" data-q="${esc(f)}">${esc(f)}</button>`).join('')}</div>`:''}</div></div>`}).join('')
   :'<p class="empty" style="margin:0">Ask a question or choose a prompt above. Answers include one-click actions.</p>'}
async function shrinkImage(file){try{const bmp=await createImageBitmap(file),k=Math.min(1,1600/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));return b||file}catch(e){return file}}
function lev(a,b){const m=a.length,n=b.length,d=Array.from({length:m+1},(_,i)=>[i]);for(let j=1;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n]}
function matchName(raw,pos,team){const q=norm(raw||'');if(!q)return {id:null,sugg:[],score:0};const qp=q.split(' '),last=qp[qp.length-1],first=qp[0];pos=String(pos||'').toUpperCase();team=String(team||'').toUpperCase();if(team==='LA')team='LAR';
  const sc=POOL.map(p=>{const n=norm(p.n),np=n.split(' '),pl=np[np.length-1];let v=0;
    if(n===q)v=100;else if(pl===last&&qp.length>1&&np[0][0]===first[0])v=80;else if(pl===last)v=55;else{const sim=1-lev(n,q)/Math.max(n.length,q.length);v=sim>.72?sim*72:0}
    if(v&&qp.length>=3&&np.slice(-2).join(' ')===qp.slice(-2).join(' '))v+=12;
    if(v&&pos&&p.pos===pos)v+=8;if(v&&team&&p.t===team)v+=8;return [p.id,v]}).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  const b=sc[0],ok=b&&b[1]>=63&&(b[1]>=100||!sc[1]||b[1]-sc[1][1]>=6);return {id:ok?b[0]:null,score:b?b[1]:0,sugg:sc.slice(0,3).map(x=>x[0])}}
function looseJSON(t){try{return JSON.parse(t.slice(t.indexOf('{'),t.lastIndexOf('}')+1))}catch(e){return null}}
async function readScreenshot(file){
  const team=hubSel,img=URL.createObjectURL(file);shotState={team,status:'reading',img};renderShot();
  if(!AI||!AIimg){shotState={team,status:'error',img,msg:'Screenshot reading is not available in this view. Add players by name below instead.'};renderShot();return}
  const prompt=`This is a screenshot of a fantasy football team roster from an app such as ESPN, Sleeper, Yahoo, NFL Fantasy or CBS. List every NFL player on this roster: starters, bench and injured reserve. Skip kickers, team defenses and empty slots. Apps often shorten names (like "J. Chase" or "A. St. Brown"): write the full name only if you are sure, otherwise copy the name exactly as shown. Add the NFL team abbreviation and position when they are visible.
Reply with JSON only: {"team_name":"the fantasy team's name if shown, otherwise null","players":[{"name":"...","pos":"QB|RB|WR|TE","nfl_team":"KC"}]}`;
  try{const blob=await shrinkImage(file);let r;
    try{r=await AI.json(prompt,{images:[blob]})}catch(e){if(e&&e.code==='invalid_json'&&e.text)r=looseJSON(e.text);else throw e}
    const items=[],seen=new Set();((r&&r.players)||[]).forEach(x=>{if(!x||!x.name)return;const m=matchName(x.name,x.pos,x.nfl_team);if(m.id&&seen.has(m.id))return;if(m.id)seen.add(m.id);items.push({read:String(x.name),pos:x.pos||'',nfl:x.nfl_team||'',id:m.id,sugg:m.sugg,on:!!m.id})});
    shotState=items.length?{team,status:'review',img,items,teamName:(r&&r.team_name)||''}:{team,status:'error',img,msg:'No players found in that image. Try a clearer screenshot that shows the player names.'}}
  catch(e){shotState={team,status:'error',img,msg:e&&e.code==='not_granted'?'Allow TradeMetric to send the image to Claude, then try again.':e&&e.code==='rate_limited'?'Too many requests. Wait a moment and try again.':'Could not read that screenshot. Try again, or add players by name below.'}}
  renderShot();
}

/* ===== Schedule, records, Season Sim, matchup ===== */
const CV={QB:.32,RB:.48,WR:.55,TE:.6,K:.5,DST:.6};
const N_SIM=2000;let REG_WEEKS=14;
/* S.real holds the league's actual results when imported: rec {tid:{w,l,t,pf}}, sched {week:[[a,b]]}, scores {week:{tid:pts}}, played, regWeeks, playoffTeams */
const realPlayed=()=>S.real&&S.real.played!=null?S.real.played:PLAYED;let SCHED=null,REC_CACHE={v:-1},SIM_CACHE={v:-1};
const Phi=z=>.5*(1+erf(z/Math.SQRT2));
const pct=x=>Math.round(x*100)+'%';
function schedule(){REG_WEEKS=(S.real&&S.real.regWeeks)||14;const ids=S.teams.map(T=>T.id),key=ids.join()+(S.real?'|R'+S.real.at:'');if(SCHED&&SCHED.key===key)return SCHED.weeks;
  const a=[...ids];if(a.length%2)a.push(null);const n=a.length,rest=a.slice(1),L=rest.length,weeks={};
  for(let w=1;w<=REG_WEEKS;w++){const k=(w-1)%(n-1),rot=[a[0],...rest.slice(L-k),...rest.slice(0,L-k)],pairs=[];for(let i=0;i<n/2;i++)pairs.push([rot[i],rot[n-1-i]]);weeks[w]=pairs}
  if(S.real&&S.real.sched)for(const w in S.real.sched){const pr=S.real.sched[w].filter(x=>ids.includes(x[0])&&(!x[1]||ids.includes(x[1])));if(pr.length)weeks[w]=pr}
  SCHED={key,weeks};return weeks}
function oppOf(tid,w){const pr=(schedule()[w]||[]).find(p=>p.includes(tid));return pr?(pr[0]===tid?pr[1]:pr[0]):null}
function pickVal(w){return id=>{const p=byId[id];if(BYE[p.t]===w||LONG_OUT.includes(stOf(id)))return 0;if(w===WEEK&&G[id]&&G[id].live)return G[id].projNext;const o=OPP[p.t]&&OPP[p.t][w];return V.pts[id]*(o?matchF(o.opp,p.pos):1)*(w===WEEK?weekMult(id)*(p.pos==='DST'?1:vegasF(p.t)):1)}}
function weekLine(players,w,tid){const f=pickVal(w),lu=(w===WEEK&&tid&&realLineup(tid))||lineup(players,f);let m=0,v=0;lu.slots.forEach(s=>{if(!s.p)return;const x=f(s.p.id),l=w===WEEK&&liveOf(s.p.id),rf=l?(l.state==='post'?0:l.rem):1;m+=x;v+=(CV[s.p.pos]*x*rf)**2});return {m,sd:Math.sqrt(v)||1,lu}}
function recordsThru(n){const d={};S.teams.forEach(T=>d[T.id]={w:0,l:0,t:0,pf:0});const sched=schedule();
  if(S.real&&S.real.scores){for(let w=1;w<=n;w++){const sc=S.real.scores[w]||{};(sched[w]||[]).forEach(([a,b])=>{if(!a||!b||sc[a]==null||sc[b]==null)return;d[a].pf+=sc[a];d[b].pf+=sc[b];if(sc[a]>sc[b]){d[a].w++;d[b].l++}else if(sc[b]>sc[a]){d[b].w++;d[a].l++}else{d[a].t++;d[b].t++}})}return d}
  for(let w=1;w<=n;w++){const sc={};S.teams.forEach(T=>{const lu=lineup(T.players,id=>BYE[byId[id].t]===w?0:V.pts[id]);sc[T.id]=lu.slots.reduce((a,x)=>a+(x.p?(G[x.p.id].pts[w-1]||0):0),0)});
    sched[w].forEach(([a,b])=>{if(!a||!b)return;d[a].pf+=sc[a];d[b].pf+=sc[b];if(sc[a]>sc[b]){d[a].w++;d[b].l++}else if(sc[b]>sc[a]){d[b].w++;d[a].l++}else{d[a].t++;d[b].t++}})}
  return d}
function powerRanks(){const st=teamStats(),now=records(),prev=recordsThru(Math.max(0,realPlayed()-1)),z=a=>{const m=avg(a),sd=Math.sqrt(avg(a.map(x=>(x-m)**2)))||1;return a.map(x=>(x-m)/sd)};
  const ids=S.teams.map(T=>T.id),tot=ids.map(t=>(st.rows.find(r=>r.T.id===t)||{total:0}).total),zt=z(tot);
  const score=rec=>{const zp=z(ids.map(t=>rec[t].pf)),zw=z(ids.map(t=>rec[t].w+rec[t].t/2));return ids.map((t,i)=>.55*zt[i]+.25*zp[i]+.2*zw[i])};
  const sn=score(now),sp=score(prev),rk=a=>{const o=ids.map((t,i)=>[t,a[i]]).sort((x,y)=>y[1]-x[1]),m={};o.forEach(([t],i)=>m[t]=i+1);return m},rn=rk(sn),rp=rk(sp);
  return ids.map((t,i)=>({T:teamById(t),score:sn[i],rank:rn[t],move:rp[t]-rn[t]})).sort((a,b)=>a.rank-b.rank)}
function records(){if(REC_CACHE.v===VER)return REC_CACHE.d;const d={};S.teams.forEach(T=>d[T.id]={w:0,l:0,t:0,pf:0});const sched=schedule();
  if(S.real&&S.real.rec){S.teams.forEach(T=>{const r=S.real.rec[T.id];if(r)d[T.id]={w:r.w||0,l:r.l||0,t:r.t||0,pf:r.pf||0}});REC_CACHE={v:VER,d};return d}
  for(let w=1;w<=PLAYED;w++){const sc={};S.teams.forEach(T=>{const lu=lineup(T.players,id=>BYE[byId[id].t]===w?0:V.pts[id]);sc[T.id]=lu.slots.reduce((a,x)=>a+(x.p?(G[x.p.id].pts[w-1]||0):0),0)});
    sched[w].forEach(([a,b])=>{if(!a||!b)return;d[a].pf+=sc[a];d[b].pf+=sc[b];if(sc[a]>sc[b]){d[a].w++;d[b].l++}else if(sc[b]>sc[a]){d[b].w++;d[a].l++}else{d[a].t++;d[b].t++}})}
  REC_CACHE={v:VER,d};return d}
const recTxt=t=>{const r=records()[t];return r?`${r.w}-${r.l}${r.t?'-'+r.t:''}`:'0-0'};
function simulate(over){
  if(S.teams.length<2)return null;if(SIM_CACHE.v!==VER)SIM_CACHE={v:VER};
  const key=over?Object.keys(over).sort().map(k=>k+':'+over[k].join(',')).join(';'):'base';if(SIM_CACHE[key])return SIM_CACHE[key];
  const ids=S.teams.map(T=>T.id),pl=t=>(over&&over[t])||teamById(t).players,rec=records(),sched=schedule(),M={};
  const P0=realPlayed();ids.forEach(t=>{M[t]={};for(let w=Math.min(P0,PLAYED)+1;w<=17;w++)M[t][w]=weekLine(pl(t),w,over&&over[t]?null:t)});
  const r=mulberry32(90210);let spare=null;
  const z=()=>{if(spare!==null){const x=spare;spare=null;return x}let u=0;while(u===0)u=r();const v=r(),m=Math.sqrt(-2*Math.log(u));spare=m*Math.sin(2*Math.PI*v);return m*Math.cos(2*Math.PI*v)};
  const PT=(S.real&&S.real.playoffTeams)||(ids.length>=10?6:ids.length>=6?4:2),P=Math.min(PT,ids.length),BP=P>=6?6:P>=4?4:2,out={P};ids.forEach(t=>out[t]={wins:0,playoff:0,bye:0,title:0});
  const play=(a,b,w)=>M[a][w].m+M[a][w].sd*z()>=M[b][w].m+M[b][w].sd*z()?a:b;
  for(let s=0;s<N_SIM;s++){const W={},PF={};ids.forEach(t=>{W[t]=rec[t].w+rec[t].t/2;PF[t]=rec[t].pf});
    for(let w=P0+1;w<=REG_WEEKS;w++)(sched[w]||[]).forEach(([a,b])=>{if(!a||!b)return;const x=M[a][w].m+M[a][w].sd*z(),y=M[b][w].m+M[b][w].sd*z();PF[a]+=x;PF[b]+=y;if(x>=y)W[a]++;else W[b]++});
    const seeds=[...ids].sort((a,b)=>W[b]-W[a]||PF[b]-PF[a]),po=seeds.slice(0,BP);ids.forEach(t=>out[t].wins+=W[t]);seeds.slice(0,P).forEach(t=>out[t].playoff++);
    let champ;
    if(BP===6){out[po[0]].bye++;out[po[1]].bye++;const a=play(po[2],po[5],15),b=play(po[3],po[4],15),low=seeds.indexOf(a)>seeds.indexOf(b)?a:b,high=low===a?b:a;champ=play(play(po[0],low,16),play(po[1],high,16),17)}
    else if(BP===4)champ=play(play(po[0],po[3],16),play(po[1],po[2],16),17);
    else champ=play(po[0],po[1],17);
    out[champ].title++}
  ids.forEach(t=>{const o=out[t];o.wins/=N_SIM;o.playoff/=N_SIM;o.bye/=N_SIM;o.title/=N_SIM});
  SIM_CACHE[key]=out;return out}
function oddsLineOld(t){const me=myTeam(),T=teamById(t.team),sb=simulate(),sa=simulate({[S.me]:me.players.filter(x=>!t.give.includes(x)).concat(t.get),[t.team]:T.players.filter(x=>!t.get.includes(x)).concat(t.give)});
  if(!sb||!sa)return '';const d=sa[S.me].playoff-sb[S.me].playoff;return `<p class="why odds">Playoff odds ${pct(sb[S.me].playoff)} → ${pct(sa[S.me].playoff)} (${d>=0?'+':''}${Math.round(d*100)} pts) in Season Sim</p>`}
function renderOppCard(){const el=$('opp-card');if(!el)return;
  const best=p=>Math.max(...G[p.id].opp.map(o=>o.mult)),list=POOL.filter(p=>G[p.id].opp.length).sort((a,b)=>best(b)-best(a));
  const show=[...list.filter(p=>OWN[p.id]===S.me),...list.filter(p=>!OWN[p.id])].slice(0,6);
  el.innerHTML=`<div class="card-h"><h2>Injury opportunities</h2><span class="note">Players gaining work from teammate injuries</span></div>`+(show.length?show.map(p=>`<div class="mini-row">${plCell(p,oppTxtLine(G[p.id].opp[0]))}${OWN[p.id]===S.me?'<span class="tag mine">Yours</span>':'<span class="gain">Pickup</span>'}${OWN[p.id]?'<span></span>':`<button class="btn small" data-assign-me="${p.id}">Add</button>`}</div>`).join('')
   :`<p class="empty" style="margin:0">When a starter is ruled out or lands on injured reserve, the teammates who inherit his work show up here as pickups. This turns on with the live injury feed, or now if you import projections with a status column.</p>`)}
function renderMatchup(){const el=$('matchup');const oid=oppOf(S.me,WEEK);
  if(!oid){el.innerHTML=`<div class="card-h"><h2>Week ${WEEK} matchup</h2></div><p class="empty">No opponent this week.</p>`;return}
  const me=myTeam(),O=teamById(oid),A=weekLine(me.players,WEEK,S.me),Bm=weekLine(O.players,WEEK,oid),pw=Phi((A.m-Bm.m)/Math.sqrt(A.sd**2+Bm.sd**2)),f=pickVal(WEEK);
  const act=lu=>sum(lu.slots.filter(x=>x.p&&liveOf(x.p.id)),x=>liveOf(x.p.id).pts),anyLive=[...A.lu.slots,...Bm.lu.slots].some(x=>x.p&&liveOf(x.p.id)),aA=act(A.lu),aB=act(Bm.lu);
  const keyP=(lu,ot)=>{let best=null;lu.slots.forEach((x,i)=>{if(!x.p)return;const mu=f(x.p.id);if(mu<=0)return;const o=ot.slots[i],edge=mu-(o&&o.p?f(o.p.id):0);if(!best||edge>best.edge)best={p:x.p,mu,edge,slot:x.label}});return best};
  const kp=(x,lab)=>{if(!x)return '';const n=G[x.p.id].next,lv=liveOf(x.p.id);if(lv)return `<div><span class="lab2">${lab}</span>${plCell(x.p,lv.state==='post'?`Scored ${f1(lv.pts)}. Game is final.`:`${f1(lv.pts)} so far, on pace for ${f1(x.mu)}.`)}</div>`;return `<div><span class="lab2">${lab}</span>${plCell(x.p,`${f1(x.mu)} projected${x.edge>0?`, ${f1(x.edge)} more than the other ${x.slot}`:''}${n?`. Faces ${n.opp}, ${ord(n.rank)} against ${x.p.pos}s`:''}.`)}</div>`};
  const cell=(id,v,win,al)=>{const l=id&&liveOf(id);return `<td class="${al} num ${win?'win':''}">${l?`<b>${f1(l.pts)}</b><small>${l.state==='post'?'final':'proj '+f1(v)}</small>`:f1(v)}</td>`};
  const rows=A.lu.slots.map((x,i)=>{const o=Bm.lu.slots[i],a=x.p?f(x.p.id):0,b=o&&o.p?f(o.p.id):0;
    const sub=id=>liveOf(id)?`${byId[id].pos} · ${liveTxt(id)} ${f1(liveOf(id).pts)} pts`:`${byId[id].pos} · ${oppHtml(id)}`;
    return `<tr><td>${x.p?plCell(x.p,sub(x.p.id)):'<span class="empty">Empty</span>'}</td>${cell(x.p&&x.p.id,a,a>=b,'r')}<td class="mu-slot">${x.label}</td>${cell(o&&o.p&&o.p.id,b,b>a,'')}<td>${o&&o.p?plCell(o.p,sub(o.p.id)):'<span class="empty">Empty</span>'}</td></tr>`}).join('');
  el.innerHTML=`<div class="card-h"><h2>Week ${WEEK} matchup</h2><span class="note">${A.lu.real?'Your real lineups · ':''}${LIVE&&LIVE.week===WEEK&&Object.values(LIVE.games).some(g=>g.state!=='pre')?`<span class="live-dot${LIVE.live?' on':''}"></span>${LIVE.live?'Live':'Updated'} · ${new Date(LIVE.updated).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} · points so far plus the rest of each game projected`:'Win probability from projected lineups'}</span></div>
   <div class="mu-head"><div class="mu-team"><span class="mu-name"><i class="tsq" style="background:${teamColor(S.me)}"></i>${esc(me.name)}</span><span class="note">${recTxt(S.me)}</span><b class="num">${f1(anyLive?aA:A.m)}</b>${anyLive?`<span class="mu-proj">proj ${f1(A.m)}</span>`:''}</div>
    <div class="mu-mid"><div class="mu-pct">${pct(pw)}</div><div class="note">chance you win</div></div>
    <div class="mu-team r"><span class="mu-name"><i class="tsq" style="background:${teamColor(oid)}"></i>${esc(O.name)}</span><span class="note">${recTxt(oid)}</span><b class="num">${f1(anyLive?aB:Bm.m)}</b>${anyLive?`<span class="mu-proj">proj ${f1(Bm.m)}</span>`:''}</div></div>
   <div class="mu-bar"><i style="width:${pw*100}%;background:${teamColor(S.me)}"></i><i style="width:${(1-pw)*100}%;background:${versusColor(teamColor(S.me),teamColor(oid))}"></i></div>
   <div class="mu-swing">${kp(keyP(A.lu,Bm.lu),'Your key player')}${kp(keyP(Bm.lu,A.lu),'Their key player')}</div>
   <details class="mu-details"><summary>Position-by-position comparison</summary><div class="mu-table"><table><thead><tr><th>You</th><th class="r">${anyLive?'Pts':'Proj'}</th><th style="text-align:center">Slot</th><th>${anyLive?'Pts':'Proj'}</th><th>${esc(O.name)}</th></tr></thead><tbody>${rows}</tbody></table></div></details>`}
function renderSeason(){
  const sim=simulate(),me=S.me;$('season-kicker').textContent=`${S.league.name||'My League'} · ${N_SIM.toLocaleString()} simulated seasons`;
  if(!sim){$('season-tiles').innerHTML='';$('sim-body').innerHTML='<tr><td colspan="7" class="empty">Add at least two teams in League Hub.</td></tr>';$('road').innerHTML='';return}
  const rec=records(),o=sim[me],ids=S.teams.map(T=>T.id),bar=x=>`<div class="pbar"><i class="${x>=.66?'hi':x>=.33?'mid':'lo'}" style="width:${x*100}%"></i><span>${pct(x)}</span></div>`;
  $('season-tiles').innerHTML=`<div class="tile hot"><div class="lab">Playoff odds</div><div class="val">${pct(o.playoff)}</div><div class="sub">Top ${sim.P} of ${ids.length} make it</div></div>
   <div class="tile"><div class="lab">Title odds</div><div class="val">${pct(o.title)}</div><div class="sub">Win the Week 17 final</div></div>
   <div class="tile"><div class="lab">Record now</div><div class="val">${recTxt(me)}</div><div class="sub">${f1(rec[me].pf)} points for</div></div>
   <div class="tile"><div class="lab">Projected finish</div><div class="val">${o.wins.toFixed(1)}-${(REG_WEEKS-o.wins).toFixed(1)}</div><div class="sub">Average record after Week ${REG_WEEKS}</div></div>`;
  $('sim-body').innerHTML=ids.map(t=>{const T=teamById(t),r=rec[t],x=sim[t];return `<tr class="${t===me?'me-row':''}"><td data-v="${esc(T.name.toLowerCase())}"><span class="owner${t===me?' me':''}"><i style="background:${teamColor(t)}"></i>${esc(T.name)}${t===me?' (you)':''}</span></td><td class="r num" data-v="${r.w+r.t/2+r.pf/1e5}">${recTxt(t)}</td><td class="r num">${f1(r.pf)}</td><td class="r num">${x.wins.toFixed(1)}</td><td data-v="${x.playoff}">${bar(x.playoff)}</td><td data-v="${x.bye}">${sim.P===6?bar(x.bye):'<span class="note">-</span>'}</td><td data-v="${x.title}">${bar(x.title)}</td></tr>`}).join('');
  sortTable('sim-table');
  $('sim-note').textContent=`Weeks 1 to ${PLAYED} use real 2026 scores; Weeks ${PLAYED+1} to ${REG_WEEKS} and the playoffs are simulated from projected lineups, byes and matchups. ${sim.P===6?'Seeds 1 and 2 get a first-round bye.':''}`;
  let road='';for(let w=WEEK;w<=REG_WEEKS;w++){const oid=oppOf(me,w);if(!oid)continue;const A=weekLine(myTeam().players,w,me),Bm=weekLine(teamById(oid).players,w,oid),p=Phi((A.m-Bm.m)/Math.sqrt(A.sd**2+Bm.sd**2));
    road+=`<div class="road-row"><span class="slot">Wk ${w}</span><span class="owner"><i style="background:${teamColor(oid)}"></i>${esc(teamById(oid).name)}</span><span class="note">${recTxt(oid)}</span><span class="wp ${p>=.6?'good':p<.4?'bad':''}">${pct(p)}</span></div>`}
  $('road').innerHTML=road||'<p class="empty">Regular season is over.</p>';
}

/* ===== Platform import ===== */
const SEASON=2026;let IMP={status:'',html:''};
function importGridHtml(){
  const tile=(bg,mark,sm,name,sub,desc,act)=>`<div class="imp"><div class="imp-h"><span class="imp-logo${sm?' sm':''}" style="background:${bg}" aria-hidden="true">${mark}</span><div><b>${name}</b><span class="imp-sub">${sub}</span></div></div><p class="imp-desc">${desc}</p><div class="imp-act">${act}</div></div>`;
  return `<div class="imp-grid">
    ${tile('#18213A','S',0,'Sleeper','Username, no password','Pulls every roster, team name and your scoring settings.',`<input type="text" class="imp-in" placeholder="Sleeper username" autocomplete="off" value="${esc(IMP.user||'')}"><button class="btn primary" data-imp="sleeper">Connect</button>`)}
    ${tile('#C8102E','ESPN',1,'ESPN','League ID','Works for public and private leagues. Private leagues take one extra sign-in step.',`<input type="text" class="imp-in" placeholder="League ID" inputmode="numeric" autocomplete="off"><button class="btn primary" data-imp="espn">Connect</button>`)}
    ${tile('#5B12C7','Y',0,'Yahoo','Sign in with Yahoo','Pick your league after signing in. Turns on when TradeMetric launches.',`<button class="btn" disabled>Available at launch</button>`)}
    ${tile('#0B2A5B','NFL',1,'NFL Fantasy','Screenshot','No public data access. Upload a screenshot of each roster.',`<button class="btn" data-imp="shot">Use a screenshot</button>`)}
    ${tile('#0A4AA6','CBS',1,'CBS','Screenshot','No public data access. Upload a screenshot of each roster.',`<button class="btn" data-imp="shot">Use a screenshot</button>`)}
   </div><div class="imp-status">${IMP.html||''}</div>`}
function renderImport(){const el=$('import-card');if(!el)return;const open=IMP.open??!S.imported;
  el.innerHTML=`<details class="imp-details" id="imp-details" ${open?'open':''}><summary><div><h2>Import your league</h2><span class="note">${S.imported?`Imported ${esc(S.imported.name)} from ${esc(S.imported.src)}. Open to re-import.`:'Pull in every team, roster and scoring setting at once'}</span></div><span class="chev" aria-hidden="true"></span></summary>${importGridHtml()}</details>`}
function renderWelcome(){$('wl-import').innerHTML=`<div class="card-h"><h2>Connect your league</h2><span class="note">Teams, rosters and scoring in one step</span></div>${importGridHtml()}`}
function impMsg(html){IMP.html=html;document.querySelectorAll('.imp-status').forEach(el=>el.innerHTML=html)}
const BLOCKED_MSG=`<div class="callout neutral" style="color:var(--ink)"><b>Can't reach that site from this preview.</b> This version of TradeMetric runs in a locked-down preview that can't connect to other websites. The import is built and will work once TradeMetric runs on its own server. Until then, use a screenshot for each team below.</div>`;
async function getJSON(url){let r;try{r=await fetch(url)}catch(e){const err=new Error('blocked');err.blocked=true;throw err}if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
let SLEEPER_PLAYERS=null;
async function sleeperConnect(user){
  IMP.user=user;impMsg('<p class="note">Looking up '+esc(user)+' on Sleeper...</p>');
  try{const u=await getJSON('https://api.sleeper.app/v1/user/'+encodeURIComponent(user));if(!u||!u.user_id){impMsg(`<p class="note" style="color:var(--bad)">No Sleeper user named ${esc(user)}. Check the spelling.</p>`);return}
    const leagues=await getJSON(`https://api.sleeper.app/v1/user/${u.user_id}/leagues/nfl/${SEASON}`);IMP.sleeper={u,leagues};
    if(!leagues.length){impMsg(`<p class="note">${esc(user)} has no ${SEASON} leagues on Sleeper.</p>`);return}
    impMsg(`<div class="callout neutral" style="color:var(--ink)"><b>Pick a league to import.</b><div class="chips" style="margin-top:8px">${leagues.map((l,i)=>`<button class="chip" data-imp-league="${i}" style="padding-left:10px">${esc(l.name)} <span class="v">${l.total_rosters} teams</span></button>`).join('')}</div></div>`)}
  catch(e){impMsg(e.blocked?BLOCKED_MSG:`<p class="note" style="color:var(--bad)">Sleeper didn't answer (${esc(e.message)}). Try again in a minute.</p>`)}
}
async function sleeperImport(i){
  const {u,leagues}=IMP.sleeper,lg=leagues[i];impMsg('<p class="note">Importing '+esc(lg.name)+'...</p>');
  try{const [rosters,users]=await Promise.all([getJSON(`https://api.sleeper.app/v1/league/${lg.league_id}/rosters`),getJSON(`https://api.sleeper.app/v1/league/${lg.league_id}/users`)]);
    if(!SLEEPER_PLAYERS)SLEEPER_PLAYERS=await getJSON('https://api.sleeper.app/v1/players/nfl');
    const ss=lg.scoring_settings||{},inv=v=>v?Math.round(1/v):0,rp=lg.roster_positions||[],cnt=k=>rp.filter(x=>x===k).length;
    const sc={pyd:inv(ss.pass_yd),ptd:ss.pass_td??4,int:ss.pass_int??-2,cmp:ss.pass_cmp||0,p300:ss.bonus_pass_yd_300||0,ryd:inv(ss.rush_yd),rtd:ss.rush_td??6,ratt:ss.rush_att||0,r100:ss.bonus_rush_yd_100||0,
      recRB:(ss.rec||0)+(ss.bonus_rec_rb||0),recWR:(ss.rec||0)+(ss.bonus_rec_wr||0),recTE:(ss.rec||0)+(ss.bonus_rec_te||0),recyd:inv(ss.rec_yd),rectd:ss.rec_td??6,rec100:ss.bonus_rec_yd_100||0,fd:ss.rush_fd||ss.rec_fd||0,fl:ss.fum_lost??-2};
    const slots={QB:cnt('QB'),RB:cnt('RB'),WR:cnt('WR'),TE:cnt('TE'),FLEX:cnt('FLEX'),SFLEX:cnt('SUPER_FLEX'),K:cnt('K'),DST:cnt('DEF'),BN:cnt('BN')};
    Object.assign(sc,{k39:ss.fgm_30_39??ss.fgm_0_19??3,k49:ss.fgm_40_49??4,k50:ss.fgm_50p??ss.fgm_50_59??5,kmiss:ss.fgmiss??-1,xpm:ss.xpm??1,xpmiss:ss.xpmiss??-1,dsk:ss.sack??1,dint:ss.int??2,dfr:ss.fum_rec??2,dtd:ss.def_td??6,dsf:ss.safe??2,pa0:ss.pts_allow_0??10,pa6:ss.pts_allow_1_6??7,pa13:ss.pts_allow_7_13??4,pa20:ss.pts_allow_14_20??1,pa27:ss.pts_allow_21_27??0,pa34:ss.pts_allow_28_34??-1,pa35:ss.pts_allow_35p??-4});
    const teams=rosters.map(r=>{const us=users.find(x=>x.user_id===r.owner_id);return {name:(us&&us.metadata&&us.metadata.team_name)||(us&&us.display_name)||'Team '+r.roster_id,mine:r.owner_id===u.user_id,
      names:(r.players||[]).map(pid=>SLEEPER_PLAYERS[pid]||(NICK[pid==='LA'?'LAR':pid]?{position:'DEF',team:pid}:null)).filter(x=>x&&(OFFK.includes(x.position)||x.position==='DEF')).map(x=>x.position==='DEF'?(NICK[x.team==='LA'?'LAR':x.team]||x.team)+' D/ST':{n:x.full_name,pos:x.position,t:x.team==='LA'?'LAR':x.team})}});
    const rw=Math.max(1,((lg.settings&&lg.settings.playoff_week_start)||15)-1),ix={};rosters.forEach((r,i)=>ix[r.roster_id]=i);
    const weeks=await Promise.all(Array.from({length:rw},(_,i)=>getJSON(`https://api.sleeper.app/v1/league/${lg.league_id}/matchups/${i+1}`).catch(()=>[])));
    const real={regWeeks:rw,playoffTeams:(lg.settings&&lg.settings.playoff_teams)||null,sched:{},scores:{},rec:{},played:0};
    weeks.forEach((ms,i)=>{const w=i+1,g={};(ms||[]).forEach(m=>{if(ix[m.roster_id]==null)return;if(m.matchup_id!=null)(g[m.matchup_id]=g[m.matchup_id]||[]).push(ix[m.roster_id]);(real.scores[w]=real.scores[w]||{})[ix[m.roster_id]]=+m.points||0});
      const pr=Object.values(g).filter(x=>x.length===2);if(pr.length)real.sched[w]=pr;
      if(w<WEEK&&Object.values(real.scores[w]||{}).some(x=>x>0))real.played=w});
    rosters.forEach((r,i)=>{const s=r.settings||{};real.rec[i]={w:s.wins||0,l:s.losses||0,t:s.ties||0,pf:(s.fpts||0)+(s.fpts_decimal||0)/100}});
    const pmap={},want=new Map(POOL.filter(q=>q.pos!=='DST').map(q=>[norm(q.n),q])),cands=Object.entries(SLEEPER_PLAYERS).filter(([,sp])=>sp&&OFFK.includes(sp.position)&&sp.full_name&&want.has(norm(sp.full_name)));
    /* same name: prefer the one on the same NFL team */
    const took=new Set();[true,false].forEach(sameTeam=>cands.forEach(([pid,sp])=>{const q=want.get(norm(sp.full_name));if(took.has(q.id)||(sameTeam&&sp.team!==q.t))return;pmap[pid]=q.id;took.add(q.id)}));rosters.forEach(r=>(r.players||[]).forEach(pid=>{const sp=SLEEPER_PLAYERS[pid];if(sp&&!pmap[pid]&&OFFK.includes(sp.position)){const q=findExact(sp.full_name,sp.position);if(q)pmap[pid]=q.id}}));
    real.src={type:'sleeper',league:lg.league_id,labels:rp.filter(x=>!['BN','IR','TAXI'].includes(x)),rid:Object.fromEntries(rosters.map((r,i)=>[r.roster_id,i])),pmap};
    applyImport(lg.name,teams,sc,slots,'Sleeper',real)}
  catch(e){impMsg(e.blocked?BLOCKED_MSG:`<p class="note" style="color:var(--bad)">Import failed (${esc(e.message)}). Try again.</p>`)}
}
const ESPN_KEY='tm-espn-login';
function espnSaved(){try{return JSON.parse(localStorage.getItem(ESPN_KEY)||'null')}catch(e){return null}}
async function espnFetch(id,creds,sp){
  if(creds){const r=await fetch('/api/espn',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({leagueId:id,season:SEASON,s2:creds.s2,swid:creds.swid,scoringPeriodId:sp||null})}).catch(()=>null);
    if(!r){const e=new Error('blocked');e.blocked=true;throw e}
    const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.error||'HTTP '+r.status);e.code=j.code||'error';e.status=r.status;throw e}return j}
  return getJSON(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${id}?view=mTeam&view=mRoster&view=mSettings&view=mMatchupScore${sp?'&scoringPeriodId='+sp:''}`)}
function espnPrivateForm(id,err){const sv=espnSaved()||{};
  return `<div class="callout neutral espn-priv" style="color:var(--ink)"><b>This looks like a private league.</b> ESPN doesn't let other apps sign in for you, so we use two login codes ESPN saves in your browser.${err?`<p style="color:var(--bad);margin:8px 0 0">${esc(err)}</p>`:''}
   <ol class="espn-steps"><li>On a computer, sign in at <b>espn.com/fantasy</b> in Chrome.</li><li>Right-click the page and pick <b>Inspect</b>, then open the <b>Application</b> tab.</li><li>Under <b>Cookies</b>, click <b>https://www.espn.com</b>.</li><li>Copy the values of <b>espn_s2</b> and <b>SWID</b> into the boxes below.</li></ol>
   <div class="espn-fields"><label>espn_s2<input type="password" class="imp-in espn-s2" autocomplete="off" spellcheck="false" value="${esc(sv.s2||'')}" placeholder="Long code starting with AE..."></label>
   <label>SWID<input type="text" class="imp-in espn-swid" autocomplete="off" spellcheck="false" value="${esc(sv.swid||'')}" placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"></label></div>
   <label class="espn-rem"><input type="checkbox" class="espn-remember" ${sv.s2?'checked':''}> Remember on this device</label>
   <div class="toolbar" style="margin-top:10px"><button class="btn primary" data-espn-private="${esc(id)}">Import private league</button>${sv.s2?'<button class="btn" data-espn-forget="1">Forget codes</button>':''}</div>
   <p class="note" style="margin:8px 0 0">These codes act like your ESPN login. TradeMetric only uses them to read your league and never stores them on its servers. Signing out of ESPN makes them stop working.</p></div>`}
async function espnImport(id,creds){
  if(!/^\d+$/.test(id)){impMsg('<p class="note" style="color:var(--bad)">An ESPN league ID is a number, like 12345678. You can find it in your league page address after "leagueId=".</p>');return}
  IMP.espnId=id;if(!creds){const sv=espnSaved();if(sv&&sv.s2)creds=sv}
  impMsg('<p class="note">Looking up ESPN league '+esc(id)+'...</p>');
  let d;
  try{d=await espnFetch(id,creds)}
  catch(e){
    if(!creds&&!e.blocked&&/HTTP (401|403|404)/.test(e.message)){impMsg(espnPrivateForm(id));return}
    if(creds&&!e.blocked){impMsg(espnPrivateForm(id,e.message));return}
    if(!creds&&e.blocked){impMsg(espnPrivateForm(id));return}
    impMsg(e.blocked?BLOCKED_MSG:`<p class="note" style="color:var(--bad)">ESPN didn't return that league (${esc(e.message)}).</p>`);return}
  if(!d||!d.teams||!d.teams.length||(d.teams[0]&&!d.teams[0].roster&&!creds)){impMsg(espnPrivateForm(id));return}
  try{

    const st=d.settings||{},items=(st.scoringSettings&&st.scoringSettings.scoringItems)||[],pt=sid=>{const x=items.find(i=>i.statId===sid);return x?x.points:0};
    const sc={...BASE_SC,pyd:pt(3)?Math.round(1/pt(3)):25,ptd:pt(4)||4,int:pt(20)||-2,ryd:pt(24)?Math.round(1/pt(24)):10,rtd:pt(25)||6,recyd:pt(42)?Math.round(1/pt(42)):10,rectd:pt(43)||6,k39:pt(80)||3,k49:pt(77)||4,k50:pt(74)||5,kmiss:pt(85)||-1,xpm:pt(86)||1,xpmiss:pt(88)||-1,recRB:pt(53),recWR:pt(53),recTE:pt(53),fl:pt(72)||-2};
    const ls=(st.rosterSettings&&st.rosterSettings.lineupSlotCounts)||{},slots={QB:ls[0]||1,RB:ls[2]||2,WR:ls[4]||2,TE:ls[6]||1,FLEX:ls[23]||0,SFLEX:ls[7]||0,K:ls[17]||0,DST:ls[16]||0,BN:ls[20]||6};
    const POSID={1:'QB',2:'RB',3:'WR',4:'TE',5:'K',16:'DST'};
    const myId=creds&&creds.swid?('{'+creds.swid.replace(/[{}]/g,'')+'}').toUpperCase():null;
    const teams=(d.teams||[]).map(t=>({name:t.name||[t.location,t.nickname].filter(Boolean).join(' ')||'Team '+t.id,mine:!!myId&&[t.primaryOwner,...(t.owners||[])].some(o=>String(o||'').toUpperCase()===myId),
      names:((t.roster&&t.roster.entries)||[]).map(e=>e.playerPoolEntry&&e.playerPoolEntry.player).filter(x=>x&&POSID[x.defaultPositionId]).map(x=>POSID[x.defaultPositionId]==='DST'?x.fullName:{n:x.fullName,pos:POSID[x.defaultPositionId]})}));
    const ix={},ss=st.scheduleSettings||{},rw=ss.matchupPeriodCount||14;(d.teams||[]).forEach((t,i)=>ix[t.id]=i);
    const real={regWeeks:rw,playoffTeams:ss.playoffTeamCount||null,sched:{},scores:{},rec:{},played:0};
    (d.schedule||[]).forEach(m=>{const w=m.matchupPeriodId;if(!w||w>rw||!m.home||ix[m.home.teamId]==null)return;const a=ix[m.home.teamId],b=m.away&&ix[m.away.teamId]!=null?ix[m.away.teamId]:null;
      if(b!=null)(real.sched[w]=real.sched[w]||[]).push([a,b]);
      if(m.winner&&m.winner!=='UNDECIDED'){const sc=(real.scores[w]=real.scores[w]||{});sc[a]=m.home.totalPoints||0;if(b!=null)sc[b]=m.away.totalPoints||0;real.played=Math.max(real.played,w)}});
    (d.teams||[]).forEach((t,i)=>{const o=(t.record&&t.record.overall)||{};real.rec[i]={w:o.wins||0,l:o.losses||0,t:o.ties||0,pf:o.pointsFor||0}});
    const ESPN_SLOT={0:'QB',2:'RB',4:'WR',6:'TE',16:'DST',17:'K',23:'FLEX',3:'FLEX',5:'FLEX',7:'SF'};
    real.lineupWeek=d.scoringPeriodId||null;real.lineups={};
    (d.teams||[]).forEach((t,i)=>{const L=((t.roster&&t.roster.entries)||[]).filter(e=>ESPN_SLOT[e.lineupSlotId]).map(e=>{const pl=e.playerPoolEntry&&e.playerPoolEntry.player,q=pl&&findExact(pl.fullName);return {label:ESPN_SLOT[e.lineupSlotId],id:q?q.id:null}});
      L.sort((a,b)=>SLOT_ORDER.indexOf(a.label)-SLOT_ORDER.indexOf(b.label));if(L.length)real.lineups[i]=L});
    real.src={type:'espn',league:String(id),priv:!!creds,rid:Object.fromEntries((d.teams||[]).map((t,i)=>[t.id,i]))};if(creds)IMP.espnCreds=creds;
    applyImport((st.name)||'ESPN League',teams,sc,slots,'ESPN',real);readEspnWeek(d)}
  catch(e){impMsg(`<p class="note" style="color:var(--bad)">Couldn't read that ESPN league (${esc(e.message)}).</p>`)}
}
function applyImport(name,teams,sc,slots,src,real){
  let miss=0;S.league.name=name;S.league.sc={...S.league.sc,...sc};S.league.slots={...S.league.slots,...slots};S.league.teams=teams.length;
  teams.forEach(t=>t.names.forEach(x=>{if(typeof x==='object'&&!findExact(x.n,x.pos))addExtraPlayer(x.n,x.pos,x.t)}));setPool();
  S.teams=teams.map((t,i)=>({id:'t'+(i+1),name:t.name,players:[...new Set(t.names.map(x=>{const p=typeof x==='object'?findExact(x.n,x.pos,x.t):findExact(x);if(!p)miss++;return p&&p.id}).filter(Boolean))]}));
  if(real){const tid=i=>S.teams[i]&&S.teams[i].id,mapW=o=>{const r={};for(const w in o)r[w]=o[w].map(([a,b])=>[tid(a),b==null?null:tid(b)]);return r},mapT=o=>{const r={};for(const k in o)r[tid(+k)]=o[k];return r};
    const scores={};for(const w in real.scores)scores[w]=mapT(real.scores[w]);
    const src=real.src?{...real.src,rid:Object.fromEntries(Object.entries(real.src.rid).map(([rid,i])=>[rid,tid(i)]))}:null;
    PLAT=null;S.real={at:Date.now(),regWeeks:real.regWeeks,playoffTeams:real.playoffTeams,played:real.played,rec:mapT(real.rec),sched:mapW(real.sched),scores,src,lineupWeek:real.lineupWeek||null,lineups:real.lineups?mapT(real.lineups):null}}else S.real=null;SCHED=null;LIVE_LU=null;
  if(S.real&&S.real.src)setTimeout(syncNow,0);
  const mi=teams.findIndex(t=>t.mine);S.me=S.teams[mi>=0?mi:0].id;S.log=[];S.example=false;S.imported={name,src};S.onboarded=true;IMP.open=undefined;hubSel=S.me;bump();buildLeagueForm();toast('Imported '+name);if(location.hash!=='#team')location.hash='team';else render();window.scrollTo({top:0,behavior:'smooth'});
  impMsg(`<div class="callout buy"><b>Imported ${esc(name)}.</b> ${teams.length} teams and your scoring are loaded.${miss?` ${miss} players aren't in TradeMetric's player list yet and were skipped.`:''}${mi<0?' Pick your team in Team rosters and press "This is my team".':''}</div>`)}

/* ===== AI scouting report ===== */
async function scout(id){const el=$('scout');if(!el)return;
  if(!AI){el.innerHTML='<p class="note">The AI is not available in this view.</p>';return}
  el.innerHTML='<div class="skel"></div><div class="skel" style="width:80%;margin-top:6px"></div>';
  const p=byId[id],g=G[id],sc=S.league.sc;
  const prompt=`Write a fantasy football scouting report on ${p.n} (${p.pos}, ${p.t}) for a manager in this league. End with a clear call: buy, sell, hold or start.
League: ${S.league.teams} teams, ${leagueTagline(S.league)}. Reception points RB ${sc.recRB} / WR ${sc.recWR} / TE ${sc.recTE}, pass TD ${sc.ptd}.
Projection: ${f1(V.pts[id])} pts per game, ranked #${V.rank[id]} overall and ${p.pos}${V.posRank[id]} in this league. Last 3 games average ${f1(g.last3)}. Weekly points so far: ${g.pts.map(x=>x===null?'bye':f1(x)).join(', ')}.
Usage vs normal over the last 3 games: ${Math.round(g.ur*100)}%. Remaining schedule average defense rank vs ${p.pos}: ${f1(g.ros)} (32 = easiest). Playoff weeks: ${f1(g.po)}.
${g.buy?'Buy-low signals: '+g.buy.join(' '):''}${g.risk?' Risk signals: '+g.risk.join(' '):''}
Owner: ${OWN[id]?(OWN[id]===S.me?'this manager':teamById(OWN[id]).name):'free agent'}.
Injury status: ${stOf(id)?ST_LABEL[stOf(id)]+(p.inj?' ('+p.inj+')':''):'no designation on file'}. Injury history: not available yet.
Role trend: ${roleTxt(p,g)}.${g.role?' '+g.role:''}
Teammates out: ${g.mates.map(q=>q.n+' ('+ST_LABEL[stOf(q.id)]+')').join(', ')||'none reported'}.
Next 4 opponents: ${schedOf(p.t,WEEK,WEEK+3).map(x=>x.g?`${x.g.home?'vs':'at'} ${x.g.opp} (${ord(defRank(x.g.opp,p.pos))} of 32 against ${p.pos}s, 32 = easiest)`:'bye').join(', ')}.
Cover, in order: injury status and how much risk he carries, how his role is trending and why, the next few matchups, then the call. If injury history is not available, say so in a few words instead of guessing. Stats are real 2026 results through Week ${PLAYED}; do not invent news or injuries beyond what is given. Plain text, no headings or lists, 4 to 5 sentences.`;
  try{const r=await AI(prompt);if(openId===id&&$('scout'))$('scout').innerHTML=`<p class="scout-text">${esc(r.text)}</p>`}
  catch(e){if($('scout'))$('scout').innerHTML=`<p class="note">${e&&e.code==='not_granted'?'Allow the AI to write reports to use this.':'Could not write the report. Try again.'}</p><button class="btn small" data-scout="${id}">Try again</button>`}
}

/* ===== Player card ===== */
let openId=null;
function roleTxt(p,g){if(p.pos==='K'){const gs=g.log.filter(x=>!x.bye&&!x.dnp),fg=x=>(x.k39||0)+(x.k49||0)+(x.k50||0)+(x.kmiss||0),a=avg(gs.slice(-3).map(fg)),b=avg(gs.map(fg));return `${f1(a)} field goal tries a game lately vs ${f1(b)} for the season`}
  if(p.pos==='DST'){const gs=g.log.filter(x=>!x.bye&&!x.dnp),a=avg(gs.slice(-3).map(x=>x.pa)),b=avg(gs.map(x=>x.pa));return `${f1(a)} points allowed lately vs ${f1(b)} for the season`}const games=g.log.filter(x=>!x.bye&&!x.dnp),l3=games.slice(-3),u=x=>p.pos==='QB'?x.cmp:p.pos==='RB'?x.ratt+x.rec:x.tgt,lab=p.pos==='QB'?'completions':p.pos==='RB'?'touches':'targets';
  const a=avg(l3.map(u)),b=avg(games.map(u)),ch=b?Math.round((a/b-1)*100):0;return `${f1(a)} ${lab} a game lately vs ${f1(b)} for the season (${ch>=0?'+':''}${ch}%)`}
function newsItems(p,g){const out=[];const s=stOf(p.id);
  if(s)out.push({t:`<b>${ST_LABEL[s]}.</b> ${p.inj?esc(p.inj)+'. ':''}${s==='Q'?'Expect him to play, with some risk.':s==='D'?'Unlikely to play this week.':'Will not play this week.'}`});
  g.mates.forEach(q=>out.push({t:`<b>${esc(q.n)} is ${ST_LABEL[stOf(q.id)].toLowerCase()}.</b> More ${p.pos==='RB'?'carries':'targets'} should go to ${esc(p.n)}.`}));
  g.opp.forEach(o=>out.push({t:`<b>${oppTxtLine(o)}</b> ${OWN[p.id]?'':'He is a free agent in your league.'}`}));
  if(g.role&&!g.mates.length)out.push({t:esc(g.role)});
  out.push({q:true,t:'Full news write-ups and practice reports arrive with the live data feed.'});return out}
function openCard(id){if(openId!==id)delete SORTS['log-table'];openId=id;const p=byId[id];if(!p)return;const g=G[id],sc=S.league.sc;
  const games=g.log.filter(x=>!x.bye&&!x.dnp),teamGames=g.log.filter(x=>!x.bye).length,tot=k=>sum(games,x=>x[k]),n=Math.max(1,games.length),season=sum(g.pts.filter(x=>x!==null),x=>x);
  const cols=p.pos==='K'?[['FG 0-39','k39'],['FG 40-49','k49'],['FG 50+','k50'],['MISS','kmiss'],['XP','xpm'],['XP MISS','xpmiss']]:p.pos==='DST'?[['SACK','dsk'],['INT','dint'],['FR','dfr'],['TD','dtd'],['SFTY','dsf'],['PA','pa']]:p.pos==='QB'?[['CMP','cmp'],['YDS','pyd'],['TD','ptd'],['INT','int'],['CAR','ratt'],['RYDS','ryd'],['RTD','rtd']]:p.pos==='RB'?[['CAR','ratt'],['YDS','ryd'],['TD','rtd'],['TGT','tgt'],['REC','rec'],['RYDS','recyd'],['RTD','rectd']]:[['TGT','tgt'],['REC','rec'],['YDS','recyd'],['TD','rectd']].concat(p.ratt?[['CAR','ratt'],['RUSH','ryd']]:[]);
  const usage=p.pos==='K'?[['FG made/G',(tot('k39')+tot('k49')+tot('k50'))/n],['40+ yd made',tot('k49')+tot('k50')],['FG pct',(tot('k39')+tot('k49')+tot('k50'))/Math.max(1,tot('k39')+tot('k49')+tot('k50')+tot('kmiss'))*100,'%'],['XP made/G',tot('xpm')/n]]:p.pos==='DST'?[['Sacks/G',tot('dsk')/n],['Takeaways/G',(tot('dint')+tot('dfr'))/n],['Pts allowed/G',tot('pa')/n],['Def TD',tot('dtd')]]:p.pos==='QB'?[['Pass yds/G',tot('pyd')/n],['Pass TD',tot('ptd')],['INT',tot('int')],['Rush yds/G',tot('ryd')/n],['Rush TD',tot('rtd')]]
    :p.pos==='RB'?[['Carries/G',tot('ratt')/n],['Rush yds/G',tot('ryd')/n],['Targets/G',tot('tgt')/n],['Rec/G',tot('rec')/n],['Total TD',tot('rtd')+tot('rectd')]]
    :[['Targets/G',tot('tgt')/n],['Rec/G',tot('rec')/n],['Yds/G',tot('recyd')/n],['Catch rate',tot('tgt')?tot('rec')/tot('tgt')*100:0,'%'],['TD',tot('rectd')]];
  if(g.tshare!==null)usage.push(['Target share',g.tshare,'%']);if(g.snap!==null)usage.push(['Snap share',g.snap,'%']);
  const own=OWN[id],isMine=own===S.me;
  const comps=V.list.filter(q=>q.id!==id&&(isMine?(OWN[q.id]&&OWN[q.id]!==S.me):OWN[q.id]===S.me)&&Math.abs(tv(q.id)-tv(id))<=Math.max(2,.18*tv(id))).sort((a,b)=>{const w=teamStats().rows.find(r=>r.T.id===S.me).weak;return (isMine?(b.pos===w)-(a.pos===w):0)||Math.abs(tv(a.id)-tv(id))-Math.abs(tv(b.id)-tv(id))}).slice(0,3);
  const nx=g.next;
  $('modal').innerHTML=`<div class="mhead" style="${tcVars(p.t)}"><button class="mclose" id="mclose" aria-label="Close">×</button>${av(p,'lg')}<div style="position:relative;z-index:1;min-width:0"><h2>${esc(p.n)}</h2><div class="msub"><span>${p.pos} · ${p.t}</span><span>Bye Wk ${BYE[p.t]||'—'}</span>${stOf(id)?`<span class="tag" style="background:rgba(0,0,0,.4);color:#fff">${ST_LABEL[stOf(id)]}</span>`:''}${tagFull(id)}${OWN[id]!==S.me?followBtn(id):''}</div></div></div>
   <div class="mbody">
    <div class="mstats"><div><b>#${V.rank[id]}</b><span>Overall</span></div><div><b>${p.pos}${V.posRank[id]}</b><span>Position</span></div><div><b>${nx?f1(g.projNext):'—'}</b><span>Wk ${WEEK} proj</span></div><div><b>${f1(g.season)}</b><span>Avg pts</span></div><div><b>${f1(g.last3)}</b><span>Last 3</span></div></div>
    <div class="msec"><div class="nextgame">${nx?`<div><span class="note">Next game · Week ${WEEK}</span><br><b>${nx.home?'vs':'at'} ${nx.opp}</b>${VEGAS[p.t]?`<br><span class="note">Team expected to score ${VEGAS[p.t]} (betting line)</span>`:''}</div><div class="note" style="flex:1;min-width:180px">${nx.opp} ${p.pos==='DST'?'offense':'defense'} ranks <b style="font-size:inherit;font-family:inherit">${ord(nx.rank)}</b> ${p.pos==='DST'?'in points given up to opposing defenses':'against '+p.pos+'s'} (1st gives up the fewest, 32nd the most).${nx.rank>=24?' Good matchup.':nx.rank<=8?' Tough matchup.':''}</div>`:`<div><span class="note">Week ${WEEK}</span><br><b>Bye week</b></div>`}<div style="margin-left:auto">${ownerHtml(id)}</div></div></div>
    ${g.buy?`<div class="callout buy"><b>Why buy him</b><ul class="reasons">${g.buy.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    ${g.tag==='sell'?`<div class="callout sell"><b>Sell high.</b> He's scoring ${f1(g.last3)} a game lately, well above his ${f1(V.pts[id])} projection, without getting more work. Good time to trade him.</div>`:''}
    ${g.risk?`<div class="callout risk"><b>Why he is a risk</b><ul class="reasons">${g.risk.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    ${g.role?`<div class="callout buy"><b>Hot streak with a reason.</b> ${esc(g.role)}</div>`:''}
    <div class="msec" id="card-hl">${cardHighlights(id)}</div>
    <div class="msec"><h4>Scouting report</h4><div class="scout-grid">
      <div><span class="lab2">Status</span>${stOf(id)?`<b>${ST_LABEL[stOf(id)]}</b>${p.inj?`<span class="note">${esc(p.inj)}</span>`:''}`:'<b>No injury designation</b>'}<span class="note">${S.custom?'From your imported data':`From the Week ${DATA.injWeek} injury report`}</span></div>
      <div><span class="lab2">Injury history</span><b>Played ${games.length} of ${teamGames} team games</b><span class="note">${games.length<teamGames?`Missed ${teamGames-games.length} this season`:'Has not missed a game this season'}</span></div>
      <div><span class="lab2">Next 4 games</span><div class="chips">${schedOf(p.t,WEEK,WEEK+3).map(x=>x.g?`<span class="drk ${defRank(x.g.opp,p.pos)>=24?'easy':defRank(x.g.opp,p.pos)<=8?'hard':''}">${x.g.home?'vs':'at'} ${x.g.opp} · ${ord(defRank(x.g.opp,p.pos))}</span>`:'<span class="drk">Bye</span>').join('')}</div><span class="note">Defense rank against ${p.pos}s</span></div>
      <div><span class="lab2">Role trend</span><b>${roleTxt(p,g)}</b><span class="note">${p.pos==='K'?'Field goal chances':p.pos==='DST'?'Lower is better':g.ur>=1.12?'Usage is rising':g.ur<=.88?'Usage is falling':'Usage is steady'}</span></div>
    </div>
    <div id="scout" style="margin-top:10px"><button class="btn small" data-scout="${id}">Generate AI scouting report</button></div></div>
    <div class="msec"><h4>Usage this season</h4><div class="usage">${usage.map(([l,v,u])=>`<div><b>${u?Math.round(v)+u:(Number.isInteger(v)?v:f1(v))}</b><span>${l}</span></div>`).join('')}</div></div>
    <div class="msec"><h4>Game log</h4><div class="logbox"><table id="log-table"><thead><tr><th data-sort data-first="asc">WK</th><th>OPP</th>${cols.map(c=>`<th class="r" data-sort>${c[0]}</th>`).join('')}<th class="r" data-sort>FPTS</th></tr></thead>
      <tbody>${g.log.map((x,i)=>x.bye?`<tr><td>${x.w}</td><td colspan="${cols.length+2}" class="muted">Bye week</td></tr>`:x.dnp?`<tr><td>${x.w}</td><td>${x.home?'vs':'@'} ${x.opp}</td><td colspan="${cols.length+1}" class="muted">Did not play</td></tr>`:`<tr><td>${x.w}</td><td>${x.home?'vs':'@'} ${x.opp}</td>${cols.map(c=>`<td class="r num">${x[c[1]]}</td>`).join('')}<td class="r num" style="font-weight:700">${f1(g.pts[i])}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Season</td>${cols.map(c=>`<td class="r num">${tot(c[1])}</td>`).join('')}<td class="r num">${f1(season)}</td></tr></tfoot></table></div>
      <p class="note" style="margin:6px 0 0">Real 2026 stats through Week ${PLAYED}. Last updated ${new Date(DATA.asOf+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}; refreshed every morning.</p></div>
    <div class="msec"><h4>Schedule ahead</h4><div class="schedbox"><div class="sched">${schedOf(p.t,WEEK,17).map(x=>x.g?`<div class="sw ${defRank(x.g.opp,p.pos)>=24?'easy':defRank(x.g.opp,p.pos)<=8?'hard':''}${x.w>=15?' po':''}"><span>Wk ${x.w}</span><b>${x.g.home?'vs':'at'} ${x.g.opp}</b><em>${ord(defRank(x.g.opp,p.pos))}</em></div>`:`<div class="sw${x.w>=15?' po':''}"><span>Wk ${x.w}</span><b>BYE</b><em>-</em></div>`).join('')}</div></div>
      <p class="note" style="margin:6px 0 0">Defense rank against ${p.pos}s. Green is an easy matchup, red is tough. Weeks 15 to 17, underlined, are the fantasy playoffs.</p></div>
    <div class="msec"><h4>${isMine?'Trade him for similar value':own?'What it would take from your roster':'Similar value on your roster'}</h4>${comps.length?comps.map(q=>`<div class="mini-row">${plCell(q,`${q.pos}${V.posRank[q.id]} · ${f1(V.pts[q.id])} pts/G · ${OWN[q.id]===S.me?'your team':esc(teamById(OWN[q.id]).name)}`)}${tagHtml(q.id)||'<span></span>'}<button class="btn small" data-load="${isMine?id:q.id}|${isMine?q.id:id}" ${(!isMine&&!own)?'hidden':''}>Trade</button></div>`).join(''):'<p class="empty">No close matches in your league right now.</p>'}</div>
    <div class="msec"><h4>News</h4><ul class="news">${newsItems(p,g).map(x=>`<li${x.q?' class="q"':''}>${x.t}</li>`).join('')}</ul></div>
   </div>`;
  sortTable('log-table');$('scrim').hidden=false;document.body.style.overflow='hidden';$('mclose').focus();
}
function closeCard(){$('scrim').hidden=true;document.body.style.overflow='';openId=null}

/* ===== League setup form ===== */
function leagueTagline(L){const s=L.slots,sc=L.sc,bits=[`${L.teams}-team`],r=sc.recWR;bits.push(r===0?'Standard':r===.5?'Half PPR':r===1?'PPR':r+' PPR');
  if(s.SFLEX)bits.push('Superflex');else if(s.QB>=2)bits.push(s.QB+'QB');if(sc.recTE>sc.recWR)bits.push(`TE +${f1(sc.recTE-sc.recWR)}`);if(sc.ptd>=6)bits.push('6-pt pass TD');return bits.join(' · ')}
function buildLeagueForm(){
  $('scoring-form').innerHTML=SC_FIELDS.map(([g,fs])=>`<div class="group-title">${g}</div><div class="fieldset">${fs.map(([k,l,st,h])=>`<div class="field"><label for="sc-${k}">${l}</label><input type="number" id="sc-${k}" data-sc="${k}" step="${st}">${h?`<span class="hint">${h}</span>`:''}</div>`).join('')}</div>`).join('');
  $('slots-form').innerHTML=SLOT_FIELDS.map(([k,l,mn,mx])=>`<div class="field"><label for="sl-${k}">${l}</label><input type="number" id="sl-${k}" data-slot="${k}" min="${mn}" max="${mx}" step="1"></div>`).join('');
}
function fillLeagueForm(){const L=S.league;document.querySelectorAll('[data-sc]').forEach(i=>{if(document.activeElement!==i)i.value=L.sc[i.dataset.sc]});
  document.querySelectorAll('[data-slot]').forEach(i=>{if(document.activeElement!==i)i.value=i.dataset.slot==='teams'?L.teams:L.slots[i.dataset.slot]});
  if(document.activeElement!==$('lg-name'))$('lg-name').value=L.name||'';
  $('proj-source').textContent=S.custom?`Using your imported projections (${S.custom.length} players).`:`Using real 2026 stats through Week ${PLAYED}, blended with preseason expectations, for ${BUILTIN.length} players.`}
const CSV_COLS={name:'n',pos:'pos',team:'t',pass_cmp:'cmp',pass_yd:'pyd',pass_td:'ptd',pass_int:'int',rush_att:'ratt',rush_yd:'ryd',rush_td:'rtd',targets:'tgt',rec:'rec',rec_yd:'recyd',rec_td:'rectd',fum_lost:'fl',status:'status',injury:'inj'};
function parseCSV(txt){const lines=txt.trim().split(/\r?\n/).filter(Boolean);if(lines.length<2)throw new Error('Add a header row and at least one player.');
  const split=l=>{const o=[];let c='',q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===','&&!q){o.push(c);c=''}else c+=ch}o.push(c);return o.map(s=>s.trim())};
  const head=split(lines[0]).map(h=>h.toLowerCase());if(!head.includes('name')||!head.includes('pos'))throw new Error('The header needs at least "name" and "pos" columns.');
  const out=[];lines.slice(1).forEach(l=>{const c=split(l),o={...Z,t:'FA'};head.forEach((h,i)=>{const k=CSV_COLS[h];if(!k)return;o[k]=['n','pos','t','status','inj'].includes(k)?c[i]:(parseFloat(c[i])||0)});
    o.pos=(o.pos||'').toUpperCase();o.t=(o.t||'FA').toUpperCase();if(!o.n||!POS.includes(o.pos))return;o.id=slug(o.n);if(!head.includes('fum_lost'))o.fl=FUM[o.pos];out.push(o)});
  if(!out.length)throw new Error('No rows had a name and a QB, RB, WR or TE position.');return out}
const TEMPLATE='name,pos,team,pass_cmp,pass_yd,pass_td,pass_int,rush_att,rush_yd,rush_td,targets,rec,rec_yd,rec_td,fum_lost,status,injury\nJosh Allen,QB,BUF,20,235,1.7,0.6,7.5,38,0.7,0,0,0,0,0.2,,\nBijan Robinson,RB,ATL,0,0,0,0,17,85,0.7,5.5,4.3,38,0.2,0.09,Q,ankle';

/* ===== Theme ===== */
const SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
let themePref=null;try{themePref=localStorage.getItem('hashmark-theme')}catch(e){}
const isDark=()=>themePref?themePref==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
function applyTheme(){if(themePref)document.documentElement.setAttribute('data-theme',themePref);const d=isDark();$('theme-btn').innerHTML=d?SUN:MOON;$('theme-btn').setAttribute('aria-label',d?'Switch to light mode':'Switch to dark mode')}
$('theme-btn').addEventListener('click',()=>{themePref=isDark()?'light':'dark';try{localStorage.setItem('hashmark-theme',themePref)}catch(e){}applyTheme()});

/* ===== Routing & events ===== */
const TABS=['team','feed','trade','rankings','hub','season','helper','league','welcome','signin'];let tab='team';
function go(t){if(!USER&&t!=='signin')t='signin';tab=TABS.includes(t)?t:'team';if(tab!=='welcome'&&S&&!S.onboarded){S.onboarded=true;save()}document.querySelectorAll('.nav button').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  TABS.forEach(x=>$('v-'+x).hidden=x!==tab);render();window.scrollTo(0,0)}
function render(){({team:renderTeam,rankings:renderRankings,trade:renderTrade,hub:renderHub,season:renderSeason,helper:renderHelper,welcome:renderWelcome,league:fillLeagueForm,signin:renderSignin,feed:renderFeed})[tab]();if(openId&&!$('scrim').hidden)openCard(openId)}
document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.tab}));
window.addEventListener('hashchange',()=>{closeCard();go(location.hash.slice(1))});
function loadTrade(str){const [g,r]=str.split('|');TD.give=g?g.split(','):[];TD.get=r?r.split(','):[];closeCard();if(tab==='trade')renderTrade();else location.hash='trade';setTimeout(()=>$('rating').scrollIntoView({behavior:'smooth',block:'center'}),60)}
document.addEventListener('click',e=>{
  if(e.target===$('scrim')){closeCard();return}
  const th=e.target.closest('th[data-sort]');if(th){const tbl=th.closest('table'),i=[...th.parentNode.children].indexOf(th),st=SORTS[tbl.id];SORTS[tbl.id]=st&&st.col===i?{col:i,dir:st.dir==='desc'?'asc':'desc'}:{col:i,dir:th.dataset.first||'desc'};sortTable(tbl.id);return}
  const t=e.target.closest('[data-open],[data-load],button,[data-hub]');if(!t)return;const d=t.dataset;
  if(d.load!==undefined){loadTrade(d.load);return}
  if(d.act){doAct(d.act);return}
  if(d.hjump){const el=$('msg-'+d.hjump);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});return}
  if(d.open){openCard(d.open);return}
  if(d.hub){hubSel=d.hub;shotState=null;renderHub();$('team-manager').scrollIntoView({behavior:'smooth',block:'start'});return}
  if(t.id==='mclose'){closeCard();return}
  if(d.swap){const [a,dr]=d.swap.split('|');if(dr)assign(dr,null);assign(a,S.me);toast(`Added ${byId[a].n}${dr?', dropped '+byId[dr].n:''}`);render()}
  else if(d.rmode){RATE_MODE=d.rmode;renderTrade()}
  else if(d.scout)scout(d.scout);
  else if(d.imp){const inp=t.parentNode.querySelector('input');if(d.imp==='sleeper'){const v=inp.value.trim();if(!v){toast('Type your Sleeper username');return}sleeperConnect(v)}else if(d.imp==='espn')espnImport(inp.value.trim());else if(tab==='welcome')$('wl-shot').click();else if($('shot-file'))$('shot-file').click()}
  else if(d.impLeague!==undefined)sleeperImport(+d.impLeague);
  else if(d.espnPrivate){const box=t.closest('.espn-priv'),q=c=>box.querySelector(c),s2=q('.espn-s2').value||'',swid=q('.espn-swid').value||'',rem=q('.espn-remember').checked;
    if(!s2.trim()||!swid.trim()){toast('Paste both codes first');return}const c={s2:s2.trim(),swid:swid.trim()};
    try{if(rem)localStorage.setItem(ESPN_KEY,JSON.stringify(c));else localStorage.removeItem(ESPN_KEY)}catch(e){}espnImport(d.espnPrivate,c)}
  else if(d.espnForget){try{localStorage.removeItem(ESPN_KEY)}catch(e){}impMsg(espnPrivateForm(IMP.espnId||''));toast('ESPN codes forgotten')}
  else if(t.id==='set-me'){S.me=hubSel;S.example=false;bump();toast(teamById(S.me).name+' is now your team')}
  else if(d.assignMe){assign(d.assignMe,S.me);toast('Added '+byId[d.assignMe].n);render()}
  else if(d.unassign){const n=byId[d.unassign].n;assign(d.unassign,null);toast('Removed '+n);render()}
  else if(d.give){TD.give=TD.give.includes(d.give)?TD.give.filter(x=>x!==d.give):[...TD.give,d.give];renderTrade()}
  else if(d.get){if(TD.get.length&&OWN[TD.get[0]]!==OWN[d.get]){TD.get=[];toast('Started a new deal with '+teamById(OWN[d.get]).name)}TD.get.push(d.get);renderTrade()}
  else if(d.unget){TD.get=TD.get.filter(x=>x!==d.unget);renderTrade()}
  else if(d.pos){rankPos=d.pos;t.parentNode.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b===t));renderRankings()}
  else if(d.own){rankOwn=d.own;t.parentNode.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b===t));renderRankings()}
  else if(d.tpos){tgtPos=d.tpos;t.parentNode.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b===t));renderTargets()}
  else if(d.tsort){SORTS['tgt-table']={col:+d.tsort,dir:'desc'};sortTable('tgt-table')}
  else if(d.preset){const pr=PRESETS[d.preset];S.league.sc={...pr.sc};S.league.slots={...pr.slots};bump();toast('Applied '+t.textContent.trim())}
  else if(d.q){$('helper-q').value=d.q;askHelper(d.q)}
  else if(t.id==='accept-trade'){const me=myTeam(),P=teamById(OWN[TD.get[0]]),fr=fairness(TD.give,TD.get,P.id);
    TD.give.forEach(id=>{me.players=me.players.filter(x=>x!==id);P.players.push(id)});TD.get.forEach(id=>{P.players=P.players.filter(x=>x!==id);me.players.push(id)});
    (S.log=S.log||[]).push({ts:Date.now(),aName:me.name,bName:P.name,give:[...TD.give],get:[...TD.get],label:fr.label});S.example=false;TD.give=[];TD.get=[];bump();toast('Trade done. Rosters updated.')}
  else if(t.id==='shot-replace'||t.id==='shot-add'){const T=teamById(shotState.team);if(t.id==='shot-replace'){T.players.forEach(id=>{});T.players=[]}
    const ids=shotState.items.filter(x=>x.on&&x.id).map(x=>x.id);if($('sr-rename')&&$('sr-rename').checked&&shotState.teamName)T.name=shotState.teamName;ids.forEach(id=>{S.teams.forEach(x=>x.players=x.players.filter(y=>y!==id));T.players.push(id)});shotState=null;S.example=false;S.onboarded=true;bump();toast(`${ids.length} players saved to ${T.name}`)}
  else if(t.id==='shot-cancel'){shotState=null;renderShot()}
  else if(d.srsug){const [i,id]=d.srsug.split('|');Object.assign(shotState.items[+i],{id,on:true});renderShot()}
  else if(t.id==='hub-add-btn'){const p=findByName($('hub-add').value);if(!p){toast('No player found with that name');return}const from=OWN[p.id];assign(p.id,hubSel);toast(from&&from!==hubSel?`Moved ${p.n} from ${teamById(from)?teamById(from).name:'another team'}`:'Added '+p.n);render();$('hub-add')&&$('hub-add').focus()}
});
document.addEventListener('change',e=>{const t=e.target;
  if(t.dataset.assign){if(!t.value)return;assign(t.dataset.assign,t.value);toast(`Added ${byId[t.dataset.assign].n} to ${teamById(t.value).name}`);render()}
  else if(t.id==='hub-team'){hubSel=t.value;shotState=null;renderHub()}
  else if(t.id==='shot-file'&&t.files[0]){readScreenshot(t.files[0]);t.value=''}
  else if(t.classList.contains('sr-pick')){const q=findByName(t.value);if(!q){toast('No player found with that name');return}Object.assign(shotState.items[+t.dataset.i],{id:q.id,on:true});renderShot()}
  else if(t.classList.contains('sr-on')){shotState.items[+t.dataset.i].on=t.checked;const n=shotState.items.filter(x=>x.on&&x.id).length;const b=$('shot-replace');if(b){b.textContent=`Save ${n} players to ${teamById(shotState.team).name}`;b.disabled=!n;$('shot-add').disabled=!n}}
  else if(t.id==='hub-name'){teamById(hubSel).name=t.value.trim()||'Unnamed team';bump()}
});
document.addEventListener('toggle',e=>{const d=e.target;if(!d||d.tagName!=='DETAILS')return;if(d.id==='imp-details')IMP.open=d.open;if(d.open)setTimeout(()=>{const r=d.getBoundingClientRect();if(r.bottom>innerHeight-16)d.scrollIntoView({behavior:'smooth',block:r.height>innerHeight*.8?'start':'end'})},60)},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('scrim').hidden)closeCard();if(e.key==='Enter'&&e.target.id==='hub-add')$('hub-add-btn').click()});
document.addEventListener('dragover',e=>{const d=e.target.closest&&e.target.closest('#drop');if(d){e.preventDefault();d.classList.add('over')}});
document.addEventListener('dragleave',e=>{const d=e.target.closest&&e.target.closest('#drop');if(d)d.classList.remove('over')});
document.addEventListener('drop',e=>{const d=e.target.closest&&e.target.closest('#drop');if(d){e.preventDefault();d.classList.remove('over');const f=e.dataTransfer.files[0];if(f&&f.type.startsWith('image/'))readScreenshot(f)}});
document.addEventListener('paste',e=>{if(tab!=='hub')return;const f=[...(e.clipboardData&&e.clipboardData.files||[])].find(x=>x.type.startsWith('image/'));if(f)readScreenshot(f)});
$('add-btn').addEventListener('click',()=>{const p=findByName($('add-player').value);if(!p){toast('No player found with that name');return}const from=OWN[p.id];if(from===S.me){toast(p.n+' is already on your team');return}assign(p.id,S.me);$('add-player').value='';toast(from?`Moved ${p.n} from ${teamById(from).name}`:'Added '+p.n);render()});
$('add-player').addEventListener('keydown',e=>{if(e.key==='Enter')$('add-btn').click()});
$('trade-reset').addEventListener('click',()=>{TD.give=[];TD.get=[];renderTrade()});
$('refresh-trades').addEventListener('click',()=>{sugSkip+=3;if(sugSkip>=Math.max(3,allTrades().length))sugSkip=0;renderTrade()});
$('rank-search').addEventListener('input',renderRankings);$('tgt-search').addEventListener('input',renderTargets);
$('helper-ask').addEventListener('click',()=>askHelper($('helper-q').value));
$('helper-q').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askHelper($('helper-q').value)}});
function freshLeague(n){S.real=null;SCHED=null;S.league.teams=n;S.teams=makeTeams(n);S.me='t1';S.example=false;S.imported=null;S.log=[];S.onboarded=true;hubSel='t1';shotState=null;save();recompute()}
$('wl-skip').addEventListener('click',()=>{S.onboarded=true;save();location.hash='team'});
$('wl-hand').addEventListener('click',()=>{freshLeague(+$('wl-teams').value);location.hash='hub';toast('Empty league ready. Add players to each team.')});
$('wl-shot').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;freshLeague(+$('wl-teams').value);location.hash='hub';go('hub');readScreenshot(f);e.target.value=''});
$('hist-clear').addEventListener('click',()=>{S.chat=[];save();renderHelper()});
$('load-sample').addEventListener('click',()=>{S.imported=null;S.real=null;SCHED=null;S.league.teams=S.league.teams||12;exampleLeague();hubSel=S.me;shotState=null;render();toast('Sample league loaded')});
$('clear-league').addEventListener('click',()=>{S.teams.forEach(T=>{if(T.id!==S.me)T.players=[]});S.example=false;bump();toast('Other rosters cleared. Your team was kept.')});
$('v-league').addEventListener('input',e=>{const i=e.target;
  if(i.dataset.sc!==undefined){const v=parseFloat(i.value);if(isNaN(v))return;S.league.sc[i.dataset.sc]=v}
  else if(i.dataset.slot!==undefined){let v=parseInt(i.value,10);if(isNaN(v))return;const f=SLOT_FIELDS.find(x=>x[0]===i.dataset.slot);v=Math.max(f[2],Math.min(f[3],v));if(i.dataset.slot==='teams'){S.league.teams=v;syncTeamCount()}else S.league.slots[i.dataset.slot]=v}
  else if(i.id==='lg-name')S.league.name=i.value;else return;
  save();recompute()});
$('csv-file').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>$('csv-text').value=r.result;r.readAsText(f)});
$('csv-apply').addEventListener('click',()=>{try{const rows=parseCSV($('csv-text').value);S.custom=rows;setPool();bump();toast(`Loaded ${rows.length} players`)}catch(err){toast(err.message)}});
$('csv-reset').addEventListener('click',()=>{S.custom=null;setPool();bump();toast('Using built-in projections')});
$('csv-template').addEventListener('click',()=>{navigator.clipboard.writeText(TEMPLATE).then(()=>toast('Template copied'),()=>{$('csv-text').value=TEMPLATE;$('csv-text').select();toast('Template pasted into the box')})});

/* ===== Boot ===== */
applyTheme();
if(!S||!S.league||!S.teams){S={league:{name:'Sample League',teams:12,sc:{...PRESETS.sf.sc},slots:{...PRESETS.sf.slots}},teams:[],me:'t1',log:[],example:true,custom:null,onboarded:false,chat:[]};setPool();exampleLeague()}
else{S.league.sc={...BASE_SC,...S.league.sc};if(S.league.slots.DST===undefined)S.league.slots.DST=1;if(S.league.slots.K===undefined)S.league.slots.K=1;setPool();recompute();if(S.example&&S.league.slots.K&&!S.teams.some(T=>T.players.some(id=>byId[id]&&byId[id].pos==='K')))exampleLeague()}
buildLeagueForm();
S.chat=(S.chat||[]).filter(x=>x.status==='done'||x.status==='error');
var INTENDED=location.hash.slice(1);go('signin');
loadLive();

/* ===== Accounts (Supabase): username or email + password, own sign-in page, league saved to the cloud ===== */
var SUPA_URL='https://rltmfnmgbfgecbaevfvc.supabase.co',SUPA_KEY='sb_publishable_AFX79aKgqorAx3zgOyKatw_o_3_ERWG';
var SB_FAILED=false,AUTH_VALS={},SB=null,USER=null,PROFILE=null,CLOUD={timer:null,last:null,busy:false,err:null},AUTH_MODE='in',AUTH_MSG=null,AUTH_BUSY=false;
var EXP_KEY='tm-auth-exp',KEEP_KEY='tm-keep',TWO_WEEKS=14*864e5;
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function lsDel(k){try{localStorage.removeItem(k)}catch(e){}}
function adoptState(st){S=st;setPool();SCHED=null;LIVE_LU=null;recompute();buildLeagueForm();hubSel=S.me;if(tab==='welcome')location.hash='team';render();if(S.real&&S.real.src)loadPlatform().then(()=>{recompute();render()})}
async function cloudPull(){
  const {data,error}=await SB.from('user_state').select('state,updated_at').eq('user_id',USER.id).maybeSingle();
  if(error){CLOUD.err=error.message;acctUI();return}
  const cs=data&&data.state,other=S.owner&&S.owner!==USER.id;
  if(other&&!(cs&&cs.league&&cs.teams)){S={league:{name:'Sample League',teams:12,sc:{...PRESETS.sf.sc},slots:{...PRESETS.sf.slots}},teams:[],me:'t1',log:[],example:true,custom:null,onboarded:false,chat:[]};setPool();exampleLeague();S.real=null;SCHED=null;LIVE_LU=null;buildLeagueForm();hubSel=S.me;render()}
  if(cs&&cs.league&&cs.teams&&(other||S.example||!S.savedAt||(cs.savedAt||0)>S.savedAt)){adoptState(cs);try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}toast('Loaded your saved league')}
  else await cloudPush();
  CLOUD.last=Date.now();acctUI()}
async function cloudPush(){if(!SB||!USER)return;S.owner=USER.id;CLOUD.busy=true;
  const {error}=await SB.from('user_state').upsert({user_id:USER.id,state:S,updated_at:new Date().toISOString()});
  CLOUD.busy=false;CLOUD.err=error?error.message:null;if(!error)CLOUD.last=Date.now();acctUI()}
function cloudSave(){if(!SB||!USER)return;clearTimeout(CLOUD.timer);CLOUD.timer=setTimeout(cloudPush,1500)}
async function loadProfile(){if(!USER)return;const {data}=await SB.from('profiles').select('username').eq('id',USER.id).maybeSingle();PROFILE=data||null;acctUI()}
/* "Keep me signed in": unchecked means the session ends 2 weeks after signing in. Saved data is never touched. */
function startSessionClock(){if(lsGet(EXP_KEY)!==null)return;lsSet(EXP_KEY,lsGet(KEEP_KEY)==='1'?'0':String(Date.now()+TWO_WEEKS))}
async function checkExpiry(){const v=lsGet(EXP_KEY);if(!USER||!v||v==='0'||Date.now()<+v)return false;
  await SB.auth.signOut({scope:'local'});lsDel(EXP_KEY);leaveApp();toast('Signed out after 2 weeks. Sign in again; your league is still here.');return true}
function acctName(){return PROFILE&&PROFILE.username||(USER&&USER.email)||''}
function acctUI(){const b=$('acct-btn');if(b){if(USER){b.textContent=(acctName()[0]||'?').toUpperCase();b.classList.add('in');b.title='Signed in as '+acctName()}else{b.textContent='Sign in';b.classList.remove('in');b.title=''}}
  if(tab==='signin')renderSignin()}
function renderSignin(){const el=$('signin-card');if(!el)return;
  const msg=AUTH_MSG?`<p class="auth-msg ${AUTH_MSG.bad?'bad':''}">${AUTH_MSG.html}</p>`:'';
  const keep=`<label class="auth-keep"><input type="checkbox" id="auth-keep" ${lsGet(KEEP_KEY)==='1'?'checked':''}> Keep me signed in<span class="note">Otherwise you're signed out after 2 weeks. Your league stays saved either way.</span></label>`;
  const btn=t=>`<button class="btn primary auth-go" type="submit" ${AUTH_BUSY?'disabled':''}>${AUTH_BUSY?'One moment...':t}</button>`;
  if(!SB){el.innerHTML=SB_FAILED?`<h1>Can't sign in</h1><p class="note">Sign-in didn't load. Check your connection and refresh the page.</p>`:`<h1>Loading</h1><p class="note">One moment...</p>`;return}
  if(USER&&AUTH_MODE!=='reset'){const v=lsGet(EXP_KEY);
    el.innerHTML=`<div class="kicker">Your account</div><h1>${esc(acctName())}</h1>${PROFILE&&USER.email?`<p class="note">${esc(USER.email)}</p>`:''}
     <div class="auth-rows"><div><span>League saved</span><b>${CLOUD.err?`<span style="color:var(--bad)">Couldn't save: ${esc(CLOUD.err)}</span>`:CLOUD.busy?'Saving...':CLOUD.last?'Saved '+new Date(CLOUD.last).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'Yes'}</b></div>
     <div><span>On this device</span><b>${!v||v==='0'?'Stays signed in':'Signed in until '+new Date(+v).toLocaleDateString([], {month:'short',day:'numeric'})}</b></div></div>
     ${msg}<div class="toolbar"><button class="btn primary" type="button" data-auth-home="1">Back to my team</button><button class="btn" type="button" id="auth-out">Sign out</button></div>`;return}
  const tabs=AUTH_MODE==='in'||AUTH_MODE==='up'?`<div class="seg auth-tabs"><button type="button" data-auth-mode="in" aria-pressed="${AUTH_MODE==='in'}">Sign in</button><button type="button" data-auth-mode="up" aria-pressed="${AUTH_MODE==='up'}">Create account</button></div>`:'';
  let body='';
  if(AUTH_MODE==='in')body=`<h1>Welcome back</h1><form id="auth-form" data-mode="in">
     <label>Username or email<input type="text" id="auth-id" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
     <label>Password<input type="password" id="auth-pw" autocomplete="current-password" required></label>${keep}${msg}${btn('Sign in')}
     <button type="button" class="linkish" data-auth-mode="forgot">Forgot your password?</button></form>`;
  else if(AUTH_MODE==='up')body=`<h1>Create your account</h1><form id="auth-form" data-mode="up">
     <label>Username<input type="text" id="auth-user" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required placeholder="Pick a username"></label>
     <label>Email<input type="email" id="auth-email" autocomplete="email" required></label>
     <label>Password<input type="password" id="auth-pw" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>${keep}${msg}${btn('Create account')}</form>`;
  else if(AUTH_MODE==='forgot')body=`<h1>Reset your password</h1><form id="auth-form" data-mode="forgot"><p class="note">Enter your account email and we'll send a link to set a new password.</p>
     <label>Email<input type="email" id="auth-email" autocomplete="email" required></label>${msg}${btn('Send reset link')}<button type="button" class="linkish" data-auth-mode="in">Back to sign in</button></form>`;
  else if(AUTH_MODE==='reset')body=`<h1>Set a new password</h1><form id="auth-form" data-mode="reset">
     <label>New password<input type="password" id="auth-pw" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>${msg}${btn('Save password')}</form>`;
  el.innerHTML=tabs+body;['auth-id','auth-user','auth-email'].forEach(k=>{const i=$(k);if(i&&AUTH_VALS[k])i.value=AUTH_VALS[k]});
  const f=[...el.querySelectorAll('input[type=text],input[type=email],input[type=password]')].find(i=>!i.value);if(f)setTimeout(()=>f.focus(),0)}
function enterApp(){document.body.classList.remove('signed-out');setTimeout(syncNow,300);AUTH_MODE='in';AUTH_MSG=null;
  let t=TABS.includes(INTENDED)&&INTENDED!=='signin'?INTENDED:'team';INTENDED=null;if(!S.onboarded)t='welcome';
  if(location.hash.slice(1)===t)go(t);else location.hash=t}
function leaveApp(){document.body.classList.add('signed-out');USER=null;PROFILE=null;AUTH_MODE='in';AUTH_MSG=null;if(location.hash!=='#signin')location.hash='signin';else go('signin');acctUI()}
function authFail(t){AUTH_BUSY=false;AUTH_MSG={bad:true,html:esc(t)};renderSignin()}
function authNote(h){AUTH_BUSY=false;AUTH_MSG={bad:false,html:h};renderSignin()}
async function authSubmit(mode){
  const F={};['auth-id','auth-user','auth-email','auth-pw'].forEach(k=>F[k]=($(k)||{}).value||'');AUTH_VALS={'auth-id':F['auth-id'],'auth-user':F['auth-user'],'auth-email':F['auth-email']};const v=k=>F[k].trim(),keep=!!($('auth-keep')&&$('auth-keep').checked);AUTH_BUSY=true;AUTH_MSG=null;renderSignin();
  try{
    if(mode==='in'){const id=v('auth-id'),pw=F['auth-pw'];let email=id;
      if(!id.includes('@')){const {data,error}=await SB.rpc('login_email',{p_username:id.toLowerCase(),p_password:pw});
        if(error)return authFail(error.message);if(!data)return authFail('Wrong username or password.');email=data}
      lsSet(KEEP_KEY,keep?'1':'0');lsDel(EXP_KEY);
      const {data:sd,error}=await SB.auth.signInWithPassword({email,password:pw});
      if(error)return authFail(/not confirmed/i.test(error.message)?'Confirm your email first. Check your inbox for the link.':/invalid login/i.test(error.message)?'Wrong username or password.':error.message);
      AUTH_BUSY=false;AUTH_MSG=null;if(sd&&sd.session&&!USER){USER=sd.session.user;startSessionClock();loadProfile();cloudPull()}enterApp();return}
    if(mode==='up'){const u=v('auth-user').toLowerCase(),em=v('auth-email'),pw=F['auth-pw'];
      if(!/^[a-z0-9_]{3,20}$/.test(u))return authFail('Usernames are 3 to 20 letters, numbers or underscores.');
      if(pw.length<8)return authFail('Use at least 8 characters for your password.');
      const av=await SB.rpc('username_available',{p_username:u});if(av.data===false)return authFail('That username is taken. Try another.');
      lsSet(KEEP_KEY,keep?'1':'0');lsDel(EXP_KEY);
      const {data,error}=await SB.auth.signUp({email:em,password:pw,options:{data:{username:u},emailRedirectTo:location.origin+location.pathname}});
      if(error)return authFail(/database error/i.test(error.message)?'That username is taken. Try another.':error.message);
      if(data&&data.session){AUTH_BUSY=false;AUTH_MSG=null;if(!USER){USER=data.session.user;startSessionClock();loadProfile();cloudPull()}enterApp();toast('Account created');return}
      AUTH_MODE='in';return authNote(`Almost done. We sent a confirmation link to <b>${esc(em)}</b>. Open it, then sign in with <b>${esc(u)}</b>.`)}
    if(mode==='forgot'){const em=v('auth-email');const {error}=await SB.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname});
      if(error)return authFail(error.message);return authNote(`If <b>${esc(em)}</b> has an account, a reset link is on its way.`)}
    if(mode==='reset'){const pw=F['auth-pw'];if(pw.length<8)return authFail('Use at least 8 characters for your password.');
      const {error}=await SB.auth.updateUser({password:pw});if(error)return authFail(error.message);AUTH_BUSY=false;toast('Password updated');enterApp()}
  }catch(e){authFail('Something went wrong. Try again.')}}
async function initAccounts(){
  acctUI();
  try{const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    SB=createClient(SUPA_URL,SUPA_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'implicit'}})}catch(e){SB_FAILED=true;renderSignin();return}
  if(AUTH_HASH){const q=new URLSearchParams(AUTH_HASH),rec=q.get('type')==='recovery';INTENDED='team';
    history.replaceState(null,'',location.pathname+location.search+'#signin');if(rec)AUTH_MODE='reset';
    if(q.get('access_token')){const {error}=await SB.auth.setSession({access_token:q.get('access_token'),refresh_token:q.get('refresh_token')});
      if(error){AUTH_MODE='in';toast('That link expired. Request a new one.')}else if(!rec)toast('Email confirmed. You are signed in.')}
    else if(q.get('error_description'))toast(q.get('error_description').replace(/\+/g,' '))}
  const {data}=await SB.auth.getSession();USER=data&&data.session?data.session.user:null;
  if(USER){startSessionClock();if(!(await checkExpiry())){loadProfile();cloudPull();if(AUTH_MODE!=='reset')enterApp()}}
  acctUI();
  SB.auth.onAuthStateChange((ev,session)=>{const was=USER&&USER.id;USER=session?session.user:null;
    if(ev==='SIGNED_OUT'){lsDel(EXP_KEY);if(was)leaveApp();return}
    if(USER&&USER.id!==was){startSessionClock();loadProfile();cloudPull();if(tab==='signin'&&AUTH_MODE!=='reset'&&!AUTH_BUSY)enterApp()}acctUI()});
  setInterval(checkExpiry,60*60e3)}
document.addEventListener('click',e=>{const t=e.target;if(!t.closest)return;
  if(t.closest('#acct-btn')){location.hash='signin';return}
  const m=t.closest('[data-auth-mode]');if(m){AUTH_MODE=m.dataset.authMode;AUTH_MSG=null;renderSignin();return}
  if(t.closest('[data-auth-home]')){location.hash='team';return}
  if(t.id==='auth-out'){SB.auth.signOut({scope:'local'}).then(()=>{lsDel(EXP_KEY);leaveApp();toast('Signed out. Your league is saved.')})}});
document.addEventListener('submit',e=>{if(e.target.id!=='auth-form')return;e.preventDefault();if(!AUTH_BUSY)authSubmit(e.target.dataset.mode)});
initAccounts();

/* ===== Highlights tab: results, clips (ESPN + NFL on YouTube) and news for your team and everyone you follow ===== */
var FEED=null,FEED_AT=0,FEED_F='all',FEED_LOADING=false,REC_CACHE2={at:-1,list:[]},PV={key:'',map:{}},CLIPS=[],CV_OBS=null,CV_CUR=-1;
const FEED_LS='tm-feed-cache3';
const isFollowing=id=>(S.following||[]).includes(id);
function followBtn(id,mini){const on=isFollowing(id);return mini?`<button class="star${on?' on':''}" data-follow="${id}" title="${on?'Following. Click to unfollow':'Follow this player in Highlights'}" aria-label="${on?'Unfollow':'Follow'}">${on?'★':'☆'}</button>`
  :`<button class="follow-btn${on?' on':''}" data-follow="${id}">${on?'★ Following':'☆ Follow'}</button>`}
function toggleFollow(id){S.following=S.following||[];const i=S.following.indexOf(id);if(i>=0)S.following.splice(i,1);else S.following.unshift(id);save();
  toast(i>=0?`Unfollowed ${byId[id].n}`:`Following ${byId[id].n}. See him in Highlights.`);render()}
function ago(t){const m=(Date.now()-Date.parse(t))/60e3;if(!isFinite(m))return '';if(m<60)return Math.max(1,Math.round(m))+'m ago';if(m<1440)return Math.round(m/60)+'h ago';return Math.round(m/1440)+'d ago'}
const wordIn=(hay,w)=>new RegExp('(^|[^a-z])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z]|$)').test(hay);
function statLineTxt(pos,s){if(!s)return '';const parts=[],n=x=>Math.round(x||0);
  if(pos==='K'){const fgm=n(s.k39)+n(s.k49)+n(s.k50);return `${fgm}/${fgm+n(s.kmiss)} FG${s.k50?`, ${n(s.k50)} from 50+`:''} · ${n(s.xpm)}/${n(s.xpm)+n(s.xpmiss)} XP`}
  if(pos==='DST')return `${n(s.dsk)} sack${n(s.dsk)===1?'':'s'}, ${n(s.dint)} INT, ${n(s.dfr)} fumble rec${s.dtd?`, ${n(s.dtd)} TD`:''}${s.pa!=null?`, ${n(s.pa)} pts allowed`:''}`;
  if(s.cmp||s.pyd)parts.push(`${n(s.cmp)} comp, ${n(s.pyd)} pass yds, ${n(s.ptd)} TD${s.int?`, ${n(s.int)} INT`:''}`);
  if(s.ratt)parts.push(`${n(s.ratt)} car, ${n(s.ryd)} yds${s.rtd?`, ${n(s.rtd)} TD`:''}`);
  if(s.rec||s.tgt)parts.push(`${n(s.rec)} rec (${n(s.tgt)} tgt), ${n(s.recyd)} yds${s.rectd?`, ${n(s.rectd)} TD`:''}`);
  if(s.fl)parts.push(`${n(s.fl)} fumble lost`);return parts.join(' · ')||'No stats recorded'}
function feedGame(p){const lg=LIVE&&LIVE.week===WEEK&&LIVE.games[p.t];if(lg)return lg;
  const g=FEED&&FEED.games.find(x=>x.week===WEEK&&x.teams.some(t=>t.t===p.t));if(!g)return null;const me=g.teams.find(t=>t.t===p.t),o=g.teams.find(t=>t.t!==p.t)||{};
  return {state:g.state,detail:g.detail,start:g.start,score:me.score,opp:o.t,oppScore:o.score,home:me.home}}
const teamName=t=>(NICK[t]||t);
function teamStars(t){return POOL.filter(p=>p.t===t&&p.pos!=='DST'&&V.rank[p.id]<=220).sort((a,b)=>V.pts[b.id]-V.pts[a.id]).slice(0,6).map(p=>p.id)}
function toggleTeam(t){S.followTeams=S.followTeams||[];const i=S.followTeams.indexOf(t);if(i>=0)S.followTeams.splice(i,1);else S.followTeams.push(t);save();
  toast(i>=0?`Unfollowed the ${teamName(t)}`:`Following the ${teamName(t)}`);render()}
/* players with the most highlight clips this week and last, not already yours or followed */
function recommendedFollows(){if(!FEED)return [];if(REC_CACHE2.at===FEED_AT+VER)return REC_CACHE2.list;
  const skip=new Set([...(S.following||[]),...(myTeam()?myTeam().players:[])]);
  const list=POOL.filter(p=>p.pos!=='DST'&&V.rank[p.id]<=200&&!skip.has(p.id)).map(p=>{const v=playerVideos(p).filter(x=>!x.game);return {id:p.id,n:v.length,cur:v.filter(x=>x.week===WEEK).length}})
    .filter(x=>x.n>0).sort((a,b)=>b.n-a.n||b.cur-a.cur||V.rank[a.id]-V.rank[b.id]).slice(0,8);
  REC_CACHE2={at:FEED_AT+VER,list};return list}
function feedPlayers(){const me=myTeam();if(!me)return [];const out=[],seen=new Set(),add=(id,slot)=>{if(byId[id]&&!seen.has(id)){seen.add(id);out.push({id,slot})}};
  if(FEED_F!=='follow'){const lu=realLineup(S.me)||lineup(me.players,nextV);lu.slots.forEach(x=>{if(x.p)add(x.p.id,x.label)});me.players.forEach(id=>add(id,'BN'))}
  if(FEED_F!=='mine'){(S.following||[]).forEach(id=>add(id,'<span class="slot-star">★</span>'));(S.followTeams||[]).forEach(t=>teamStars(t).forEach(id=>add(id,t)))}
  return out}

async function loadFeed(force){if(FEED_LOADING||(!force&&FEED&&Date.now()-FEED_AT<4*60e3))return;FEED_LOADING=true;
  try{const r=await fetch('/api/feed?week='+WEEK+'&b='+Math.floor(Date.now()/300000));if(r.ok){const d=await r.json();if(d&&d.videos){FEED=d;FEED_AT=Date.now();try{localStorage.setItem(FEED_LS,JSON.stringify({at:FEED_AT,d}))}catch(e){}}}}catch(e){}
  FEED_LOADING=false;if(tab==='feed')renderFeed();const ch=$('card-hl');if(ch&&openId)ch.innerHTML=cardHighlights(openId)}
/* show the last copy instantly, then refresh in the background */
try{const c=JSON.parse(localStorage.getItem(FEED_LS)||'null');if(c&&c.d&&c.d.week===WEEK&&Date.now()-c.at<6*3600e3){FEED=c.d;FEED_AT=c.at-4*60e3}}catch(e){}
setTimeout(()=>loadFeed(),1500);
setInterval(()=>{if(tab==='feed'&&!document.hidden)loadFeed()},5*60e3);
/* Only clips of this player's own plays: ESPN clips tagged with him, plus YouTube clips whose title is a specific play by him.
   Press conferences, interviews, recaps and full-game packages are left out. */
const normT=x=>norm(String(x||'').replace(/['’]s\b/gi,''));
const PLAY_RE=/\b(td|tds|touchdowns?|catch(es)?|grabs?|runs?|rush(es)?|scampers?|throws?|pass(es)?|dimes?|strikes?|connects?|finds|sacks?|interceptions?|picks?|int|fumbles?|scrambles?|scores?|yards?|yds?|yd|jukes?|hurdles?|stiff|breaks?|bursts?|receptions?|hauls?|snags?|plays|highlights|bombs?|deep|one-handed|toe-tap|leaps?)\b/i;
const NOT_RE=/press conference|post-?game|pre-?game|interview|presser|availability|full game|game highlights|recap|podcast|mic'?d up|reacts?|reaction|breakdown|film room|locker room|practice|q ?& ?a|sound ?bites?|condensed|vs\.? .* highlights|highlights \| nfl/i;
function playerVideos(p){if(!FEED)return [];const key=FEED_AT+'|'+VER;if(PV.key!==key)PV={key,map:{}};if(PV.map[p.id])return PV.map[p.id];
  const full=norm(p.n),last=full.split(' ').pop();
  const near=FEED.videos.filter(v=>v.teams.includes(p.t)||(!v.teams.length&&wordIn(normT(v.title),full)));
  let out=[];
  if(p.pos==='DST')out=near.filter(v=>v.src==='espn'&&/\b(defense|sacks?|interceptions?|pick-?six|picks? off|fumble|safety|stop)\b/i.test(v.title)&&!NOT_RE.test(v.title)).slice(0,4);
  else{const lastUnique=POOL.filter(q=>q.id!==p.id&&q.pos!=='DST'&&norm(q.n).split(' ').pop()===last&&near.some(v=>v.teams.includes(q.t))).length===0;
    const others=POOL.filter(q=>q.id!==p.id&&q.pos!=='DST'&&near.some(v=>v.teams.includes(q.t))).map(q=>norm(q.n));
    const named=v=>{const t=normT(v.title),h=normT(v.title+' '+v.desc);if(v.athletes.some(a=>norm(a)===full)||wordIn(v.src==='youtube'?t:h,full))return true;
      return lastUnique&&last.length>3&&wordIn(t,last)&&!others.some(o=>wordIn(t,o))};
    out=near.filter(v=>named(v)&&!NOT_RE.test(v.title)&&(v.src==='espn'||PLAY_RE.test(v.title)));
    out.sort((a,b)=>b.week-a.week||(a.src==='espn'?0:1)-(b.src==='espn'?0:1)||Date.parse(b.at||0)-Date.parse(a.at||0));out=out.slice(0,8)}
  return PV.map[p.id]=out}
function playerNews(p){if(!FEED||p.pos==='DST')return [];const full=norm(p.n);
  return FEED.news.filter(a=>a.athletes.some(x=>norm(x)===full)||wordIn(normT(a.title+' '+a.desc),full)).slice(0,3)}
const chName=v=>v.src==='espn'?'ESPN':v.ch&&v.ch!=='NFL'?(NICK[v.ch]||v.ch):'NFL';
const srcBadge=v=>`<span class="srcb ${v.src==='espn'?'espn':'youtube'}">${esc(chName(v))}</span>`;
const nflUrl=p=>p.pos==='DST'?`https://www.nfl.com/teams/`:`https://www.nfl.com/players/${p.id}/`;
function thumbHtml(v,size){const i=CLIPS.findIndex(c=>c.id===v.id);const p=v.player?byId[v.player]:null;
  return `<button class="hthumb ${size||''}" data-clip="${i}" title="${esc(v.title)}"><span class="vimg${v.thumb?'':' noimg'}" style="${tcVars(p?p.t:(v.teams[0]||''))}">${v.thumb?`<img src="${esc(v.thumb)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`:''}<span class="vplay" aria-hidden="true"></span>${srcBadge(v)}${v.dur?`<span class="vdur">${Math.floor(v.dur/60)}:${String(v.dur%60).padStart(2,'0')}</span>`:''}</span>
    ${size==='xs'?'':`<span class="vtitle">${v.game?'<span class="vtag">Game</span>':''}${esc(v.title)}</span><span class="note">${p&&size!=='lg'?esc(p.n)+' · ':''}Week ${v.week}${v.at?' · '+ago(v.at):''}</span>`}</button>`}
function buildClips(list){const own=[],games=[],seen=new Set();
  list.forEach(({id})=>playerVideos(byId[id]).forEach(v=>{if(seen.has(v.id))return;seen.add(v.id);(v.game?games:own).push({...v,player:v.game?null:id})}));
  own.sort((a,b)=>b.week-a.week||Date.parse(b.at||0)-Date.parse(a.at||0));games.sort((a,b)=>b.week-a.week||Date.parse(b.at||0)-Date.parse(a.at||0));
  CLIPS=own.concat(games)}
function renderFeed(){
  if(!FEED||Date.now()-FEED_AT>4*60e3)loadFeed();
  $('feed-kicker').textContent=`Week ${WEEK} · ${FEED?'updated '+new Date(FEED.updated).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'loading'}`;
  document.querySelectorAll('#feed-filter button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.ff===FEED_F));
  const fc=(S.following||[]).length+(S.followTeams||[]).length,fl=$('feed-filter').querySelector('[data-ff=follow]');fl.textContent=`Following${fc?' ('+fc+')':''}`;
  const fp=FEED_F==='follow';$('feed-follow-page').hidden=!fp;$('feed-top').hidden=fp;document.querySelector('#v-feed .hl-grid').hidden=fp;
  if(fp){renderFollowPage();return}
  const list=feedPlayers();buildClips(list);
  /* top: featured clip + up next + watch button */
  const top=$('feed-top');
  if(!FEED)top.innerHTML=`<div class="card hl-loading"><span class="spin"></span> Loading clips and news...</div>`;
  else if(!CLIPS.length)top.innerHTML=`<div class="card hl-empty">No play clips yet for these players. They show up here as games are played.</div>`;
  else{const f=CLIPS[0],up=CLIPS.slice(1,5),fp=f.player?byId[f.player]:null;
    top.innerHTML=`<div class="card hl-feature"><div class="hl-feat-main">${thumbHtml(f,'lg')}</div>
      <div class="hl-feat-side"><div class="kicker">${CLIPS.length} clip${CLIPS.length>1?'s':''} · ${FEED_F==='mine'?'your team':FEED_F==='follow'?'players and teams you follow':'your team and follows'}</div>
        <h2>${fp?esc(fp.n):'Latest highlights'}</h2>
        <div class="hl-upnext">${up.map(v=>`<button class="hl-up" data-clip="${CLIPS.indexOf(v)}"><span class="vimg${v.thumb?'':' noimg'}" style="${tcVars(v.player?byId[v.player].t:(v.teams[0]||''))}">${v.thumb?`<img src="${esc(v.thumb)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`:''}</span><span><b>${esc(v.title)}</b><span class="note">${v.player?esc(byId[v.player].n)+' · ':''}${v.src==='espn'?'ESPN':esc(chName(v))+' on YouTube'}</span></span></button>`).join('')}</div>
        <button class="btn primary hl-watch" data-clip="0"><span class="play" aria-hidden="true"></span>Watch all clips</button></div></div>`}
  /* player rows */
  if(!list.length){$('feed-list').innerHTML=`<div class="card empty-card">${FEED_F==='follow'?`<h2>Follow players and teams</h2><p class="note">Pick teams and players in the Following tab.</p><button class="btn" data-ff="follow">Choose who to follow</button>`:'<p class="empty">No players here yet.</p>'}</div>`}
  else $('feed-list').innerHTML=list.map(({id,slot})=>{const p=byId[id],g=G[id],gm=feedGame(p),lv=liveOf(id),st=LIVEST[id];
    let chip,pts,sub,line;
    if(!gm){const nx=OPP[p.t]&&OPP[p.t][WEEK];chip=`<span class="fchip">${nx?(nx.home?'vs ':'at ')+nx.opp:'Bye'}</span>`;pts=nx?g.projNext:null;sub=nx?'projected':'bye week'}
    else if(gm.state==='pre'){chip=`<span class="fchip">${gm.start?new Date(gm.start).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'}):'Upcoming'} · ${gm.home?'vs':'at'} ${esc(gm.opp||'')}</span>`;pts=g.projNext;sub='projected'}
    else{chip=`<span class="fchip ${gm.state}">${gm.state==='post'?'Final':esc(gm.detail||'Live')} · ${gm.home?'vs':'at'} ${esc(gm.opp||'')} ${gm.score}-${gm.oppScore}</span>`;pts=lv?lv.pts:0;sub=gm.state==='post'?'points':'so far';line=statLineTxt(p.pos,st)}
    if(!line){const lastG=[...g.log].reverse().find(x=>!x.bye&&!x.dnp);if(lastG)line=`Week ${lastG.w} ${lastG.home?'vs':'at'} ${lastG.opp}: ${f1(linePts(lastG,p.pos,S.league.sc))} pts · ${statLineTxt(p.pos,lastG)}`}
    const vids=playerVideos(p),news=playerNews(p)[0];
    return `<article class="hl-row"><div class="hl-head"><span class="fd-slot">${slot}</span>${av(p)}<div class="fd-who"><div class="fd-name"><button class="pname" data-open="${id}">${esc(p.n)}</button>${stHtml(id)}${OWN[id]!==S.me?followBtn(id,true):''}</div><div class="fd-meta"><span class="psub">${p.pos} · ${p.t}</span>${chip}</div></div><div class="fd-pts">${pts==null?'<b class="num">—</b>':`<b class="num">${f1(pts)}</b>`}<span class="note">${sub}</span></div></div>
      ${line?`<p class="hl-line">${esc(line)}</p>`:''}
      ${vids.length?`<div class="hl-clips">${vids.map(v=>thumbHtml(v,'sm')).join('')}</div>`:''}
      <div class="hl-links"><a href="${nflUrl(p)}" target="_blank" rel="noopener">${p.pos==='DST'?'NFL.com':'NFL.com profile'} ↗</a>${vids.length?`<button class="linkish" data-pclips="${id}">Watch ${vids.length} clip${vids.length>1?'s':''}</button>`:''}</div>
      ${news?`<a class="hl-news1" href="${esc(news.url||'#')}" target="_blank" rel="noopener"><b>${esc(news.title)}</b>${news.at?`<span class="note"> · ${ago(news.at)}</span>`:''}</a>`:''}</article>`}).join('');
  /* side: follow tools on Following, news for everyone in view */
  const seenN=new Set(),allNews=[];list.forEach(({id})=>playerNews(byId[id]).forEach(a=>{if(!seenN.has(a.title)){seenN.add(a.title);allNews.push({...a,pid:id})}}));
  allNews.sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0));
  $('feed-side').innerHTML=`<div class="card hl-newscard"><div class="card-h"><h2>News</h2><span class="note">${allNews.length?allNews.length+' stories':''}</span></div>
    ${!FEED?'<p class="note">Loading...</p>':allNews.length?`<ul class="hl-news">${allNews.slice(0,15).map(a=>`<li><span class="hl-ntag">${esc(byId[a.pid].n)}</span><a href="${esc(a.url||'#')}" target="_blank" rel="noopener">${esc(a.title)}</a>${a.desc&&a.desc!==a.title?`<p>${esc(a.desc.length>160?a.desc.slice(0,157)+'...':a.desc)}</p>`:''}<span class="note">${a.at?ago(a.at):''}</span></li>`).join('')}</ul>`:'<p class="note">No news for these players right now.</p>'}</div>`}
function followPanelHtml(){const ft=S.followTeams||[],teams=Object.keys(NICK).sort((a,b)=>teamName(a).localeCompare(teamName(b))),rec=recommendedFollows();
  return `<div class="card hl-follow"><div class="card-h"><h2>Teams you follow</h2></div><p class="note" style="margin:-4px 0 10px">Their top fantasy players join your feed.</p>
      <div class="team-chips">${ft.map(t=>`<span class="tchip" style="${tcVars(t)}"><i></i>${esc(teamName(t))}<button data-fteam="${t}" aria-label="Unfollow ${esc(teamName(t))}">×</button></span>`).join('')}
      <select id="team-add" aria-label="Follow a team"><option value="">+ Follow a team</option>${teams.filter(t=>!ft.includes(t)).map(t=>`<option value="${t}">${esc(teamName(t))} (${t})</option>`).join('')}</select></div>
    <div class="card-h" style="margin-top:20px"><h2>Recommended</h2></div><p class="note" style="margin:-4px 0 10px">Most highlight clips the last two weeks.</p>
    ${!FEED?'<p class="note">Loading...</p>':rec.length?`<div class="rec-list">${rec.map(r=>{const p=byId[r.id];return `<div class="rec">${av(p,'sm')}<div class="rec-who"><button class="pname" data-open="${p.id}">${esc(p.n)}</button><span class="psub">${p.pos} · ${p.t} · ${r.n} clip${r.n>1?'s':''}</span></div>${followBtn(p.id,false).replace('follow-btn','follow-btn light')}</div>`}).join('')}</div>`:'<p class="note">No clips yet. Check back after the games.</p>'}</div>`}
/* ===== Clip viewer: scroll through clips one at a time; only the clip on screen loads a player ===== */
function posterHtml(v){return `<span class="vimg${v.thumb?'':' noimg'}" style="${tcVars(v.player?byId[v.player].t:(v.teams[0]||''))}">${v.thumb?`<img src="${esc(v.thumb)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`:''}<span class="vplay" aria-hidden="true"></span></span>`}
function embedHtml(v){const src=v.src==='espn'?`https://www.espn.com/core/video/iframe/_/id/${encodeURIComponent(v.id)}/endcard/false`:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.yt)}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
  return `<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="${esc(v.title)}"></iframe>`}
function openViewer(start){if(!CLIPS.length)return;const el=$('clipview');el.hidden=false;document.body.style.overflow='hidden';CV_CUR=-1;
  el.innerHTML=`<div class="cv-bar"><span class="cv-brand"><span class="play" aria-hidden="true"></span>Highlights</span><span class="cv-count" id="cv-count"></span><button class="cv-x" data-cvclose="1" aria-label="Close">×</button></div>
    <div class="cv-scroll" id="cv-scroll">${CLIPS.map((v,i)=>{const p=v.player?byId[v.player]:null;return `<section class="cv-slide" data-i="${i}"><div class="cv-media" data-cvplay="${i}">${posterHtml(v)}</div>
      <div class="cv-info">${srcBadge(v)}<h3>${esc(v.title)}</h3><p class="note">${p?`<b>${esc(p.n)}</b> · ${p.pos} · ${p.t} · `:v.teams.length?esc(v.teams.join(' vs '))+' · ':''}Week ${v.week}${v.at?' · '+ago(v.at):''}</p>
      <span class="cv-links">${v.url?`<a href="${esc(v.url)}" target="_blank" rel="noopener">Open on ${v.src==='espn'?'ESPN':'YouTube'} ↗</a>`:''}${p?`<a href="${nflUrl(p)}" target="_blank" rel="noopener">${esc(p.n)} on NFL.com ↗</a>`:''}</span></div></section>`}).join('')}</div>
    <div class="cv-nav"><button data-cvstep="-1" aria-label="Previous clip">▲</button><button data-cvstep="1" aria-label="Next clip">▼</button></div>`;
  const sc=$('cv-scroll');CV_OBS=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)activateClip(+e.target.dataset.i)}),{root:sc,threshold:.65});
  sc.querySelectorAll('.cv-slide').forEach(x=>CV_OBS.observe(x));
  requestAnimationFrame(()=>{sc.scrollTop=sc.children[start].offsetTop;activateClip(start)})}
function activateClip(i){const sc=$('cv-scroll');if(!sc||i===CV_CUR||!CLIPS[i])return;
  if(CV_CUR>=0&&sc.children[CV_CUR])sc.children[CV_CUR].querySelector('.cv-media').innerHTML=posterHtml(CLIPS[CV_CUR]);
  CV_CUR=i;sc.children[i].querySelector('.cv-media').innerHTML=embedHtml(CLIPS[i]);$('cv-count').textContent=`${i+1} / ${CLIPS.length}`;
  [i+1,i+2].forEach(j=>{const v=CLIPS[j];if(v&&v.thumb){const im=new Image();im.src=v.thumb}})}
function stepClip(d){const sc=$('cv-scroll');if(!sc)return;const j=Math.max(0,Math.min(CLIPS.length-1,CV_CUR+d));sc.scrollTo({top:sc.children[j].offsetTop,behavior:'smooth'})}
function closeViewer(){const el=$('clipview');if(el.hidden)return;if(CV_OBS)CV_OBS.disconnect();CV_OBS=null;CV_CUR=-1;el.hidden=true;el.innerHTML='';document.body.style.overflow=''}
document.addEventListener('click',e=>{const t=e.target;if(!t.closest)return;
  const f=t.closest('[data-follow]');if(f){e.preventDefault();e.stopPropagation();toggleFollow(f.dataset.follow);if(openId&&!$('scrim').hidden)openCard(openId);return}
  const ff=t.closest('[data-ff]');if(ff){FEED_F=ff.dataset.ff;renderFeed();return}
  const cl=t.closest('[data-clip]');if(cl){openViewer(Math.max(0,+cl.dataset.clip));return}
  const cp=t.closest('[data-cvplay]');if(cp){activateClip(+cp.dataset.cvplay);return}
  const cs=t.closest('[data-cvstep]');if(cs){stepClip(+cs.dataset.cvstep);return}
  if(t.closest('[data-cvclose]')){closeViewer();return}
  const gt=t.closest('[data-goto]');if(gt){location.hash=gt.dataset.goto;return}
  const fte=t.closest('[data-fteam]');if(fte){toggleTeam(fte.dataset.fteam);return}},true);
document.addEventListener('change',e=>{if(e.target.id==='team-add'&&e.target.value)toggleTeam(e.target.value)});
document.addEventListener('keydown',e=>{if($('clipview').hidden)return;if(e.key==='Escape')closeViewer();else if(e.key==='ArrowDown'||e.key==='j'){e.preventDefault();stepClip(1)}else if(e.key==='ArrowUp'||e.key==='k'){e.preventDefault();stepClip(-1)}});
/* highlights on the player card */
function cardHighlights(id){const p=byId[id];if(!FEED){loadFeed();return `<h4>Highlights</h4><p class="note">Loading clips...</p>`}
  const vids=playerVideos(p);
  return `<h4>Highlights</h4>${vids.length?`<div class="hl-clips card-clips">${vids.map((v,i)=>`<button class="hthumb sm" data-pclip="${id}|${i}" title="${esc(v.title)}"><span class="vimg${v.thumb?'':' noimg'}" style="${tcVars(p.t)}">${v.thumb?`<img src="${esc(v.thumb)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`:''}<span class="vplay" aria-hidden="true"></span>${srcBadge(v)}</span><span class="vtitle">${v.game?'<span class="vtag">Game</span>':''}${esc(v.title)}</span><span class="note">Week ${v.week}${v.at?' · '+ago(v.at):''}</span></button>`).join('')}</div>`
    :`<p class="note">No clips of his plays from this week or last week yet.</p>`}<p class="note" style="margin:8px 0 0"><a href="${nflUrl(p)}" target="_blank" rel="noopener">More on NFL.com ↗</a></p>`}
function openPlayerClips(id,i){CLIPS=playerVideos(byId[id]).map(v=>({...v,player:v.game?null:id}));openViewer(Math.max(0,i||0))}
document.addEventListener('click',e=>{const t=e.target;if(!t.closest)return;
  const pc=t.closest('[data-pclip]');if(pc){const [id,i]=pc.dataset.pclip.split('|');openPlayerClips(id,+i);return}
  const pcs=t.closest('[data-pclips]');if(pcs){openPlayerClips(pcs.dataset.pclips,0)}},true);
setInterval(()=>{if(USER&&!document.hidden&&Date.now()-SYNC_AT>4*60e3)syncNow()},60e3);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&USER&&Date.now()-SYNC_AT>2*60e3)syncNow()});
/* ===== Following: pick teams and players (no clips here) ===== */
const DIVS=[['AFC East',['BUF','MIA','NE','NYJ']],['AFC North',['BAL','CIN','CLE','PIT']],['AFC South',['HOU','IND','JAX','TEN']],['AFC West',['DEN','KC','LV','LAC']],
  ['NFC East',['DAL','NYG','PHI','WAS']],['NFC North',['CHI','DET','GB','MIN']],['NFC South',['ATL','CAR','NO','TB']],['NFC West',['ARI','LAR','SF','SEA']]];
var FOL_Q='';
function folPlayerCard(id){const p=byId[id],o=OWN[id];return `<div class="fol-pl">${av(p)}<div class="rec-who"><button class="pname" data-open="${id}">${esc(p.n)}</button><span class="psub">${p.pos}${V.posRank[id]} · ${p.t}${o?` · ${o===S.me?'yours':esc(teamById(o).name)}`:''}</span></div>${o===S.me?'<span class="note">Your team</span>':followBtn(id,false).replace('follow-btn','follow-btn light')}</div>`}
function folSearchHtml(){const q=norm(FOL_Q);if(!q)return '';const hits=POOL.filter(p=>norm(p.n).includes(q)||(p.pos==='DST'&&norm(NICK[p.t]||'').includes(q))).sort((a,b)=>V.rank[a.id]-V.rank[b.id]).slice(0,8);
  return hits.length?hits.map(p=>folPlayerCard(p.id)).join(''):'<p class="note">No players match.</p>'}
function renderFollowPage(){const ft=S.followTeams||[],fp=(S.following||[]).filter(id=>byId[id]);let rec=recommendedFollows().map(r=>r.id);
  if(rec.length<6){const skip=new Set([...fp,...rec,...(myTeam()?myTeam().players:[])]);rec=rec.concat(V.list.filter(p=>p.pos!=='DST'&&!skip.has(p.id)).slice(0,8-rec.length).map(p=>p.id))}
  $('feed-follow-page').innerHTML=`<div class="card"><div class="card-h"><h2>Teams</h2><span class="note">${ft.length?`Following ${ft.length}`:'Tap a team to follow it'} · their top fantasy players join your feed</span></div>
    <div class="div-grid">${DIVS.map(([d,ts])=>`<div class="div-col"><div class="div-name">${d}</div>${ts.map(t=>{const on=ft.includes(t),c=TC[t]||['#333','#666','#fff'];
      return `<button class="tteam${on?' on':''}" data-fteam="${t}" style="--c1:${c[0]};--c2:${c[1]};--ct:${c[2]}" aria-pressed="${on}"><span class="tt-abbr">${t}</span><span class="tt-name">${esc(NICK[t]||t)}</span><span class="tt-check" aria-hidden="true">${on?'✓':'+'}</span></button>`}).join('')}</div>`).join('')}</div></div>
   <div class="grid2 even fol-two"><div class="card"><div class="card-h"><h2>Players</h2><span class="note">${fp.length?`Following ${fp.length}`:'Not following anyone yet'}</span></div>
      <input type="search" id="fol-search" class="fol-search" placeholder="Search any player or team defense" autocomplete="off" value="${esc(FOL_Q)}">
      <div class="fol-list" id="fol-results">${folSearchHtml()}</div>
      ${fp.length?`<div class="div-name" style="margin-top:14px">Following</div><div class="fol-list">${fp.map(folPlayerCard).join('')}</div>`:''}</div>
    <div class="card"><div class="card-h"><h2>Recommended</h2><span class="note">${recommendedFollows().length?'Most play clips the last two weeks':'Top-ranked players'}</span></div><div class="fol-list">${rec.map(folPlayerCard).join('')}</div></div></div>`;
  if(FOL_Q){const i=$('fol-search');i.focus();i.setSelectionRange(FOL_Q.length,FOL_Q.length)}}
document.addEventListener('input',e=>{if(e.target.id==='fol-search'){FOL_Q=e.target.value;$('fol-results').innerHTML=folSearchHtml()}});
var RANK_ALL=false;document.addEventListener('click',e=>{if(e.target.id==='rank-all'){RANK_ALL=true;renderRankings()}});
