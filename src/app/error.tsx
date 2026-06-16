"use client";

import { useEffect } from "react";
import Link from "next/link";

// Route-level error boundary for the whole app: any unhandled error in a page or
// its data fetching renders this friendly fallback (with a retry) instead of the
// browser's raw "page couldn't load". Must be a Client Component.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it in logs (and Vercel) for debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <div className="rounded-2xl border border-stone-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Something went wrong
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
          Sorry — that page didn&apos;t load. This is usually temporary. Try
          again, or head back and retry.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
