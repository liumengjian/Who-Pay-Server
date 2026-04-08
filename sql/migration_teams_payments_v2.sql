-- 从旧版结构升级：团队增加邀请码/创建者；支付增加 teamId
-- 在已存在 nodejs_demo 库的实例上执行（执行前请备份）。

USE `nodejs_demo`;

-- 团队：邀请码、创建者
ALTER TABLE `teams`
  ADD COLUMN `inviteCode` VARCHAR(16) NULL AFTER `name`,
  ADD COLUMN `creatorId` VARCHAR(32) NOT NULL DEFAULT '' AFTER `inviteCode`;

-- 确定性唯一邀请码（Z + 5 位数字，适配 id < 1,000,000；更大 id 请单独处理）
UPDATE `teams`
SET `inviteCode` = CONCAT('Z', LPAD(`id`, 5, '0'))
WHERE `inviteCode` IS NULL OR `inviteCode` = '';

-- 将创建者标为该团队首位成员（按 userId 字典序最小，与其它接口约定一致）
UPDATE `teams` t
INNER JOIN (
  SELECT `teamId`, MIN(`userId`) AS `firstUser`
  FROM `team_members`
  GROUP BY `teamId`
) m ON m.`teamId` = t.`id`
SET t.`creatorId` = m.`firstUser`
WHERE t.`creatorId` = '' OR t.`creatorId` IS NULL;

UPDATE `teams` SET `creatorId` = '0' WHERE `creatorId` = '' OR `creatorId` IS NULL;

ALTER TABLE `teams`
  MODIFY `inviteCode` VARCHAR(16) NOT NULL,
  ADD UNIQUE KEY `teams_invite_code_unique` (`inviteCode`);

-- 支付：团队维度
ALTER TABLE `payments`
  ADD COLUMN `teamId` INT NULL AFTER `activityId`;

UPDATE `payments` p
INNER JOIN `team_members` tm ON tm.`userId` = p.`userId`
INNER JOIN `teams` te ON te.`id` = tm.`teamId` AND te.`activityId` = p.`activityId`
SET p.`teamId` = te.`id`
WHERE p.`teamId` IS NULL;

UPDATE `payments` p
INNER JOIN (
  SELECT `activityId`, MIN(`id`) AS `tid` FROM `teams` GROUP BY `activityId`
) x ON x.`activityId` = p.`activityId`
SET p.`teamId` = x.`tid`
WHERE p.`teamId` IS NULL;

UPDATE `payments` SET `teamId` = 0 WHERE `teamId` IS NULL;

ALTER TABLE `payments`
  MODIFY `teamId` INT NOT NULL,
  ADD KEY `payments_team_id` (`teamId`);
