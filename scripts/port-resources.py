"""Port the original app's four curated resource tabs without executable markup."""
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import argparse

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', nargs='?', type=Path, default=ROOT.parent / 'index.html')
source = parser.parse_args().source.read_text()

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
        classes = [name for name in attrs.get('class', '').split() if name in ['linkcols', 'stbl', 'flow', 'xtra', 'live', 'news', 'wider', 'ag', 'note', 'authctl', 'au']]
        if tag == 'div': classes.append('resource-group')
        if classes: output += ' class="' + ' '.join(classes) + '"'
        if attrs.get('id') == 'authSections': output += ' id="resources-author-sections"'
        if tag == 'a':
            href = attrs.get('href', '')
            if href.startswith('?channel='):
                output += ' href="' + escape(href, quote=True) + '" data-channel-link="true"'
            elif urlparse(href).scheme in ['https', 'http'] and not urlparse(href).username:
                output += ' href="' + escape(href, quote=True) + '" target="_blank" rel="noopener noreferrer"'
            elif href == '#authors' and attrs.get('data-au'):
                output += ' href="#authors" data-au="' + escape(attrs['data-au'][:100], quote=True) + '"'
            for key in ['data-b', 'data-d']:
                value = attrs.get(key, '')
                if value.lstrip('-').isdigit() and len(value) <= 6: output += ' ' + key + '="' + value + '"'
            for key in ['data-w', 'data-g']:
                value = attrs.get(key, '')
                if urlparse(value).scheme in ['https', 'http'] and not urlparse(value).username:
                    output += ' ' + key + '="' + escape(value, quote=True) + '"'
            for key, choices in [('data-ainfo', ['0', '1', '2', '3']), ('data-asort', ['area', 'birth', 'activity'])]:
                if attrs.get(key) in choices: output += ' ' + key + '="' + attrs[key] + '" role="button" tabindex="0"'
            if attrs.get('title'): output += ' title="' + escape(attrs['title'], quote=True) + '"'
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
from reference_data import emit
emit('resource-data', tabs.tabs)
