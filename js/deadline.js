/* ===== Trade deadline notifications =====
   Loaded after app.js. Two kinds:
   - Your fantasy leagues' trade deadlines (loud): a pop-up banner and a bell alert at about a week out, about three
     days out, and a final one in the last 24 hours. The final one is a special banner with a live countdown, and it
     stays in the corner (and on the Trades tab) until the deadline passes or you close it.
   - The real NFL trade deadline (quiet): two bell alerts only, about a week before and on the day.
   Deadlines come from the league itself: ESPN gives an exact date and time; Sleeper gives a week, and the deadline
   is when the last game of that week ends (Monday night). Banners follow the per-league switches in Account → Leagues. */

/* NFL trade deadline per season: 4:00 pm Eastern (Tue Nov 10, 2026 is after daylight saving ends, so 21:00 UTC) */
const TDL_NFL={2026:Date.UTC(2026,10,10,21,0)};
const TDL_H=36e5,TDL_D=864e5;
let TDL={timer:null,tick:null};

/* when the last game of the current NFL week kicks off, from this week's kickoff list */
function tdlWeekEnd(w){if(typeof KICK==='undefined'||typeof DATA==='undefined'||typeof etMs!=='function')return null;
  let last=0;Object.values(KICK).forEach(k=>{if(!k||!k[1]||!k[2])return;const t=etMs(k[1],k[2]);if(!isNaN(t)&&t>last)last=t});
  if(!last)return null;return last+3.5*TDL_H+7*TDL_D*(w-DATA.week)}
function tdlAt(lg){const d=lg&&lg.tdl;if(!d)return null;if(d.at)return +d.at||null;if(d.wk)return tdlWeekEnd(d.wk);return null}
/* every saved league with a deadline still ahead (or just passed) */
function tdlLeagues(){if(!S)return [];const L=S.leagues&&S.leagues.length?S.leagues:[{key:S.leagueKey,name:S.league&&S.league.name}],out=[];
  L.forEach(e=>{const cur=e.key===S.leagueKey,lg=cur?S.league:e.snap&&e.snap.league;if(!lg)return;const at=tdlAt(lg);if(!at)return;
    out.push({key:e.key||'cur',name:(cur&&S.league.name)||e.name||lg.name||'League',at,wk:lg.tdl.wk||null})});
  return out.sort((a,b)=>a.at-b.at)}
/* which notice a league is due: about a week out, about 3 days out, the last 24 hours */
function tdlStage(left){if(left<=0)return null;if(left<=TDL_D)return 'final';if(left<=3*TDL_D)return 'd3';if(left<=7*TDL_D)return 'wk';return null}
function tdlLeft(ms,long){if(ms<=0)return 'closed';const d=Math.floor(ms/TDL_D),h=Math.floor(ms%TDL_D/TDL_H),m=Math.floor(ms%TDL_H/6e4);
  if(long)return d?`${d} day${d===1?'':'s'}${h?`, ${h} hr${h===1?'':'s'}`:''}`:h?`${h} hr${h===1?'':'s'} ${m} min`:`${m} min`;
  return d?`${d}d ${h}h`:h?`${h}h ${m}m`:`${m}m`}
function tdlClock(ms){ms=Math.max(0,ms);const h=Math.floor(ms/TDL_H),m=Math.floor(ms%TDL_H/6e4),s=Math.floor(ms%6e4/1e3),p=n=>String(n).padStart(2,'0');return `${p(h)}:${p(m)}:${p(s)}`}
function tdlWhen(x){const d=new Date(x.at),day=d.toLocaleDateString([], {weekday:'long',month:'short',day:'numeric'});
  return x.wk?`${day}, after the last Week ${x.wk} game`:`${day} at ${d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`}
function tdlKey(x,st){return `tdl:${x.key}:${Math.round(x.at/6e4)}:${st}`}
function tdlHead(st,x,left){if(st==='final')return left<=6*TDL_H?'Last chance to trade':'Final day to make a trade';
  const wd=new Date(x.at).toLocaleDateString([], {weekday:'long'});return st==='d3'?(left<=2*TDL_D?`Trade deadline is ${wd}`:`Trade deadline this ${wd}`):`Trade deadline in ${Math.round(left/TDL_D)} days`}

/* ---------- the bell ---------- */
function tdlAlerts(){const now=Date.now(),out=[];
  tdlLeagues().forEach(x=>{const left=x.at-now,st=tdlStage(left);if(!st)return;
    out.push({k:tdlKey(x,st),lvl:st==='final'?'tdl final':'tdl',t:`${tdlHead(st,x,left)}: ${x.name}`,
      d:st==='final'?`Closes in ${tdlLeft(left,true)}. Any deal you want has to be accepted before then.`:`Deadline ${tdlWhen(x)}. Line up the deals you want now.`,go:'trade'})});
  const nfl=TDL_NFL[typeof SEASON!=='undefined'?SEASON:new Date().getFullYear()];
  if(nfl){const left=nfl-now,when=new Date(nfl).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
    if(left>0&&left<=20*TDL_H)out.push({k:`tdlnfl:${nfl}:day`,lvl:'info',t:'NFL trade deadline is today',d:`Teams can trade until ${when} your time. We'll flag any of your players who change teams.`,open:''});
    else if(left>20*TDL_H&&left<=7*TDL_D)out.push({k:`tdlnfl:${nfl}:wk`,lvl:'info',t:`NFL trade deadline: ${new Date(nfl).toLocaleDateString([], {weekday:'long',month:'short',day:'numeric'})}`,d:'Real teams can trade players until then. A traded player\'s role and schedule can change, so watch your roster.',open:''})}
  return out}

/* ---------- banners (loud ones for your leagues) ---------- */
function tdlSeen(){const s=typeof acctGet==='function'?acctGet('tdl',null):null;return s&&typeof s==='object'&&!Array.isArray(s)?{pop:[...(s.pop||[])],dis:[...(s.dis||[])]}:{pop:[],dis:[]}}
function tdlSave(s){if(typeof acctSet==='function')acctSet('tdl',{pop:s.pop.slice(-60),dis:s.dis.slice(-60)})}
function tdlEv(x,st){const left=x.at-Date.now();
  return {k:tdlKey(x,st),type:'tdl',cls:st==='final'?'tdlfinal':'tdl',stage:st,lkey:x.key,dl:x.at,at:Date.now(),name:x.name,
    head:tdlHead(st,x,left),sub:`${x.name} · ${tdlWhen(x)}`,leagues:[{key:x.key,name:x.name}]}}
TDL.items=[];
function tdlTick(){try{if(typeof USER!=='undefined'&&!USER)return;if(typeof tmIsPro==='function'&&!tmIsPro())return;if(typeof TMN==='undefined'||typeof tmnPump!=='function')return;
  const now=Date.now(),s=tdlSeen();let ch=false;TDL.items=[];
  tdlLeagues().forEach(x=>{const st=tdlStage(x.at-now);if(!st)return;const ev=tdlEv(x,st);TDL.items.push(ev);
    const on=typeof tmnOn!=='function'||tmnOn(x.key);if(!on)return;
    if(!s.pop.includes(ev.k)){s.pop.push(ev.k);ch=true;if(!TMN.queue.some(q=>q.k===ev.k)&&!(TMN.showing&&TMN.showing.k===ev.k))TMN.queue.push(ev)}
    /* the final one stays in the corner until the deadline, unless you close it */
    else if(st==='final'&&!s.dis.includes(ev.k)&&!TMN.chips.some(c=>c.k===ev.k)&&!(TMN.showing&&TMN.showing.k===ev.k)&&!TMN.queue.some(q=>q.k===ev.k))tmnChip(ev)});
  /* chips for deadlines that have passed go away */
  const live=new Set(TDL.items.map(e=>e.k)),n0=TMN.chips.length;TMN.chips=TMN.chips.filter(c=>!String(c.k).startsWith('tdl:')||live.has(c.k));if(TMN.chips.length!==n0)tmnPaintChips();
  if(ch){tdlSave(s);tmnPump();if(typeof renderAlerts==='function')renderAlerts()}
  if(typeof tab!=='undefined'&&tab==='trade')tdlTrade()}catch(e){console.warn('deadline tick',e)}}
function tdlDismiss(k){const s=tdlSeen();if(!s.dis.includes(k)){s.dis.push(k);tdlSave(s)}}
function tdlFind(k){return TDL.items.find(e=>e.k===k)}
/* banner body: a clock seal, the headline, the league; the final one adds a big live countdown and a button */
function tdlBody(ev,big){const left=ev.dl-Date.now(),fin=ev.stage==='final';
  return `<div class="tmn-b-av"><span class="tdl-seal${fin?' fin':''}" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M9 2h6"/><path class="tdl-hand" d="M12 13V8.5"/></svg></span></div>
    <div class="tmn-b-main"><span class="tmn-lbl ${fin?'tdl-lbl':'warn'}">${fin?'Final call · Trade deadline':'Trade deadline'}</span><h3>${esc(ev.head)}</h3><p>${esc(ev.sub)}</p></div>
    ${fin?`<div class="tmn-b-pts tdl-cd"><b class="num" data-tdl-cd="${ev.dl}">${tdlClock(left)}</b><small>left</small></div>`:`<div class="tmn-b-pts"><b class="num">${esc(tdlLeft(left))}</b><small>left</small></div>`}
    ${fin&&big?`<div class="tdl-go-row"><a class="tdl-go" href="#trade" data-tdl-go="1">Build a trade <span aria-hidden="true">→</span></a></div>`:''}`}
function tdlChipTxt(ev){return ev.stage==='final'?`<b class="num" data-tdl-cd="${ev.dl}" data-short="1">${tdlLeft(ev.dl-Date.now())}</b>`:`<b>Deadline</b>`}

/* ---------- Trades tab: a slim line within a week, a live countdown in the last 24 hours ---------- */
function tdlTrade(){const el=document.getElementById('tr-dl');if(!el)return;const x=S&&S.leagueKey?tdlLeagues().find(y=>y.key===S.leagueKey):null,left=x?x.at-Date.now():0,st=x&&tdlStage(left);
  if(!st){el.hidden=true;el.innerHTML='';return}el.hidden=false;
  const html=st==='final'?`<div class="tdl-bar fin" role="status"><span class="tdl-seal fin" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M9 2h6"/><path class="tdl-hand" d="M12 13V8.5"/></svg></span><span class="tdl-t"><b>Trade deadline today</b><span>${esc(tdlWhen(x))}</span></span><b class="num tdl-big" data-tdl-cd="${x.at}">${tdlClock(left)}</b></div>`
    :`<div class="tdl-bar" role="status"><span class="tdl-dot" aria-hidden="true"></span><span class="tdl-t"><b>Trade deadline in ${esc(tdlLeft(left,true))}</b><span>${esc(tdlWhen(x))}</span></span></div>`;
  if(el.dataset.h!==html.replace(/data-tdl-cd="\d+">[^<]*/,'')){el.dataset.h=html.replace(/data-tdl-cd="\d+">[^<]*/,'');el.innerHTML=html}}

/* every second: countdowns on screen tick; once a minute: check for new notices */
function tdlSecond(){document.querySelectorAll('[data-tdl-cd]').forEach(b=>{const left=+b.dataset.tdlCd-Date.now();b.textContent=b.dataset.short?tdlLeft(left):tdlClock(left)})}
document.addEventListener('click',e=>{const g=e.target.closest&&e.target.closest('[data-tdl-go]');if(!g)return;e.preventDefault();e.stopPropagation();
  if(TMN.showing&&TMN.showing.type==='tdl')tmnMin(false);location.hash='trade'},true);
TDL.tick=setInterval(tdlSecond,1000);
TDL.timer=setInterval(tdlTick,60e3);
setTimeout(tdlTick,2500);
