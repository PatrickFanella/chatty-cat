export const ACTIONS = [
  { id: 'palette', label: 'Search actions and quick switch', context: 'global', binding: 'Alt+KeyK' },
  { id: 'compose', label: 'Focus composer', context: 'chat', binding: 'Alt+KeyM' },
  { id: 'channel-next', label: 'Next send channel', context: 'chat', binding: 'Alt+BracketRight' },
  { id: 'channel-prev', label: 'Previous send channel', context: 'chat', binding: 'Alt+BracketLeft' },
  { id: 'pane-next', label: 'Next pane', context: 'splits', binding: 'Alt+ArrowRight' },
  { id: 'pane-prev', label: 'Previous pane', context: 'splits', binding: 'Alt+ArrowLeft' },
  { id: 'tab-next', label: 'Next chat tab', context: 'splits', binding: 'Alt+ArrowDown' },
  { id: 'tab-prev', label: 'Previous chat tab', context: 'splits', binding: 'Alt+ArrowUp' },
  { id: 'pane-right', label: 'Move pane right', context: 'splits', binding: 'Alt+Shift+ArrowRight' },
  { id: 'pane-left', label: 'Move pane left', context: 'splits', binding: 'Alt+Shift+ArrowLeft' },
  { id: 'tab-right', label: 'Move tab right', context: 'splits', binding: 'Alt+Shift+ArrowDown' },
  { id: 'tab-left', label: 'Move tab left', context: 'splits', binding: 'Alt+Shift+ArrowUp' },
  { id: 'accounts', label: 'Open account profiles', context: 'chat', binding: 'Alt+KeyA' },
  { id: 'workspace', label: 'Manage workspaces', context: 'chat', binding: 'Alt+KeyW' },
  { id: 'reload-emotes', label: 'Reload provider emote metadata', context: 'chat', binding: 'F5' },
  { id: 'reconnect', label: 'Reconnect public chat', context: 'chat', binding: 'Alt+KeyR' },
  { id: 'zoom-in', label: 'Increase chat text size', context: 'chat', binding: 'Alt+Equal' },
  { id: 'zoom-out', label: 'Decrease chat text size', context: 'chat', binding: 'Alt+Minus' },
  { id: 'pause', label: 'Hold active reader', context: 'chat', binding: 'Alt+KeyS' },
  { id: 'live', label: 'Jump active reader to live', context: 'chat', binding: 'Alt+KeyL' },
  { id: 'history', label: 'Search current channel history', context: 'chat', binding: 'Alt+KeyH' },
  { id: 'history-global', label: 'Search joined-channel history', context: 'chat', binding: 'Alt+Shift+KeyH' },
  { id: 'emotes', label: 'Toggle emote picker', context: 'chat', binding: 'Alt+KeyE' },
  { id: 'video', label: 'Toggle video', context: 'chat', binding: 'Alt+KeyV' },
  { id: 'desktop-playback', label: 'Open desktop playback setup and review', context: 'chat', binding: '' },
  { id: 'desktop-overlay', label: 'Open native overlay setup and review', context: 'chat', binding: '' },
  { id: 'stats', label: 'Open statistics', context: 'chat', binding: 'Alt+KeyT' },
  { id: 'settings', label: 'Open display settings', context: 'chat', binding: 'Alt+KeyD' },
  { id: 'inbox', label: 'Open conversation inbox', context: 'chat', binding: 'Alt+KeyI' },
  { id: 'commands', label: 'Open custom commands', context: 'chat', binding: 'Alt+KeyC' },
  { id: 'shortcuts', label: 'Edit keyboard shortcuts', context: 'chat', binding: 'Alt+KeyB' },
] as const satisfies readonly { id: string; label: string; context: 'global' | 'chat' | 'splits'; binding: string }[];
export type ActionID = (typeof ACTIONS)[number]['id'];
export type Bindings = Record<string, string>;
export interface HotkeyPreferences {
  version: 1;
  bindings: Bindings;
}
export function defaultBindings(): Bindings {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, a.binding]));
}
const CODE =
  /^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Bracket(Left|Right)|Equal|Minus|Slash|Backslash|Semicolon|Quote|Comma|Period|Space|Enter|Escape|Home|End|PageUp|PageDown|F([1-9]|1[0-2]))$/;
export function bindingFor(event: KeyboardEvent): string {
  return [
    ...(event.ctrlKey || event.metaKey ? ['Mod'] : []),
    ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
    event.code,
  ].join('+');
}
function valid(binding: string): boolean {
  if (!binding) return true;
  const pieces = binding.split('+'),
    code = pieces.pop();
  return (
    !!code &&
    CODE.test(code) &&
    pieces.length > 0 &&
    pieces.every((v) => ['Mod', 'Alt', 'Shift'].includes(v)) &&
    new Set(pieces).size === pieces.length &&
    pieces.some((v) => v === 'Mod' || v === 'Alt') &&
    ['Mod', 'Alt', 'Shift'].filter((v) => pieces.includes(v)).join('+') === pieces.join('+')
  );
}
function reserved(binding: string): boolean {
  if (binding === 'Alt+Shift+KeyP' || binding === 'Alt+F4') return true;
  const pieces = binding.split('+'),
    code = pieces.at(-1) ?? '';
  if (pieces.includes('Mod') && !pieces.includes('Alt'))
    return [
      'KeyA',
      'KeyC',
      'KeyV',
      'KeyX',
      'KeyZ',
      'KeyY',
      'KeyF',
      'KeyG',
      'KeyL',
      'KeyT',
      'KeyW',
      'KeyN',
      'KeyR',
      'KeyQ',
      'KeyP',
      'KeyS',
      'KeyO',
      'KeyH',
      'KeyJ',
      'KeyK',
      'Tab',
      'Equal',
      'Minus',
      'Digit0',
      ...Array.from({ length: 9 }, (_, i) => 'Digit' + (i + 1)),
    ].includes(code);
  return pieces.includes('Mod') && pieces.includes('Alt') && ['KeyI', 'KeyJ', 'KeyC'].includes(code);
}
export function validateBindings(bindings: Bindings): string[] {
  const errors: string[] = [],
    used = new Map<string, string>();
  for (const action of ACTIONS) {
    const binding = bindings[action.id] ?? '';
    if (!valid(binding) && !(action.id === 'reload-emotes' && binding === 'F5')) {
      errors.push(action.label + ': use a modifier and physical key code, such as Alt+KeyM');
      continue;
    }
    if (reserved(binding)) {
      errors.push(action.label + ': binding conflicts with a browser shortcut or privacy panic key');
      continue;
    }
    if (binding) {
      const previous = used.get(binding);
      if (previous) errors.push('Conflict: ' + action.label + ' and ' + previous + ' both use ' + binding);
      used.set(binding, action.label);
    }
  }
  return errors;
}
export function parseHotkeys(value: unknown): HotkeyPreferences | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('version' in value) ||
    value.version !== 1 ||
    !('bindings' in value)
  )
    return null;
  const data = value.bindings;
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length > ACTIONS.length)
    return null;
  const bindings = defaultBindings();
  for (const [id, binding] of Object.entries(data)) {
    if (!ACTIONS.some((a) => a.id === id) || typeof binding !== 'string' || binding.length > 60) return null;
    bindings[id] = binding;
  }
  return validateBindings(bindings).length ? null : { version: 1, bindings };
}
export function canHandle(
  action: Pick<(typeof ACTIONS)[number], 'id' | 'context'>,
  event: KeyboardEvent,
  target: EventTarget | null,
  modal: boolean,
): boolean {
  if (
    event.isComposing ||
    event.key === 'Process' ||
    event.keyCode === 229 ||
    event.repeat ||
    event.defaultPrevented ||
    (event.ctrlKey && event.metaKey)
  )
    return false;
  if (modal) return false;
  const editable =
    target instanceof Element &&
    !!target.closest('input,textarea,select,[contenteditable=true],[contenteditable=""],[role=textbox]');
  return action.id === 'palette' || !editable;
}
