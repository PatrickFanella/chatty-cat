// Firefox has no webpage runtime.sendMessage bridge. Relay only this top-level
// app origin to our own background page; pairing still binds the real tab.
(() => {
  const origin = 'https://chat.subcult.tv';
  if (window.top !== window || location.origin !== origin || location.pathname !== '/') return;
  let pending = 0;
  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (event.source !== window || event.origin !== origin || !data ||
        data.bridge !== 'chatty-cat-companion' || data.direction !== 'request' ||
        data.extension !== browser.runtime.id || !/^[a-f0-9]{64}$/.test(data.request) ||
        !data.payload || typeof data.payload !== 'object' || pending >= 16) return;
    try { if (JSON.stringify(data.payload).length > 2048) return; } catch { return; }
    pending++;
    let value;
    try {
      value = await browser.runtime.sendMessage({kind: 'app-message', payload: data.payload});
    } catch {
      value = {ok: false, error: 'Firefox companion disconnected or removed'};
    } finally { pending--; }
    window.postMessage({bridge: 'chatty-cat-companion', direction: 'response',
      extension: browser.runtime.id, request: data.request, value}, origin);
  });
})();
