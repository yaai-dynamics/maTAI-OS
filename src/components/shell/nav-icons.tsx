import {
  Activity,
  BadgeCheck,
  BedDouble,
  CalendarCheck,
  ChartColumn,
  Compass,
  Database,
  FileText,
  HeartHandshake,
  History,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Map as MapIcon,
  MapPin,
  Megaphone,
  Navigation,
  Route,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  TriangleAlert,
  Upload,
  UserCog,
  UserPlus,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icons and colours for navigation.
 *
 * Layouts are server components and name an icon by string, because a
 * component cannot cross into the client frame as a prop; the frame looks the
 * name up here.
 */
export const NAV_ICONS = {
  Activity,
  BadgeCheck,
  BedDouble,
  CalendarCheck,
  ChartColumn,
  Compass,
  Database,
  FileText,
  HeartHandshake,
  History,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Map: MapIcon,
  MapPin,
  Megaphone,
  Navigation,
  Route,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  TriangleAlert,
  Upload,
  UserCog,
  UserPlus,
  WandSparkles,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

/** A tinted tile when idle, the solid colour when the section is current. */
export const NAV_TONES = {
  brand: { idle: 'bg-brand-100 text-brand-700', active: 'bg-brand-700 text-white' },
  lake: { idle: 'bg-lake-100 text-lake-700', active: 'bg-lake-600 text-white' },
  lily: { idle: 'bg-lily-100 text-lily-600', active: 'bg-lily-500 text-white' },
  info: { idle: 'bg-info-100 text-info-700', active: 'bg-info-500 text-white' },
  good: { idle: 'bg-good-100 text-good-700', active: 'bg-good-500 text-white' },
  warn: { idle: 'bg-warn-100 text-warn-700', active: 'bg-warn-500 text-white' },
  risk: { idle: 'bg-risk-100 text-risk-700', active: 'bg-risk-500 text-white' },
} as const;

export type NavTone = keyof typeof NAV_TONES;
