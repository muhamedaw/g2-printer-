'use strict';

const { spawnSync, spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PROJECT      = 'C:\\Users\\Muhammed\\Desktop\\github\\money-printer g2';
const DASH_DIR     = path.join(PROJECT, 'apps', 'dashboard');
const API_HEALTH   = 'http://localhost:3001/health';
const DASHBOARD    = 'http://localhost:3006';

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  white:  '\x1b[97m',
};

const p    = (m = '') => process.stdout.write(m + '\n');
const step = (m) => p(`\n${C.cyan}${C.bold}  >>  ${C.reset}${C.white}${m}${C.reset}`);
const ok   = (m) => p(`${C.green}  OK  ${C.reset}${m}`);
const warn = (m) => p(`${C.yellow}  !!  ${C.reset}${m}`);
const fail = (m) => p(`${C.red}  XX  ${C.reset}${m}`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isDockerRunning() {
  const r = spawnSync('docker', ['info'], { shell: true, encoding: 'utf8', timeout: 6_000 });
  return r.status === 0;
}

async function ensureDockerRunning() {
  if (isDockerRunning()) return true;

  step('Docker Desktop is not running — starting it...');
  const exePaths = [
    'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
    path.join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
  ];
  let launched = false;
  for (const exe of exePaths) {
    try {
      const proc = spawn(exe, [], { detached: true, stdio: 'ignore', shell: false });
      proc.unref();
      launched = true;
      break;
    } catch { /* try next path */ }
  }
  if (!launched) {
    // Last resort: open via shell association
    spawnSync('cmd', ['/c', 'start', '', 'Docker Desktop'], { shell: false });
  }

  const TIMEOUT = 90_000;
  const t = Date.now();
  process.stdout.write('  Waiting for Docker daemon');
  while (Date.now() - t < TIMEOUT) {
    await sleep(3_000);
    process.stdout.write('.');
    if (isDockerRunning()) {
      p('');
      ok('Docker Desktop is ready');
      return true;
    }
  }
  p('');
  return false;
}

async function waitForApi(ms = 120_000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const alive = await new Promise(res => {
      const req = http.get(API_HEALTH, r => res(r.statusCode < 500));
      req.on('error', () => res(false));
      req.setTimeout(2000, () => { req.destroy(); res(false); });
    });
    if (alive) return true;
    await sleep(2500);
    process.stdout.write('.');
  }
  p('');
  return false;
}

async function main() {
  process.stdout.write('\x1b]0;Money Printer G2\x07');
  console.clear();

  p('');
  p(`${C.green}${C.bold}  +=========================================+${C.reset}`);
  p(`${C.green}${C.bold}  |   $ Money Printer G2 -- Paper Mode $   |${C.reset}`);
  p(`${C.green}${C.bold}  +=========================================+${C.reset}`);
  p('');

  // 1. Docker
  step('Starting Docker services...');
  const dockerReady = await ensureDockerRunning();
  if (!dockerReady) {
    fail('Could not start Docker Desktop. Please open it manually and retry.');
    await sleep(10_000);
    process.exit(1);
  }

  let r = spawnSync('docker', ['compose', 'up', '-d', '--build'], { cwd: PROJECT, shell: true, encoding: 'utf8' });
  if (r.status !== 0) {
    r = spawnSync('docker-compose', ['up', '-d'], { cwd: PROJECT, shell: true, encoding: 'utf8' });
    if (r.status !== 0) {
      fail('docker compose up failed');
      p(r.stderr ?? '');
      await sleep(10_000);
      process.exit(1);
    }
  }
  ok('Docker services started');

  // 2. Wait for API
  step('Waiting for API Gateway to be healthy...');
  process.stdout.write('  ');
  const healthy = await waitForApi();
  p('');
  if (healthy) ok('API Gateway is ready');
  else warn('API slow to respond -- continuing anyway');

  // 3. Vite dashboard
  step('Starting dashboard...');
  const vite = spawn('cmd', ['/c', 'npx', 'vite', '--port', '3006'], {
    cwd: DASH_DIR,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
  });
  vite.unref();
  await sleep(4000);
  ok(`Dashboard at ${DASHBOARD}`);

  // 4. Browser
  step('Opening browser...');
  spawnSync('cmd', ['/c', 'start', '', DASHBOARD], { shell: false });
  ok('Browser opened');

  // Done
  p('');
  p(`${C.green}${C.bold}  +=========================================+${C.reset}`);
  p(`${C.green}${C.bold}  |   All systems operational!              |${C.reset}`);
  p(`${C.green}${C.bold}  +=========================================+${C.reset}`);
  p('');
  p(`  ${C.gray}Dashboard :${C.reset}  ${DASHBOARD}`);
  p(`  ${C.gray}API       :${C.reset}  http://localhost:3001`);
  p(`  ${C.gray}Telegram  :${C.reset}  Notifications active via bot`);
  p('');
  p(`  ${C.gray}Close this window anytime.`);
  p(`  ${C.gray}Docker keeps running in background.${C.reset}`);
  p('');

  await new Promise(() => {});
}

main().catch(e => {
  fail('Error: ' + e.message);
  process.exitCode = 1;
});
