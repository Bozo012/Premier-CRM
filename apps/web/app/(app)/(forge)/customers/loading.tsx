/**
 * Suspense fallback for the customers route.
 *
 * Per CONVENTIONS, every list view shows a designed loading state rather
 * than a global spinner. Kept lightweight here — a plain message — but
 * structured the same as the page so the layout doesn't shift when the
 * real content streams in.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Customers
        </h1>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </header>
    </main>
  );
}
