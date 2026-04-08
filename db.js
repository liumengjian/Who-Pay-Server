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
    password: { type: DataTypes.STRING(64), allowNull: false },
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
 * 仅校验数据库连接。表结构由仓库根目录下 sql/init.sql 创建与维护，
 * 部署前请在 MySQL 中执行该脚本（云托管可在控制台 SQL 窗口或导入执行）。
 */
async function init() {
  await sequelize.authenticate();
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
