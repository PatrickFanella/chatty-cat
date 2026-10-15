// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { PickerMotion } from './picker-motion';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function cell(root: HTMLElement, code: string, left: number, age = false) {
  const node = document.createElement(age ? 'span' : 'button');
  if (age) {
    node.className = 'picker-age';
    node.dataset.age = code;
  } else node.dataset.insert = code;
  root.append(node);
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(new DOMRect(left, 20, 64, 64));
  const cancel = vi.fn();
  const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({
    cancel,
    onfinish: null,
    oncancel: null,
  }));
  Object.defineProperty(node, 'animate', { value: animate });
  return { node, animate, cancel };
}
it('slides matching cells and inline ages from their previous positions, keeping duplicate copies separate', () => {
  const grid = document.createElement('div'),
    recent = document.createElement('div');
  document.body.append(grid, recent);
  cell(grid, 'Kappa', 100);
  cell(recent, 'Kappa', 10);
  cell(grid, '30', 200, true);
  const motion = new PickerMotion();
  const before = motion.capture([grid, recent], true);
  grid.replaceChildren();
  recent.replaceChildren();
  const moved = cell(grid, 'Kappa', 20),
    copy = cell(recent, 'Kappa', 15),
    age = cell(grid, '30', 150, true);
  const fresh = cell(grid, 'New', 250);
  motion.play([grid, recent], before, true);
  expect(moved.animate).toHaveBeenCalledWith([{ transform: 'translate(80px,0px)' }, { transform: 'translate(0,0)' }], {
    duration: 350,
    easing: 'ease',
  });
  expect(copy.animate.mock.calls[0]?.[0]).toEqual([
    { transform: 'translate(-5px,0px)' },
    { transform: 'translate(0,0)' },
  ]);
  expect(age.animate).toHaveBeenCalledOnce();
  expect(fresh.animate).not.toHaveBeenCalled();
  motion.stop();
  expect(moved.cancel).toHaveBeenCalledOnce();
  expect(copy.cancel).toHaveBeenCalledOnce();
});
it('leaves unchanged cells and row-ending ages still and respects reduced motion', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const same = cell(root, 'Kappa', 10),
    age = cell(root, '30', 100, true);
  const motion = new PickerMotion();
  const before = motion.capture([root], false);
  motion.play([root], before, false);
  expect(same.animate).not.toHaveBeenCalled();
  expect(age.animate).not.toHaveBeenCalled();
  const media = window.matchMedia('all');
  vi.spyOn(media, 'matches', 'get').mockReturnValue(true);
  vi.spyOn(window, 'matchMedia').mockReturnValue(media);
  expect(motion.capture([root], true).size).toBe(0);
  motion.play([root], new Map([[root, new Map([['iKappa', [new DOMRect(100, 20, 64, 64)]]])]]), true);
  expect(same.animate).not.toHaveBeenCalled();
});
