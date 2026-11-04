#!/usr/bin/env python3
"""Build the Chatty Cat desktop app for this machine: Linux x64 or macOS arm64.

Runs scripts/build-release.py for the host platform into desktop/build/server,
then packages it with Electron into desktop/dist. Run `npm --prefix web ci` and
`npm --prefix desktop ci` first.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys

TARGETS = {
    'linux': ('linux', 'amd64', ['--linux', '--x64']),
    'darwin': ('darwin', 'arm64', ['--mac', '--arm64']),
}


def main():
    if sys.platform not in TARGETS:
        raise SystemExit('build on Linux or macOS')
    goos, goarch, flags = TARGETS[sys.platform]
    root = Path(__file__).resolve().parents[1]
    desktop = root / 'desktop'
    build = desktop / 'build'
    for path in (build, desktop / 'dist'):
        shutil.rmtree(path, ignore_errors=True)
    build.mkdir()
    # electron-builder takes the app icon from build/icon.png.
    shutil.copy2(root / 'web/public/icon-512.png', build / 'icon.png')
    subprocess.run([sys.executable, str(root / 'scripts/build-release.py'), '--output', str(build / 'server'),
                    '--license', str(root / 'LICENSE')], check=True, env=dict(os.environ, GOOS=goos, GOARCH=goarch))
    commit = subprocess.check_output(['git', 'rev-parse', '--short=7', 'HEAD'], cwd=root, text=True).strip()
    subprocess.run(['npm', 'exec', '--', 'electron-builder', *flags, '--publish', 'never'], cwd=desktop, check=True,
                   env=dict(os.environ, CHATTY_BUILD=commit))


if __name__ == '__main__':
    main()
