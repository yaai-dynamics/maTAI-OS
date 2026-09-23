-- One ledger for three kinds of booking.
--
-- A booking was hard-wired to an experience, so a homestay could only be
-- enquired about and a place at an event could not be held at all. It now
-- carries a `kind`: an EXPERIENCE and an EVENT are priced per person on one
-- day, a STAY is priced per room per night between `date` and `endDate`.
--
-- Non-destructive. Every existing row is an experience booking, which is what
-- the default gives it; experienceId only becomes nullable, and the two new
-- date/room columns are null for them.

-- DropForeignKey
ALTER TABLE `booking` DROP FOREIGN KEY `Booking_experienceId_fkey`;

-- DropIndex
DROP INDEX `Booking_experienceId_fkey` ON `booking`;

-- AlterTable
ALTER TABLE `booking` ADD COLUMN `endDate` DATE NULL,
    ADD COLUMN `eventId` VARCHAR(191) NULL,
    ADD COLUMN `kind` ENUM('EXPERIENCE', 'STAY', 'EVENT') NOT NULL DEFAULT 'EXPERIENCE',
    ADD COLUMN `rooms` INTEGER NULL,
    MODIFY `experienceId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_experienceId_fkey` FOREIGN KEY (`experienceId`) REFERENCES `Experience`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
