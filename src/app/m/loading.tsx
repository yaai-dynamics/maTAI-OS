/** Skeleton while a mobile screen loads on the server. */
export default function MobileLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="shimmer h-8 w-1/2 rounded-xl" />
      <div className="shimmer h-44 rounded-3xl" />
      <div className="shimmer h-20 rounded-2xl" />
      <div className="shimmer h-20 rounded-2xl" />
    </div>
  );
}
