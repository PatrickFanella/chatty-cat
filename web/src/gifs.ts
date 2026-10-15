export interface GifTitle {
  query: string;
  label: string;
  page: string;
}
export function nativeGifTitle(text: string): GifTitle | undefined {
  const title = /^\[([^\]]*\bGIF\b[^\]]*)\]$/i.exec(text)?.[1];
  if (!title) return undefined;
  const query = (
    title
      .replace(/\bGIF\s+by\s+/i, ' ')
      .replace(/\bGIF\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim() || title
  ).slice(0, 200);
  return { query, label: text, page: 'https://giphy.com/search/' + encodeURIComponent(query.replace(/\s+/g, '-')) };
}
export function gifTitleLink(title: GifTitle): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = title.page;
  link.textContent = title.label;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'gif-title';
  link.dataset.gifQuery = title.query;
  link.dataset.gifLabel = title.label;
  return link;
}
