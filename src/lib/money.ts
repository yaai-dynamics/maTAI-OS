/** "₹12,500", grouped the Indian way. */
export const formatRupees = (value: number): string => `₹${Math.round(value).toLocaleString('en-IN')}`;
