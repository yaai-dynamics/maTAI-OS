/**
 * How far above the screen's bottom edge the floating tab bar ends: its
 * offset (the home-indicator safe area, at least 0.75rem) plus its height,
 * with a small gap. Fixed bars that sit above the tab bar use this.
 */
export const TAB_BAR_CLEARANCE = 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 4.5rem)';
