/**
 * 幂等种子脚本：node prisma/seed.js
 * - 管理员账号（环境变量 ADMIN_USERNAME/ADMIN_PASSWORD 覆盖）
 * - 默认拦截规则（SHEIN / Amazon，local 模式）
 * - 一个 SHEIN demo 场景：店铺指标 + 商品 + 订单 + 模拟账号
 */
import '../src/env.js';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();
const uid = () => crypto.randomUUID();
const hash = (p) => crypto.createHash('sha256').update('wsim-static-salt' + p).digest('hex');

async function main() {
  // 1. 管理员
  const adminName = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  await prisma.adminUser.upsert({
    where: { username: adminName },
    update: {},
    create: { id: uid(), username: adminName, passwordHash: hash(adminPass) },
  });

  // 2. 拦截规则
  const rules = [
    { host: 'sso.geiwohuo.com', site: 'shein', mode: 'local' },
    { host: 'sellercentral.amazon.com', site: 'amazon', mode: 'local' },
  ];
  for (const r of rules) {
    await prisma.interceptRule.upsert({
      where: { host: r.host },
      update: {},
      create: { id: uid(), ...r, enabled: true },
    });
  }

  // 3. SHEIN 演示场景（按固定名字幂等）
  let scenario = await prisma.scenario.findFirst({ where: { name: 'SHEIN 演示场景' } });
  if (!scenario) {
    scenario = await prisma.scenario.create({
      data: { id: uid(), name: 'SHEIN 演示场景', site: 'shein', status: 'active', demoLogin: true },
    });

    await prisma.shop.create({
      data: {
        id: uid(), scenarioId: scenario.id, name: 'Demo Fashion Store',
        metrics: JSON.stringify({ todaySales: 12860.5, todayOrders: 86, totalSales: 856320, balance: 32450.75, currency: 'USD' }),
      },
    });

    const products = [
      ['夏季碎花连衣裙', 'DRS-2026-001', 19.99, 320, 1240],
      ['女士针织开衫', 'KNI-2026-014', 25.5, 150, 867],
      ['高腰直筒牛仔裤', 'JEA-2026-032', 32.0, 8, 452],
      ['纯色宽松 T 恤', 'TSH-2026-108', 9.99, 980, 3120],
      ['法式复古衬衫', 'BLU-2026-066', 22.8, 210, 655],
    ];
    const productIds = [];
    for (const [title, sku, price, stock, sales] of products) {
      const p = await prisma.product.create({
        data: { id: uid(), scenarioId: scenario.id, title, sku, price, stock, sales, status: 'on' },
      });
      productIds.push(p);
    }

    const statuses = ['pending', 'shipped', 'completed', 'cancelled', 'refund'];
    const weights = [3, 3, 3, 1, 1];
    const pool = statuses.flatMap((s, i) => Array(weights[i]).fill(s));
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      const p = productIds[Math.floor(Math.random() * productIds.length)];
      const qty = 1 + Math.floor(Math.random() * 3);
      await prisma.order.create({
        data: {
          id: uid(), scenarioId: scenario.id,
          orderNo: `WS${(now % 100000000)}${String(i).padStart(3, '0')}`,
          productId: p.id, productTitle: p.title, quantity: qty,
          amount: Math.round(p.price * qty * 100) / 100,
          buyer: `buyer${1000 + i}`,
          status: pool[Math.floor(Math.random() * pool.length)],
          createdAt: new Date(now - Math.floor(Math.random() * 30 * 24 * 3600 * 1000)),
        },
      });
    }

    await prisma.mockAccount.create({
      data: { id: uid(), scenarioId: scenario.id, username: 'seller01', password: '123456', role: 'seller' },
    });
  }

  console.log('seed done.');
}

main().finally(() => prisma.$disconnect());
