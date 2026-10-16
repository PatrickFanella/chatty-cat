import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'storage-worker-manifest',
      generateBundle: {
        order: 'post',
        handler(_options, bundle) {
          const manifest = bundle['asset-manifest.json'];
          const workers = Object.values(bundle).filter((entry) =>
            /^assets\/storage-worker-[A-Za-z0-9_-]+\.js$/.test(entry.fileName),
          );
          if (!manifest || manifest.type !== 'asset' || workers.length !== 1)
            throw new Error('Storage worker is missing from the immutable build manifest');
          const entries = JSON.parse(
            typeof manifest.source === 'string' ? manifest.source : new TextDecoder().decode(manifest.source),
          );
          entries['src/storage-worker.ts'] = {
            file: workers[0]!.fileName,
            src: 'src/storage-worker.ts',
            isEntry: true,
          };
          manifest.source = JSON.stringify(entries, null, 2);
        },
      },
    },
  ],
  build: {
    manifest: 'asset-manifest.json',
    rollupOptions: {
      input: { main: 'index.html', sw: 'src/service-worker.ts' },
      output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', ws: true },
    },
  },
});
