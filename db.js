const { Sequelize, DataTypes, QueryTypes } = require("sequelize");

const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;
const [host, port = "3306"] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port: Number(port) || 3306,
  dialect: "mysql",
  logging: false,
});

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    password: { type: DataTypes.STRING(255), allowNull: false },
    nickName: { type: DataTypes.STRING(128), allowNull: false, defaultValue: "" },
    realName: { type: DataTypes.STRING(128), allowNull: false, defaultValue: "" },
    avatar: { type: DataTypes.TEXT("long"), allowNull: true },
  },
  { tableName: "users" }
);

const AuthToken = sequelize.define(
  "AuthToken",
  {
    token: { type: DataTypes.STRING(128), primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "auth_tokens", timestamps: true, updatedAt: false }
);

const Activity = sequelize.define(
  "Activity",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(128), allowNull: false },
    slogan: { type: DataTypes.STRING(512), allowNull: false, defaultValue: "" },
    avatar: { type: DataTypes.TEXT("long"), allowNull: true },
    inviteCode: { type: DataTypes.STRING(16), allowNull: false, unique: true },
    creatorId: { type: DataTypes.STRING(32), allowNull: false },
    status: {
      type: DataTypes.ENUM("active", "ended"),
      allowNull: false,
      defaultValue: "active",
    },
    endTime: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "activities" }
);

const Team = sequelize.define(
  "Team",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    activityId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(128), allowNull: false },
    inviteCode: { type: DataTypes.STRING(16), allowNull: false, unique: true },
    creatorId: { type: DataTypes.STRING(32), allowNull: false },
  },
  { tableName: "teams" }
);

const TeamMember = sequelize.define(
  "TeamMember",
  {
    teamId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    userId: { type: DataTypes.STRING(32), allowNull: false, primaryKey: true },
  },
  { tableName: "team_members" }
);

const ActivityParticipant = sequelize.define(
  "ActivityParticipant",
  {
    activityId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    userId: { type: DataTypes.STRING(32), allowNull: false, primaryKey: true },
  },
  { tableName: "activity_participants" }
);

const Payment = sequelize.define(
  "Payment",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    activityId: { type: DataTypes.INTEGER, allowNull: false },
    teamId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.STRING(32), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    remark: { type: DataTypes.STRING(512), allowNull: false, defaultValue: "" },
    createTime: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: "payments", updatedAt: false, createdAt: false }
);

/** 申请记录（活动/团队） */
const Application = sequelize.define(
  "Application",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    activityId: { type: DataTypes.INTEGER, allowNull: false },
    targetType: { type: DataTypes.ENUM("activity", "team"), allowNull: false },
    targetId: { type: DataTypes.INTEGER, allowNull: true },
    applicantId: { type: DataTypes.STRING(32), allowNull: false },
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected", "cancelled"),
      allowNull: false,
      defaultValue: "pending",
    },
    createTime: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: "applications", updatedAt: false, createdAt: false }
);

/** 云托管演示首页计数器 */
const Counter = sequelize.define(
  "Counter",
  {
    count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
  },
  { tableName: "counters" }
);

const INVITE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomInviteCode6() {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return s;
}

async function pickUnusedGlobalInviteCode() {
  for (let j = 0; j < 50; j++) {
    const code = randomInviteCode6();
    const rowsA = await sequelize.query(
      "SELECT `id` FROM `activities` WHERE `inviteCode` = :code LIMIT 1",
      { replacements: { code }, type: QueryTypes.SELECT }
    );
    const rowsT = await sequelize.query(
      "SELECT `id` FROM `teams` WHERE `inviteCode` = :code LIMIT 1",
      { replacements: { code }, type: QueryTypes.SELECT }
    );
    if (!rowsA.length && !rowsT.length) return code;
  }
  throw new Error("无法生成唯一邀请码");
}

/**
 * 与旧库或手工建表对齐：缺列则 ALTER，避免 Sequelize 查询报 Unknown column。
 */
async function ensureSchema() {
  const qi = sequelize.getQueryInterface();
  try {
    let actCols = await qi.describeTable("activities");
    if (!actCols.slogan) {
      try {
        await qi.addColumn("activities", "slogan", {
          type: DataTypes.STRING(512),
          allowNull: false,
          defaultValue: "",
        });
        console.log("[db] 已补充列 activities.slogan");
      } catch (addErr) {
        const code = addErr && addErr.original && addErr.original.code;
        if (code !== "ER_DUP_FIELDNAME") throw addErr;
      }
    }
    actCols = await qi.describeTable("activities");
    if (!actCols.avatar) {
      try {
        await qi.addColumn("activities", "avatar", {
          type: DataTypes.TEXT("long"),
          allowNull: true,
        });
        console.log("[db] 已补充列 activities.avatar");
      } catch (addErr) {
        const code = addErr && addErr.original && addErr.original.code;
        if (code !== "ER_DUP_FIELDNAME") throw addErr;
      }
    }
    actCols = await qi.describeTable("activities");
    if (!actCols.inviteCode) {
      try {
        await qi.addColumn("activities", "inviteCode", {
          type: DataTypes.STRING(16),
          allowNull: true,
        });
        console.log("[db] 已补充列 activities.inviteCode");
      } catch (addErr) {
        const code = addErr && addErr.original && addErr.original.code;
        if (code !== "ER_DUP_FIELDNAME") throw addErr;
      }
    }
    actCols = await qi.describeTable("activities");
    if (!actCols.creatorId) {
      try {
        await qi.addColumn("activities", "creatorId", {
          type: DataTypes.STRING(32),
          allowNull: true,
        });
        console.log("[db] 已补充列 activities.creatorId");
      } catch (addErr) {
        const code = addErr && addErr.original && addErr.original.code;
        if (code !== "ER_DUP_FIELDNAME") throw addErr;
      }
    }
    await sequelize.query(`
      UPDATE \`activities\`
      SET \`creatorId\` = 'legacy'
      WHERE \`creatorId\` IS NULL OR TRIM(\`creatorId\`) = ''
    `);
    const needCodes = await sequelize.query(
      `SELECT \`id\` FROM \`activities\` WHERE \`inviteCode\` IS NULL OR TRIM(\`inviteCode\`) = ''`,
      { type: QueryTypes.SELECT }
    );
    for (const row of needCodes) {
      const code = await pickUnusedGlobalInviteCode();
      await sequelize.query(
        `UPDATE \`activities\` SET \`inviteCode\` = :code WHERE \`id\` = :id`,
        { replacements: { code, id: row.id } }
      );
    }
    try {
      await qi.changeColumn("activities", "inviteCode", {
        type: DataTypes.STRING(16),
        allowNull: false,
      });
    } catch (chErr) {
      const c = chErr && chErr.original && chErr.original.code;
      if (c !== "ER_INVALID_USE_OF_NULL" && c !== "ER_BAD_NULL_ERROR") throw chErr;
    }
    try {
      await qi.changeColumn("activities", "creatorId", {
        type: DataTypes.STRING(32),
        allowNull: false,
      });
    } catch (chErr) {
      const c = chErr && chErr.original && chErr.original.code;
      if (c !== "ER_INVALID_USE_OF_NULL" && c !== "ER_BAD_NULL_ERROR") throw chErr;
    }
    try {
      await qi.addIndex("activities", ["inviteCode"], {
        unique: true,
        name: "activities_invite_code_unique",
      });
      console.log("[db] 已添加 activities 邀请码唯一索引");
    } catch (ixErr) {
      const c = ixErr && ixErr.original && ixErr.original.code;
      if (c !== "ER_DUP_KEYNAME" && c !== "ER_TABLE_EXISTS_ERROR") {
        /* 1061 Duplicate key name */
        const msg = String(ixErr.message || "");
        if (!msg.includes("Duplicate key name") && !msg.includes("already exists")) throw ixErr;
      }
    }
  } catch (e) {
    console.error("[db] ensureSchema activities:", e.message);
  }

  try {
    let teamCols = await qi.describeTable("teams");
    if (!teamCols.inviteCode) {
      try {
        await qi.addColumn("teams", "inviteCode", {
          type: DataTypes.STRING(16),
          allowNull: true,
        });
        console.log("[db] 已补充列 teams.inviteCode");
      } catch (addErr) {
        const code = addErr && addErr.original && addErr.original.code;
        if (code !== "ER_DUP_FIELDNAME") throw addErr;
      }
    }
    teamCols = await qi.describeTable("teams");
    if (!teamCols.creatorId) {
      try {
        await qi.addColumn("teams", "creatorId", {
          type: DataTypes.STRING(32),
          allowNull: true,
        });
        console.log("[db] 已补充列 teams.creatorId");
      } catch (addErr) {
        const code = addErr && addErr.original && addErr.original.code;
        if (code !== "ER_DUP_FIELDNAME") throw addErr;
      }
    }
    await sequelize.query(`
      UPDATE \`teams\` t
      INNER JOIN (
        SELECT \`teamId\`, MIN(\`userId\`) AS \`firstUser\`
        FROM \`team_members\`
        GROUP BY \`teamId\`
      ) m ON m.\`teamId\` = t.\`id\`
      SET t.\`creatorId\` = m.\`firstUser\`
      WHERE t.\`creatorId\` IS NULL OR TRIM(t.\`creatorId\`) = ''
    `);
    await sequelize.query(`
      UPDATE \`teams\` SET \`creatorId\` = '0' WHERE \`creatorId\` IS NULL OR TRIM(\`creatorId\`) = ''
    `);
    const needTeamCodes = await sequelize.query(
      `SELECT \`id\` FROM \`teams\` WHERE \`inviteCode\` IS NULL OR TRIM(\`inviteCode\`) = ''`,
      { type: QueryTypes.SELECT }
    );
    for (const row of needTeamCodes) {
      const code = await pickUnusedGlobalInviteCode();
      await sequelize.query(
        `UPDATE \`teams\` SET \`inviteCode\` = :code WHERE \`id\` = :id`,
        { replacements: { code, id: row.id } }
      );
    }
    try {
      await qi.changeColumn("teams", "inviteCode", {
        type: DataTypes.STRING(16),
        allowNull: false,
      });
    } catch (chErr) {
      const c = chErr && chErr.original && chErr.original.code;
      if (c !== "ER_INVALID_USE_OF_NULL" && c !== "ER_BAD_NULL_ERROR") throw chErr;
    }
    try {
      await qi.changeColumn("teams", "creatorId", {
        type: DataTypes.STRING(32),
        allowNull: false,
      });
    } catch (chErr) {
      const c = chErr && chErr.original && chErr.original.code;
      if (c !== "ER_INVALID_USE_OF_NULL" && c !== "ER_BAD_NULL_ERROR") throw chErr;
    }
    try {
      await qi.addIndex("teams", ["inviteCode"], {
        unique: true,
        name: "teams_invite_code_unique",
      });
      console.log("[db] 已添加 teams 邀请码唯一索引");
    } catch (ixErr) {
      const c = ixErr && ixErr.original && ixErr.original.code;
      if (c !== "ER_DUP_KEYNAME" && c !== "ER_TABLE_EXISTS_ERROR") {
        const msg = String(ixErr.message || "");
        if (!msg.includes("Duplicate key name") && !msg.includes("already exists")) throw ixErr;
      }
    }
  } catch (e) {
    console.error("[db] ensureSchema teams:", e.message);
  }

  try {
    let payCols = await qi.describeTable("payments");
    if (!payCols.teamId) {
      try {
        await qi.addColumn("payments", "teamId", {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        });
        console.log("[db] 已补充列 payments.teamId");
      } catch (addErr) {
        const code = addErr && addErr.original && addErr.original.code;
        if (code !== "ER_DUP_FIELDNAME") throw addErr;
      }
      payCols = await qi.describeTable("payments");
    }
    if (!payCols.createTime) {
      try {
        await qi.addColumn("payments", "createTime", {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        });
        console.log("[db] 已补充列 payments.createTime");
      } catch (addErr) {
        const code = addErr && addErr.original && addErr.original.code;
        if (code !== "ER_DUP_FIELDNAME") throw addErr;
      }
      payCols = await qi.describeTable("payments");
    }
    if (!payCols.remark) {
      try {
        await qi.addColumn("payments", "remark", {
          type: DataTypes.STRING(512),
          allowNull: false,
          defaultValue: "",
        });
        console.log("[db] 已补充列 payments.remark");
      } catch (addErr) {
        const code = addErr && addErr.original && addErr.original.code;
        if (code !== "ER_DUP_FIELDNAME") throw addErr;
      }
    }
  } catch (e) {
    if (e && e.original && e.original.code === "ER_NO_SUCH_TABLE") {
      /* 未建库时忽略 */
    } else {
      console.error("[db] ensureSchema payments:", e.message);
    }
  }

  // applications 表：不存在则创建，存在则补列
  try {
    let appCols = {};
    try {
      appCols = await qi.describeTable("applications");
    } catch (descErr) {
      // 表不存在时走建表；其他错误继续尝试建表兜底
      console.warn("[db] describeTable applications 失败，尝试建表:", descErr && descErr.message);
    }

    // describeTable 返回空对象 {} 表示表不存在或无列，同样走建表逻辑
    const tableExists = appCols && Object.keys(appCols).length > 0;

    if (!tableExists) {
      try {
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS \`applications\` (
            \`id\` INT AUTO_INCREMENT PRIMARY KEY,
            \`activityId\` INT NOT NULL,
            \`targetType\` ENUM('activity','team') NOT NULL DEFAULT 'activity',
            \`targetId\` INT NULL,
            \`applicantId\` VARCHAR(32) NOT NULL,
            \`status\` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
            \`createTime\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX \`idx_activity\` (\`activityId\`),
            INDEX \`idx_applicant\` (\`applicantId\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("[db] 已建表 applications");
        appCols = await qi.describeTable("applications");
      } catch (createErr) {
        const c = createErr && createErr.original && createErr.original.code;
        if (c === "ER_TABLE_EXISTS_ERROR") {
          // 表存在但列不全，重新读取
          appCols = await qi.describeTable("applications");
        } else {
          console.error("[db] 建表 applications 失败:", createErr && createErr.message);
          appCols = {};
        }
      }
    }

    // 逐列补充（每步独立 try/catch，任一失败不阻断后续列）
    const addIfMissing = async (col, opts) => {
      if (appCols[col]) return;
      try {
        await qi.addColumn("applications", col, opts);
        console.log(`[db] 已补充列 applications.${col}`);
        appCols[col] = true; // 标记已补
      } catch (addErr) {
        const code = addErr && addErr.original && addErr.original.code;
        if (code !== "ER_DUP_FIELDNAME") {
          console.warn(`[db] 补充列 applications.${col} 失败:`, addErr && addErr.message);
        }
      }
    };

    await addIfMissing("activityId", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    await addIfMissing("targetType", { type: DataTypes.ENUM("activity", "team"), allowNull: false, defaultValue: "activity" });
    await addIfMissing("targetId", { type: DataTypes.INTEGER, allowNull: true });
    await addIfMissing("applicantId", { type: DataTypes.STRING(32), allowNull: false });
    await addIfMissing("status", { type: DataTypes.ENUM("pending", "approved", "rejected"), allowNull: false, defaultValue: "pending" });
    await addIfMissing("createTime", { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW });
  } catch (e) {
    console.error("[db] ensureSchema applications:", e && e.message);
  }

  try {
    const [pwdRows] = await sequelize.query(`
      SELECT CHARACTER_MAXIMUM_LENGTH AS len
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'password'
      LIMIT 1
    `);
    const len = pwdRows[0] && pwdRows[0].len != null ? Number(pwdRows[0].len) : null;
    if (len != null && len > 0 && len < 255) {
      await sequelize.query(
        "ALTER TABLE \`users\` MODIFY COLUMN \`password\` VARCHAR(255) NOT NULL"
      );
      console.log("[db] 已扩展 users.password 为 VARCHAR(255)");
    }
  } catch (e) {
    console.error("[db] ensureSchema users.password:", e.message);
  }
}

/**
 * 校验连接并在启动时补全已知缺失列（仍建议用 sql/init.sql 管理完整结构）。
 */
async function init() {
  await sequelize.authenticate();
  await ensureSchema();
}

module.exports = {
  sequelize,
  init,
  Counter,
  User,
  AuthToken,
  Activity,
  Team,
  TeamMember,
  ActivityParticipant,
  Payment,
  Application,
};
