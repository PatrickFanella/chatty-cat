#!/usr/bin/env python3
"""Build a Linux release with matching public source and SHA-256 evidence."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--license', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    output = args.output.resolve()
    if output.exists():
        parser.error('output already exists; retain the previous release')
    if not args.license.is_file():
        parser.error('license file is missing')
    subprocess.run(['npm', 'run', 'build'], cwd=root / 'web', check=True)
    output.mkdir(parents=True)
    shutil.copytree(root / 'web/dist', output / 'web/dist')
    shutil.copy2(args.license, output / 'LICENSE')
    shutil.copy2(root / 'NOTICE.md', output / 'NOTICE.md')
    env = dict(os.environ, CGO_ENABLED='0', GOOS='linux', GOARCH='amd64')
    subprocess.run(['go', 'build', '-o', str(output / 'chatthing'), './cmd/chatthing'], cwd=root, env=env, check=True)
    sources = ['cmd', 'internal', 'web/src', 'web/public', 'web/index.html',
               'web/package.json', 'web/package-lock.json', 'web/tsconfig.json',
               'web/tsconfig.sw.json', 'web/vite.config.ts', 'web/vitest.config.ts',
               'go.mod', 'go.sum', 'README.md', 'NOTICE.md', 'Dockerfile',
               'compose.yaml', '.dockerignore', '.go-version', 'scripts',
               'deploy/Caddyfile', 'deploy/Caddyfile.host', 'deploy/README.md',
               'docs/architecture.md']
    with tarfile.open(output / 'source.tar.gz', 'w:gz') as archive:
        for name in sources:
            archive.add(root / name, arcname=name)
        archive.add(output / 'LICENSE', arcname='LICENSE')
    # The Go static handler serves Assets, not the release's parent directory.
    shutil.copy2(output / 'source.tar.gz', output / 'web/dist/source.tar.gz')
    hashes = {str(path.relative_to(output)): hashlib.sha256(path.read_bytes()).hexdigest()
              for path in sorted(output.rglob('*')) if path.is_file()}
    base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True))
    manifest = {'release': output.name.removeprefix('chatty-cat-'), 'baseCommit': base,
                'sourceIncludesUncommittedChanges': dirty, 'sha256': hashes}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'output': str(output), 'files': len(hashes)}))


if __name__ == '__main__':
    main()
