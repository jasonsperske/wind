#!/usr/bin/env node
// Serve the game and forward the port into a tethered Quest.
//
// `adb reverse tcp:8080 tcp:8080` makes the headset's own localhost:8080 point
// back at this machine. That matters for more than convenience: WebXR needs a
// secure context, and http://localhost counts as one — so no certificates, no
// LAN address, no https juggling.
import { execFileSync, execFile } from 'node:child_process';
import { createServer } from './serve.js';

const PORT = Number(process.env.PORT || 8080);
const URL_IN_HEADSET = `http://localhost:${PORT}`;
const open = process.argv.includes('--open');

function adb(args, opts = {}) {
  return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function devices() {
  const out = adb(['devices']);
  return out.split('\n').slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length >= 2 && p[1] === 'device')
    .map((p) => p[0]);
}

function main() {
  let found = [];
  try {
    found = devices();
  } catch (err) {
    console.error('Could not run `adb`. Install the Android platform-tools and put adb on your PATH.');
    process.exit(1);
  }

  if (found.length === 0) {
    console.error('No authorised device. On the Quest: enable Developer Mode in the phone app,');
    console.error('plug in the USB cable, put the headset on and accept "Allow USB debugging".');
    console.error('Then run `adb devices` — it should list your headset as "device".');
    process.exit(1);
  }
  console.log(`Device: ${found[0]}${found.length > 1 ? ` (+${found.length - 1} more)` : ''}`);

  try {
    adb(['reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
    console.log(`Forwarded headset localhost:${PORT} -> this machine :${PORT}`);
  } catch (err) {
    console.error('adb reverse failed:', String(err.stderr || err.message).trim());
    process.exit(1);
  }

  const server = createServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log(`  In the headset, open:  ${URL_IN_HEADSET}`);
    console.log('  Then tap "Enter headset".');
    console.log('');
    console.log('Ctrl-C to stop.');
    if (open) {
      execFile('adb', ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', URL_IN_HEADSET],
        (err) => {
          if (err) console.error('Could not launch the browser remotely; open the URL by hand.');
          else console.log('Asked the headset to open the page.');
        });
    }
  });

  const cleanup = () => {
    try { adb(['reverse', '--remove', `tcp:${PORT}`]); } catch { /* device already gone */ }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main();
