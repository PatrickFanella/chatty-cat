// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { fitBox, FloatingPanel } from './floating';
let panel: FloatingPanel | undefined;
afterEach(() => { panel?.stop(); panel = undefined; localStorage.clear(); document.body.replaceChildren(); });
function setup() {
  const root = document.createElement('section'); const handle = document.createElement('button'); const pin = document.createElement('button');
  root.append(handle, pin); document.body.append(root);
  root.getBoundingClientRect = () => ({ left: 100, top: 200, width: 560, height: 440, right: 660, bottom: 640, x: 100, y: 200, toJSON: () => ({}) });
  panel = new FloatingPanel(root, handle, pin, 'geometry'); return { root, handle, pin };
}
it('fits large and offscreen boxes into a mobile viewport', () => {
  expect(fitBox({ left: 900, top: -20, width: 560, height: 440 }, 375, 300)).toEqual({ left: 12, top: 16, width: 351, height: 268 });
});
it('pins keyboard movement, restores geometry and respects deliberate closure', () => {
  const { handle } = setup(); panel?.opened(); handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
  expect(panel?.pinned).toBe(true); panel?.stop(); setup(); expect(panel?.reopen).toBe(true);
  panel?.closed(); panel?.stop(); setup(); expect(panel?.pinned).toBe(true); expect(panel?.reopen).toBe(false);
});
it('unpins to the anchor while retaining size', () => {
  const { root, pin } = setup(); pin.click(); expect(root.style.left).toBe('100px'); pin.click();
  expect(root.style.left).toBe(''); expect(root.style.width).toBe('560px');
});
it('rejects malformed stored dimensions', () => {
  localStorage.setItem('geometry', '{"left":-1,"top":0,"width":"999","height":300,"pinned":true}');
  const { root } = setup(); expect(root.style.left).toBe(''); expect(root.style.width).toBe('');
});
