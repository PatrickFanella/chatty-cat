import type { CustomSection } from '../registry';
import type { SettingsHost } from '../host';
import { profileKey } from '../../account-profiles';
import { firstVisitDisplay, parseDisplay, type DisplayOptions } from '../../display';
import { captureBundle, parseBundle, restoreBundle, type SettingsBundle } from '../../settings-bundle';

const SLOTS_KEY = 'chatty-cat:v1:display-slots';

function readSlots(): (SettingsBundle | null)[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(profileKey(SLOTS_KEY)) ?? 'null');
    if (Array.isArray(values)) return [0, 1, 2].map((i) => parseBundle(values[i], parseDisplay));
  } catch {
    /* optional storage */
  }
  return [null, null, null];
}

/** The share URL keeps the display panel's parameter names, including `shade=auto`. */
function shareURL(options: DisplayOptions): URL {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(options))
    url.searchParams.set(
      ({ weight: 'wght', spacing: 'ls' } as Record<string, string>)[key] ?? key,
      key === 'shade' && options.autoShade ? 'auto' : typeof value === 'boolean' ? (value ? '1' : '0') : String(value),
    );
  return url;
}

function button(text: string, action: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', action);
  return b;
}

function status(): HTMLParagraphElement {
  const p = document.createElement('p');
  p.setAttribute('role', 'status');
  return p;
}

function mountInto(parent: HTMLElement, ...nodes: HTMLElement[]): () => void {
  const box = document.createElement('div');
  box.append(...nodes);
  parent.append(box);
  return () => box.remove();
}

export function builtinSections(host: SettingsHost): CustomSection[] {
  return [
    {
      id: 'builtin.alerts',
      page: 'notifications',
      section: 'Desktop alerts',
      keywords: 'test alert notification sound desktop',
      private: true,
      async mount(el) {
        const out = status();
        const send = button('Send test alert', () => {
          void host.attention
            .test()
            .then((text) => {
              out.textContent = text;
            })
            .catch((e) => {
              out.textContent = e instanceof Error ? e.message : 'Test alert unavailable';
            });
        });
        return mountInto(el, send, out);
      },
    },
    {
      id: 'builtin.moderation',
      page: 'moderation',
      section: 'Moderation',
      keywords: 'moderation presets workspace actions',
      private: true,
      async mount(el) {
        const note = document.createElement('p');
        note.textContent = 'Moderation presets live in the Moderation workspace, next to the actions they stage.';
        return mountInto(
          el,
          note,
          button('Open moderation workspace', () => host.openPanel('moderation-workspace')),
        );
      },
    },
    {
      id: 'builtin.providers',
      page: 'integrations',
      section: 'Providers and badges',
      keywords: 'reload provider metadata emotes badges status events cosmetics',
      private: true,
      async mount(el) {
        const info = document.createElement('p');
        info.textContent = host.providerStatus();
        const out = status();
        const reload = button('Reload provider metadata', () => {
          out.textContent = host.reloadProviders()
            ? 'Reload requested; existing server cache remains in effect.'
            : 'Wait 30 seconds between reload requests.';
          info.textContent = host.providerStatus();
        });
        const reconnect = button('Reconnect optional provider services', () => {
          host.reconnectProviders();
          info.textContent = host.providerStatus();
        });
        return mountInto(el, info, reload, reconnect, out);
      },
    },
    {
      id: 'builtin.completion-chatters',
      page: 'commands',
      section: 'Completion',
      keywords: 'chatters read load names completion moderator broadcaster',
      private: true,
      async mount(el) {
        const note = document.createElement('p');
        note.textContent =
          'Chatter reads need the saved opt-in above, read consent and broadcaster or moderator access. Each load reads at most 100 names; names stay in memory for five minutes.';
        const out = status();
        let generation = 0;
        const read = button('Read one completion chatter page', () => {
          const current = ++generation;
          out.textContent = 'Reading one completion chatter page…';
          void host
            .readChatters()
            .then((text) => {
              if (current === generation && !host.privacy()) out.textContent = text;
            })
            .catch((e) => {
              if (current === generation && !host.privacy())
                out.textContent = e instanceof Error ? e.message : 'Chatter read unavailable';
            });
        });
        const dispose = mountInto(el, note, read, out);
        return () => {
          generation++;
          dispose();
        };
      },
    },
    {
      id: 'builtin.display-slots',
      page: 'general',
      section: 'Saved settings',
      keywords: 'slots save recall snapshot share settings url link',
      private: true,
      async mount(el) {
        let slots = readSlots();
        let frame = 0;
        const note = document.createElement('p');
        note.textContent =
          'A slot stores display settings and panel state. Click to save an empty slot or recall a saved one; Shift-click or right-click overwrites.';
        const buttons = [0, 1, 2].map((index) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.slot = String(index);
          return b;
        });
        const paint = (): void => {
          for (const [index, b] of buttons.entries()) {
            const value = slots[index];
            b.textContent = 'Slot ' + (index + 1) + (value ? ' · saved' : ' · empty');
            b.title = value
              ? `${value.display.colour} · ${value.display.font} ${value.display.size}px. Click to recall; Shift-click or right-click overwrites.`
              : 'Click to save current settings and panel state';
          }
        };
        const slot = (event: MouseEvent): void => {
          const b = event.currentTarget as HTMLButtonElement;
          const index = Number(b.dataset.slot);
          event.preventDefault();
          const value = slots[index];
          if (value && !event.shiftKey && event.type !== 'contextmenu') {
            host.display.setOptions(parseDisplay(value.display));
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              frame = 0;
              restoreBundle(value);
              b.focus({ preventScroll: true });
            });
          } else {
            slots[index] = captureBundle(host.display.options);
            try {
              localStorage.setItem(profileKey(SLOTS_KEY), JSON.stringify(slots));
            } catch {
              /* optional storage */
            }
            paint();
          }
        };
        for (const b of buttons) {
          b.addEventListener('click', slot);
          b.addEventListener('contextmenu', slot);
        }
        paint();
        const output = document.createElement('input');
        output.readOnly = true;
        output.hidden = true;
        output.setAttribute('aria-label', 'Settings URL');
        const share = button('Share settings URL', () => {
          if (host.privacy()) return;
          const url = shareURL(host.display.options);
          // Panels add their own parameters to the same URL.
          document.dispatchEvent(new CustomEvent('share-settings', { detail: url }));
          output.value = url.href;
          output.hidden = false;
          output.select();
        });
        const storage = (event: StorageEvent): void => {
          if (event.key !== profileKey(SLOTS_KEY)) return;
          slots = readSlots();
          paint();
        };
        window.addEventListener('storage', storage);
        // Resetting every display setting at once asks for a second click; saved slots are kept.
        let armed = 0;
        const disarm = (): void => {
          clearTimeout(armed);
          armed = 0;
          reset.textContent = 'Reset all display settings';
        };
        const reset = button('', () => {
          if (!armed) {
            reset.textContent = 'Click again to reset';
            armed = window.setTimeout(disarm, 4000);
            return;
          }
          disarm();
          host.display.setOptions(firstVisitDisplay());
          // The emote picker applies its matching preset.
          document.dispatchEvent(new CustomEvent('displaypreset', { detail: 'nightshade' }));
        });
        disarm();
        const dispose = mountInto(el, note, ...buttons, share, output, reset);
        return () => {
          clearTimeout(armed);
          cancelAnimationFrame(frame);
          window.removeEventListener('storage', storage);
          dispose();
        };
      },
    },
  ];
}
