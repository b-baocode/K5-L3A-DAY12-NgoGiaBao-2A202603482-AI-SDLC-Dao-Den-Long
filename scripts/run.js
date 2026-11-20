#!/usr/bin/env node
// Game launcher (contract run_cmd). No extra dependencies.
//   node scripts/run.js                          -> builds if needed, serves the game on http://localhost:5174 and opens it
//   node scripts/run.js --export-leaderboard f   -> writes {"entries":[...]} (top 10, ranked) and exits
//   node scripts/run.js --port 8080 --no-open
// The leaderboard lives on local disk: data/leaderboard.json (survives closing and reopening the game).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addEntry, makeEntry, sortEntries } from '../src/sim/leaderboard.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
export const LB_FILE = process.env.DDL_LEADERBOARD || path.join(ROOT, 'data', 'leaderboard.json');

export function readLeaderboard() {
  try {
    const data = JSON.parse(fs.readFileSync(LB_FILE, 'utf8'));
    return sortEntries(Array.isArray(data.entries) ? data.entries : []);
  } catch {
    return [];
  }
}
export function writeLeaderboard(entries) {
  fs.mkdirSync(path.dirname(LB_FILE), { recursive: true });
  const tmp = `${LB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ entries: sortEntries(entries) }, null, 2) + '\n');
  fs.renameSync(tmp, LB_FILE); // atomic replace: a crash never leaves a half-written file
}

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serve(port, open) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.log('Building the game (first run)…');
    const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) process.exit(r.status || 1);
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/leaderboard') {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') return res.end(JSON.stringify({ entries: readLeaderboard() }));
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
        req.on('end', () => {
          try {
            const b = JSON.parse(body);
            const entry = makeEntry({ name: b.name, score: b.score, nightsWon: b.nights_won, seed: b.seed });
            const entries = addEntry(readLeaderboard(), entry);
            writeLeaderboard(entries);
            res.end(JSON.stringify({ entries, entry }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }
      res.statusCode = 405;
      return res.end('{}');
    }
    let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST)) { res.statusCode = 403; return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  server.listen(port, () => {
    const url = `http://localhost:${port}/`;
    console.log(`Đảo Đèn Lồng: ${url}   (Ctrl+C để thoát) · bảng xếp hạng: ${path.relative(ROOT, LB_FILE)}`);
    if (open) {
      const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
      try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
    }
  });
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (argv.includes('--export-leaderboard')) {
    const out = arg('--export-leaderboard');
    if (!out) { console.error('usage: run.js --export-leaderboard <out.json>'); process.exit(1); }
    fs.writeFileSync(out, JSON.stringify({ entries: readLeaderboard() }, null, 2) + '\n');
    console.log(`exported ${readLeaderboard().length} entries -> ${out}`);
    process.exit(0);
  }
  serve(parseInt(arg('--port') || '5174', 10), !argv.includes('--no-open'));
}
