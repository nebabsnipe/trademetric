/* Phone layout helpers (700px and under): bottom tab bar icons, the "More" sheet, section jump chips on long pages,
   and the trade bar. Styles are in the "Phone layout" block at the end of css/styles.css. Loaded after app.js. */
(function(){
  const mq=matchMedia('(max-width:700px)');
  const svg=d=>`<svg class="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC={
    team:'<path d="M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    news:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    rankings:'<path d="M5 20V11M12 20V4M19 20v-6"/>',
    trade:'<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
    more:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    season:'<path d="M3 17l5-5 4 3 8-9"/><path d="M15 6h5v5"/>',
    hub:'<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4a4 4 0 0 0 4 4M16 6h4a4 4 0 0 1-4 4M12 13v4M8 20h8"/>',
    draft:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    account:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 1 1 3.6 2.4c-.7.4-1.1 1-1.1 1.800M12 17h.01"/>',
    theme:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'
  };
  const nav=document.querySelector('.nav');if(!nav)return;

  // Tab bar: icons on the four main tabs, plus More
  nav.querySelectorAll('button[data-tab]').forEach(b=>{if(IC[b.dataset.tab]&&!b.querySelector('.nav-ic'))b.insertAdjacentHTML('afterbegin',svg(IC[b.dataset.tab]))});
  const more=document.createElement('button');more.type='button';more.className='nav-more';more.setAttribute('aria-haspopup','dialog');more.setAttribute('aria-expanded','false');
  more.innerHTML=svg(IC.more)+'More';nav.appendChild(more);

  // More sheet
  const scrim=document.createElement('div');scrim.className='m-sheet-scrim';
  const sheet=document.createElement('div');sheet.className='m-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-label','More');
  const LINKS=[['season','Season Sim'],['hub','League'],['draft','Draft'],['account','Account'],['help','How it works']];
  sheet.innerHTML=LINKS.map(([t,l])=>`<a href="#${t}" data-m="${t}">${svg(IC[t])}${l}</a>`).join('')+`<button type="button" data-m="theme">${svg(IC.theme)}Dark mode<small></small></button>`;
  document.body.append(scrim,sheet);
  const isDark=()=>{const t=document.documentElement.getAttribute('data-theme');return t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches};
  function setMore(on){
    document.body.classList.toggle('m-more',on);more.setAttribute('aria-expanded',on);
    if(on){const cur=document.body.dataset.tab;sheet.querySelectorAll('a').forEach(a=>{if(a.dataset.m===cur||(cur==='league'&&a.dataset.m==='hub'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
      sheet.querySelector('small').textContent=isDark()?'On':'Off'}
  }
  more.addEventListener('click',()=>setMore(!document.body.classList.contains('m-more')));
  scrim.addEventListener('click',()=>setMore(false));
  sheet.addEventListener('click',e=>{const x=e.target.closest('[data-m]');if(!x)return;
    if(x.dataset.m==='theme'){const t=document.getElementById('theme-btn');if(t)t.click();sheet.querySelector('small').textContent=isDark()?'On':'Off';return}
    setMore(false)});
  window.addEventListener('hashchange',()=>setMore(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setMore(false)});
  // Tapping the tab you're already on goes back to the top
  nav.addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(b&&mq.matches&&b.getAttribute('aria-current')==='page')window.scrollTo({top:0,behavior:'smooth'})},true);

  // Section jump chips on long pages
  const RAIL=new Set(['v-team','v-season','v-hub','v-draft']);
  let rail=null,cards=[],tick=0;
  const head=c=>{const h=c.querySelector('h2,h3');return h?h.textContent.replace(/\s+/g,' ').trim():''};
  const offset=()=>{const tb=document.querySelector('.topbar');return (tb?tb.getBoundingClientRect().bottom:50)+(rail?rail.offsetHeight:44)+6};
  function buildRail(){
    const v=mq.matches&&!document.body.classList.contains('signed-out')?document.querySelector('main .view:not([hidden])'):null;
    let list=[];
    if(v&&RAIL.has(v.id))list=[...v.querySelectorAll('.card')].filter(c=>!c.parentElement.closest('.card')&&c.offsetParent&&head(c))
      .map(c=>({c,t:head(c),y:c.getBoundingClientRect().top})).sort((a,b)=>a.y-b.y);
    if(list.length<3){if(rail){rail.remove();rail=null}cards=[];return}
    const sig=v.id+'|'+list.map(x=>x.t).join('|');cards=list.map(x=>x.c);
    if(rail&&rail.dataset.sig===sig&&rail.parentNode===v)return;
    if(!rail){rail=document.createElement('div');rail.className='m-rail';rail.setAttribute('role','navigation');rail.setAttribute('aria-label','Jump to a section');
      rail.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const c=cards[+b.dataset.i];if(c)window.scrollTo({top:c.getBoundingClientRect().top+scrollY-offset(),behavior:'smooth'})})}
    rail.dataset.sig=sig;
    rail.innerHTML=list.map((x,i)=>`<button type="button" data-i="${i}">${x.t.length>24?x.t.slice(0,23).replace(/</g,'&lt;')+'…':x.t.replace(/</g,'&lt;')}</button>`).join('');
    const hero=v.querySelector(':scope>.hero');if(hero)hero.after(rail);else v.prepend(rail);
    mark();
  }
  function mark(){
    if(!rail||!cards.length)return;const o=offset()+14;let cur=0;
    cards.forEach((c,i)=>{if(c.getBoundingClientRect().top<=o)cur=i});
    if(innerHeight+scrollY>=document.documentElement.scrollHeight-4)cur=cards.length-1;
    const bs=rail.children;if(bs[cur]&&bs[cur].getAttribute('aria-current')==='true')return;
    [...bs].forEach((b,i)=>{if(i===cur)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current')});
    const b=bs[cur];if(b)rail.scrollTo({left:b.offsetLeft-rail.clientWidth/2+b.offsetWidth/2,behavior:'smooth'});
  }
  let deb=0;const queue=()=>{clearTimeout(deb);deb=setTimeout(()=>{buildRail();tradeBar();rankCap()},200)};
  const main=document.querySelector('main');
  if(main)new MutationObserver(queue).observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  new MutationObserver(queue).observe(document.body,{attributes:true,attributeFilter:['class','data-tab']});
  mq.addEventListener('change',queue);
  window.addEventListener('scroll',()=>{if(tick)return;tick=requestAnimationFrame(()=>{tick=0;mark();tradeBar()})},{passive:true});


  // Players list: 50 rows at a time so the page stays quick to scroll
  let rows=50;const rs=document.createElement('style');document.head.appendChild(rs);
  const moreRows=document.createElement('div');moreRows.className='m-more-rows';moreRows.innerHTML='<button type="button" class="btn">Show 50 more</button>';
  moreRows.firstChild.addEventListener('click',()=>{rows+=50;rankCap()});
  function rankCap(){
    const body=document.getElementById('rank-body'),box=body&&body.closest('.tablebox');if(!body||!box)return;
    rs.textContent=`@media (max-width:700px){#rank-body tr:nth-child(n+${rows+1}){display:none}}`;
    if(moreRows.previousElementSibling!==box)box.after(moreRows);
    moreRows.hidden=!mq.matches||body.children.length<=rows;
    const all=document.getElementById('rank-more');if(all)all.style.display=mq.matches&&body.children.length>rows?'none':'';
  }
  window.addEventListener('hashchange',()=>{rows=50});

  // Trade bar: shows what's on the table and jumps to the grade
  const bar=document.createElement('button');bar.type='button';bar.className='m-tradebar';document.body.appendChild(bar);
  const count=id=>{const t=document.getElementById(id);return t?[...t.children].filter(x=>!x.classList.contains('tb-empty')).length:0};
  function tradeBar(){
    const r=document.getElementById('rating'),b=document.getElementById('tr-build');
    const g=count('give-tray'),t=count('get-tray');
    let on=mq.matches&&document.body.dataset.tab==='trade'&&b&&!b.hidden&&g+t>0&&r&&!document.body.classList.contains('signed-out');
    if(on){const y=r.getBoundingClientRect();on=!(y.top<innerHeight-140&&y.bottom>120)}
    if(on)bar.innerHTML=`<span>Give ${g} · Get ${t}</span><b>${g&&t?'See the grade':'See the deal'}</b>`;
    bar.classList.toggle('on',!!on);
  }
  bar.addEventListener('click',()=>{const r=document.getElementById(count('give-tray')&&count('get-tray')?'rating':'give-tray');if(r)window.scrollTo({top:r.getBoundingClientRect().top+scrollY-70,behavior:'smooth'})});
  queue();
})();
