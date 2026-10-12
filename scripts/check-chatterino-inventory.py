#!/usr/bin/env python3
"""Check audited identifiers against an unpacked, hash-pinned Chatterino source tree."""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'setting': 'src/singletons/Settings.hpp',
    'command': 'src/controllers/commands/CommandController.cpp',
    'hotkey': 'src/controllers/hotkeys/ActionNames.hpp',
    'default-hotkey': 'src/controllers/hotkeys/HotkeyController.cpp',
    'whisper-alias': 'src/providers/twitch/TwitchCommon.cpp',
    'command-completion': 'src/providers/twitch/TwitchCommon.cpp',
    'input-command': 'src/widgets/splits/SplitInput.cpp',
}

def extract(source):
    """Include platform/debug conditional declarations; omit commented-out code."""
    out = []
    def add(kind, name, path, text, offset, detail=''):
        out.append(dict(kind=kind, identifier=name, upstream_file=path,
                        upstream_line=str(text[:offset].count('\n') + 1), detail=detail))
    for kind, path in FILES.items():
        original = (source / path).read_text()
        text = re.sub(r'/\*.*?\*/|//[^\n]*', lambda m: ''.join('\n' if c == '\n' else ' ' for c in m[0]), original, flags=re.S)
        if kind == 'setting':
            pattern = r'((?:\w+Setting)(?:<[^;=]+?>)?)\s+(\w+)\s*(?:=\s*)?\{\s*"([^"]+)"'
            for m in re.finditer(pattern, text):
                add(kind, m[3], path, text, m.start(), m[2])
        elif kind == 'command':
            for m in re.finditer(r'registerCommand\("([^"]+)"', text):
                add(kind, m[1], path, text, m.start())
        elif kind == 'whisper-alias':
            m = re.search(r'TWITCH_WHISPER_COMMANDS\{([^}]+)\}', text)
            for alias in re.findall(r'"([^"]+)"', m[1]):
                add('command', alias, path, text, m.start(), 'whisper alias')
        elif kind == 'command-completion':
            m = re.search(r'TWITCH_DEFAULT_COMMANDS\{([^}]+)\}', text)
            for match in re.finditer(r'"([^"]+)"', m[1]):
                add(kind, match[1], path, text, m.start(1) + match.start(), 'completion catalog only; not execution proof')
        elif kind == 'input-command':
            m = re.search(r'text.startsWith\("(/r )"', text)
            add(kind, m[1].strip(), path, text, m.start(), 'last-whisper reply expansion')
        elif kind == 'hotkey':
            category = ''
            for m in re.finditer(r'HotkeyCategory::(\w+)|\{"(\w+)"\s*,\s*ActionDefinition', text):
                if m[1]:
                    category = m[1]
                else:
                    add(kind, category + ':' + m[2], path, text, m.start())
        else:
            for m in re.finditer(r'tryAddDefault\(\s*addedHotkeys,\s*HotkeyCategory::(\w+)', text):
                end = text.index(';', m.end())
                body = text[m.end():end]
                # Key sequence may contain nested expressions; locate its balanced close.
                if 'QKeySequence(' not in body:
                    match = re.search(r'QKeySequence::(\w+),\s*"([^"]+)"', body)
                    line = text[:m.start()].count('\n') + 1
                    add(kind, f'{m[1]}:{match[2]}:{line}', path, text, m.start(), 'QKeySequence::' + match[1])
                    continue
                start = body.index('QKeySequence(') + len('QKeySequence(')
                depth, pos, quoted, escaped = 1, start, False, False
                while depth:
                    char = body[pos]
                    if char == '"' and not escaped: quoted = not quoted
                    if not quoted:
                        if char == '(': depth += 1
                        if char == ')': depth -= 1
                    escaped = char == '\\' and not escaped
                    pos += 1
                action = re.search(r',\s*"([^"]+)"', body[pos:])[1]
                line = text[:m.start()].count('\n') + 1
                detail = ' '.join(body[start:pos-1].split())
                add(kind, f'{m[1]}:{action}:{line}', path, text, m.start(), detail)
    return out

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='unpacked Chatterino v2.5.6 source root')
    args = parser.parse_args()
    pin = json.loads((ROOT / 'docs/chatterino-source.json').read_text())
    for path, expected in pin['sha256'].items():
        actual = hashlib.sha256((args.source / path).read_bytes()).hexdigest()
        assert actual == expected, f'upstream bytes changed: {path}'
    rows = list(csv.DictReader((ROOT / 'docs/chatterino-coverage.csv').open()))
    upstream = extract(args.source)
    key = lambda row: (row['kind'], row['identifier'], row['upstream_file'], row['upstream_line'], row['detail'])
    assert len({key(r) for r in rows}) == len(rows), 'duplicate inventory identifiers'
    assert {key(r) for r in rows} == {key(r) for r in upstream}, 'missing or extra upstream declarations'
    assert all(r['state'] in {'implemented','partial','planned','companion-only','platform-limited'} for r in rows)
    for row in rows:
        assert row['acceptance'] and row['evidence'], key(row)
        if row['state'] in {'partial','planned','companion-only'}:
            assert re.fullmatch(r'(?:#[0-9]+)(?:;#[0-9]+)*', row['issues']), key(row)
        for path in row['evidence'].split(';'):
            assert (ROOT / path).is_file(), f'missing evidence file: {path}'
    from collections import Counter
    print(json.dumps({'declarations': dict(Counter(r['kind'] for r in rows)),
                      'states': dict(Counter(r['state'] for r in rows)), 'total': len(rows)}, indent=2))

if __name__ == '__main__':
    main()
