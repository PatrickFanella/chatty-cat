import { mountTooltips } from './tooltips';
// Shell entry: builds the top bar, command registry, palette and workbench over the existing feature modules.
import { CommandRegistry, type Command, type CommandGroup } from './registry';
import { CommandPalette, type PaletteEntry } from './palette';
import { Topbar } from './topbar';
import { Workbench } from './workbench';
import { closeMenus } from './menu';
import { privacyEnabled } from '../privacy';
import { applePlatform } from './platform';
import { mountIntro } from './intro';
export interface ShellAction {
  id: string;
  label: string;
  binding: string;
  context: string;
}
export interface ShellOptions {
  actions: readonly ShellAction[];
  run: (id: string) => void;
  available: (id: string) => boolean;
  extra: () => PaletteEntry[];
  /** Absent in readonly views (pane popout, ephemeral popout), which have no Settings window. */
  openSettings?: () => void;
}
export interface Shell {
  registry: CommandRegistry;
  workbench: Workbench;
  palette: CommandPalette;
  topbar: Topbar;
  stop: () => void;
}
const ACTION_GROUPS: Record<string, CommandGroup> = {
  compose: 'chat',
  'channel-next': 'chat',
  'channel-prev': 'chat',
  pause: 'chat',
  live: 'chat',
  reconnect: 'chat',
  'reload-emotes': 'providers',
  'zoom-in': 'view',
  'zoom-out': 'view',
  'pane-next': 'view',
  'pane-prev': 'view',
  'tab-next': 'view',
  'tab-prev': 'view',
  'pane-right': 'view',
  'pane-left': 'view',
  'tab-right': 'view',
  'tab-left': 'view',
};
// Panel hotkeys share the explicit panel commands registered by the application.
const DUPLICATE_ACTIONS = new Set([
  'palette',
  'shortcuts',
  'accounts',
  'workspace',
  'emotes',
  'video',
  'stats',
  'settings',
  'inbox',
  'commands',
  'history',
  'history-global',
  'desktop-playback',
  'desktop-overlay',
]);
export function prettyBinding(binding: string): string {
  if (!binding) return '';
  return binding
    .split('+')
    .map((part) =>
      part
        .replace(/^Key/, '')
        .replace(/^Digit/, '')
        .replace(/^Arrow/, '')
        .replace(/^BracketRight$/, ']')
        .replace(/^BracketLeft$/, '[')
        .replace(/^Equal$/, '=')
        .replace(/^Minus$/, '-')
        .replace(/^Meta$/, '⌘'),
    )
    .join('+');
}
function titleFor(registry: CommandRegistry, root: HTMLElement): string {
  const command = registry.all().find((entry) => entry.panel === root.id);
  const own =
    root.getAttribute('aria-label') ||
    root.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > legend')?.textContent?.trim();
  return (command?.label || own || 'Panel').replace(/^open /i, '').replace(/^search local chat archive$/i, 'Archive');
}
export function startShell(options: ShellOptions): Shell {
  document.documentElement.dataset.shell = 'true';
  const stopTooltips = mountTooltips();
  const header = document.querySelector<HTMLElement>('header')!;
  const registry = new CommandRegistry();
  for (const action of options.actions) {
    if (DUPLICATE_ACTIONS.has(action.id)) continue;
    registry.register({
      id: 'action:' + action.id,
      label: action.label,
      group: ACTION_GROUPS[action.id] ?? 'view',
      hint: prettyBinding(action.binding),
      run: () => options.run(action.id),
      available: () => options.available(action.id),
    });
  }
  const openSettings = options.openSettings;
  if (openSettings)
    registry.register({
      id: 'settings:open',
      label: 'Settings…',
      group: 'view',
      keywords: 'preferences options configure',
      hint: applePlatform() ? '⌘,' : 'Ctrl+,',
      // Privacy mode keeps Settings closed, as it does the palette.
      available: () => !privacyEnabled(),
      run: openSettings,
    });
  // Readonly popouts have no Settings window and no introduction.
  if (openSettings) mountIntro(document.getElementById('offline'));
  const workbench = new Workbench({
    titleFor: (root) => titleFor(registry, root),
    exclude: (root) => root.dataset.shellOwned !== undefined || root.closest('#topbar,.shell-menu') !== null,
    chat: true,
    centre:
      '#intro,#offline,#app-update,#stream,#room-state,#video-panel,main#log,.chat-workspace,#announcer,#composer,.message-navigation',
  });
  // Stream details and room modes share one quiet line above the log.
  const stream = document.getElementById('stream'),
    roomState = document.getElementById('room-state');
  if (stream && roomState && stream.parentElement === roomState.parentElement) {
    const info = document.createElement('div');
    info.className = 'wb-info';
    stream.before(info);
    info.append(stream, roomState);
  }
  // Logged out, the composer offers sign-in instead of an empty row; hidden while login is unavailable.
  const login = document.getElementById('login'),
    composer = document.getElementById('composer');
  let loginWatch: MutationObserver | undefined;
  if (login instanceof HTMLButtonElement && composer) {
    const prompt = document.createElement('button');
    prompt.type = 'button';
    prompt.id = 'composer-login';
    prompt.textContent = 'Log in to chat';
    prompt.addEventListener('click', () => login.click());
    const sync = (): void => {
      prompt.hidden = login.disabled;
    };
    sync();
    composer.append(prompt);
    if (typeof MutationObserver !== 'undefined') {
      loginWatch = new MutationObserver(sync);
      loginWatch.observe(login, { attributes: true, attributeFilter: ['disabled'] });
    }
  }
  const pickerButton = document.getElementById('picker-open');
  const openPicker = (): void => {
    if (options.available('emotes')) options.run('emotes');
  };
  pickerButton?.addEventListener('click', openPicker);
  const palette = new CommandPalette(registry, options.extra);
  const parts = {
    header,
    status: document.getElementById('status')!,
    rate: document.getElementById('rate')!,
    login: document.getElementById('login')!,
    account: document.getElementById('account')!,
    joined: document.getElementById('joined-channels')!,
    channelsForm: document.getElementById('channels') as HTMLFormElement,
    brand: header.querySelector<HTMLElement>('.brand')!,
    footer: document.querySelector<HTMLElement>('footer')!,
  };
  const topbar = new Topbar(
    parts,
    registry,
    () => {
      if (!privacyEnabled()) palette.toggle();
    },
    (command: Command) => (command.panel ? workbench.placementLabel(command.panel) : undefined),
  );
  document.body.prepend(topbar.root);
  const keys = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === 'KeyK') {
      event.preventDefault();
      event.stopPropagation();
      if (!privacyEnabled()) palette.toggle();
      return;
    }
    if (
      openSettings &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.code === 'Comma'
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!privacyEnabled()) openSettings();
      return;
    }
    if (event.key === 'Escape') closeMenus();
  };
  document.addEventListener('keydown', keys, true);
  return {
    registry,
    workbench,
    palette,
    topbar,
    stop: () => {
      document.removeEventListener('keydown', keys, true);
      stopTooltips();
      loginWatch?.disconnect();
      pickerButton?.removeEventListener('click', openPicker);
      palette.stop();
      registry.stop();
      workbench.stop();
      topbar.stop();
    },
  };
}
