#!/usr/bin/env python3
"""Refresh public evidence only. No Firebase credentials, property data, or outreach."""
import hashlib, html, ipaddress, json, os, re, socket, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler
from html.parser import HTMLParser
BASE = Path(__file__).resolve().parents[1]
MAX_BYTES = 2_000_000

def utc(): return datetime.now(timezone.utc).isoformat(timespec='seconds')
def digest(obj): return hashlib.sha256(json.dumps(obj,sort_keys=True).encode()).hexdigest()

def check_url(url):
    u=urlsplit(url)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.port not in (None,443):
        raise ValueError('Only public HTTPS sources allowed')
    ips={r[4][0] for r in socket.getaddrinfo(u.hostname,443,type=socket.SOCK_STREAM)}
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise ValueError('Nonpublic source blocked')
    return u.hostname.lower().removeprefix('www.')

class Redirects(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        check_url(newurl)
        # Do not send any custom credentials to a redirected domain.
        if urlsplit(req.full_url).hostname!=urlsplit(newurl).hostname:
            raise ValueError('Cross-host redirect requires source registry correction')
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def fetch(url,headers=None):
    check_url(url)
    with build_opener(Redirects()).open(Request(url,headers={'User-Agent':'BBCOR-ProspectResearch/1.0',**(headers or {})}),timeout=20) as r:
        raw=r.read(MAX_BYTES+1)
        if len(raw)>MAX_BYTES: raise ValueError('Source too large')
        if r.status!=200: raise ValueError('Source response unavailable')
        return raw.decode('utf-8',errors='replace')

class Visible(HTMLParser):
    def __init__(self): super().__init__(); self.hidden=0; self.parts=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','noscript'): self.hidden+=1
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript'): self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if not self.hidden:self.parts.append(data)

def text_from(raw):
    parser=Visible();parser.feed(raw);return re.sub(r'\s+',' ',html.unescape(' '.join(parser.parts))).strip()

def verify(entry,fetcher=fetch):
    text=text_from(fetcher(entry['sourceUrl']))
    # Curated registry defines an exact acquisition/strategy claim; mere HTTP 200 isn't verification.
    evidence=entry['evidencePhrase']
    if evidence.lower() not in text.lower(): raise ValueError('Acquisition evidence changed; human review required')
    if any(marker in text.lower() for marker in ('verify you are human','access denied','enable javascript and cookies')):
        raise ValueError('Source challenge, not evidence')
    public={k:entry.get(k,'') for k in ('company','buyerType','whyFits','caveat','sourceUrl','contactRoute')}
    public.update(sourceKey=entry['canonicalDomain'],canonicalDomain=entry['canonicalDomain'],aliases=entry.get('aliases',[]))
    # Contacts remain private; public feed contains official source routes only.
    public['emailVerification']='No direct contact verification in public feed'
    public['compiled']=utc()[:10]
    public['sourceVersion']=digest({k:v for k,v in public.items() if k!='compiled'})
    public['sourceVerification']={'status':'verified','method':'official acquisition evidence check','lastVerifiedAt':utc(),'lastCheckedAt':utc(),'evidence':evidence,'failures':0}
    return public

def refresh(registry,previous,fetcher=fetch):
    old={p['sourceKey']:p for p in previous.get('prospects',[])};rows=[];errors=[]
    for entry in registry:
        key=entry['canonicalDomain']
        try: rows.append(verify(entry,fetcher))
        except Exception as exc:
            errors.append({'sourceKey':key,'reason':str(exc)[:180]})
            if key in old:
                p=dict(old[key]);v=dict(p.get('sourceVerification',{}));v.update(status='stale — review source',lastCheckedAt=utc(),failures=v.get('failures',0)+1);p['sourceVerification']=v;rows.append(p)
    return {'schemaVersion':1,'updatedAt':utc(),'outboundContactLocked':True,'prospects':rows,'sourceErrors':errors}

QUERIES=[
 'industrial real estate buyer acquisition criteria United States vacant manufacturing facilities',
 'Kansas Missouri adaptive reuse developer acquisitions schools nursing homes',
 'commercial real estate acquisition criteria nationwide secondary markets'
]
def discover(key,previous):
    # Search results are leads, never verified buyer profiles. Human promotion requires a curated official source.
    found={p['url']:p for p in previous.get('candidates',[])}
    excluded={'linkedin.com','facebook.com','youtube.com','loopnet.com','crexi.com','wikipedia.org'}
    for q in QUERIES:
        payload=json.loads(fetch('https://api.search.brave.com/res/v1/web/search?'+urlencode({'q':q,'count':10}),{'X-Subscription-Token':key,'Accept':'application/json'}))
        for r in payload.get('web',{}).get('results',[]):
            url=r.get('url','');u=urlsplit(url)
            if u.scheme!='https' or not u.hostname or any(u.hostname==d or u.hostname.endswith('.'+d) for d in excluded):continue
            found[url]={'url':url,'title':r.get('title','')[:150],'discoveredAt':found.get(url,{}).get('discoveredAt',utc()),'lastSeenAt':utc(),'status':'Unverified — review official acquisition evidence'}
        time.sleep(1.1)
    return {'updatedAt':utc(),'candidates':list(found.values())[-500:]}

def main():
    path=BASE/'data/buyer-prospects.json';previous=json.loads(path.read_text()) if path.exists() else {}
    result=refresh(json.loads((BASE/'prospect-pipeline/sources.json').read_text()),previous)
    path.write_text(json.dumps(result,indent=2)+'\n')
    key=os.environ.get('BRAVE_SEARCH_API_KEY','')
    discovery=BASE/'data/buyer-discovery.json'
    if key:
        try:discovery.write_text(json.dumps(discover(key,json.loads(discovery.read_text()) if discovery.exists() else {}),indent=2)+'\n')
        except Exception: print('Search provider failed; previous discovery retained')
    print(json.dumps({'verified':sum(p['sourceVerification']['status']=='verified' for p in result['prospects']),'stale':len(result['sourceErrors']),'discoveryConfigured':bool(key)}))
    if result['sourceErrors']:print('Source fetch failures retained as stale, never marked verified.')
if __name__=='__main__':main()
