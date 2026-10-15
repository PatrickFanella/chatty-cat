// Pure workbench layout model. The DOM layer (workbench.ts) applies these states; nothing here touches the document.
export type ZoneName = 'left' | 'right' | 'bottom';
export const ZONES: readonly ZoneName[] = ['left', 'right', 'bottom'];
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Zone {
  panels: string[];
  shares: Record<string, number>;
}
export interface Layout {
  version: 1;
  zones: Record<ZoneName, Zone>;
  /** Zone extent in CSS pixels: width for left/right, height for bottom. */
  sizes: Record<ZoneName, number>;
  floating: Record<string, Box>;
  /** Docked panels that are hidden until reopened; they keep their slot. */
  closed: string[];
}
export const ZONE_MIN = 200,
  ZONE_MAX_FRACTION = 0.6,
  FLOAT_MIN_WIDTH = 240,
  FLOAT_MIN_HEIGHT = 160;
export function emptyLayout(): Layout {
  return {
    version: 1,
    zones: { left: { panels: [], shares: {} }, right: { panels: [], shares: {} }, bottom: { panels: [], shares: {} } },
    sizes: { left: 360, right: 380, bottom: 260 },
    floating: {},
    closed: [],
  };
}
export type Placement =
  { kind: 'modal' } | { kind: 'docked'; zone: ZoneName; index: number } | { kind: 'floating'; box: Box };
export function placementOf(layout: Layout, id: string): Placement {
  for (const zone of ZONES) {
    const index = layout.zones[zone].panels.indexOf(id);
    if (index >= 0) return { kind: 'docked', zone, index };
  }
  const box = layout.floating[id];
  if (box) return { kind: 'floating', box };
  return { kind: 'modal' };
}
function without(layout: Layout, id: string): Layout {
  const zones = {} as Record<ZoneName, Zone>;
  for (const zone of ZONES) {
    const current = layout.zones[zone];
    const shares = { ...current.shares };
    delete shares[id];
    zones[zone] = { panels: current.panels.filter((panel) => panel !== id), shares };
  }
  const floating = { ...layout.floating };
  delete floating[id];
  return { ...layout, zones, floating, closed: layout.closed.filter((panel) => panel !== id) };
}
/** Dock a panel into a zone at an index (clamped). Re-docking the same panel moves it. */
export function dock(layout: Layout, id: string, zone: ZoneName, index = Number.MAX_SAFE_INTEGER): Layout {
  const base = without(layout, id);
  const target = base.zones[zone];
  const panels = [...target.panels];
  const at = Math.max(0, Math.min(index, panels.length));
  panels.splice(at, 0, id);
  return {
    ...base,
    zones: { ...base.zones, [zone]: { panels, shares: { ...target.shares, [id]: target.shares[id] ?? 1 } } },
  };
}
export function float(layout: Layout, id: string, box: Box, viewport: { width: number; height: number }): Layout {
  const base = without(layout, id);
  return { ...base, floating: { ...base.floating, [id]: fit(box, viewport) } };
}
/** Return a panel to its module's own modal/default presentation. */
export function release(layout: Layout, id: string): Layout {
  return without(layout, id);
}
export function setClosed(layout: Layout, id: string, closed: boolean): Layout {
  if (placementOf(layout, id).kind === 'modal') return layout;
  const list = layout.closed.filter((panel) => panel !== id);
  return { ...layout, closed: closed ? [...list, id] : list };
}
export function moveWithin(layout: Layout, id: string, delta: number): Layout {
  const place = placementOf(layout, id);
  if (place.kind !== 'docked') return layout;
  return dock(
    layout,
    id,
    place.zone,
    Math.max(0, Math.min(place.index + delta, layout.zones[place.zone].panels.length - 1)),
  );
}
export function resizeZone(
  layout: Layout,
  zone: ZoneName,
  size: number,
  viewport: { width: number; height: number },
): Layout {
  const limit = (zone === 'bottom' ? viewport.height : viewport.width) * ZONE_MAX_FRACTION;
  return {
    ...layout,
    sizes: { ...layout.sizes, [zone]: Math.round(Math.max(ZONE_MIN, Math.min(size, Math.max(ZONE_MIN, limit)))) },
  };
}
/** Set the share of `id` relative to the following panel so a splitter drag between two neighbours keeps the rest unchanged. */
export function setShares(layout: Layout, zone: ZoneName, shares: Record<string, number>): Layout {
  const target = layout.zones[zone];
  const next: Record<string, number> = {};
  for (const id of target.panels) next[id] = clampShare(shares[id] ?? target.shares[id] ?? 1);
  return { ...layout, zones: { ...layout.zones, [zone]: { ...target, shares: next } } };
}
function clampShare(value: number): number {
  return Number.isFinite(value) ? Math.max(0.1, Math.min(value, 10)) : 1;
}
export function fit(box: Box, viewport: { width: number; height: number }): Box {
  const width = Math.max(FLOAT_MIN_WIDTH, Math.min(box.width, viewport.width - 16));
  const height = Math.max(FLOAT_MIN_HEIGHT, Math.min(box.height, viewport.height - 16));
  return {
    width: Math.round(width),
    height: Math.round(height),
    left: Math.round(Math.max(8, Math.min(box.left, viewport.width - width - 8))),
    top: Math.round(Math.max(8, Math.min(box.top, viewport.height - height - 8))),
  };
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function box(value: unknown): Box | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (
    !finite(raw.left) ||
    !finite(raw.top) ||
    !finite(raw.width) ||
    !finite(raw.height) ||
    raw.width <= 0 ||
    raw.height <= 0 ||
    raw.width > 10000 ||
    raw.height > 10000
  )
    return undefined;
  return { left: raw.left, top: raw.top, width: raw.width, height: raw.height };
}
/** Parse a persisted layout; unknown or malformed input yields the empty layout, malformed parts are dropped. */
export function parseLayout(value: unknown, viewport: { width: number; height: number }): Layout {
  const layout = emptyLayout();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return layout;
  const data = value as Record<string, unknown>;
  if (data.version !== undefined && data.version !== 1) return layout;
  const seen = new Set<string>();
  const zones = data.zones as Record<string, unknown> | undefined;
  if (zones && typeof zones === 'object')
    for (const zone of ZONES) {
      const raw = zones[zone] as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.panels)) continue;
      const shares = raw.shares && typeof raw.shares === 'object' ? (raw.shares as Record<string, unknown>) : {};
      for (const id of raw.panels.slice(0, 40)) {
        if (typeof id !== 'string' || !id || seen.has(id)) continue;
        seen.add(id);
        layout.zones[zone].panels.push(id);
        layout.zones[zone].shares[id] = clampShare(finite(shares[id]) ? shares[id] : 1);
      }
    }
  const sizes = data.sizes as Record<string, unknown> | undefined;
  if (sizes && typeof sizes === 'object')
    for (const zone of ZONES)
      if (finite(sizes[zone])) layout.sizes[zone] = resizeZone(layout, zone, sizes[zone], viewport).sizes[zone];
  const floating = data.floating as Record<string, unknown> | undefined;
  if (floating && typeof floating === 'object')
    for (const [id, raw] of Object.entries(floating).slice(0, 40)) {
      const parsed = box(raw);
      if (parsed && !seen.has(id)) {
        seen.add(id);
        layout.floating[id] = fit(parsed, viewport);
      }
    }
  if (Array.isArray(data.closed))
    layout.closed = data.closed.filter((id): id is string => typeof id === 'string' && seen.has(id));
  return layout;
}
