"""Rebuilds private-photos/private.js: which headshot ID each of the site's players has.
Private design branch only. Needs internet.   python3 scripts/dev/photo_ids.py"""
import json, re, urllib.request, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60))
d = json.load(open(os.path.join(ROOT, 'data/nfl.json')))
norm = lambda s: re.sub(r'[^a-z ]', '', re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s.lower().replace('-', ' ').replace('.', ''))).strip()
idx = {}
for i in range(1, 35):
    try: j = get(f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{i}/roster')
    except Exception: continue
    t = (j.get('team') or {}).get('abbreviation')
    for g in j.get('athletes', []):
        for a in g.get('items', []):
            pos = (a.get('position') or {}).get('abbreviation'); pos = {'PK': 'K', 'FB': 'RB'}.get(pos, pos)
            idx.setdefault(norm(a.get('fullName', '')), []).append((a['id'], pos, t, bool(a.get('headshot'))))
out = {}
rows = [(p[0], p[1], p[2], p[3]) for p in d['players']] + [(k[0], k[1], 'K', k[2]) for k in d['k']]
for id_, n, pos, t in rows:
    c = sorted(idx.get(norm(n), []), key=lambda a: (a[1] != pos, a[2] != {'WAS': 'WSH'}.get(t, t), not a[3]))
    if c and (c[0][1] == pos or len(c) == 1): out[id_] = int(c[0][0])
cd = os.path.join(ROOT, 'private-photos/cutouts')
cut = sorted(f[:-5] for f in os.listdir(cd) if f.endswith('.webp')) if os.path.isdir(cd) else []
js = """/* PRIVATE DESIGN BRANCH ONLY. Unlicensed placeholder photos. This folder must never reach main:
   scripts/check-photos.mjs fails the build if it does. Rebuilt by scripts/dev/photo_ids.py. */
window.TM_PHOTO_PRIVATE={
  ids:%s,
  cutouts:%s,
  head:function(id){var e=this.ids[id];return e?'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/'+e+'.png&w=220&h=160':null},
  hero:function(id){if(this.cutouts.indexOf(id)>=0)return '/private-photos/cutouts/'+id+'.webp';var e=this.ids[id];return e?'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/'+e+'.png&w=700&h=509':null},
  isCutout:function(id){return this.cutouts.indexOf(id)>=0},
  logo:function(t){var m={WAS:'wsh'};return 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/'+(m[t]||String(t).toLowerCase())+'.png&w=96&h=96'}
};
""" % (json.dumps(out, separators=(',', ':')), json.dumps(cut))
open(os.path.join(ROOT, 'private-photos/private.js'), 'w').write(js)
print(len(rows), 'players,', len(out), 'with a headshot,', len(cut), 'cut-outs')
