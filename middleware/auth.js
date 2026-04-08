const { AuthToken } = require("../db");

/**
 * 校验 Authorization: Bearer <token>，写入 ctx.state.userId（字符串）。
 * 小程序本地管理员账号使用 token 字面量 `admin`。
 */
async function auth(ctx, next) {
  const raw = ctx.headers.authorization;
  if (!raw || !String(raw).startsWith("Bearer ")) {
    ctx.body = { success: false, message: "请先登录" };
    return;
  }
  const token = String(raw).slice(7).trim();
  if (token === "admin") {
    ctx.state.userId = "admin";
    await next();
    return;
  }
  const row = await AuthToken.findOne({ where: { token } });
  if (!row) {
    ctx.body = { success: false, message: "登录已失效，请重新登录" };
    return;
  }
  ctx.state.userId = String(row.userId);
  await next();
}

module.exports = auth;
