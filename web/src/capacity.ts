export interface Capacity {
  paneChannels: 6;
  workspaceChannels: number;
  subscriptions: number;
}
export function parseCapacity(value: unknown): Capacity | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('paneChannels' in value) ||
    value.paneChannels !== 6 ||
    !('workspaceChannels' in value) ||
    typeof value.workspaceChannels !== 'number' ||
    !Number.isInteger(value.workspaceChannels) ||
    value.workspaceChannels < 1 ||
    value.workspaceChannels > 24 ||
    !('subscriptions' in value) ||
    typeof value.subscriptions !== 'number' ||
    !Number.isInteger(value.subscriptions) ||
    value.subscriptions < value.workspaceChannels ||
    value.subscriptions > 96
  )
    return null;
  return { paneChannels: 6, workspaceChannels: value.workspaceChannels, subscriptions: value.subscriptions };
}
export async function loadCapacity(): Promise<Capacity> {
  try {
    const response = await fetch('/api/public-config', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const parsed = parseCapacity(await response.json());
      if (parsed) return parsed;
    }
  } catch {
    /* old/offline servers keep the original six-channel limit */
  }
  return { paneChannels: 6, workspaceChannels: 6, subscriptions: 96 };
}
