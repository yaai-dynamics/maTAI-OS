-- ENGINE=InnoDB is stated explicitly on every table.
-- The schema needs foreign keys and transactions, which MyISAM does not
-- support. Stating the engine keeps this project independent of the
-- server default. Applied by scripts/enforce-innodb.mjs.

-- AlterTable
ALTER TABLE `TourismInteraction` MODIFY `type` ENUM('SEARCH', 'ITINERARY_ADD', 'DESTINATION_VIEW', 'NAVIGATION_START', 'QR_CHECKIN', 'BOOKING', 'REVIEW', 'FEEDBACK', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED') NOT NULL;

-- CreateTable
CREATE TABLE `Booking` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(16) NOT NULL,
    `experienceId` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NULL,
    `anonymousSessionId` VARCHAR(191) NOT NULL,
    `ownerHash` CHAR(64) NOT NULL,
    `accessKeyHash` CHAR(64) NOT NULL,
    `guestName` VARCHAR(120) NOT NULL,
    `guestPhone` VARCHAR(20) NOT NULL,
    `guestEmail` VARCHAR(191) NULL,
    `partySize` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `note` TEXT NULL,
    `unitPricePaise` INTEGER NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `status` ENUM('REQUESTED', 'AWAITING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELLED_BY_GUEST', 'CANCELLED_BY_HOST') NOT NULL,
    `hostMessage` TEXT NULL,
    `paymentDueAt` DATETIME(3) NULL,
    `cancellationReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `respondedAt` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `provenance` ENUM('OFFICIAL', 'PARTNER_REPORTED', 'PLATFORM_OBSERVED', 'PUBLIC_EXTERNAL', 'DEMO_SYNTHETIC', 'ESTIMATED', 'FORECAST') NOT NULL,

    UNIQUE INDEX `Booking_reference_key`(`reference`),
    INDEX `Booking_businessId_status_idx`(`businessId`, `status`),
    INDEX `Booking_ownerHash_idx`(`ownerHash`),
    INDEX `Booking_destinationId_status_idx`(`destinationId`, `status`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(16) NOT NULL,
    `providerOrderId` VARCHAR(64) NOT NULL,
    `providerPaymentId` VARCHAR(64) NULL,
    `amountPaise` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `status` ENUM('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED') NOT NULL,
    `method` VARCHAR(32) NULL,
    `failureReason` TEXT NULL,
    `refundedPaise` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL,
    `capturedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Payment_providerOrderId_key`(`providerOrderId`),
    UNIQUE INDEX `Payment_providerPaymentId_key`(`providerPaymentId`),
    INDEX `Payment_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Refund` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `providerRefundId` VARCHAR(64) NOT NULL,
    `amountPaise` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'PROCESSED', 'FAILED') NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Refund_providerRefundId_key`(`providerRefundId`),
    INDEX `Refund_paymentId_idx`(`paymentId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentWebhookEvent` (
    `id` VARCHAR(64) NOT NULL,
    `event` VARCHAR(64) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_experienceId_fkey` FOREIGN KEY (`experienceId`) REFERENCES `Experience`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `TourismBusiness`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Refund` ADD CONSTRAINT `Refund_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
