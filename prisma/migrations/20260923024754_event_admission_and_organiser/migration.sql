-- Events that can be booked.
--
-- An event held only a name, a time and a place, so nothing could be held at
-- one. It now carries how to get in (free, registration or ticket), what a
-- ticket costs, how many places there are, and the partner who runs it and
-- answers a request — which is what makes an EVENT booking possible.
--
-- Additive. Every existing row becomes FREE with no organiser, which is what
-- it already was in practice.

-- AlterTable
ALTER TABLE `event` ADD COLUMN `admission` ENUM('FREE', 'REGISTRATION', 'TICKETED') NOT NULL DEFAULT 'FREE',
    ADD COLUMN `capacity` INTEGER NULL,
    ADD COLUMN `datesProvisional` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `officialUrl` VARCHAR(512) NULL,
    ADD COLUMN `organiser` VARCHAR(191) NULL,
    ADD COLUMN `organiserBusinessId` VARCHAR(191) NULL,
    ADD COLUMN `ticketPrice` INTEGER NULL,
    ADD COLUMN `venue` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Event_organiserBusinessId_idx` ON `Event`(`organiserBusinessId`);

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_organiserBusinessId_fkey` FOREIGN KEY (`organiserBusinessId`) REFERENCES `TourismBusiness`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
