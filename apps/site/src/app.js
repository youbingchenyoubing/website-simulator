const app = document.querySelector('#app');
const contextKey = 'wsim-site-context';

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.message || '请求失败');
  return body.data;
}

function readContext() {
  try { return JSON.parse(localStorage.getItem(contextKey) || 'null'); } catch { return null; }
}
function writeContext(value) { localStorage.setItem(contextKey, JSON.stringify(value)); }
function go(path) { history.pushState({}, '', path); render(); }
function formatMoney(value, currency = 'USD') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function shell(active, content) {
  const user = readContext();
  return `<div class="layout"><aside class="sidebar"><div class="brand">SELLER<span> DEMO</span></div><p class="brand-note">本地培训演示</p>
    <nav>${[['/dashboard','概览'],['/products','商品管理'],['/orders','订单管理']].map(([url,label]) => `<a class="${active === url ? 'active' : ''}" href="${url}" data-nav>${label}</a>`).join('')}</nav>
    <div class="user-block"><b>${escapeHtml(user?.username || '')}</b><small>演示卖家</small><button id="logout" class="link-button">退出登录</button></div>
  </aside><main class="content">${content}</main></div>`;
}

function loginView(message = '') {
  app.innerHTML = `<main class="login-page"><section class="login-intro"><div><p class="eyebrow">LOCAL TRAINING</p><h1>Seller<br/>Demo</h1><p>安全、可控、可重置的本地卖家中心培训环境。</p></div><small>所有展示数据均为模拟数据</small></section><section class="login-form-wrap"><form id="login-form" class="login-form"><p class="eyebrow">欢迎回来</p><h2>登录演示中心</h2><p class="hint">可使用预设账号 seller01 / 123456；演示模式下也支持任意账号。</p><label>账号<input name="username" autocomplete="username" required placeholder="输入演示账号" /></label><label>密码<input name="password" type="password" autocomplete="current-password" required placeholder="输入密码" /></label><p class="form-error">${escapeHtml(message)}</p><button class="primary" type="submit">登录</button></form></section></main>`;
  document.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password'), site: 'shein' }) });
      writeContext(data.user);
      go('/dashboard');
    } catch (error) { loginView(error.message); }
  });
}

async function dashboardView() {
  const context = readContext();
  const data = await api(`/pages/dashboard?scenarioId=${encodeURIComponent(context.scenarioId)}`);
  const metrics = data.metrics;
  const values = [
    ['今日销售额', formatMoney(metrics.todaySales, metrics.currency), '后台配置'],
    ['今日订单', metrics.todayOrders, '后台配置'],
    ['待发货', metrics.pendingOrders, '实时汇总'],
    ['累计销售额', formatMoney(metrics.totalSales, metrics.currency), '后台配置'],
  ];
  const peak = Math.max(...data.trend.map((row) => row.sales), 1);
  const points = data.trend.map((row, index) => `${(index / Math.max(data.trend.length - 1, 1)) * 100},${100 - (row.sales / peak) * 88}`).join(' ');
  app.innerHTML = shell('/dashboard', `<header><p class="eyebrow">${escapeHtml(data.shop?.name || '演示店铺')}</p><h1>经营概览</h1><p class="muted">数据读取自当前演示场景，刷新后即时获取最新配置。</p></header><section class="metric-grid">${values.map(([label,value,caption]) => `<article class="card metric"><span>${label}</span><strong>${value}</strong><small>${caption}</small></article>`).join('')}</section><section class="grid-two"><article class="card chart-card"><div class="section-title"><div><h2>近 30 天销售趋势</h2><p>订单数据实时聚合</p></div><strong>${formatMoney(peak, metrics.currency)}</strong></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="近30天销售趋势"><polyline points="${points}" /></svg></article><article class="card"><div class="section-title"><div><h2>待办事项</h2><p>按当前场景计算</p></div></div><ul class="todo-list">${data.todo.map((item) => `<li><span>${item.label}</span><b>${item.count}</b></li>`).join('')}</ul></article></section>`);
}

async function productsView() {
  const context = readContext();
  const url = new URL(location.href);
  const q = url.searchParams.get('q') || '';
  const data = await api(`/pages/products?scenarioId=${encodeURIComponent(context.scenarioId)}&pageSize=100&q=${encodeURIComponent(q)}`);
  app.innerHTML = shell('/products', `<header class="page-heading"><div><p class="eyebrow">PRODUCTS</p><h1>商品管理</h1><p class="muted">共 ${data.total} 件商品</p></div><form id="product-search" class="search"><input name="q" value="${escapeHtml(q)}" placeholder="搜索商品名称或 SKU" /><button>搜索</button></form></header><article class="card table-card"><table><thead><tr><th>商品</th><th>SKU</th><th>价格</th><th>库存</th><th>销量</th><th>状态</th></tr></thead><tbody>${data.list.map((p) => `<tr><td><b>${escapeHtml(p.title)}</b></td><td>${escapeHtml(p.sku)}</td><td>${formatMoney(p.price)}</td><td class="${p.stock < 10 ? 'warning' : ''}">${p.stock}</td><td>${p.sales}</td><td><span class="status ${p.status}">${p.status === 'on' ? '销售中' : '已下架'}</span></td></tr>`).join('') || '<tr><td colspan="6" class="empty">没有匹配的商品</td></tr>'}</tbody></table></article>`);
  document.querySelector('#product-search').addEventListener('submit', (event) => { event.preventDefault(); const query = new FormData(event.currentTarget).get('q'); go(`/products?q=${encodeURIComponent(query)}`); });
}

async function ordersView() {
  const context = readContext();
  const url = new URL(location.href);
  const status = url.searchParams.get('status') || '';
  const data = await api(`/pages/orders?scenarioId=${encodeURIComponent(context.scenarioId)}&pageSize=100&status=${encodeURIComponent(status)}`);
  const labels = { pending: '待发货', shipped: '已发货', completed: '已完成', cancelled: '已取消', refund: '退款/售后' };
  app.innerHTML = shell('/orders', `<header class="page-heading"><div><p class="eyebrow">ORDERS</p><h1>订单管理</h1><p class="muted">共 ${data.total} 笔订单</p></div><select id="status-filter">${[['','全部状态'], ...Object.entries(labels)].map(([value,label]) => `<option value="${value}" ${value === status ? 'selected' : ''}>${label}</option>`).join('')}</select></header><article class="card table-card"><table><thead><tr><th>订单号</th><th>商品</th><th>买家</th><th>数量</th><th>金额</th><th>状态</th><th>下单时间</th></tr></thead><tbody>${data.list.map((o) => `<tr><td><b>${escapeHtml(o.orderNo)}</b></td><td>${escapeHtml(o.productTitle)}</td><td>${escapeHtml(o.buyer)}</td><td>${o.quantity}</td><td>${formatMoney(o.amount)}</td><td><span class="status ${o.status}">${labels[o.status] || o.status}</span></td><td>${new Date(o.createdAt).toLocaleString('zh-CN', { hour12: false })}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">没有匹配的订单</td></tr>'}</tbody></table></article>`);
  document.querySelector('#status-filter').addEventListener('change', (event) => go(`/orders?status=${encodeURIComponent(event.target.value)}`));
}

async function render() {
  const pathname = location.pathname === '/' ? '/login' : location.pathname;
  const context = readContext();
  try {
    const meta = await api('/meta');
    document.querySelector('#watermark').textContent = meta.watermark;
    if (pathname === '/login') return loginView();
    const me = await api('/auth/me');
    writeContext(me.user);
    if (pathname === '/dashboard') return dashboardView();
    if (pathname === '/products') return productsView();
    if (pathname === '/orders') return ordersView();
    go('/dashboard');
  } catch (error) {
    if (pathname !== '/login' && /未登录/.test(error.message)) { localStorage.removeItem(contextKey); return go('/login'); }
    app.innerHTML = `<main class="error-page"><h1>暂时无法加载</h1><p>${escapeHtml(error.message)}</p><button class="primary" onclick="location.reload()">重新加载</button></main>`;
  }
}

document.addEventListener('click', async (event) => {
  const link = event.target.closest('[data-nav]');
  if (link) { event.preventDefault(); go(link.getAttribute('href')); }
  if (event.target.id === 'logout') { await api('/auth/logout', { method: 'POST' }); localStorage.removeItem(contextKey); go('/login'); }
});
window.addEventListener('popstate', render);
render();
