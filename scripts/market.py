#!/usr/bin/env python3
"""Redraft trade-market snapshot: FantasyCalc + KeepTradeCut (redraft) values.

FantasyPros expert consensus is already in data/nfl.json (from DynastyProcess).
Writes data/market.json with values keyed by TradeMetric player id, plus the date each
source was captured. A source that can't be reached keeps its last saved values.
Runs in the daily GitHub Action.
"""
import json, os, re, sys, datetime, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'market.json')
NFL = json.load(open(os.path.join(ROOT, 'data', 'nfl.json')))
UA = {'User-Agent': 'Mozilla/5.0 (TradeMetric market snapshot)', 'Accept': 'application/json,text/html'}
norm = lambda s: re.sub(r'\s+', ' ', re.sub(r'[^a-z ]', ' ', re.sub(r'\b(jr|sr|ii|iii|iv|v)\b\.?', '', str(s).lower().replace('.', '').replace("'", '').replace('’', '')))).strip()

index = {}
for p in NFL['players']:
    index.setdefault((norm(p[1]), p[2]), p[0])
def pid(name, pos):
    return index.get((norm(name), pos))

def get(url, js=True):
    req = urllib.request.Request(url, headers=UA)
    raw = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'ignore')
    return json.loads(raw) if js else raw

prev = json.load(open(OUT)) if os.path.exists(OUT) else {}
out = {'asOf': datetime.date.today().isoformat(), 'sources': prev.get('sources', {})}
for k in ('fc1', 'fc2', 'ktc1', 'ktc2'):
    out[k] = prev.get(k, {})
today = datetime.date.today().isoformat()

# FantasyCalc: public redraft values (1-QB and superflex)
for key, qbs in (('fc1', 1), ('fc2', 2)):
    try:
        rows = get(f'https://api.fantasycalc.com/values/current?isDynasty=false&numQbs={qbs}&numTeams=12&ppr=1')
        vals = {}
        for r in rows:
            pl = r.get('player') or {}
            i = pid(pl.get('name'), pl.get('position'))
            v = r.get('redraftValue') or r.get('value')
            if i and v: vals[i] = round(float(v), 1)
        if len(vals) > 50:
            out[key] = vals; out['sources']['fantasycalc'] = {'date': today, 'players': len(vals)}
        print(key, len(vals), file=sys.stderr)
    except Exception as e:
        print('fantasycalc', qbs, 'failed', e, file=sys.stderr)

# KeepTradeCut redraft rankings (values embedded in the rankings page)
try:
    html = get('https://keeptradecut.com/fantasy-rankings', js=False)
    m = re.search(r'var\s+playersArray\s*=\s*(\[.*?\]);', html, re.S)
    arr = json.loads(m.group(1)) if m else []
    v1, v2 = {}, {}
    for r in arr:
        i = pid(r.get('playerName'), r.get('position'))
        if not i: continue
        a = (r.get('oneQBValues') or {}).get('value'); b = (r.get('superflexValues') or {}).get('value')
        if a: v1[i] = a
        if b: v2[i] = b
    if len(v1) > 50:
        out['ktc1'] = v1; out['ktc2'] = v2 or v1; out['sources']['keeptradecut'] = {'date': today, 'players': len(v1)}
    print('ktc', len(v1), len(v2), file=sys.stderr)
except Exception as e:
    print('keeptradecut failed', e, file=sys.stderr)

if NFL.get('ecrDate'):
    out['sources']['fantasypros'] = {'date': NFL['ecrDate'], 'players': len(NFL.get('ecr', {}))}
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('wrote market.json', {k: v.get('date') for k, v in out['sources'].items()}, file=sys.stderr)
