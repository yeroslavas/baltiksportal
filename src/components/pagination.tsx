import Link from "next/link";

// Shared page size for the order lists. Querying a single page (via .range)
// also keeps each request well under Supabase's project "Max rows" cap.
export const DEFAULT_PAGE_SIZE = 20;

// Server-rendered prev/next pager driven by a `?page=` query param. Renders
// nothing when there's only one page. `basePath` is the route the links point at
// (e.g. "/orders" or "/admin/orders").
export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const linkClass =
    "rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100";
  const disabledClass =
    "rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-300";

  return (
    <nav className="mt-6 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={`${basePath}?page=${page - 1}`} className={linkClass}>
          ← Previous
        </Link>
      ) : (
        <span className={disabledClass}>← Previous</span>
      )}
      <span className="text-sm text-stone-500">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={`${basePath}?page=${page + 1}`} className={linkClass}>
          Next →
        </Link>
      ) : (
        <span className={disabledClass}>Next →</span>
      )}
    </nav>
  );
}
