#!/usr/bin/env python3
"""Package the reviewed MV3 files, excluding tests and local browser data."""
import argparse
from pathlib import Path
import zipfile
parser=argparse.ArgumentParser()
parser.add_argument('output',type=Path)
parser.add_argument('--browser',choices=('chromium','firefox'),default='chromium')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]/'companion'/'browser'
with zipfile.ZipFile(args.output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    manifest='manifest.firefox.json' if args.browser=='firefox' else 'manifest.json'
    archive.write(root/manifest,'manifest.json')
    for name in ('background.js','core.js','popup.html','popup.js'):
        archive.write(root/name,name)
    if args.browser=='firefox':
        archive.write(root/'firefox-content.js','firefox-content.js')
print(args.output)
