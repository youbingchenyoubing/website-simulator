import { Router } from 'express';
import { prisma } from '../db.js';
import { ok, err, parseMetrics, intParam, wrap } from '../util.js';
import { requireSiteSession } from './auth.js';

export const pagesRouter = Router();
// Router 挂载在 /api 下；必须限定为 /pages，避免抢先拦截 /auth、/admin 等路由。
pagesRouter.use('/pages', requireSiteSession);

/** 场景有效性校验：会话中的场景必须仍存在 */
async function resolveScenario(req, res) {
  const scenarioId = req.query.scenarioId || req.siteUser.scenarioId;
  const scenario = await prisma.scenario.findUnique({ where: { id: String(scenarioId) } });
  if (!scenario) {
    res.json(err('场景不存在或已删除'));
    return null;
  }
  return scenario;
}

/** 看板：shop.metrics 存「人工配置的展示指标」，趋势/待办由订单表实时聚合 */
pagesRouter.get('/pages/dashboard', wrap(async (req, res) => {
  const scenario = await resolveScenario(req, res);
  if (!scenario) return;

  const shop = await prisma.shop.findFirst({ where: { scenarioId: scenario.id } });
  const metrics = parseMetrics(shop?.metrics);

  // 近 30 天趋势
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);
  const orders = await prisma.order.findMany({
    where: { scenarioId: scenario.id, createdAt: { gte: since } },
    select: { createdAt: true, amount: true, status: true },
  });
  const days = [];
  const byDay = new Map();
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: key, sales: 0, orders: 0 });
    days.push(key);
  }
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const key = o.createdAt.toISOString().slice(0, 10);
    const row = byDay.get(key);
    if (row) {
      row.sales += o.amount;
      row.orders += 1;
    }
  }

  const pendingOrders = await prisma.order.count({ where: { scenarioId: scenario.id, status: 'pending' } });
  const refundOrders = await prisma.order.count({ where: { scenarioId: scenario.id, status: 'refund' } });
  const lowStock = await prisma.product.count({ where: { scenarioId: scenario.id, stock: { lt: 10 }, status: 'on' } });

  res.json(ok({
    shop: shop ? { ...shop, metrics } : null,
    metrics: {
      todaySales: Number(metrics.todaySales ?? 0),
      todayOrders: Number(metrics.todayOrders ?? 0),
      totalSales: Number(metrics.totalSales ?? 0),
      pendingOrders,
      currency: String(metrics.currency ?? 'CNY'),
    },
    trend: days.map((k) => {
      const r = byDay.get(k);
      return { date: r.date, sales: Math.round(r.sales * 100) / 100, orders: r.orders };
    }),
    todo: [
      { label: '待发货订单', count: pendingOrders },
      { label: '退款/售后', count: refundOrders },
      { label: '低库存商品', count: lowStock },
    ],
  }));
}));

pagesRouter.get('/pages/products', wrap(async (req, res) => {
  const scenario = await resolveScenario(req, res);
  if (!scenario) return;
  const page = intParam(req.query.page, 1);
  const pageSize = intParam(req.query.pageSize, 10, 1, 100);
  const q = String(req.query.q || '').trim();

  const where = {
    scenarioId: scenario.id,
    ...(q ? { OR: [{ title: { contains: q } }, { sku: { contains: q } }] } : {}),
  };
  const [total, list] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  res.json(ok({ list, total, page, pageSize }));
}));

pagesRouter.get('/pages/orders', wrap(async (req, res) => {
  const scenario = await resolveScenario(req, res);
  if (!scenario) return;
  const page = intParam(req.query.page, 1);
  const pageSize = intParam(req.query.pageSize, 10, 1, 100);
  const status = String(req.query.status || '').trim();

  const where = { scenarioId: scenario.id, ...(status ? { status } : {}) };
  const [total, list] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  res.json(ok({ list, total, page, pageSize }));
}));
