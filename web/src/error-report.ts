export function errorText(value: unknown): string {
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : 'Unknown runtime error';
  return message.replace(/https?:\/\/[^\s]+/g, raw => {
    try { const url = new URL(raw); return url.origin + url.pathname; } catch { return '[URL]'; }
  }).replace(/\b(?:access_token|refresh_token|client_secret|authorization|code|state)\s*[:=]\s*[^\s&,]+/gi, '[redacted]').slice(0, 1000);
}

export class ErrorReport {
  private panel = document.createElement('aside');
  private summary = document.createElement('span');
  private details = document.createElement('pre');
  private copy = document.createElement('button');
  private dismiss = document.createElement('button');
  private last = '';
  private repeats = 0;
  constructor(root: HTMLElement) {
    this.panel.className = 'runtime-error'; this.panel.hidden = true; this.panel.setAttribute('aria-label', 'Application error');
    this.summary.role = 'alert'; this.copy.type = this.dismiss.type = 'button'; this.copy.textContent = 'Copy error'; this.dismiss.textContent = 'Dismiss';
    const disclosure = document.createElement('details'), label = document.createElement('summary'); label.textContent = 'Error details'; disclosure.append(label, this.details);
    this.panel.append(this.summary, this.copy, this.dismiss, disclosure); root.prepend(this.panel);
    this.copy.addEventListener('click', this.copyError); this.dismiss.addEventListener('click', this.hide);
    window.addEventListener('error', this.error); window.addEventListener('unhandledrejection', this.rejection);
  }
  private show(kind: string, value: unknown): void {
    const text = kind + ': ' + errorText(value); this.repeats = text === this.last ? this.repeats + 1 : 1; this.last = text;
    this.summary.textContent = 'Something broke' + (this.repeats > 1 ? ` (${this.repeats} times)` : '');
    this.details.textContent = text; this.copy.textContent = 'Copy error'; this.panel.hidden = false;
  }
  private error = (event: ErrorEvent): void => { if (event.message || event.error) this.show('Runtime error', event.error ?? event.message); };
  private rejection = (event: PromiseRejectionEvent): void => this.show('Unhandled rejection', event.reason);
  private hide = (): void => { this.panel.hidden = true; };
  private copyError = (): void => { if (!navigator.clipboard) { this.copy.textContent = 'Copy unavailable'; return; } void navigator.clipboard.writeText(this.last).then(() => { this.copy.textContent = 'Copied'; }, () => { this.copy.textContent = 'Copy failed'; }); };
  stop(): void { window.removeEventListener('error', this.error); window.removeEventListener('unhandledrejection', this.rejection); this.copy.removeEventListener('click', this.copyError); this.dismiss.removeEventListener('click', this.hide); this.panel.remove(); }
}
