import type {ChannelMetadata, Badge} from './metadata';
import type {LedgerRank} from './stats-ledger';

export type BadgeOrder = 'versions' | 'name';
export interface BadgeGroup {
  name: string;
  versions: {version: string; badge: Badge; count: number}[];
}

export function badgeGroups(catalogs: readonly ChannelMetadata['badges'][], counts: readonly LedgerRank[], order: BadgeOrder): BadgeGroup[] {
  const sets = new Map<string, Map<string, Badge>>();
  const usage = new Map(counts.map(row => [row.name, row.count]));
  for (const catalog of catalogs) for (const [name, versions] of Object.entries(catalog)) {
    let set = sets.get(name);
    if (!set) {set = new Map(); sets.set(name, set);}
    for (const [version, badge] of Object.entries(versions)) set.set(version, badge);
  }
  return [...sets].map(([name, versions]) => ({name, versions: [...versions].map(([version, badge]) => ({version, badge, count: usage.get(name + '/' + version) ?? 0})).sort((a, b) => a.version.localeCompare(b.version, undefined, {numeric: true}))}))
    .sort((a, b) => (order === 'versions' ? b.versions.length - a.versions.length : 0) || a.name.localeCompare(b.name));
}

export function renderBadgeReference(groups: readonly BadgeGroup[], expanded: ReadonlySet<string>): HTMLElement {
  const section = document.createElement('section');
  const heading = document.createElement('h3'); heading.textContent = 'Badge reference'; section.append(heading);
  for (const group of groups) {
    const details = document.createElement('details'); details.dataset.badgeSet = group.name; details.open = expanded.has(group.name);
    const summary = document.createElement('summary'); summary.textContent = `${group.name.replace(/[-_]/g, ' ')} · ${group.versions.length} versions`; details.append(summary);
    const appendVersions = (): void => {
    if (details.dataset.rendered) return;
    details.dataset.rendered = 'true';
    for (const {version, badge, count} of group.versions) {
      const row = document.createElement('p'); row.title = badge.description;
      const image = document.createElement('img'); image.src = badge.url; image.alt = ''; image.width = 18; image.height = 18; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      row.append(image, ` ${badge.title || group.name + '/' + version} · ${count.toLocaleString()} observed`); details.append(row);
    }
    };
    details.addEventListener('toggle',()=>{if(details.open)appendVersions();});
    if(details.open)appendVersions();
    section.append(details);
  }
  if (!groups.length) {const empty = document.createElement('p'); empty.textContent = 'Badge metadata unavailable'; section.append(empty);}
  return section;
}
