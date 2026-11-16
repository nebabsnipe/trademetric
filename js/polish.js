/* Motion polish, layered on top of app.js without changing its logic:
   1. sliding highlight on segmented controls (.seg) and the Trade builder / Trade ideas tabs (.tr-tabs)
   2. table rows glide to their new place when a table re-sorts or the rankings re-filter
   3. key numbers (My Team tiles, matchup score and win chance, projected total) roll to their new value
   5. alert and news lists stagger in one item after another (Magic UI "Animated List")
   6. confetti when a banner says the week is clinched (Magic UI "Confetti")
   7. the toast gets an icon and slides up instead of just appearing (cnippet "Toast")
   Everything is skipped when the device asks for reduced motion. */
(function(){
  const RM=matchMedia('(prefers-reduced-motion: reduce)');
  const still=()=>RM.matches;

  /* ---------- 1. sliding segment highlight ---------- */
  function placeThumb(seg){
    const under=seg.classList.contains('tr-tabs');
    let th=seg.querySelector(':scope > .seg-thumb');
    if(!th){th=document.createElement('i');th.className='seg-thumb'+(under?' under':'');th.setAttribute('aria-hidden','true');seg.prepend(th);seg.classList.add('has-thumb');if(ro)ro.observe(seg)}
    const on=seg.querySelector(':scope > button[aria-pressed="true"]');
    if(!on||!seg.offsetWidth){th.style.opacity='0';return}
    const first=th.dataset.x===undefined;
    if(first||still())th.classList.add('jump');
    th.style.opacity='1';th.style.width=on.offsetWidth+'px';th.style.transform=`translateX(${on.offsetLeft}px)`;
    if(!under){th.style.height=on.offsetHeight+'px';th.style.top=on.offsetTop+'px'}
    th.dataset.x=on.offsetLeft;
    if(first||still())setTimeout(()=>th.classList.remove('jump'),60);
  }
  const segAll=()=>document.querySelectorAll('.seg, .tr-tabs').forEach(placeThumb);

  /* ---------- 3. rolling numbers ---------- */
  const ROLL=['#team-tiles .tile .val','.mu-head .num','.mu-pct','#lineup-total'];
  const last=new Map(),busy=new WeakSet();
  const NUM=/^(\D*?)(-?\d[\d,]*\.?\d*)(.*)$/s;
  const parse=t=>{const m=NUM.exec(t.trim());if(!m)return null;const s=m[2],d=(s.split('.')[1]||'').length;return {pre:m[1],v:parseFloat(s.replace(/,/g,'')),d,suf:m[3]}};
  function roll(el,from,to){
    /* only plain text values; leave anything with markup inside alone */
    if(el.children.length)return;
    busy.add(el);const t0=performance.now(),dur=520,up=to.v>from.v;
    el.classList.remove('roll-up','roll-down');void el.offsetWidth;el.classList.add(up?'roll-up':'roll-down');
    const fmt=v=>to.pre+v.toFixed(to.d)+to.suf;
    const step=now=>{const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);
      if(!busy.has(el))return;
      if(!el.isConnected){busy.delete(el);return}
      el.textContent=k<1?fmt(from.v+(to.v-from.v)*e):fmt(to.v);
      if(k<1)requestAnimationFrame(step);else busy.delete(el)};
    requestAnimationFrame(step);
    /* backstop: background tabs pause animation frames, so always land on the real value */
    setTimeout(()=>{if(busy.has(el)){busy.delete(el);if(el.isConnected)el.textContent=fmt(to.v)}},dur+150);
  }
  function rollAll(){
    ROLL.forEach(sel=>document.querySelectorAll(sel).forEach((el,i)=>{
      if(busy.has(el))return;const key=sel+'#'+i,now=parse(el.textContent),was=last.get(key);
      if(!now){last.delete(key);return}
      last.set(key,now);
      if(was&&!still()&&was.v!==now.v&&was.pre===now.pre&&was.suf===now.suf&&el.offsetParent)roll(el,was,now);
    }));
  }


  /* ---------- 5. lists stagger in ---------- */
  let lastTab=null,feedDone=false,popOpen=false;
  const stagger=items=>items.forEach((el,i)=>{if(el.classList.contains('lst-in'))return;el.style.setProperty('--i',Math.min(i,14));el.classList.add('lst-in')});
  function staggerAll(){
    const t=document.body.dataset.tab;if(t!==lastTab){lastTab=t;feedDone=false}
    /* alerts: only when the popup opens, not on every live refresh while it is open */
    const pop=document.getElementById('alert-pop'),open=!!pop&&!pop.hidden;
    if(open&&!popOpen)stagger(pop.querySelectorAll('.al-i'));popOpen=open;
    /* news: the first paint after switching to the tab */
    const feed=document.getElementById('tmn-feed');
    if(t==='news'&&feed&&!feedDone){const it=feed.querySelectorAll('.tmn-ev');if(it.length){stagger(it);feedDone=true}}
  }

  /* ---------- 6. confetti for a clinched week ---------- */
  function confetti(x,y){
    if(still())return;
    const cv=document.createElement('canvas');cv.className='conf-cv';const dpr=Math.min(2,devicePixelRatio||1);
    cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;document.body.appendChild(cv);const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);
    const cols=['#FF4F12','#FFC23D','#FFE07A','#FFFFFF','#22A35A','#3A6FE0'],P=[];
    for(let i=0;i<140;i++){const a=-Math.PI/2+(Math.random()-.5)*Math.PI*.9,s=7+Math.random()*9;
      P.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,w:6+Math.random()*5,h:4+Math.random()*4,r:Math.random()*Math.PI,vr:(Math.random()-.5)*.3,c:cols[i%cols.length],t:0,life:150+Math.random()*60,wob:Math.random()*Math.PI*2})}
    const t0=performance.now();
    const step=()=>{ctx.clearRect(0,0,innerWidth,innerHeight);let alive=0;
      P.forEach(p=>{if(p.t>p.life)return;alive++;p.t++;p.vx*=.96;p.vy=p.vy*.96+.32;p.x+=p.vx+Math.sin(p.wob+p.t*.08)*.6;p.y+=p.vy;p.r+=p.vr;
        ctx.save();ctx.globalAlpha=Math.max(0,1-p.t/p.life);ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=p.c;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore()});
      if(alive&&performance.now()-t0<4000)requestAnimationFrame(step);else cv.remove()};
    requestAnimationFrame(step);
  }
  window.tmConfetti=confetti;
  function confettiAll(){document.querySelectorAll('.tmn-ban.clinch.in:not(.conf-done)').forEach(b=>{b.classList.add('conf-done');const r=b.getBoundingClientRect();confetti(r.left+r.width/2,r.top+r.height/2)})}

  /* one debounced pass after any change to the page */
  let queued=false;
  const pass=()=>{queued=false;segAll();rollAll();staggerAll();confettiAll()};
  const run=()=>{if(queued)pass()};
  /* animation frames pause in background tabs, so a timer backs the frame up */
  const queue=()=>{if(!queued){queued=true;requestAnimationFrame(run);setTimeout(run,120)}};
  /* a control that was hidden (another tab) gets its highlight placed the moment it shows */
  const ro=typeof ResizeObserver==='function'?new ResizeObserver(()=>queue()):null;
  new MutationObserver(ms=>{
    /* ignore our own number ticks */
    if(ms.every(m=>busy.has(m.target)||busy.has(m.target.parentNode)))return;
    queue()}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-pressed','hidden','class']});
  addEventListener('resize',queue);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(queue);
  pass();

  /* ---------- 2. rows glide when a table re-sorts ---------- */
  const rowKey=r=>{const b=r.querySelector('[data-open]');return b?b.dataset.open:null};
  function snap(tb,byKey){const m=new Map();if(!tb)return m;
    [...tb.rows].forEach(r=>{const k=byKey?rowKey(r):r;if(k!=null)m.set(k,r.getBoundingClientRect().top)});return m}
  function glide(tb,before,byKey){
    if(!tb||still()||!before.size||tb.rows.length>400)return;
    const vh=innerHeight;
    [...tb.rows].forEach(r=>{const k=byKey?rowKey(r):r;if(k==null||!before.has(k))return;
      const y=r.getBoundingClientRect().top,old=before.get(k);
      /* only rows that end up or started on screen; clamp long jumps so nothing flies across the page */
      if((y<-60||y>vh+60)&&(old<-60||old>vh+60))return;
      let dy=old-y;if(!dy)return;dy=Math.max(-vh*.6,Math.min(vh*.6,dy));
      r.animate([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});
    });
  }
  let inRender=false;
  if(typeof window.sortTable==='function'){
    const orig=window.sortTable;
    window.sortTable=function(id){
      const tbl=document.getElementById(id),tb=tbl&&tbl.tBodies[0];
      if(inRender||!tb)return orig.apply(this,arguments);
      const b=snap(tb,false),r=orig.apply(this,arguments);glide(tb,b,false);return r};
  }
  if(typeof window.renderRankings==='function'){
    const orig=window.renderRankings;
    window.renderRankings=function(){
      const tb=document.getElementById('rank-body'),b=snap(tb,true);inRender=true;
      try{return orig.apply(this,arguments)}finally{inRender=false;glide(document.getElementById('rank-body'),b,true)}};
  }
  /* ---------- 7. toast with an icon and a slide-up ---------- */
  const T_CHECK='<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const T_BANG='<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M12 6v7M12 17.5v.5"/></svg>';
  let tT,tHide;
  window.toast=function(m){const t=document.getElementById('toast');if(!t)return;clearTimeout(tT);clearTimeout(tHide);
    const warn=/^(type |paste |no |nothing|couldn|can't|could not|.* is already )/i.test(m);
    t.innerHTML=`<span class="toast-ic${warn?' warn':''}">${warn?T_BANG:T_CHECK}</span><span></span>`;t.lastChild.textContent=m;
    /* a toast that is already up just swaps its text; a fresh one slides in */
    if(t.hidden||t.classList.contains('out')){t.classList.remove('in','out');t.hidden=false;void t.offsetWidth;t.classList.add('in')}
    tT=setTimeout(()=>{t.classList.add('out');tHide=setTimeout(()=>{t.hidden=true;t.classList.remove('in','out')},220)},2400)};
})();
