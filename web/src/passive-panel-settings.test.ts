// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { PassivePanelSettings } from './passive-panel-settings';
import { PickerModel } from './picker-model';
import { registerSettings } from './settings-bundle';

let runtime: PassivePanelSettings | undefined;
let stopView: (() => void) | undefined;
afterEach(() => {
  runtime?.stop();
  stopView?.();
  localStorage.clear();
  document.body.replaceChildren();
});
function capture() {
  const detail: Record<string, unknown> = {};
  document.dispatchEvent(new CustomEvent('capture-settings', { detail }));
  return detail;
}
function restore(detail: Record<string, unknown>) {
  document.dispatchEvent(new CustomEvent('restore-settings', { detail }));
}
it('captures and restores unopened settings without editor DOM and hands ownership to the view once', () => {
  const model = new PickerModel();
  const open = vi.fn(() => false);
  runtime = new PassivePanelSettings(model, ['fixture'], () => 'fixture', open);
  expect(Object.keys(capture()).sort()).toEqual(['picker', 'resources', 'stats', 'video']);
  const value = { options: { ...model.options, names: false }, floating: { pinned: false, open: false } };
  restore({ picker: value });
  expect(model.options.names).toBe(false);
  expect(open).not.toHaveBeenCalled();
  expect(document.querySelector('dialog,aside,section')).toBeNull();
  const receive = vi.fn();
  runtime.handoff('picker', () => {
    stopView = registerSettings('picker', () => 'live', receive);
  });
  expect(receive).toHaveBeenCalledOnce();
  expect(receive).toHaveBeenCalledWith(value);
  expect(capture().picker).toBe('live');
  restore({ picker: value });
  expect(receive).toHaveBeenCalledTimes(2);
});
it('keeps pending open requests until registration is ready and cancels them on a closed restore', () => {
  let ready = false;
  const open = vi.fn(() => ready);
  runtime = new PassivePanelSettings(new PickerModel(), ['fixture'], () => 'fixture', open);
  restore({ stats: { open: true } });
  expect(open).toHaveBeenCalledWith('stats-panel');
  restore({ stats: { open: false } });
  ready = true;
  open.mockClear();
  runtime.restoreOpenPanels();
  expect(open).not.toHaveBeenCalled();
  restore({ video: { options: {}, floating: { open: true, pinned: true } } });
  expect(open).toHaveBeenCalledWith('video-panel');
  open.mockClear();
  runtime.restoreOpenPanels();
  expect(open).not.toHaveBeenCalled();
});
it('retains prior state on invalid data and re-registers settings after construction fails', () => {
  runtime = new PassivePanelSettings(
    new PickerModel(),
    ['fixture'],
    () => 'fixture',
    () => false,
  );
  const previous = capture();
  restore({ picker: { options: {}, floating: { open: true, pinned: true, box: { width: -1 } } }, resources: null });
  expect(capture()).toEqual(previous);
  expect(() =>
    runtime!.handoff('picker', () => {
      throw new Error('fixture');
    }),
  ).toThrow('fixture');
  expect(capture()).toEqual(previous);
});
