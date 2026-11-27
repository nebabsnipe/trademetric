/* ===== Desktop layout (701px and up). Phone is untouched: nothing here runs or shows at 700px and under. =====
   - the top bar's live pill and account chip
   - My Team's three-column dashboard (#tmd-dash), drawn from the same numbers the rest of My Team uses
   It adds no features and no data: every number comes from functions js/app.js already has
   (myLineup, pickVal, weekLine, lineP, simulate, records, schedule). Styles are in css/desktop.css. */
(function(){
const MQ=matchMedia('(min-width:701px)');
const on=()=>MQ.matches;
const ST={hero:0,odds:'playoff',wk:null,stand:'rec',seg:'matchup',timer:null,sig:''};
const CHEV='<svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW='<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON={
  open:'<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M8 4H4v4M12 4h4v4M8 16H4v-4M12 16h4v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sim:'<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 16V4M3 16h14M6.5 12.5l3-3.5 2.5 2 4-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star:'<svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><path d="m10 2.8 2.2 4.5 5 .700-3.6 3.5.900 4.900L10 14.100l-4.5 2.3.900-4.900L2.8 8l5-.700z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  clock:'<svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 6v4.200l2.6 1.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
/* a win chance is never shown as 100% (or 0%) unless it truly is */
const wp=p=>p>=1?'100%':p<=0?'0%':Math.min(99,Math.max(1,Math.round(p*100)))+'%';
const initials=n=>{const w=String(n||'').replace(/[^A-Za-z0-9 ]/g,' ').trim().split(/\s+/).filter(x=>!/^(the|a|of|and)$/i.test(x));return ((w[0]||'?')[0]+(w[1]?w[1][0]:'')).toUpperCase()};
/* a fantasy team's round badge: its colour and initials (fantasy teams have no logo in the data) */
const badge=(tid,cls)=>{const T=teamById(tid);return `<span class="tmd-badge ${cls||''}" style="--c:${teamColor(tid)}" aria-hidden="true">${esc(initials(T&&T.name))}</span>`};
const sel=(id,opts,cur,label)=>`<label class="tmd-sel"><span class="sr">${label}</span><select data-tmd="${id}" aria-label="${label}">${opts.map(([v,t])=>`<option value="${v}"${String(v)===String(cur)?' selected':''}>${esc(t)}</option>`).join('')}</select>${CHEV}</label>`;
/* what a player's number is right now: his live or final score once his game starts, otherwise this week's projection */
function valOf(id,f){const l=liveOf(id);return l?{v:l.pts,k:l.state==='post'?'Final':'Live'}:{v:f(id),k:'Proj'}}
/* the player picture: a real photo when the photo switch allows one, otherwise the team-colour jersey the site already draws */
function face(p,kind){const src=typeof tmPhoto==='function'?tmPhoto(p.id,kind):null;
  if(src)return `<img class="tmd-photo ${kind}" src="${esc(src)}" alt="" ${kind==='hero'?'fetchpriority="high"':'loading="lazy"'} decoding="async" onerror="this.closest('[data-face]').classList.add('nophoto');this.remove()">`;
  return ''}

/* ---------- top bar ---------- */
function livePill(){const el=$('tmd-live');if(!el)return;const live=!!(typeof LIVE!=='undefined'&&LIVE&&LIVE.live&&LIVE.week===WEEK);
  el.innerHTML=(live?'<span class="tmd-live-dot"></span><b>Live</b>':'')+`<span class="tmd-live-pill">Week ${WEEK}</span>`}
function chip(){const b=$('acct-btn');if(!b||!b.classList.contains('in'))return;
  const n=(typeof acctName==='function'?acctName():'')||'Account',lg=typeof S!=='undefined'&&S&&!S.noLeague&&S.league&&S.league.name||'My account',sig=n+'|'+lg;
  const old=b.querySelector('.tmd-chip-t');if(old&&old.dataset.sig===sig)return;b.querySelectorAll('.tmd-chip-t,.tmd-chip-c').forEach(x=>x.remove());
  b.insertAdjacentHTML('beforeend',`<span class="tmd-chip-t d-only" data-sig="${esc(sig)}"><b>${esc(n)}</b><small>${esc(lg)}</small></span><span class="tmd-chip-c d-only">${CHEV}</span>`)}

/* ---------- My Team dashboard ---------- */
function skeleton(el){el.innerHTML=`
  <aside class="tmd-col tmd-left" aria-label="Overview">
    <div class="tmd-card tmd-group">
      <div class="tmd-head" id="tmd-head"></div>
      <div id="tmd-feature"></div>
      <div id="tmd-tiles"></div>
    </div>
    <div class="tmd-card" id="tmd-odds"></div>
  </aside>
  <section class="tmd-col tmd-centre" aria-label="This week">
    <div class="tmd-hero" id="tmd-hero"></div>
    <div class="tmd-card tmd-panel" id="tmd-panel"></div>
  </section>
  <aside class="tmd-col tmd-right" aria-label="Matchup and standings">
    <div class="tmd-card tmd-rightcard"><div class="tmd-livecard" id="tmd-livecard"></div><div id="tmd-stand"></div></div>
  </aside>`}
/* the four My Team tiles are the real ones: on desktop they sit in the left column, on the phone back where they were */
function placeTiles(){const t=$('team-tiles'),slot=$('tmd-tiles'),dash=$('tmd-dash');if(!t||!dash)return;
  if(on()&&slot){if(t.parentNode!==slot)slot.appendChild(t)}
  else if(t.parentNode!==dash.parentNode){const lu=$('lu-alert');lu.parentNode.insertBefore(t,lu.nextSibling)}}

function starters(){const me=myTeam(),LU=myLineup(me,realLineup(S.me)),f=pickVal(WEEK);
  return LU.slots.filter(s=>s.p).map(s=>({p:s.p,slot:s.label,...valOf(s.p.id,f),proj:f(s.p.id)})).sort((a,b)=>b.v-a.v)}

function drawHead(){const me=myTeam();$('tmd-head').innerHTML=`<h1>${esc(me.name)}</h1><p>${esc(S.league.name||'My League')} · ${recTxt(S.me)}</p>
  <div class="tmd-over"><b>Overview</b><span>Week ${WEEK}</span><a href="#season">See all</a></div>`}
function drawFeature(list){const el=$('tmd-feature'),x=list[0];if(!x){el.innerHTML='';return}
  const p=x.p,ph=face(p,'head'),tc=TC[p.t]||['#3a3f47','#8a919c'];
  el.innerHTML=`<button type="button" class="tmd-feature" data-open="${p.id}" data-face style="--t1:${tc[0]};--t2:${tc[1]}">
    <span class="tmd-feature-txt"><small>${x.k==='Proj'?'Top projected starter':'Top starter this week'}</small><b>${esc(p.n)}</b><em>${esc(NICK[p.t]||p.t)} · ${p.pos}</em><span class="tmd-feature-meta">${liveOf(p.id)?liveTxt(p.id):oppHtml(p.id)}</span></span>
    <span class="tmd-feature-pic${ph?'':' nophoto'}">${ph||av(p,'lg')}</span>
    <span class="tmd-score" title="${x.k==='Proj'?'Projected points this week':x.k+' score this week'}"><small>${x.k==='Proj'?'Proj':x.k}</small><b>${f1(x.v)}</b></span></button>`}

/* a team's recent weekly scores as a small line. Real scores only; no line when the league gave fewer than three weeks */
function spark(tid){const R=S.real;if(!R||!R.scores)return '';const v=[];for(let w=1;w<=(R.played||0);w++){const x=R.scores[w]&&R.scores[w][tid];if(x!=null)v.push(+x)}
  const a=v.slice(-6);if(a.length<3)return '';const mn=Math.min(...a),mx=Math.max(...a),W=74,H=22,px=i=>3+i*(W-10)/(a.length-1),py=x=>H-4-(mx===mn?.5:(x-mn)/(mx-mn))*(H-8);
  let d=`M${px(0).toFixed(1)} ${py(a[0]).toFixed(1)}`;for(let i=1;i<a.length;i++){const cx=(px(i-1)+px(i))/2;d+=` C${cx.toFixed(1)} ${py(a[i-1]).toFixed(1)} ${cx.toFixed(1)} ${py(a[i]).toFixed(1)} ${px(i).toFixed(1)} ${py(a[i]).toFixed(1)}`}
  return `<svg class="tmd-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Last ${a.length} weekly scores: ${a.map(x=>Math.round(x)).join(', ')}"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="${px(a.length-1).toFixed(1)}" cy="${py(a[a.length-1]).toFixed(1)}" r="3.2" fill="currentColor"/></svg>`}
function drawOdds(sim){const el=$('tmd-odds');if(!sim){el.hidden=true;return}el.hidden=false;
  const k=ST.odds,all=S.teams.map(T=>T.id).sort((a,b)=>sim[b][k]-sim[a][k]||sim[b].wins-sim[a].wins);let rows=all.slice(0,5);
  if(!rows.includes(S.me))rows=[...rows.slice(0,4),S.me];
  const lab={playoff:'Playoff odds',bye:'First-round bye odds',title:'Title odds'},sp=rows.map(spark),any=sp.some(Boolean);
  el.innerHTML=`<div class="tmd-card-h"><h2>Season Sim</h2><a class="tmd-seeall" href="#season">See all</a></div>
   <div class="tmd-sub-h"><div><b>${lab[k]}</b>${any?'<small><i></i>Line: last 6 weekly scores</small>':''}</div>${sel('odds',[['playoff','Playoffs'],['bye','Bye'],['title','Title']],k,'Which odds to show')}</div>
   <ul class="tmd-rows${any?'':' nospark'}">${rows.map((t,i)=>{const T=teamById(t),v=sim[t][k];return `<li class="${t===S.me?'me':''}"><span class="tmd-tpill">${badge(t)}<span>${esc(T.name)}</span></span>${any?`<span class="tmd-sp">${sp[i]}</span>`:''}<b class="num">${wp(v)}</b></li>`}).join('')}</ul>`}

function drawHero(list){const el=$('tmd-hero');if(!list.length){el.innerHTML='';return}
  if(ST.hero>=list.length)ST.hero=0;
  el.innerHTML=`<div class="tmd-stage">${list.map((x,i)=>{const p=x.p,ph=face(p,'hero'),tc=TC[p.t]||['#3a3f47','#8a919c'];
     return `<button type="button" class="tmd-slide${i===ST.hero?' on':''}${ph?'':' nophoto'}" data-open="${p.id}" data-face data-i="${i}" style="--t1:${tc[0]};--t2:${tc[1]}" aria-label="${esc(p.n)}: open player card" ${i===ST.hero?'':'tabindex="-1" aria-hidden="true"'}>
       <span class="tmd-glow" aria-hidden="true"></span>
       <span class="tmd-figure">${ph||`<span class="tmd-num" aria-hidden="true">${NUM[p.id]!=null?NUM[p.id]:esc(p.t)}</span>${av(p,'lg')}`}</span>
       <span class="tmd-cap"><small>${esc(x.slot)} · ${esc(NICK[p.t]||p.t)}</small><b>${esc(p.n)}</b>
         <span class="tmd-cap-row"><span class="tmd-pill">${p.pos}</span><span class="tmd-cap-opp">${liveOf(p.id)?liveTxt(p.id):oppHtml(p.id)}</span><span class="tmd-cap-pts"><b class="num">${f1(x.v)}</b> ${x.k==='Proj'?'projected':'pts'}</span></span></span></button>`}).join('')}</div>
   <div class="tmd-dots" role="tablist" aria-label="Your starters">${list.map((x,i)=>`<button type="button" role="tab" aria-selected="${i===ST.hero}" aria-label="${esc(x.p.n)}" data-tmd-dot="${i}"></button>`).join('')}</div>
   <button type="button" class="tmd-next" data-tmd-next aria-label="Next starter">${ARROW}</button>`;
  cycle()}
function showSlide(i){const el=$('tmd-hero');if(!el)return;const s=[...el.querySelectorAll('.tmd-slide')];if(!s.length)return;ST.hero=(i+s.length)%s.length;
  s.forEach((x,j)=>{const a=j===ST.hero;x.classList.toggle('on',a);if(a){x.removeAttribute('tabindex');x.removeAttribute('aria-hidden')}else{x.tabIndex=-1;x.setAttribute('aria-hidden','true')}});
  el.querySelectorAll('[data-tmd-dot]').forEach((d,j)=>d.setAttribute('aria-selected',j===ST.hero))}
/* the hero moves on by itself every few seconds; never while the pointer or keyboard is on it, or with reduced motion */
function cycle(){clearInterval(ST.timer);if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  ST.timer=setInterval(()=>{const el=$('tmd-hero');if(!el||!on()||document.hidden||tab!=='team'||el.matches(':hover')||el.contains(document.activeElement))return;showSlide(ST.hero+1)},7000)}

function weeksLeft(){const out=[],rw=(S.real&&S.real.regWeeks)||REG_WEEKS||14;for(let w=WEEK;w<=rw;w++)if(oppOf(S.me,w)!=null)out.push(w);return out}
function drawPanel(sim){const el=$('tmd-panel'),wks=weeksLeft();if(!wks.includes(ST.wk))ST.wk=wks[0]||WEEK;const w=ST.wk,oid=oppOf(S.me,w),me=myTeam();
  let vs;
  if(oid==null)vs=`<div class="tmd-vs"><p class="tmd-empty">No opponent in Week ${w}.</p></div>`;
  else{const O=teamById(oid),A=weekLine(me.players,w,S.me),B=weekLine(O.players,w,oid),pw=lineP(A,B,w),d=A.m-B.m;
    vs=`<div class="tmd-vs">
      <div class="tmd-vs-row"><div class="tmd-cap2">${badge(S.me,'lg')}<small>${recTxt(S.me)}</small></div><span class="tmd-vs-mid">VS</span><div class="tmd-cap2">${badge(oid,'lg')}<small>${recTxt(oid)}</small></div></div>
      <div class="tmd-vs-info"><div><b>${esc(me.name)}</b><small>vs ${esc(O.name)}</small></div><div class="r"><b class="num">${f1(A.m)} – ${f1(B.m)}</b><small>Projected</small></div></div>
      <div class="tmd-chips"><span class="tmd-chipx"><small>You win</small><b class="num">${wp(pw)}</b></span><span class="tmd-chipx"><small>They win</small><b class="num">${wp(1-pw)}</b></span><span class="tmd-chipx ${d>=0?'up':'dn'}"><small>Margin</small><b class="num">${sgn(d)}</b></span></div></div>`}
  let rank='';
  if(sim){const ids=S.teams.map(T=>T.id).sort((a,b)=>sim[b].wins-sim[a].wins||sim[b].playoff-sim[a].playoff);let rows=ids.slice(0,6);if(!rows.includes(S.me))rows=[...rows.slice(0,5),S.me];
    rank=`<ul class="tmd-rows tmd-rk">${rows.map(t=>{const T=teamById(t);return `<li class="${t===S.me?'me':''}"><span class="tmd-tpill">${badge(t)}<span>${esc(T.name)}</span></span><span class="tmd-rk-r"><span class="num">${f1(sim[t].wins)}</span> <small>wins</small><i></i><b class="num">${wp(sim[t].playoff)}</b></span></li>`}).join('')}</ul>`}
  el.innerHTML=`<div class="tmd-card-h"><h2>${ICON.sim} Matchup and Season Sim</h2>${wks.length>1?sel('wk',wks.map(x=>[x,'Week '+x]),w,'Which week to show'):''}</div>
   <div class="tmd-split${rank?'':' one'}"><div><h3>${w===WEEK?'This week':'Week '+w}</h3>${vs}</div>${rank?`<div><h3>Simulated finish</h3>${rank}</div>`:''}</div>`}

function statusPill(A,B){if(typeof LIVE==='undefined'||!LIVE||LIVE.week!==WEEK||!LIVE.games)return '';
  const sl=[...A.lu.slots,...B.lu.slots].filter(x=>x.p),gs=[...new Set(sl.map(x=>x.p.t))].map(t=>LIVE.games[t]).filter(Boolean);
  if(gs.some(g=>g.state==='in'))return `<span class="tmd-clock live"><span class="tmd-live-dot"></span>Live</span>`;
  const nx=gs.filter(g=>g.state==='pre'&&g.start&&Date.parse(g.start)>Date.now()).map(g=>Date.parse(g.start)).sort((a,b)=>a-b)[0];
  if(nx){const d=new Date(nx);return `<span class="tmd-clock">${d.toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'})}</span>`}
  if(gs.length&&gs.every(g=>g.state==='post'))return `<span class="tmd-clock">Final</span>`;
  return ''}
const SEG=[['matchup','Matchup','matchup'],['lineup','Lineup','lineup'],['bench','Bench','bench'],['startsit','Start/sit','startsit']];
function drawLive(){const el=$('tmd-livecard'),oid=oppOf(S.me,WEEK),me=myTeam();
  if(oid==null){el.innerHTML=`<div class="tmd-card-h"><h2>This week</h2></div><p class="tmd-empty">No opponent this week.</p>`;return}
  const O=teamById(oid),A=weekLine(me.players,WEEK,S.me),B=weekLine(O.players,WEEK,oid),pw=lineP(A,B,WEEK),f=pickVal(WEEK);
  const act=lu=>sum(lu.slots.filter(x=>x.p&&liveOf(x.p.id)),x=>liveOf(x.p.id).pts),any=[...A.lu.slots,...B.lu.slots].some(x=>x.p&&liveOf(x.p.id));
  const a=any?act(A.lu):A.m,b=any?act(B.lu):B.m;
  /* each side's best starter so far (or best projected, before kickoff) */
  const top=lu=>{const s=lu.slots.filter(x=>x.p).map(x=>({p:x.p,...valOf(x.p.id,f)})).sort((x,y)=>y.v-x.v)[0];return s?`<button type="button" class="tmd-topp" data-open="${s.p.id}"><i></i>${esc(s.p.n)}</button>`:'<span></span>'};
  el.innerHTML=`<div class="tmd-card-h"><h2>${any?'Live matchup':'This week\'s matchup'}</h2><button type="button" class="tmd-round" data-tmd-open aria-label="Open the full matchup">${ICON.open}</button></div>
    <div class="tmd-stageline"><b>Week ${WEEK}<i></i>${any?'Score so far':'Projected score'}</b><small>${esc(S.league.name||'My League')}</small></div>
    <div class="tmd-score-row"><div class="tmd-side">${badge(S.me,'xl')}<b>${esc(me.name)}</b></div>
      <div class="tmd-mid"><div class="tmd-big num">${f1(a)} <i>-</i> ${f1(b)}</div>${statusPill(A,B)}</div>
      <div class="tmd-side">${badge(oid,'xl')}<b>${esc(O.name)}</b></div></div>
    <div class="tmd-names"><div>${top(A.lu)}<small>Win ${wp(pw)}</small></div><span class="tmd-div" aria-hidden="true"></span><div class="r">${top(B.lu)}<small>Win ${wp(1-pw)}</small></div></div>
    <div class="tmd-seg" role="group" aria-label="Jump to a part of My Team">${SEG.map(([k,t])=>`<button type="button" data-tmd-seg="${k}" aria-pressed="${ST.seg===k}">${t}</button>`).join('')}</div>
    <div class="tmd-cta-wrap"><button type="button" class="tmd-cta" data-tmd-open>Open ${(SEG.find(s=>s[0]===ST.seg)||SEG[0])[1].toLowerCase()}</button><span class="tmd-pitch" aria-hidden="true"></span></div>`}

/* points against, from the league's own weekly scores; null when the league didn't give weekly scores */
function pointsAgainst(){const R=S.real;if(!R||!R.scores||!R.sched)return null;const pa={};let any=false;
  Object.keys(R.sched).forEach(w=>{if(+w>(R.played||0))return;(R.sched[w]||[]).forEach(([x,y])=>{const sc=R.scores[w]||{};if(sc[x]==null||sc[y]==null)return;
    pa[x]=(pa[x]||0)+sc[y];pa[y]=(pa[y]||0)+sc[x];any=true})});return any?pa:null}
function drawStand(){const el=$('tmd-stand'),rec=records(),pa=pointsAgainst();
  const ids=S.teams.map(T=>T.id).sort(ST.stand==='pf'?(a,b)=>rec[b].pf-rec[a].pf:(a,b)=>(rec[b].w+rec[b].t/2)-(rec[a].w+rec[a].t/2)||rec[b].pf-rec[a].pf);
  el.innerHTML=`<div class="tmd-card-h"><h2>League standings</h2>${sel('stand',[['rec','Record'],['pf','Points']],ST.stand,'How to sort the standings')}</div>
   <table class="tmd-table"><thead><tr><th>P</th><th>Team</th><th>W</th><th>L</th><th>PF</th>${pa?'<th>PA</th>':''}</tr></thead>
   <tbody>${ids.map((t,i)=>{const T=teamById(t),r=rec[t];return `<tr class="${t===S.me?'me':''}"><td class="num">${i+1}</td><td><span class="tmd-tn">${badge(t)}<span>${esc(T.name)}</span></span></td><td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num">${Math.round(r.pf)}</td>${pa?`<td class="num">${Math.round(pa[t]||0)}</td>`:''}</tr>`}).join('')}</tbody></table>`}

function drawDash(){const el=$('tmd-dash');if(!el)return;if(!on()){placeTiles();clearInterval(ST.timer);return}
  if(!el.firstElementChild)skeleton(el);placeTiles();
  try{const list=starters(),sim=simulate();drawHead();drawFeature(list);drawOdds(sim);
    /* the hero is only rebuilt when its content changes, so a background refresh never restarts the carousel mid-fade */
    const sig=list.map(x=>x.p.id+':'+f1(x.v)+x.k).join('|')+'|'+(typeof TM_PHOTO_MODE==='string'?TM_PHOTO_MODE:'');if(sig!==ST.sig||!$('tmd-hero').firstElementChild){ST.sig=sig;drawHero(list)}
    drawPanel(sim);drawLive();drawStand()}catch(e){if(window.console)console.error('desktop dashboard',e)}}

/* ---------- wiring ---------- */
const _team=window.renderTeam;if(typeof _team==='function')window.renderTeam=function(){_team.apply(this,arguments);drawDash()};
const _ui=window.acctUI;if(typeof _ui==='function')window.acctUI=function(){_ui.apply(this,arguments);chip();livePill()};
document.addEventListener('change',e=>{const s=e.target.closest&&e.target.closest('select[data-tmd]');if(!s)return;const k=s.dataset.tmd;
  if(k==='odds'){ST.odds=s.value;drawOdds(simulate())}else if(k==='wk'){ST.wk=+s.value;drawPanel(simulate())}else if(k==='stand'){ST.stand=s.value;drawStand()}
  const again=document.querySelector(`select[data-tmd="${k}"]`);if(again)again.focus()});
function jump(k){const s=SEG.find(x=>x[0]===k)||SEG[0],t=$(s[2]);if(!t)return;const card=t.closest('.card')||t;
  card.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'})}
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('[data-tmd-dot],[data-tmd-next],[data-tmd-seg],[data-tmd-open],#tmd-search');if(!t)return;
  if(t.dataset.tmdDot!=null){e.stopPropagation();showSlide(+t.dataset.tmdDot);cycle()}
  else if(t.dataset.tmdNext!=null){showSlide(ST.hero+1);cycle()}
  else if(t.dataset.tmdSeg){ST.seg=t.dataset.tmdSeg;drawLive();jump(ST.seg)}
  else if(t.dataset.tmdOpen!=null)jump(ST.seg);
  else if(t.id==='tmd-search')setTimeout(()=>{const i=$('rank-search');if(i&&!$('v-rankings').hidden)i.focus()},120)});
document.addEventListener('keydown',e=>{if(!on()||(e.key!=='ArrowRight'&&e.key!=='ArrowLeft'))return;const h=$('tmd-hero');if(!h||!h.contains(document.activeElement))return;showSlide(ST.hero+(e.key==='ArrowRight'?1:-1));const s=h.querySelector('.tmd-slide.on');if(s&&document.activeElement.classList.contains('tmd-slide'))s.focus()});
MQ.addEventListener('change',()=>{placeTiles();if(typeof tab!=='undefined'&&tab==='team'&&typeof S!=='undefined'&&S&&!S.noLeague)drawDash()});
/* the top bar turns to glass once the page has scrolled under it */
const scrolled=()=>document.documentElement.classList.toggle('tmd-scrolled',window.scrollY>8);addEventListener('scroll',scrolled,{passive:true});scrolled();
setInterval(livePill,60e3);
try{chip();livePill();if(typeof tab!=='undefined'&&tab==='team'&&typeof S!=='undefined'&&S&&!S.noLeague&&!document.body.classList.contains('signed-out')&&!$('v-team').hidden)drawDash()}catch(e){}
})();
