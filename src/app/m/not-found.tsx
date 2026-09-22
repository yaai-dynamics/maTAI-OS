import { Compass } from 'lucide-react';

import { MobileEmpty, MobileHeader, PrimaryLink } from '@/components/mobile/ui';

export default function MobileNotFound() {
  return (
    <div>
      <MobileHeader title="Not found" backHref="/m" />
      <MobileEmpty
        icon={<Compass aria-hidden size={24} />}
        title="We could not find that"
        description="The place or page may have moved. Start again from Discover."
        action={<PrimaryLink href="/m/discover">Discover Manipur</PrimaryLink>}
      />
    </div>
  );
}
