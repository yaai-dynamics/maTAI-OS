import type { Metadata } from 'next';

import phrasebook from '@data/phrasebook.json';
import type { PhraseGroup } from '@/lib/types';
import { Interpreter } from '@/components/mobile/Interpreter';
import { MobileHeader } from '@/components/mobile/ui';

export const metadata: Metadata = { title: 'Interpreter' };
export const dynamic = 'force-dynamic';

/**
 * The interpreter: a visitor speaking English or Hindi and a local speaking
 * Manipuri, through the platform's own speech models.
 *
 * The models are the reason this belongs in the product rather than being a
 * link to a general translation app: Meiteilon is not served well by those,
 * and the whole point of the platform is that a visitor and a local host can
 * actually deal with each other.
 */
export default function MobileTalkPage() {
  const groups = (phrasebook as { groups: PhraseGroup[] }).groups;

  return (
    <div>
      <MobileHeader title="Interpreter" subtitle="English or Hindi ⇄ Manipuri" backHref="/m" />
      <Interpreter groups={groups} />
    </div>
  );
}
