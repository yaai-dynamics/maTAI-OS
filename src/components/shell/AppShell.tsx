import type { ComponentProps } from 'react';

import { DEMO_MODE } from '@/lib/config';
import { ShellFrame } from './ShellFrame';

/**
 * Server entry to the shared frame. It exists only to read DEMO_MODE, which is
 * server configuration and never reaches the browser bundle on its own.
 */
export function AppShell(props: Omit<ComponentProps<typeof ShellFrame>, 'demo'>) {
  return <ShellFrame demo={DEMO_MODE} {...props} />;
}
