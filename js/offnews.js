/* ===== Offseason News (js/offnews.js) =====
   What the News tab shows in offseason mode: Feed · Following · Moves, a phase line ("Free agency opens in 12 days"),
   a Pro impact line on each player story, and bell alerts for players you follow. The in-season News (js/news.js:
   big plays, Injuries, Clips, #1/#2 finishes and banners) is not shown in offseason mode.
   Loaded after offseason.js, before app.js. Styles are in the "Offseason News" block at the end of css/styles.css.

   Data:
   - /api/news?off=1&days=30 : moves from the shared outlets (trade, sign, release, retire, coach, inj, susp, contract),
     no rumors, each with every outlet that ran it. The Feed shows the last 14 days, Moves the last 30.
   - NFL_DATA.moves (team to team) and NFL_DATA.txn (signings and releases) from the nightly data update.
   - data/tmhist.json : one TradeMetric Rankings snapshot per day (scripts/tm_snapshot.mjs), for the impact line.
   - /api/take?outlooks= : role outlooks of takes that already exist. The feed never writes a take.

   Verified: a trade, signing or release is only shown once it is backed by a team change in the nightly data or by
   two outlets running it. Every alert has to be verified that way, whatever the kind. */

/* The offseason calendar. Dates for 2027 are estimates from past years: update them when the NFL announces them. */
var TMN_PHASES=[
  ['2027-01-10','The regular season ends'],
  ['2027-01-16','The playoffs start'],
  ['2027-02-14','The Super Bowl is'],
  ['2027-02-23','The combine starts'],
  ['2027-03-02','The franchise tag deadline is'],
  ['2027-03-08','Free agency talks open'],
  ['2027-03-10','Free agency opens'],
  ['2027-04-22','The NFL Draft starts'],
  ['2027-05-07','Rookie minicamps start'],
  ['2027-07-20','Training camps open'],
  ['2027-08-05','The preseason starts'],
  ['2027-09-09','The 2027 season kicks off']];
var OFN={f:'feed',pos:'ALL',data:null,busy:false,hist:null,histBusy:false,outl:{},outlKey:'',outlBusy:false,q:'',idx:null};
var OFN_LS='tm-offnews-v1',OFN_FEED_DAYS=14,OFN_MOVE_DAYS=30,OFN_TOP=300;
var OFN_TABS=[['feed','Feed'],['following','Following'],['moves','Moves']];
var OFN_KIND={trade:['Trade','accent'],team:['New team','accent'],sign:['Signed','good'],release:['Released','muted'],retire:['Retired','muted'],
  coach:['Coaching change','warn'],inj:['Injury','bad'],susp:['Suspended','bad'],contract:['Contract','muted']};
var OFN_TXN=['trade','team','sign','release','retire','contract'];   /* the Moves tab */
var OFN_PROOF=['trade','sign','release'];                              /* never shown unless verified */
var OFN_SEASON_OVER=/\b(season-ending|out for the (season|year)|torn (acl|achilles)|tears? (his )?(acl|achilles)|ruptured)\b/i;
try{const c=JSON.parse(localStorage.getItem(OFN_LS)||'null');if(c&&c.items&&Date.now()-c.at<12*3600e3)OFN.data={...c,at:c.at-10*60e3}}catch(e){}

/* ---------- the phase line ---------- */
function ofnPhase(){const t0=new Date();t0.setHours(0,0,0,0);
  for(const [d,l] of TMN_PHASES){const t=new Date(d+'T00:00:00');if(isNaN(t)||t<t0)continue;const n=Math.round((t-t0)/864e5);
    return `${l} ${n===0?'today':n===1?'tomorrow':`in ${n} days`}`}
  return ''}

/* ---------- loading ---------- */
/* at most one try a minute, so a failed load can't turn into a loop (the alerts and the page both ask for it) */
async function ofnLoad(){if(OFN.busy||(OFN.data&&Date.now()-OFN.data.at<10*60e3)||Date.now()-(OFN.tried||0)<60e3)return;OFN.busy=true;OFN.tried=Date.now();
  try{const r=await fetch('/api/news?off=1&days='+OFN_MOVE_DAYS+'&b='+Math.floor(Date.now()/600000));const j=r.ok?await r.json():null;
    if(j&&Array.isArray(j.items)){OFN.data={at:Date.now(),items:j.items};OFN.idx=null;try{localStorage.setItem(OFN_LS,JSON.stringify(OFN.data))}catch(e){}}}catch(e){}
  OFN.busy=false;ofnRepaint();if(typeof renderAlerts==='function')renderAlerts()}
async function ofnLoadHist(){if(OFN.hist||OFN.histBusy)return;OFN.histBusy=true;
  try{const r=await fetch('data/tmhist.json',{cache:'no-cache'});const j=r.ok?await r.json():null;OFN.hist=j&&Array.isArray(j.days)?j.days:[]}catch(e){OFN.hist=[]}
  OFN.histBusy=false;ofnRepaint()}
async function ofnLoadOutlooks(ids){ids=[...new Set(ids)].filter(id=>/^[a-z0-9-]+$/.test(id)).slice(0,80);const key=ids.sort().join(',');
  if(!ids.length||OFN.outlBusy||key===OFN.outlKey||!tmoIsPro())return;OFN.outlBusy=true;OFN.outlKey=key;
  try{const tok=await tmoToken();if(tok){const r=await fetch('/api/take?outlooks='+encodeURIComponent(key),{headers:{authorization:'Bearer '+tok}});const j=r.ok?await r.json():null;
    if(j&&j.ok&&j.items){Object.assign(OFN.outl,j.items);ofnRepaint()}}}catch(e){}
  OFN.outlBusy=false}
function ofnRepaint(){if(document.body.dataset.tab==='news'&&tmoMode()==='off'&&document.getElementById('ofn-feed'))ofnRenderBody()}

/* ---------- players ---------- */
function ofnRanks(){const m={};tmoRows().forEach(o=>m[o.id]=o);return m}
/* rank on a past day from the snapshots (null when there is no snapshot that old, or he wasn't ranked) */
function ofnHistRank(id,beforeDay){const H=OFN.hist||[];let snap=null;for(const s of H)if(s.d<beforeDay)snap=s;if(!snap)return null;const i=snap.ids.indexOf(id);return i<0?0:i+1}
function ofnLastRank(id){const H=OFN.hist||[];for(let i=H.length-1;i>=0;i--){const k=H[i].ids.indexOf(id);if(k>=0)return k+1}return null}
/* a player who has dropped off the player list (released) is still shown from the name the nightly data kept */
function ofnPlayer(id){if(byId[id])return byId[id];const D=window.NFL_DATA,x=((D&&D.txn)||[]).find(m=>m[0]===id&&m[4]);return x?{id,n:x[4],pos:x[5]||'',t:''}:null}
/* players you follow: your follows plus everyone on your saved league rosters. Signed-in only. */
function ofnFollowed(){const s=new Set();if(!tmoSignedIn()||typeof S==='undefined'||!S)return s;(S.following||[]).forEach(id=>s.add(id));
  try{if(typeof tmnLeagues==='function')tmnLeagues().forEach(c=>c.roster.forEach(id=>s.add(id)))}catch(e){}
  s.forEach(id=>{const p=byId[id];if(p&&(p.pos==='DST'||p.pos==='K'))s.delete(id)});return s}
/* names a headline can match: everyone in the TradeMetric Rankings plus anyone you follow */
function ofnIndex(F){const key=tmoRows().length+'|'+[...F].join(',');if(OFN.idx&&OFN.idx.key===key)return OFN.idx;
  const ids=new Set([...tmoRows().map(o=>o.id),...F]),L=[];ids.forEach(id=>{const p=ofnPlayer(id);if(p&&p.pos!=='DST'&&p.pos!=='K'){const n=norm(p.n);if(n.includes(' '))L.push([n,id])}});
  const R=ofnRanks();L.sort((a,b)=>((R[a[1]]||{}).rank||999)-((R[b[1]]||{}).rank||999));
  return OFN.idx={key,L,by:Object.fromEntries(L)}}

/* ---------- proof from the nightly data: a team change near the story's date ---------- */
function ofnData(){const D=window.NFL_DATA||{},day=s=>Date.parse(s+'T12:00:00');
  return {moves:(D.moves||[]).map(m=>({id:m[0],from:m[1],to:m[2],at:day(m[3])})),txn:(D.txn||[]).map(m=>({id:m[0],from:m[1],to:m[2],at:day(m[3])}))}}
function ofnProof(X,pid,kind,at){const near=m=>m.id===pid&&m.at&&Math.abs(m.at-at)<=7*864e5;
  if(kind==='trade')return X.moves.find(near)||null;
  if(kind==='sign')return X.txn.find(m=>near(m)&&m.to)||X.moves.find(near)||null;
  if(kind==='release')return X.txn.find(m=>near(m)&&!m.to)||X.moves.find(near)||null;
  return null}

/* ---------- every item: stories matched to players (or a team, for coaching changes), plus team changes with no story ---------- */
function ofnItems(){const F=ofnFollowed(),R=ofnRanks(),X=ofnData(),{L,by}=ofnIndex(F),out=[];
  const find=a=>{const ath=(a.athletes||[]).map(norm).find(n=>by[n]);if(ath)return by[ath];
    for(const t of [a.title,String(a.desc||'').slice(0,220)]){const h=normT(t);const hit=L.find(([n])=>wordIn(h,n));if(hit)return hit[1]}return null};
  ((OFN.data&&OFN.data.items)||[]).forEach(a=>{const at=Date.parse(a.at||0);if(!at)return;
    const base={k:'s:'+a.url,kind:a.kind,at,url:a.url,title:a.title,desc:a.desc||'',outlet:a.outlet,outlets:(a.outlets||[a.outlet]).filter(Boolean),img:a.img,pay:!!a.pay,teams:a.teams||[]};
    if(a.kind==='coach'){const t=base.teams[0];if(!t)return;out.push({...base,team:t});return}
    const pid=find(a);if(!pid)return;
    /* the same move from another outlet, a few days apart: one item, every outlet counts toward verifying it */
    const d=out.find(o=>o.pid===pid&&o.kind===a.kind&&Math.abs(o.at-at)<3*864e5);
    if(d){base.outlets.forEach(o=>{if(!d.outlets.includes(o))d.outlets.push(o)});if(d.pay&&!base.pay)Object.assign(d,{url:base.url,title:base.title,desc:base.desc,outlet:base.outlet,pay:false});return}
    out.push({...base,pid})});
  out.forEach(x=>{if(!x.pid){x.ok=x.outlets.length>=2;return}const pr=ofnProof(X,x.pid,x.kind,x.at);x.proof=pr;x.ok=!!pr||x.outlets.length>=2;
    if(pr){x.from=pr.from;x.to=pr.to}else if(x.kind==='sign'){x.to=x.teams[0]||''}else if(x.kind==='release'){x.from=x.teams[0]||''}});
  /* team changes the nightly data saw with no story: shown on their own (the data is the proof). A player who only dropped
     off the list isn't shown without a story, since that can also mean the data just lost him. */
  const covered=(pid,at)=>out.some(o=>o.pid===pid&&['trade','sign','release','team'].includes(o.kind)&&Math.abs(o.at-at)<=7*864e5);
  X.moves.forEach(m=>{if(!ofnPlayer(m.id)||covered(m.id,m.at))return;out.push({k:'m:'+m.id+':'+m.to,kind:'team',pid:m.id,at:m.at,from:m.from,to:m.to,ok:true,data:true,outlets:[]})});
  X.txn.forEach(m=>{if(!m.to||!ofnPlayer(m.id)||covered(m.id,m.at))return;out.push({k:'t:'+m.id+':'+m.to,kind:'sign',pid:m.id,at:m.at,from:'',to:m.to,ok:true,data:true,outlets:[]})});
  out.forEach(x=>{x.mine=x.pid?F.has(x.pid):[...F].some(id=>{const p=byId[id];return p&&p.t===x.team});
    const r=x.pid&&R[x.pid];x.rank=r?r.rank:x.pid?ofnLastRank(x.pid):null});
  return out.filter(x=>!OFN_PROOF.includes(x.kind)||x.ok).sort((a,b)=>b.at-a.at)}
/* fantasy-relevant: inside the TradeMetric top 300, or someone you follow. Coaching changes always count. */
const ofnRelevant=x=>!x.pid||x.mine||(x.rank&&x.rank<=OFN_TOP);

/* ---------- cards ---------- */
function ofnRoute(x){if(!x.from&&!x.to)return '';const f=x.from||'FA',t=x.to||'FA';
  return `<span class="tmn-tr-route"><b>${esc(f)}</b><i aria-hidden="true">→</i><b>${esc(t)}</b></span>`}
function ofnHead(x,p){const R=typeof tmnRecaps==='function'&&x.url?tmnRecaps()[x.url]:null;
  if(R&&R.t)return {t:p?tmnTitleFor(p,R.t):R.t,pts:R.pts||[]};
  if(x.title)return {t:p?tmnTitleFor(p,x.title):x.title,pts:[]};
  const tn=t=>t?'the '+teamName(t):'a new team';
  return {t:x.kind==='sign'?`${p.n} signed with ${tn(x.to)}`:`${p.n} is now with ${tn(x.to)}`,pts:[x.from?`Moved from the ${teamName(x.from)} to the ${teamName(x.to)}.`:'']}}
/* Pro: how the move shows up in the TradeMetric Rankings, plus his role outlook from an existing take */
function ofnImpact(x){if(!x.pid||!x.rank&&x.rank!==0)return '';
  if(!tmoIsPro())return `<p class="ofn-imp lock">${TMO_LOCK}<span><b>Pro impact</b> How this moves his TradeMetric rank.</span><a href="${tmoSignedIn()?'#upgrade-pro':'#signin'}">${tmoSignedIn()?'See Pro':'Sign in free'}</a></p>`;
  const R=ofnRanks()[x.pid],now=R?R.rank:null,day=new Date(x.at).toISOString().slice(0,10),was=OFN.hist?ofnHistRank(x.pid,day):null;
  let rk=now?`TM rank <b class="num">#${now}</b>`:'<b>Unranked</b> now';
  if(was&&now&&was!==now){const d=was-now;rk+=` <em class="tmo-diff ${d>0?'up':'dn'}" title="Was #${was} the day before">${d>0?'▲':'▼'} ${Math.abs(d)}</em> <small>since the move</small>`}
  else if(was&&!now)rk=`Was TM <b class="num">#${was}</b>, now unranked`;
  else if(was===0&&now)rk+=` <small>new to the rankings</small>`;
  const o=OFN.outl[x.pid],k=o&&TMO_OUTLOOK[o];
  const role=k?`<span class="tmo-out ${esc(o)}" title="Role outlook: ${k[1]}"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${k[2]}</svg><span class="tmo-out-l">Role</span>${k[0]}</span>`:'';
  return `<p class="ofn-imp"><span class="ofn-imp-k">Pro impact</span><span>${rk}</span>${role}</p>`}
function ofnCard(x){const [lbl,tone]=OFN_KIND[x.kind]||['News','muted'],p=x.pid?ofnPlayer(x.pid):null;if(x.pid&&!p)return '';
  const h=ofnHead(x,p),link=x.url&&!x.pay;
  const src=x.data&&!x.url?'Team change':x.pay?`${esc(x.outlet||'Subscriber story')} · key facts here`:x.url?`${esc(tmnSrcOf(x))}${x.outlets.length>1?` +${x.outlets.length-1}`:''}${link?' <i aria-hidden="true">↗</i>':''}`:'';
  const title=link?`<a class="tmn-hl" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(h.t)}</a>`:esc(h.t);
  const pts=h.pts.filter(Boolean),body=pts.length?`<ul class="tmn-pts">${pts.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:x.desc&&x.desc!==x.title?`<p class="tmn-clamp">${esc(x.desc)}</p>`:'';
  const face=p?av(p):`<span class="ofn-team">${esc(x.team||'')}</span>`;
  const follow=p&&tmoSignedIn()&&typeof followBtn==='function'&&byId[p.id]?followBtn(p.id,true):'';
  const rankable=p&&ofnRanks()[p.id];
  return `<article class="tmn-ev tmn-story ofn-card tone-${tone}${rankable?' tap':''}"${rankable?` data-ofn-rank="${p.id}" tabindex="0"`:''} data-nkf="${esc(x.k)}">${tmnRail(x.at)}
    <div class="tmn-ev-card"><div class="tmn-ev-top"><span class="tmn-kick"><span class="tmn-lbl ${tone}">${lbl}</span>${src?`<span class="tmn-src">${src}</span>`:''}</span><span class="tmn-right">${ofnRoute(x)}${follow}</span></div>
      <div class="tmn-ev-main"><div class="tmn-b-av">${face}</div><div class="tmn-ev-txt"><h3>${title}</h3>${body}${ofnImpact(x)}</div></div></div></article>`}
function ofnTimeline(list,cls){if(!list.length)return '';
  const html=`<ol class="tmn-tl act">${tmnGroups(list).map(g=>`<li class="tmn-day"><span>${g.label}<small>${esc(g.sub)}</small></span></li>${g.items.map(x=>`<li class="${cls(x)}">${ofnCard(x)}</li>`).join('')}`).join('')}</ol>`;
  return html}
const ofnSec=(title,note,html)=>html?`<section class="tmn-sec ofn-sec"><div class="tmn-sec-h"><h2>${title}</h2>${note?`<span class="note">${note}</span>`:''}</div>${html}</section>`:'';
const ofnEmpty=(h,p,btn)=>`<div class="card tmn-empty"><h2>${h}</h2><p class="note">${p}</p>${btn||''}</div>`;

/* ---------- Moves tab: verified transactions in the TradeMetric top 300, last 30 days ---------- */
function ofnMoveRow(x){const p=ofnPlayer(x.pid),[lbl,tone]=OFN_KIND[x.kind]||['Move','muted'],R=ofnRanks()[x.pid];if(!p)return '';
  const d=new Date(x.at),when=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const who=R?tmoName(R):`<span class="tmo-pl"><span class="tmo-pos p-${esc(p.pos)}">${esc(p.pos)}</span><span class="tmo-nm"><b>${esc(p.n)}</b><small>${x.rank?`Was TM #${x.rank}`:''}</small></span></span>`;
  const story=x.url&&!x.pay?`<a class="ofn-mv-src" href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="Read the story">${esc(tmnSrcOf(x))} ↗</a>`:'';
  return `<li class="ofn-mv${R?' tap':''}"${R?` data-ofn-rank="${p.id}" tabindex="0"`:''}><span class="ofn-mv-d">${when}</span>${who}
    <span class="ofn-mv-k"><span class="tmn-lbl ${tone}">${lbl}</span>${ofnRoute(x)}</span><span class="ofn-mv-r num">${R?'#'+R.rank:'—'}</span>${story}</li>`}

/* ---------- Following tab: who you follow, and a search to follow more ---------- */
function ofnFollowList(F){const ids=[...F].filter(id=>byId[id]);
  return `<div class="ofn-fol"><div class="ofn-fol-chips">${ids.length?ids.map(id=>{const p=byId[id],own=!(S.following||[]).includes(id);
      return `<span class="ofn-chip">${av(p,'sm')}<b>${esc(p.n)}</b><small>${esc(p.pos)} · ${esc(p.t||'FA')}</small>${own?'<em title="On one of your league rosters">Roster</em>':`<button type="button" data-follow="${id}" aria-label="Unfollow ${esc(p.n)}">×</button>`}</span>`}).join('')
    :'<p class="note">You aren’t following anyone yet. Find players below.</p>'}</div>
    <div class="ofn-fol-add"><input type="search" id="ofn-q" placeholder="Follow a player" autocomplete="off" aria-label="Find a player to follow" value="${esc(OFN.q)}"><ul id="ofn-q-res" class="ofn-q-res"></ul></div></div>`}
function ofnSearch(){const box=document.getElementById('ofn-q-res');if(!box)return;const q=norm(OFN.q||'').trim();if(q.length<2){box.innerHTML='';return}
  const R=ofnRanks(),F=ofnFollowed();
  const hits=POOL.filter(p=>p.pos!=='DST'&&p.pos!=='K'&&norm(p.n).includes(q)).sort((a,b)=>((R[a.id]||{}).rank||999)-((R[b.id]||{}).rank||999)).slice(0,6);
  box.innerHTML=hits.length?hits.map(p=>`<li>${av(p,'sm')}<span><b>${esc(p.n)}</b><small>${esc(p.pos)} · ${esc(p.t||'FA')}${R[p.id]?` · TM #${R[p.id].rank}`:''}</small></span>${F.has(p.id)?'<em>Following</em>':`<button type="button" class="btn small" data-follow="${p.id}">Follow</button>`}</li>`).join('')
    :'<li class="note">No players match.</li>'}

/* ---------- the page ---------- */
function renderOffNews(){const el=document.getElementById('news-body');if(!el)return;if(!OFN_TABS.some(([k])=>k===OFN.f))OFN.f='feed';
  /* opening #news directly: app.js draws the first page before its later helpers exist, so wait for it to finish loading */
  try{wordIn;normT;teamName;isFollowing}catch(e){setTimeout(renderOffNews,0);return}
  ofnLoad();if(tmoIsPro())ofnLoadHist();
  const ph=ofnPhase();
  el.innerHTML=`<div class="tmn-lay ofn"><aside class="tmn-side" aria-label="News sections">
      <header class="hero tmn-head"><div class="kicker">Offseason</div><h1>News</h1>${ph?`<p class="ofn-phase"><i aria-hidden="true"></i>${esc(ph)}</p>`:''}</header>
      <div class="tmn-nav" role="group" aria-label="Show" id="ofn-seg"></div></aside>
    <div class="tmn-feed" id="ofn-feed"></div></div>`;
  ofnRenderBody()}
function ofnRenderBody(){const el=document.getElementById('ofn-feed');if(!el)return;
  const all=ofnItems(),F=ofnFollowed(),signed=tmoSignedIn(),cut=Date.now()-OFN_FEED_DAYS*864e5,f=OFN.f;
  const feed=all.filter(x=>x.at>=cut&&ofnRelevant(x)),mine=feed.filter(x=>x.mine),lg=feed.filter(x=>!x.mine);
  const mvCut=Date.now()-OFN_MOVE_DAYS*864e5,moves=all.filter(x=>OFN_TXN.includes(x.kind)&&x.ok&&x.pid&&x.at>=mvCut&&x.rank&&x.rank<=OFN_TOP);
  const seg=document.getElementById('ofn-seg');
  if(seg)seg.innerHTML=OFN_TABS.map(([k,l])=>{const n=k==='following'?mine.length:k==='moves'?moves.length:0;return `<button type="button" data-ofn-f="${k}" aria-pressed="${f===k}">${l}${n?` <span class="tmn-n">${n}</span>`:''}</button>`}).join('');
  const loading=!OFN.data&&OFN.busy?'<p class="note tmn-loading"><span class="spin"></span> Pulling the latest moves…</p>':'';
  let html='';
  if(f==='feed'){
    html=ofnSec('Players you follow',mine.length?'Newest first':'',ofnTimeline(mine,()=>'mine'))
      +ofnSec('Around the league',lg.length?'Trades, signings, releases and more for fantasy-relevant players':'',ofnTimeline(lg,()=>'lg'));
    if(!html)html=loading||ofnEmpty('Quiet around the league','Trades, signings, releases, retirements, coaching changes, big injuries and suspensions for fantasy-relevant players show up here as they happen.');}
  else if(f==='following'){
    if(!signed)html=ofnEmpty('Follow the players you care about','Sign in to follow players. Their moves show up first in your Feed, and the big ones (a trade, a signing, a release, a retirement, a season-ending injury, a suspension or a new head coach or offensive coordinator) land in your alerts.','<a class="btn accent" href="#signin">Sign in free</a>');
    else html=ofnSec('Following',`${F.size} player${F.size===1?'':'s'} · your follows and your league rosters`,ofnFollowList(F))
      +(mine.length?ofnSec('Their news','Last 14 days',ofnTimeline(mine,()=>'mine')):loading||ofnEmpty('Nothing on your players yet','When a player you follow is traded, signs, is released or has other big news, it lands here.'));}
  else{const pos=OFN.pos,list=pos==='ALL'?moves:moves.filter(x=>{const p=ofnPlayer(x.pid);return p&&p.pos===pos});
    const seg2=[['ALL','All'],['QB','QB'],['RB','RB'],['WR','WR'],['TE','TE']].map(([v,l])=>`<button type="button" data-ofn-pos="${v}" aria-pressed="${v===pos}">${l}</button>`).join('');
    html=`<section class="tmn-sec ofn-sec"><div class="tmn-sec-h"><h2>Moves</h2><span class="note">Confirmed moves for TradeMetric top-${OFN_TOP} players · last ${OFN_MOVE_DAYS} days</span></div>
      <div class="seg ofn-pos" role="group" aria-label="Position">${seg2}</div>
      ${list.length?`<div class="ofn-mv-h" aria-hidden="true"><span>Date</span><span>Player</span><span>Move</span><span>TM rank</span></div><ol class="ofn-mvs">${list.map(ofnMoveRow).join('')}</ol>`
        :loading||`<p class="note ofn-none">No confirmed moves${pos==='ALL'?'':' at '+pos} in the last ${OFN_MOVE_DAYS} days.</p>`}</section>`}
  el.innerHTML=html;
  el.querySelectorAll('.tmn-tl .tmn-ev').forEach(a=>{const r=a.querySelector(':scope>.tmn-ev-rail'),t=a.querySelector('.tmn-ev-top');if(r&&t){r.className='tmn-when';t.appendChild(r)}});
  if(f==='following')ofnSearch();
  /* AI recaps for the stories on screen (cached per story), and role outlooks for the players on screen (Pro) */
  const shown=f==='moves'?[]:f==='following'?mine:feed;
  if(typeof tmnLoadRecaps==='function'&&!TMN.rcBusy){const RC=tmnRecaps(),tried=TMN.rcTried||new Set();
    const need=shown.filter(x=>x.pid&&byId[x.pid]&&x.url&&!RC[x.url]&&!tried.has(x.url)).map(x=>({type:'lg',kind:x.kind,url:x.url,pid:x.pid,title:x.title,desc:x.desc,outlet:x.outlet,pay:x.pay,from:x.from,to:x.to}));
    if(need.length)tmnLoadRecaps(need).then(ofnRepaint)}
  if(tmoIsPro())ofnLoadOutlooks(shown.filter(x=>x.pid).map(x=>x.pid))}

/* ---------- alerts (the bell) for players you follow: major events only, every one verified ---------- */
function ofnAlerts(){if(!tmoSignedIn())return [];try{wordIn;normT;teamName}catch(e){return []}ofnLoad();const cut=Date.now()-OFN_FEED_DAYS*864e5,F=ofnFollowed();if(!F.size)return [];
  const tn=t=>t?'the '+teamName(t):'free agency';
  return ofnItems().filter(x=>x.mine&&x.at>=cut&&(x.pid?(x.ok&&(['trade','team','sign','release','retire','susp'].includes(x.kind)||(x.kind==='inj'&&OFN_SEASON_OVER.test(x.title+' '+x.desc)))):x.kind==='coach'&&x.outlets.length>=2))
    .map(x=>{const p=x.pid?ofnPlayer(x.pid):null,day=new Date(x.at).toISOString().slice(0,10);
      if(!p){const fp=[...F].map(id=>byId[id]).find(q=>q&&q.t===x.team);return {k:`off-coach-${x.team}-${day}`,lvl:'warn',t:`Coaching change: ${teamName(x.team)}`,d:x.title,open:fp?fp.id:''}}
      const t={trade:`${p.n} was traded to ${tn(x.to)}`,team:`${p.n} is now with ${tn(x.to)}`,sign:`${p.n} signed with ${tn(x.to)}`,release:`${p.n} was released`,retire:`${p.n} is retiring`,inj:`${p.n}: season-ending injury`,susp:`${p.n} was suspended`}[x.kind];
      return {k:`off-${x.kind}-${x.pid}-${day}`,lvl:x.kind==='inj'||x.kind==='susp'?'bad':'trade',t,d:x.title||(x.from?`${x.from} → ${x.to}`:''),open:byId[x.pid]?x.pid:''}}).slice(0,12)}

/* ---------- events ---------- */
function ofnGoRank(id){const o=tmoRows().find(r=>r.id===id);if(!o)return;TMO.open=id;TMO.view='all';TMO.pos='ALL';TMO.q='';if(o.rank>TMO.limit)TMO.limit=Math.ceil(o.rank/50)*50;
  location.hash='tmrank';setTimeout(()=>{const r=document.querySelector(`[data-tmo-row="${id}"]`);if(r)r.scrollIntoView({block:'center'})},80)}
document.addEventListener('click',e=>{const t=e.target;if(!t.closest)return;
  const f=t.closest('[data-ofn-f]');if(f){OFN.f=f.dataset.ofnF;ofnRenderBody();return}
  const ps=t.closest('[data-ofn-pos]');if(ps){OFN.pos=ps.dataset.ofnPos;ofnRenderBody();return}
  const r=t.closest('[data-ofn-rank]');if(r&&!t.closest('a,button')){ofnGoRank(r.dataset.ofnRank);return}});
document.addEventListener('keydown',e=>{const r=e.target.closest&&e.target.closest('[data-ofn-rank]');if(r&&e.target===r&&(e.key==='Enter'||e.key===' ')){e.preventDefault();ofnGoRank(r.dataset.ofnRank)}});
document.addEventListener('input',e=>{if(e.target.id!=='ofn-q')return;OFN.q=e.target.value;ofnSearch()});
