// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { RepositoryDetails } from './resource-repository';
afterEach(() => vi.unstubAllGlobals());
it('shows public metadata as text and caches success without credentials', async () => {
  const output = document.createElement('span'),
    url = 'https://git.subcult.tv/team/project';
  const fetcher = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      url,
      title: 'team/project',
      site: 'Gitea',
      description: '2 stars · started 2026-10-10',
      image: '',
      icon: '',
      author: '',
      published: '',
      contentType: 'text/html',
      ttl: 600,
    }),
  }));
  vi.stubGlobal('fetch', fetcher);
  const repository = new RepositoryDetails([{ url, output }]);
  repository.start();
  await vi.waitFor(() => expect(output.textContent).toContain('2 stars'));
  expect(fetcher.mock.calls[0]?.length).toBe(2);
  repository.stop();
  repository.start();
  expect(fetcher).toHaveBeenCalledTimes(1);
  repository.stop();
});
