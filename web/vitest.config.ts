import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 4,
    environmentOptions: { happyDOM: { settings: { navigation: { disableChildFrameNavigation: true } } } },
  },
});
