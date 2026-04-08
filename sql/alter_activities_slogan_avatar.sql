-- 为 activities 增加宣言与头像（已有库执行）
USE `nodejs_demo`;

ALTER TABLE `activities`
  ADD COLUMN `slogan` VARCHAR(512) NOT NULL DEFAULT '' COMMENT '活动宣言' AFTER `name`,
  ADD COLUMN `avatar` LONGTEXT NULL COMMENT '活动头像：base64 或 URL' AFTER `slogan`;
