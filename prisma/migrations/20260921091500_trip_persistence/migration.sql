-- Trips are now written to the database (they were in memory only).
-- The table has never held a row, so the NOT NULL column needs no default.

-- AlterTable
ALTER TABLE `Trip` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- CreateIndex
CREATE INDEX `Trip_touristSessionId_updatedAt_idx` ON `Trip`(`touristSessionId`, `updatedAt`);
