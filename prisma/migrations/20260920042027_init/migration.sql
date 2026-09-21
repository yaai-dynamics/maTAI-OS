-- ENGINE=InnoDB is stated explicitly on every table.
-- WAMP ships MySQL with default_storage_engine=MyISAM, which cannot support
-- this schema: no foreign keys, no transactions, and a 1000-byte key limit
-- that the CreatorApplication unique index exceeds. Stating the engine here
-- keeps the project independent of the server default.

-- CreateTable
CREATE TABLE `District` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,

    UNIQUE INDEX `District_name_key`(`name`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Destination` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `districtId` VARCHAR(191) NOT NULL,
    `category` JSON NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `summary` TEXT NOT NULL,
    `overview` TEXT NULL,
    `ecoSensitivity` ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL,
    `capacitySignal` ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL,
    `status` ENUM('HEALTHY', 'WATCH', 'ATTENTION') NOT NULL DEFAULT 'HEALTHY',
    `typicalVisitMinutes` INTEGER NOT NULL DEFAULT 120,
    `bestSeason` VARCHAR(191) NULL,
    `accessibilityNotes` TEXT NULL,
    `palette` VARCHAR(191) NOT NULL DEFAULT 'heritage',
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `Destination_districtId_idx`(`districtId`),
    INDEX `Destination_status_idx`(`status`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attraction` (
    `id` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `Attraction_destinationId_idx`(`destinationId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerifiedFact` (
    `id` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(512) NOT NULL,
    `text` TEXT NOT NULL,
    `factType` ENUM('DOCUMENTED', 'ORAL_TRADITION', 'INTERPRETATION', 'PRACTICAL') NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `verifiedAt` DATETIME(3) NOT NULL,
    `tags` JSON NOT NULL,

    INDEX `VerifiedFact_destinationId_idx`(`destinationId`),
    INDEX `VerifiedFact_factType_idx`(`factType`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Event` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `category` ENUM('FESTIVAL', 'CULTURAL', 'SPORT', 'EXHIBITION', 'SEASONAL') NOT NULL,
    `expectedAttendance` INTEGER NULL,
    `description` TEXT NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `Event_destinationId_startAt_idx`(`destinationId`, `startAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataSource` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('GOVERNMENT', 'PARTNER', 'PLATFORM', 'PUBLIC', 'CURATED', 'MODEL') NOT NULL,
    `owner` VARCHAR(191) NOT NULL,
    `refreshFrequency` VARCHAR(191) NOT NULL,
    `reliabilityLevel` ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL,
    `description` TEXT NOT NULL,
    `url` VARCHAR(512) NULL,
    `defaultProvenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeDocument` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(512) NOT NULL,
    `documentType` ENUM('POLICY', 'REPORT', 'GUIDE', 'DESTINATION_RECORD', 'ADVISORY') NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `sourceAuthority` VARCHAR(191) NOT NULL,
    `sourceUrl` VARCHAR(512) NULL,
    `text` TEXT NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NOT NULL,
    `destinationIds` JSON NOT NULL,
    `tags` JSON NOT NULL,

    INDEX `KnowledgeDocument_documentType_idx`(`documentType`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TourismBusiness` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `businessType` ENUM('HOTEL', 'HOMESTAY', 'TOUR_OPERATOR', 'GUIDE', 'RESTAURANT', 'EXPERIENCE_PROVIDER', 'ARTISAN', 'TRANSPORT') NOT NULL,
    `districtId` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `status` ENUM('PARTICIPATING', 'INVITED', 'PENDING_VERIFICATION', 'INACTIVE') NOT NULL,
    `description` TEXT NULL,
    `contactVisibility` ENUM('PUBLIC', 'ON_ENQUIRY', 'PRIVATE') NOT NULL DEFAULT 'ON_ENQUIRY',
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `reportedCapacity` INTEGER NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `TourismBusiness_destinationId_idx`(`destinationId`),
    INDEX `TourismBusiness_status_idx`(`status`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Experience` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(512) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `durationMinutes` INTEGER NOT NULL,
    `price` INTEGER NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `availabilityStatus` ENUM('AVAILABLE', 'LIMITED', 'UNAVAILABLE') NOT NULL,
    `tags` JSON NOT NULL,
    `accessibility` ENUM('EASY', 'MODERATE', 'DEMANDING') NOT NULL DEFAULT 'MODERATE',
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `Experience_destinationId_idx`(`destinationId`),
    INDEX `Experience_category_idx`(`category`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccommodationSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `totalCapacity` INTEGER NOT NULL,
    `availableCapacity` INTEGER NOT NULL,
    `occupancyRate` DOUBLE NOT NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `AccommodationSnapshot_destinationId_date_idx`(`destinationId`, `date`),
    UNIQUE INDEX `AccommodationSnapshot_businessId_date_key`(`businessId`, `date`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Enquiry` (
    `id` VARCHAR(191) NOT NULL,
    `experienceId` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `anonymousSessionId` VARCHAR(191) NOT NULL,
    `partySize` INTEGER NOT NULL,
    `preferredDate` DATE NOT NULL,
    `note` TEXT NULL,
    `status` ENUM('SUBMITTED', 'ACKNOWLEDGED', 'CONFIRMED', 'DECLINED') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `Enquiry_businessId_createdAt_idx`(`businessId`, `createdAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Creator` (
    `id` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `homeDistrict` VARCHAR(191) NOT NULL,
    `bio` TEXT NULL,
    `categories` JSON NOT NULL,
    `languages` JSON NOT NULL,
    `platforms` JSON NOT NULL,
    `audienceSummary` TEXT NOT NULL,
    `audienceAgeBand` VARCHAR(191) NOT NULL DEFAULT '18-35',
    `audienceRegions` JSON NOT NULL,
    `creatorScore` DOUBLE NOT NULL,
    `campaignsCompleted` INTEGER NOT NULL DEFAULT 0,
    `medianItineraryAdds` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'PENDING_VERIFICATION', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `Creator_status_idx`(`status`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreatorCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `objective` TEXT NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `targetAudience` TEXT NOT NULL,
    `audienceAgeBand` VARCHAR(191) NOT NULL DEFAULT '18-35',
    `platforms` JSON NOT NULL,
    `rewardPool` INTEGER NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `contentRequirement` TEXT NOT NULL,
    `themes` JSON NOT NULL,
    `preferredLanguages` JSON NOT NULL,
    `status` ENUM('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED') NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `CreatorCampaign_destinationId_idx`(`destinationId`),
    INDEX `CreatorCampaign_status_startDate_idx`(`status`, `startDate`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreatorApplication` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `creatorId` VARCHAR(191) NOT NULL,
    `status` ENUM('INVITED', 'APPLIED', 'SHORTLISTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN') NOT NULL,
    `proposedConcept` TEXT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `CreatorApplication_creatorId_idx`(`creatorId`),
    UNIQUE INDEX `CreatorApplication_campaignId_creatorId_key`(`campaignId`, `creatorId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CampaignContent` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `creatorId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(512) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `contentUrl` VARCHAR(512) NOT NULL,
    `caption` TEXT NOT NULL,
    `disclosure` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'PUBLISHED') NOT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewNote` TEXT NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `CampaignContent_campaignId_status_idx`(`campaignId`, `status`),
    INDEX `CampaignContent_creatorId_idx`(`creatorId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CampaignMetric` (
    `id` VARCHAR(191) NOT NULL,
    `campaignContentId` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `metric` ENUM('VIEWS', 'WATCH_TIME', 'CLICKS', 'DESTINATION_PAGE_VISITS', 'ITINERARY_ADDS', 'CHECKINS', 'BOOKINGS') NOT NULL,
    `value` DOUBLE NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `CampaignMetric_campaignId_metric_idx`(`campaignId`, `metric`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payout` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `creatorId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `basis` TEXT NOT NULL,
    `status` ENUM('PENDING_REVIEW', 'APPROVED', 'PAID') NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `Payout_creatorId_idx`(`creatorId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TouristSession` (
    `id` VARCHAR(191) NOT NULL,
    `anonymousId` VARCHAR(191) NOT NULL,
    `consentLocation` BOOLEAN NOT NULL DEFAULT false,
    `consentAnalytics` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TouristSession_anonymousId_key`(`anonymousId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Trip` (
    `id` VARCHAR(191) NOT NULL,
    `touristSessionId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(512) NOT NULL,
    `theme` VARCHAR(191) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `preferencesJson` JSON NOT NULL,
    `alternativesJson` JSON NOT NULL,
    `status` ENUM('DRAFT', 'SAVED', 'ACTIVE', 'COMPLETED') NOT NULL,
    `adaptedReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `Trip_touristSessionId_idx`(`touristSessionId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ItineraryItem` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `experienceId` VARCHAR(191) NULL,
    `day` INTEGER NOT NULL,
    `sequence` INTEGER NOT NULL,
    `startTime` VARCHAR(191) NOT NULL,
    `durationMinutes` INTEGER NOT NULL,
    `travelMinutesFromPrevious` INTEGER NOT NULL DEFAULT 0,
    `rationale` TEXT NOT NULL,
    `matchedInterests` JSON NOT NULL,
    `kind` ENUM('DESTINATION', 'EXPERIENCE') NOT NULL DEFAULT 'DESTINATION',

    INDEX `ItineraryItem_destinationId_idx`(`destinationId`),
    UNIQUE INDEX `ItineraryItem_tripId_day_sequence_key`(`tripId`, `day`, `sequence`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TourismInteraction` (
    `id` VARCHAR(191) NOT NULL,
    `anonymousSessionId` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NULL,
    `experienceId` VARCHAR(191) NULL,
    `tripId` VARCHAR(191) NULL,
    `campaignId` VARCHAR(191) NULL,
    `type` ENUM('SEARCH', 'ITINERARY_ADD', 'DESTINATION_VIEW', 'NAVIGATION_START', 'QR_CHECKIN', 'BOOKING', 'REVIEW', 'FEEDBACK') NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,
    `metadata` JSON NOT NULL,

    INDEX `TourismInteraction_destinationId_timestamp_idx`(`destinationId`, `timestamp`),
    INDEX `TourismInteraction_campaignId_timestamp_idx`(`campaignId`, `timestamp`),
    INDEX `TourismInteraction_type_timestamp_idx`(`type`, `timestamp`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Feedback` (
    `id` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `experienceId` VARCHAR(191) NULL,
    `tripId` VARCHAR(191) NULL,
    `rating` INTEGER NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'English',
    `sentiment` ENUM('POSITIVE', 'NEUTRAL', 'NEGATIVE') NOT NULL,
    `anonymized` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    INDEX `Feedback_destinationId_createdAt_idx`(`destinationId`, `createdAt`),
    INDEX `Feedback_category_createdAt_idx`(`category`, `createdAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TourismMetric` (
    `id` VARCHAR(191) NOT NULL,
    `metric` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `entityType` ENUM('STATE', 'DISTRICT', 'DESTINATION', 'CAMPAIGN', 'BUSINESS') NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `value` DOUBLE NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,
    `confidence` ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL,
    `sourceCount` INTEGER NOT NULL DEFAULT 0,
    `calculationMethod` TEXT NOT NULL,
    `sourceIds` JSON NOT NULL,
    `dataSourceId` VARCHAR(191) NULL,

    INDEX `TourismMetric_entityType_entityId_idx`(`entityType`, `entityId`),
    UNIQUE INDEX `TourismMetric_metric_entityType_entityId_periodStart_periodE_key`(`metric`, `entityType`, `entityId`, `periodStart`, `periodEnd`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Alert` (
    `id` VARCHAR(191) NOT NULL,
    `entityType` ENUM('STATE', 'DISTRICT', 'DESTINATION', 'CAMPAIGN', 'BUSINESS') NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `entityName` VARCHAR(191) NOT NULL,
    `severity` ENUM('INFO', 'WATCH', 'ACTION') NOT NULL,
    `title` VARCHAR(512) NOT NULL,
    `description` TEXT NOT NULL,
    `detectedAt` DATETIME(3) NOT NULL,
    `rule` TEXT NOT NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,
    `status` ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED') NOT NULL DEFAULT 'OPEN',

    INDEX `Alert_entityType_entityId_status_idx`(`entityType`, `entityId`, `status`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnswerAudit` (
    `id` VARCHAR(191) NOT NULL,
    `question` TEXT NOT NULL,
    `intent` VARCHAR(191) NOT NULL,
    `answer` TEXT NOT NULL,
    `evidenceJson` JSON NOT NULL,
    `toolTraceJson` JSON NOT NULL,
    `confidence` ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL,
    `usesSyntheticData` BOOLEAN NOT NULL,
    `generatedBy` VARCHAR(191) NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AnswerAudit_generatedAt_idx`(`generatedAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Destination` ADD CONSTRAINT `Destination_districtId_fkey` FOREIGN KEY (`districtId`) REFERENCES `District`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attraction` ADD CONSTRAINT `Attraction_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VerifiedFact` ADD CONSTRAINT `VerifiedFact_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VerifiedFact` ADD CONSTRAINT `VerifiedFact_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `DataSource`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `DataSource`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeDocument` ADD CONSTRAINT `KnowledgeDocument_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `DataSource`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TourismBusiness` ADD CONSTRAINT `TourismBusiness_districtId_fkey` FOREIGN KEY (`districtId`) REFERENCES `District`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TourismBusiness` ADD CONSTRAINT `TourismBusiness_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Experience` ADD CONSTRAINT `Experience_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `TourismBusiness`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Experience` ADD CONSTRAINT `Experience_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccommodationSnapshot` ADD CONSTRAINT `AccommodationSnapshot_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `TourismBusiness`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccommodationSnapshot` ADD CONSTRAINT `AccommodationSnapshot_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Enquiry` ADD CONSTRAINT `Enquiry_experienceId_fkey` FOREIGN KEY (`experienceId`) REFERENCES `Experience`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Enquiry` ADD CONSTRAINT `Enquiry_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `TourismBusiness`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreatorCampaign` ADD CONSTRAINT `CreatorCampaign_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreatorApplication` ADD CONSTRAINT `CreatorApplication_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `CreatorCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreatorApplication` ADD CONSTRAINT `CreatorApplication_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `Creator`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignContent` ADD CONSTRAINT `CampaignContent_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `CreatorCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignContent` ADD CONSTRAINT `CampaignContent_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `Creator`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignMetric` ADD CONSTRAINT `CampaignMetric_campaignContentId_fkey` FOREIGN KEY (`campaignContentId`) REFERENCES `CampaignContent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignMetric` ADD CONSTRAINT `CampaignMetric_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `CreatorCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payout` ADD CONSTRAINT `Payout_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `CreatorCampaign`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payout` ADD CONSTRAINT `Payout_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `Creator`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_touristSessionId_fkey` FOREIGN KEY (`touristSessionId`) REFERENCES `TouristSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItineraryItem` ADD CONSTRAINT `ItineraryItem_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItineraryItem` ADD CONSTRAINT `ItineraryItem_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItineraryItem` ADD CONSTRAINT `ItineraryItem_experienceId_fkey` FOREIGN KEY (`experienceId`) REFERENCES `Experience`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TourismInteraction` ADD CONSTRAINT `TourismInteraction_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TourismInteraction` ADD CONSTRAINT `TourismInteraction_experienceId_fkey` FOREIGN KEY (`experienceId`) REFERENCES `Experience`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TourismInteraction` ADD CONSTRAINT `TourismInteraction_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TourismInteraction` ADD CONSTRAINT `TourismInteraction_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `CreatorCampaign`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_experienceId_fkey` FOREIGN KEY (`experienceId`) REFERENCES `Experience`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TourismMetric` ADD CONSTRAINT `TourismMetric_dataSourceId_fkey` FOREIGN KEY (`dataSourceId`) REFERENCES `DataSource`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
