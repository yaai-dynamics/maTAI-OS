-- What an artisan or shop sells.
--
-- TourismBusiness.productsJson holds a plain string array (lib/types
-- tourismBusinessSchema's `products`), the same JSON-column convention as
-- rateJson. Nullable and additive: every existing business reads as having
-- none, same as before this column existed.
--
-- Non-destructive.

-- AlterTable
ALTER TABLE `tourismbusiness` ADD COLUMN `productsJson` JSON NULL;
