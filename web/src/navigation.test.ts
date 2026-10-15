// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { MessageNavigation } from './navigation';
let navigation: MessageNavigation | undefined;
afterEach(() => {
  navigation?.stop();
  navigation = undefined;
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
});
function setup(id: string) {
  const log = document.createElement('main');
  document.body.append(log);
  const row = document.createElement('article');
  row.className = 'row';
  row.dataset.id = id;
  log.append(row);
  const pause = vi.fn();
  navigation = new MessageNavigation(log, pause);
  return { log, row, pause };
}
it('resolves a startup permalink and safely compares IDs', () => {
  history.replaceState(null, '', '/?mid=' + encodeURIComponent('x"]<b>'));
  const { row, pause } = setup('x"]<b>');
  navigation?.reveal();
  expect(row.classList.contains('target-message')).toBe(true);
  expect(pause).toHaveBeenCalled();
});
it('waits for backfill and resolves once the parent arrives', () => {
  history.replaceState(null, '', '/?mid=parent');
  const { log } = setup('different');
  navigation?.reveal();
  expect(document.querySelector('[role=status]')?.textContent).toContain('not in loaded history');
  const parent = document.createElement('article');
  parent.className = 'row';
  parent.dataset.id = 'parent';
  log.append(parent);
  navigation?.reveal();
  expect(parent.classList.contains('target-message')).toBe(true);
});
it('parent jumps update the URL while retaining channels, and popstate clears the target', () => {
  history.replaceState(null, '', '/?channel=hasanabi');
  const { row } = setup('parent');
  const jump = document.createElement('button');
  jump.dataset.jump = 'parent';
  row.append(jump);
  jump.click();
  expect(new URL(location.href).searchParams.get('mid')).toBe('parent');
  expect(location.search).toContain('channel=hasanabi');
  history.replaceState(null, '', '/?channel=hasanabi');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(row.classList.contains('target-message')).toBe(false);
});
it('keeps navigation status above the workspace instead of stealing a chat column', () => {
  const workspace = document.createElement('div');
  workspace.className = 'chat-workspace';
  const log = document.createElement('main');
  workspace.append(log);
  document.body.append(workspace);
  navigation = new MessageNavigation(log, vi.fn());
  expect(workspace.children).toHaveLength(1);
  expect(workspace.previousElementSibling?.className).toBe('message-navigation');
});
