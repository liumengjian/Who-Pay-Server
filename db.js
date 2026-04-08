const { Sequelize, DataTypes } = require("sequelize");

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
  } catch (e) {
    console.error("[db] ensureSchema activities:", e.message);
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
};
