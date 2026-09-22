-- The complete planner: an optional travel window chosen by the visitor, plan
-- options to choose between, trips that can be started, and the stays,
-- transport and guides a plan includes.

-- AlterTable
ALTER TABLE `Trip` MODIFY `startDate` DATE NULL,
    MODIFY `endDate` DATE NULL,
    ADD COLUMN `arriveTime` VARCHAR(5) NULL,
    ADD COLUMN `departTime` VARCHAR(5) NULL,
    ADD COLUMN `logisticsJson` JSON NULL,
    ADD COLUMN `optionGroupId` VARCHAR(64) NULL,
    ADD COLUMN `optionLabel` VARCHAR(64) NULL,
    ADD COLUMN `startedAt` DATETIME(3) NULL;

-- Dates on existing trips were never chosen: they were set to the day after
-- planning. Clear them, so no trip claims travel dates the visitor did not give.
UPDATE `Trip` SET `startDate` = NULL, `endDate` = NULL;

-- AlterTable
ALTER TABLE `TourismBusiness` ADD COLUMN `rateJson` JSON NULL;

-- CreateIndex
CREATE INDEX `Trip_touristSessionId_optionGroupId_idx` ON `Trip`(`touristSessionId`, `optionGroupId`);
