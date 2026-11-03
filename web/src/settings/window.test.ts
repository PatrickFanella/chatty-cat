// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsRegistry, type CustomSection, type SettingDef } from './registry';
import { SettingsWindow } from './window';
import { readFileSync } from 'node:fs';

function mk(id: string, over: Partial<SettingDef> = {}, store: { v: unknown } = { v: false }): SettingDef {
  return {
    id,
    page: 'general',
    section: 'Appearance',
    label: id,
    control: { kind: 'toggle' },
    read: () => store.v,
    write: (v) => {
      store.v = v;
    },
    defaultValue: () => false,
    ...over,
  };
}

let wins: SettingsWindow[] = [];
function make(
  defs: (SettingDef | CustomSection)[],
  opts: { privacy?: () => boolean; storageAvailable?: boolean } = {},
) {
  const registry = new SettingsRegistry(opts.privacy ?? (() => false));
  registry.add(defs);
  const win = new SettingsWindow(registry, { storageAvailable: opts.storageAvailable ?? true });
  wins.push(win);
  return { registry, win };
}
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const row = (id: string) => q(`.settings-row[data-setting="${id}"]`);
const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: true }));
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  wins.forEach((w) => w.stop());
  wins = [];
  document.body.innerHTML = '';
});

describe('settings window', () => {
  it('renders the first page with ordered sections and rows', () => {
    const { win } = make([
      mk('f', { section: 'Font' }),
      mk('a', { section: 'Appearance' }),
      mk('acc', { page: 'accounts', section: 'Accounts' }),
    ]);
    win.open();
    expect(q('#settings-window')).toBe(win.root);
    expect(win.root.open).toBe(true);
    const secs = [...document.querySelectorAll('.settings-section')];
    expect(secs.map((s) => (s as HTMLElement).dataset.section)).toEqual(['Appearance', 'Font']);
    expect(secs[0]!.querySelector('h3')!.textContent).toBe('Appearance');
    expect(secs[0]!.querySelector('.settings-row[data-setting="a"]')).not.toBeNull();
    expect(secs[0]!.querySelector('button.settings-reset')!.textContent).toBe('Reset section');
    expect(document.querySelectorAll('nav.settings-nav button[data-page]').length).toBe(11);
    expect(q('button[data-page="general"]').getAttribute('aria-current')).toBe('page');
    const label = row('a').querySelector('label')!;
    expect(label.htmlFor).toBe(row('a').querySelector('input')!.id);
  });

  it('toggle, choice, number, text and color controls write through def.write', () => {
    const writes: Record<string, unknown[]> = {};
    const w = (id: string) => (v: unknown) => {
      (writes[id] ??= []).push(v);
    };
    const { win } = make([
      mk('t', { write: w('t') }),
      mk('c', {
        control: {
          kind: 'choice',
          options: [
            { value: 1, label: 'One' },
            { value: 2, label: 'Two' },
          ],
        },
        read: () => 1,
        write: w('c'),
      }),
      mk('n', { control: { kind: 'number', min: 0, max: 200, step: 1 }, read: () => 5, write: w('n') }),
      mk('x', { control: { kind: 'text' }, read: () => '', write: w('x') }),
      mk('m', { control: { kind: 'text', multiline: true }, read: () => '', write: w('m') }),
      mk('k', { control: { kind: 'color' }, read: () => '#000000', write: w('k') }),
    ]);
    win.open();
    const t = row('t').querySelector<HTMLInputElement>('input[type=checkbox]')!;
    t.checked = true;
    fire(t, 'change');
    const c = row('c').querySelector<HTMLSelectElement>('select')!;
    c.value = '2';
    fire(c, 'change');
    const n = row('n').querySelector<HTMLInputElement>('input[type=number]')!;
    expect([n.min, n.max, n.step]).toEqual(['0', '200', '1']);
    n.value = '42';
    fire(n, 'change');
    const x = row('x').querySelector<HTMLInputElement>('input[type=text], input:not([type])')!;
    x.value = 'hi';
    fire(x, 'change');
    const m = row('m').querySelector<HTMLTextAreaElement>('textarea')!;
    m.value = 'a\nb';
    fire(m, 'change');
    const k = row('k').querySelector<HTMLInputElement>('input[type=color]')!;
    k.value = '#ff0000';
    fire(k, 'change');
    expect(writes).toEqual({ t: [true], c: [2], n: [42], x: ['hi'], m: ['a\nb'], k: ['#ff0000'] });
  });

  it('number input commits on change, not input', () => {
    const write = vi.fn();
    const { win } = make([mk('n', { control: { kind: 'number', min: 0, max: 200, step: 1 }, read: () => 5, write })]);
    win.open();
    const n = row('n').querySelector<HTMLInputElement>('input')!;
    n.value = '120';
    fire(n, 'input');
    expect(write).not.toHaveBeenCalled();
    fire(n, 'change');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(120);
  });

  it('rejects an emptied number field without writing', () => {
    const write = vi.fn();
    const { win } = make([mk('n', { control: { kind: 'number', min: 0, max: 200, step: 1 }, read: () => 5, write })]);
    win.open();
    const n = row('n').querySelector<HTMLInputElement>('input')!;
    n.value = '';
    fire(n, 'change');
    expect(write).not.toHaveBeenCalled();
    expect(n.value).toBe('5');
    expect(row('n').querySelector('.settings-error')!.textContent).toContain('Enter a number');
  });

  it('shows the stored value and an adjustment note when the store clamps', () => {
    const store = { v: 50 as unknown };
    const { win } = make([
      mk(
        'n',
        {
          control: { kind: 'number', min: 0, max: 100, step: 1 },
          write: (v) => {
            store.v = Math.min(100, Number(v));
          },
        },
        store,
      ),
    ]);
    win.open();
    const n = row('n').querySelector<HTMLInputElement>('input')!;
    n.value = '120';
    fire(n, 'change');
    expect(n.value).toBe('100');
    expect(row('n').querySelector('.settings-error')!.textContent).toContain('Adjusted');
  });

  it('shows the thrown message when a write fails', () => {
    const { win } = make([
      mk('t', {
        write: () => {
          throw new Error('Storage is full');
        },
      }),
    ]);
    win.open();
    const t = row('t').querySelector<HTMLInputElement>('input')!;
    t.checked = true;
    fire(t, 'change');
    expect(row('t').querySelector('.settings-error')!.textContent).toBe('Storage is full');
    expect(t.checked).toBe(false);
  });

  it('reset section writes each def defaultValue', () => {
    const w1 = vi.fn();
    const w2 = vi.fn();
    const { win } = make([
      mk('a', { write: w1, defaultValue: () => true }),
      mk('b', { section: 'Font', write: w2, defaultValue: () => false }),
    ]);
    win.open();
    q('.settings-section[data-section="Appearance"] button.settings-reset').click();
    expect(w1).toHaveBeenCalledWith(true);
    expect(w2).not.toHaveBeenCalled();
  });

  it('in search results the reset button says it resets only the shown rows', () => {
    const w1 = vi.fn();
    const w2 = vi.fn();
    const { win } = make([
      mk('a', { label: 'Alpha', write: w1, defaultValue: () => true }),
      mk('b', { label: 'Beta', write: w2, defaultValue: () => true }),
    ]);
    win.open();
    const s = q<HTMLInputElement>('nav.settings-nav input[type=search]');
    s.value = 'alpha';
    fire(s, 'input');
    const reset = q<HTMLButtonElement>('button.settings-reset');
    expect(reset.textContent).toBe('Reset shown');
    reset.click();
    expect(w1).toHaveBeenCalledWith(true);
    expect(w2).not.toHaveBeenCalled();
  });

  it('a choice setting with an empty value shows its placeholder option', () => {
    const { win } = make([
      mk('p', {
        label: 'Preset',
        read: () => '',
        control: { kind: 'choice', placeholder: 'Choose a preset…', options: [{ value: 'irc', label: 'IRC' }] },
      }),
    ]);
    win.open();
    const select = row('p').querySelector('select')!;
    expect(select.options[0]!.value).toBe('');
    expect(select.options[0]!.textContent).toBe('Choose a preset…');
    expect(select.value).toBe('');
  });

  it('embedded panels sit flat in their section and hide their own heading visually', () => {
    const css = readFileSync(process.cwd() + '/src/settings/settings.css', 'utf8');
    expect(css).toMatch(/\.settings-custom-body > \[data-embedded='true'\] \{[^}]*border: 0;[^}]*padding: 0;/);
    expect(css).toMatch(
      /\.settings-custom-body > \[data-embedded='true'\] > :is\(h1, h2\):first-of-type \{[^}]*clip-path: inset\(50%\);/,
    );
    expect(css).toMatch(/\.settings-reset \{[^}]*color: var\(--muted\);/);
    expect(css).toMatch(/\.settings-reset:hover[^{]*\{[^}]*color: var\(--accent\);/);
  });

  it('search shows results grouped by page and edits in place; clearing returns to the page', () => {
    const write = vi.fn();
    const { win } = make([
      mk('a', { label: 'Alpha' }),
      mk('z', { page: 'accounts', section: 'Accounts', label: 'Zebra stripes', write }),
    ]);
    win.open();
    const s = q<HTMLInputElement>('nav.settings-nav input[type=search]');
    s.value = 'zebra';
    fire(s, 'input');
    expect(document.querySelector('.settings-row[data-setting="a"]')).toBeNull();
    expect(document.querySelector('.settings-page h2')!.textContent).toBe('Accounts');
    const t = row('z').querySelector<HTMLInputElement>('input')!;
    t.checked = true;
    fire(t, 'change');
    expect(write).toHaveBeenCalledWith(true);
    s.value = '';
    fire(s, 'input');
    expect(document.querySelector('.settings-row[data-setting="a"]')).not.toBeNull();
    expect(document.querySelector('.settings-row[data-setting="z"]')).toBeNull();
  });

  it('search with no match shows "No settings match" and survives a bad pattern', () => {
    const { win } = make([mk('a')]);
    win.open();
    const s = q<HTMLInputElement>('nav.settings-nav input[type=search]');
    s.value = 'nothing-here';
    fire(s, 'input');
    expect(q('.settings-page').textContent).toContain('No settings match');
    s.value = '([';
    expect(() => fire(s, 'input')).not.toThrow();
    expect(q('.settings-page').textContent).toContain('No settings match');
  });

  it('open({ setting }) selects its page and focuses the row control', () => {
    const { win } = make([mk('a'), mk('z', { page: 'accounts', section: 'Accounts' })]);
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    win.open({ setting: 'z' });
    Element.prototype.scrollIntoView = original;
    expect(q('button[data-page="accounts"]').getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(row('z').querySelector('input'));
    // Only the page pane scrolls; scrollIntoView would move the dialog too.
    expect(scroll).not.toHaveBeenCalled();
  });

  it('re-reads values when registry notifies', () => {
    const store = { v: 'one' as unknown };
    const { win, registry } = make([mk('x', { control: { kind: 'text' } }, store)]);
    win.open();
    store.v = 'two';
    registry.notify();
    expect(row('x').querySelector<HTMLInputElement>('input')!.value).toBe('two');
  });

  it('re-reads values when switching pages', () => {
    const store = { v: 'one' as unknown };
    const { win } = make([
      mk('x', { control: { kind: 'text' } }, store),
      mk('z', { page: 'accounts', section: 'Accounts' }),
    ]);
    win.open();
    q('button[data-page="accounts"]').click();
    store.v = 'two';
    q('button[data-page="general"]').click();
    expect(row('x').querySelector<HTMLInputElement>('input')!.value).toBe('two');
  });

  it('privacy change hides private entries immediately', () => {
    let priv = false;
    const { win, registry } = make([mk('open'), mk('secret', { private: true })], {
      privacy: () => priv,
    });
    win.open();
    expect(document.querySelector('[data-setting="secret"]')).not.toBeNull();
    priv = true;
    registry.notify();
    expect(document.querySelector('[data-setting="secret"]')).toBeNull();
    expect(document.querySelector('[data-setting="open"]')).not.toBeNull();
    const s = q<HTMLInputElement>('nav.settings-nav input[type=search]');
    s.value = 'secret';
    fire(s, 'input');
    expect(document.querySelector('[data-setting="secret"]')).toBeNull();
  });

  it('custom section shows Loading, then content; failure shows Retry which remounts', async () => {
    let attempt = 0;
    const dispose = vi.fn();
    const custom: CustomSection = {
      id: 'cs',
      page: 'general',
      section: 'Appearance',
      keywords: 'custom',
      mount: async (host) => {
        attempt++;
        await flush();
        if (attempt === 1) throw new Error('boom');
        host.textContent = 'Mounted';
        return dispose;
      },
    };
    const { win } = make([custom]);
    win.open();
    expect(q('.settings-custom').textContent).toContain('Loading');
    await flush();
    await flush();
    expect(q('.settings-custom').textContent).toContain("Couldn't load");
    [...q('.settings-custom').querySelectorAll('button')].find((b) => b.textContent === 'Retry')!.click();
    await flush();
    await flush();
    expect(q('.settings-custom').textContent).toContain('Mounted');
    expect(attempt).toBe(2);
    win.stop();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(document.getElementById('settings-window')).toBeNull();
  });

  it('storage notice appears when storage is unavailable', () => {
    const { win } = make([mk('a')], { storageAvailable: false });
    win.open();
    expect(q('p.settings-notice').textContent).toBe("Changes won't be saved in this browser");
  });

  it('does not show the storage notice when storage works', () => {
    const { win } = make([mk('a')]);
    win.open();
    expect(document.querySelector('p.settings-notice')).toBeNull();
  });
});
