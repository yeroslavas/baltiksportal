import Link from "next/link";

export type SortDir = "asc" | "desc";

// A clickable table header that drives server-side sorting via `?sort=&dir=`.
// Clicking the active column flips direction; clicking a new one uses its
// defaultDir. Always resets to page 1 (the page param is dropped). Render it in
// place of a plain <th>.
export function SortableHeader({
  column,
  label,
  sort,
  dir,
  basePath,
  defaultDir = "asc",
  className = "px-6 py-3",
  extraParams,
}: {
  column: string;
  label: string;
  sort: string;
  dir: SortDir;
  basePath: string;
  defaultDir?: SortDir;
  className?: string;
  // Preserved across the sort link (e.g. an active status filter / search), so
  // sorting doesn't reset them. Always resets page (page is never included).
  extraParams?: Record<string, string | undefined>;
}) {
  const active = sort === column;
  const nextDir: SortDir = active ? (dir === "asc" ? "desc" : "asc") : defaultDir;
  const indicator = active ? (dir === "asc" ? "▲" : "▼") : "↕";

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(extraParams ?? {})) if (v) params.set(k, v);
  params.set("sort", column);
  params.set("dir", nextDir);

  return (
    <th className={className}>
      <Link
        href={`${basePath}?${params.toString()}`}
        className="inline-flex items-center gap-1 transition hover:text-stone-700"
      >
        <span>{label}</span>
        <span
          className={`text-[9px] ${active ? "text-stone-600" : "text-stone-300"}`}
          aria-hidden
        >
          {indicator}
        </span>
      </Link>
    </th>
  );
}
