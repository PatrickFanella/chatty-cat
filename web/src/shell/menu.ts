// Popover menu primitive: anchored, keyboard navigable, closes on outside click or Escape. One menu is open at a time.
export interface MenuItem {
  label: string;
  hint?: string | undefined;
  disabled?: boolean | undefined;
  checked?: boolean | undefined;
  run: () => void;
}
export interface MenuSection {
  title?: string;
  items: MenuItem[];
}
let current: { root: HTMLElement; close: () => void } | undefined;
export function closeMenus(): void {
  current?.close();
}
export function openMenu(
  anchor: HTMLElement,
  sections: MenuSection[],
  options: { align?: 'start' | 'end'; label?: string; wide?: boolean } = {},
): HTMLElement {
  closeMenus();
  const root = document.createElement('div');
  root.className = 'shell-menu' + (options.wide ? ' shell-menu-wide' : '');
  root.setAttribute('role', 'menu');
  if (options.label) root.setAttribute('aria-label', options.label);
  const buttons: HTMLButtonElement[] = [];
  for (const section of sections) {
    if (!section.items.length) continue;
    const group = document.createElement('div');
    group.className = 'shell-menu-section';
    group.setAttribute('role', 'group');
    if (section.title) {
      const title = document.createElement('div');
      title.className = 'shell-menu-title';
      title.textContent = section.title;
      group.append(title);
    }
    for (const item of section.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemcheckbox');
      button.className = 'shell-menu-item';
      button.disabled = item.disabled === true;
      button.tabIndex = -1;
      if (item.checked !== undefined) button.setAttribute('aria-checked', String(item.checked));
      const label = document.createElement('span');
      label.textContent = item.label;
      button.append(label);
      if (item.hint) {
        const hint = document.createElement('kbd');
        hint.textContent = item.hint;
        button.append(hint);
      }
      button.addEventListener('click', () => {
        close();
        item.run();
      });
      group.append(button);
      buttons.push(button);
    }
    root.append(group);
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : anchor;
  const close = (): void => {
    if (current?.root !== root) return;
    current = undefined;
    root.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keys, true);
    window.removeEventListener('resize', close);
    anchor.setAttribute('aria-expanded', 'false');
    if (root.contains(document.activeElement) || document.activeElement === document.body) previous.focus();
  };
  const outside = (event: Event): void => {
    if (!root.contains(event.target as Node) && !anchor.contains(event.target as Node)) close();
  };
  const keys = (event: KeyboardEvent): void => {
    const index = buttons.findIndex((button) => button === document.activeElement);
    const enabled = buttons.filter((button) => !button.disabled);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return;
    if (event.key === 'Tab') {
      close();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!enabled.length) return;
    const at = enabled.indexOf(buttons[index]!);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? enabled.length - 1
          : event.key === 'ArrowDown'
            ? (at + 1) % enabled.length
            : (at - 1 + enabled.length) % enabled.length;
    enabled[next]!.focus();
  };
  // A menu anchored in a modal must stay inside that dialog's active subtree.
  // Body siblings are inert while showModal() owns the browser's top layer.
  (anchor.closest('dialog[open]') ?? document.body).append(root);
  current = { root, close };
  anchor.setAttribute('aria-expanded', 'true');
  const rect = anchor.getBoundingClientRect();
  const width = root.offsetWidth,
    height = root.offsetHeight;
  const left = options.align === 'end' ? Math.max(8, rect.right - width) : Math.min(rect.left, innerWidth - width - 8);
  const top = rect.bottom + 6 + height > innerHeight ? Math.max(8, rect.top - 6 - height) : rect.bottom + 6;
  root.style.left = Math.max(8, left) + 'px';
  root.style.top = top + 'px';
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', keys, true);
  window.addEventListener('resize', close);
  buttons.find((button) => !button.disabled)?.focus();
  return root;
}
