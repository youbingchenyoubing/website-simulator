import './env.js';
import { env } from './env.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from './db.js';
import { ok } from './util.js';
import { authRouter } from './routes/auth.js';
import { pagesRouter } from './routes/pages.js';
import { adminRouter } from './routes/admin.js';
import { mockRouter } from './routes/mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// 错误日志脱敏兜底：永不打印 body（避免密码进入日志）
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ---------- 公共 API ----------
app.get('/api/health', (_req, res) => res.json(ok({ up: true })));
app.get('/api/meta', (_req, res) => res.json(ok({
  app: 'website-simulator',
  version: env.VERSION,
  watermark: env.WATERMARK,
})));
app.get('/api/intercept-rules', async (_req, res) => {
  const rules = await prisma.interceptRule.findMany({ where: { enabled: true } });
  res.json(ok(rules.map((r) => ({ host: r.host, site: r.site, mode: r.mode }))));
});

// ---------- 业务路由 ----------
app.use('/api', authRouter);
app.use('/api', pagesRouter);
app.use('/api', adminRouter);
app.use('/', mockRouter);

// ---------- 静态托管：管理后台 /admin，模拟站点 / ----------
const adminDist = path.join(__dirname, '..', '..', 'apps', 'admin', 'dist');
const siteDist = path.join(__dirname, '..', '..', 'apps', 'site', 'dist');

function serveSpa(mount, distDir) {
  if (!fs.existsSync(distDir)) return;
  app.use(mount, express.static(distDir));
  // SPA 回退
  app.use(mount, (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}
serveSpa('/admin', adminDist);
serveSpa('/', siteDist);

// 统一错误处理（脱敏）
app.use((e, _req, res, _next) => {
  console.error('[error]', e.message);
  res.status(500).json({ ok: false, message: 'internal error' });
});

// 合规启动检查：默认仅回环
if (env.HOST !== '127.0.0.1' && env.HOST !== 'localhost') {
  console.warn(`\n⚠️⚠️⚠️  合规警告：服务将绑定到 ${env.HOST}，请确认这是经过评审的内网演示环境！\n`);
}
app.listen(env.PORT, env.HOST, () => {
  console.log(`website-simulator server @ http://${env.HOST}:${env.PORT}`);
  console.log(`水印文案：${env.WATERMARK}`);
});
