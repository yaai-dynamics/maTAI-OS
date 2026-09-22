import { redirect } from 'next/navigation';

// Destinations and Experiences merged into one screen (docs/09 §26): this
// index redirects there, preserving a category filter already in the link.
export default async function DestinationsRedirect(props: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await props.searchParams;
  redirect(category ? `/explore/discover?category=${category}` : '/explore/discover');
}
