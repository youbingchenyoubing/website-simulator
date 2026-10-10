import { Router } from 'express';
import { prisma } from '../db.js';

/**
 * 方案 D：官方接口适配层入口 /mock/<siteKey>/*
 * 客户端（Electron）把官方站点的数据 API 重定向到这里。
 * 每个 siteKey 对应 src/mockAdapters/<siteKey>/index.js，导出一个异步函数：
 *   resolve(req) => { status?, body } | null（null = 无适配，透传策略由客户端决定）
 * 指纹表（路径 → 官方响应 schema）需针对真实平台抓包后填充。
 */
export const mockRouter = Router();

const adapters = new Map();
async function loadAdapter(site) {
  if (!adapters.has(site)) {
    try {
      const mod = await import(`../mockAdapters/${site}/index.js`);
      adapters.set(site, mod.default || null);
    } catch {
      adapters.set(site, null);
    }
  }
  return adapters.get(site);
}

mockRouter.use('/mock/:site', async (req, res, next) => {
  // CORS：回显官方 Origin，允许携带 cookie（官方前端 fetch 多数带 credentials）
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
    return res.sendStatus(204);
  }
  next();
});

mockRouter.all('/mock/:site/*', async (req, res) => {
  const { site } = req.params;
  const adapter = await loadAdapter(site);
  if (!adapter) {
    return res.status(501).json({ ok: false, message: `站点 ${site} 尚未配置接口适配器（缺少 mockAdapters/${site}）` });
  }
  try {
    // 官方路径 = 通配符部分原样回传，方便 adapter 做路径匹配
    const result = await adapter({
      method: req.method,
      path: '/' + req.params[0],
      query: req.query,
      body: req.body,
      headers: req.headers,
      prisma,
    });
    if (!result) {
      return res.status(501).json({ ok: false, message: `接口未适配: ${req.method} /${req.params[0]}` });
    }
    res.status(result.status || 200).json(result.body);
  } catch (e) {
    res.status(500).json({ ok: false, message: 'adapter error: ' + e.message });
  }
});
