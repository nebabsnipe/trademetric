/* Motion polish, layered on top of app.js without changing its logic:
   1. sliding highlight on segmented controls (.seg) and the Trade builder / Trade ideas tabs (.tr-tabs)
   2. table rows glide to their new place when a table re-sorts or the rankings re-filter
   3. key numbers (My Team tiles, matchup score and win chance, projected total) roll to their new value
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

  /* one debounced pass after any change to the page */
  let queued=false;
  const pass=()=>{queued=false;segAll();rollAll()};
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
})();
