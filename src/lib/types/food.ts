import { z } from 'zod';
import { provenanceSchema } from '@/lib/types/core';

/**
 * PS6: Taste of Manipur. A dish is a piece of food knowledge — what it is,
 * what goes into it, where it comes from — independent of whether anyone
 * sells it. A food trail strings dishes together into an order worth
 * following; it is a reading list, not a booking.
 */

export const dishCategorySchema = z.enum(['MAIN', 'SNACK', 'DESSERT', 'CONDIMENT']);
export type DishCategory = z.infer<typeof dishCategorySchema>;

export const DISH_CATEGORY_LABEL: Record<DishCategory, string> = {
  MAIN: 'Main',
  SNACK: 'Snack',
  DESSERT: 'Dessert',
  CONDIMENT: 'Condiment',
};

export const spiceLevelSchema = z.enum(['MILD', 'MEDIUM', 'HOT']);
export type SpiceLevel = z.infer<typeof spiceLevelSchema>;

export const dishSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Name as it is actually asked for, alongside the English gloss. */
  localName: z.string().optional(),
  destinationId: z.string(),
  /**
   * A partner who serves it, if one does. Left unset for a dish that is real
   * and worth knowing about even though no one on the platform serves it yet
   * — that is an honest gap, not an error.
   */
  businessId: z.string().optional(),
  category: dishCategorySchema,
  description: z.string(),
  ingredients: z.array(z.string()).min(1),
  vegetarian: z.boolean(),
  spiceLevel: spiceLevelSchema.optional(),
  /** When or why it is eaten, where that adds something the description doesn't. */
  story: z.string().optional(),
  sourceId: z.string(),
  provenance: provenanceSchema,
});
export type Dish = z.infer<typeof dishSchema>;

export const foodTrailSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Where the trail starts, or the single place it stays within. */
  destinationId: z.string(),
  description: z.string(),
  /** Ordered stops. A dish's own destination decides where each stop happens. */
  dishIds: z.array(z.string()).min(2),
  /** Plain-language sense of the commitment, in the curator's words. */
  durationHint: z.string(),
  bestTimeOfDay: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'ANY']).default('ANY'),
  sourceId: z.string(),
  provenance: provenanceSchema,
});
export type FoodTrail = z.infer<typeof foodTrailSchema>;
