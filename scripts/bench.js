#!/usr/bin/env node
// Benchmark (contract bench_cmd) — Ticket-04 §1.
//   node scripts/bench.js --seed 42 --duration 30 --out bench.json
// Builds the web game if needed, serves it, opens a real (non-headless) 1280x720 browser window with vsync and the
// frame-rate limit disabled, runs the standard scene (index.html?bench=...), then writes bench.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
import { fileURLToPath } from 'node:url';

const T0 = Date.now(); // "process start" for load_ms
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const seed = parseInt(arg('--seed', '42'), 10);
const duration = parseFloat(arg('--duration', '30'));
const out = arg('--out', 'bench.json');
const headless = argv.includes('--headless'); // only for CI smoke runs; real measurements use a window

const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
}

// serve dist/ (same static server as the game launcher, random free port, no browser auto-open)
process.argv = [process.argv[0], 'run.js'];
const { default: http } = await import('node:http');
const DIST = path.join(ROOT, 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let f = path.normalize(path.join(DIST, decodeURIComponent(u.pathname)));
  if (!f.startsWith(DIST)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const { default: puppeteer } = await import('puppeteer');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-bench-'));
const browser = await puppeteer.launch({
  headless,
  userDataDir,
  defaultViewport: { width: 1280, height: 720 },
  args: [
    '--window-size=1280,800', // windowed, not fullscreen
    // GPU vsync off. Chrome's frame-rate limiter is kept on purpose: with --disable-frame-rate-limit as well, rAF outruns
    // the GPU, frames "take" 2-3 ms and then the command queue stalls for ~200 ms every ~300 ms (measured, see
    // docs/proof/phase-4/BENCH.md) — that measures queue back-pressure, not frame time.
    ...(process.env.DDL_BENCH_FLAGS ?? '--disable-gpu-vsync').split(' ').filter(Boolean),
    '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ],
});

// peak RSS of the browser's own processes (PIDs from the DevTools protocol; no WMI, cheap enough to sample while measuring)
// PIDs are collected ONCE after the page has loaded (SystemInfo.getProcessInfo pauses the GPU process, so it must
// never run inside the measured window); during the measurement only the cheap OS process list is read.
let pidSet = null;
async function collectPids() {
  const cdp = await browser.target().createCDPSession();
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
  pidSet = new Set([browser.process().pid, ...processInfo.map((x) => x.id)]);
  await cdp.detach();
}
async function browserPids() {
  return pidSet;
}
async function treeRssMb() {
  try {
    const pids = await browserPids();
    if (process.platform === 'win32') {
      const { stdout } = await execFileP('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 24 });
      let kb = 0;
      for (const line of stdout.split('\n')) {
        const c = line.split('","');
        if (c.length < 5 || !pids.has(parseInt(c[1], 10))) continue;
        kb += parseInt(c[4].replace(/[^0-9]/g, ''), 10) || 0; // "Mem Usage" = working set in K
      }
      return kb / 1024;
    }
    const { stdout } = await execFileP('ps', ['-o', 'rss=', '-p', [...pids].join(',')], { encoding: 'utf8' });
    return stdout.split('\n').reduce((a, l) => a + (parseInt(l.trim(), 10) || 0), 0) / 1024;
  } catch {
    return null;
  }
}

let peak = null;
let sampling = false;
let sampler = Promise.resolve();
function startSampler() {
  sampling = true;
  sampler = (async () => {
    while (sampling) {
      const m = MEM_OFF ? null : await treeRssMb();
      if (m !== null) peak = Math.max(peak ?? 0, m);
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();
}
const MEM_OFF = process.env.DDL_BENCH_NO_MEM === "1";

const [page] = await browser.pages();
await page.goto(`http://localhost:${port}/?bench=${seed}&duration=${duration}${process.env.DDL_BENCH_QS || ''}`);
await page.waitForFunction(() => window.__bench && window.__bench.firstFrameEpoch > 0, { timeout: 60000 });
const firstFrameEpoch = await page.evaluate(() => window.__bench.firstFrameEpoch);
if (!MEM_OFF) await collectPids(); // during the 3 s warm-up, outside the measured window
await new Promise((r) => setTimeout(r, Math.max(0, 3200 - (Date.now() - firstFrameEpoch)))); // wait out the warm-up without touching the page
startSampler();
await new Promise((r) => setTimeout(r, Math.max(0, (3 + duration) * 1000 - (Date.now() - firstFrameEpoch) + 300))); // no page polling while measuring
await page.waitForFunction(() => window.__bench.done, { timeout: 60000, polling: 500 });
const r = await page.evaluate(() => ({ dts: window.__bench.dts, gl: window.__glRenderer, three: window.__threeRevision }));
if (process.env.DDL_BENCH_DEBUG) { let acc = 0; const big = []; r.dts.forEach((d) => { acc += d; if (d > 30) big.push([Math.round(acc), Math.round(d)]); }); console.error("spikes [t_ms, dt_ms]:", JSON.stringify(big)); }
const version = await browser.version();
sampling = false;
await sampler;
await browser.close();
server.close();
try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}

// statistics exactly as defined in Ticket-04
const dts = r.dts;
const N = dts.length;
const sum = dts.reduce((a, b) => a + b, 0);
const sorted = [...dts].sort((a, b) => a - b);
const k = Math.max(1, Math.ceil(0.01 * N));
const worst = sorted.slice(N - k);
const p95 = sorted[Math.min(N - 1, Math.ceil(0.95 * N) - 1)];
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const result = {
  contract_version: contract.contract_version,
  avg_fps: round((1000 * N) / sum),
  p1_low_fps: round(1000 / (worst.reduce((a, b) => a + b, 0) / k)),
  frame_ms_p95: round(p95, 2),
  frames: N,
  load_ms: firstFrameEpoch - T0,
  peak_mem_mb: peak === null ? null : round(peak),
  vsync_off: true,
  renderer: `three.js r${r.three} WebGL2 · ${r.gl} · ${version}`,
  os: `${os.type()} ${os.release()} ${os.arch()} · ${os.cpus()[0]?.model} · ${Math.round(os.totalmem() / 1073741824)} GB RAM`,
  seed,
  duration_s: duration,
  window: '1280x720 windowed',
  headless,
  note: 'peak_mem_mb = summed RSS (Windows: working set) of all browser processes (PIDs via DevTools SystemInfo), sampled every 2 s while measuring',
};
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exit(0);
