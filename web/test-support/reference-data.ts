import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { EMOJI_DATA_URL } from '../src/emoji-data-source';
import { RESOURCE_DATA_URL } from '../src/resource-data-source';
import { loadEmojiCatalog } from '../src/emoji';
export const emojiFixture = JSON.parse(readFileSync(new URL('../public' + EMOJI_DATA_URL, import.meta.url), 'utf8'));
export const resourceFixture: Record<string, string> = JSON.parse(readFileSync(new URL('../public' + RESOURCE_DATA_URL, import.meta.url), 'utf8'));
export async function loadEmojiFixture(): Promise<void> {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(emojiFixture));
  try { await loadEmojiCatalog(); } finally { fetcher.mockRestore(); }
}
