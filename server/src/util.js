import crypto from 'node:crypto';

export const ok = (data) => ({ ok: true, data });
export const err = (message) => ({ ok: false, message: String(message) });
export const uid = () => crypto.randomUUID();

export function hashPassword(plain) {
  const salt = 'wsim-static-salt'; // 演示环境：静态盐即可，不用于真实凭证保护
  return crypto.createHash('sha256').update(salt + plain).digest('hex');
}

export function parseMetrics(json) {
  try {
    return JSON.parse(json || '{}');
  } catch {
    return {};
  }
}

export function intParam(v, def, min = 1, max = 500) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

/** Express 异步路由包装 */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
