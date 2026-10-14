#!/usr/bin/env python3
"""Package the reviewed MV3 files, excluding tests and local browser data."""
import argparse
from pathlib import Path
import zipfile
parser=argparse.ArgumentParser()
parser.add_argument('output',type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]/'companion'/'browser'
with zipfile.ZipFile(args.output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for name in ('manifest.json','background.js','core.js','popup.html','popup.js'):
        archive.write(root/name,name)
print(args.output)
