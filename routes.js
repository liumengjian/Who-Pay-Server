const crypto = require("crypto");
const { Op } = require("sequelize");
const {
  User,
  AuthToken,
  Activity,
  Team,
  TeamMember,
  ActivityParticipant,
  Payment,
} = require("./db");
const auth = require("./middleware/auth");

function fail(ctx, message) {
  ctx.body = { success: false, message };
}

function formatUser(u) {
  if (!u) return null;
  const plain = u.get ? u.get({ plain: true }) : u;
  return {
    id: plain.id,
    nickName: plain.nickName || "",
    realName: plain.realName || "",
    avatarUrl: plain.avatar || "",
  };
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

const INVITE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomInviteCode() {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return s;
}

async function uniqueInviteCode() {
  for (let j = 0; j < 30; j++) {
    const code = randomInviteCode();
    const exists = await Activity.findOne({ where: { inviteCode: code } });
    if (!exists) return code;
  }
  throw new Error("生成邀请码失败，请重试");
}

async function sumPaymentsByUser(activityId) {
  const list = await Payment.findAll({ where: { activityId } });
  const map = {};
  for (const p of list) {
    const uid = String(p.userId);
    map[uid] = (map[uid] || 0) + parseFloat(p.amount);
  }
  return map;
}

async function sumActivityTotal(activityId) {
  const list = await Payment.findAll({ where: { activityId } });
  let t = 0;
  for (const p of list) t += parseFloat(p.amount);
  return t;
}

async function userInTeamForActivity(userId, activityId) {
  const teams = await Team.findAll({ where: { activityId } });
  for (const t of teams) {
    const m = await TeamMember.findOne({
      where: { teamId: t.id, userId: String(userId) },
    });
    if (m) return true;
  }
  return false;
}

async function userTeamIdForActivity(userId, activityId) {
  const teams = await Team.findAll({ where: { activityId } });
  for (const t of teams) {
    const m = await TeamMember.findOne({
      where: { teamId: t.id, userId: String(userId) },
    });
    if (m) return t.id;
  }
  return null;
}

async function assertParticipant(activityId, userId) {
  const p = await ActivityParticipant.findOne({
    where: { activityId, userId: String(userId) },
  });
  return !!p;
}

async function buildActivityDetail(activityId) {
  const activity = await Activity.findByPk(activityId);
  if (!activity) return null;
  const payByUser = await sumPaymentsByUser(activityId);
  let totalAmount = 0;
  Object.values(payByUser).forEach((v) => {
    totalAmount += v;
  });

  const teams = await Team.findAll({ where: { activityId } });
  const teamRows = [];
  for (const team of teams) {
    const tMembers = await TeamMember.findAll({ where: { teamId: team.id } });
    const members = [];
    for (const tm of tMembers) {
      const uid = String(tm.userId);
      let nickName = uid;
      if (uid === "admin") {
        nickName = "管理员";
      } else {
        const u = await User.findByPk(uid);
        if (u) nickName = u.nickName || String(uid);
      }
      members.push({
        userId: uid,
        nickName,
        totalAmount: payByUser[uid] || 0,
      });
    }
    const teamTotal = members.reduce(
      (s, m) => s + (parseFloat(m.totalAmount) || 0),
      0
    );
    teamRows.push({
      _id: String(team.id),
      id: String(team.id),
      name: team.name,
      teamName: team.name,
      totalAmount: teamTotal,
      members,
    });
  }

  const a = activity.get({ plain: true });
  return {
    activityInfo: {
      id: String(a.id),
      name: a.name,
      inviteCode: a.inviteCode,
      creatorId: String(a.creatorId),
      status: a.status,
      endTime: a.endTime,
    },
    teams: teamRows,
    totalAmount,
  };
}

async function listActivitiesForUser(userId, status) {
  const parts = await ActivityParticipant.findAll({
    where: { userId: String(userId) },
  });
  const ids = parts.map((p) => p.activityId);
  if (ids.length === 0) return [];
  const activities = await Activity.findAll({
    where: { id: { [Op.in]: ids }, status },
    order: [["id", "DESC"]],
  });
  const out = [];
  for (const act of activities) {
    const teamCountRaw = await Team.count({ where: { activityId: act.id } });
    const teamCount = Math.max(teamCountRaw, 1);
    const totalAmount = await sumActivityTotal(act.id);
    const shareAmount = totalAmount / teamCount;
    const pl = act.get({ plain: true });
    out.push({
      _id: String(pl.id),
      name: pl.name,
      inviteCode: pl.inviteCode,
      totalAmount: Number(totalAmount.toFixed(2)),
      shareAmount: Number(shareAmount.toFixed(2)),
    });
  }
  return out;
}

function registerApiRoutes(router) {
  router.post("/api/login", async (ctx) => {
    ctx.body = {
      success: false,
      message: "请使用账号密码登录（/api/auth/login）",
    };
  });

  router.post("/api/auth/login", async (ctx) => {
    const { username, password } = ctx.request.body || {};
    if (!username || !password) {
      fail(ctx, "请输入账号和密码");
      return;
    }
    const user = await User.findOne({
      where: { username: String(username).trim() },
    });
    if (!user || user.password !== String(password)) {
      fail(ctx, "账号或密码错误");
      return;
    }
    const token = newToken();
    await AuthToken.create({ token, userId: user.id });
    ctx.body = {
      tokenValue: token,
      loginId: user.id,
      userInfo: formatUser(user),
    };
  });

  router.post("/api/auth/register", async (ctx) => {
    const body = ctx.request.body || {};
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const nickName = String(body.nickName || "").trim();
    const realName = String(body.realName || "").trim();
    const avatar = body.avatar != null ? String(body.avatar) : "";

    if (!username || !password) {
      fail(ctx, "请输入账号和密码");
      return;
    }
    if (!nickName || !realName) {
      fail(ctx, "请填写昵称和真名");
      return;
    }
    const exists = await User.findOne({ where: { username } });
    if (exists) {
      fail(ctx, "该账号已注册");
      return;
    }
    const user = await User.create({
      username,
      password,
      nickName,
      realName,
      avatar: avatar || null,
    });
    const token = newToken();
    await AuthToken.create({ token, userId: user.id });
    ctx.body = {
      tokenValue: token,
      loginId: user.id,
      userInfo: formatUser(user),
    };
  });

  router.get("/api/user/:userId", auth, async (ctx) => {
    const { userId } = ctx.params;
    if (userId === "admin") {
      ctx.body = {
        userInfo: {
          id: "admin",
          nickName: "管理员",
          realName: "",
          avatarUrl: "/images/default-avatar.png",
        },
      };
      return;
    }
    const u = await User.findByPk(userId);
    if (!u) {
      fail(ctx, "用户不存在");
      return;
    }
    ctx.body = { userInfo: formatUser(u) };
  });

  router.put("/api/user/update", auth, async (ctx) => {
    const body = ctx.request.body || {};
    const sid = String(body.id);
    if (ctx.state.userId === "admin") {
      if (sid === "admin") {
        ctx.body = {};
        return;
      }
      fail(ctx, "无权修改");
      return;
    }
    if (sid !== ctx.state.userId) {
      fail(ctx, "无权修改该用户");
      return;
    }
    const user = await User.findByPk(sid);
    if (!user) {
      fail(ctx, "用户不存在");
      return;
    }
    const patch = {};
    if (body.nickName !== undefined) patch.nickName = String(body.nickName).trim();
    if (body.realName !== undefined) patch.realName = String(body.realName).trim();
    if (body.avatar !== undefined)
      patch.avatar = body.avatar ? String(body.avatar) : null;
    await user.update(patch);
    ctx.body = {};
  });

  router.post("/api/activity/create", auth, async (ctx) => {
    const { name } = ctx.request.body || {};
    const n = String(name || "").trim();
    if (!n) {
      fail(ctx, "请输入活动名称");
      return;
    }
    const userId = ctx.state.userId;
    const code = await uniqueInviteCode();
    const act = await Activity.create({
      name: n,
      inviteCode: code,
      creatorId: userId,
      status: "active",
    });
    const existingPart = await ActivityParticipant.findOne({
      where: { activityId: act.id, userId },
    });
    if (!existingPart) {
      await ActivityParticipant.create({ activityId: act.id, userId });
    }
    ctx.body = { activityId: String(act.id) };
  });

  router.post("/api/activity/join", auth, async (ctx) => {
    const { inviteCode } = ctx.request.body || {};
    const code = String(inviteCode || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    if (code.length !== 6) {
      fail(ctx, "请输入6位邀请码");
      return;
    }
    const act = await Activity.findOne({ where: { inviteCode: code } });
    if (!act) {
      fail(ctx, "邀请码无效");
      return;
    }
    if (act.status !== "active") {
      fail(ctx, "活动已结束");
      return;
    }
    const userId = ctx.state.userId;
    const already = await ActivityParticipant.findOne({
      where: { activityId: act.id, userId },
    });
    if (!already) {
      await ActivityParticipant.create({ activityId: act.id, userId });
    }
    ctx.body = { activityId: String(act.id) };
  });

  router.get("/api/activity/list", auth, async (ctx) => {
    const status = String(ctx.query.status || "active");
    if (status !== "active" && status !== "ended") {
      fail(ctx, "无效的状态参数");
      return;
    }
    const activities = await listActivitiesForUser(ctx.state.userId, status);
    ctx.body = { activities };
  });

  router.get("/api/activity/:activityId", auth, async (ctx) => {
    const activityId = parseInt(ctx.params.activityId, 10);
    if (Number.isNaN(activityId)) {
      fail(ctx, "活动不存在");
      return;
    }
    if (!(await assertParticipant(activityId, ctx.state.userId))) {
      fail(ctx, "无权查看该活动");
      return;
    }
    const detail = await buildActivityDetail(activityId);
    if (!detail) {
      fail(ctx, "活动不存在");
      return;
    }
    ctx.body = detail;
  });

  router.post("/api/activity/:activityId/end", auth, async (ctx) => {
    const activityId = parseInt(ctx.params.activityId, 10);
    if (Number.isNaN(activityId)) {
      fail(ctx, "活动不存在");
      return;
    }
    const act = await Activity.findByPk(activityId);
    if (!act) {
      fail(ctx, "活动不存在");
      return;
    }
    if (String(act.creatorId) !== String(ctx.state.userId)) {
      fail(ctx, "只有创建人可以结束活动");
      return;
    }
    if (act.status === "ended") {
      ctx.body = {};
      return;
    }
    act.status = "ended";
    act.endTime = new Date();
    await act.save();
    ctx.body = {};
  });

  router.post("/api/team/create", auth, async (ctx) => {
    const { activityId, teamName } = ctx.request.body || {};
    const aid = parseInt(activityId, 10);
    const tname = String(teamName || "").trim();
    if (Number.isNaN(aid) || !tname) {
      fail(ctx, "参数不完整");
      return;
    }
    const userId = ctx.state.userId;
    const act = await Activity.findByPk(aid);
    if (!act || act.status !== "active") {
      fail(ctx, "活动不存在或已结束");
      return;
    }
    if (!(await assertParticipant(aid, userId))) {
      fail(ctx, "无权操作");
      return;
    }
    if (await userTeamIdForActivity(userId, aid)) {
      fail(ctx, "您已在该活动的某个团队中");
      return;
    }
    const team = await Team.create({ activityId: aid, name: tname });
    await TeamMember.create({ teamId: team.id, userId });
    ctx.body = {};
  });

  router.post("/api/team/join", auth, async (ctx) => {
    const { activityId, teamId } = ctx.request.body || {};
    const aid = parseInt(activityId, 10);
    const tid = parseInt(teamId, 10);
    if (Number.isNaN(aid) || Number.isNaN(tid)) {
      fail(ctx, "参数不完整");
      return;
    }
    const userId = ctx.state.userId;
    const act = await Activity.findByPk(aid);
    if (!act || act.status !== "active") {
      fail(ctx, "活动不存在或已结束");
      return;
    }
    if (!(await assertParticipant(aid, userId))) {
      fail(ctx, "无权操作");
      return;
    }
    if (await userTeamIdForActivity(userId, aid)) {
      fail(ctx, "您已在该活动的某个团队中");
      return;
    }
    const team = await Team.findOne({ where: { id: tid, activityId: aid } });
    if (!team) {
      fail(ctx, "团队不存在");
      return;
    }
    await TeamMember.create({ teamId: tid, userId });
    ctx.body = {};
  });

  router.post("/api/payment/add", auth, async (ctx) => {
    const { activityId, amount, remark } = ctx.request.body || {};
    const aid = parseInt(activityId, 10);
    const amt = parseFloat(amount);
    const userId = ctx.state.userId;
    if (Number.isNaN(aid) || Number.isNaN(amt)) {
      fail(ctx, "参数无效");
      return;
    }
    const act = await Activity.findByPk(aid);
    if (!act || act.status !== "active") {
      fail(ctx, "活动不存在或已不允许记账");
      return;
    }
    if (!(await assertParticipant(aid, userId))) {
      fail(ctx, "无权操作");
      return;
    }
    if (!(await userInTeamForActivity(userId, aid))) {
      fail(ctx, "请先加入团队后再记账");
      return;
    }
    await Payment.create({
      activityId: aid,
      userId,
      amount: amt,
      remark: remark != null ? String(remark) : "",
    });
    ctx.body = {};
  });

  router.put("/api/payment/:paymentId", auth, async (ctx) => {
    const id = parseInt(ctx.params.paymentId, 10);
    const { amount, remark } = ctx.request.body || {};
    const amt = parseFloat(amount);
    if (Number.isNaN(id) || Number.isNaN(amt)) {
      fail(ctx, "参数无效");
      return;
    }
    const row = await Payment.findByPk(id);
    if (!row || String(row.userId) !== String(ctx.state.userId)) {
      fail(ctx, "记录不存在或无权修改");
      return;
    }
    const act = await Activity.findByPk(row.activityId);
    if (!act || act.status !== "active") {
      fail(ctx, "活动已结束，无法修改");
      return;
    }
    row.amount = amt;
    row.remark = remark != null ? String(remark) : "";
    await row.save();
    ctx.body = {};
  });

  router.delete("/api/payment/:paymentId", auth, async (ctx) => {
    const id = parseInt(ctx.params.paymentId, 10);
    if (Number.isNaN(id)) {
      fail(ctx, "参数无效");
      return;
    }
    const row = await Payment.findByPk(id);
    if (!row || String(row.userId) !== String(ctx.state.userId)) {
      fail(ctx, "记录不存在或无权删除");
      return;
    }
    const act = await Activity.findByPk(row.activityId);
    if (!act || act.status !== "active") {
      fail(ctx, "活动已结束，无法删除");
      return;
    }
    await row.destroy();
    ctx.body = {};
  });

  router.get("/api/payment/list", auth, async (ctx) => {
    const activityId = parseInt(ctx.query.activityId, 10);
    if (Number.isNaN(activityId)) {
      fail(ctx, "缺少活动ID");
      return;
    }
    if (!(await assertParticipant(activityId, ctx.state.userId))) {
      fail(ctx, "无权查看");
      return;
    }
    const list = await Payment.findAll({
      where: { activityId, userId: String(ctx.state.userId) },
      order: [["createTime", "DESC"]],
    });
    ctx.body = {
      payments: list.map((p) => {
        const pl = p.get({ plain: true });
        return {
          _id: String(pl.id),
          id: String(pl.id),
          amount: parseFloat(pl.amount),
          remark: pl.remark,
          createTime: pl.createTime,
        };
      }),
    };
  });

  router.get("/api/payment/member", auth, async (ctx) => {
    const activityId = parseInt(ctx.query.activityId, 10);
    const memberUserId = String(ctx.query.userId || "");
    if (Number.isNaN(activityId) || !memberUserId) {
      fail(ctx, "参数无效");
      return;
    }
    if (!(await assertParticipant(activityId, ctx.state.userId))) {
      fail(ctx, "无权查看");
      return;
    }
    const list = await Payment.findAll({
      where: { activityId, userId: memberUserId },
      order: [["createTime", "DESC"]],
    });
    ctx.body = {
      payments: list.map((p) => {
        const pl = p.get({ plain: true });
        return {
          _id: String(pl.id),
          id: String(pl.id),
          amount: parseFloat(pl.amount),
          remark: pl.remark,
          createTime: pl.createTime,
        };
      }),
    };
  });
}

module.exports = registerApiRoutes;
