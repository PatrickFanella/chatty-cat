export function mountLifecycle(
  offline: HTMLElement,
  update: HTMLButtonElement,
  build = new URL(import.meta.url).pathname,
): () => void {
  let disposed = false;
  let registration: ServiceWorkerRegistration | undefined;
  let reloading = false;
  const connectivity = (): void => {
    offline.hidden = navigator.onLine;
  };
  const offer = (): void => {
    update.hidden = !registration?.waiting;
  };
  const activate = (): void => {
    registration?.waiting?.postMessage('activate-update');
  };
  const controller = (): void => {
    if (reloading) return;
    if (!update.hidden) {
      reloading = true;
      location.reload();
    }
  };
  const found = (): void => {
    registration?.installing?.addEventListener('statechange', offer);
  };
  window.addEventListener('online', connectivity);
  window.addEventListener('offline', connectivity);
  update.addEventListener('click', activate);
  connectivity();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener('controllerchange', controller);
    void navigator.serviceWorker
      // Lazy chunk manifests change even when the worker source does not. Tie
      // registration to the loaded app build so its new chunks are installed.
      .register('/sw.js?build=' + encodeURIComponent(build), { scope: '/', updateViaCache: 'none', type: 'module' })
      .then((value) => {
        if (disposed) return;
        registration = value;
        offer();
        value.addEventListener('updatefound', found);
      })
      .catch(() => {
        update.title = 'Offline shell unavailable; live chat continues';
      });
  }
  return () => {
    disposed = true;
    window.removeEventListener('online', connectivity);
    window.removeEventListener('offline', connectivity);
    update.removeEventListener('click', activate);
    registration?.removeEventListener('updatefound', found);
    registration?.installing?.removeEventListener('statechange', offer);
    if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', controller);
  };
}
