#!/usr/bin/env python3
"""Find the official YouTube channel ID for the NFL and all 32 teams.

Tries each team's likely handle, reads the channel page, and only accepts it when
the channel's name is the team's full official name (e.g. "Cincinnati Bengals").
Writes data/yt_channels.json. Runs in the daily GitHub Action; safe to run by hand.
"""
import json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'yt_channels.json')
TEAMS = {
 'ARI':('Arizona Cardinals',['AZCardinals','ArizonaCardinals']),'ATL':('Atlanta Falcons',['AtlantaFalcons']),
 'BAL':('Baltimore Ravens',['Ravens','BaltimoreRavens']),'BUF':('Buffalo Bills',['BuffaloBills']),
 'CAR':('Carolina Panthers',['Panthers','CarolinaPanthers']),'CHI':('Chicago Bears',['ChicagoBears']),
 'CIN':('Cincinnati Bengals',['Bengals','CincinnatiBengals']),'CLE':('Cleveland Browns',['Browns','ClevelandBrowns']),
 'DAL':('Dallas Cowboys',['DallasCowboys']),'DEN':('Denver Broncos',['DenverBroncos','Broncos']),
 'DET':('Detroit Lions',['DetroitLionsNFL','detroitlions','DetroitLionsOfficial','DetroitLions']),'GB':('Green Bay Packers',['packers','GreenBayPackers']),
 'HOU':('Houston Texans',['HoustonTexans','Texans']),'IND':('Indianapolis Colts',['Colts','IndianapolisColts']),
 'JAX':('Jacksonville Jaguars',['Jaguars','JacksonvilleJaguars']),'KC':('Kansas City Chiefs',['Chiefs','KansasCityChiefs']),
 'LV':('Las Vegas Raiders',['Raiders','RaidersNFL','LasVegasRaiders']),'LAC':('Los Angeles Chargers',['Chargers','LAChargers']),
 'LAR':('Los Angeles Rams',['Rams','LARams']),'MIA':('Miami Dolphins',['MiamiDolphins','Dolphins']),
 'MIN':('Minnesota Vikings',['Vikings','MinnesotaVikings']),'NE':('New England Patriots',['Patriots','NewEnglandPatriots']),
 'NO':('New Orleans Saints',['Saints','NewOrleansSaints']),'NYG':('New York Giants',['nygiants','Giants','NewYorkGiants','GiantsNFL']),
 'NYJ':('New York Jets',['nyjets','NewYorkJets']),'PHI':('Philadelphia Eagles',['Eagles','PhiladelphiaEagles']),
 'PIT':('Pittsburgh Steelers',['Steelers','PittsburghSteelers']),'SF':('San Francisco 49ers',['49ers','SanFrancisco49ers']),
 'SEA':('Seattle Seahawks',['Seahawks','SeattleSeahawks']),'TB':('Tampa Bay Buccaneers',['Buccaneers','TampaBayBuccaneers']),
 'TEN':('Tennessee Titans',['Titans','TennesseeTitans']),'WAS':('Washington Commanders',['Commanders','WashingtonCommanders']),
}
# a few official channels use a shorter display name
ALIASES = {'LV': ['raiders'], 'NYG': ['new york giants', 'giants'], 'DET': ['detroit lions']}
UA = {'User-Agent': 'Mozilla/5.0 (TradeMetric channel lookup)', 'Accept-Language': 'en-US,en;q=0.9'}

def lookup(handle):
    req = urllib.request.Request(f'https://www.youtube.com/@{handle}', headers=UA)
    html = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'ignore')
    cid = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"', html) or re.search(r'"externalId":"(UC[\w-]{22})"', html)
    name = re.search(r'<meta property="og:title" content="([^"]+)"', html)
    return (cid.group(1) if cid else None), (name.group(1) if name else '')

prev = json.load(open(OUT)) if os.path.exists(OUT) else {}
out = {'NFL': prev.get('NFL') or 'UCDVYQ4Zhbm3S2dlz7P1GBDg'}
for abbr, (full, handles) in TEAMS.items():
    found = None
    for h in handles:
        try:
            cid, name = lookup(h)
        except Exception as e:
            print(abbr, h, 'error', e, file=sys.stderr); continue
        if cid and (name.strip().lower() == full.lower() or name.strip().lower() in ALIASES.get(abbr, [])):
            found = cid; break
        print(abbr, h, 'rejected', repr(name), file=sys.stderr)
    out[abbr] = found or prev.get(abbr)
    print(abbr, out[abbr], file=sys.stderr)
json.dump(out, open(OUT, 'w'), indent=1, sort_keys=True)
print('found', sum(1 for k, v in out.items() if v), 'of', len(out), file=sys.stderr)
