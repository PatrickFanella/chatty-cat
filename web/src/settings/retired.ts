// Panel ids replaced by Settings pages. Kept apart from the settings chunk so startup can
// clean saved layouts and route old help actions without loading the window.
import type { PageId } from './registry';

export interface RetiredTarget {
  page: PageId;
  section?: string;
}

export const RETIRED_PANELS: Record<string, RetiredTarget> = {
  'display-panel': { page: 'general' },
  'presentation-panel': { page: 'general' },
  'link-preferences-panel': { page: 'general', section: 'Links and cards' },
  'completion-preferences-panel': { page: 'commands', section: 'Completion' },
  'provider-preferences-panel': { page: 'integrations', section: 'Providers and badges' },
};

/** Help-tab actions (and `htab=config`) that opened a retired panel. */
const RETIRED_ACTIONS: Record<string, string> = { 'display-open': 'display-panel' };

/** The Settings target for a retired panel id or help action, if it is one. */
export function retiredTarget(name: string): RetiredTarget | undefined {
  const id = Object.hasOwn(RETIRED_ACTIONS, name) ? RETIRED_ACTIONS[name]! : name;
  return Object.hasOwn(RETIRED_PANELS, id) ? RETIRED_PANELS[id] : undefined;
}

/** Drop retired ids from a saved workbench layout. */
export function forgetRetiredPanels(workbench: { forget(ids: readonly string[]): void }): void {
  workbench.forget(Object.keys(RETIRED_PANELS));
}
