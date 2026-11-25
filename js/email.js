/* ===== Email: the "Email" card in Account -> Notifications, and asking for the welcome email after a first sign-in =====
   Loaded after app.js. One small switch per kind of update email, in three groups (every week, as it happens,
   offseason). All on by default except injuries. The switches are saved on the account (the email_prefs table, which
   each person can only read and change for themselves), not in the browser, so the unsubscribe link in an email
   and this card always agree. If anything here fails, the rest of the site is untouched. */
var EM={uid:null,prefs:null,loaded:false,loading:false,ok:true};
const EM_GROUPS=[
  ['Every week','One recap email after Monday night\'s game. Pick what goes in it.',[
    ['matchup','Matchup results','Your score and your opponent\'s'],
    ['perf','Standout games','When one of your players has a huge game'],
    ['top','#1 at his position','When your player outscores everyone at his position'],
    ['clips','Highlights','Video of your players\' biggest plays']]],
  ['As it happens','',[
    ['inj','Injuries','A morning note when one of your players is ruled out or put on injured reserve'],
    ['deadline','Trade deadline','One reminder a few days before your league\'s deadline'],
    ['clinch','Clinched a playoff spot','When your spot is mathematically locked'],
    ['champ','Won the championship','When your league\'s title game is final and you won it']]],
  ['Offseason','',[
    ['recap','Season recap is ready','Once, after your league\'s season ends',true],
    ['moves','Player moves','When a player from your team signs with or is traded to a new NFL team'],
    ['draft','Draft season reminder','One email in August, only if you haven\'t been here in a month']]]];
const EM_KEYS=EM_GROUPS.flatMap(g=>g[2].map(x=>x[0])),EM_DEFAULT={inj:false};
const emOn=k=>EM.prefs&&typeof EM.prefs[k]==='boolean'?EM.prefs[k]:EM_DEFAULT[k]!==false;
async function emLoad(){if(EM.loading||typeof USER==='undefined'||!USER||typeof SB==='undefined'||!SB)return;
  if(EM.loaded&&EM.uid===USER.id)return;EM.loading=true;const uid=USER.id;
  try{const {data,error}=await SB.from('email_prefs').select(EM_KEYS.join(',')).eq('user_id',uid).maybeSingle();
    if(!USER||USER.id!==uid)return;EM.uid=uid;EM.ok=!error;EM.prefs=error?null:(data||{});EM.loaded=true}
  catch(e){EM.uid=uid;EM.ok=false;EM.loaded=true}
  finally{EM.loading=false;emPaint()}}
function emPaint(){const el=document.getElementById('acc-email');if(el)el.outerHTML=emailHtml()}
async function emSet(k,on){if(!USER||!SB||!EM.ok)return;const was=EM.prefs||{};EM.prefs={...was,[k]:on};
  let error=null;try{const r=await SB.from('email_prefs').upsert({user_id:USER.id,[k]:on},{onConflict:'user_id'});error=r.error}catch(e){error=e}
  if(error){EM.prefs=was;emPaint();if(typeof toast==='function')toast('Couldn\'t save that. Try again.')}}
function emailHtml(){if(typeof USER==='undefined'||!USER)return '';
  if(!EM.loaded||EM.uid!==USER.id){EM.loaded=false;setTimeout(emLoad,0)}
  const dis=!EM.loaded||!EM.ok;
  const row=([k,t,n,soon])=>`<li><span class="acc-lg-t"><b>${t}${soon?' <span class="push-soon">Coming soon</span>':''}</b><span class="note">${n}</span></span><label class="tmn-sw sm"><input type="checkbox" data-email-type="${k}" ${emOn(k)?'checked':''} ${dis?'disabled':''}><i aria-hidden="true"></i><span class="sr">${t}</span></label></li>`;
  return `<section class="card acc-sec" id="acc-email"><header class="acc-sec-h"><h2>Email</h2><p>Updates about your leagues, by email. Switch off anything you don't want.</p></header>
    ${EM_GROUPS.map(([h,sub,items],i)=>`<h3 class="push-h${i?'':' em-first'}">${h}</h3>${sub?`<p class="note em-sub">${sub}</p>`:''}<ul class="tmn-nl push-types">${items.map(row).join('')}</ul>`).join('')}
    <p class="note tmn-nl-f">${EM.loaded&&!EM.ok?'Email settings aren\'t available on this copy of the site yet.':'Account emails, like sign-in codes or a league that stops updating, are always sent. Every email has a one-click unsubscribe link.'}</p></section>`}
document.addEventListener('change',e=>{const t=e.target,k=t&&t.dataset&&t.dataset.emailType;if(k)emSet(k,t.checked)});

/* The welcome email: asked for once, right after a new account's first sign-in. The server decides who it goes to
   from the sign-in itself and never sends it twice, so asking again (another device, a reload) is harmless. */
async function emailWelcome(user){try{if(!user||!user.id||typeof SB==='undefined'||!SB)return;
    if(!(user.email_confirmed_at||user.confirmed_at)||Date.now()-Date.parse(user.created_at)>14*864e5)return;
    const flag='tm-welcome-'+user.id;if(localStorage.getItem(flag))return;
    const {data}=await SB.auth.getSession(),tok=data&&data.session&&data.session.access_token;if(!tok)return;
    const r=await fetch('/api/email/welcome',{method:'POST',headers:{authorization:'Bearer '+tok},cache:'no-store'});
    if(r.ok)localStorage.setItem(flag,'1')}catch(e){}}
if(typeof USER!=='undefined'&&USER)setTimeout(()=>emailWelcome(USER),4000);
/* the Account page may already be on screen from before this file loaded */
if(document.getElementById('acc-push')&&!document.getElementById('acc-email')&&typeof renderAccount==='function'&&typeof ACC_EDIT!=='undefined'&&!ACC_EDIT)renderAccount();
