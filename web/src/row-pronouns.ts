import { getPresentation } from './presentation';
import { privacyEnabled } from './privacy';

export function loadRowPronouns(
  row: HTMLElement,
  login: string,
  lookup: (login: string) => Promise<string | undefined>,
): void {
  if (!getPresentation().showPronouns || privacyEnabled() || !login) return;
  void lookup(login)
    .then((label) => {
      if (!label || label.length > 32 || !row.isConnected || !getPresentation().showPronouns || privacyEnabled())
        return;
      const name = row.querySelector('.name');
      if (!name) return;
      const chip = document.createElement('span');
      chip.className = 'chat-pronouns';
      chip.textContent = label;
      chip.setAttribute('aria-label', 'Pronouns: ' + label);
      name.after(chip);
    })
    .catch(() => {});
}
