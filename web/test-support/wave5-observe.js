(async () => {
  const manifest = await (await fetch('/asset-manifest.json')).json();
  const { ResourceReadout } = await import('/' + manifest['src/resource-readout.ts'].file);
  const qa = (window.__wave = {
    startedAt: Date.now(),
    durationMs: 900000,
    main: manifest['index.html'].file,
    worker: manifest['src/storage-worker.ts'].file,
    operations: {},
    maxPostMs: 0,
    slowPosts: [],
    guardAttempts: 0,
    errors: [],
    complete: false,
  });
  const readout = (window.__waveReadout = new ResourceReadout(() => ({
    mountedRows: document.querySelectorAll('#log .row').length,
    rowCache: NaN,
    retainedMessages: Number((document.querySelector('#count')?.textContent ?? '0').replace(/\D/g, '')),
  })));
  readout.open();
  readout.root.style.display = 'none';
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (value, ...args) {
    const op = value?.operation,
      start = performance.now();
    try {
      if (op) qa.operations[op] = (qa.operations[op] ?? 0) + 1;
      return post.call(this, value, ...args);
    } finally {
      const elapsed = performance.now() - start;
      qa.maxPostMs = Math.max(qa.maxPostMs, elapsed);
      if (elapsed > 50 && qa.slowPosts.length < 20) qa.slowPosts.push({ op, elapsed });
    }
  };
  const open = indexedDB.open;
  indexedDB.open = function (name, ...args) {
    if (
      ['chatthing-archive', 'chatthing-statistics', 'chatthing:v1:rates', 'chatthing-moderation-journal'].includes(name)
    ) {
      qa.guardAttempts++;
      throw new Error('Window storage forbidden during qualification');
    }
    return open.call(this, name, ...args);
  };
  const stringify = JSON.stringify;
  JSON.stringify = function (value, ...args) {
    if (
      value &&
      typeof value === 'object' &&
      Array.isArray(value.rows) &&
      ((value.version === 1 && Array.isArray(value.seen)) || (Number.isFinite(value.at) && Array.isArray(value.gaps)))
    ) {
      qa.guardAttempts++;
      throw new Error('Window snapshot encoding forbidden');
    }
    return stringify.call(this, value, ...args);
  };
  window.addEventListener('error', (e) => {
    if (qa.errors.length < 10) qa.errors.push(e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (qa.errors.length < 10) qa.errors.push(String(e.reason));
  });
  qa.initial = readout.snapshot();
  setTimeout(() => {
    qa.final = readout.snapshot();
    qa.finishedAt = Date.now();
    qa.complete = true;
    readout.root.close();
  }, 900000);
  return { startedAt: qa.startedAt, main: qa.main, initial: qa.initial };
})();
