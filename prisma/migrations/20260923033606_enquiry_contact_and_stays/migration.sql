-- DropForeignKey
ALTER TABLE `enquiry` DROP FOREIGN KEY `Enquiry_experienceId_fkey`;

-- DropIndex
DROP INDEX `Enquiry_experienceId_fkey` ON `enquiry`;

-- AlterTable
ALTER TABLE `enquiry` ADD COLUMN `contactName` VARCHAR(120) NULL,
    ADD COLUMN `contactPhone` VARCHAR(20) NULL,
    ADD COLUMN `message` TEXT NULL,
    MODIFY `experienceId` VARCHAR(191) NULL,
    MODIFY `partySize` INTEGER NULL,
    MODIFY `preferredDate` DATE NULL;

-- AddForeignKey
ALTER TABLE `Enquiry` ADD CONSTRAINT `Enquiry_experienceId_fkey` FOREIGN KEY (`experienceId`) REFERENCES `Experience`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
