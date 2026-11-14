/* Offseason mode: the mode switch, the offseason Home page and TradeMetric Rankings.
   Loaded after app.js. Styles are in the "Offseason mode" block at the end of css/styles.css.

   TM Score = 40% expert consensus + 27.5% market (ADP) + 32.5% TradeMetric opportunity score.
   Change the weights in TMO_W. All three parts are put on the same scale (the market's value curve
   at each position) before they are blended, so a QB rank and an RB rank mean the same thing.

   Preview data note: until offseason consensus and ADP feeds exist, consensus = rest-of-season expert
   ranks (data/nfl.json "ros") and market = FantasyCalc redraft values (data/market.json "fc1"). */
var TMO_W={cons:.40,adp:.275,tm:.325};
/* BETA: while true, every signed-in account gets Pro for free. Set to false when the beta ends
   to bring back the paywall (and the 7-day free trial, once checkout is built). */
var TMO_BETA_PRO=true;
var TMO_MODE_KEY='tm_mode_override',TMO_PRO_KEY='tm_pro_preview';
var TMO={rows:null,pos:'ALL',view:'all',q:'',open:null,limit:100,market:null};
var TMO_PUBLIC=['home','tmrank'];
var TMO_IS_PREVIEW=!/(^|\.)trademetric\.app$/.test(location.hostname);

/* ---------- mode ---------- */
function tmoOverride(){try{return localStorage.getItem(TMO_MODE_KEY)}catch(e){return null}}
function tmoMode(){
  const o=tmoOverride();if(o==='off'||o==='in')return o;
  /* No league connected (signed out, or still on the sample league) -> offseason */
  const hasLeague=typeof USER!=='undefined'&&USER&&typeof S!=='undefined'&&S&&!S.example;
  return hasLeague?'in':'off';
}
function tmoApplyMode(){
  const m=tmoMode();document.body.classList.toggle('mode-off',m==='off');document.body.classList.toggle('mode-in',m==='in');
  const p=document.getElementById('mode-pill');
  if(p){p.dataset.mode=m;p.querySelector('.mp-l').textContent=m==='off'?'Offseason':'In-season';p.title='Switch to '+(m==='off'?'in-season':'offseason')+' mode'}
}
function tmoSetMode(m){
  try{localStorage.setItem(TMO_MODE_KEY,m)}catch(e){}
  tmoApplyMode();
  const target=m==='off'?'home':'team';
  if(location.hash.slice(1)===target)go(target);else location.hash=target;
}
function tmoHomeTab(){return tmoMode()==='off'?'home':'team'}
function tmoSignedIn(){return typeof USER!=='undefined'&&!!USER}
function tmoIsPro(){
  if(TMO_BETA_PRO&&tmoSignedIn())return true;
  if(typeof PROFILE!=='undefined'&&PROFILE&&PROFILE.plan&&PROFILE.plan!=='free')return true;
  try{return TMO_IS_PREVIEW&&localStorage.getItem(TMO_PRO_KEY)==='1'}catch(e){return false}
}

/* ---------- the TM Score ---------- */
var TMO_PEAK={QB:[26,33],RB:[23,26],WR:[24,28],TE:[25,29]};
var TMO_CAP={QB:36,RB:72,WR:96,TE:36};
function tmoHalfPPR(p){return (p.pyd||0)/25+(p.ptd||0)*4-(p.int||0)*2+(p.ryd||0)/10+(p.rtd||0)*6+(p.rec||0)*.5+(p.recyd||0)/10+(p.rectd||0)*6-(p.fl||0)*2}
function tmoPct(list,key){
  const v=list.filter(r=>r[key]!=null).map(r=>r[key]).sort((a,b)=>a-b),n=v.length;
  list.forEach(r=>{if(r[key]==null){r[key+'P']=.35;return}let lo=0;while(lo<n&&v[lo]<r[key])lo++;r[key+'P']=n>1?lo/(n-1):.5});
}
function tmoBuild(){
  const D=window.NFL_DATA,M=TMO.market||(typeof MARKET!=='undefined'?MARKET:null);if(!D)return null;
  const fc=(M&&M.fc1)||{},ros=D.ros||{},dyn=D.dyn||{},exp=D.exp||{},eff=D.eff||{},depth=D.depth||{};
  let all=D.players.filter(x=>TMO_PEAK[x[2]]).map(([id,n,pos,t,st,inj,pr,log])=>{
    const o={id,n,pos,t};D.fields.forEach((f,k)=>o[f]=pr[k]);
    const g=(log||[]).length;o.g=g;o.ppg=tmoHalfPPR(o);
    o.age=dyn[id]?dyn[id][2]:null;o.age1=o.age!=null?o.age+1:null; /* age next season */
    o.ecr=ros[id]?ros[id][0]:null;o.fc=fc[id]||null;
    const e=exp[id];o.xfpg=e&&g?e[2]/g:null;o.fpoeg=e&&g?e[3]/g:null;
    o.wopr=eff[id]&&o.pos!=='QB'?eff[id][0]:null;o.dep=depth[id]?depth[id][0]:null;
    return o});
  /* team offense = skill players' half-PPR points per game */
  const off={};all.forEach(o=>{if(o.g)off[o.t]=(off[o.t]||0)+o.ppg});all.forEach(o=>o.off=off[o.t]||null);
  const out=[];
  Object.keys(TMO_PEAK).forEach(pos=>{
    let L=all.filter(o=>o.pos===pos&&(o.ecr!=null||o.fc!=null));
    L.sort((a,b)=>(a.ecr??999)-(b.ecr??999)||(b.fc||0)-(a.fc||0));L=L.slice(0,TMO_CAP[pos]);
    /* the market's value curve at this position */
    const curve=L.map(o=>o.fc).filter(Boolean).sort((a,b)=>b-a);
    const at=r=>{if(!curve.length)return 0;if(r<=1)return curve[0];const i=r-1,lo=Math.floor(i),f=i-lo;
      if(lo+1<curve.length)return curve[lo]*(1-f)+curve[lo+1]*f;const last=curve[curve.length-1];return last*Math.pow(.93,i-(curve.length-1))};
    const mk=[...L].sort((a,b)=>(b.fc||0)-(a.fc||0));mk.forEach((o,i)=>o.mPos=o.fc?i+1:null);
    ['xfpg','fpoeg','wopr','off'].forEach(k=>tmoPct(L,k));
    L.forEach(o=>{
      const [a,b]=TMO_PEAK[pos];let ageF=.6;if(o.age1!=null)ageF=o.age1<a?Math.max(.55,1-.08*(a-o.age1)):o.age1>b?Math.max(0,1-.14*(o.age1-b)):1;
      const depF=o.dep==null?.4:o.dep===1?1:o.dep===2?.55:.25;
      let opp=pos==='QB'?.55*o.xfpgP+.12*o.fpoegP+.13*ageF+.10*depF+.10*o.offP
                        :.40*o.xfpgP+.15*o.woprP+.10*o.fpoegP+.15*ageF+.10*depF+.10*o.offP;
      if(o.g<4)opp=.5+(opp-.5)*o.g/4; /* small samples pulled toward average */
      o.opp=opp;o.ageF=ageF;o.depF=depF;
    });
    const op=[...L].sort((a,b)=>b.opp-a.opp);op.forEach((o,i)=>o.oPos=i+1);
    L.forEach(o=>{
      const nm=curve.length;
      o.vCons=at(o.ecr!=null?o.ecr:(o.mPos||nm+1));
      o.vAdp=o.fc?o.fc:at(Math.max(o.ecr||0,nm+1));
      o.vTm=at(o.oPos);
      out.push(o);
    });
  });
  const top=Math.max(...out.map(o=>Math.max(o.vCons,o.vAdp,o.vTm)))||1;
  out.forEach(o=>{o.sCons=o.vCons/top*100;o.sAdp=o.vAdp/top*100;o.sTm=o.vTm/top*100;o.raw=TMO_W.cons*o.sCons+TMO_W.adp*o.sAdp+TMO_W.tm*o.sTm});
  const best=Math.max(...out.map(o=>o.raw))||1;out.forEach(o=>o.score=o.raw/best*100);
  out.sort((a,b)=>b.score-a.score);out.forEach((o,i)=>o.rank=i+1);
  [...out].sort((a,b)=>b.vAdp-a.vAdp).forEach((o,i)=>o.mRank=i+1);
  [...out].sort((a,b)=>b.vCons-a.vCons).forEach((o,i)=>o.cRank=i+1);
  const pc={};out.forEach(o=>{pc[o.pos]=(pc[o.pos]||0)+1;o.posRank=pc[o.pos]});
  out.forEach(o=>{o.diff=o.mRank-o.rank;const need=Math.max(6,Math.round(.12*Math.min(o.rank,o.mRank)));
    o.tag=o.diff>=need&&o.rank<=150?'sleeper':o.diff<=-need&&o.mRank<=150?'bust':null;o.grade=tmoGrade(o)});
  return out;
}
function tmoGrade(o){
  /* opportunity grade: where his opportunity score sits among everyone at his position */
  const p=o.oPos/TMO_CAP[o.pos];return p<=.06?'A+':p<=.15?'A':p<=.25?'B+':p<=.38?'B':p<=.5?'C+':p<=.65?'C':p<=.8?'D':'F';
}
function tmoTiers(list){
  /* a new tier starts where the drop to the next player is much bigger than the drops around it */
  let t=1;list.forEach((o,i)=>{
    if(i===0){o.tier=1;o.tierStart=true;return}
    const gap=list[i-1].score-o.score,win=[];for(let j=Math.max(1,i-6);j<=Math.min(list.length-1,i+6);j++)if(j!==i)win.push(list[j-1].score-list[j].score);
    win.sort((a,b)=>a-b);const med=win.length?win[Math.floor(win.length/2)]:0;
    const since=i-list.findLastIndex((x,k)=>k<i&&x.tierStart);
    if((gap>Math.max(.6,2.2*med)&&since>=3)||since>=16){t++;o.tierStart=true}else o.tierStart=false;o.tier=t});
}
function tmoRows(){if(!TMO.rows)TMO.rows=tmoBuild();return TMO.rows||[]}

/* ---------- shared bits ---------- */
var TMO_LOCK='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
function tmoPctW(x){return +(x*100).toFixed(1)+'%'}
function tmoDiff(d){if(!d)return '<span class="tmo-diff z">—</span>';return `<span class="tmo-diff ${d>0?'up':'dn'}" title="${d>0?'TradeMetric ranks him '+d+' spots higher than the market':'TradeMetric ranks him '+(-d)+' spots lower than the market'}">${d>0?'▲':'▼'} ${Math.abs(d)}</span>`}
function tmoName(o){return `<span class="tmo-pl"><span class="tmo-pos p-${o.pos}">${o.pos}</span><span class="tmo-nm"><b>${esc(o.n)}</b><small>${esc(o.t||'FA')} · ${o.pos}${o.posRank}${o.age1!=null?' · Age '+Math.floor(o.age1):''}</small></span></span>`}
function tmoUpdated(){const d=window.NFL_DATA&&window.NFL_DATA.rosDate;if(!d)return '';const x=new Date(d+'T12:00:00');return 'Updated '+x.toLocaleDateString('en-US',{month:'short',day:'numeric'})}

/* ---------- Home ---------- */
function renderOffHome(){
  const el=document.getElementById('off-home');if(!el)return;const R=tmoRows();
  const top=R.slice(0,10),sl=R.filter(o=>o.tag==='sleeper').sort((a,b)=>b.diff/b.mRank-a.diff/a.mRank).slice(0,5),
        bu=R.filter(o=>o.tag==='bust').sort((a,b)=>a.diff/a.rank-b.diff/b.rank).slice(0,5);
  const signed=typeof USER!=='undefined'&&USER,pro=tmoIsPro();
  const mini=(L,kind)=>L.length?L.map(o=>`<li><a href="#tmrank" data-tmo-go="${o.id}">${tmoName(o)}<span class="tmo-mini-r"><span class="tmo-rk">#${o.rank}</span>${tmoDiff(o.diff)}</span></a></li>`).join(''):`<li class="note">No ${kind} right now.</li>`;
  const TOOLS=[
    ['Season Recap','Your season, card by card: best and worst trades, your best waiver add and how your standing moved week to week.','recap'],
    ['League-fit rankings','The rankings re-sorted for your league’s scoring, roster spots and your own roster needs.','fit'],
    ['TM Score breakdown','See exactly why we rank each player where we do: consensus, market and our opportunity model.','why'],
    ['Draft pick values','Is 1.04 worth more than 1.07 plus a 3rd? Grade any pick trade before your draft.','picks'],
    ['Mock drafts','Practice against opponents that draft like real leagues, then get your draft graded.','mock'],
    ['Trade analyzer','When the season starts: grades every trade with your league’s standings and lineups.','trade']];
  el.innerHTML=`
  <div class="tmo-hero">
    <div class="tmo-hero-in">
      <div class="kicker">Offseason</div>
      <h1>Get ready for your next draft.</h1>
      <p>TradeMetric Rankings blend expert consensus, the market and our own opportunity model into one number, so you see who the market is missing before your league does.</p>
      <div class="tmo-cta">
        <a class="btn accent tmo-big" href="#tmrank">See the rankings</a>
        ${signed?'':'<a class="btn tmo-big tmo-ghost" href="#signin">Sign in</a>'}
      </div>
    </div>
    <dl class="tmo-hero-stats">
      <div><dt>Players ranked</dt><dd>${R.length}</dd></div>
      <div><dt>Sleepers flagged</dt><dd>${R.filter(o=>o.tag==='sleeper').length}</dd></div>
      <div><dt>Busts flagged</dt><dd>${R.filter(o=>o.tag==='bust').length}</dd></div>
    </dl>
  </div>

  <div class="tmo-grid">
    <section class="card tmo-top">
      <div class="card-h"><h2>Top 10</h2><a class="tmo-link" href="#tmrank">Full rankings →</a></div>
      <ol class="tmo-top-list">${top.map(o=>`<li><a href="#tmrank" data-tmo-go="${o.id}"><span class="tmo-rk">${o.rank}</span>${tmoName(o)}<span class="tmo-score-mini"><b>${o.score.toFixed(1)}</b><small>TM Score</small></span></a></li>`).join('')}</ol>
    </section>
    <div class="tmo-sb">
      <section class="card tmo-sb-card sl">
        <div class="card-h"><h2>Sleepers</h2><span class="note">We rank them well above the market</span></div>
        <ul class="tmo-mini">${mini(sl,'sleepers')}</ul>
        <a class="tmo-link" href="#tmrank" data-tmo-view="sleeper">All sleepers →</a>
      </section>
      <section class="card tmo-sb-card bu">
        <div class="card-h"><h2>Busts</h2><span class="note">The market likes them more than we do</span></div>
        <ul class="tmo-mini">${mini(bu,'busts')}</ul>
        <a class="tmo-link" href="#tmrank" data-tmo-view="bust">All busts →</a>
      </section>
    </div>
  </div>

  <section class="tmo-pro">
    <div class="tmo-pro-h">
      <div><div class="kicker">TradeMetric Pro</div><h2>Built for your league, not everyone's.</h2>
      <p>The rankings are free. Pro turns them into decisions for your team.${TMO_BETA_PRO?' <b>Free for every account during the beta.</b>':''}</p></div>
      ${pro?`<span class="tmo-pro-on">${TMO_BETA_PRO?'Pro active · free during beta':'Pro active'}</span>`:`<a class="btn accent" href="${signed?'#account':'#signin'}">${signed?'See Pro plans':TMO_BETA_PRO?'Sign in for free Pro':'Sign in to get Pro'}</a>`}
    </div>
    <div class="tmo-tools">${TOOLS.map(([h,p,k])=>`<div class="tmo-tool"><div class="tmo-tool-h"><h3>${h}</h3>${pro?'':'<span class="tmo-lock">'+TMO_LOCK+'Pro</span>'}</div><p>${p}</p>${k==='trade'||k==='mock'||k==='picks'?'<span class="tmo-soon">Coming soon</span>':''}</div>`).join('')}</div>
  </section>
  ${TMO_IS_PREVIEW&&!TMO_BETA_PRO?`<p class="tmo-dev note">Preview only: <button class="btn small" type="button" data-tmo-pro>${pro?'View as free':'View as Pro'}</button> Consensus and market numbers use this season's rest-of-season data until the offseason feeds are added.</p>`:''}`;
}

/* ---------- Rankings ---------- */
function renderTmRank(){
  const el=document.getElementById('tm-rank');if(!el)return;const R=tmoRows(),pro=tmoIsPro();
  let L=TMO.pos==='ALL'?R.slice():R.filter(o=>o.pos===TMO.pos);
  tmoTiers(L);
  if(TMO.view!=='all')L=L.filter(o=>o.tag===TMO.view);
  if(TMO.q){const q=TMO.q.toLowerCase();L=L.filter(o=>o.n.toLowerCase().includes(q)||(o.t||'').toLowerCase()===q)}
  const filtered=TMO.view!=='all'||TMO.q,shown=filtered?L:L.slice(0,TMO.limit);
  const seg=(attr,cur,opts)=>opts.map(([v,l])=>`<button type="button" data-${attr}="${v}" aria-pressed="${v===cur}">${l}</button>`).join('');
  const rows=shown.map(o=>{
    const tierRow=!filtered&&o.tierStart?`<tr class="tmo-tier"><td colspan="8">Tier ${o.tier}</td></tr>`:'';
    const open=TMO.open===o.id;
    return tierRow+`<tr class="tmo-row${open?' open':''}" data-tmo-row="${o.id}" tabindex="0" aria-expanded="${open}">
      <td class="r tmo-rkc">${o.rank}</td>
      <td>${tmoName(o)}${o.tag?`<span class="tmo-tag ${o.tag}">${o.tag==='sleeper'?'Sleeper':'Bust'}</span>`:''}</td>
      <td class="tmo-sc"><span class="tmo-bar"><i style="width:${Math.max(4,o.score).toFixed(1)}%"></i></span><b>${o.score.toFixed(1)}</b></td>
      <td class="r">${tmoDiff(o.diff)}</td>
      <td class="r num">${o.cRank}</td>
      <td class="r num">${o.mRank}</td>
      <td class="c"><span class="tmo-grade g-${o.grade[0]}">${o.grade}</span></td>
      <td class="r num">${o.g?o.ppg.toFixed(1):'—'}</td></tr>`+
      (open?`<tr class="tmo-why"><td colspan="8">${tmoWhy(o,pro)}</td></tr>`:'');
  }).join('');
  el.innerHTML=`
  <div class="hero tmo-rank-hero">
    <div><div class="kicker">Offseason · ${tmoUpdated()}</div><h1>TradeMetric Rankings</h1>
    <p>Half-PPR redraft. Ranked by TM Score, our blend of expert consensus, the market and TradeMetric's opportunity model. Select a player to see why.</p></div>
  </div>
  <div class="tmo-toolbar">
    <div class="seg" role="group" aria-label="Position">${seg('tmo-pos',TMO.pos,[['ALL','All'],['QB','QB'],['RB','RB'],['WR','WR'],['TE','TE']])}</div>
    <div class="seg" role="group" aria-label="Show">${seg('tmo-view',TMO.view,[['all','Everyone'],['sleeper','Sleepers'],['bust','Busts']])}</div>
    <input type="search" id="tmo-q" placeholder="Search players or teams" value="${esc(TMO.q)}" aria-label="Search players or teams">
  </div>
  <div class="tablebox tmo-table"><table>
    <thead><tr><th class="r">#</th><th>Player</th><th title="TradeMetric Score, 0 to 100">TM Score</th><th class="r" title="How many spots higher (▲) or lower (▼) we rank him than the market">vs Market</th><th class="r" title="Expert consensus rank">Experts</th><th class="r" title="Market rank (average draft position)">Market</th><th class="c" title="Opportunity grade at his position: volume, role, age, depth chart and offense">Opp.</th><th class="r" title="Half-PPR points per game this season">2026 Pts/G</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="8" class="note" style="padding:24px">No players match.</td></tr>'}</tbody></table></div>
  ${!filtered&&L.length>shown.length?`<div class="rank-more"><button class="btn" type="button" data-tmo-more>Show ${Math.min(50,L.length-shown.length)} more</button></div>`:''}
  <p class="note tmo-foot">TM Score = ${tmoPctW(TMO_W.cons)} expert consensus + ${tmoPctW(TMO_W.adp)} market + ${tmoPctW(TMO_W.tm)} TradeMetric opportunity. Tiers break where the score drops off the most. Ages are for next season.</p>`;
}
function tmoWhy(o,pro){
  const bar=(l,v,c)=>`<div class="tmo-wb"><span>${l}</span><span class="tmo-bar ${c}"><i style="width:${Math.max(3,v).toFixed(0)}%"></i></span><b>${v.toFixed(0)}</b></div>`;
  const f=(l,v)=>`<li><span>${l}</span><b>${v}</b></li>`,pct=x=>x==null?'—':Math.round(x*100)+'th pct';
  const inner=`<div class="tmo-why-in">
    <div class="tmo-why-col"><h4>Score parts</h4>${bar('Experts ('+tmoPctW(TMO_W.cons)+')',o.sCons,'c')}${bar('Market ('+tmoPctW(TMO_W.adp)+')',o.sAdp,'m')}${bar('TradeMetric ('+tmoPctW(TMO_W.tm)+')',o.sTm,'t')}</div>
    <div class="tmo-why-col"><h4>Opportunity model</h4><ul class="tmo-facts">
      ${f('Expected points / game',o.xfpg!=null?o.xfpg.toFixed(1)+' · '+pct(o.xfpgP):'—')}
      ${o.pos!=='QB'?f('Weighted opportunity (WOPR)',o.wopr!=null?o.wopr.toFixed(2)+' · '+pct(o.woprP):'—'):''}
      ${f('Points over expected',o.fpoeg!=null?(o.fpoeg>0?'+':'')+o.fpoeg.toFixed(1)+'/g':'—')}
      ${f('Age next season',o.age1!=null?Math.floor(o.age1)+(o.ageF>=1?' · prime':o.age1<TMO_PEAK[o.pos][0]?' · rising':' · past peak'):'—')}
      ${f('Depth chart',o.dep?o.pos+o.dep:'—')}
      ${f('Offense',pct(o.offP))}</ul></div></div>`;
  return pro?inner:`<div class="tmo-locked"><div class="tmo-blur" aria-hidden="true">${inner}</div><div class="tmo-unlock">${TMO_LOCK}<b>See why we rank ${esc(o.n.split(' ').slice(-1)[0])} #${o.rank}</b><span>${TMO_BETA_PRO?'Sign in to see the full TM Score breakdown. Pro is free during the beta.':'The full TM Score breakdown is part of TradeMetric Pro.'}</span><a class="btn accent small" href="${tmoSignedIn()?'#account':'#signin'}">${TMO_BETA_PRO?'Sign in free':'Get Pro'}</a></div></div>`;
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const t=e.target;
  if(t.closest('#mode-pill')){tmoSetMode(tmoMode()==='off'?'in':'off');return}
  const v=t.closest('[data-tmo-view]');if(v){TMO.view=v.dataset.tmoView;TMO.open=null;if(document.body.dataset.tab==='tmrank'){e.preventDefault();renderTmRank()}return}
  const p=t.closest('[data-tmo-pos]');if(p){TMO.pos=p.dataset.tmoPos;TMO.open=null;TMO.limit=100;renderTmRank();return}
  if(t.closest('[data-tmo-more]')){TMO.limit+=50;renderTmRank();return}
  if(t.closest('[data-tmo-pro]')){try{localStorage.setItem(TMO_PRO_KEY,tmoIsPro()?'0':'1')}catch(x){}render();return}
  const g=t.closest('[data-tmo-go]');if(g){TMO.open=g.dataset.tmoGo;TMO.view='all';TMO.pos='ALL';TMO.q='';const o=tmoRows().find(r=>r.id===TMO.open);if(o&&o.rank>TMO.limit)TMO.limit=Math.ceil(o.rank/50)*50;
    setTimeout(()=>{const r=document.querySelector(`[data-tmo-row="${TMO.open}"]`);if(r)r.scrollIntoView({block:'center'})},60);return}
  const row=t.closest('[data-tmo-row]');if(row&&!t.closest('a,button')){TMO.open=TMO.open===row.dataset.tmoRow?null:row.dataset.tmoRow;renderTmRank();return}
});
document.addEventListener('keydown',e=>{const row=e.target.closest&&e.target.closest('[data-tmo-row]');if(row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();row.click()}});
document.addEventListener('input',e=>{if(e.target.id!=='tmo-q')return;TMO.q=e.target.value;const pos=e.target.selectionStart;renderTmRank();const q=document.getElementById('tmo-q');q.focus();q.setSelectionRange(pos,pos)});

/* ---------- start ---------- */
fetch('data/market.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(d=>{if(d){TMO.market=d;TMO.rows=null;if(['home','tmrank'].includes(document.body.dataset.tab))render()}}).catch(()=>{});
tmoApplyMode();
