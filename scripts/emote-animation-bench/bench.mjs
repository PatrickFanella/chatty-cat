// Interleaved feature/control resource measurement for #136. See docs/emote-animation-qualification-2026-11-03.md.
// Usage: node bench.mjs <chrome> <channel,list> <rounds> <out.jsonl>  (env: FEATURE_URL, CONTROL_URL, PROFILE, WARM, PHASE)
import { launch, attach } from './cdp.mjs';
import { readFileSync, readdirSync, appendFileSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
const [bin, channel, rounds, out] = [process.argv[2], process.argv[3], +process.argv[4], process.argv[5]];
const PHASE = +(process.env.PHASE || 30),
  WARM = +(process.env.WARM || 45);
const variants = {
  feature: process.env.FEATURE_URL || 'http://127.0.0.1:18431/',
  control: process.env.CONTROL_URL || 'http://127.0.0.1:18432/',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function tree(root) {
  const kids = new Map();
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const s = readFileSync(`/proc/${d}/stat`, 'utf8');
      const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
      (kids.get(+f[1]) || kids.set(+f[1], []).get(+f[1])).push(+d);
    } catch {}
  }
  const all = [root];
  for (let i = 0; i < all.length; i++) all.push(...(kids.get(all[i]) || []));
  return all;
}
function ticks(root) {
  let t = 0;
  for (const p of tree(root)) {
    try {
      const s = readFileSync(`/proc/${p}/stat`, 'utf8');
      const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
      t += +f[11] + +f[12];
    } catch {}
  }
  return t; // utime+stime, clock ticks (100/s)
}
const gpu = (secs) =>
  new Promise((res) =>
    execFile(
      'sudo',
      [
        '-n',
        'python3',
        '-I',
        new URL('./pmu.py', import.meta.url).pathname,
        String(secs),
        'rcs0-busy',
        'vecs0-busy',
        'bcs0-busy',
      ],
      (e, so) =>
        res(
          e
            ? { error: String(e) }
            : Object.fromEntries(
                so
                  .trim()
                  .split(' ')
                  .map((kv) => kv.split('='))
                  .map(([k, v]) => [k, +v]),
              ),
        ),
    ),
  );
const PAGE = `(() => {
  const imgs = [...document.querySelectorAll('img[data-emote-animation]')];
  const still = imgs.filter((i) => /static/i.test(i.getAttribute('src') || '')).length;
  const log = [document.getElementById('log'), ...document.querySelectorAll('#log *')].find((e) => e.scrollHeight > e.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(e).overflowY));
  const r = log && log.getBoundingClientRect(); const at = log && document.elementFromPoint(r.left + 40, r.top + 30);
  const row = at && at.closest('#log > * > *, #log *[class*=row], #log .line, #log article, #log li');
  return { vis: document.visibilityState, msgs: +(document.getElementById('count')?.textContent || '0').replace(/\\D/g, ''), tracked: imgs.length, still, playing: imgs.length - still, animatedAll: document.querySelectorAll('img[data-animated-emote]').length, scrollTop: log ? Math.round(log.scrollTop) : null, scrollHeight: log ? log.scrollHeight : null, anchor: row ? (row.textContent || '').slice(0, 40).length + ':' + [...(row.textContent || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0) : null };
})()`;
const SCROLL_HISTORY = `(() => { const log = [document.getElementById('log'), ...document.querySelectorAll('#log *')].find((e) => e.scrollHeight > e.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(e).overflowY)); log.scrollTop = Math.round((log.scrollHeight - log.clientHeight) * 0.4); log.dispatchEvent(new Event('scroll')); return log.scrollTop; })()`;
const SCROLL_LIVE = `(() => { const b = document.getElementById('latest'); if (b && !b.hidden) b.click(); const log = [document.getElementById('log'), ...document.querySelectorAll('#log *')].find((e) => e.scrollHeight > e.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(e).overflowY)); log.scrollTop = log.scrollHeight; log.dispatchEvent(new Event('scroll')); return true; })()`;
const document_follow = (s) => s.scrollHeight - s.scrollTop < 1200;
async function phase(name, page, root, variant, round, ws, other) {
  const a = await page.eval(PAGE),
    t0 = ticks(root),
    w0 = Date.now();
  const g = await gpu(PHASE);
  const t1 = ticks(root),
    w1 = Date.now(),
    b = await page.eval(PAGE);
  const rec = {
    round,
    variant,
    phase: name,
    seconds: (w1 - w0) / 1000,
    cpuPct: +(((t1 - t0) * 1000) / (w1 - w0)).toFixed(1),
    gpuRcsPct: g.error ? null : +((g['rcs0-busy'] / g.wall_ns) * 100).toFixed(3),
    gpuVecsPct: g.error ? null : +((g['vecs0-busy'] / g.wall_ns) * 100).toFixed(3),
    gpuBcsPct: g.error ? null : +((g['bcs0-busy'] / g.wall_ns) * 100).toFixed(3),
    msgsPerSec: +((b.msgs - a.msgs) / ((w1 - w0) / 1000)).toFixed(2),
    start: a,
    end: b,
    gpuError: g.error,
  };
  appendFileSync(out, JSON.stringify(rec) + '\n');
  console.log(
    JSON.stringify({
      round,
      variant,
      name,
      cpu: rec.cpuPct,
      gpu: rec.gpuRcsPct,
      mps: rec.msgsPerSec,
      vis: b.vis,
      playing: b.playing,
      still: b.still,
      anchorStable: a.anchor === b.anchor,
      st: [a.scrollTop, b.scrollTop],
    }),
  );
}
const order = [];
for (let r = 1; r <= rounds; r++)
  order.push(...(r % 2 ? ['feature', 'control'] : ['control', 'feature']).map((v) => [r, v]));
let port = 9400;
for (const [round, variant] of order) {
  const profile = `${process.env.PROFILE}-${round}-${variant}`;
  rmSync(profile, { recursive: true, force: true });
  const { proc, ws } = await launch(
    bin,
    [
      '--headless=new',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--use-angle=gl-egl',
      '--window-size=1280,800',
      `--user-data-dir=${profile}`,
    ],
    port++,
  );
  const { targetInfos } = await ws.send('Target.getTargets');
  const first = targetInfos.find((t) => t.type === 'page');
  const page = await attach(ws, first.targetId);
  await page.send('Page.navigate', { url: variants[variant] + '?channel=' + channel });
  await sleep(WARM * 1000);
  await phase('live', page, proc.pid, variant, round);
  let held = false,
    tries = 0;
  for (; tries < 6 && !held; tries++) {
    const target = await page.eval(SCROLL_HISTORY);
    await sleep(1500);
    const now = await page.eval(PAGE);
    held = Math.abs(now.scrollTop - target) < 64 && !document_follow(now);
  }
  appendFileSync(out, JSON.stringify({ round, variant, phase: 'history-scroll', held, tries }) + '\n');
  await phase('history', page, proc.pid, variant, round);
  await page.eval(SCROLL_LIVE);
  await sleep(1500);
  const { targetId } = await ws.send('Target.createTarget', { url: 'about:blank' });
  await sleep(1500);
  await phase('hidden', page, proc.pid, variant, round);
  await ws.send('Target.activateTarget', { targetId: first.targetId });
  await sleep(1500);
  appendFileSync(out, JSON.stringify({ round, variant, phase: 'restored', state: await page.eval(PAGE) }) + '\n');
  proc.kill();
  await sleep(2000);
}
process.exit(0);
