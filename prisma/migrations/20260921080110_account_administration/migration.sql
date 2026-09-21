-- ENGINE=InnoDB is stated explicitly on every table.
-- The schema needs foreign keys and transactions, which MyISAM does not
-- support. Stating the engine keeps this project independent of the
-- server default. Applied by scripts/enforce-innodb.mjs.

-- AlterTable
ALTER TABLE `UserAccount` ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `passwordChangedAt` DATETIME(3) NULL,
    ADD COLUMN `passwordExpiresAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `AccountAuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `action` ENUM('ISSUED', 'ROLE_CHANGED', 'DISABLED', 'ENABLED', 'UNLOCKED', 'PASSWORD_RESET', 'PASSWORD_CHANGED') NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorEmail` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `targetEmail` VARCHAR(191) NOT NULL,
    `detail` TEXT NULL,
    `at` DATETIME(3) NOT NULL,

    INDEX `AccountAuditEvent_targetId_at_idx`(`targetId`, `at`),
    INDEX `AccountAuditEvent_at_idx`(`at`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

