/**
 * @wsim/shared
 * 客户端 / 模拟站点 / 管理后台 / 服务端 共享的类型与 API 契约。
 */

// ---------- 基础枚举 ----------
export type SiteKey = 'shein' | 'amazon';

export type ScenarioStatus = 'draft' | 'active' | 'archived';

export type OrderStatus =
  | 'pending'        // 待发货
  | 'shipped'        // 已发货
  | 'completed'      // 已完成
  | 'cancelled'      // 已取消
  | 'refund';        // 退款/售后

// ---------- 数据模型（与 server/prisma/schema.prisma 对应） ----------
export interface Scenario {
  id: string;
  name: string;
  site: SiteKey;
  status: ScenarioStatus;
  /** 演示模式：任意账号密码均可登录 */
  demoLogin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Shop {
  id: string;
  scenarioId: string;
  name: string;
  avatar?: string | null;
  /** 关键指标，如 { todaySales, todayOrders, totalSales, balance, currency } */
  metrics: Record<string, number | string>;
}

export interface Product {
  id: string;
  scenarioId: string;
  title: string;
  sku: string;
  image?: string | null;
  price: number;
  stock: number;
  sales: number;
  status: 'on' | 'off';
  createdAt: string;
}

export interface Order {
  id: string;
  scenarioId: string;
  orderNo: string;
  productId?: string | null;
  productTitle: string;
  quantity: number;
  amount: number;
  buyer: string;
  status: OrderStatus;
  createdAt: string;
}

export interface MockAccount {
  id: string;
  scenarioId: string;
  username: string;
  /** 仅服务端存储与校验；任何接口不回传 */
  password?: string;
  role: 'seller' | 'admin';
}

/** 客户端拦截模式：
 * - local:   整域重写 → 本地重绘站点（方案 A）
 * - rewrite: 官方前端直开，仅把数据 API 重写至 /mock/*（方案 D）
 */
export type InterceptMode = 'local' | 'rewrite';

export interface InterceptRule {
  id: string;
  host: string;
  site: SiteKey;
  mode: InterceptMode;
  enabled: boolean;
}

// ---------- API 契约 ----------

/** POST /api/auth/login */
export interface LoginRequest {
  username: string;
  password: string;
  site: SiteKey;
}
export interface LoginResponse {
  ok: boolean;
  message?: string;
  user?: { username: string; scenarioId: string; site: SiteKey };
}

/** GET /api/auth/me */
export interface MeResponse {
  ok: boolean;
  user?: { username: string; scenarioId: string; site: SiteKey; role: string };
}

/** GET /api/pages/dashboard?scenarioId= */
export interface DashboardData {
  shop: Shop;
  metrics: {
    todaySales: number;
    todayOrders: number;
    totalSales: number;
    pendingOrders: number;
    currency: string;
  };
  /** 近 30 天趋势 */
  trend: { date: string; sales: number; orders: number }[];
  todo: { label: string; count: number }[];
}

/** GET /api/pages/products?scenarioId=&page=&pageSize=&q= */
export interface Paged<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 管理端登录 POST /api/admin/login */
export interface AdminLoginRequest {
  username: string;
  password: string;
}

/** 批量生成订单 POST /api/admin/orders/batch-generate */
export interface BatchGenerateOrdersRequest {
  scenarioId: string;
  count: number;
  statusWeights?: Partial<Record<OrderStatus, number>>;
  dateRangeDays?: number; // 订单创建时间分布在过去 N 天
}

// ---------- 通用响应 ----------
export interface ApiOk<T> { ok: true; data: T }
export interface ApiErr { ok: false; message: string }
export type ApiResp<T> = ApiOk<T> | ApiErr;

// ---------- 站点页面 key（F-206：页面数据全部来自接口） ----------
export const PAGE_KEYS = ['login', 'dashboard', 'products', 'orders'] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

/** 模拟服务基础信息 GET /api/meta */
export interface MetaResponse {
  app: 'website-simulator';
  version: string;
  watermark: string; // 全局水印文案，服务端下发，客户端强制渲染
}
