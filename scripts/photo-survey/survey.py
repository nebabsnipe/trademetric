"""Counts how many of the top 300 players have a free-to-reuse photo on Wikimedia Commons.
Run:  python3 scripts/photo-survey/survey.py            (generic client name)
  or: python3 scripts/photo-survey/survey.py --contact you@yoursite.com   (what Wikimedia asks for)
Safe to stop and restart: it resumes from survey.json. Slow on purpose (Commons rate-limits)."""
import json,urllib.request,urllib.parse,time,re,html,os,sys,argparse
ap=argparse.ArgumentParser();ap.add_argument('--contact',default='');ap.add_argument('--pause',type=float,default=5)
a=ap.parse_args();H=os.path.dirname(os.path.abspath(__file__))
UA={'User-Agent':'TradeMetricPhotoSurvey/1.0'+(f' ({a.contact})' if a.contact else '')}
API='https://commons.wikimedia.org/w/api.php?format=json&'
def get(q):
    for i in range(8):
        try:
            r=json.loads(urllib.request.urlopen(urllib.request.Request(API+q,headers=UA),timeout=60).read());time.sleep(a.pause);return r
        except Exception as e:
            print('  waiting (',str(e)[:50],')',flush=True);time.sleep(min(600,30*(i+1)**2))
    return None
top=json.load(open(H+'/top300.json'));OUT=H+'/survey.json'
res=json.load(open(OUT)) if os.path.exists(OUT) else {}
save=lambda:json.dump(res,open(OUT,'w'))
strip=lambda s:html.unescape(re.sub('<[^>]+>','',s or '')).strip()
for i,p in enumerate(top):
    if p['id'] in res:continue
    title=None
    d=get('action=query&prop=categoryinfo&titles='+urllib.parse.quote('Category:'+p['n']))
    if d:
        pg=list(d['query']['pages'].values())[0]
        if 'missing' not in pg and pg.get('categoryinfo',{}).get('files',0)>0:title=pg['title']
    if d is None:print('gave up; run again later');break
    if not title:
        d=get('action=query&list=search&srnamespace=14&srlimit=5&srsearch='+urllib.parse.quote('intitle:"'+p['n']+'" football'))
        hits=[h['title'] for h in (d or {}).get('query',{}).get('search',[]) if h['title'].lower().startswith('category:'+p['n'].lower())]
        title=hits[0] if hits else None
    fl=[]
    if title:
        d=get('action=query&generator=categorymembers&gcmtitle='+urllib.parse.quote(title)+'&gcmtype=file&gcmlimit=60&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=LicenseShortName|Artist|Categories|ImageDescription|DateTimeOriginal')
        for pg in (d or {}).get('query',{}).get('pages',{}).values():
            if 'imageinfo' not in pg:continue
            ii=pg['imageinfo'][0];m=ii.get('extmetadata',{});g=lambda k:strip(m.get(k,{}).get('value',''))
            fl.append({'title':pg['title'],'w':ii['width'],'h':ii['height'],'mime':ii.get('mime'),'url':ii['url'].split('?')[0],'lic':g('LicenseShortName'),'artist':g('Artist')[:80],'cats':g('Categories')[:600],'desc':g('ImageDescription')[:400],'date':g('DateTimeOriginal')[:30]})
    res[p['id']]={'cat':title,'files':fl};save();print(i+1,p['n'],len(fl),flush=True)
# summary: free license (no NonCommercial / NoDerivatives), decent size, and the photo mentions the player's CURRENT team
def ok(f,p):
    l=f['lic'].upper();t=(f['cats']+' '+f['desc']+' '+f['title']).lower()
    return (l.startswith('CC BY') or l.startswith('CC0') or 'PUBLIC DOMAIN' in l) and 'NC' not in l and 'ND' not in l and f['mime'] in('image/jpeg','image/png') and f['w']>=700 and f['h']>=700 and (p['nick'].lower() in t or p['t'].lower() in t.split())
done=[p for p in top if p['id'] in res];good=[p for p in done if any(ok(f,p) for f in res[p['id']]['files'])]
anyp=[p for p in done if res[p['id']]['files']]
print(f'\nSurveyed {len(done)} of {len(top)}. Any photo found: {len(anyp)}. Usable (free license, big enough, shows current team): {len(good)} = {100*len(good)//max(1,len(done))}%')
for pos in ['QB','RB','WR','TE','K']:
    s=[p for p in done if p['pos']==pos];print(' ',pos,len([p for p in s if p in good]),'of',len(s))
json.dump([p['id'] for p in good],open(H+'/usable.json','w'))
