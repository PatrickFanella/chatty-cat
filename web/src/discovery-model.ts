export type DiscoveryKind = 'followed' | 'live' | 'chatters';
export interface DiscoveryItem {
  id: string;
  login: string;
  name: string;
  title: string;
  category: string;
  viewers: number;
}
export interface DiscoveryPage {
  kind: DiscoveryKind;
  channel: string;
  accountID: string;
  items: DiscoveryItem[];
  after: string;
  total: number;
  observedAt: number;
}
function object(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function text(v: unknown, max: number): v is string {
  return typeof v === 'string' && [...v].length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(v);
}
export function parseDiscovery(value: unknown): DiscoveryPage {
  if (
    !object(value) ||
    !['followed', 'live', 'chatters'].includes(String(value.kind)) ||
    !text(value.channel, 25) ||
    !text(value.accountID, 30) ||
    !/^\d+$/.test(value.accountID) ||
    !text(value.after, 512) ||
    !Number.isSafeInteger(value.total) ||
    Number(value.total) < 0 ||
    !Number.isSafeInteger(value.observedAt) ||
    Number(value.observedAt) < 0 ||
    !Array.isArray(value.items) ||
    value.items.length > 100
  )
    throw new Error('Invalid discovery page');
  const items = value.items.map((v): DiscoveryItem => {
    if (
      !object(v) ||
      !text(v.id, 30) ||
      !/^\d+$/.test(v.id) ||
      !text(v.login, 25) ||
      !/^[a-z0-9_]{1,25}$/.test(v.login) ||
      !text(v.name, 100) ||
      (v.title !== undefined && !text(v.title, 500)) ||
      (v.category !== undefined && !text(v.category, 100)) ||
      (v.viewers !== undefined && (!Number.isSafeInteger(v.viewers) || Number(v.viewers) < 0))
    )
      throw new Error('Invalid discovery row');
    return {
      id: v.id,
      login: v.login,
      name: v.name,
      title: typeof v.title === 'string' ? v.title : '',
      category: typeof v.category === 'string' ? v.category : '',
      viewers: typeof v.viewers === 'number' ? v.viewers : 0,
    };
  });
  const kind = value.kind === 'followed' ? 'followed' : value.kind === 'live' ? 'live' : 'chatters';
  return {
    kind,
    channel: value.channel,
    accountID: value.accountID,
    items,
    after: value.after,
    total: Number(value.total),
    observedAt: Number(value.observedAt),
  };
}
