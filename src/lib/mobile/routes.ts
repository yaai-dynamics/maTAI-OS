/**
 * The mobile tourist app lives under /m and reuses shared components that
 * link to the desktop /explore pages. mobileHref maps those links to their
 * mobile equivalent, so a visitor inside /m stays inside /m.
 *
 * Returns undefined for anything that is not an /explore link, and for
 * /explore pages with no mobile counterpart (those open as they are).
 */
export function mobileHref(href: string): string | undefined {
  let url: URL;
  try {
    url = new URL(href, 'http://m.local');
  } catch {
    return undefined;
  }
  // Only site-relative links: an absolute URL elsewhere is left alone.
  if (url.origin !== 'http://m.local') return undefined;

  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/explore' && !path.startsWith('/explore/')) return undefined;

  const query = url.searchParams;
  const keep = (target: string, params: URLSearchParams = query) => {
    const text = params.toString();
    return text ? `${target}?${text}` : target;
  };
  const segments = path.split('/').filter(Boolean).slice(1);
  const [section, id, sub] = segments;

  switch (section) {
    case undefined:
      return keep('/m/plan');
    case 'journey':
      return id ? keep(`/m/journey/${id}`) : '/m/plan';
    case 'destinations':
      if (!id) return '/m/discover';
      return sub === 'heritage' ? `/m/place/${id}/heritage` : `/m/place/${id}`;
    case 'experiences':
      return '/m/discover?mode=experiences';
    case 'discover': {
      const book = query.get('book');
      if (book) return `/m/experience/${book}/book`;
      const experience = query.get('experience');
      if (experience) return `/m/experience/${experience}`;
      const params = new URLSearchParams();
      for (const key of ['mode', 'category', 'destination', 'view']) {
        const value = query.get(key);
        if (value) params.set(key, value);
      }
      return keep('/m/discover', params);
    }
    case 'trip':
      return keep('/m/trip');
    case 'bookings':
      return id ? keep(`/m/bookings/${id}`) : '/m/bookings';
    case 'privacy':
      return '/m/privacy';
    default:
      return undefined;
  }
}
