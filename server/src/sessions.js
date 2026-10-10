import crypto from 'node:crypto';

// 内存会话：重启即清空（符合演示环境定位）。两个池子：站点用户 / 管理后台。
const pools = {
  site: new Map(), // sid -> { username, scenarioId, site, role }
  admin: new Map(), // sid -> { username }
};

export function createSession(kind, payload) {
  const sid = crypto.randomUUID();
  pools[kind].set(sid, payload);
  return sid;
}

export function getSession(kind, sid) {
  return sid ? pools[kind].get(sid) || null : null;
}

export function destroySession(kind, sid) {
  if (sid) pools[kind].delete(sid);
}

export const COOKIES = { site: 'wsim_sid', admin: 'wsim_admin' };
