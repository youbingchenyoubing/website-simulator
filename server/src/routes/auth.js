import { Router } from 'express';
import { prisma } from '../db.js';
import { createSession, destroySession, getSession, COOKIES } from '../sessions.js';
import { ok, err, wrap } from '../util.js';

export const authRouter = Router();

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' };

/** 模拟登录：密码只用于即时校验，绝不落日志/落库（合规 §2-4） */
authRouter.post('/auth/login', wrap(async (req, res) => {
  const { username, password, site } = req.body || {};
  if (!username || !site) return res.json(err('username 与 site 必填'));

  const scenario = await prisma.scenario.findFirst({
    where: { site, status: 'active' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!scenario) return res.json(err(`站点 ${site} 暂无 active 场景，请先在管理后台创建/启用`));

  const account = await prisma.mockAccount.findFirst({
    where: { scenarioId: scenario.id, username },
  });

  let role = 'seller';
  if (account) {
    if (account.password !== password) return res.json(err('账号或密码错误'));
    role = account.role;
  } else if (!scenario.demoLogin) {
    // demoLogin 关闭时必须命中预设账号体系
    return res.json(err('账号或密码错误'));
  }

  const sid = createSession('site', { username, scenarioId: scenario.id, site, role });
  res.cookie(COOKIES.site, sid, COOKIE_OPTS);
  res.json(ok({ user: { username, scenarioId: scenario.id, site, role } }));
}));

authRouter.post('/auth/logout', (req, res) => {
  destroySession('site', req.cookies?.[COOKIES.site]);
  res.clearCookie(COOKIES.site);
  res.json(ok(null));
});

authRouter.get('/auth/me', (req, res) => {
  const user = getSession('site', req.cookies?.[COOKIES.site]);
  res.json(user ? ok({ user }) : err('未登录'));
});

/** 站点接口鉴权中间件 */
export function requireSiteSession(req, res, next) {
  const user = getSession('site', req.cookies?.[COOKIES.site]);
  if (!user) return res.status(401).json(err('未登录'));
  req.siteUser = user;
  next();
}
