import { Router } from 'express';
import { prisma } from '../db.js';
import { createSession, destroySession, getSession, COOKIES } from '../sessions.js';
import { ok, err, uid, hashPassword, wrap, intParam } from '../util.js';
import { env } from '../env.js';

export const adminRouter = Router();
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' };

// ---------- 管理端认证 ----------
adminRouter.post('/admin/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const user = await prisma.adminUser.findUnique({ where: { username: String(username || '') } });
  if (!user || user.passwordHash !== hashPassword(String(password || ''))) {
    return res.json(err('账号或密码错误'));
  }
  const sid = createSession('admin', { username: user.username });
  res.cookie(COOKIES.admin, sid, COOKIE_OPTS);
  res.json(ok({ user: { username: user.username } }));
}));

adminRouter.post('/admin/logout', (req, res) => {
  destroySession('admin', req.cookies?.[COOKIES.admin]);
  res.clearCookie(COOKIES.admin);
  res.json(ok(null));
});

adminRouter.get('/admin/me', (req, res) => {
  const u = getSession('admin', req.cookies?.[COOKIES.admin]);
  res.json(u ? ok({ user: u }) : err('未登录'));
});

// 以下全部需要管理端会话
adminRouter.use('/admin', (req, res, next) => {
  const u = getSession('admin', req.cookies?.[COOKIES.admin]);
  if (!u) return res.status(401).json(err('未登录'));
  req.adminUser = u;
  next();
});

// ---------- 场景 ----------
adminRouter.get('/admin/scenarios', wrap(async (_req, res) => {
  const list = await prisma.scenario.findMany({ orderBy: { updatedAt: 'desc' } });
  const withCounts = await Promise.all(list.map(async (s) => ({
    ...s,
    counts: {
      products: await prisma.product.count({ where: { scenarioId: s.id } }),
      orders: await prisma.order.count({ where: { scenarioId: s.id } }),
      accounts: await prisma.mockAccount.count({ where: { scenarioId: s.id } }),
    },
  })));
  res.json(ok(withCounts));
}));

adminRouter.post('/admin/scenarios', wrap(async (req, res) => {
  const { name, site, status = 'draft', demoLogin = true } = req.body || {};
  if (!name || !site) return res.json(err('name 与 site 必填'));
  const s = await prisma.scenario.create({ data: { id: uid(), name, site, status, demoLogin: !!demoLogin } });
  // 顺手建空店铺
  await prisma.shop.create({ data: { id: uid(), scenarioId: s.id, name: `${name}的店铺`, metrics: '{}' } });
  res.json(ok(s));
}));

adminRouter.patch('/admin/scenarios/:id', wrap(async (req, res) => {
  const { name, status, demoLogin } = req.body || {};
  const s = await prisma.scenario.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(demoLogin !== undefined ? { demoLogin: !!demoLogin } : {}),
    },
  });
  res.json(ok(s));
}));

adminRouter.delete('/admin/scenarios/:id', wrap(async (req, res) => {
  await prisma.scenario.delete({ where: { id: req.params.id } });
  res.json(ok(null));
}));

/** 一键复制场景（深拷贝店铺/商品/订单/账号） */
adminRouter.post('/admin/scenarios/:id/duplicate', wrap(async (req, res) => {
  const src = await prisma.scenario.findUnique({ where: { id: req.params.id } });
  if (!src) return res.json(err('场景不存在'));
  const copy = await prisma.scenario.create({
    data: { id: uid(), name: `${src.name}（副本）`, site: src.site, status: 'draft', demoLogin: src.demoLogin },
  });
  const [shops, products, orders, accounts] = await Promise.all([
    prisma.shop.findMany({ where: { scenarioId: src.id } }),
    prisma.product.findMany({ where: { scenarioId: src.id } }),
    prisma.order.findMany({ where: { scenarioId: src.id } }),
    prisma.mockAccount.findMany({ where: { scenarioId: src.id } }),
  ]);
  const pidMap = new Map(products.map((p) => [p.id, uid()]));
  await prisma.$transaction([
    ...shops.map((s) => prisma.shop.create({ data: { id: uid(), scenarioId: copy.id, name: s.name, avatar: s.avatar, metrics: s.metrics } })),
    ...products.map((p) => prisma.product.create({
      data: { id: pidMap.get(p.id), scenarioId: copy.id, title: p.title, sku: p.sku, image: p.image, price: p.price, stock: p.stock, sales: p.sales, status: p.status, createdAt: p.createdAt },
    })),
    ...orders.map((o) => prisma.order.create({
      data: { id: uid(), scenarioId: copy.id, orderNo: o.orderNo, productId: o.productId ? pidMap.get(o.productId) ?? null : null, productTitle: o.productTitle, quantity: o.quantity, amount: o.amount, buyer: o.buyer, status: o.status, createdAt: o.createdAt },
    })),
    ...accounts.map((a) => prisma.mockAccount.create({ data: { id: uid(), scenarioId: copy.id, username: a.username, password: a.password, role: a.role } })),
  ]);
  res.json(ok(copy));
}));

adminRouter.get('/admin/scenarios/:id/overview', wrap(async (req, res) => {
  const s = await prisma.scenario.findUnique({ where: { id: req.params.id } });
  if (!s) return res.json(err('场景不存在'));
  const shop = await prisma.shop.findFirst({ where: { scenarioId: s.id } });
  res.json(ok({
    scenario: s,
    shop: shop ? { ...shop, metrics: JSON.parse(shop.metrics || '{}') } : null,
    counts: {
      products: await prisma.product.count({ where: { scenarioId: s.id } }),
      orders: await prisma.order.count({ where: { scenarioId: s.id } }),
      accounts: await prisma.mockAccount.count({ where: { scenarioId: s.id } }),
    },
  }));
}));

// ---------- 店铺 ----------
adminRouter.put('/admin/scenarios/:id/shop', wrap(async (req, res) => {
  const { name, avatar, metrics } = req.body || {};
  const existing = await prisma.shop.findFirst({ where: { scenarioId: req.params.id } });
  const data = { name: String(name ?? ''), avatar: avatar ?? null, metrics: JSON.stringify(metrics ?? {}) };
  const shop = existing
    ? await prisma.shop.update({ where: { id: existing.id }, data })
    : await prisma.shop.create({ data: { id: uid(), scenarioId: req.params.id, ...data } });
  res.json(ok({ ...shop, metrics: JSON.parse(shop.metrics) }));
}));

// ---------- 商品 ----------
adminRouter.get('/admin/scenarios/:id/products', wrap(async (req, res) => {
  const page = intParam(req.query.page, 1);
  const pageSize = intParam(req.query.pageSize, 20, 1, 200);
  const q = String(req.query.q || '').trim();
  const where = {
    scenarioId: req.params.id,
    ...(q ? { OR: [{ title: { contains: q } }, { sku: { contains: q } }] } : {}),
  };
  const [total, list] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  res.json(ok({ list, total, page, pageSize }));
}));

const productData = (b, scenarioId) => ({
  ...(scenarioId ? { scenarioId } : {}),
  title: String(b.title ?? ''),
  sku: String(b.sku ?? ''),
  image: b.image ?? null,
  price: Number(b.price ?? 0),
  stock: Number(b.stock ?? 0),
  sales: Number(b.sales ?? 0),
  status: b.status === 'off' ? 'off' : 'on',
});

adminRouter.post('/admin/scenarios/:id/products', wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.json(err('title 必填'));
  const p = await prisma.product.create({ data: { id: uid(), ...productData(b, req.params.id) } });
  res.json(ok(p));
}));

adminRouter.patch('/admin/scenarios/:id/products/:pid', wrap(async (req, res) => {
  const p = await prisma.product.update({ where: { id: req.params.pid }, data: productData(req.body || {}) });
  res.json(ok(p));
}));

adminRouter.delete('/admin/scenarios/:id/products/:pid', wrap(async (req, res) => {
  await prisma.product.delete({ where: { id: req.params.pid } });
  res.json(ok(null));
}));

// ---------- 订单 ----------
adminRouter.get('/admin/scenarios/:id/orders', wrap(async (req, res) => {
  const page = intParam(req.query.page, 1);
  const pageSize = intParam(req.query.pageSize, 20, 1, 200);
  const status = String(req.query.status || '').trim();
  const where = { scenarioId: req.params.id, ...(status ? { status } : {}) };
  const [total, list] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  res.json(ok({ list, total, page, pageSize }));
}));

const orderData = (b, scenarioId) => ({
  ...(scenarioId ? { scenarioId } : {}),
  orderNo: String(b.orderNo ?? ''),
  productId: b.productId ?? null,
  productTitle: String(b.productTitle ?? ''),
  quantity: Number(b.quantity ?? 1),
  amount: Number(b.amount ?? 0),
  buyer: String(b.buyer ?? ''),
  status: String(b.status ?? 'pending'),
});

adminRouter.post('/admin/scenarios/:id/orders', wrap(async (req, res) => {
  const b = req.body || {};
  const o = await prisma.order.create({ data: { id: uid(), ...orderData(b, req.params.id) } });
  res.json(ok(o));
}));

adminRouter.patch('/admin/scenarios/:id/orders/:oid', wrap(async (req, res) => {
  const o = await prisma.order.update({ where: { id: req.params.oid }, data: orderData(req.body || {}) });
  res.json(ok(o));
}));

adminRouter.delete('/admin/scenarios/:id/orders/:oid', wrap(async (req, res) => {
  await prisma.order.delete({ where: { id: req.params.oid } });
  res.json(ok(null));
}));

/** 批量生成订单：按状态权重随机，时间分布在近 N 天 */
adminRouter.post('/admin/orders/batch-generate', wrap(async (req, res) => {
  const { scenarioId, count = 10, statusWeights, dateRangeDays = 30 } = req.body || {};
  const scenario = await prisma.scenario.findUnique({ where: { id: String(scenarioId || '') } });
  if (!scenario) return res.json(err('场景不存在'));
  const products = await prisma.product.findMany({ where: { scenarioId: scenario.id } });
  if (products.length === 0) return res.json(err('该场景还没有商品，请先创建商品'));

  const weights = { pending: 3, shipped: 3, completed: 3, cancelled: 1, refund: 1, ...(statusWeights || {}) };
  const pool = Object.entries(weights).flatMap(([s, w]) => Array(Math.max(0, Number(w) || 0)).fill(s));
  if (pool.length === 0) return res.json(err('状态权重无效'));

  const buyers = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Lucas', 'Mia', 'Ethan', 'Sofia', 'James', 'Chen**', 'Wang**', 'Li**'];
  const now = Date.now();
  const spanMs = Math.max(1, Number(dateRangeDays)) * 24 * 3600 * 1000;

  const rows = Array.from({ length: Math.min(500, Math.max(1, Number(count))) }, (_, i) => {
    const p = products[Math.floor(Math.random() * products.length)];
    const qty = 1 + Math.floor(Math.random() * 3);
    return {
      id: uid(),
      scenarioId: scenario.id,
      orderNo: `WS${now % 100000000}${String(i).padStart(3, '0')}`,
      productId: p.id,
      productTitle: p.title,
      quantity: qty,
      amount: Math.round(p.price * qty * 100) / 100,
      buyer: buyers[Math.floor(Math.random() * buyers.length)],
      status: pool[Math.floor(Math.random() * pool.length)],
      createdAt: new Date(now - Math.floor(Math.random() * spanMs)),
    };
  });
  await prisma.order.createMany({ data: rows });
  res.json(ok({ created: rows.length }));
}));

// ---------- 模拟账号（回传绝不带 password） ----------
const safeAccount = (a) => ({ id: a.id, scenarioId: a.scenarioId, username: a.username, role: a.role });

adminRouter.get('/admin/scenarios/:id/accounts', wrap(async (req, res) => {
  const list = await prisma.mockAccount.findMany({ where: { scenarioId: req.params.id }, orderBy: { username: 'asc' } });
  res.json(ok(list.map(safeAccount)));
}));

adminRouter.post('/admin/scenarios/:id/accounts', wrap(async (req, res) => {
  const { username, password = '123456', role = 'seller' } = req.body || {};
  if (!username) return res.json(err('username 必填'));
  const a = await prisma.mockAccount.create({ data: { id: uid(), scenarioId: req.params.id, username, password, role } });
  res.json(ok(safeAccount(a)));
}));

adminRouter.patch('/admin/scenarios/:id/accounts/:aid', wrap(async (req, res) => {
  const { username, password, role } = req.body || {};
  const a = await prisma.mockAccount.update({
    where: { id: req.params.aid },
    data: {
      ...(username !== undefined ? { username } : {}),
      ...(password ? { password } : {}), // 空密码表示不修改
      ...(role !== undefined ? { role } : {}),
    },
  });
  res.json(ok(safeAccount(a)));
}));

adminRouter.delete('/admin/scenarios/:id/accounts/:aid', wrap(async (req, res) => {
  await prisma.mockAccount.delete({ where: { id: req.params.aid } });
  res.json(ok(null));
}));

// ---------- 拦截规则 ----------
adminRouter.get('/admin/intercept-rules', wrap(async (_req, res) => {
  res.json(ok(await prisma.interceptRule.findMany({ orderBy: { host: 'asc' } })));
}));

adminRouter.post('/admin/intercept-rules', wrap(async (req, res) => {
  const { host, site, mode = 'local', enabled = true } = req.body || {};
  if (!host || !site) return res.json(err('host 与 site 必填'));
  const r = await prisma.interceptRule.create({ data: { id: uid(), host, site, mode, enabled: !!enabled } });
  res.json(ok(r));
}));

adminRouter.patch('/admin/intercept-rules/:id', wrap(async (req, res) => {
  const { host, site, mode, enabled } = req.body || {};
  const r = await prisma.interceptRule.update({
    where: { id: req.params.id },
    data: {
      ...(host !== undefined ? { host } : {}),
      ...(site !== undefined ? { site } : {}),
      ...(mode !== undefined ? { mode } : {}),
      ...(enabled !== undefined ? { enabled: !!enabled } : {}),
    },
  });
  res.json(ok(r));
}));

adminRouter.delete('/admin/intercept-rules/:id', wrap(async (req, res) => {
  await prisma.interceptRule.delete({ where: { id: req.params.id } });
  res.json(ok(null));
}));
