import { parsePresentation, type PresentationOptions } from './presentation';
export interface OverlayAppearance {
  backgroundOpacity: number;
  shadow: boolean;
  shadowOpacity: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowRadius: number;
}
export function validOverlayAppearance(v: unknown): v is OverlayAppearance {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  const integer = (name: string, min: number, max: number) =>
    Number.isInteger(p[name]) && Number(p[name]) >= min && Number(p[name]) <= max;
  return (
    Object.keys(p).length === 7 &&
    integer('backgroundOpacity', 0, 255) &&
    typeof p.shadow === 'boolean' &&
    integer('shadowOpacity', 0, 255) &&
    typeof p.shadowColor === 'string' &&
    /^#[\da-f]{6}$/i.test(p.shadowColor) &&
    integer('shadowOffsetX', -20, 20) &&
    integer('shadowOffsetY', -20, 20) &&
    integer('shadowRadius', 0, 40)
  );
}
export function overlayAppearance(p: PresentationOptions): OverlayAppearance {
  const v = parsePresentation(p);
  return {
    backgroundOpacity: v.overlayBackgroundOpacity,
    shadow: v.overlayShadow,
    shadowOpacity: v.overlayShadowOpacity,
    shadowColor: v.overlayShadowColor,
    shadowOffsetX: v.overlayShadowOffsetX,
    shadowOffsetY: v.overlayShadowOffsetY,
    shadowRadius: v.overlayShadowRadius,
  };
}
export function overlayAppearanceStyles(p: OverlayAppearance): Record<string, string> {
  if (!validOverlayAppearance(p)) throw new Error('Invalid overlay appearance');
  const rgb = [1, 3, 5].map((i) => parseInt(p.shadowColor.slice(i, i + 2), 16));
  return {
    '--overlay-background-alpha': String((p.backgroundOpacity / 255) * 100) + '%',
    '--overlay-content-shadow': p.shadow
      ? 'drop-shadow(' +
        p.shadowOffsetX +
        'px ' +
        p.shadowOffsetY +
        'px ' +
        p.shadowRadius +
        'px rgba(' +
        rgb.join(',') +
        ',' +
        p.shadowOpacity / 255 +
        '))'
      : 'none',
  };
}
