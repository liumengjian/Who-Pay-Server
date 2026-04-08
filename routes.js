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
    username: plain.username || "",
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

function normalizeInviteCode(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

async function uniqueGlobalInviteCode() {
  for (let j = 0; j < 30; j++) {
    const code = randomInviteCode();
    const [a, t] = await Promise.all([
      Activity.findOne({ where: { inviteCode: code } }),
      Team.findOne({ where: { inviteCode: code } }),
    ]);
    if (!a && !t) return code;
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

async function memberPublicFields(userId) {
  const uid = String(userId);
  if (uid === "admin") {
    return {
      userId: uid,
      nickName: "管理员",
      avatarUrl: "/images/default-avatar.png",
    };
  }
  const u = await User.findByPk(uid);
  if (!u) {
    return { userId: uid, nickName: uid, avatarUrl: "" };
  }
  const f = formatUser(u);
  return { userId: uid, nickName: f.nickName, avatarUrl: f.avatarUrl };
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
      const pub = await memberPublicFields(uid);
      members.push({
        userId: uid,
        nickName: pub.nickName,
        avatarUrl: pub.avatarUrl,
        totalAmount: payByUser[uid] || 0,
      });
    }
    const teamTotal = members.reduce(
      (s, m) => s + (parseFloat(m.totalAmount) || 0),
      0
    );
    const tpl = team.get ? team.get({ plain: true }) : team;
    teamRows.push({
      _id: String(team.id),
      id: String(team.id),
      name: team.name,
      teamName: team.name,
      inviteCode: tpl.inviteCode,
      creatorId: String(tpl.creatorId || ""),
      totalAmount: teamTotal,
      members,
    });
  }

  const a = activity.get({ plain: true });
  return {
    activityInfo: {
      id: String(a.id),
      name: a.name,
      slogan: a.slogan || "",
      avatarUrl: a.avatar || "",
      inviteCode: a.inviteCode,
      creatorId: String(a.creatorId),
      status: a.status,
      endTime: a.endTime,
    },
    teams: teamRows,
    totalAmount,
  };
}

/** 活动大厅：未加入也可查看团队与成员头像昵称（不返回各团队 inviteCode） */
async function buildActivityPreview(activityId) {
  const activity = await Activity.findByPk(activityId);
  if (!activity || activity.status !== "active") return null;
  const teams = await Team.findAll({ where: { activityId } });
  const teamRows = [];
  for (const team of teams) {
    const tMembers = await TeamMember.findAll({ where: { teamId: team.id } });
    const members = [];
    for (const tm of tMembers) {
      const uid = String(tm.userId);
      const pub = await memberPublicFields(uid);
      members.push({
        userId: uid,
        nickName: pub.nickName,
        avatarUrl: pub.avatarUrl,
        totalAmount: 0,
      });
    }
    teamRows.push({
      _id: String(team.id),
      id: String(team.id),
      name: team.name,
      teamName: team.name,
      totalAmount: 0,
      members,
    });
  }
  const a = activity.get({ plain: true });
  return {
    activityInfo: {
      id: String(a.id),
      name: a.name,
      slogan: a.slogan || "",
      avatarUrl: a.avatar || "",
      status: a.status,
      endTime: a.endTime,
    },
    teams: teamRows,
    totalAmount: 0,
  };
}

/** 我的活动列表：非创建者卡片用的团队与成员（无金额） */
async function buildActivityTeamsMembersLite(activityId) {
  const teams = await Team.findAll({ where: { activityId } });
  const teamRows = [];
  for (const team of teams) {
    const tMembers = await TeamMember.findAll({ where: { teamId: team.id } });
    const members = [];
    for (const tm of tMembers) {
      const uid = String(tm.userId);
      const pub = await memberPublicFields(uid);
      members.push({
        userId: uid,
        nickName: pub.nickName,
        avatarUrl: pub.avatarUrl,
      });
    }
    teamRows.push({
      id: String(team.id),
      name: team.name,
      members,
    });
  }
  return teamRows;
}

async function listActivitiesForUser(userId, status) {
  const uidStr = String(userId);
  const parts = await ActivityParticipant.findAll({
    where: { userId: uidStr },
  });
  const ids = parts.map((p) => p.activityId);
  if (ids.length === 0) return [];
  const activities = await Activity.findAll({
    where: { id: { [Op.in]: ids }, status },
    order: [["id", "DESC"]],
  });
  const out = [];
  for (const act of activities) {
    const pl = act.get({ plain: true });
    const isCreator = String(pl.creatorId || "") === uidStr;
    const base = {
      _id: String(pl.id),
      name: pl.name,
      slogan: pl.slogan || "",
      avatarUrl: pl.avatar || "",
      isCreator,
      endTime: pl.endTime,
    };
    if (isCreator) {
      const teamCountRaw = await Team.count({ where: { activityId: act.id } });
      const teamCount = Math.max(teamCountRaw, 1);
      const totalAmount = await sumActivityTotal(act.id);
      const shareAmount = totalAmount / teamCount;
      out.push({
        ...base,
        inviteCode: pl.inviteCode,
        totalAmount: Number(totalAmount.toFixed(2)),
        shareAmount: Number(shareAmount.toFixed(2)),
      });
    } else {
      const teams = await buildActivityTeamsMembersLite(act.id);
      out.push({
        ...base,
        teams,
      });
    }
  }
  return out;
}

async function verifyUsernameMatches(ctx, username) {
  if (ctx.state.userId === "admin") return true;
  const u = await User.findByPk(ctx.state.userId);
  if (!u) return false;
  return String(u.username) === String(username || "").trim();
}

function registerApiRoutes(router) {
  router.post("/api/login", async (ctx) => {
    ctx.body = {
      success: false,
      message: "请使用账号密码登录（/api/auth/login）",
    };
  });

  router.post("/api/auth/login", async (ctx) => {
    const body = ctx.request.body || {};
    const username = String(body.username || body.account || "").trim();
    const password = String(body.password || "");
    if (!username || !password) {
      fail(ctx, "请输入账号和密码");
      return;
    }
    const user = await User.findOne({
      where: { username },
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
    const username = String(body.username || body.account || "").trim();
    const password = String(body.password || "");
    const nickName = String(body.nickName || "").trim();
    const avatar = body.avatar != null ? String(body.avatar) : "";

    if (!username || !password) {
      fail(ctx, "请输入账号和密码");
      return;
    }
    if (!nickName) {
      fail(ctx, "请输入用户名");
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
      realName: "",
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
          username: "admin",
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

  /** 19 活动大厅 */
  router.get("/api/activity/hall", auth, async (ctx) => {
    const rows = await Activity.findAll({
      where: { status: "active" },
      order: [["id", "DESC"]],
    });
    const uid = String(ctx.state.userId || "");
    const activities = [];
    for (const act of rows) {
      const teamCount = await Team.count({ where: { activityId: act.id } });
      const pl = act.get({ plain: true });
      const isCreator = String(pl.creatorId || "") === uid;
      activities.push({
        _id: String(pl.id),
        id: String(pl.id),
        name: pl.name,
        status: pl.status,
        teamCount,
        ...(isCreator && pl.inviteCode
          ? { isCreator: true, inviteCode: pl.inviteCode }
          : {}),
      });
    }
    ctx.body = { activities };
  });

  /** 活动预览（团队与成员，不含敏感邀请码） */
  router.get("/api/activity/:activityId/preview", auth, async (ctx) => {
    const activityId = parseInt(ctx.params.activityId, 10);
    if (Number.isNaN(activityId)) {
      fail(ctx, "活动不存在");
      return;
    }
    const preview = await buildActivityPreview(activityId);
    if (!preview) {
      fail(ctx, "活动不存在或已结束");
      return;
    }
    ctx.body = preview;
  });

  /** 8 查询活动下的团队（已参与者，含团队邀请码） */
  router.get("/api/activity/:activityId/teams", auth, async (ctx) => {
    const activityId = parseInt(ctx.params.activityId, 10);
    if (Number.isNaN(activityId)) {
      fail(ctx, "活动不存在");
      return;
    }
    if (!(await assertParticipant(activityId, ctx.state.userId))) {
      fail(ctx, "无权查看");
      return;
    }
    const teams = await Team.findAll({ where: { activityId } });
    const out = [];
    for (const t of teams) {
      const cnt = await TeamMember.count({ where: { teamId: t.id } });
      out.push({
        id: String(t.id),
        name: t.name,
        inviteCode: t.inviteCode,
        memberCount: cnt,
      });
    }
    ctx.body = { teams: out };
  });

  /** 11 某活动某团队下的成员 */
  router.get("/api/team/:teamId/members", auth, async (ctx) => {
    const teamId = parseInt(ctx.params.teamId, 10);
    const activityId = parseInt(ctx.query.activityId, 10);
    if (Number.isNaN(teamId) || Number.isNaN(activityId)) {
      fail(ctx, "参数无效");
      return;
    }
    if (!(await assertParticipant(activityId, ctx.state.userId))) {
      fail(ctx, "无权查看");
      return;
    }
    const team = await Team.findOne({ where: { id: teamId, activityId } });
    if (!team) {
      fail(ctx, "团队不存在");
      return;
    }
    const tMembers = await TeamMember.findAll({ where: { teamId } });
    const members = [];
    for (const tm of tMembers) {
      const pub = await memberPublicFields(tm.userId);
      members.push(pub);
    }
    ctx.body = { members };
  });

  router.post("/api/activity/create", auth, async (ctx) => {
    const body = ctx.request.body || {};
    const n = String(body.name || "").trim();
    if (!n) {
      fail(ctx, "请输入活动名称");
      return;
    }
    const slogan = String(body.slogan || "").trim().slice(0, 512);
    let avatar =
      body.avatar != null && String(body.avatar).trim() !== ""
        ? String(body.avatar).trim()
        : "";
    const userId = String(ctx.state.userId);
    if (!avatar && userId !== "admin") {
      const u = await User.findByPk(userId);
      if (u && u.avatar) avatar = String(u.avatar);
    }
    const avatarVal = avatar || null;
    try {
      const code = await uniqueGlobalInviteCode();
      const act = await Activity.create({
        name: n,
        slogan,
        avatar: avatarVal,
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
      ctx.body = { activityId: String(act.id), inviteCode: act.inviteCode };
    } catch (err) {
      console.error("activity/create", err);
      const msg =
        (err && err.errors && err.errors[0] && err.errors[0].message) ||
        (err && err.message) ||
        "创建活动失败";
      fail(ctx, String(msg));
    }
  });

  router.post("/api/activity/join", auth, async (ctx) => {
    const { inviteCode } = ctx.request.body || {};
    const code = normalizeInviteCode(inviteCode);
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
    const userId = String(ctx.state.userId);
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

  /** 17 退出活动 */
  router.post("/api/activity/:activityId/leave", auth, async (ctx) => {
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
    if (String(act.creatorId) === String(ctx.state.userId)) {
      fail(ctx, "创建者不能退出活动，请先结束活动");
      return;
    }
    const userId = String(ctx.state.userId);
    const teamIds = (await Team.findAll({ where: { activityId } })).map((t) => t.id);
    if (teamIds.length) {
      await TeamMember.destroy({
        where: { userId, teamId: { [Op.in]: teamIds } },
      });
    }
    await ActivityParticipant.destroy({ where: { activityId, userId } });
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
    const userId = String(ctx.state.userId);
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
    const code = await uniqueGlobalInviteCode();
    const team = await Team.create({
      activityId: aid,
      name: tname,
      inviteCode: code,
      creatorId: userId,
    });
    await TeamMember.create({ teamId: team.id, userId });
    ctx.body = { teamId: String(team.id), inviteCode: team.inviteCode };
  });

  /** 10 加入团队：团队唯一邀请码 */
  router.post("/api/team/join", auth, async (ctx) => {
    const { activityId, inviteCode } = ctx.request.body || {};
    const aid = parseInt(activityId, 10);
    const code = normalizeInviteCode(inviteCode);
    if (Number.isNaN(aid) || code.length !== 6) {
      fail(ctx, "请提供活动ID和6位团队邀请码");
      return;
    }
    const userId = String(ctx.state.userId);
    const act = await Activity.findByPk(aid);
    if (!act || act.status !== "active") {
      fail(ctx, "活动不存在或已结束");
      return;
    }
    if (!(await assertParticipant(aid, userId))) {
      fail(ctx, "请先加入该活动");
      return;
    }
    if (await userTeamIdForActivity(userId, aid)) {
      fail(ctx, "您已在该活动的某个团队中");
      return;
    }
    const team = await Team.findOne({ where: { activityId: aid, inviteCode: code } });
    if (!team) {
      fail(ctx, "团队邀请码无效");
      return;
    }
    await TeamMember.create({ teamId: team.id, userId });
    ctx.body = { teamId: String(team.id) };
  });

  /** 15 解散团队 */
  router.post("/api/team/:teamId/dissolve", auth, async (ctx) => {
    const teamId = parseInt(ctx.params.teamId, 10);
    if (Number.isNaN(teamId)) {
      fail(ctx, "团队不存在");
      return;
    }
    const team = await Team.findByPk(teamId);
    if (!team) {
      fail(ctx, "团队不存在");
      return;
    }
    if (String(team.creatorId) !== String(ctx.state.userId)) {
      fail(ctx, "只有创建者可解散团队");
      return;
    }
    await TeamMember.destroy({ where: { teamId } });
    await team.destroy();
    ctx.body = {};
  });

  /** 18 退出团队 */
  router.post("/api/team/:teamId/leave", auth, async (ctx) => {
    const teamId = parseInt(ctx.params.teamId, 10);
    if (Number.isNaN(teamId)) {
      fail(ctx, "团队不存在");
      return;
    }
    const team = await Team.findByPk(teamId);
    if (!team) {
      fail(ctx, "团队不存在");
      return;
    }
    if (String(team.creatorId) === String(ctx.state.userId)) {
      fail(ctx, "创建者请使用「解散团队」");
      return;
    }
    const userId = String(ctx.state.userId);
    await TeamMember.destroy({ where: { teamId, userId } });
    ctx.body = {};
  });

  /** 12 支付金额：账号、活动、团队、金额 */
  router.post("/api/payment/add", auth, async (ctx) => {
    const { username, activityId, teamId, amount, remark } = ctx.request.body || {};
    const aid = parseInt(activityId, 10);
    const tid = parseInt(teamId, 10);
    const amt = parseFloat(amount);
    const userId = String(ctx.state.userId);
    if (Number.isNaN(aid) || Number.isNaN(tid) || Number.isNaN(amt)) {
      fail(ctx, "参数无效");
      return;
    }
    if (!(await verifyUsernameMatches(ctx, username))) {
      fail(ctx, "账号与当前登录用户不一致");
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
    const team = await Team.findOne({ where: { id: tid, activityId: aid } });
    if (!team) {
      fail(ctx, "团队不存在");
      return;
    }
    const member = await TeamMember.findOne({ where: { teamId: tid, userId } });
    if (!member) {
      fail(ctx, "您不在该团队中，无法记账");
      return;
    }
    await Payment.create({
      activityId: aid,
      teamId: tid,
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
          teamId: String(pl.teamId),
          amount: parseFloat(pl.amount),
          remark: pl.remark,
          createTime: pl.createTime,
        };
      }),
    };
  });

  /** 14 历史支付流水（可筛选活动） */
  router.get("/api/payment/history", auth, async (ctx) => {
    if (ctx.state.userId === "admin") {
      ctx.body = { payments: [] };
      return;
    }
    const activityIdRaw = ctx.query.activityId;
    const aid =
      activityIdRaw != null && activityIdRaw !== ""
        ? parseInt(activityIdRaw, 10)
        : null;
    const limit = Math.min(parseInt(ctx.query.limit, 10) || 100, 500);
    const where = { userId: String(ctx.state.userId) };
    if (aid != null && !Number.isNaN(aid)) where.activityId = aid;
    const list = await Payment.findAll({
      where,
      order: [["createTime", "DESC"]],
      limit,
    });
    const actIds = [...new Set(list.map((p) => p.activityId))];
    const nameMap = {};
    if (actIds.length > 0) {
      const activities = await Activity.findAll({
        where: { id: { [Op.in]: actIds } },
      });
      for (const a of activities) nameMap[a.id] = a.name;
    }
    ctx.body = {
      payments: list.map((p) => {
        const pl = p.get({ plain: true });
        return {
          _id: String(pl.id),
          id: String(pl.id),
          activityId: String(pl.activityId),
          activityName: nameMap[pl.activityId] || "",
          teamId: String(pl.teamId),
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
          teamId: String(pl.teamId),
          amount: parseFloat(pl.amount),
          remark: pl.remark,
          createTime: pl.createTime,
        };
      }),
    };
  });
}

module.exports = registerApiRoutes;
