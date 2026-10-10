/**
 * SHEIN 官方接口适配器（方案 D 骨架）。
 *
 * ⚠️ 这是「指纹表」的落地位置：每一条 case 对应逆向得到的一个官方接口，
 * 把内部 Scenario/Product/Order 数据翻译成官方响应 schema 返回。
 * 当前为 POC 占位实现；真实路径与字段需抓包后补充。
 */
export default async function resolve({ method, path, prisma }) {
  // 示例占位：官方登录接口被拦截时，返回"登录成功"的同构响应。
  // TODO(POC): 抓包确认 SHEIN 卖家中心真实登录路径与响应格式后替换。
  if (method === 'POST' && /login|signin|sso/i.test(path)) {
    const scenario = await prisma.scenario.findFirst({ where: { site: 'shein', status: 'active' } });
    if (!scenario) return { status: 200, body: { code: 40001, msg: 'no active scenario' } };
    return {
      status: 200,
      body: {
        code: 0,
        msg: 'success',
        data: { token: 'wsim-demo-token', scenarioId: scenario.id },
      },
    };
  }

  // 未适配的接口：返回 null → 上层 501，客户端可据此透传真实请求或显示维护页
  return null;
}
