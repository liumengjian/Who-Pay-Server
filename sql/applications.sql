-- applications 表：活动/团队申请记录
CREATE TABLE IF NOT EXISTS `applications` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `activityId` INT NOT NULL,
  `targetType` ENUM('activity','team') NOT NULL DEFAULT 'activity',
  `targetId` INT NULL,
  `applicantId` VARCHAR(32) NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `createTime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_applicant` (`activityId`, `applicantId`),
  KEY `idx_target` (`targetType`, `targetId`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
