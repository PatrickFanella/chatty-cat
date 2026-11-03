import type { CustomSection } from '../registry';
import type { SettingsHost } from '../host';

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
        return mountInto(el, info, reload, out);
      },
    },
  ];
}
