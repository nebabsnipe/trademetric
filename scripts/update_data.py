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
  f'depth_charts_{SEASON}.csv':       NV+f'depth_charts/depth_charts_{SEASON}.csv',
  'fp_latest_weekly.csv':             'https://raw.githubusercontent.com/dynastyprocess/data/master/files/fp_latest_weekly.csv',
  'db_fpecr_latest.csv':              'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv',
  'values-players.csv':               'https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv',
  f'ep_weekly_{SEASON}.csv':            f'https://github.com/ffverse/ffopportunity/releases/download/latest-data/ep_weekly_{SEASON}.csv',
  f'play_by_play_{SEASON}.csv':         NV+f'pbp/play_by_play_{SEASON}.csv',
}
OPTIONAL=('fp_latest_weekly.csv',f'depth_charts_{SEASON}.csv','db_fpecr_latest.csv','values-players.csv',f'ep_weekly_{SEASON}.csv',f'play_by_play_{SEASON}.csv')
os.makedirs(RAW,exist_ok=True)
for name,url in SOURCES.items():
    try:
        urllib.request.urlretrieve(url,RAW+name);print('downloaded',name,file=sys.stderr)
    except Exception as e:
        print('could not download',name,e,file=sys.stderr)
        if not os.path.exists(RAW+name) and name not in OPTIONAL:sys.exit(1)
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
w=w[w.season_type=='REG'].copy()
# carry share needs every position in the denominator, so take team totals before filtering to skill players
_tc=w.copy();_tc['team']=_tc.team.map(fix);_tc['carries']=_tc.carries.fillna(0)
TEAMCAR={(t,int(wk)):float(c) for (t,wk),c in _tc.groupby(['team','week']).carries.sum().items() if c>0}
del _tc
w=w[w.position.isin(['QB','RB','WR','TE'])].copy()
# A week counts as played only when every game in it is final (Thursday games alone don't count)
_g=pd.read_csv(D+'games.csv',low_memory=False);_g=_g[(_g.season==SEASON)&(_g.game_type=='REG')]
_done={int(k):bool(v) for k,v in _g.groupby('week').home_score.apply(lambda x:x.notna().all()).items()}
PLAYED=0
while _done.get(PLAYED+1):PLAYED+=1
# ...and only once nflverse has posted stats for every team that played that week
_teams=lambda wk:set(_g[_g.week==wk].home_team.map(fix))|set(_g[_g.week==wk].away_team.map(fix))
while PLAYED>0 and not _teams(PLAYED)<=set(w[(w.week==PLAYED)&(w.season_type=='REG')].team.map(fix)):PLAYED-=1
WEEK=PLAYED+1
w=w[w.week<=PLAYED].copy()
w['fl']=w[['sack_fumbles_lost','rushing_fumbles_lost','receiving_fumbles_lost']].fillna(0).sum(axis=1)
w['team']=w.team.map(fix);w['opponent_team']=w.opponent_team.map(fix)
ros=pd.read_csv(D+'roster_'+str(SEASON)+'.csv',low_memory=False);ros=ros[ros.week==ros.week.max()]
ros['team']=ros.team.map(fix)
injall=pd.read_csv(D+'injuries_'+str(SEASON)+'.csv',low_memory=False);IW=int(injall.week.max());inj=injall[injall.week==IW]
# practice reports: the last 3 weekly reports per player (latest practice participation, injury, game status)
PRAC_CODE={'Did Not Participate In Practice':'DNP','Limited Participation in Practice':'LP','Full Participation in Practice':'FP','Out (Definitely Will Not Play)':'DNP'}
prac={}
for r in injall[(injall.week>IW-3)&(injall.season_type=='REG')].sort_values('week').itertuples():
    if not isinstance(r.gsis_id,str):continue
    code=PRAC_CODE.get(r.practice_status,'') if isinstance(r.practice_status,str) else ''
    ij=r.practice_primary_injury if isinstance(r.practice_primary_injury,str) else (r.report_primary_injury if isinstance(r.report_primary_injury,str) else '')
    gs=r.report_status if isinstance(r.report_status,str) else ''
    if not code and not gs:continue
    prac.setdefault(r.gsis_id,[]).append([int(r.week),code,ij,gs])
# depth charts: latest chart per team -> [rank at position, slot] (WR slot 8 = slot receiver)
depth={}
try:
    dc=pd.read_csv(D+f'depth_charts_{SEASON}.csv',low_memory=False)
    dc=dc[dc.pos_abb.isin(['QB','RB','WR','TE'])]
    dc=dc[dc.dt==dc.groupby('team').dt.transform('max')]
    for r in dc.itertuples():
        if isinstance(r.gsis_id,str) and r.gsis_id not in depth:depth[r.gsis_id]=[int(r.pos_rank),int(r.pos_slot)]
    print(len(depth),'depth chart entries',file=sys.stderr)
except Exception as e:
    print('no depth charts',e,file=sys.stderr)
GID={}
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
vegas={};kick={}
for r in g[g.week==WEEK].itertuples():
    for tm,home in ((r.home_team,1),(r.away_team,0)):
        kick[tm]=[str(r.weekday) if pd.notna(r.weekday) else '',str(r.gameday) if pd.notna(r.gameday) else '',str(r.gametime) if pd.notna(r.gametime) else '',str(getattr(r,'roof','')) if pd.notna(getattr(r,'roof','')) else '']
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
# every QB/RB/WR/TE who has played this season, best first
keep=list(agg.sort_values('ppr',ascending=False).player_id)
keepset=set(keep)
# preseason players missing from stats (injured all year) -> roster lookup
ros['k']=ros.full_name.map(norm)
statnames={norm(n) for n in agg[agg.player_id.isin(keepset)].name}
# plus everyone else on an NFL roster at these spots (active, reserve, inactive, practice squad),
# so any player a fantasy team rosters is in the list
ROSTER_OK=('ACT','RES','INA','DEV')
extra=[k for k in pre if k not in statnames]+[k for k in ros[ros.position.isin(['QB','RB','WR','TE'])&ros.status.isin(ROSTER_OK)].k if k not in statnames and k not in pre]
extra=list(dict.fromkeys(extra))
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
            ays=getattr(r,'air_yards_share');ays=round(float(ays)*100,1) if pd.notna(ays) else 0
            _c=getattr(r,'carries');_c=float(_c) if pd.notna(_c) else 0.0
            _tcar=TEAMCAR.get((fix(r.team),wk),0)
            cs=round(_c/_tcar*100,1) if _tcar else 0
            log.append([opp,home]+vals+[ts,round(sp*100) if sp>=0 else -1,ays,cs])
        elif sch==0: log.append(0)
        else: log.append([sch[0],sch[1]])  # did not play
    st,note=status_for(k,pid)
    out.append([slug(name),name,pos,team,st,note,[round(proj[f],2) for f in F],log]);GID.setdefault(slug(name),pid)
# preseason players with no 2026 stats (e.g. season-long injuries)
for k in extra:
    rr=ros[ros.k==k]
    if not len(rr):continue
    rr=rr.iloc[0]
    if rr.position not in ('QB','RB','WR','TE'):continue
    name=rr.full_name;team=rr.team
    if team not in sched:continue
    pz=pre.get(k)
    if pz is None:  # no stats and no preseason estimate: a small depth-player baseline
        pz={'QB':dict(cmp=1,pyd=10,ratt=.3,ryd=1),'RB':dict(ratt=1.5,ryd=6,tgt=.4,rec=.3,recyd=2),'WR':dict(tgt=.8,rec=.5,recyd=6),'TE':dict(tgt=.6,rec=.4,recyd=4)}[rr.position]
    st,note=status_for(k,rr.gsis_id)
    if not st and k in pre: st='O'
    log=[0 if sched[team][wk-1]==0 else [sched[team][wk-1][0],sched[team][wk-1][1]] for wk in range(1,PLAYED+1)]
    out.append([slug(name),name,rr.position,team,st,note,[round(pz.get(f,0),2) for f in F[:-1]]+[FUMB[rr.position]],log]);GID.setdefault(slug(name),rr.gsis_id)
# dedupe slugs
seen=set();final=[]
for p in out:
    if p[0] in seen: continue
    seen.add(p[0]);final.append(p)
data={'week':WEEK,'played':PLAYED,'injWeek':IW,'asOf':datetime.date.today().isoformat(),'fields':F,'players':final,'sched':sched,'bye':bye,'vegas':vegas,'kick':kick,'def':DEF}
data['depth']={p[0]:depth[GID[p[0]]] for p in final if GID.get(p[0]) in depth}
data['practice']={p[0]:prac[GID[p[0]]] for p in final if GID.get(p[0]) in prac}
# Expected fantasy points from ffopportunity, published in FULL PPR. Stored as
# [TD, xTD, xFP, FPOE] season to date; TDOE is TD - xTD on the client.
data['exp']={}
try:
    _ep=pd.read_csv(D+f'ep_weekly_{SEASON}.csv',low_memory=False)
    _ep['week']=pd.to_numeric(_ep.week,errors='coerce')
    _ep=_ep[_ep.week<=PLAYED]
    _ec=['total_touchdown','total_touchdown_exp','total_fantasy_points_exp','total_fantasy_points_diff']
    for _c in _ec: _ep[_c]=pd.to_numeric(_ep[_c],errors='coerce').fillna(0)
    _agg=_ep.groupby('player_id')[_ec].sum()
    _byid={i:[round(float(v),2) for v in row] for i,row in zip(_agg.index,_agg.values)}
    data['exp']={p[0]:_byid[GID[p[0]]] for p in final if GID.get(p[0]) in _byid}
    print(len(data['exp']),'players with expected points',file=sys.stderr)
except Exception as _e:
    print('expected points skipped',_e,file=sys.stderr)
# Red zone opportunities: carries plus targets inside the 20 and inside the 10.
# Only the columns we need are read -- the full play-by-play file is 43 MB.
data['rz']={}
try:
    _pc=['season_type','week','yardline_100','play_type','rush_attempt','pass_attempt','rusher_player_id','receiver_player_id','two_point_attempt']
    _pbp=pd.read_csv(D+f'play_by_play_{SEASON}.csv',low_memory=False,usecols=_pc)
    _pbp=_pbp[(_pbp.season_type=='REG')&(_pbp.week<=PLAYED)&(_pbp.play_type.isin(['run','pass']))&(_pbp.two_point_attempt!=1)]
    def _rzcount(limit):
        z=_pbp[_pbp.yardline_100<=limit]
        return z[z.rush_attempt==1].groupby('rusher_player_id').size().add(
               z[z.pass_attempt==1].dropna(subset=['receiver_player_id']).groupby('receiver_player_id').size(),fill_value=0)
    _r20,_r10=_rzcount(20),_rzcount(10)
    data['rz']={p[0]:[int(_r20.get(GID[p[0]],0)),int(_r10.get(GID[p[0]],0))]
                for p in final if GID.get(p[0]) in _r20.index}
    print(len(data['rz']),'players with red zone work',file=sys.stderr)
except Exception as _e:
    print('red zone skipped',_e,file=sys.stderr)
# efficiency: weighted opportunity (WOPR) and air yards per game, which predict future scoring better than raw points
try:
    eff={}
    cols=[c for c in ('wopr','receiving_air_yards') if c in w.columns]
    if cols:
        e=w.groupby('player_id').agg(**{c:(c,'mean') for c in cols}).reset_index()
        em={r.player_id:r for r in e.itertuples()}
        for p in final:
            r=em.get(GID.get(p[0]))
            if r is None or p[2] not in('WR','TE','RB'):continue
            wo=getattr(r,'wopr',None);ay=getattr(r,'receiving_air_yards',None)
            eff[p[0]]=[round(float(wo),3) if wo is not None and pd.notna(wo) else 0,round(float(ay),1) if ay is not None and pd.notna(ay) else 0]
    data['eff']=eff;print(len(eff),'efficiency rows',file=sys.stderr)
except Exception as ex:print('efficiency skipped',ex,file=sys.stderr)
# line health: offensive linemen and defensive backs out or doubtful on the latest injury report
try:
    lines={}
    for r in inj.itertuples():
        st=r.report_status if isinstance(r.report_status,str) else ''
        if st not in('Out','Doubtful'):continue
        t=fix(r.team);pos=str(r.position)
        if pos in('T','G','C','OT','OG','OL'):lines.setdefault(t,[0,0])[0]+=1
        elif pos in('CB','S','FS','SS','DB'):lines.setdefault(t,[0,0])[1]+=1
    data['lines']=lines;print(len(lines),'teams with line injuries',file=sys.stderr)
except Exception as ex:print('line injuries skipped',ex,file=sys.stderr)
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

# ---------- kickers ----------
# per-game made FGs by distance, misses and extra points, regressed toward the league average
kw=pd.read_csv(D+'stats_player_week_'+str(SEASON)+'.csv',low_memory=False)
kw=kw[(kw.season_type=='REG')&(kw.position=='K')&(kw.week<=PLAYED)].copy()
kw['team']=kw.team.map(fix);kw['opponent_team']=kw.opponent_team.map(fix)
for c in ['fg_made_0_19','fg_made_20_29','fg_made_30_39','fg_made_40_49','fg_made_50_59','fg_made_60_','fg_missed','pat_made','pat_missed']:kw[c]=kw[c].fillna(0)
kw['k39']=kw.fg_made_0_19+kw.fg_made_20_29+kw.fg_made_30_39;kw['k49']=kw.fg_made_40_49;kw['k50']=kw.fg_made_50_59+kw.fg_made_60_
kw['kmiss']=kw.fg_missed;kw['xpm']=kw.pat_made;kw['xpmiss']=kw.pat_missed
KF=['k39','k49','k50','kmiss','xpm','xpmiss']
kagg=kw.groupby('player_id').agg(name=('player_display_name','last'),g=('week','nunique'),**{f:(f,'sum') for f in KF}).reset_index()
LG=[kw[f].sum()/max(1,len(kw)) for f in KF]
rosk=ros[ros.position=='K']
kickers=[]
for r in kagg.sort_values('g',ascending=False).itertuples():
    rows=kw[kw.player_id==r.player_id].sort_values('week');rr=ros[ros.gsis_id==r.player_id]
    team=rr.iloc[0].team if len(rr) else rows.iloc[-1].team
    if len(rr) and rr.iloc[0].status not in ('ACT','RES','INA','DEV'):continue
    gp=r.g;proj=[round((getattr(r,f)+LG[i]*3)/(gp+3),3) for i,f in enumerate(KF)]
    byw={int(x.week):x for x in rows.itertuples()};log=[]
    for wk in range(1,PLAYED+1):
        sch=sched.get(team,[0]*18)[wk-1]
        if wk in byw:x=byw[wk];log.append([x.opponent_team,1 if sch and sch[1]==1 else 0]+[int(getattr(x,f)) for f in KF])
        elif sch==0:log.append(0)
        else:log.append([sch[0],sch[1]])
    st,note=status_for(norm(r.name),r.player_id)
    kickers.append([slug(r.name),r.name,team,st,note,proj,log])
# rostered kickers who haven't kicked yet
have={k[1] for k in kickers}
for rr in rosk[rosk.status.isin(['ACT','RES'])].itertuples():
    if rr.full_name in have or rr.team not in sched:continue
    log=[0 if sched[rr.team][wk-1]==0 else [sched[rr.team][wk-1][0],sched[rr.team][wk-1][1]] for wk in range(1,PLAYED+1)]
    st,note=status_for(norm(rr.full_name),rr.gsis_id);kickers.append([slug(rr.full_name),rr.full_name,rr.team,st,note,[round(x,3) for x in LG],log])
# kicker matchup: standard kicker points allowed per game (1 = allows the fewest)
kw['kp']=3*kw.k39+4*kw.k49+5*kw.k50-kw.kmiss+kw.xpm-kw.xpmiss
ka=kw.groupby(['opponent_team','week']).kp.sum().reset_index().groupby('opponent_team').kp.mean()
for i,(t,_) in enumerate(ka.sort_values().items()):d['def'].setdefault(t,{})['K']=i+1
d['k']=kickers;d['kfields']=KF
# jersey numbers (for the player badges): current roster, matched by TradeMetric id
try:
    ids={p[0] for p in d['players']}|{k[0] for k in kickers};num={}
    for r in ros[ros.position.isin(['QB','RB','WR','TE','K','FB'])].itertuples():
        i=slug(r.full_name)
        if i in ids and pd.notna(r.jersey_number):num.setdefault(i,int(r.jersey_number))
    d['num']=num;print(len(num),'jersey numbers',file=sys.stderr)
except Exception as e:
    print('no jersey numbers',e,file=sys.stderr)
print(len(kickers),'kickers',file=sys.stderr)

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
        t=TM.get(r['team'],r['team']);ecr['dst-'+t.lower()]=float(r['ecr']);continue
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

for k in d.get('k',[]):idx.setdefault((norm(k[1]),'K'),[]).append([k[0],k[1],'K',k[2]])
def match(name,pos,team):
    if pos in('DST','DEF'):return 'dst-'+TM.get(team,team).lower()
    c=idx.get((norm(name),pos),[]);t=TM.get(team,team)
    if len(c)>1:c=[p for p in c if p[3]==t] or c
    return c[0][0] if c else None
num=lambda x:float(x) if x not in ('','NA',None) else None
# rest-of-season expert consensus (position ranks, with expert disagreement) and roster rates
ROS_PAGES={'/nfl/rankings/ros-qb.php','/nfl/rankings/ros-ppr-rb.php','/nfl/rankings/ros-ppr-wr.php','/nfl/rankings/ros-ppr-te.php','/nfl/rankings/ros-k.php','/nfl/rankings/ros-dst.php'}
ros={};rost={}
try:
    for r in csv.DictReader(open(RAW+'db_fpecr_latest.csv')):
        if r['fp_page'] not in ROS_PAGES:continue
        pos='DST' if r['pos'] in('DST','DEF') else r['pos']
        pid=match(r['player'],pos,r['team'])
        if not pid or num(r['ecr']) is None:continue
        ros[pid]=[round(num(r['ecr']),1),round(num(r['sd']) or 0,1),int(num(r['best']) or 0),int(num(r['worst']) or 0)]
        o=num(r['player_owned_avg'])
        if o is not None:rost[pid]=round(o)
        d['rosDate']=r['scrape_date']
except Exception as e:print('ros ecr skipped',e,file=sys.stderr)
if ros:d['ros']=ros;d['rost']=rost
elif PREV.get('ros'):d['ros']=PREV['ros'];d['rost']=PREV.get('rost',{});d['rosDate']=PREV.get('rosDate')
print(len(ros),'rest-of-season ranks',file=sys.stderr)
# dynasty / keeper values (DynastyProcess): [1QB value, superflex value, age, draft year]
dyn={}
try:
    for r in csv.DictReader(open(RAW+'values-players.csv')):
        if r['pos'] not in('QB','RB','WR','TE'):continue
        pid=match(r['player'],r['pos'],r['team'])
        if pid:dyn[pid]=[int(num(r['value_1qb']) or 0),int(num(r['value_2qb']) or 0),num(r['age']),int(num(r['draft_year']) or 0)]
except Exception as e:print('dynasty values skipped',e,file=sys.stderr)
if dyn:d['dyn']=dyn
elif PREV.get('dyn'):d['dyn']=PREV['dyn']
print(len(dyn),'dynasty values',file=sys.stderr)

json.dump(d,open(OUT,'w'),separators=(',',':'))
print('wrote',OUT,file=sys.stderr)
