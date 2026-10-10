import { spawn } from 'node:child_process';
import { copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(serverRoot, 'data', 'integration-test.db');
const seedDbPath = path.join(serverRoot, 'data', 'simulator.db');
// Prisma 的 schema engine 在 Windows 上对相对 SQLite URL 更稳定；路径相对 prisma/schema.prisma。
const databaseUrl = 'file:../data/integration-test.db';
const port = 18080;
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), HOST: '127.0.0.1' };
let server;
async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const body = await fetch(`${base}/api/health`).then((r) => r.json());
      if (body.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('server did not become healthy');
}
async function api(pathname, options = {}, cookie = '') {
  const response = await fetch(`${base}/api${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
  const body = await response.json();
  if (!body.ok) throw new Error(`${pathname}: ${body.message || 'request failed'}`);
  return { data: body.data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}
async function removeWithRetry(file) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { await rm(file, { force: true }); return; }
    catch (error) {
      if (error.code !== 'EBUSY' || attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

try {
  await rm(dbPath, { force: true });
  // 独立副本保证测试不会改写演示数据库。首次执行前请运行 db:push 与 db:seed。
  await copyFile(seedDbPath, dbPath);
  server = spawn(process.execPath, ['src/index.js'], { cwd: serverRoot, env, stdio: 'ignore' });
  await waitForHealth();

  const adminLogin = await api('/admin/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
  const scenarios = await api('/admin/scenarios', {}, adminLogin.cookie);
  const original = scenarios.data.find((item) => item.name === 'SHEIN 演示场景');
  if (!original) throw new Error('seed scenario missing');
  const copied = await api(`/admin/scenarios/${original.id}/duplicate`, { method: 'POST' }, adminLogin.cookie);
  const originalProducts = await api(`/admin/scenarios/${original.id}/products?pageSize=1`, {}, adminLogin.cookie);
  const crossWrite = await fetch(`${base}/api/admin/scenarios/${copied.data.id}/products/${originalProducts.data.list[0].id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminLogin.cookie }, body: JSON.stringify({ title: 'must not write' }),
  }).then((r) => r.json());
  if (crossWrite.ok) throw new Error('cross-scenario write was accepted');
  await api(`/admin/scenarios/${copied.data.id}`, { method: 'DELETE' }, adminLogin.cookie);

  const siteLogin = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'seller01', password: '123456', site: 'shein' }) });
  const dashboard = await api('/pages/dashboard', {}, siteLogin.cookie);
  if (dashboard.data.trend.length !== 30) throw new Error('dashboard trend must contain 30 days');
  console.log('integration test passed');
} finally {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await stopped;
  }
  await removeWithRetry(dbPath);
  await removeWithRetry(`${dbPath}-journal`);
}
