#!/usr/bin/env python3
"""Restore the pre-deployment Caddy config only if nobody has edited it since."""
import argparse
import hashlib
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('release')
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
if not re.fullmatch(r'\d{8}T\d{6}Z', args.release):
    parser.error('release must be a UTC deployment timestamp')

recovery = Path('/opt/server/management/data/chatty-cat-recovery') / args.release
config = Path('/opt/server/management/config/caddy/Caddyfile')
current = config.read_bytes()
expected = (recovery / 'Caddyfile.after.sha256').read_text().strip()
if hashlib.sha256(current).hexdigest() != expected:
    raise SystemExit('Caddyfile changed after deployment; review before rollback')
before = (recovery / 'Caddyfile.before').read_bytes()
if args.check:
    print('Rollback hash guard passed; configuration was not changed')
else:
    # Write in place: Docker bind-mounts this file's inode.
    config.write_bytes(before)
    try:
        subprocess.run(['docker', 'exec', 'caddy', 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile'], check=True)
        subprocess.run(['docker', 'exec', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'], check=True)
    except subprocess.CalledProcessError:
        config.write_bytes(current)
        raise
    print('Previous Caddy configuration restored; release files retained')
