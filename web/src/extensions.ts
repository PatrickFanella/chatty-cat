import { getProfileScope, profileKey } from './account-profiles';
export const EXTENSION_PERMISSIONS = ['context:channel', 'input:text', 'composer:stage'] as const;
export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];
export interface ExtensionContribution {
  id: string;
  title: string;
  template: string;
}
export interface ExtensionManifest {
  format: 'chatty-cat-extension';
  version: 1;
  id: string;
  name: string;
  permissions: ExtensionPermission[];
  commands: ExtensionContribution[];
  views: ExtensionContribution[];
}
interface Installed {
  manifest: ExtensionManifest;
  enabled: boolean;
}
const key = 'chatthing:v1:extensions';
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function exact(v: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(v).some((k) => !keys.includes(k))) throw new Error('Unsupported extension field');
}
function text(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
}
export function parseExtension(v: unknown): ExtensionManifest {
  if (!record(v) || new TextEncoder().encode(JSON.stringify(v)).length > 16384)
    throw new Error('Extension manifest exceeds 16 KiB or is invalid');
  exact(v, ['format', 'version', 'id', 'name', 'permissions', 'commands', 'views']);
  if (
    v.format !== 'chatty-cat-extension' ||
    v.version !== 1 ||
    typeof v.id !== 'string' ||
    !/^([a-z][a-z0-9-]*\.)*[a-z][a-z0-9-]{0,47}$/.test(v.id) ||
    v.id.length > 64 ||
    !text(v.name, 64) ||
    !Array.isArray(v.permissions) ||
    v.permissions.length > 3 ||
    new Set(v.permissions).size !== v.permissions.length ||
    v.permissions.some((p) => !EXTENSION_PERMISSIONS.includes(p))
  )
    throw new Error('Invalid extension identity, version or permissions');
  const permissions = v.permissions as ExtensionPermission[];
  const parse = (list: unknown, max: number): ExtensionContribution[] => {
    if (!Array.isArray(list) || list.length > max) throw new Error('Extension contribution limit exceeded');
    const seen = new Set<string>();
    return list.map((c) => {
      if (!record(c)) throw new Error('Invalid extension contribution');
      exact(c, ['id', 'title', 'template']);
      if (
        typeof c.id !== 'string' ||
        !/^[a-z][a-z0-9-]{0,31}$/.test(c.id) ||
        seen.has(c.id) ||
        !text(c.title, 64) ||
        !text(c.template, 1000)
      )
        throw new Error('Invalid extension command or view');
      seen.add(c.id);
      const allowed = c.template.replace(/\{\{(channel|input)\}\}/g, (_, p: string) => {
        if (!permissions.includes(p === 'channel' ? 'context:channel' : 'input:text'))
          throw new Error('Template requires undeclared permission');
        return '';
      });
      if (/[{}]/.test(allowed)) throw new Error('Only declared channel/input placeholders are supported');
      return { id: c.id, title: c.title, template: c.template };
    });
  };
  const commands = parse(v.commands, 16),
    views = parse(v.views, 8);
  if (!commands.length && !views.length) throw new Error('Extension declares no commands or views');
  return {
    format: 'chatty-cat-extension',
    version: 1,
    id: v.id,
    name: v.name,
    permissions: [...permissions],
    commands,
    views,
  };
}
export class ExtensionStore {
  private entries: Installed[] = [];
  private raw: string | null;
  private storageKey: string;
  constructor(private account: string) {
    this.scope();
    this.storageKey = profileKey(key);
    this.raw = localStorage.getItem(this.storageKey);
    if (this.raw === null) return;
    if (new TextEncoder().encode(this.raw).length > 131072)
      throw new Error('Extension storage exceeds limit; existing data retained');
    let v: unknown;
    try {
      v = JSON.parse(this.raw);
    } catch {
      throw new Error('Extension storage unreadable; existing data retained');
    }
    if (!Array.isArray(v) || v.length > 8) throw new Error('Invalid extension storage');
    this.entries = v.map((e) => {
      if (!record(e) || typeof e.enabled !== 'boolean') throw new Error('Invalid installed extension');
      exact(e, ['manifest', 'enabled']);
      return { manifest: parseExtension(e.manifest), enabled: e.enabled };
    });
    if (new Set(this.entries.map((e) => e.manifest.id)).size !== this.entries.length)
      throw new Error('Duplicate extension IDs');
  }
  private scope(): void {
    if (!/^[1-9][0-9]{0,19}$/.test(this.account) || getProfileScope() !== this.account)
      throw new Error('Extension account changed');
  }
  all(): Installed[] {
    this.scope();
    if (localStorage.getItem(this.storageKey) !== this.raw)
      throw new Error('Extensions changed in another tab; reopen before using them');
    return structuredClone(this.entries);
  }
  private write(entries: Installed[]): void {
    this.scope();
    if (localStorage.getItem(this.storageKey) !== this.raw)
      throw new Error('Extensions changed in another tab; reopen before editing');
    const raw = JSON.stringify(entries);
    if (entries.length > 8 || new TextEncoder().encode(raw).length > 131072)
      throw new Error('Extension storage limit reached');
    localStorage.setItem(this.storageKey, raw);
    this.entries = entries;
    this.raw = raw;
  }
  install(manifest: ExtensionManifest): void {
    const parsed = parseExtension(manifest);
    if (this.entries.some((e) => e.manifest.id === parsed.id))
      throw new Error('Remove the existing extension before replacing its manifest');
    this.write([...this.entries, { manifest: parsed, enabled: false }]);
  }
  enable(id: string, enabled: boolean): void {
    if (!this.entries.some((e) => e.manifest.id === id)) throw new Error('Extension no longer installed');
    this.write(this.entries.map((e) => (e.manifest.id === id ? { ...e, enabled } : e)));
  }
  remove(id: string): void {
    if (!this.entries.some((e) => e.manifest.id === id)) throw new Error('Extension no longer installed');
    this.write(this.entries.filter((e) => e.manifest.id !== id));
  }
}
