import { expect, it } from 'vitest';
import { parsePresentation, presentationDefaults } from './presentation';
import { overlayAppearance, overlayAppearanceStyles } from './overlay-appearance';
it('preserves transparent/no-added-shadow defaults and bounds public overlay rendering values', () => {
  const defaults = overlayAppearance(presentationDefaults);
  expect(defaults.backgroundOpacity).toBe(0);
  expect(defaults.shadow).toBe(false);
  const p = parsePresentation({
    overlayBackgroundOpacity: 999,
    overlayShadowOpacity: -1,
    overlayShadowOffsetX: -99,
    overlayShadowOffsetY: 99,
    overlayShadowRadius: 99,
    overlayShadowColor: 'red;url(https://evil)',
    token: 'secret',
  });
  expect(overlayAppearance(p)).toEqual({
    backgroundOpacity: 255,
    shadow: false,
    shadowOpacity: 0,
    shadowOffsetX: -20,
    shadowOffsetY: 20,
    shadowRadius: 40,
    shadowColor: '#000000',
  });
  expect(JSON.stringify(p)).not.toContain('secret');
});
it('uses background alpha separately from content opacity and constructs only bounded CSS shadow values', () => {
  const styles = overlayAppearanceStyles(
    overlayAppearance(
      parsePresentation({
        overlayBackgroundOpacity: 128,
        overlayShadow: true,
        overlayShadowOpacity: 128,
        overlayShadowColor: '#123456',
        overlayShadowOffsetX: -3,
        overlayShadowOffsetY: 4,
        overlayShadowRadius: 6,
      }),
    ),
  );
  expect(styles['--overlay-background-alpha']).toBe('50.19607843137255%');
  expect(styles['--overlay-content-shadow']).toBe('drop-shadow(-3px 4px 6px rgba(18,52,86,0.5019607843137255))');
  expect(Object.keys(styles)).toEqual(['--overlay-background-alpha', '--overlay-content-shadow']);
});
