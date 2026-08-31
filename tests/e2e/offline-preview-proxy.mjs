import http from 'node:http';
import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const publicPort = Number(process.env.RR5_PROXY_PORT ?? 4321);
const backendPort = Number(process.env.RR5_BACKEND_PORT ?? 4322);
const controlPrefix = '/__rr5-network/';
let originOffline = false;
let shuttingDown = false;

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const backend = spawn(pnpm, ['exec', 'astro', 'preview', '--host', host, '--port', String(backendPort)], {
  env: process.env,
  stdio: 'inherit',
});

function pingBackend() {
  return new Promise((resolve) => {
    const request = http.get({ host, port: backendPort, path: '/library', timeout: 1_000 }, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

async function waitForBackend() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await pingBackend()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`RR5 Astro preview did not become ready on ${host}:${backendPort}.`);
}

function respondControl(request, response, pathname) {
  if (request.method !== 'POST') {
    response.writeHead(405, { Allow: 'POST' });
    response.end();
    return true;
  }
  if (pathname === `${controlPrefix}offline`) {
    originOffline = true;
    response.writeHead(204);
    response.end();
    return true;
  }
  if (pathname === `${controlPrefix}online`) {
    originOffline = false;
    response.writeHead(204);
    response.end();
    return true;
  }
  if (pathname === `${controlPrefix}status`) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ originOffline }));
    return true;
  }
  return false;
}

const proxy = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${publicPort}`);
  if (url.pathname.startsWith(controlPrefix) && respondControl(request, response, url.pathname)) return;

  if (originOffline) {
    response.writeHead(503, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-rr5-origin-offline': '1',
    });
    response.end('RR5 simulated origin outage');
    return;
  }

  const headers = { ...request.headers, host: `${host}:${backendPort}` };
  const upstream = http.request({
    host,
    port: backendPort,
    method: request.method,
    path: request.url,
    headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.statusMessage, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });

  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.pipe(upstream);
});

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  proxy.close(() => {
    if (!backend.killed) backend.kill('SIGTERM');
    process.exit(code);
  });
  setTimeout(() => {
    if (!backend.killed) backend.kill('SIGKILL');
    process.exit(code);
  }, 2_000).unref();
}

backend.on('exit', (code, signal) => {
  if (shuttingDown) return;
  console.error(`[rr5-proxy] Astro preview exited unexpectedly (${signal ?? code ?? 'unknown'}).`);
  shutdown(code || 1);
});
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

await waitForBackend();
proxy.listen(publicPort, host, () => {
  console.log(`[rr5-proxy] http://${host}:${publicPort} -> http://${host}:${backendPort}`);
});
