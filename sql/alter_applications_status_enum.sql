-- 添加 cancelled 状态到 applications.status ENUM
ALTER TABLE `applications` MODIFY COLUMN `status`
  ENUM('pending', 'approved', 'rejected', 'cancelled')
  NOT NULL DEFAULT 'pending';
