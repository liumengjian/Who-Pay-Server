-- 已有库从 MD5 改为明文密码：扩大 password 字段长度（请在业务低峰执行）
USE `nodejs_demo`;

ALTER TABLE `users`
  MODIFY COLUMN `password` VARCHAR(255) NOT NULL COMMENT '登录密码（明文存储，生产环境请改为哈希）';
