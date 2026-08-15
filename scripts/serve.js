#!/usr/bin/env node
// Dependency-free static server. Everything the game needs is in this repo, so
// the headset never has to reach the internet — which is the whole point of
// serving it over `adb reverse`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glsl': 'text/plain; charset=utf-8',
};

export function createServer() {
  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';

    const file = path.join(ROOT, path.normalize(pathname));
    if (!file.startsWith(ROOT)) {           // no climbing out of the project
      res.writeHead(403).end('forbidden');
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found: ' + pathname);
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        // Reloading in the headset should always pick up what you just edited.
        'cache-control': 'no-store',
      });
      res.end(data);
    });
  });
}

function run() {
  const port = Number(process.env.PORT || process.argv[2] || 8080);
  const server = createServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try: PORT=8081 npm run dev`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`The Wind is served from ${ROOT}`);
    console.log(`  local     http://localhost:${port}`);
    console.log(`  headset   http://localhost:${port}   (after: adb reverse tcp:${port} tcp:${port})`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
