#!/usr/bin/env python3
"""Guarded Chatty Cat release steps on NUC. Runs as root.

Installed as /usr/local/lib/chatty-cat-deploy/release.py; chatty-cat-autodeploy
calls it with sudo. Modes:

  install  <name>          copy build/out/<name> into releases/<name> as root
  prepare  <name> <commit> checkpoint, build the image, verify it in staging
  activate <name>          switch production, rolling back automatically on failure
  check    <name>          read-only rollback guards
  rollback <name>          return to the release that was live before <name>
"""
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path('/srv/apps/projects/chatty-cat')
CONTAINER = 'chatty-cat-chat-1'
STAGE_PORT = 13075


def run(*args, **kw):
    return subprocess.run(args, check=True, **kw)


def out(*args):
    return subprocess.check_output(args, text=True).strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def live_image():
    return out('docker', 'inspect', CONTAINER, '--format', '{{.Image}}')


def ready(port, host='127.0.0.1'):
    with urllib.request.urlopen(f'http://{host}:{port}/api/ready', timeout=5) as f:
        assert f.status == 200


def compose():
    return ['docker', 'compose', '-p', 'chatty-cat', '--env-file', str(ROOT / 'image.env'),
            '-f', str(ROOT / 'compose.nuc.yaml'), '-f', str(ROOT / 'compose.m4.yaml')]


def main():
    mode, name = sys.argv[1], sys.argv[2]
    if not re.fullmatch(r'chatty-cat-[0-9a-f]{7}-[0-9]{8}', name):
        raise SystemExit('invalid release name')
    short = name.split('-')[2]
    release = ROOT / 'releases' / name
    b = ROOT / 'recovery' / ('storage-' + name.removeprefix('chatty-cat-'))
    tag = 'chatty-cat:' + name.removeprefix('chatty-cat-')
    stage = 'chatty-cat-stage-' + short
    locks = []
    for p in [ROOT / 'deploy.lock', ROOT / 'seo-releases/deploy.lock']:
        f = open(p, 'a')
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(f)

    def manifest(commit=None):
        m = json.loads((release / 'manifest.json').read_text())
        assert not m['sourceIncludesUncommittedChanges'], 'release includes uncommitted changes'
        if commit:
            assert m['baseCommit'] == commit, 'release commit mismatch'
        for file, h in m['sha256'].items():
            assert digest(release / file) == h, file
        return m

    if mode == 'install':
        source = ROOT / 'build/out' / name
        if release.exists():
            raise SystemExit('release already installed')
        shutil.copytree(source, release, symlinks=False)
        for dirpath, dirnames, filenames in os.walk(release):
            for n in dirnames + filenames:
                p = pathlib.Path(dirpath) / n
                os.chown(p, 0, 0, follow_symlinks=False)
                os.chmod(p, os.stat(p).st_mode & ~0o022)
        os.chown(release, 0, 0)
        os.chmod(release, 0o755)
        print(json.dumps({'installed': name, 'files': len(manifest()['sha256'])}))
        return

    if mode == 'prepare':
        commit = sys.argv[3]
        old = live_image()
        m = manifest(commit)
        if b.exists():
            raise SystemExit('recovery checkpoint already exists')
        b.mkdir(mode=0o700)
        for n in ['compose.nuc.yaml', 'compose.m4.yaml', 'image.env']:
            (b / n).write_bytes((ROOT / n).read_bytes())
            (b / n).chmod(0o600)
        (b / 'current-target').write_text(os.readlink(ROOT / 'current'))
        (b / 'previous-image').write_text(old)
        (b / 'app-env.sha256').write_text(digest(ROOT / 'shared/app.env'))
        (b / 'rollback.json').write_text(json.dumps({'services': {'chat': {'image': old}}}))
        run('tar', '-czf', str(b / 'data-before.tar.gz'), '-C', str(ROOT / 'shared'), 'uploads', 'sync')
        (b / 'data-before.tar.gz').chmod(0o600)
        # transition: remove after the rename is deployed (older releases ship 'chatthing').
        binary = 'chatty-cat-server' if 'chatty-cat-server' in m['sha256'] else 'chatthing'
        run('docker', 'build', '-q', '-f', str(ROOT / 'Dockerfile.release'), '--build-arg', 'BIN=' + binary,
            '-t', tag, str(release), stdout=subprocess.DEVNULL)
        new = out('docker', 'image', 'inspect', tag, '--format', '{{.Id}}')
        (b / 'deployed-image').write_text(new)
        staging = b / 'staging-data'
        staging.mkdir()
        staging.chmod(0o755)
        for n in ['uploads', 'sync']:
            p = staging / n
            p.mkdir(mode=0o700)
            os.chown(p, 10001, 10001)
        try:
            run('docker', 'run', '-d', '--name', stage, '--network', 'host', '--read-only', '--cap-drop', 'ALL',
                '--security-opt', 'no-new-privileges:true', '--memory', '512m', '--pids-limit', '128',
                '--tmpfs', '/tmp:size=16m,noexec,nosuid', '--env-file', str(ROOT / 'shared/app.env'),
                '-e', f'CHATTY_CAT_ADDR=127.0.0.1:{STAGE_PORT}', '-e', 'CHATTY_CAT_ENV_FILE=/dev/null',
                '-e', 'CHATTY_CAT_UPLOAD_DIR=/app/uploads', '-e', 'CHATTY_CAT_SYNC_DIR=/app/sync',
                # transition: remove after the rename is deployed (older releases read CHATTHING_*).
                '-e', f'CHATTHING_ADDR=127.0.0.1:{STAGE_PORT}', '-e', 'CHATTHING_ENV_FILE=/dev/null',
                '-e', 'CHATTHING_UPLOAD_DIR=/app/uploads', '-e', 'CHATTHING_SYNC_DIR=/app/sync',
                '-v', f'{staging / "uploads"}:/app/uploads', '-v', f'{staging / "sync"}:/app/sync', new,
                stdout=subprocess.DEVNULL)
            for attempt in range(30):
                try:
                    ready(STAGE_PORT)
                    break
                except Exception:
                    if attempt == 29:
                        raise
                    time.sleep(1)
            # Every packaged file, not a sample, must match the manifest.
            listing = out('docker', 'exec', stage, 'sh', '-c',
                          'cd /app && find chatty-cat-server web/dist -type f -exec sha256sum {} +')
            packaged = {line.split(None, 1)[1]: line.split(None, 1)[0] for line in listing.splitlines()}
            # Dockerfile.release installs the release's binary as /app/chatty-cat-server.
            expected = {('chatty-cat-server' if k == binary else k): v for k, v in m['sha256'].items()
                        if k == binary or k.startswith('web/dist/')}
            assert packaged == expected, 'packaged files differ from the manifest'
            (b / 'staging-passed').write_text(f'readiness and {len(expected)} packaged hashes verified\n')
        finally:
            run('docker', 'rm', '-f', stage, stdout=subprocess.DEVNULL)
        print(json.dumps({'staged': name, 'image': new, 'packagedFiles': len(expected)}))
        return

    if mode not in ('activate', 'check', 'rollback'):
        raise SystemExit('unknown mode')
    assert (b / 'staging-passed').exists(), 'staging has not passed'
    new = (b / 'deployed-image').read_text()
    old = (b / 'previous-image').read_text()
    for n in ['compose.nuc.yaml', 'compose.m4.yaml']:
        assert (ROOT / n).read_bytes() == (b / n).read_bytes(), n + ' changed since prepare'
    assert digest(ROOT / 'shared/app.env') == (b / 'app-env.sha256').read_text(), 'app.env changed since prepare'
    base = compose()

    def restore(label):
        (ROOT / 'image.env').write_bytes((b / 'image.env').read_bytes())
        p = ROOT / ('current.' + label)
        p.symlink_to((b / 'current-target').read_text())
        p.replace(ROOT / 'current')
        run(*base, '-f', str(b / 'rollback.json'), 'up', '-d', '--no-build', '--no-deps', '--pull', 'never',
            '--wait', '--wait-timeout', '120', 'chat')

    if mode == 'activate':
        assert live_image() == old and os.readlink(ROOT / 'current') == (b / 'current-target').read_text()
        assert (ROOT / 'image.env').read_bytes() == (b / 'image.env').read_bytes()
        manifest()
        try:
            (ROOT / 'image.env').write_text('CHATTY_CAT_IMAGE=' + new + '\n')
            (ROOT / 'image.env').chmod(0o600)
            p = ROOT / 'current.deploy'
            p.symlink_to(str(release.relative_to(ROOT)))
            p.replace(ROOT / 'current')
            run(*base, 'up', '-d', '--no-build', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '120',
                'chat')
            assert live_image() == new
            (b / 'activated').write_text(time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
        except BaseException:
            restore('restore')
            raise
        print('activate passed')
        return
    assert live_image() == new and os.readlink(ROOT / 'current') == str(release.relative_to(ROOT))
    # transition: remove the CHATTHING_IMAGE line after the rename is deployed (older activations wrote it).
    assert (ROOT / 'image.env').read_text() in ('CHATTY_CAT_IMAGE=' + new + '\n', 'CHATTHING_IMAGE=' + new + '\n')
    if mode == 'check':
        print('Rollback guards passed; no changes')
        return
    restore('rollback')
    assert live_image() == old
    print('rollback passed')


if __name__ == '__main__':
    main()
