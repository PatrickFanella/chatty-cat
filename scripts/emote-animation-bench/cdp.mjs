// Minimal raw CDP client over Node's WebSocket. Playwright is not used because it
// emulates focus, which keeps background tabs reporting visible.
import { spawn } from 'node:child_process';
export async function launch(bin, args, port) {
  const proc = spawn(
    bin,
    [`--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', ...args, 'about:blank'],
    { stdio: 'ignore' },
  );
  let ver;
  for (let i = 0; i < 100; i++) {
    try {
      ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return { proc, ws: await connect(ver.webSocketDebuggerUrl) };
}
export function connect(url) {
  return new Promise((res) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pend = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) {
        const [ok, ko] = pend.get(d.id);
        pend.delete(d.id);
        d.error ? ko(new Error(JSON.stringify(d.error))) : ok(d.result);
      }
    };
    const send = (method, params = {}, sessionId) =>
      new Promise((ok, ko) => {
        const i = ++id;
        pend.set(i, [ok, ko]);
        ws.send(JSON.stringify({ id: i, method, params, sessionId }));
      });
    ws.onopen = () => res({ send, close: () => ws.close() });
  });
}
export async function attach(c, targetId) {
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
  return {
    eval: async (expr) =>
      (await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId))
        .result.value,
    send: (m, p) => c.send(m, p, sessionId),
  };
}
