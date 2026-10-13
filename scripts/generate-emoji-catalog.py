#!/usr/bin/env python3
"""Generate pinned Unicode catalog and validate/extract only local Twemoji SVG assets."""
import hashlib,json,re,sys,tarfile
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
UNICODE_SHA='1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda'
TWEMOJI_SHA='b07d2bdfffabc3918ac5f9a87d08b22164e70530522459153b59364b25422eb8'
def main():
 raw=(ROOT/'scripts/data/unicode-17/emoji-test.txt').read_bytes();assert hashlib.sha256(raw).hexdigest()==UNICODE_SHA
 archive=Path(sys.argv[1]);assert archive.stat().st_size<50_000_000 and hashlib.sha256(archive.read_bytes()).hexdigest()==TWEMOJI_SHA
 target=ROOT/'web/public/emoji/twemoji-17.0.3';target.mkdir(parents=True,exist_ok=True)
 with tarfile.open(archive) as tar:
  svgs={Path(m.name).name:m for m in tar.getmembers() if m.isfile() and '/assets/svg/' in m.name}
  assert len(svgs)==4009 and sum(m.size for m in svgs.values())<12_000_000
  svg_bytes={name:tar.extractfile(m).read() for name,m in svgs.items()}
  for name,m in svgs.items():
   assert re.fullmatch(r'[0-9a-f]+(?:-[0-9a-f]+)*\.svg',name) and m.size<=65536
  group=subgroup='';rows=[];assets={}
  for line in raw.decode().splitlines():
   if line.startswith('# group:'):group=line.split(':',1)[1].strip()
   elif line.startswith('# subgroup:'):subgroup=line.split(':',1)[1].strip()
   elif '; fully-qualified' in line:
    points=line.split(';')[0].split();code=''.join(chr(int(x,16)) for x in points);name=re.search(r'# .*? E([\d.]+) (.*)$',line);assert name
    candidates=['-'.join(x.lower().lstrip('0') or '0' for x in points),'-'.join(x.lower().lstrip('0') or '0' for x in points if x!='FE0F')]
    asset=next((x+'.svg' for x in candidates if x+'.svg' in svgs),None);assert asset,'missing image '+code
    data=svg_bytes[asset];svg=ET.fromstring(data)
    for element in svg.iter():
     assert element.tag.rsplit('}',1)[-1] not in ['script','foreignObject','image','iframe']
     content=(element.text or '')+' '+' '.join(element.attrib.values())
     assert not re.search(r'(?:https?:|javascript:|data:|@import)',content,re.I)
     assert all(reference.strip(' \"\'').startswith('#') for reference in re.findall(r'url\(([^)]+)\)',content,re.I))
     assert all(not key.rsplit('}',1)[-1].lower().startswith('on') and not ('href' in key and not value.startswith('#')) for key,value in element.attrib.items())
    (target/asset).write_bytes(data);assets[asset]=hashlib.sha256(data).hexdigest()
    rows.append({'code':code,'name':name[2],'group':group,'subgroup':subgroup,'version':name[1],'asset':asset,'tones':[x.lower() for x in points if '1F3FB'<=x<='1F3FF' and len(x)==5]})
  assert len(rows)==3944 and len({r['code'] for r in rows})==3944
  license_member=next(m for m in tar.getmembers() if m.name.endswith('/LICENSE-GRAPHICS'))
  (target/'LICENSE-GRAPHICS.txt').write_bytes(tar.extractfile(license_member).read())
  (ROOT/'web/src/emoji-catalog.ts').write_text('// Generated from Unicode Emoji 17.0; see scripts/data/unicode-17/LICENSE.txt.\nexport const EMOJI_VERSION="17.0";\nexport interface CatalogEmoji {code:string;name:string;group:string;subgroup:string;version:string;asset:string;tones:readonly string[]}\nexport const EMOJI_CATALOG:readonly CatalogEmoji[]='+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n')
  (ROOT/'docs/emoji-sources.json').write_text(json.dumps({'unicodeVersion':'17.0','unicodeURL':'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt','unicodeSHA256':UNICODE_SHA,'twemojiVersion':'17.0.3','twemojiURL':'https://api.github.com/repos/jdecked/twemoji/tarball/v17.0.3','twemojiSHA256':TWEMOJI_SHA,'catalogEntries':len(rows),'assetCount':len(assets),'assetBytes':sum((target/x).stat().st_size for x in assets),'maxAssetBytes':max((target/x).stat().st_size for x in assets),'assets':assets},indent=2)+'\n')
  print('Generated',len(rows),'entries and',len(assets),'validated SVGs')
if __name__=='__main__':main()
