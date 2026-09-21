-- ENGINE=InnoDB is stated explicitly on every table.
-- The schema needs foreign keys and transactions, which MyISAM does not
-- support. Stating the engine keeps this project independent of the
-- server default. Applied by scripts/enforce-innodb.mjs.

-- AlterTable
ALTER TABLE `TourismInteraction` ADD COLUMN `clientEventId` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `TouristSession` ADD COLUMN `analyticsChoiceAt` DATETIME(3) NULL,
    ADD COLUMN `lastSeenAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `TelemetryCounter` (
    `day` DATE NOT NULL,
    `outcome` VARCHAR(40) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`day`, `outcome`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `TourismInteraction_clientEventId_key` ON `TourismInteraction`(`clientEventId`);

