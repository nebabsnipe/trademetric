#!/usr/bin/env python3
"""Rebuild data/nfl.json from public sources.

Sources:
  - nflverse (weekly player stats, schedules + betting lines, injuries, rosters, snap counts)
  - FantasyPros weekly expert consensus rankings, via DynastyProcess

Run:  pip install pandas numpy && python scripts/update_data.py
The GitHub Action in .github/workflows/update-data.yml runs this every morning.
"""
import pandas as pd, numpy as np, json, re, sys, os, csv, datetime, urllib.request

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW=os.path.join(ROOT,'raw')+os.sep
OUT=os.path.join(ROOT,'data','nfl.json')
SEASON=int(os.environ.get('SEASON','2026'))
NV='https://github.com/nflverse/nflverse-data/releases/download/'
SOURCES={
  f'stats_player_week_{SEASON}.csv': NV+f'stats_player/stats_player_week_{SEASON}.csv',
  'games.csv':                        NV+'schedules/games.csv',
  f'injuries_{SEASON}.csv':           NV+f'injuries/injuries_{SEASON}.csv',
  f'roster_{SEASON}.csv':             NV+f'rosters/roster_{SEASON}.csv',
  f'snap_counts_{SEASON}.csv':        NV+f'snap_counts/snap_counts_{SEASON}.csv',
  'fp_latest_weekly.csv':             'https://raw.githubusercontent.com/dynastyprocess/data/master/files/fp_latest_weekly.csv',
}
os.makedirs(RAW,exist_ok=True)
for name,url in SOURCES.items():
    try:
        urllib.request.urlretrieve(url,RAW+name);print('downloaded',name,file=sys.stderr)
    except Exception as e:
        print('could not download',name,e,file=sys.stderr)
        if not os.path.exists(RAW+name) and name!='fp_latest_weekly.csv':sys.exit(1)
ECR_FILE=RAW+'fp_latest_weekly.csv' if os.path.exists(RAW+'fp_latest_weekly.csv') else None
PREV=json.load(open(OUT)) if os.path.exists(OUT) else {}

# ---------- players ----------
D=RAW
TM={'LA':'LAR'}
fix=lambda t:TM.get(t,t)
def norm(n): 
    n=str(n).lower().replace('.','').replace("'",'').replace('’','')
    n=re.sub(r'\b(jr|sr|ii|iii|iv|v)\b','',n);return re.sub(r'[^a-z ]',' ',n).split().__str__()
def slug(n): return re.sub(r'^-|-$','',re.sub(r'[^a-z0-9]+','-',n.lower()))
# preseason estimates from the page
pre={}
for k,name,team,nums in json.load(open(os.path.join(ROOT,'data','preseason.json')))['players']:
    z=dict(cmp=0,pyd=0,ptd=0,int=0,ratt=0,ryd=0,rtd=0,tgt=0,rec=0,recyd=0,rectd=0)
    if k=='Q': z.update(zip(['cmp','pyd','ptd','int','ratt','ryd','rtd'],nums))
    elif k=='R': z.update(zip(['ratt','ryd','rtd','tgt','rec','recyd','rectd'],nums))
    else: z.update(zip(['tgt','rec','recyd','rectd','ratt','ryd'],nums))
    pre[norm(name)]=z
print('preseason',len(pre),file=sys.stderr)

w=pd.read_csv(D+'stats_player_week_'+str(SEASON)+'.csv',low_memory=False)
w=w[(w.season_type=='REG')&w.position.isin(['QB','RB','WR','TE'])].copy()
# A week counts as played only when every game in it is final (Thursday games alone don't count)
_g=pd.read_csv(D+'games.csv',low_memory=False);_g=_g[(_g.season==SEASON)&(_g.game_type=='REG')]
_done={int(k):bool(v) for k,v in _g.groupby('week').home_score.apply(lambda x:x.notna().all()).items()}
PLAYED=0
while _done.get(PLAYED+1):PLAYED+=1
WEEK=PLAYED+1
w=w[w.week<=PLAYED].copy()
w['fl']=w[['sack_fumbles_lost','rushing_fumbles_lost','receiving_fumbles_lost']].fillna(0).sum(axis=1)
w['team']=w.team.map(fix);w['opponent_team']=w.opponent_team.map(fix)
ros=pd.read_csv(D+'roster_'+str(SEASON)+'.csv',low_memory=False);ros=ros[ros.week==ros.week.max()]
ros['team']=ros.team.map(fix)
inj=pd.read_csv(D+'injuries_'+str(SEASON)+'.csv',low_memory=False);IW=int(inj.week.max());inj=inj[inj.week==IW]
snap=pd.read_csv(D+'snap_counts_'+str(SEASON)+'.csv',low_memory=False);snap['team']=snap.team.map(fix)
snap['k']=snap.player.map(norm)
snapd={(r.k,r.team,int(r.week)):float(r.offense_pct) for r in snap.itertuples()}
g=pd.read_csv(D+'games.csv',low_memory=False);g=g[(g.season==SEASON)&(g.game_type=='REG')].copy()
g['home_team']=g.home_team.map(fix);g['away_team']=g.away_team.map(fix)
teams=sorted(set(g.home_team))
sched={t:[0]*18 for t in teams}
for r in g.itertuples():
    sched[r.home_team][r.week-1]=[r.away_team,1];sched[r.away_team][r.week-1]=[r.home_team,0]
bye={t:next(i+1 for i,x in enumerate(sched[t]) if x==0) for t in teams}
vegas={}
for r in g[g.week==WEEK].itertuples():
    if pd.notna(r.total_line):
        s=r.spread_line if pd.notna(r.spread_line) else 0
        vegas[r.home_team]=round(r.total_line/2+s/2,1);vegas[r.away_team]=round(r.total_line/2-s/2,1)
# defense vs position, PPR points allowed per game
w['ppr']=w.fantasy_points_ppr.fillna(0)
dv=w.groupby(['opponent_team','position','week']).ppr.sum().reset_index().groupby(['opponent_team','position']).ppr.mean().unstack()
DEF={}
for pos in ['QB','RB','WR','TE']:
    rk=dv[pos].rank(method='first').astype(int)
    for t,v in rk.items(): DEF.setdefault(t,{})[pos]=int(v)
# players
F=['cmp','pyd','ptd','int','ratt','ryd','rtd','tgt','rec','recyd','rectd','fl']
C={'cmp':'completions','pyd':'passing_yards','ptd':'passing_tds','int':'passing_interceptions','ratt':'carries','ryd':'rushing_yards','rtd':'rushing_tds','tgt':'targets','rec':'receptions','recyd':'receiving_yards','rectd':'receiving_tds','fl':'fl'}
agg=w.groupby('player_id').agg(name=('player_display_name','last'),pos=('position','last'),g=('week','nunique'),ppr=('ppr','sum')).reset_index()
keep=[]
for pos,n in [('QB',40),('RB',95),('WR',125),('TE',55)]:
    a=agg[agg.pos==pos].sort_values('ppr',ascending=False).head(n);keep+=list(a.player_id)
keepset=set(keep)
# preseason players missing from stats (injured all year) -> roster lookup
ros['k']=ros.full_name.map(norm)
statnames={norm(n) for n in agg[agg.player_id.isin(keepset)].name}
extra=[k for k in pre if k not in statnames]
rosk=ros.set_index('k')
out=[];FUMB={'QB':.2,'RB':.09,'WR':.04,'TE':.04}
injk={norm(r.full_name):(r.report_status,r.report_primary_injury) for r in inj.itertuples() if pd.notna(r.report_status)}
def status_for(k,gid):
    rr=ros[ros.gsis_id==gid] if gid else ros[ros.k==k]
    st,note='',''
    if len(rr):
        rr=rr.iloc[0]
        if rr.status=='RES': st='IR' if str(rr.status_description_abbr).startswith('R') else 'O'; note='Reserve list'
        if rr.status_description_abbr in ('R04',):st='PUP'
    if not st and k in injk:
        s,ij=injk[k];st={'Out':'O','Doubtful':'D','Questionable':'Q'}.get(s,'');note=ij if isinstance(ij,str) else ''
    return st,note
for pid in keep:
    rows=w[w.player_id==pid].sort_values('week');last=rows.iloc[-1]
    name=last.player_display_name;pos=last.position;k=norm(name)
    rr=ros[ros.gsis_id==pid];team=rr.iloc[0].team if len(rr) else last.team
    gp=len(rows);act={f:rows[C[f]].fillna(0).sum()/gp for f in F}
    if k in pre:
        kk=4;proj={f:(pre[k].get(f,0)*kk+act[f]*gp)/(kk+gp) for f in F if f!='fl'}
    else:
        sc=.75+.25*min(gp,8)/8;proj={f:act[f]*sc for f in F if f!='fl'}
    proj['fl']=(FUMB[pos]*2+act['fl']*gp)/(2+gp)
    log=[]
    byw={int(r.week):r for r in rows.itertuples()}
    for wk in range(1,PLAYED+1):
        sch=sched.get(team,[0]*18)[wk-1]
        if wk in byw:
            r=byw[wk];opp=fix(r.opponent_team);home=1 if sched.get(fix(r.team),[0]*18)[wk-1] and sched[fix(r.team)][wk-1][1]==1 else 0
            vals=[int(getattr(r,C[f])) if f!='fl' else int(r.fl) for f in F]
            ts=getattr(r,'target_share');ts=round(float(ts)*100,1) if pd.notna(ts) else 0
            sp=snapd.get((k,fix(r.team),wk),-1)
            log.append([opp,home]+vals+[ts,round(sp*100) if sp>=0 else -1])
        elif sch==0: log.append(0)
        else: log.append([sch[0],sch[1]])  # did not play
    st,note=status_for(k,pid)
    out.append([slug(name),name,pos,team,st,note,[round(proj[f],2) for f in F],log])
# preseason players with no 2026 stats (e.g. season-long injuries)
for k in extra:
    rr=ros[ros.k==k]
    if not len(rr):continue
    rr=rr.iloc[0]
    if rr.position not in ('QB','RB','WR','TE'):continue
    name=rr.full_name;team=rr.team;pz=pre[k]
    st,note=status_for(k,rr.gsis_id)
    if not st: st='O'
    log=[0 if sched[team][wk-1]==0 else [sched[team][wk-1][0],sched[team][wk-1][1]] for wk in range(1,PLAYED+1)]
    out.append([slug(name),name,rr.position,team,st,note,[round(pz.get(f,0),2) for f in F[:-1]]+[FUMB[rr.position]],log])
# dedupe slugs
seen=set();final=[]
for p in out:
    if p[0] in seen: continue
    seen.add(p[0]);final.append(p)
data={'week':WEEK,'played':PLAYED,'injWeek':IW,'asOf':datetime.date.today().isoformat(),'fields':F,'players':final,'sched':sched,'bye':bye,'vegas':vegas,'def':DEF}
js=json.dumps(data,separators=(',',':'))
print(len(final),'players',len(js)//1024,'KB','week',WEEK,file=sys.stderr)
print(sum(1 for p in final if p[4]),'with status',file=sys.stderr)

# ---------- team defenses ----------
fix=lambda t:{'LA':'LAR'}.get(t,t)
w=pd.read_csv(D+'stats_player_week_'+str(SEASON)+'.csv',low_memory=False);w=w[w.season_type=='REG']
w['team']=w.team.map(fix)
for c in ['def_sacks','def_interceptions','fumble_recovery_opp','def_tds','def_safeties','special_teams_tds']:w[c]=w[c].fillna(0)
agg=w.groupby(['team','week']).agg(sk=('def_sacks','sum'),it=('def_interceptions','sum'),fr=('fumble_recovery_opp','sum'),td=('def_tds','sum'),st=('special_teams_tds','sum'),sf=('def_safeties','sum')).reset_index()
g=pd.read_csv(D+'games.csv',low_memory=False);g=g[(g.season==SEASON)&(g.game_type=='REG')].copy()
g['home_team']=g.home_team.map(fix);g['away_team']=g.away_team.map(fix)
pa={}
for r in g.itertuples():
    if pd.notna(r.home_score):pa[(r.home_team,r.week)]=(r.away_team,1,int(r.away_score));pa[(r.away_team,r.week)]=(r.home_team,0,int(r.home_score))
d=data
PLAYED=d['played'];teams=sorted(d['sched'].keys())
def tier(x):return 10 if x==0 else 7 if x<=6 else 4 if x<=13 else 1 if x<=20 else 0 if x<=27 else -1 if x<=34 else -4
out=[];dstpts={}
for t in teams:
    log=[];rows=[]
    for wk in range(1,PLAYED+1):
        if (t,wk) not in pa: log.append(0);continue
        opp,home,p=pa[(t,wk)]
        a=agg[(agg.team==t)&(agg.week==wk)]
        sk,it,fr,td,st,sf=(float(a.iloc[0][c]) if len(a) else 0 for c in ['sk','it','fr','td','st','sf'])
        e=[opp,home,round(sk,1),int(it),int(fr),int(td+st),int(sf),p];log.append(e);rows.append(e)
        dstpts.setdefault(opp,[]).append(sk+2*it+2*fr+6*(td+st)+2*sf+tier(p))
    n=max(1,len(rows));m=lambda i:sum(r[i] for r in rows)/n
    out.append([t,[round(m(2),2),round(m(3),2),round(m(4),2),round(m(5),2),round(m(6),2),round(m(7),1)],log,len(rows)])
# league means for regression
L=[sum(o[1][i] for o in out)/len(out) for i in range(6)]
for o in out:
    k=3;gp=o[3];o[1]=[round((o[1][i]*gp+L[i]*k)/(gp+k),2) for i in range(6)];o.pop()
# DST matchup rank: points DSTs score against each offense (32 = most allowed = easiest)
avgp={t:sum(v)/len(v) for t,v in dstpts.items()}
for i,(t,_) in enumerate(sorted(avgp.items(),key=lambda x:x[1])):d['def'].setdefault(t,{})['DST']=i+1
d['dst']=out
print(len(out),'defenses; league avg',[round(x,2) for x in L]);print(out[0][:2],out[0][2][-2:])

# ---------- expert consensus ----------
d=data
rows=list(csv.DictReader(open(ECR_FILE))) if ECR_FILE else []
norm=lambda s:re.sub(r'[^a-z]','',re.sub(r'\b(jr|sr|ii|iii|iv|v)\b\.?','',s.lower()))
TM={'JAC':'JAX','LA':'LAR','WSH':'WAS'}
idx={}
for p in d['players']:
    idx.setdefault((norm(p[1]),p[2]),[]).append(p)
NICK={}
ecr={};miss=[]
for r in rows:
    pos=r['pos'];
    if pos not in('QB','RB','WR','TE','DST'):continue
    if pos=='DST':
        t=TM.get(r['team'],r['team']);ecr['dst-'+t]=float(r['ecr']);continue
    c=idx.get((norm(r['player_name']),pos),[])
    t=TM.get(r['team'],r['team'])
    if len(c)>1:c=[p for p in c if p[3]==t] or c
    if c:ecr[c[0][0]]=float(r['ecr'])
    elif float(r['ecr'])<60:miss.append((r['player_name'],pos,r['ecr']))
if ecr:
    d['ecr']=ecr;d['ecrDate']=rows[0]['scrape_date']
elif PREV.get('ecr'):
    d['ecr']=PREV['ecr'];d['ecrDate']=PREV.get('ecrDate')
print(len(ecr),'matched; notable misses:',miss[:20])

json.dump(d,open(OUT,'w'),separators=(',',':'))
print('wrote',OUT,file=sys.stderr)
