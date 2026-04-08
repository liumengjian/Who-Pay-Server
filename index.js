const Koa = require("koa");
const Router = require("koa-router");
const logger = require("koa-logger");
const bodyParser = require("koa-bodyparser");
const fs = require("fs");
const path = require("path");
const { init: initDB, Counter } = require("./db");
const registerApiRoutes = require("./routes");

const router = new Router();

const homePage = fs.readFileSync(path.join(__dirname, "index.html"), "utf-8");

router.get("/", async (ctx) => {
  ctx.body = homePage;
});

router.get("/api/count", async (ctx) => {
  const result = await Counter.count();
  ctx.body = { code: 0, data: result };
});

router.post("/api/count", async (ctx) => {
  const { action } = ctx.request.body || {};
  if (action === "inc") {
    await Counter.create();
  } else if (action === "clear") {
    await Counter.destroy({ truncate: true });
  }
  ctx.body = { code: 0, data: await Counter.count() };
});

router.get("/api/wx_openid", async (ctx) => {
  if (ctx.request.headers["x-wx-source"]) {
    ctx.body = ctx.request.headers["x-wx-openid"];
  }
});

registerApiRoutes(router);

const app = new Koa();
app
  .use(logger())
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods());

/* 容器平台常见默认探针端口为 8080；须监听 0.0.0.0 以便集群内探测 */
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || "0.0.0.0";
async function bootstrap() {
  await initDB();
  app.listen(port, host, () => {
    console.log("启动成功", host, port);
  });
}
bootstrap();
