// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { LazyPanels, type Panel, type PanelWorkbench } from './panels';
import { CommandRegistry } from './registry';
import { Workbench } from './workbench';
import { showPanel } from './open-panel';
import { dock, emptyLayout, setClosed } from './layout';

let panels: LazyPanels | undefined;
afterEach(() => {
  panels?.stop();
  document.body.replaceChildren();
});
function setup(restored = false) {
  const registry = new CommandRegistry();
  let context = 'alice',
    available = true,
    wanted = restored;
  let changed = () => {};
  const workbench: PanelWorkbench = {
    adopt: vi.fn(),
    forget: vi.fn(),
    wantsPanel: () => wanted,
    onLayoutChange: (listener) => {
      changed = listener;
      return vi.fn();
    },
  };
  const failure = vi.fn();
  panels = new LazyPanels(
    registry,
    workbench,
    () => context,
    () => available,
    failure,
  );
  const create = vi.fn((): Panel => {
    const root = document.createElement('dialog');
    root.id = 'fixture-panel';
    document.body.append(root);
    return {
      id: root.id,
      title: 'Fixture',
      group: 'tools',
      root,
      open: vi.fn(() => showPanel(root)),
      close: vi.fn(() => root.close()),
      stop: vi.fn(() => root.remove()),
    };
  });
  const load = vi.fn(async () => create);
  const register = () => panels!.register({ id: 'fixture-panel', title: 'Fixture', group: 'tools', load });
  const registerSettings = () =>
    panels!.register({
      id: 'fixture-panel',
      title: 'Fixture',
      group: 'tools',
      load,
      settings: { page: 'commands', section: 'Custom commands', keywords: 'fixture alias' },
    });
  return {
    registry,
    workbench,
    failure,
    create,
    load,
    register,
    registerSettings,
    context: (next: string) => {
      context = next;
    },
    available: (next: boolean) => {
      available = next;
    },
    restore: (next: boolean) => {
      wanted = next;
      changed();
    },
  };
}
it('registers a command without importing or constructing and coalesces first-open requests', async () => {
  const f = setup();
  f.register();
  expect(f.registry.get('panel:fixture-panel')?.panel).toBe('fixture-panel');
  expect(f.load).not.toHaveBeenCalled();
  expect(document.querySelector('dialog')).toBeNull();
  const a = panels!.open('fixture-panel'),
    b = panels!.open('fixture-panel');
  expect(a).toBe(b);
  await a;
  expect(f.load).toHaveBeenCalledTimes(1);
  expect(f.create).toHaveBeenCalledTimes(1);
  const instance = f.create.mock.results[0]!.value;
  expect(f.workbench.adopt).toHaveBeenCalledWith(instance.root, expect.any(Function));
  panels!.close('fixture-panel');
  expect(instance.root.open).toBe(false);
  f.registry.get('panel:fixture-panel')!.run();
  expect(instance.root.open).toBe(true);
  expect(f.create).toHaveBeenCalledTimes(1);
  panels!.stop();
  expect(instance.stop).toHaveBeenCalledTimes(1);
  expect(f.registry.get('panel:fixture-panel')).toBeUndefined();
});
it('retries failed imports and refuses late construction after account, privacy or teardown changes', async () => {
  const f = setup();
  f.register();
  f.load.mockRejectedValueOnce(new Error('offline'));
  await panels!.open('fixture-panel');
  expect(f.failure).toHaveBeenCalledWith('Fixture');
  let resolve!: (create: typeof f.create) => void;
  f.load.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = panels!.open('fixture-panel');
  await Promise.resolve();
  f.context('bob');
  resolve(f.create);
  await pending;
  expect(f.create).not.toHaveBeenCalled();
  f.load.mockImplementationOnce(async () => {
    f.available(false);
    return f.create;
  });
  await panels!.open('fixture-panel');
  expect(f.create).not.toHaveBeenCalled();
  f.available(true);
  f.load.mockImplementationOnce(async () => {
    panels!.stop();
    return f.create;
  });
  await panels!.open('fixture-panel');
  expect(f.create).not.toHaveBeenCalled();
});
it('loads restored open placements, defers closed ones and cancels a stale restore', async () => {
  const f = setup();
  f.register();
  f.restore(false);
  expect(f.load).not.toHaveBeenCalled();
  f.restore(true);
  f.restore(false);
  await vi.waitFor(() => expect(f.load).toHaveBeenCalledTimes(1));
  expect(f.create).not.toHaveBeenCalled();
  f.restore(true);
  await panels!.open('fixture-panel');
  expect(f.create).toHaveBeenCalledTimes(1);
});
it('honors a manual open while a superseded saved-layout restore is still importing', async () => {
  const f = setup();
  f.register();
  f.restore(true);
  f.restore(false);
  await panels!.open('fixture-panel');
  expect(f.create).toHaveBeenCalledTimes(1);
});
it('does not construct when a pending user open is explicitly closed', async () => {
  const f = setup();
  f.register();
  const pending = panels!.open('fixture-panel');
  panels!.close('fixture-panel');
  await pending;
  expect(f.create).not.toHaveBeenCalled();
  await panels!.open('fixture-panel');
  expect(f.create).toHaveBeenCalledTimes(1);
});
it('reacts to portable workbench restoration without constructing a saved closed panel', async () => {
  localStorage.clear();
  document.body.innerHTML = '<main id="log"></main>';
  const workbench = new Workbench({ titleFor: (root) => root.id, exclude: () => false, centre: 'main#log' });
  const registry = new CommandRegistry();
  const create = vi.fn((): Panel => {
    const root = document.createElement('dialog');
    root.id = 'restored-panel';
    document.body.append(root);
    return {
      id: root.id,
      title: 'Restored',
      group: 'tools',
      root,
      open: () => showPanel(root),
      close: () => root.close(),
      stop: () => root.remove(),
    };
  });
  const load = vi.fn(async () => create);
  panels = new LazyPanels(
    registry,
    workbench,
    () => 'anonymous',
    () => true,
    vi.fn(),
  );
  try {
    panels.register({ id: 'restored-panel', title: 'Restored', group: 'tools', load });
    const layout = dock(emptyLayout(), 'restored-panel', 'left');
    document.dispatchEvent(
      new CustomEvent('restore-settings', { detail: { workbench: setClosed(layout, 'restored-panel', true) } }),
    );
    expect(load).not.toHaveBeenCalled();
    document.dispatchEvent(new CustomEvent('restore-settings', { detail: { workbench: layout } }));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(document.querySelector('#restored-panel')?.closest('[data-zone]')?.getAttribute('data-zone')).toBe('left');
  } finally {
    panels.stop();
    workbench.stop();
    localStorage.clear();
  }
});

it('constructs contextual helpers without opening them and still honors a concurrent activation', async () => {
  const f = setup();
  f.register();
  const action = vi.fn();
  await panels!.perform('fixture-panel', action, false);
  const instance = f.create.mock.results[0]!.value;
  expect(instance.open).not.toHaveBeenCalled();
  expect(action).toHaveBeenCalledOnce();
  await panels!.open('fixture-panel');
  expect(instance.open).toHaveBeenCalledOnce();
});
it('coalesces a contextual load with an explicit open', async () => {
  const f = setup();
  f.register();
  const context = panels!.perform('fixture-panel', vi.fn(), false);
  const manual = panels!.open('fixture-panel');
  await Promise.all([context, manual]);
  expect(f.create).toHaveBeenCalledOnce();
  expect(f.create.mock.results[0]!.value.open).toHaveBeenCalledOnce();
});
it('moves an open dialog without firing its feature close handler or patching dialog prototypes', async () => {
  localStorage.clear();
  document.body.innerHTML = '<main id="log"></main>';
  const original = HTMLDialogElement.prototype.showModal;
  const wb = new Workbench({ titleFor: (root) => root.id, exclude: () => false, centre: 'main#log' });
  const root = document.createElement('dialog');
  root.id = 'live-panel';
  document.body.append(root);
  const featureClose = vi.fn();
  root.addEventListener('close', featureClose);
  const close = vi.fn(() => root.close());
  wb.adopt(root, close);
  showPanel(root);
  // happy-dom does not implement :modal; emulate that one platform state.
  const matches = root.matches.bind(root);
  vi.spyOn(root, 'matches').mockImplementation((selector) => (selector === ':modal' ? root.open : matches(selector)));
  document.dispatchEvent(
    new CustomEvent('restore-settings', { detail: { workbench: dock(emptyLayout(), root.id, 'left') } }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(root.open).toBe(true);
  expect(featureClose).not.toHaveBeenCalled();
  expect(HTMLDialogElement.prototype.showModal).toBe(original);
  root.querySelector<HTMLButtonElement>('.wb-close')!.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(close).toHaveBeenCalledOnce();
  expect(featureClose).toHaveBeenCalledOnce();
  wb.stop();
  localStorage.clear();
});

it('cancels a pending contextual callback when the panel is explicitly closed', async () => {
  const f = setup();
  f.register();
  await panels!.open('fixture-panel');
  const action = vi.fn();
  const pending = panels!.perform('fixture-panel', action, false);
  panels!.close('fixture-panel');
  await pending;
  expect(action).not.toHaveBeenCalled();
});

it('settings panels register no command', () => {
  const f = setup();
  f.registerSettings();
  expect(f.registry.get('panel:fixture-panel')).toBeUndefined();
  expect(panels!.settingsSections()).toEqual([
    expect.objectContaining({
      id: 'panel:fixture-panel',
      page: 'commands',
      section: 'Custom commands',
      keywords: 'fixture alias',
    }),
  ]);
});
it('open redirects settings panels to the settings opener', async () => {
  const f = setup();
  f.registerSettings();
  await panels!.open('fixture-panel');
  expect(f.load).not.toHaveBeenCalled();
  const opener = vi.fn();
  panels!.setSettingsOpener(opener);
  await panels!.open('fixture-panel');
  expect(opener).toHaveBeenCalledWith({ page: 'commands', section: 'Custom commands' });
  expect(f.load).not.toHaveBeenCalled();
  expect(f.workbench.adopt).not.toHaveBeenCalled();
});
it('a saved layout docking a settings panel is released and not opened', async () => {
  const f = setup(true);
  f.registerSettings();
  expect(f.workbench.forget).toHaveBeenCalledWith(['fixture-panel']);
  f.restore(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(f.load).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled();
});
it('embed mounts the root inline and shows it non-modally', async () => {
  const f = setup();
  f.registerSettings();
  const host = document.createElement('div');
  document.body.append(host);
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  const dispose = await panels!.embed('fixture-panel', host);
  const instance = f.create.mock.results[0]!.value;
  expect(showModal).not.toHaveBeenCalled();
  expect(instance.root.parentElement).toBe(host);
  expect(instance.root.dataset.embedded).toBe('true');
  expect(instance.root.open).toBe(true);
  expect(instance.open).toHaveBeenCalledOnce();
  expect(f.workbench.adopt).not.toHaveBeenCalled();
  const other = document.createElement('div');
  document.body.append(other);
  const again = await panels!.embed('fixture-panel', other);
  expect(f.create).toHaveBeenCalledOnce();
  expect(instance.root.parentElement).toBe(other);
  dispose();
  again();
  showModal.mockRestore();
});
it('embedded dialog that closes itself is shown again', async () => {
  const f = setup();
  f.registerSettings();
  const host = document.createElement('div');
  document.body.append(host);
  await panels!.embed('fixture-panel', host);
  const instance = f.create.mock.results[0]!.value;
  instance.root.close();
  expect(instance.root.open).toBe(false);
  await Promise.resolve();
  await Promise.resolve();
  expect(instance.root.open).toBe(true);
});
it('embed disposer stops the panel', async () => {
  const f = setup();
  f.registerSettings();
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = await panels!.embed('fixture-panel', host);
  const instance = f.create.mock.results[0]!.value;
  dispose();
  expect(instance.stop).toHaveBeenCalledOnce();
  instance.root.dispatchEvent(new Event('close'));
  await Promise.resolve();
  expect(instance.root.isConnected).toBe(false);
});
it('perform on a settings panel opens Settings, waits for the embed and then runs the action', async () => {
  const f = setup();
  f.registerSettings();
  const host = document.createElement('div');
  document.body.append(host);
  const opener = vi.fn(() => {
    void panels!.embed('fixture-panel', host);
  });
  panels!.setSettingsOpener(opener);
  const action = vi.fn(() => {
    expect(f.create.mock.results[0]!.value.root.parentElement).toBe(host);
  });
  await panels!.perform('fixture-panel', action);
  expect(opener).toHaveBeenCalledWith({ page: 'commands', section: 'Custom commands' });
  expect(action).toHaveBeenCalledOnce();
  expect(f.create).toHaveBeenCalledOnce();
  expect(f.workbench.adopt).not.toHaveBeenCalled();
});
it('perform without activation loads a settings panel unattached and a later embed reuses it', async () => {
  const f = setup();
  f.registerSettings();
  const opener = vi.fn();
  panels!.setSettingsOpener(opener);
  const action = vi.fn();
  await panels!.perform('fixture-panel', action, false);
  expect(opener).not.toHaveBeenCalled();
  expect(action).toHaveBeenCalledOnce();
  const instance = f.create.mock.results[0]!.value;
  expect(instance.open).not.toHaveBeenCalled();
  expect(instance.root.dataset.embedded).toBeUndefined();
  const host = document.createElement('div');
  document.body.append(host);
  await panels!.embed('fixture-panel', host);
  expect(f.create).toHaveBeenCalledOnce();
  expect(instance.root.parentElement).toBe(host);
  expect(instance.open).toHaveBeenCalledOnce();
});
it('a pending settings perform is abandoned when the panel is closed', async () => {
  const f = setup();
  f.registerSettings();
  panels!.setSettingsOpener(vi.fn());
  const action = vi.fn();
  const pending = panels!.perform('fixture-panel', action);
  panels!.close('fixture-panel');
  await pending;
  expect(action).not.toHaveBeenCalled();
});
