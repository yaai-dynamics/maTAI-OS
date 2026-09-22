import { redirect } from 'next/navigation';

// Destinations and Experiences merged into one screen (docs/09 §26): this
// index redirects there, preserving whatever this link already pointed at
// (a category, an enquiry or a booking request).
export default async function ExperiencesRedirect(props: {
  searchParams: Promise<{ category?: string; experience?: string; book?: string }>;
}) {
  const { category, experience, book } = await props.searchParams;
  const params = new URLSearchParams({ mode: 'experiences' });
  if (category) params.set('category', category);
  if (experience) params.set('experience', experience);
  if (book) params.set('book', book);
  redirect(`/explore/discover?${params.toString()}`);
}
