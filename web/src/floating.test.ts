// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { fitBox, FloatingPanel } from './floating';
let panel: FloatingPanel | undefined;
afterEach(() => {
  panel?.stop();
  panel = undefined;
  localStorage.clear();
  document.body.replaceChildren();
  document.documentElement.style.zoom = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const root = document.createElement('section');
  const handle = document.createElement('button');
  const pin = document.createElement('button');
  root.append(handle, pin);
  document.body.append(root);
  root.getBoundingClientRect = () => ({
    left: 100,
    top: 200,
    width: 560,
    height: 440,
    right: 660,
    bottom: 640,
    x: 100,
    y: 200,
    toJSON: () => ({}),
  });
  panel = new FloatingPanel(root, handle, pin, 'geometry');
  return { root, handle, pin };
}
it('fits large and offscreen boxes into a mobile viewport', () => {
  expect(fitBox({ left: 900, top: -20, width: 560, height: 440 }, 375, 300)).toEqual({
    left: 12,
    top: 16,
    width: 351,
    height: 268,
  });
});
it('pins keyboard movement, restores geometry and respects deliberate closure', () => {
  const { handle } = setup();
  panel?.opened();
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
  expect(panel?.pinned).toBe(true);
  panel?.stop();
  setup();
  expect(panel?.reopen).toBe(true);
  panel?.closed();
  panel?.stop();
  setup();
  expect(panel?.pinned).toBe(true);
  expect(panel?.reopen).toBe(false);
});
it('unpins to the anchor while retaining size', () => {
  const { root, pin } = setup();
  pin.click();
  expect(root.style.left).toBe('100px');
  pin.click();
  expect(root.style.left).toBe('');
  expect(root.style.width).toBe('560px');
});
it('rejects malformed stored dimensions', () => {
  localStorage.setItem('geometry', '{"left":-1,"top":0,"width":"999","height":300,"pinned":true}');
  const { root } = setup();
  expect(root.style.left).toBe('');
  expect(root.style.width).toBe('');
});

it('captures zoomed screen rectangles in logical CSS pixels without growing on repeated capture', () => {
  document.documentElement.style.zoom = '1.25';
  const { root, pin } = setup();
  pin.click();
  expect(root.style.width).toBe('448px');
  expect(root.style.height).toBe('352px');
  expect(root.style.left).toBe('80px');
  for (let i = 0; i < 5; i++) panel?.state();
  expect(panel?.geometry()).toEqual({ left: 80, top: 160, width: 448, height: 352 });
});
it('coalesces observer writes into the next animation frame and cancels them on stop', () => {
  let notify: ResizeObserverCallback | undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const frames: FrameRequestCallback[] = [];
  const request = vi.fn((callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const { root } = setup();
  notify!([], {} as ResizeObserver);
  notify!([], {} as ResizeObserver);
  expect(root.style.width).toBe('');
  expect(request).toHaveBeenCalledTimes(1);
  frames[0]!(0);
  expect(root.style.width).toBe('560px');
  notify!([], {} as ResizeObserver);
  panel?.stop();
  panel = undefined;
  expect(cancel).toHaveBeenCalledWith(2);
});

it('converts pointer movement from screen pixels at presentation zoom', () => {
  document.documentElement.style.zoom = '1.25';
  const { handle } = setup();
  handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, button: 0, clientX: 100, clientY: 200 }));
  handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 3, clientX: 150, clientY: 250 }));
  expect(panel?.geometry()).toEqual({ width: 448, height: 352, left: 120, top: 200 });
  expect(panel?.pinned).toBe(true);
});
