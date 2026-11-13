#!/usr/bin/env python3
"""Build the browser releases of Chatty Cat: the chat server plus a launcher.

Writes chatty-cat-browser-<commit>-linux-x64.tar.gz and
chatty-cat-browser-<commit>-mac-arm64.tar.gz into the output directory. Each archive holds the scripts/build-release.py output
for that platform, the public Twitch client ID and the `chatty-cat` launcher,
which starts the server on localhost:47830 and opens the default browser.
Run `npm --prefix web ci` first.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

TARGETS = {'linux-x64': ('linux', 'amd64'), 'mac-arm64': ('darwin', 'arm64')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    args.output.mkdir(parents=True, exist_ok=True)
    commit = subprocess.check_output(['git', 'rev-parse', '--short=7', 'HEAD'], cwd=root, text=True).strip()
    with tempfile.TemporaryDirectory() as scratch:
        for platform, (goos, goarch) in TARGETS.items():
            name = f'chatty-cat-browser-{commit}-{platform}'
            folder = Path(scratch) / name
            subprocess.run([sys.executable, str(root / 'scripts/build-release.py'), '--output', str(folder),
                            '--license', str(root / 'LICENSE')], check=True,
                           env=dict(os.environ, GOOS=goos, GOARCH=goarch))
            shutil.copy2(root / 'desktop/twitch-client.json', folder / 'twitch-client.json')
            shutil.copy2(root / 'scripts/browser-launcher.sh', folder / 'chatty-cat')
            (folder / 'chatty-cat').chmod(0o755)
            archive = args.output / f'{name}.tar.gz'
            with tarfile.open(archive, 'w:gz') as tar:
                tar.add(folder, arcname=name)
            print(archive)


if __name__ == '__main__':
    main()
