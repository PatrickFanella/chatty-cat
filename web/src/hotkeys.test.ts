// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { ACTIONS, defaultBindings, bindingFor, validateBindings, parseHotkeys, canHandle } from './hotkeys';
it('canonicalizes physical bindings and reports conflicting actions and browser shortcuts before save', () => {
  const bindings = defaultBindings();
  expect(validateBindings(bindings)).toEqual([]);
  bindings.compose = bindings.palette ?? '';
  expect(validateBindings(bindings).join(' ')).toMatch(/conflict/i);
  bindings.compose = 'Mod+KeyL';
  expect(validateBindings(bindings).join(' ')).toMatch(/browser/i);
  bindings.compose = 'KeyM';
  expect(validateBindings(bindings).join(' ')).toMatch(/modifier/i);
  expect(bindingFor(new KeyboardEvent('keydown', { code: 'KeyM', altKey: true, shiftKey: true }))).toBe(
    'Alt+Shift+KeyM',
  );
  expect(bindingFor(new KeyboardEvent('keydown', { code: 'KeyM', metaKey: true }))).toBe('Mod+KeyM');
});
it('rejects unknown actions, excessive data, conflicting imported bindings and invalid versions', () => {
  expect(parseHotkeys({ version: 1, bindings: defaultBindings(), token: 'secret' })).toEqual({
    version: 1,
    bindings: defaultBindings(),
  });
  expect(parseHotkeys({ version: 2, bindings: {} })).toBeNull();
  expect(parseHotkeys({ version: 1, bindings: { send: 'Alt+KeyS' } })).toBeNull();
  const bindings = defaultBindings();
  bindings.compose = bindings.palette ?? '';
  expect(parseHotkeys({ version: 1, bindings })).toBeNull();
});
it('does not intercept IME, editable text or open dialogs for chat actions', () => {
  const field = document.createElement('textarea');
  document.body.append(field);
  field.focus();
  const chat = ACTIONS.find((a) => a.id === 'pane-next')!;
  expect(canHandle(chat, new KeyboardEvent('keydown', { code: 'ArrowRight', altKey: true }), field, false)).toBe(false);
  expect(canHandle(chat, new KeyboardEvent('keydown', { isComposing: true }), document.body, false)).toBe(false);
  expect(canHandle(chat, new KeyboardEvent('keydown'), document.body, true)).toBe(false);
  expect(canHandle(chat, new KeyboardEvent('keydown'), document.body, false)).toBe(true);
  field.remove();
});
