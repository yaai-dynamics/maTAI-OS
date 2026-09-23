-- ENGINE=InnoDB is stated explicitly on every table.
-- The schema needs foreign keys and transactions, which MyISAM does not
-- support. Stating the engine keeps this project independent of the
-- server default. Applied by scripts/enforce-innodb.mjs.

-- CreateTable
CREATE TABLE `LandingPage` (
    `id` VARCHAR(191) NOT NULL,
    `ownerType` ENUM('BUSINESS', 'CAMPAIGN') NOT NULL,
    `businessId` VARCHAR(191) NULL,
    `campaignId` VARCHAR(191) NULL,
    `eventId` VARCHAR(191) NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `tagline` TEXT NOT NULL,
    `heroImageUrl` LONGTEXT NULL,
    `contentJson` JSON NOT NULL,
    `bookingUrl` VARCHAR(512) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `shareCount` INTEGER NOT NULL DEFAULT 0,
    `generatedBy` VARCHAR(191) NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    UNIQUE INDEX `LandingPage_slug_key`(`slug`),
    INDEX `LandingPage_ownerType_status_idx`(`ownerType`, `status`),
    INDEX `LandingPage_businessId_idx`(`businessId`),
    INDEX `LandingPage_campaignId_idx`(`campaignId`),
    INDEX `LandingPage_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LandingPage` ADD CONSTRAINT `LandingPage_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `TourismBusiness`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LandingPage` ADD CONSTRAINT `LandingPage_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `CreatorCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LandingPage` ADD CONSTRAINT `LandingPage_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
