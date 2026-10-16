import type { AuthStatus } from './auth';
import { getProfileScope } from './account-profiles';
import { privacyEnabled } from './privacy';
import { ExtensionStore } from './extensions';
export function extensionActions(auth: AuthStatus | undefined, open: (selection: string) => void) {
  if (privacyEnabled() || !auth?.authenticated || !auth.userID || getProfileScope() !== auth.userID) return [];
  try {
    return new ExtensionStore(auth.userID)
      .all()
      .filter((entry) => entry.enabled)
      .flatMap((entry) =>
        [
          ...entry.manifest.commands.map((contribution) => ({ kind: 'command', ...contribution })),
          ...entry.manifest.views.map((contribution) => ({ kind: 'view', ...contribution })),
        ].map((contribution) => ({
          id: 'extension:' + entry.manifest.id + ':' + contribution.kind + ':' + contribution.id,
          label: entry.manifest.name + ': ' + contribution.title,
          context: 'local extension',
          run: () => open(entry.manifest.id + '/' + contribution.kind + '/' + contribution.id),
        })),
      );
  } catch {
    return [];
  }
}
