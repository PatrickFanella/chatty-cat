// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { ResourceAuthors } from './resource-authors';
it('sorts birth/activity, deduplicates flat entries, restores areas and validates info modes', () => {
  const root = document.createElement('section');
  root.innerHTML =
    '<a data-ainfo="3">names</a><a data-asort="birth">birth</a><div id="resources-author-sections"><div><b>area</b><span class="linkcols"><i><a data-b="1900" data-d="1980">A</a> (work · dates)<span class="ag">theme</span></i><i><a data-b="1800" data-d="1850">B</a> (book)</i><i><a data-b="1900">A</a></i></span></div></div>';
  const panel = new ResourceAuthors(root);
  root.querySelector<HTMLButtonElement>('[data-asort]')!.click();
  expect([...root.querySelectorAll('a[data-b]')].map((a) => a.textContent)).toEqual(['B', 'A']);
  root.querySelector<HTMLButtonElement>('[data-ainfo]')!.click();
  expect(panel.state()).toEqual({ sort: 'birth', info: 3 });
  expect(root.querySelector('.author-life')?.textContent).toContain('1800');
  panel.restore({ sort: 'area', info: 99 });
  expect(root.querySelectorAll('a[data-b]')).toHaveLength(3);
  expect(panel.state().info).toBe(3);
  panel.stop();
});
