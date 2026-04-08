-- Who-Pay 后端 MySQL 表结构（与 Sequelize 模型一致）
-- 在云托管 MySQL、本地或 phpMyAdmin 中执行本文件即可。
-- 字符集使用 utf8mb4 以支持昵称等中文与 emoji。

CREATE DATABASE IF NOT EXISTS `nodejs_demo`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `nodejs_demo`;

-- ---------------------------------------------------------------------------
-- 模板演示：计数器
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `counters` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `count` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 用户
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(64) NOT NULL,
  `password` VARCHAR(255) NOT NULL COMMENT '登录密码（明文存储，生产环境请改为哈希）',
  `nickName` VARCHAR(128) NOT NULL DEFAULT '',
  `realName` VARCHAR(128) NOT NULL DEFAULT '',
  `avatar` LONGTEXT NULL COMMENT '可为 base64 或 URL 字符串',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_username_unique` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 登录令牌（Bearer token）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `auth_tokens` (
  `token` VARCHAR(128) NOT NULL,
  `userId` INT NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `auth_tokens_user_id` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 活动
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activities` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(128) NOT NULL,
  `slogan` VARCHAR(512) NOT NULL DEFAULT '' COMMENT '活动宣言',
  `avatar` LONGTEXT NULL COMMENT '活动头像：base64 或 URL',
  `inviteCode` VARCHAR(16) NOT NULL,
  `creatorId` VARCHAR(32) NOT NULL COMMENT '用户 id 字符串，或 admin',
  `status` ENUM('active', 'ended') NOT NULL DEFAULT 'active',
  `endTime` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `activities_invite_code_unique` (`inviteCode`),
  KEY `activities_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 团队（邀请码全局唯一，创建者可解散）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `teams` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `activityId` INT NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `inviteCode` VARCHAR(16) NOT NULL,
  `creatorId` VARCHAR(32) NOT NULL COMMENT '用户 id 字符串',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `teams_invite_code_unique` (`inviteCode`),
  KEY `teams_activity_id` (`activityId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 团队成员（复合主键）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `team_members` (
  `teamId` INT NOT NULL,
  `userId` VARCHAR(32) NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`teamId`, `userId`),
  KEY `team_members_user_id` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 活动参与者（已通过创建/邀请加入，未必已选团队）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_participants` (
  `activityId` INT NOT NULL,
  `userId` VARCHAR(32) NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`activityId`, `userId`),
  KEY `activity_participants_user_id` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 支付记录（业务自定义时间字段 createTime，无 Sequelize 的 createdAt）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `activityId` INT NOT NULL,
  `teamId` INT NOT NULL,
  `userId` VARCHAR(32) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `remark` VARCHAR(512) NOT NULL DEFAULT '',
  `createTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `payments_activity_id` (`activityId`),
  KEY `payments_team_id` (`teamId`),
  KEY `payments_activity_user` (`activityId`, `userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
