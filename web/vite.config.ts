import { defineConfig } from 'vite';

export default defineConfig({
  build: { rollupOptions: { input: { main: 'index.html', sw: 'src/service-worker.ts' }, output: { entryFileNames: chunk => chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js' } } },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', ws: true },
    },
  },
});
