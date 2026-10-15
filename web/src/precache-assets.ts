// Only immutable same-origin build assets may enter the shell precache. The
// worker itself is installed by the browser, rather than cached as app content.
export function precacheAssets(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    throw new Error('Build manifest unavailable');
  const assets = new Set<string>();
  const add = (file: unknown): void => {
    if (file === 'sw.js') return;
    if (
      typeof file !== 'string' ||
      !/^assets\/[A-Za-z0-9_./-]+$/.test(file) ||
      file.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new Error('Invalid build asset');
    assets.add('/' + file);
  };
  for (const value of Object.values(manifest)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid build entry');
    const entry = value as Record<string, unknown>;
    add(entry.file);
    if (entry.css !== undefined) {
      if (!Array.isArray(entry.css)) throw new Error('Invalid build styles');
      for (const css of entry.css) add(css);
    }
  }
  if (!assets.size) throw new Error('Build assets unavailable');
  return [...assets];
}
