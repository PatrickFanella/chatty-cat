"""Port the original app's four curated resource tabs without executable markup."""
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import json

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'index.html').read_text()

class Tabs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tabs = {}
        self.active = None
        self.depth = 0
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if not self.active and attrs.get('id') in ['htabRes', 'htabLib', 'htabLbr', 'htabAuth']:
            self.active = attrs['id']; self.tabs[self.active] = ''; self.depth = 1; return
        if not self.active: return
        if tag == 'div': self.depth += 1
        if tag not in ['div', 'span', 'a', 'b', 'i', 'em', 'strong', 'br', 'sup', 'p', 'ul', 'li']: return
        output = '<' + tag
        if tag == 'a':
            href = attrs.get('href', '')
            if href.startswith('?channel='):
                output += ' href="' + escape(href, quote=True) + '" data-channel-link="true"'
            elif urlparse(href).scheme in ['https', 'http'] and not urlparse(href).username:
                output += ' href="' + escape(href, quote=True) + '" target="_blank" rel="noopener noreferrer"'
            if attrs.get('title'): output += ' title="' + escape(attrs['title'], quote=True) + '"'
        if tag == 'div': output += ' class="resource-group"'
        self.tabs[self.active] += output + '>'
    def handle_endtag(self, tag):
        if not self.active: return
        if tag == 'div':
            self.depth -= 1
            if self.depth == 0: self.active = None; return
        if tag in ['div', 'span', 'a', 'b', 'i', 'em', 'strong', 'sup', 'p', 'ul', 'li']:
            self.tabs[self.active] += '</' + tag + '>'
    def handle_data(self, data):
        if self.active: self.tabs[self.active] += escape(data)

tabs = Tabs(); tabs.feed(source)
if len(tabs.tabs) != 4: raise ValueError('Original resource tabs changed')
output = '// Curated links and attribution ported from the original AGPL app.\n'
output += 'export const RESOURCE_TABS: Record<string, string> = ' + json.dumps(tabs.tabs, ensure_ascii=False, indent=2) + ';\n'
(ROOT / 'rebuild/web/src/resource-data.ts').write_text(output)
