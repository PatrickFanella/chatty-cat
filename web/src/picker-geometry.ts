export function parsePickerGeometry(
  value: string | null,
): { width: number; height: number; left: number; top: number } | undefined {
  if (!value) return undefined;
  const match = /^(\d{1,5})x(\d{1,5})(?:,(-?\d{1,5}),(-?\d{1,5}))?$/.exec(value);
  if (!match) return undefined;
  const width = Number(match[1]),
    height = Number(match[2]) || 600;
  if (width < 260 || height < 200 || width > 10000 || height > 10000) return undefined;
  return {
    width,
    height,
    left: match[3] === undefined ? 12 : Number(match[3]),
    top: match[4] === undefined ? 16 : Number(match[4]),
  };
}
