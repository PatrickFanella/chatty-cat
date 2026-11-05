import { getPresentation } from '../presentation';
let nextTooltip = 0;
export function mountTooltips(): () => void {
  const root = document.createElement('div');
  root.className = 'shell-tooltip';
  root.id = 'shell-tooltip-' + nextTooltip++;
  root.setAttribute('role', 'tooltip');
  let anchor: HTMLElement | undefined;
  let title: string | null = null;
  let described: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const close = (): void => {
    clearTimeout(timer);
    root.remove();
    if (anchor) {
      if (title !== null) anchor.setAttribute('title', title);
      if (described === null) anchor.removeAttribute('aria-describedby');
      else anchor.setAttribute('aria-describedby', described);
    }
    anchor = undefined;
  };
  const enter = (event: Event): void => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('button, input, select, textarea, a[title], [data-tooltip]')
        : null;
    if (!target || (event instanceof PointerEvent && event.pointerType === 'touch')) return;
    if (target === anchor) {
      if (event.type !== 'focusin') return;
      close();
    }
    const text = target.dataset.tooltip || target.title || target.getAttribute('aria-label');
    if (!text) return;
    close();
    anchor = target;
    title = target.getAttribute('title');
    described = target.getAttribute('aria-describedby');
    target.removeAttribute('title');
    const show = (): void => {
      if (anchor !== target || !target.isConnected) return;
      root.textContent = text;
      (target.closest('dialog[open]') || document.body).append(root);
      target.setAttribute('aria-describedby', [described, root.id].filter(Boolean).join(' '));
      const box = target.getBoundingClientRect();
      const scale = getPresentation().uiScale;
      root.style.left = Math.max(8, Math.min(box.left / scale, innerWidth / scale - root.offsetWidth - 8)) + 'px';
      root.style.top =
        Math.max(8, Math.min(box.bottom / scale + 6, innerHeight / scale - root.offsetHeight - 8)) + 'px';
    };
    if (event.type === 'focusin') show();
    else timer = setTimeout(show, getPresentation().tooltipDelay);
  };
  const leave = (event: Event): void => {
    if (event instanceof PointerEvent && event.relatedTarget instanceof Node && anchor?.contains(event.relatedTarget))
      return;
    close();
  };
  const key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('pointerover', enter);
  document.addEventListener('focusin', enter);
  document.addEventListener('pointerout', leave);
  document.addEventListener('focusout', close);
  document.addEventListener('pointerdown', close, true);
  document.addEventListener('keydown', key);
  document.addEventListener('privacychange', close);
  document.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  return () => {
    close();
    document.removeEventListener('pointerover', enter);
    document.removeEventListener('focusin', enter);
    document.removeEventListener('pointerout', leave);
    document.removeEventListener('focusout', close);
    document.removeEventListener('pointerdown', close, true);
    document.removeEventListener('keydown', key);
    document.removeEventListener('privacychange', close);
    document.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
  };
}
