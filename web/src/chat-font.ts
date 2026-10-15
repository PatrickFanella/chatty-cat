// Only the selected face is requested. System and existing @font-face choices
// need no Google stylesheet; keep these requests identical to the old weights.
const GOOGLE_FAMILIES: Record<string, string> = {
  atkinson: 'Atkinson Hyperlegible',
  atkinsonmono: 'Atkinson Hyperlegible Mono:wght@400;600',
  comicneue: 'Comic Neue:wght@300;400;700',
  firacode: 'Fira Code:wght@400;600',
  plexmono: 'IBM Plex Mono:wght@400;600',
  inter: 'Inter',
  mono: 'JetBrains Mono:wght@400;600',
  lexend: 'Lexend:wght@400;600',
  shantell: 'Shantell Sans:wght@300..700',
  sourcecodepro: 'Source Code Pro:wght@400;600',
  sourcesans: 'Source Sans 3',
  vt323: 'VT323',
};

export function loadChatFont(font: string): void {
  const family = Object.hasOwn(GOOGLE_FAMILIES, font) ? GOOGLE_FAMILIES[font] : undefined;
  const existing = document.querySelector<HTMLLinkElement>('link[data-chat-font]');
  if (!family) {
    existing?.remove();
    return;
  }
  if (existing?.dataset.chatFont === font) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.chatFont = font;
  link.href = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}&display=swap`;
  if (existing) existing.replaceWith(link);
  else document.head.append(link);
}
