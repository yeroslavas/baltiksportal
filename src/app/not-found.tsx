import Link from "next/link";

// Friendly 404 for unknown routes, in place of the bare default.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <div className="rounded-2xl border border-stone-200 bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Page not found
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
