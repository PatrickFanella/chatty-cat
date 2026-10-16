import type { Panel } from './panels';
import type { CommandGroup } from './registry';
export function mountPanel<T extends HTMLElement>(markup: string, id: string): T {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const root = template.content.firstElementChild;
  if (!(root instanceof HTMLElement) || root.id !== id || document.getElementById(id))
    throw new Error('Invalid panel template or duplicate panel');
  document.body.append(root);
  return root as T;
}
export function panelAdapter(
  id: string,
  title: string,
  group: CommandGroup,
  root: HTMLElement,
  open: () => void,
  close: () => void,
  stop: () => void,
): Panel {
  return {
    id,
    title,
    group,
    root,
    open,
    close,
    stop: () => {
      stop();
      root.remove();
    },
  };
}

export function transientRoot(id: string, label: string): HTMLElement {
  const root = document.createElement('section');
  root.id = id;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', label);
  root.hidden = true;
  document.body.append(root);
  return root;
}
